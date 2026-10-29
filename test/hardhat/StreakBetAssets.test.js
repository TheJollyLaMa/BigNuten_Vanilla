const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const DAY = 24 * 60 * 60;
const AWARD_IDS = [10, 11, 12, 13];

describe('StreakBetEscrow competition assets', function () {
  let owner, alice, bob;
  let escrow, nft, nativeTreasury;

  async function deployFixture(stakeToken, treasury) {
    const Pool = await ethers.getContractFactory('MockAavePool');
    const pool = await Pool.deploy();
    const NFT = await ethers.getContractFactory('MockStreakAwardNFT');
    nft = await NFT.deploy(owner.address);
    for (const id of AWARD_IDS) await nft.registerAchievement(id);

    const Escrow = await ethers.getContractFactory('StreakBetEscrow');
    escrow = await Escrow.deploy(owner.address, await pool.getAddress());
    await nft.grantMinter(await escrow.getAddress());
    await escrow.setChallengeAsset(stakeToken, treasury);
    await escrow.setStreakAwards(await nft.getAddress(), ...AWARD_IDS);
  }

  async function createChallenge(stakeToken, stakeAmount) {
    const startTime = Number(await time.latest()) + 600;
    await escrow.createCompetition({
      name: 'Local asset rehearsal',
      stakeToken,
      stakeAmount,
      totalWeeks: 1,
      startTime,
      endTime: startTime + 30 * DAY,
      joinDeadline: startTime + DAY,
      yieldEnabled: false,
      metadataCID: 'local-only',
    });
    await escrow.configureStreakChallenge(0, 'hydration', 'sample goal', 1, 1, 1, 1);
    await escrow.scheduleMeetup(
      0,
      0,
      startTime + DAY,
      startTime + DAY + 3600,
      ethers.id('local-week'),
      'https://meet.example/local'
    );
    return startTime;
  }

  async function completeWithPeer(startTime) {
    await time.increaseTo(startTime + DAY + 1);
    await escrow.connect(alice).selfCheckInMeetup(
      0, 0, 'local-week', 1, 1, true, ethers.id('local-summary')
    );
    await escrow.connect(bob).selfCheckInMeetup(
      0, 0, 'local-week', 1, 1, true, ethers.id('peer-summary')
    );
    await escrow.connect(bob).reviewMeetupAttendance(0, 0, alice.address, true);
    expect(Number((await escrow.getStreakEntrant(0, alice.address)).status)).to.equal(1);
    await expect(escrow.connect(alice).submitReport(0, ''))
      .to.emit(escrow, 'WeeklyReport').withArgs(0, alice.address, 1, '');
    expect((await escrow.getStreakEntrant(0, alice.address)).reportsSubmitted).to.equal(1n);
  }

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const Treasury = await ethers.getContractFactory('MockNativeTreasury');
    nativeTreasury = await Treasury.deploy();
  });

  it('settles an ETH streak pot with exact native value, a forfeit, and the existing ranked payout math', async function () {
    const stake = ethers.parseEther('0.01');
    await deployFixture(ethers.ZeroAddress, await nativeTreasury.getAddress());
    expect(await escrow.competitionEngineVersion()).to.equal(2n);
    const startTime = await createChallenge(ethers.ZeroAddress, stake);
    await time.increaseTo(startTime + 1);

    await expect(escrow.connect(alice).joinCompetition(0, { value: stake - 1n }))
      .to.be.revertedWith('Escrow: incorrect ETH amount');
    await escrow.connect(alice).joinCompetition(0, { value: stake });
    await escrow.connect(bob).joinCompetition(0, { value: stake });
    await completeWithPeer(startTime);
    await escrow.connect(bob).forfeit(0);

    await time.increaseTo(startTime + 30 * DAY);
    const aliceBefore = await ethers.provider.getBalance(alice.address);
    await escrow.settleCompetition(0, '');
    const aliceAfter = await ethers.provider.getBalance(alice.address);
    expect(aliceAfter - aliceBefore).to.equal(2n * stake);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await nativeTreasury.getAddress())).to.equal(0n);
    expect(await nft.balanceOf(alice.address, AWARD_IDS[0])).to.equal(1n);
    expect((await escrow.getCompetition(0)).potBalance).to.equal(0n);
  });

  it('sends an uncompleted ETH pot to the configured payable treasury', async function () {
    const stake = ethers.parseEther('0.01');
    await deployFixture(ethers.ZeroAddress, await nativeTreasury.getAddress());
    const startTime = await createChallenge(ethers.ZeroAddress, stake);
    await time.increaseTo(startTime + 1);
    await escrow.connect(alice).joinCompetition(0, { value: stake });
    await escrow.connect(bob).joinCompetition(0, { value: stake });
    await escrow.connect(alice).forfeit(0);
    await escrow.connect(bob).forfeit(0);
    await time.increaseTo(startTime + 30 * DAY);

    await expect(escrow.settleCompetition(0, ''))
      .to.emit(escrow, 'CompetitionSettled').withArgs(0, 0, 2n * stake, '');
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await nativeTreasury.getAddress())).to.equal(2n * stake);
  });

  for (const decimals of [18, 6]) {
    it(`settles ERC-20 stakes in raw ${decimals}-decimal units without normalizing the pot`, async function () {
      const unit = 10n ** BigInt(decimals);
      const stake = 100n * unit;
      const Token = await ethers.getContractFactory('MockERC20Decimals');
      const token = await Token.deploy('Local test asset', decimals === 6 ? 'USDC' : 'BNUT', decimals, 1_000_000n * unit);
      const Treasury = await ethers.getContractFactory('BigNutenTreasury');
      const treasury = await Treasury.deploy(await token.getAddress(), owner.address);
      await deployFixture(await token.getAddress(), await treasury.getAddress());
      const startTime = await createChallenge(await token.getAddress(), stake);

      await time.increaseTo(startTime + 1);
      await token.connect(alice).approve(await escrow.getAddress(), stake);
      await expect(escrow.connect(alice).joinCompetition(0)).to.be.reverted;
      await token.transfer(alice.address, stake);
      await token.transfer(bob.address, stake);
      await token.connect(alice).approve(await escrow.getAddress(), stake);
      await token.connect(bob).approve(await escrow.getAddress(), stake);
      await expect(escrow.connect(alice).joinCompetition(0))
        .to.emit(escrow, 'EntrantJoined').withArgs(0, alice.address, stake);
      await expect(escrow.connect(bob).joinCompetition(0))
        .to.emit(escrow, 'EntrantJoined').withArgs(0, bob.address, stake);

      await completeWithPeer(startTime);
      await escrow.connect(bob).forfeit(0);
      await time.increaseTo(startTime + 30 * DAY);
      await expect(escrow.settleCompetition(0, ''))
        .to.emit(escrow, 'StreakPayout').withArgs(0, alice.address, 1, stake, stake, 2n * stake);

      expect(await token.balanceOf(alice.address)).to.equal(2n * stake);
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);
      expect((await escrow.getCompetition(0)).potBalance).to.equal(0n);
    });
  }

  it('rejects an incorrect ETH amount and refunds native principal on cancellation', async function () {
    const stake = ethers.parseEther('0.02');
    await deployFixture(ethers.ZeroAddress, await nativeTreasury.getAddress());
    const startTime = await createChallenge(ethers.ZeroAddress, stake);
    await time.increaseTo(startTime + 1);
    await escrow.connect(alice).joinCompetition(0, { value: stake });
    await escrow.connect(bob).joinCompetition(0, { value: stake });

    const contractAddress = await escrow.getAddress();
    expect(await ethers.provider.getBalance(contractAddress)).to.equal(2n * stake);
    await escrow.cancelCompetition(0);
    expect(await ethers.provider.getBalance(contractAddress)).to.equal(0n);
    expect(await ethers.provider.getBalance(await nativeTreasury.getAddress())).to.equal(0n);
    expect((await escrow.getCompetition(0)).status).to.equal(2n);
  });
});
