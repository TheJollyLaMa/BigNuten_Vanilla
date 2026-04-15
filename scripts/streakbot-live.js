/**
 * scripts/streakbot-live.js
 *
 * StreakBet Escrow — Live Real-Money Simulation Script
 * =====================================================
 * Runs two-phase "penny" competition tests on Optimism mainnet (or any live
 * EVM network) with real ETH stakes and real competition durations of 1–2 days.
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
 *        HD_MNEMONIC="word1 word2 … word12"   ← 12-word seed phrase
 *        OPTIMISM_MAINNET_RPC_URL=https://mainnet.optimism.io
 *        AAVE_POOL_ADDRESS=0x794a…814aD        ← optional, for yield
 *
 *   2. Fund the FIRST derived wallet (index 0 — the deployer/admin) with enough
 *      Optimism ETH to cover gas + stakes for all test wallets:
 *        • Gas (deploy + all txs): ~0.001 ETH
 *        • Stakes (3 comps × 3 entrants × STAKE_WEI): 9 × STAKE_WEI
 *        • Total at STAKE_WEI=0.0001: ≈ 0.0019 ETH (~pennies)
 *
 * Usage
 * -----
 *   # Phase 1 — create competitions, join, submit day-1 reports
 *   SIM_PHASE=setup npx hardhat run scripts/streakbot-live.js --network optimism
 *
 *   # Phase 2 — settle after endTime (run again 1–2 days later)
 *   SIM_PHASE=settle npx hardhat run scripts/streakbot-live.js --network optimism
 *
 *   # Shorter duration for quick testing (override hours via env var):
 *   COMP_DURATION_HOURS=2 SIM_PHASE=setup npx hardhat run scripts/streakbot-live.js --network optimism
 *
 * State file
 * ----------
 *   streakbot-live-state.json is written after setup and read during settle.
 *   It is listed in .gitignore — never commit it.
 *
 * ⚠️  This script spends REAL ETH on a REAL network.  Stakes are tiny by
 *     design but transactions cost gas.  Double-check your .env before running.
 */

const { ethers } = require("hardhat");
const fs          = require("fs");
const path        = require("path");

// ── Config ────────────────────────────────────────────────────────────────────

/** Per-entrant ETH stake. ~$0.0003 at $3 ETH — genuine pennies. */
const STAKE_WEI = ethers.parseEther(process.env.STAKE_ETH || "0.0001");

/** Competition duration in seconds (default: 24 hours). */
const COMP_DURATION_S = Number(process.env.COMP_DURATION_HOURS || "24") * 3600;

/** Join window in seconds (default: same as duration so anyone can join anytime). */
const JOIN_WINDOW_S = Number(process.env.JOIN_WINDOW_HOURS || process.env.COMP_DURATION_HOURS || "24") * 3600;

/** Aave V3 Pool on Optimism mainnet (optional — set to ZeroAddress to skip yield). */
const AAVE_POOL_ADDRESS = process.env.AAVE_POOL_ADDRESS || ethers.ZeroAddress;

/** Delay between consecutive transactions (ms). */
const TX_PAUSE_MS = 3000;

/** Path to the state file persisted between setup and settle phases. */
const STATE_FILE = path.join(__dirname, "..", "streakbot-live-state.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmt(wei) {
  return `${ethers.formatEther(wei)} ETH`;
}

function section(title) {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(64));
}

function step(msg) {
  console.log(`  ▶ ${msg}`);
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

async function logBalance(label, addr) {
  const bal = await ethers.provider.getBalance(addr);
  console.log(`    ${label.padEnd(12)} ${addr.slice(0, 12)}... : ${fmt(bal)}`);
}

async function logBalances(wallets) {
  console.log("  📊 Current balances:");
  for (const [name, signer] of Object.entries(wallets)) {
    await logBalance(name, signer.address);
  }
}

/** Fund `recipient` from `funder` if below `minBalance`. */
async function ensureFunded(funder, recipient, amount, minBalance = 0n) {
  const bal = await ethers.provider.getBalance(recipient.address);
  if (bal < minBalance) {
    step(`Funding ${recipient.address.slice(0, 12)}... with ${fmt(amount)}`);
    const tx = await funder.sendTransaction({ to: recipient.address, value: amount });
    await tx.wait();
    await sleep(TX_PAUSE_MS);
  }
}

/** Poll until block.timestamp >= targetTimestamp, logging progress. */
async function waitUntilTimestamp(targetTimestamp, label = "target") {
  step(`Waiting for ${label} — ${new Date(targetTimestamp * 1000).toLocaleString()}...`);
  const POLL_MS = 5 * 60 * 1000; // poll every 5 minutes
  while (true) {
    const block     = await ethers.provider.getBlock("latest");
    const remaining = targetTimestamp - block.timestamp;
    if (remaining <= 0) {
      step(`${label} reached.`);
      break;
    }
    const hours   = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    console.log(`    ⏳ ${hours}h ${minutes}m remaining (checking again in 5 min)...`);
    await sleep(POLL_MS);
  }
}

/** Read state file; throws if it doesn't exist. */
function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(
      `State file not found: ${STATE_FILE}\n` +
      "Run 'SIM_PHASE=setup ...' first to create competitions."
    );
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

/** Write state file. */
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  step(`State saved → ${STATE_FILE}`);
}

// ── Deploy ────────────────────────────────────────────────────────────────────

async function deployEscrow(owner) {
  step("Deploying StreakBetEscrow...");
  const Factory = await ethers.getContractFactory("StreakBetEscrow", owner);
  const escrow  = await Factory.deploy(owner.address, AAVE_POOL_ADDRESS);
  await escrow.waitForDeployment();
  const addr = await escrow.getAddress();
  step(`StreakBetEscrow deployed → ${addr}`);
  step(`View on explorer: https://optimistic.etherscan.io/address/${addr}`);
  return escrow;
}

/** Connect to an already-deployed escrow by address. */
async function connectEscrow(addr, signer) {
  const factory = await ethers.getContractFactory("StreakBetEscrow", signer);
  return factory.attach(addr);
}

// ── Phase 1 — Setup ───────────────────────────────────────────────────────────

async function runSetup(wallets) {
  const { owner, alice, bob, carol } = wallets;

  section("Phase 1 — Setup: Deploy, create competitions, join, submit day-1 reports");

  // Fund test wallets from owner (each needs STAKE_WEI × comps they join + gas).
  const gasBuffer = ethers.parseEther("0.001"); // generous gas buffer
  const fundAmt   = STAKE_WEI * 4n + gasBuffer;
  const minBal    = STAKE_WEI * 2n;
  for (const [name, signer] of [["Alice", alice], ["Bob", bob], ["Carol", carol]]) {
    await ensureFunded(owner, signer, fundAmt, minBal);
    step(`${name} wallet: ${signer.address}`);
  }

  await logBalances(wallets);

  // Deploy escrow.
  const escrow     = await deployEscrow(owner);
  const escrowAddr = await escrow.getAddress();

  // Competition timing.
  const start    = nowSec() + 60;                  // starts in 1 minute
  const end      = nowSec() + COMP_DURATION_S;     // ends in N hours
  const deadline = nowSec() + JOIN_WINDOW_S;       // join window = N hours

  step(`\n  Competition timing:`);
  step(`    Start    : ${new Date(start * 1000).toLocaleString()}`);
  step(`    Deadline : ${new Date(deadline * 1000).toLocaleString()}`);
  step(`    End      : ${new Date(end * 1000).toLocaleString()}`);
  step(`    Duration : ${COMP_DURATION_S / 3600} hours`);

  // ── Comp A: All complete ───────────────────────────────────────────────────
  section("Creating Comp A: 'All Complete' (Alice + Bob + Carol all report)");
  let tx;
  tx = await escrow.createCompetition({
    name:         "Live Sim A — All Complete",
    stakeToken:   ethers.ZeroAddress,
    stakeAmount:  STAKE_WEI,
    totalWeeks:   1,
    startTime:    start,
    endTime:      end,
    joinDeadline: deadline,
    yieldEnabled: false,
    metadataCID:  "cycle:daily;src:exercise",
  });
  await tx.wait();
  step("Comp A created (ID 0)");
  await sleep(TX_PAUSE_MS);

  // ── Comp B: One forfeits ───────────────────────────────────────────────────
  section("Creating Comp B: 'One Forfeits' (Bob forfeits; Alice wins all)");
  tx = await escrow.createCompetition({
    name:         "Live Sim B — One Forfeits",
    stakeToken:   ethers.ZeroAddress,
    stakeAmount:  STAKE_WEI,
    totalWeeks:   1,
    startTime:    start,
    endTime:      end,
    joinDeadline: deadline,
    yieldEnabled: false,
    metadataCID:  "cycle:daily;src:exercise",
  });
  await tx.wait();
  step("Comp B created (ID 1)");
  await sleep(TX_PAUSE_MS);

  // ── Comp C: Nobody reports ─────────────────────────────────────────────────
  section("Creating Comp C: 'Nobody Reports' (all auto-forfeited at settle)");
  tx = await escrow.createCompetition({
    name:         "Live Sim C — Nobody Reports",
    stakeToken:   ethers.ZeroAddress,
    stakeAmount:  STAKE_WEI,
    totalWeeks:   1,
    startTime:    start,
    endTime:      end,
    joinDeadline: deadline,
    yieldEnabled: false,
    metadataCID:  "cycle:daily;src:exercise",
  });
  await tx.wait();
  step("Comp C created (ID 2)");
  await sleep(TX_PAUSE_MS);

  // ── Wait for start ─────────────────────────────────────────────────────────
  step("Waiting 65 seconds for competitions to start...");
  await sleep(65_000);

  // ── All join Comp A ────────────────────────────────────────────────────────
  section("Joining Comp A (all three entrants)");
  for (const [name, signer] of [["Alice", alice], ["Bob", bob], ["Carol", carol]]) {
    tx = await escrow.connect(signer).joinCompetition(0, { value: STAKE_WEI });
    await tx.wait();
    step(`${name} joined Comp A — staked ${fmt(STAKE_WEI)}`);
    await sleep(TX_PAUSE_MS);
  }

  // ── Alice + Bob join Comp B ────────────────────────────────────────────────
  section("Joining Comp B (Alice + Bob only; Carol sits this one out)");
  for (const [name, signer] of [["Alice", alice], ["Bob", bob]]) {
    tx = await escrow.connect(signer).joinCompetition(1, { value: STAKE_WEI });
    await tx.wait();
    step(`${name} joined Comp B — staked ${fmt(STAKE_WEI)}`);
    await sleep(TX_PAUSE_MS);
  }

  // ── Alice + Bob join Comp C ────────────────────────────────────────────────
  section("Joining Comp C (Alice + Bob; neither will report)");
  for (const [name, signer] of [["Alice", alice], ["Bob", bob]]) {
    tx = await escrow.connect(signer).joinCompetition(2, { value: STAKE_WEI });
    await tx.wait();
    step(`${name} joined Comp C — staked ${fmt(STAKE_WEI)}`);
    await sleep(TX_PAUSE_MS);
  }

  // ── Submit day-1 reports ───────────────────────────────────────────────────
  section("Submitting day-1 reports");

  // Comp A — all three report.
  for (const [name, signer, cid] of [
    ["Alice", alice, "QmLiveA-Alice"],
    ["Bob",   bob,   "QmLiveA-Bob"],
    ["Carol", carol, "QmLiveA-Carol"],
  ]) {
    tx = await escrow.connect(signer).submitReport(0, cid);
    await tx.wait();
    step(`Comp A: ${name} submitted report`);
    await sleep(TX_PAUSE_MS);
  }

  // Comp B — only Alice reports; Bob will forfeit before endTime.
  tx = await escrow.connect(alice).submitReport(1, "QmLiveB-Alice");
  await tx.wait();
  step("Comp B: Alice submitted report (Bob will forfeit before endTime)");
  await sleep(TX_PAUSE_MS);

  // Comp B — Bob forfeits immediately (he's done).
  tx = await escrow.connect(bob).forfeit(1);
  await tx.wait();
  step("Comp B: Bob voluntarily forfeited");
  await sleep(TX_PAUSE_MS);

  // Comp C — nobody reports (they'll be auto-forfeited at settle).

  await logBalances(wallets);

  // ── Persist state ──────────────────────────────────────────────────────────
  const state = {
    network:      (await ethers.provider.getNetwork()).name,
    escrowAddr:   escrowAddr,
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
  step(`Competitions will be settleable after: ${state.endTimeHuman}`);
  step("Run 'SIM_PHASE=settle ...' after endTime to settle and verify payouts.");
  step(`State file: ${STATE_FILE}`);
}

// ── Phase 2 — Settle ──────────────────────────────────────────────────────────

async function runSettle(wallets) {
  const { owner, alice, bob, carol } = wallets;

  section("Phase 2 — Settle: verify payouts after competition ends");

  const state = loadState();
  step(`Loaded state from ${STATE_FILE}`);
  step(`Escrow address : ${state.escrowAddr}`);
  step(`End time       : ${state.endTimeHuman}`);

  const escrow  = await connectEscrow(state.escrowAddr, owner);
  const endTime = Number(state.endTime);
  const stake   = BigInt(state.stakeWei);

  // Wait for endTime if necessary.
  const block = await ethers.provider.getBlock("latest");
  if (block.timestamp < endTime) {
    await waitUntilTimestamp(endTime, "competition endTime");
  } else {
    step("endTime already passed — settling now.");
  }

  await logBalances(wallets);

  // ── Settle Comp A ─────────────────────────────────────────────────────────
  section("Settling Comp A — All Complete (3-way equal split)");
  const aPre = {
    alice: await ethers.provider.getBalance(alice.address),
    bob:   await ethers.provider.getBalance(bob.address),
    carol: await ethers.provider.getBalance(carol.address),
  };

  let tx = await escrow.settleCompetition(0, "QmLiveLeaderboardA");
  await tx.wait();
  step("Comp A settled ✅");

  const pot   = stake * 3n;
  const share = pot / 3n;
  for (const [name, signer, pre] of [
    ["Alice", alice, aPre.alice],
    ["Bob",   bob,   aPre.bob],
    ["Carol", carol, aPre.carol],
  ]) {
    const post = await ethers.provider.getBalance(signer.address);
    const gain = post - pre;
    step(`  ${name}: received ${fmt(gain)} (expected ≥ ${fmt(share)}) ${gain >= share ? "✅" : "❌"}`);
  }

  // ── Settle Comp B ─────────────────────────────────────────────────────────
  section("Settling Comp B — One Forfeits (Alice should win entire 2-stake pot)");
  const bPre = {
    alice: await ethers.provider.getBalance(alice.address),
  };

  tx = await escrow.settleCompetition(1, "QmLiveLeaderboardB");
  await tx.wait();
  step("Comp B settled ✅");

  const bPost     = await ethers.provider.getBalance(alice.address);
  const bGain     = bPost - bPre.alice;
  const bExpected = stake * 2n;
  step(`  Alice: received ${fmt(bGain)} (expected ≥ ${fmt(bExpected)}) ${bGain >= bExpected ? "✅" : "❌"}`);

  // ── Settle Comp C ─────────────────────────────────────────────────────────
  section("Settling Comp C — Nobody Reports (0 winners, ETH stays in escrow)");
  const cComp = await escrow.getCompetition(2);
  step(`  potBalance before settle: ${fmt(cComp.potBalance)}`);

  tx = await escrow.settleCompetition(2, "QmLiveLeaderboardC");
  await tx.wait();
  step("Comp C settled ✅");

  const cCompAfter = await escrow.getCompetition(2);
  step(`  winnerCount : ${cCompAfter.winnerCount} (expected 0) ${cCompAfter.winnerCount === 0n ? "✅" : "❌"}`);
  step(`  potBalance  : ${fmt(cCompAfter.potBalance)} (expected 0) ${cCompAfter.potBalance === 0n ? "✅" : "❌"}`);
  step(`  Note: ETH from Comp C remains in the escrow contract (no winners)`);

  await logBalances(wallets);

  section("🎉 Settle complete");
  step(`Explorer: https://optimistic.etherscan.io/address/${state.escrowAddr}`);
  step("All three scenarios validated. You can now remove streakbot-live-state.json.");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const phase = (process.env.SIM_PHASE || "").toLowerCase();
  if (phase !== "setup" && phase !== "settle") {
    console.error(
      "\n❌  Set SIM_PHASE=setup or SIM_PHASE=settle before running this script.\n" +
      "\n   Example:\n" +
      "     SIM_PHASE=setup  npx hardhat run scripts/streakbot-live.js --network optimism\n" +
      "     SIM_PHASE=settle npx hardhat run scripts/streakbot-live.js --network optimism\n"
    );
    process.exit(1);
  }

  section(`🤖  StreakBot Live Sim — Phase: ${phase.toUpperCase()}`);

  const signers = await ethers.getSigners();
  if (signers.length < 4) {
    throw new Error(
      "Need at least 4 signers (owner, Alice, Bob, Carol).\n" +
      "Set HD_MNEMONIC in your .env so Hardhat derives 5 accounts (count: 5).\n" +
      "See hardhat.config.js → liveAccounts() and .env.example for setup."
    );
  }

  const [owner, alice, bob, carol] = signers;
  const wallets = { owner, alice, bob, carol };

  console.log("\n📋  Wallets:");
  for (const [name, signer] of Object.entries(wallets)) {
    await logBalance(name, signer.address);
  }

  const network = await ethers.provider.getNetwork();
  step(`\nNetwork: ${network.name} (chainId: ${network.chainId})`);
  step(`Stake per entrant: ${fmt(STAKE_WEI)}`);
  step(`Competition duration: ${COMP_DURATION_S / 3600} hours`);

  if (phase === "setup")  return runSetup(wallets);
  if (phase === "settle") return runSettle(wallets);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌  Script failed:", err.message || err);
    process.exit(1);
  });
