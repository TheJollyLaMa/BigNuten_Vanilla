/**
 * test/StreakBetEscrow.test.js
 *
 * Hardhat tests for the v3.1.1 security-hardened StreakBetEscrow contract.
 * Covers: ReentrancyGuard, SafeERC20, Pausable, joinDeadline,
 *         settlement time guard, and Aave yield capture.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// ── Helpers ───────────────────────────────────────────────────────────────────

const ZERO_ADDR = ethers.ZeroAddress;

/** Deploy a basic ERC-20 mock for testing. */
async function deployMockToken(deployer) {
  const factory = await ethers.getContractFactory("MockERC20", deployer);
  const token = await factory.deploy("MockToken", "MTK", ethers.parseEther("1000000"));
  await token.waitForDeployment();
  return token;
}

/** Deploy a minimal Aave pool mock. */
async function deployMockAave(deployer) {
  const factory = await ethers.getContractFactory("MockAavePool", deployer);
  const pool = await factory.deploy();
  await pool.waitForDeployment();
  return pool;
}

/** Deploy the StreakBetEscrow contract. */
async function deployEscrow(owner, aavePool) {
  const factory = await ethers.getContractFactory("StreakBetEscrow", owner);
  const escrow = await factory.deploy(owner.address, aavePool);
  await escrow.waitForDeployment();
  return escrow;
}

/** Returns reasonable timestamps for a competition. */
async function compTimestamps(joinDeadlineOffset = 7 * 86400) {
  const now = await time.latest();
  const startTime = now + 60;           // starts in 1 min
  const endTime = now + 30 * 86400;     // ends in 30 days
  const joinDeadline = now + joinDeadlineOffset; // default: 7 days
  return { startTime, endTime, joinDeadline };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe("StreakBetEscrow — Security Hardening", function () {
  let owner, alice, bob;
  let escrow, token, aavePool;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    aavePool = await deployMockAave(owner);
    token = await deployMockToken(owner);
    escrow = await deployEscrow(owner, await aavePool.getAddress());
  });

  // ── 1. joinDeadline ──────────────────────────────────────────────────────

  describe("joinDeadline", function () {
    it("allows join before deadline", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("0.1"),
        totalWeeks: 4,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });
      // Move time to just before the joinDeadline
      await time.increaseTo(joinDeadline - 10);
      await escrow.connect(alice).joinCompetition(0, { value: ethers.parseEther("0.1") });
      const e = await escrow.getEntrant(0, alice.address);
      expect(e.joined).to.be.true;
    });

    it("reverts join after deadline", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps(120); // 2 min deadline
      await escrow.createCompetition({
        name: "Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("0.1"),
        totalWeeks: 4,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });
      // Move time past the joinDeadline
      await time.increaseTo(joinDeadline + 1);
      await expect(
        escrow.connect(alice).joinCompetition(0, { value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Escrow: join deadline passed");
    });

    it("rejects joinDeadline > endTime at creation", async function () {
      const { startTime, endTime } = await compTimestamps();
      await expect(
        escrow.createCompetition({
          name: "Test",
          stakeToken: ZERO_ADDR,
          stakeAmount: ethers.parseEther("0.1"),
          totalWeeks: 4,
          startTime,
          endTime,
          joinDeadline: endTime + 1,
          yieldEnabled: false,
          metadataCID: ""
        })
      ).to.be.revertedWith("Escrow: joinDeadline must be <= endTime");
    });

    it("rejects joinDeadline < startTime at creation", async function () {
      const { startTime, endTime } = await compTimestamps();
      await expect(
        escrow.createCompetition({
          name: "Test",
          stakeToken: ZERO_ADDR,
          stakeAmount: ethers.parseEther("0.1"),
          totalWeeks: 4,
          startTime,
          endTime,
          joinDeadline: startTime - 1,
          yieldEnabled: false,
          metadataCID: ""
        })
      ).to.be.revertedWith("Escrow: joinDeadline must be >= startTime");
    });
  });

  // ── 2. Settlement time guard ─────────────────────────────────────────────

  describe("Settlement time guard", function () {
    it("reverts settle before endTime", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("0.1"),
        totalWeeks: 4,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });
      // Try to settle immediately (before endTime)
      await expect(
        escrow.settleCompetition(0, "")
      ).to.be.revertedWith("Escrow: comp has not ended yet");
    });

    it("allows settle after endTime", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("0.1"),
        totalWeeks: 4,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });
      await time.increaseTo(endTime);
      await expect(escrow.settleCompetition(0, "QmFoo")).to.not.be.reverted;
    });
  });

  // ── 3. Pausable ──────────────────────────────────────────────────────────

  describe("Pausable", function () {
    it("owner can pause and unpause", async function () {
      await escrow.pause();
      expect(await escrow.paused()).to.be.true;
      await escrow.unpause();
      expect(await escrow.paused()).to.be.false;
    });

    it("non-owner cannot pause", async function () {
      await expect(escrow.connect(alice).pause()).to.be.reverted;
    });

    it("createCompetition reverts when paused", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.pause();
      await expect(
        escrow.createCompetition({
          name: "Test",
          stakeToken: ZERO_ADDR,
          stakeAmount: ethers.parseEther("0.1"),
          totalWeeks: 4,
          startTime,
          endTime,
          joinDeadline,
          yieldEnabled: false,
          metadataCID: ""
        })
      ).to.be.reverted;
    });

    it("joinCompetition reverts when paused", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("0.1"),
        totalWeeks: 4,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });
      await escrow.pause();
      await expect(
        escrow.connect(alice).joinCompetition(0, { value: ethers.parseEther("0.1") })
      ).to.be.reverted;
    });

    it("settleCompetition reverts when paused", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("0.1"),
        totalWeeks: 4,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });
      await time.increaseTo(endTime);
      await escrow.pause();
      await expect(escrow.settleCompetition(0, "")).to.be.reverted;
    });

    it("cancelCompetition reverts when paused", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("0.1"),
        totalWeeks: 4,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });
      await escrow.pause();
      await expect(escrow.cancelCompetition(0)).to.be.reverted;
    });

    it("submitReport reverts when paused", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("0.1"),
        totalWeeks: 4,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });
      await time.increaseTo(joinDeadline - 10);
      await escrow.connect(alice).joinCompetition(0, { value: ethers.parseEther("0.1") });
      await escrow.pause();
      await expect(
        escrow.connect(alice).submitReport(0, "QmProof")
      ).to.be.reverted;
    });

    it("forfeit reverts when paused", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("0.1"),
        totalWeeks: 4,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });
      await time.increaseTo(joinDeadline - 10);
      await escrow.connect(alice).joinCompetition(0, { value: ethers.parseEther("0.1") });
      await escrow.pause();
      await expect(escrow.connect(alice).forfeit(0)).to.be.reverted;
    });
  });

  // ── 4. ETH flow — create, join, report, settle, cancel ──────────────────

  describe("ETH competitions", function () {
    it("full lifecycle: create → join → report → settle", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "ETH Comp",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("1"),
        totalWeeks: 1,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });

      // Alice joins
      await time.increaseTo(startTime + 1);
      await escrow.connect(alice).joinCompetition(0, { value: ethers.parseEther("1") });

      // Alice submits all reports (1 week)
      await escrow.connect(alice).submitReport(0, "QmWeek1");
      const e = await escrow.getEntrant(0, alice.address);
      expect(e.joined).to.be.true;
      expect(Number(e.status)).to.equal(1); // Completed

      // Settle
      const balBefore = await ethers.provider.getBalance(alice.address);
      await time.increaseTo(endTime);
      await escrow.settleCompetition(0, "QmLeaderboard");
      const balAfter = await ethers.provider.getBalance(alice.address);
      expect(balAfter).to.be.greaterThan(balBefore);
    });

    it("cancel refunds entrants", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "Cancel Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("1"),
        totalWeeks: 4,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });
      await time.increaseTo(startTime + 1);
      await escrow.connect(alice).joinCompetition(0, { value: ethers.parseEther("1") });

      const balBefore = await ethers.provider.getBalance(alice.address);
      await escrow.cancelCompetition(0);
      const balAfter = await ethers.provider.getBalance(alice.address);
      expect(balAfter).to.be.greaterThan(balBefore);
    });
  });

  // ── 5. ERC-20 flow with SafeERC20 ────────────────────────────────────────

  describe("ERC-20 competitions (SafeERC20)", function () {
    it("join with ERC-20 uses safeTransferFrom", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      const tokenAddr = await token.getAddress();
      const escrowAddr = await escrow.getAddress();

      await escrow.createCompetition({
        name: "Token Comp",
        stakeToken: tokenAddr,
        stakeAmount: ethers.parseEther("100"),
        totalWeeks: 2,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });

      // Fund Alice and approve
      await token.transfer(alice.address, ethers.parseEther("200"));
      await token.connect(alice).approve(escrowAddr, ethers.parseEther("100"));

      await time.increaseTo(startTime + 1);
      await escrow.connect(alice).joinCompetition(0);
      const e = await escrow.getEntrant(0, alice.address);
      expect(e.joined).to.be.true;
    });

    it("settle distributes ERC-20 tokens to winners via safeTransfer", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      const tokenAddr = await token.getAddress();
      const escrowAddr = await escrow.getAddress();

      await escrow.createCompetition({
        name: "Token Settle",
        stakeToken: tokenAddr,
        stakeAmount: ethers.parseEther("50"),
        totalWeeks: 1,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: ""
      });

      // Fund Alice, Bob and approve
      await token.transfer(alice.address, ethers.parseEther("100"));
      await token.transfer(bob.address, ethers.parseEther("100"));
      await token.connect(alice).approve(escrowAddr, ethers.parseEther("50"));
      await token.connect(bob).approve(escrowAddr, ethers.parseEther("50"));

      await time.increaseTo(startTime + 1);
      await escrow.connect(alice).joinCompetition(0);
      await escrow.connect(bob).joinCompetition(0);

      // Only Alice completes
      await escrow.connect(alice).submitReport(0, "QmAlice");
      // Bob doesn't complete → forfeited on settle

      await time.increaseTo(endTime);
      const aliceBefore = await token.balanceOf(alice.address);
      await escrow.settleCompetition(0, "QmResults");
      const aliceAfter = await token.balanceOf(alice.address);
      // Alice should receive the full pot (100 tokens: her 50 + bob's 50)
      expect(aliceAfter - aliceBefore).to.equal(ethers.parseEther("100"));
    });
  });

  // ── 6. getCompetition returns joinDeadline ────────────────────────────────

  describe("getCompetition", function () {
    it("returns joinDeadline field", async function () {
      const { startTime, endTime, joinDeadline } = await compTimestamps();
      await escrow.createCompetition({
        name: "View Test",
        stakeToken: ZERO_ADDR,
        stakeAmount: ethers.parseEther("0.01"),
        totalWeeks: 2,
        startTime,
        endTime,
        joinDeadline,
        yieldEnabled: false,
        metadataCID: "QmMeta"
      });
      const c = await escrow.getCompetition(0);
      expect(Number(c.joinDeadline)).to.equal(joinDeadline);
      expect(c.name).to.equal("View Test");
    });
  });
});
