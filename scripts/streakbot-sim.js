/**
 * scripts/streakbot-sim.js
 *
 * StreakBet Escrow — Live Simulation Script
 * ==========================================
 * Deploys a fresh StreakBetEscrow to the configured network, then simulates a
 * full group running through every competition scenario using small real-ETH
 * stakes (≈ "pennies").
 *
 * Scenarios run in sequence:
 *   1. All complete → equal split (ETH)
 *   2. Voluntary forfeit → single winner takes all (ETH)
 *   3. Auto-forfeit at settle → winner inherits lazy stakes (ETH)
 *   4. Nobody wins → all forfeited, funds stay in contract (ETH)
 *   5. Rounding / dust → dust remainder goes to owner (ETH)
 *   6. ERC-20: all complete → equal split
 *   7. ERC-20: single winner takes all
 *   8. Cancelled competition → full refund (ETH)
 *
 * Prerequisites
 * -------------
 *   1. Set PRIVATE_KEY in .env (deployer / admin wallet).
 *   2. Fund the deployer wallet with testnet ETH on Optimism Sepolia:
 *      https://www.alchemy.com/faucets/optimism-sepolia
 *   3. The script derives four test wallets (Alice/Bob/Carol/Dave) from the
 *      deployer mnemonic path; all gas + stakes are funded inline.
 *
 * Usage
 * -----
 *   npx hardhat run scripts/streakbot-sim.js --network optimism_sepolia
 *
 * The script logs every action, balance snapshot, and payout so you can verify
 * the money flow end-to-end.
 *
 * ⚠️  This script uses real funds on a live testnet. Keep stakes tiny.
 */

const { ethers } = require("hardhat");

// ── Config ────────────────────────────────────────────────────────────────────

/** Small ETH stake (wei). Adjust to match current faucet amounts. */
const STAKE_WEI = ethers.parseEther("0.0001");

/**
 * Address(0) is used when there is no Aave pool on the target network.
 * Replace with a real Aave V3 Pool address for yield-enabled scenarios.
 */
const AAVE_POOL_ADDRESS = process.env.AAVE_POOL_ADDRESS || ethers.ZeroAddress;

/** Seconds to wait between actions when running on a live chain. */
const TX_PAUSE_MS = 2000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pause execution for `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pretty-print an ETH amount. */
function fmt(wei) {
  return `${ethers.formatEther(wei)} ETH`;
}

/** Log a section header. */
function section(title) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

/** Log a step. */
function step(msg) {
  console.log(`  ▶ ${msg}`);
}

/** Log a balance snapshot for a named wallet. */
async function logBalance(label, addr) {
  const bal = await ethers.provider.getBalance(addr);
  console.log(`    ${label.padEnd(10)} ${addr.slice(0, 10)}... : ${fmt(bal)}`);
}

/** Log all wallet balances. */
async function logBalances(wallets) {
  console.log("  📊 Balances:");
  for (const [name, signer] of Object.entries(wallets)) {
    await logBalance(name, signer.address);
  }
}

/**
 * Send ETH from `funder` to `recipient`.
 * Only funds if the recipient balance is below `minBalance`.
 */
async function ensureFunded(funder, recipient, amount, minBalance = 0n) {
  const bal = await ethers.provider.getBalance(recipient.address);
  if (bal < minBalance) {
    step(`Funding ${recipient.address.slice(0, 10)}... with ${fmt(amount)}`);
    const tx = await funder.sendTransaction({ to: recipient.address, value: amount });
    await tx.wait();
    await sleep(TX_PAUSE_MS);
  }
}

/**
 * Compute unix timestamp seconds from now + offset.
 */
function nowPlus(seconds) {
  return Math.floor(Date.now() / 1000) + seconds;
}

/**
 * Wait on-chain until block.timestamp >= targetTimestamp.
 * On local Hardhat the script caller uses time.increaseTo;
 * on live networks it polls the latest block timestamp.
 */
async function waitUntil(targetTimestamp, label = "endTime") {
  const network = await ethers.provider.getNetwork();
  const isLocal = network.chainId === 31337n;

  if (isLocal) {
    // Use Hardhat's time manipulation helper (requires hardhat-network-helpers).
    const { time } = require("@nomicfoundation/hardhat-network-helpers");
    await time.increaseTo(targetTimestamp);
  } else {
    step(`Waiting for ${label} (${new Date(targetTimestamp * 1000).toISOString()})...`);
    // Poll with exponential back-off (max 30 s intervals).
    let interval = 5000;
    while (true) {
      const block = await ethers.provider.getBlock("latest");
      if (block.timestamp >= targetTimestamp) break;
      const remaining = targetTimestamp - block.timestamp;
      console.log(`    ⏳ ${remaining} seconds remaining...`);
      await sleep(Math.min(interval, remaining * 1000, 30000));
      interval = Math.min(interval * 2, 30000);
    }
  }
}

// ── Deploy helpers ────────────────────────────────────────────────────────────

async function deployEscrow(owner) {
  step("Deploying StreakBetEscrow...");
  const Factory = await ethers.getContractFactory("StreakBetEscrow", owner);
  const escrow  = await Factory.deploy(owner.address, AAVE_POOL_ADDRESS);
  await escrow.waitForDeployment();
  const addr = await escrow.getAddress();
  step(`StreakBetEscrow deployed → ${addr}`);
  return escrow;
}

async function deployMockToken(owner, escrowAddr) {
  step("Deploying MockERC20 token for ERC-20 scenarios...");
  const Factory = await ethers.getContractFactory("MockERC20", owner);
  const token   = await Factory.deploy("SimToken", "SIM", ethers.parseEther("1000000"));
  await token.waitForDeployment();
  step(`MockERC20 deployed → ${await token.getAddress()}`);
  return token;
}

// ── Simulation Scenarios ──────────────────────────────────────────────────────

/**
 * Scenario 1 — All complete → equal split (ETH).
 */
async function scenario1_allComplete(escrow, wallets, compId) {
  section(`Scenario 1 — All complete: equal ETH split  [comp ${compId}]`);

  const { owner, alice, bob, carol } = wallets;
  const startTime    = nowPlus(30);
  const endTime      = nowPlus(90);    // 90 s so we don't wait forever on local
  const joinDeadline = nowPlus(60);

  await escrow.createCompetition({
    name:         `Sim-1: All Complete (comp ${compId})`,
    stakeToken:   ethers.ZeroAddress,
    stakeAmount:  STAKE_WEI,
    totalWeeks:   1,
    startTime,
    endTime,
    joinDeadline,
    yieldEnabled: false,
    metadataCID:  "QmSim1",
  });
  step(`Competition ${compId} created`);

  await waitUntil(startTime + 1, "startTime");

  for (const [name, signer] of [["Alice", alice], ["Bob", bob], ["Carol", carol]]) {
    const tx = await escrow.connect(signer).joinCompetition(compId, { value: STAKE_WEI });
    await tx.wait();
    step(`${name} joined — staked ${fmt(STAKE_WEI)}`);
    await sleep(TX_PAUSE_MS);
  }

  // Each submits their single weekly report.
  for (const [name, signer, cid] of [
    ["Alice", alice, "QmAlice1"],
    ["Bob",   bob,   "QmBob1"],
    ["Carol", carol, "QmCarol1"],
  ]) {
    const tx = await escrow.connect(signer).submitReport(compId, cid);
    await tx.wait();
    step(`${name} submitted report → ${cid}`);
    await sleep(TX_PAUSE_MS);
  }

  await logBalances({ alice, bob, carol });

  await waitUntil(endTime, "endTime");

  const preBals = {
    alice: await ethers.provider.getBalance(alice.address),
    bob:   await ethers.provider.getBalance(bob.address),
    carol: await ethers.provider.getBalance(carol.address),
  };

  const tx = await escrow.settleCompetition(compId, "QmSim1-Leaderboard");
  await tx.wait();
  step("Competition settled ✅");

  const share = (STAKE_WEI * 3n) / 3n;
  for (const [name, addr, pre] of [
    ["Alice", alice.address, preBals.alice],
    ["Bob",   bob.address,   preBals.bob],
    ["Carol", carol.address, preBals.carol],
  ]) {
    const post = await ethers.provider.getBalance(addr);
    const gain = post - pre;
    const ok   = gain === share ? "✅" : "❌";
    step(`${name} received ${fmt(gain)} (expected ${fmt(share)}) ${ok}`);
  }
}

/**
 * Scenario 2 — Voluntary forfeit → winner takes all (ETH).
 */
async function scenario2_voluntaryForfeit(escrow, wallets, compId) {
  section(`Scenario 2 — Voluntary forfeit: winner takes all  [comp ${compId}]`);

  const { owner, alice, bob, carol } = wallets;
  const startTime    = nowPlus(30);
  const endTime      = nowPlus(90);
  const joinDeadline = nowPlus(60);

  await escrow.createCompetition({
    name:         `Sim-2: Voluntary Forfeit (comp ${compId})`,
    stakeToken:   ethers.ZeroAddress,
    stakeAmount:  STAKE_WEI,
    totalWeeks:   1,
    startTime,
    endTime,
    joinDeadline,
    yieldEnabled: false,
    metadataCID:  "QmSim2",
  });

  await waitUntil(startTime + 1, "startTime");

  for (const signer of [alice, bob, carol]) {
    const tx = await escrow.connect(signer).joinCompetition(compId, { value: STAKE_WEI });
    await tx.wait();
    await sleep(TX_PAUSE_MS);
  }
  step("Alice, Bob, Carol joined");

  // Alice completes; Bob and Carol forfeit.
  let tx;
  tx = await escrow.connect(alice).submitReport(compId, "QmAliceSim2");
  await tx.wait();
  step("Alice submitted her report (Completed)");

  tx = await escrow.connect(bob).forfeit(compId);
  await tx.wait();
  step("Bob voluntarily forfeited");

  tx = await escrow.connect(carol).forfeit(compId);
  await tx.wait();
  step("Carol voluntarily forfeited");

  const alicePre = await ethers.provider.getBalance(alice.address);
  await waitUntil(endTime, "endTime");
  tx = await escrow.settleCompetition(compId, "QmSim2-Leaderboard");
  await tx.wait();
  step("Competition settled ✅");

  const alicePost = await ethers.provider.getBalance(alice.address);
  const aliceGain = alicePost - alicePre;
  const expected  = STAKE_WEI * 3n;
  step(`Alice received ${fmt(aliceGain)} (expected ${fmt(expected)}) ${aliceGain === expected ? "✅" : "❌"}`);
}

/**
 * Scenario 3 — Auto-forfeit at settle (ETH).
 */
async function scenario3_autoForfeit(escrow, wallets, compId) {
  section(`Scenario 3 — Auto-forfeit at settle  [comp ${compId}]`);

  const { owner, alice, bob, carol } = wallets;
  const startTime    = nowPlus(30);
  const endTime      = nowPlus(90);
  const joinDeadline = nowPlus(60);

  await escrow.createCompetition({
    name:         `Sim-3: Auto-Forfeit (comp ${compId})`,
    stakeToken:   ethers.ZeroAddress,
    stakeAmount:  STAKE_WEI,
    totalWeeks:   2,   // 2 weeks required; only Alice completes both
    startTime,
    endTime,
    joinDeadline,
    yieldEnabled: false,
    metadataCID:  "QmSim3",
  });

  await waitUntil(startTime + 1, "startTime");

  for (const signer of [alice, bob, carol]) {
    const tx = await escrow.connect(signer).joinCompetition(compId, { value: STAKE_WEI });
    await tx.wait();
    await sleep(TX_PAUSE_MS);
  }
  step("Alice, Bob, Carol joined");

  // Alice completes all 2 weeks; Bob only submits 1; Carol submits none.
  let tx;
  tx = await escrow.connect(alice).submitReport(compId, "QmAliceSim3-W1");
  await tx.wait();
  tx = await escrow.connect(alice).submitReport(compId, "QmAliceSim3-W2");
  await tx.wait();
  step("Alice submitted both weekly reports (Completed)");

  tx = await escrow.connect(bob).submitReport(compId, "QmBobSim3-W1");
  await tx.wait();
  step("Bob submitted 1 of 2 reports (will be auto-forfeited at settle)");
  // Carol submits nothing.

  const alicePre = await ethers.provider.getBalance(alice.address);
  await waitUntil(endTime, "endTime");
  tx = await escrow.settleCompetition(compId, "QmSim3-Leaderboard");
  await tx.wait();
  step("Competition settled ✅");

  const aliceGain = (await ethers.provider.getBalance(alice.address)) - alicePre;
  const expected  = STAKE_WEI * 3n;
  step(`Alice received ${fmt(aliceGain)} (expected ${fmt(expected)}) ${aliceGain === expected ? "✅" : "❌"}`);
}

/**
 * Scenario 4 — Nobody wins (all forfeit).
 */
async function scenario4_nobodyWins(escrow, wallets, compId) {
  section(`Scenario 4 — Nobody wins: all forfeit  [comp ${compId}]`);

  const { owner, alice, bob } = wallets;
  const startTime    = nowPlus(30);
  const endTime      = nowPlus(90);
  const joinDeadline = nowPlus(60);

  await escrow.createCompetition({
    name:         `Sim-4: Nobody Wins (comp ${compId})`,
    stakeToken:   ethers.ZeroAddress,
    stakeAmount:  STAKE_WEI,
    totalWeeks:   1,
    startTime,
    endTime,
    joinDeadline,
    yieldEnabled: false,
    metadataCID:  "QmSim4",
  });

  await waitUntil(startTime + 1, "startTime");

  let tx;
  tx = await escrow.connect(alice).joinCompetition(compId, { value: STAKE_WEI });
  await tx.wait();
  tx = await escrow.connect(bob).joinCompetition(compId, { value: STAKE_WEI });
  await tx.wait();
  step("Alice and Bob joined");

  tx = await escrow.connect(alice).forfeit(compId);
  await tx.wait();
  tx = await escrow.connect(bob).forfeit(compId);
  await tx.wait();
  step("Alice and Bob both forfeited voluntarily");

  const escrowAddr    = await escrow.getAddress();
  const escrowBalPre  = await ethers.provider.getBalance(escrowAddr);

  await waitUntil(endTime, "endTime");
  tx = await escrow.settleCompetition(compId, "QmSim4-Leaderboard");
  await tx.wait();
  step("Competition settled ✅");

  const comp          = await escrow.getCompetition(compId);
  const escrowBalPost = await ethers.provider.getBalance(escrowAddr);

  step(`winnerCount = ${comp.winnerCount} (expected 0) ${comp.winnerCount === 0n ? "✅" : "❌"}`);
  step(`potBalance  = ${comp.potBalance} (expected 0) ${comp.potBalance === 0n ? "✅" : "❌"}`);
  step(`ETH remains in escrow: ${fmt(escrowBalPost)} (funds trapped until rescue)`);
}

/**
 * Scenario 5 — Rounding / dust (ETH).
 */
async function scenario5_dustCase(escrow, wallets, compId) {
  section(`Scenario 5 — Rounding dust: remainder to owner  [comp ${compId}]`);

  const { owner, alice, bob, carol, dave } = wallets;
  const startTime    = nowPlus(30);
  const endTime      = nowPlus(90);
  const joinDeadline = nowPlus(60);

  // 4 entrants × STAKE_WEI → 4*STAKE_WEI pot; 1 forfeits, 3 win.
  // Dust = (4*STAKE_WEI) % 3.
  await escrow.createCompetition({
    name:         `Sim-5: Dust Case (comp ${compId})`,
    stakeToken:   ethers.ZeroAddress,
    stakeAmount:  STAKE_WEI,
    totalWeeks:   1,
    startTime,
    endTime,
    joinDeadline,
    yieldEnabled: false,
    metadataCID:  "QmSim5",
  });

  await waitUntil(startTime + 1, "startTime");

  for (const signer of [alice, bob, carol, dave]) {
    const tx = await escrow.connect(signer).joinCompetition(compId, { value: STAKE_WEI });
    await tx.wait();
    await sleep(TX_PAUSE_MS);
  }
  step("Alice, Bob, Carol, Dave all joined");

  let tx;
  tx = await escrow.connect(alice).submitReport(compId, "QmAliceSim5");
  await tx.wait();
  tx = await escrow.connect(bob).submitReport(compId, "QmBobSim5");
  await tx.wait();
  tx = await escrow.connect(carol).submitReport(compId, "QmCarolSim5");
  await tx.wait();
  tx = await escrow.connect(dave).forfeit(compId);
  await tx.wait();
  step("Alice/Bob/Carol completed; Dave forfeited");

  const pot      = STAKE_WEI * 4n;
  const share    = pot / 3n;
  const dust     = pot - share * 3n;

  const preBals = {};
  for (const [name, signer] of [["alice", alice], ["bob", bob], ["carol", carol], ["owner", owner]]) {
    preBals[name] = await ethers.provider.getBalance(signer.address);
  }

  await waitUntil(endTime, "endTime");
  tx = await escrow.settleCompetition(compId, "QmSim5-Leaderboard");
  await tx.wait();
  step("Competition settled ✅");

  for (const [name, signer] of [["Alice", alice], ["Bob", bob], ["Carol", carol]]) {
    const post = await ethers.provider.getBalance(signer.address);
    const gain = post - preBals[name.toLowerCase()];
    step(`${name} received ${fmt(gain)} (expected ${fmt(share)}) ${gain === share ? "✅" : "❌"}`);
  }
  step(`Dust = ${dust} wei (sent to owner on settlement)`);
}

/**
 * Scenario 6 — ERC-20: all complete → equal split.
 */
async function scenario6_erc20AllComplete(escrow, token, wallets, compId) {
  section(`Scenario 6 — ERC-20 all complete: equal split  [comp ${compId}]`);

  const { owner, alice, bob } = wallets;
  const tokenAddr  = await token.getAddress();
  const escrowAddr = await escrow.getAddress();
  const stake      = ethers.parseEther("10"); // 10 SIM tokens each

  const startTime    = nowPlus(30);
  const endTime      = nowPlus(90);
  const joinDeadline = nowPlus(60);

  await escrow.createCompetition({
    name:         `Sim-6: ERC-20 All Complete (comp ${compId})`,
    stakeToken:   tokenAddr,
    stakeAmount:  stake,
    totalWeeks:   1,
    startTime,
    endTime,
    joinDeadline,
    yieldEnabled: false,
    metadataCID:  "QmSim6",
  });

  // Fund and approve.
  for (const signer of [alice, bob]) {
    await (await token.transfer(signer.address, stake)).wait();
    await (await token.connect(signer).approve(escrowAddr, stake)).wait();
  }
  step("Alice and Bob funded with SIM tokens");

  await waitUntil(startTime + 1, "startTime");

  let tx;
  tx = await escrow.connect(alice).joinCompetition(compId);
  await tx.wait();
  tx = await escrow.connect(bob).joinCompetition(compId);
  await tx.wait();
  step("Alice and Bob joined");

  tx = await escrow.connect(alice).submitReport(compId, "QmAliceSim6");
  await tx.wait();
  tx = await escrow.connect(bob).submitReport(compId, "QmBobSim6");
  await tx.wait();
  step("Alice and Bob completed their reports");

  const alicePre = await token.balanceOf(alice.address);
  const bobPre   = await token.balanceOf(bob.address);

  await waitUntil(endTime, "endTime");
  tx = await escrow.settleCompetition(compId, "QmSim6-Leaderboard");
  await tx.wait();
  step("Competition settled ✅");

  for (const [name, signer, pre] of [["Alice", alice, alicePre], ["Bob", bob, bobPre]]) {
    const gain = (await token.balanceOf(signer.address)) - pre;
    step(`${name} received ${ethers.formatEther(gain)} SIM (expected ${ethers.formatEther(stake)}) ${gain === stake ? "✅" : "❌"}`);
  }
}

/**
 * Scenario 7 — ERC-20: single winner takes all.
 */
async function scenario7_erc20SingleWinner(escrow, token, wallets, compId) {
  section(`Scenario 7 — ERC-20 single winner takes all  [comp ${compId}]`);

  const { owner, alice, bob, carol } = wallets;
  const tokenAddr  = await token.getAddress();
  const escrowAddr = await escrow.getAddress();
  const stake      = ethers.parseEther("10");

  const startTime    = nowPlus(30);
  const endTime      = nowPlus(90);
  const joinDeadline = nowPlus(60);

  await escrow.createCompetition({
    name:         `Sim-7: ERC-20 Single Winner (comp ${compId})`,
    stakeToken:   tokenAddr,
    stakeAmount:  stake,
    totalWeeks:   1,
    startTime,
    endTime,
    joinDeadline,
    yieldEnabled: false,
    metadataCID:  "QmSim7",
  });

  for (const signer of [alice, bob, carol]) {
    await (await token.transfer(signer.address, stake)).wait();
    await (await token.connect(signer).approve(escrowAddr, stake)).wait();
  }

  await waitUntil(startTime + 1, "startTime");

  for (const signer of [alice, bob, carol]) {
    const tx = await escrow.connect(signer).joinCompetition(compId);
    await tx.wait();
    await sleep(TX_PAUSE_MS);
  }
  step("Alice, Bob, Carol joined");

  let tx;
  tx = await escrow.connect(alice).submitReport(compId, "QmAliceSim7");
  await tx.wait();
  tx = await escrow.connect(bob).forfeit(compId);
  await tx.wait();
  // Carol doesn't report (auto-forfeited at settle).
  step("Alice completed; Bob forfeited; Carol did nothing");

  const alicePre = await token.balanceOf(alice.address);
  await waitUntil(endTime, "endTime");
  tx = await escrow.settleCompetition(compId, "QmSim7-Leaderboard");
  await tx.wait();
  step("Competition settled ✅");

  const aliceGain = (await token.balanceOf(alice.address)) - alicePre;
  const expected  = stake * 3n;
  step(`Alice received ${ethers.formatEther(aliceGain)} SIM (expected ${ethers.formatEther(expected)}) ${aliceGain === expected ? "✅" : "❌"}`);
}

/**
 * Scenario 8 — Cancelled ETH competition: full refund.
 */
async function scenario8_cancelled(escrow, wallets, compId) {
  section(`Scenario 8 — Cancelled competition: full ETH refund  [comp ${compId}]`);

  const { owner, alice, bob, carol } = wallets;
  const startTime    = nowPlus(30);
  const endTime      = nowPlus(3600);  // 1 hour; we cancel before
  const joinDeadline = nowPlus(600);

  await escrow.createCompetition({
    name:         `Sim-8: Cancel & Refund (comp ${compId})`,
    stakeToken:   ethers.ZeroAddress,
    stakeAmount:  STAKE_WEI,
    totalWeeks:   4,
    startTime,
    endTime,
    joinDeadline,
    yieldEnabled: false,
    metadataCID:  "QmSim8",
  });

  await waitUntil(startTime + 1, "startTime");

  for (const signer of [alice, bob, carol]) {
    const tx = await escrow.connect(signer).joinCompetition(compId, { value: STAKE_WEI });
    await tx.wait();
    await sleep(TX_PAUSE_MS);
  }
  step("Alice, Bob, Carol joined");

  const preBals = {};
  for (const [name, signer] of [["alice", alice], ["bob", bob], ["carol", carol]]) {
    preBals[name] = await ethers.provider.getBalance(signer.address);
  }

  const tx = await escrow.cancelCompetition(compId);
  await tx.wait();
  step("Competition cancelled by admin");

  for (const [name, signer] of [["Alice", alice], ["Bob", bob], ["Carol", carol]]) {
    const gain = (await ethers.provider.getBalance(signer.address)) - preBals[name.toLowerCase()];
    step(`${name} refund: ${fmt(gain)} (expected ${fmt(STAKE_WEI)}) ${gain === STAKE_WEI ? "✅" : "❌"}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  section("🤖  StreakBot Simulation — Starting");

  // ── Signers / Wallets ──────────────────────────────────────────────────────
  const signers = await ethers.getSigners();
  if (signers.length < 5) {
    throw new Error(
      "Need at least 5 signers (owner + Alice + Bob + Carol + Dave). " +
      "On Hardhat local they are auto-generated. " +
      "On a live network add HD_MNEMONIC to .env and configure multiple accounts."
    );
  }

  const [owner, alice, bob, carol, dave] = signers;
  const wallets = { owner, alice, bob, carol, dave };

  console.log("\n📋  Wallets:");
  for (const [name, signer] of Object.entries(wallets)) {
    await logBalance(name, signer.address);
  }

  // ── Deploy Contracts ───────────────────────────────────────────────────────
  section("📦  Deploying contracts");
  const escrow = await deployEscrow(owner);
  const token  = await deployMockToken(owner, await escrow.getAddress());

  // ── Fund test wallets (on local Hardhat they're already rich) ─────────────
  const minBal  = STAKE_WEI * 20n;  // keep at least 20× stake per wallet
  const fundAmt = STAKE_WEI * 50n;  // fund 50× stake when low
  for (const [name, signer] of [["Alice", alice], ["Bob", bob], ["Carol", carol], ["Dave", dave]]) {
    await ensureFunded(owner, signer, fundAmt, minBal);
  }

  // ── Run Scenarios ──────────────────────────────────────────────────────────
  let compId = 0;

  await scenario1_allComplete(escrow, wallets, compId++);
  await sleep(TX_PAUSE_MS);

  await scenario2_voluntaryForfeit(escrow, wallets, compId++);
  await sleep(TX_PAUSE_MS);

  await scenario3_autoForfeit(escrow, wallets, compId++);
  await sleep(TX_PAUSE_MS);

  await scenario4_nobodyWins(escrow, wallets, compId++);
  await sleep(TX_PAUSE_MS);

  await scenario5_dustCase(escrow, wallets, compId++);
  await sleep(TX_PAUSE_MS);

  await scenario6_erc20AllComplete(escrow, token, wallets, compId++);
  await sleep(TX_PAUSE_MS);

  await scenario7_erc20SingleWinner(escrow, token, wallets, compId++);
  await sleep(TX_PAUSE_MS);

  await scenario8_cancelled(escrow, wallets, compId++);

  // ── Final Summary ──────────────────────────────────────────────────────────
  section("🎉  Simulation Complete");
  console.log(`\n  StreakBetEscrow : ${await escrow.getAddress()}`);
  console.log(`  MockERC20       : ${await token.getAddress()}`);
  console.log(`  Total comps run : ${compId}`);
  console.log("\n  Check each scenario above for ✅/❌ payout validation.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌  Simulation failed:", err);
    process.exit(1);
  });
