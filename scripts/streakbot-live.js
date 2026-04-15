/**
 * scripts/streakbot-live.js
 *
 * StreakBet Escrow — Live Real-Money Simulation Script
 * =====================================================
 * Runs two-phase "penny" competition tests on Optimism mainnet (or any live
 * EVM network) with real ETH stakes and real competition durations of 1–2 days.
 *
 *   Phase 0 — estimate: Derives wallet addresses, estimates gas for every
 *                       transaction, fetches live gas price, prints a full cost
 *                       table (ETH + USD), and tells you exactly how much ETH
 *                       to put in the owner wallet BEFORE spending anything.
 *                       No transactions are sent.
 *
 *   Phase 1 — setup:   Deploy contract, create three competitions, all wallets
 *                      join and submit their day-1 reports.  State is saved to
 *                      streakbot-live-state.json so the process can exit.
 *
 *   Phase 2 — settle:  Load saved state, wait for endTime (polling every 5 min),
 *                      then settle each competition and verify payouts.
 *
 * Three concurrent short-streak scenarios run at the same time:
 *   Comp A — "All complete"   : Alice, Bob, Carol all report → equal 3-way split
 *   Comp B — "One forfeits"   : Alice wins; Bob voluntarily forfeits before endTime
 *   Comp C — "Nobody reports" : all auto-forfeited at settle; ETH stays in contract
 *
 * Prerequisites
 * -------------
 *   1. Add to your .env:
 *        HD_MNEMONIC="word1 word2 ... word12"   <- BIP39 mnemonic (12, 15, 18, 21, or 24 words)
 *        OPTIMISM_MAINNET_RPC_URL=https://mainnet.optimism.io
 *        AAVE_POOL_ADDRESS=0x794a...814aD        <- optional, for yield
 *        ETH_PRICE_USD=3000                      <- optional, for USD estimates
 *
 *   2. Run the estimate phase first to see exact funding requirements:
 *        SIM_PHASE=estimate npx hardhat run scripts/streakbot-live.js --network optimism
 *
 *   3. Fund the FIRST derived wallet (index 0 -- the deployer/admin) with the
 *      amount printed by the estimate phase.  All test wallets are auto-funded
 *      by the owner during setup.
 *
 * Usage
 * -----
 *   # Phase 0 -- gas estimate + wallet funding guide (NO transactions sent)
 *   SIM_PHASE=estimate npx hardhat run scripts/streakbot-live.js --network optimism
 *
 *   # Phase 1 -- create competitions, join, submit day-1 reports
 *   SIM_PHASE=setup npx hardhat run scripts/streakbot-live.js --network optimism
 *
 *   # Phase 2 -- settle after endTime (run again 1-2 days later)
 *   SIM_PHASE=settle npx hardhat run scripts/streakbot-live.js --network optimism
 *
 *   # Shorter duration for quick testing (override hours via env var):
 *   COMP_DURATION_HOURS=2 SIM_PHASE=estimate npx hardhat run scripts/streakbot-live.js --network optimism
 *   COMP_DURATION_HOURS=2 SIM_PHASE=setup    npx hardhat run scripts/streakbot-live.js --network optimism
 *
 * State file
 * ----------
 *   streakbot-live-state.json is written after setup and read during settle.
 *   It is listed in .gitignore -- never commit it.
 *
 * WARNING: Only setup and settle spend REAL ETH.  The estimate phase is read-only.
 *          Double-check your .env and run estimate before running setup.
 */

"use strict";

const { ethers } = require("hardhat");
const fs          = require("fs");
const path        = require("path");

// ── Config ────────────────────────────────────────────────────────────────────

/** Per-entrant ETH stake. ~$0.0003 at $3 ETH -- genuine pennies. */
const STAKE_WEI = ethers.parseEther(process.env.STAKE_ETH || "0.0001");

/** Competition duration in seconds (default: 24 hours). */
const COMP_DURATION_S = Number(process.env.COMP_DURATION_HOURS || "24") * 3600;

/** Join window in seconds (default: same as duration so anyone can join anytime). */
const JOIN_WINDOW_S = Number(process.env.JOIN_WINDOW_HOURS || process.env.COMP_DURATION_HOURS || "24") * 3600;

/** Aave V3 Pool on Optimism mainnet (optional -- set to ZeroAddress to skip yield). */
const AAVE_POOL_ADDRESS = process.env.AAVE_POOL_ADDRESS || ethers.ZeroAddress;

/** Delay between consecutive transactions (ms). */
const TX_PAUSE_MS = 3000;

/** ETH/USD price for cost estimates (rough; display only). */
const ETH_PRICE_USD = Number(process.env.ETH_PRICE_USD || "3000");

/** Path to the state file persisted between setup and settle phases. */
const STATE_FILE = path.join(__dirname, "..", "streakbot-live-state.json");

/** How long after competitions open we wait before joining (start is 60s in future). */
const START_BUFFER_MS = 65_000; // 65 seconds (start is set 60s in the future + 5s margin)

/**
 * Safety buffer multiplier for the owner wallet funding recommendation.
 * 120n = +20% over the calculated minimum (expressed as a percentage BigInt
 * so it can be used directly with BigInt arithmetic: total * FUNDING_BUFFER_PCT / 100n).
 */
const FUNDING_BUFFER_PCT = 120n;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Current local time as HH:MM:SS -- prepended to every log line. */
function ts() {
  return new Date().toTimeString().slice(0, 8);
}

/** Format wei as human-readable ETH. */
function fmt(wei) {
  return `${ethers.formatEther(wei)} ETH`;
}

/** Format wei as approximate USD at ETH_PRICE_USD. */
function fmtUsd(wei) {
  const eth = Number(ethers.formatEther(wei));
  const usd = eth * ETH_PRICE_USD;
  return `~$${usd.toFixed(4)}`;
}

function section(title) {
  console.log(`\n${"═".repeat(66)}`);
  console.log(`  [${ts()}]  ${title}`);
  console.log("═".repeat(66));
}

function step(msg) {
  console.log(`  [${ts()}] ▶ ${msg}`);
}

function ok(msg) {
  console.log(`  [${ts()}] ✅ ${msg}`);
}

function warn(msg) {
  console.log(`  [${ts()}] ⚠️  ${msg}`);
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/** Optimism explorer tx link. */
function explorerTx(hash, chainId) {
  if (chainId === 10n)       return `https://optimistic.etherscan.io/tx/${hash}`;
  if (chainId === 11155420n) return `https://sepolia-optimism.etherscan.io/tx/${hash}`;
  return `tx: ${hash}`;
}

/** Optimism explorer address link. */
function explorerAddr(addr, chainId) {
  if (chainId === 10n)       return `https://optimistic.etherscan.io/address/${addr}`;
  if (chainId === 11155420n) return `https://sepolia-optimism.etherscan.io/address/${addr}`;
  return addr;
}

async function logBalance(label, addr) {
  const bal = await ethers.provider.getBalance(addr);
  console.log(`    ${label.padEnd(12)} ${addr} : ${fmt(bal)} ${fmtUsd(bal)}`);
}

async function logBalances(wallets) {
  console.log(`  [${ts()}] 📊 Balances:`);
  for (const [name, signer] of Object.entries(wallets)) {
    await logBalance(name, signer.address);
  }
}

/** Fund recipient from funder if balance is below minBalance. */
async function ensureFunded(funder, recipient, amount, minBalance, chainId) {
  const bal = await ethers.provider.getBalance(recipient.address);
  if (bal < minBalance) {
    step(`Topping up ${recipient.address} with ${fmt(amount)} ${fmtUsd(amount)}`);
    const tx      = await funder.sendTransaction({ to: recipient.address, value: amount });
    const receipt = await tx.wait();
    step(`  funded -- ${explorerTx(receipt.hash, chainId)}`);
    await sleep(TX_PAUSE_MS);
  }
}

/** Poll until block.timestamp >= targetTimestamp, logging progress every 5 min. */
async function waitUntilTimestamp(targetTimestamp, label) {
  const eta = new Date(targetTimestamp * 1000).toLocaleString();
  step(`Waiting for ${label} -- ${eta}`);
  const POLL_MS = 5 * 60 * 1000;
  while (true) {
    const block     = await ethers.provider.getBlock("latest");
    const remaining = targetTimestamp - block.timestamp;
    if (remaining <= 0) {
      ok(`${label} reached -- proceeding.`);
      break;
    }
    const hours   = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const etaTime = new Date(Date.now() + remaining * 1000).toLocaleTimeString();
    console.log(`    [${ts()}] ⏳ ${hours}h ${minutes}m remaining (ETA ${etaTime}) -- next check in 5 min...`);
    await sleep(POLL_MS);
  }
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(
      `State file not found: ${STATE_FILE}\n` +
      "Run 'SIM_PHASE=setup ...' first to create competitions."
    );
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  step(`State saved -> ${STATE_FILE}`);
}

// ── Deploy ────────────────────────────────────────────────────────────────────

async function deployEscrow(owner, chainId) {
  step("Deploying StreakBetEscrow...");
  const Factory = await ethers.getContractFactory("StreakBetEscrow", owner);
  const escrow  = await Factory.deploy(owner.address, AAVE_POOL_ADDRESS);
  await escrow.waitForDeployment();
  const addr = await escrow.getAddress();
  ok(`StreakBetEscrow deployed -> ${addr}`);
  step(`  explorer: ${explorerAddr(addr, chainId)}`);
  return escrow;
}

async function connectEscrow(addr, signer) {
  const factory = await ethers.getContractFactory("StreakBetEscrow", signer);
  return factory.attach(addr);
}

// ── Phase 0 — Estimate ────────────────────────────────────────────────────────

async function runEstimate(wallets, chainId) {
  const { owner, alice, bob, carol } = wallets;

  section("Phase 0 -- Estimate: Gas costs & funding guide  (NO transactions sent)");

  // Live gas price.
  const feeData  = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || ethers.parseUnits("0.001", "gwei");
  step(`Live gas price  : ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  step(`ETH price (USD) : $${ETH_PRICE_USD}  (set ETH_PRICE_USD= to override)`);

  // Deploy gas estimate.
  let deployGas;
  try {
    const Factory    = await ethers.getContractFactory("StreakBetEscrow", owner);
    const deployTx = Factory.getDeployTransaction(owner.address, AAVE_POOL_ADDRESS);
    deployGas      = await ethers.provider.estimateGas({ data: deployTx.data, from: owner.address });
  } catch {
    deployGas = 2_500_000n;
    warn("Could not estimate deploy gas on this network -- using 2.5M gas fallback.");
  }

  // Per-function gas estimates via known-good fallbacks (estimateGas to ZeroAddress
  // reverts since there is no contract there; the fallbacks match observed mainnet gas).
  const GAS = {
    deploy:  deployGas,
    create:  150_000n,
    join:     90_000n,
    report:   60_000n,
    forfeit:  55_000n,
    settle:  200_000n,
    transfer: 21_000n,
  };

  // Transaction inventory for the full run.
  // setup phase:
  //   1x deploy
  //   3x fund test wallets (ETH transfer: owner -> alice/bob/carol)
  //   3x createCompetition (owner)
  //   7x joinCompetition   (alice x3, bob x3, carol x1)
  //   4x submitReport      (alice x2, bob x1, carol x1)
  //   1x forfeit           (bob, Comp B)
  // settle phase:
  //   3x settleCompetition (owner)
  const txTable = [
    { label: "Deploy StreakBetEscrow (x1)",              gas: GAS.deploy,   count: 1, payer: "owner" },
    { label: "Fund test wallets ETH transfer (x3)",      gas: GAS.transfer, count: 3, payer: "owner" },
    { label: "createCompetition (x3)",                   gas: GAS.create,   count: 3, payer: "owner" },
    { label: "joinCompetition (x7 total)",               gas: GAS.join,     count: 7, payer: "test wallets" },
    { label: "submitReport (x4 total)",                  gas: GAS.report,   count: 4, payer: "test wallets" },
    { label: "forfeit (x1, Bob)",                        gas: GAS.forfeit,  count: 1, payer: "test wallets" },
    { label: "settleCompetition (x3)",                   gas: GAS.settle,   count: 3, payer: "owner" },
  ];

  console.log(`\n  ${"Transaction".padEnd(42)} ${"Gas".padStart(9)}  ${"ETH cost".padStart(18)}  ${"USD".padStart(10)}`);
  console.log(`  ${"─".repeat(84)}`);

  let ownerGasCost = 0n;
  let testGasCost  = 0n;

  for (const row of txTable) {
    const gasWei = row.gas * gasPrice * BigInt(row.count);
    const ethStr = ethers.formatEther(gasWei).slice(0, 14).padStart(18);
    const usdStr = fmtUsd(gasWei).padStart(10);
    const gasStr = String(row.gas * BigInt(row.count)).padStart(9);
    console.log(`  ${row.label.padEnd(42)} ${gasStr}  ${ethStr}  ${usdStr}`);
    if (row.payer === "owner") ownerGasCost += gasWei;
    else                       testGasCost  += gasWei;
  }
  console.log(`  ${"─".repeat(84)}`);

  const totalGasCost = ownerGasCost + testGasCost;
  const stakeTotal   = STAKE_WEI * 7n; // 7 join() calls -- stakes are returned at settle

  console.log(`  ${"Total gas".padEnd(42)} ${"".padStart(9)}  ${ethers.formatEther(totalGasCost).slice(0, 14).padStart(18)}  ${fmtUsd(totalGasCost).padStart(10)}`);
  console.log(`  ${"Stakes (locked, returned to winners)".padEnd(42)} ${"".padStart(9)}  ${ethers.formatEther(stakeTotal).slice(0, 14).padStart(18)}  ${fmtUsd(stakeTotal).padStart(10)}`);

  // Per-test-wallet needs.
  const aliceGas  = (GAS.join * 3n + GAS.report * 2n) * gasPrice;
  const bobGas    = (GAS.join * 3n + GAS.report * 1n + GAS.forfeit) * gasPrice;
  const carolGas  = (GAS.join * 1n + GAS.report * 1n) * gasPrice;
  const aliceNeed = aliceGas + STAKE_WEI * 3n;
  const bobNeed   = bobGas   + STAKE_WEI * 3n;
  const carolNeed = carolGas + STAKE_WEI * 1n;

  section("📋  Per-wallet funding requirements");
  console.log(`\n  Wallet   Address                                           Gas + Stake needed`);
  console.log(`  ${"─".repeat(80)}`);
  console.log(`  owner    ${owner.address}   (receives from you; funds others)`);
  console.log(`  alice    ${alice.address}   ${fmt(aliceNeed)}  ${fmtUsd(aliceNeed)}`);
  console.log(`  bob      ${bob.address}   ${fmt(bobNeed)}  ${fmtUsd(bobNeed)}`);
  console.log(`  carol    ${carol.address}   ${fmt(carolNeed)}  ${fmtUsd(carolNeed)}`);

  // Total the owner needs.
  const ownerOwnGas  = (GAS.deploy + GAS.transfer * 3n + GAS.create * 3n + GAS.settle * 3n) * gasPrice;
  const walletFunding = aliceNeed + bobNeed + carolNeed;
  const ownerTotal   = ownerOwnGas + walletFunding;
  const withBuffer   = (ownerTotal * FUNDING_BUFFER_PCT) / 100n;

  section("💰  How much to put in the OWNER wallet before running setup");
  step(`Minimum (exact):    ${fmt(ownerTotal)}  ${fmtUsd(ownerTotal)}`);
  step(`Recommended (+20%): ${fmt(withBuffer)}  ${fmtUsd(withBuffer)}`);
  console.log(`\n  ❗ Send at least ${fmt(withBuffer)} to:`);
  console.log(`\n       ${owner.address}`);
  console.log(`\n       Network: Optimism (chainId ${chainId})`);
  step("The owner wallet auto-tops-up Alice, Bob, and Carol during setup.");
  step("You do NOT need to fund the test wallets manually.");

  section("⏰  Timeline for this run");
  const now     = new Date();
  const endDate = new Date(now.getTime() + COMP_DURATION_S * 1000);
  step(`Setup start        : now  (${now.toLocaleString()})`);
  step(`Wallets join comps : ~${new Date(now.getTime() + START_BUFFER_MS).toLocaleString()}`);
  step(`Competition end    : ${endDate.toLocaleString()}`);
  step(`Settle phase       : any time after ${endDate.toLocaleString()}`);
  step(`Duration           : ${COMP_DURATION_S / 3600}h  (COMP_DURATION_HOURS=${COMP_DURATION_S / 3600})`);
  step(`Stake per entrant  : ${fmt(STAKE_WEI)}  ${fmtUsd(STAKE_WEI)}`);

  section("🚀  Next steps");
  step(`1. Fund the owner wallet (${owner.address})`);
  step(`   with at least ${fmt(withBuffer)} on Optimism.`);
  step("2. Run setup:   SIM_PHASE=setup  npx hardhat run scripts/streakbot-live.js --network optimism");
  step(`3. Wait until:  ${endDate.toLocaleString()}`);
  step("4. Run settle:  SIM_PHASE=settle npx hardhat run scripts/streakbot-live.js --network optimism");
}

// ── Phase 1 — Setup ───────────────────────────────────────────────────────────

async function runSetup(wallets, chainId) {
  const { owner, alice, bob, carol } = wallets;

  section("Phase 1 -- Setup: Deploy, create competitions, join, submit day-1 reports");

  // Fund test wallets from owner.
  const gasBuffer = ethers.parseEther("0.001");
  const fundAmt   = STAKE_WEI * 4n + gasBuffer;
  const minBal    = STAKE_WEI * 2n;
  for (const [name, signer] of [["Alice", alice], ["Bob", bob], ["Carol", carol]]) {
    await ensureFunded(owner, signer, fundAmt, minBal, chainId);
    step(`${name} wallet ready: ${signer.address}`);
  }

  await logBalances(wallets);

  const escrow     = await deployEscrow(owner, chainId);
  const escrowAddr = await escrow.getAddress();

  const start    = nowSec() + 60;
  const end      = nowSec() + COMP_DURATION_S;
  const deadline = nowSec() + JOIN_WINDOW_S;

  section("Competition timing");
  step(`  Start       : ${new Date(start * 1000).toLocaleString()}`);
  step(`  Join closes : ${new Date(deadline * 1000).toLocaleString()}`);
  step(`  End (settle): ${new Date(end * 1000).toLocaleString()}`);
  step(`  Duration    : ${COMP_DURATION_S / 3600} hours`);

  const compParams = (label) => ({
    name:         `Live Sim ${label}`,
    stakeToken:   ethers.ZeroAddress,
    stakeAmount:  STAKE_WEI,
    totalWeeks:   1,
    startTime:    start,
    endTime:      end,
    joinDeadline: deadline,
    yieldEnabled: false,
    metadataCID:  "cycle:daily;src:exercise",
  });

  section("Creating Comp A: 'All Complete' (Alice + Bob + Carol all report)");
  let tx      = await escrow.createCompetition(compParams("A -- All Complete"));
  let receipt = await tx.wait();
  ok(`Comp A created (ID 0) -- ${explorerTx(receipt.hash, chainId)}`);
  await sleep(TX_PAUSE_MS);

  section("Creating Comp B: 'One Forfeits' (Bob forfeits; Alice wins all)");
  tx      = await escrow.createCompetition(compParams("B -- One Forfeits"));
  receipt = await tx.wait();
  ok(`Comp B created (ID 1) -- ${explorerTx(receipt.hash, chainId)}`);
  await sleep(TX_PAUSE_MS);

  section("Creating Comp C: 'Nobody Reports' (all auto-forfeited at settle)");
  tx      = await escrow.createCompetition(compParams("C -- Nobody Reports"));
  receipt = await tx.wait();
  ok(`Comp C created (ID 2) -- ${explorerTx(receipt.hash, chainId)}`);
  await sleep(TX_PAUSE_MS);

  step(`Waiting ${START_BUFFER_MS / 1000}s for competitions to open (startTime in 60s)...`);
  await sleep(START_BUFFER_MS);

  section("Joining Comp A (Alice + Bob + Carol)");
  for (const [name, signer] of [["Alice", alice], ["Bob", bob], ["Carol", carol]]) {
    tx      = await escrow.connect(signer).joinCompetition(0, { value: STAKE_WEI });
    receipt = await tx.wait();
    ok(`${name} joined Comp A -- staked ${fmt(STAKE_WEI)} -- ${explorerTx(receipt.hash, chainId)}`);
    await sleep(TX_PAUSE_MS);
  }

  section("Joining Comp B (Alice + Bob; Carol sits out)");
  for (const [name, signer] of [["Alice", alice], ["Bob", bob]]) {
    tx      = await escrow.connect(signer).joinCompetition(1, { value: STAKE_WEI });
    receipt = await tx.wait();
    ok(`${name} joined Comp B -- staked ${fmt(STAKE_WEI)} -- ${explorerTx(receipt.hash, chainId)}`);
    await sleep(TX_PAUSE_MS);
  }

  section("Joining Comp C (Alice + Bob; neither will report)");
  for (const [name, signer] of [["Alice", alice], ["Bob", bob]]) {
    tx      = await escrow.connect(signer).joinCompetition(2, { value: STAKE_WEI });
    receipt = await tx.wait();
    ok(`${name} joined Comp C -- staked ${fmt(STAKE_WEI)} -- ${explorerTx(receipt.hash, chainId)}`);
    await sleep(TX_PAUSE_MS);
  }

  section("Submitting day-1 reports");

  for (const [name, signer, cid] of [
    ["Alice", alice, "QmLiveA-Alice"],
    ["Bob",   bob,   "QmLiveA-Bob"],
    ["Carol", carol, "QmLiveA-Carol"],
  ]) {
    tx      = await escrow.connect(signer).submitReport(0, cid);
    receipt = await tx.wait();
    ok(`Comp A: ${name} submitted report -- ${explorerTx(receipt.hash, chainId)}`);
    await sleep(TX_PAUSE_MS);
  }

  tx      = await escrow.connect(alice).submitReport(1, "QmLiveB-Alice");
  receipt = await tx.wait();
  ok(`Comp B: Alice submitted report -- ${explorerTx(receipt.hash, chainId)}`);
  await sleep(TX_PAUSE_MS);

  tx      = await escrow.connect(bob).forfeit(1);
  receipt = await tx.wait();
  ok(`Comp B: Bob voluntarily forfeited -- ${explorerTx(receipt.hash, chainId)}`);
  await sleep(TX_PAUSE_MS);

  // Comp C -- nobody reports; both are auto-forfeited at settle.

  await logBalances(wallets);

  const network = await ethers.provider.getNetwork();
  const state = {
    network:      network.name,
    chainId:      network.chainId.toString(),
    escrowAddr,
    deployedAt:   new Date().toISOString(),
    endTime:      end,
    endTimeHuman: new Date(end * 1000).toLocaleString(),
    stakeWei:     STAKE_WEI.toString(),
    wallets: {
      owner: owner.address,
      alice: alice.address,
      bob:   bob.address,
      carol: carol.address,
    },
    comps: {
      A: { id: 0, name: "All Complete",   entrants: ["alice", "bob", "carol"] },
      B: { id: 1, name: "One Forfeits",   entrants: ["alice", "bob"] },
      C: { id: 2, name: "Nobody Reports", entrants: ["alice", "bob"] },
    },
  };
  saveState(state);

  section("✅ Setup complete");
  step(`Competitions settleable after : ${state.endTimeHuman}`);
  step(`Escrow contract               : ${explorerAddr(escrowAddr, chainId)}`);
  step(`State file                    : ${STATE_FILE}`);
  step("Run SIM_PHASE=settle after endTime to settle and verify payouts.");
}

// ── Phase 2 — Settle ──────────────────────────────────────────────────────────

async function runSettle(wallets, chainId) {
  const { owner, alice, bob, carol } = wallets;

  section("Phase 2 -- Settle: verify payouts after competition ends");

  const state   = loadState();
  step(`State file    : ${STATE_FILE}`);
  step(`Escrow        : ${state.escrowAddr}`);
  step(`End time      : ${state.endTimeHuman}`);

  const escrow  = await connectEscrow(state.escrowAddr, owner);
  const endTime = Number(state.endTime);
  const stake   = BigInt(state.stakeWei);

  const block = await ethers.provider.getBlock("latest");
  if (block.timestamp < endTime) {
    await waitUntilTimestamp(endTime, "competition endTime");
  } else {
    step("endTime already passed -- settling immediately.");
  }

  await logBalances(wallets);

  // ── Settle Comp A ─────────────────────────────────────────────────────────
  section("Settling Comp A -- All Complete (3-way equal split expected)");

  const aPre = {
    alice: await ethers.provider.getBalance(alice.address),
    bob:   await ethers.provider.getBalance(bob.address),
    carol: await ethers.provider.getBalance(carol.address),
  };

  let tx      = await escrow.settleCompetition(0, "QmLiveLeaderboardA");
  let receipt = await tx.wait();
  ok(`Comp A settled -- ${explorerTx(receipt.hash, chainId)}`);

  const pot   = stake * 3n;
  const share = pot / 3n;
  console.log(`\n  ${"".padEnd(2)} ${"Wallet".padEnd(6)} ${"Before".padStart(22)} ${"After".padStart(22)} ${"Gain".padStart(22)} ${"Expected >=".padStart(22)}`);
  console.log(`  ${"─".repeat(98)}`);
  for (const [name, signer, pre] of [
    ["Alice", alice, aPre.alice],
    ["Bob",   bob,   aPre.bob],
    ["Carol", carol, aPre.carol],
  ]) {
    const post = await ethers.provider.getBalance(signer.address);
    const gain = post - pre;
    const icon = gain >= share ? "✅" : "❌";
    console.log(`  ${icon} ${name.padEnd(6)} ${fmt(pre).padStart(22)} ${fmt(post).padStart(22)} ${fmt(gain).padStart(22)} ${fmt(share).padStart(22)}`);
  }

  // ── Settle Comp B ─────────────────────────────────────────────────────────
  section("Settling Comp B -- One Forfeits (Alice wins both stakes)");

  const bAlicePre = await ethers.provider.getBalance(alice.address);
  tx      = await escrow.settleCompetition(1, "QmLiveLeaderboardB");
  receipt = await tx.wait();
  ok(`Comp B settled -- ${explorerTx(receipt.hash, chainId)}`);

  const bAlicePost = await ethers.provider.getBalance(alice.address);
  const bGain      = bAlicePost - bAlicePre;
  const bExpected  = stake * 2n;
  console.log(`\n  ${bGain >= bExpected ? "✅" : "❌"} Alice gained ${fmt(bGain)} (expected >= ${fmt(bExpected)})`);

  // ── Settle Comp C ─────────────────────────────────────────────────────────
  section("Settling Comp C -- Nobody Reports (all auto-forfeited, 0 winners)");

  const cComp = await escrow.getCompetition(2);
  step(`potBalance before settle: ${fmt(cComp.potBalance)}`);

  tx      = await escrow.settleCompetition(2, "QmLiveLeaderboardC");
  receipt = await tx.wait();
  ok(`Comp C settled -- ${explorerTx(receipt.hash, chainId)}`);

  const cAfter = await escrow.getCompetition(2);
  console.log(`\n  ${cAfter.winnerCount === 0n ? "✅" : "❌"} winnerCount : ${cAfter.winnerCount} (expected 0)`);
  console.log(`  ${cAfter.potBalance  === 0n ? "✅" : "❌"} potBalance  : ${fmt(cAfter.potBalance)} (expected 0)`);
  warn("ETH from Comp C stays in the escrow contract -- no winners to pay out.");

  await logBalances(wallets);

  section("🎉 Settle complete -- all three scenarios validated");
  step(`Explorer: ${explorerAddr(state.escrowAddr, chainId)}`);
  step("You can now delete streakbot-live-state.json.");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const phase = (process.env.SIM_PHASE || "").toLowerCase();
  if (phase !== "estimate" && phase !== "setup" && phase !== "settle") {
    console.error(
      `\n  [${ts()}] ❌  Set SIM_PHASE=estimate, SIM_PHASE=setup, or SIM_PHASE=settle before running.\n` +
      "\n   Recommended order:\n" +
      "     SIM_PHASE=estimate npx hardhat run scripts/streakbot-live.js --network optimism\n" +
      "     SIM_PHASE=setup    npx hardhat run scripts/streakbot-live.js --network optimism\n" +
      "     SIM_PHASE=settle   npx hardhat run scripts/streakbot-live.js --network optimism\n"
    );
    process.exit(1);
  }

  section(`🤖  StreakBot Live Sim -- Phase: ${phase.toUpperCase()}`);

  const signers = await ethers.getSigners();
  if (signers.length < 4) {
    throw new Error(
      "Need at least 4 signers (owner, Alice, Bob, Carol).\n" +
      "Set HD_MNEMONIC in your .env so Hardhat derives 5 accounts (count: 5).\n" +
      "See hardhat.config.js -> liveAccounts() and .env.example for setup."
    );
  }

  const [owner, alice, bob, carol] = signers;
  const wallets = { owner, alice, bob, carol };

  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;

  step(`Network  : ${network.name} (chainId: ${chainId})`);
  step(`Duration : ${COMP_DURATION_S / 3600}h  |  Stake: ${fmt(STAKE_WEI)} ${fmtUsd(STAKE_WEI)}`);

  console.log(`\n  [${ts()}] 📋 Wallet addresses (full):`);
  for (const [name, signer] of Object.entries(wallets)) {
    await logBalance(name, signer.address);
  }

  if (phase === "estimate") return runEstimate(wallets, chainId);
  if (phase === "setup")    return runSetup(wallets, chainId);
  if (phase === "settle")   return runSettle(wallets, chainId);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n  [${ts()}] ❌ Script failed:`, err.message || err);
    process.exit(1);
  });
