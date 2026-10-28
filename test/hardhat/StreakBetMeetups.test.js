const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const DAY = 24 * 60 * 60;
const AWARD_IDS = { completion: 10, first: 11, second: 12, third: 13 };
const MEETUP_DAYS = [5, 12, 19, 29];
const INVITE_CODES = ['first-week', 'second-week', 'third-week', 'fourth-week'];

describe('StreakBetEscrow monthly meetup challenge', function () {
  let owner, alice, bob, carol, dave;
  let token, treasury, nft, escrow;
  let startTime;

  async function createMonthlyChallenge() {
    startTime = Number(await time.latest()) + 300;
    await escrow.createCompetition({
      name: '30-Day Water Streak',
      stakeToken: await token.getAddress(),
      stakeAmount: ethers.parseEther('100'),
      totalWeeks: 4,
      startTime,
      endTime: startTime + 30 * DAY,
      joinDeadline: startTime,
      yieldEnabled: false,
      metadataCID: 'habit:hydration',
    });
    await escrow.configureStreakChallenge(0, 'hydration', 'drink 1 liter together', 28, 4, 5, 1000);
  }

  async function configureMeetups() {
    for (let index = 0; index < MEETUP_DAYS.length; index += 1) {
      const opensAt = startTime + MEETUP_DAYS[index] * DAY;
      await escrow.scheduleMeetup(
        0,
        index,
        opensAt,
        opensAt + 60 * 60,
        ethers.keccak256(ethers.toUtf8Bytes(INVITE_CODES[index])),
        `https://meet.example/streak-${index + 1}`
      );
    }
  }

  async function join(account) {
    const stake = ethers.parseEther('100');
    await token.transfer(account.address, stake);
    await token.connect(account).approve(await escrow.getAddress(), stake);
    await escrow.connect(account).joinCompetition(0);
  }

  async function attendMeetup(index, accounts, activityDaysFor) {
    const opensAt = startTime + MEETUP_DAYS[index] * DAY;
    if (Number(await time.latest()) < opensAt + 1) await time.increaseTo(opensAt + 1);
    for (const account of accounts) {
      await escrow.connect(account).selfCheckInMeetup(
        0,
        index,
        INVITE_CODES[index],
        activityDaysFor(account),
        7,
        true,
        ethers.id(`private-progress:${index}:${account.address}`)
      );
    }
    for (let accountIndex = 0; accountIndex < accounts.length; accountIndex += 1) {
      const attendee = accounts[accountIndex];
      const peer = accounts[(accountIndex + 1) % accounts.length];
      await escrow.connect(peer).reviewMeetupAttendance(0, index, attendee.address, true);
    }
  }

  beforeEach(async function () {
    [owner, alice, bob, carol, dave] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('MockERC20');
    token = await Token.deploy('BigNuten', 'BNUT', ethers.parseEther('100000'));
    const Treasury = await ethers.getContractFactory('BigNutenTreasury');
    treasury = await Treasury.deploy(await token.getAddress(), owner.address);
    const NFT = await ethers.getContractFactory('MockStreakAwardNFT');
    nft = await NFT.deploy(owner.address);
    const Pool = await ethers.getContractFactory('MockAavePool');
    const pool = await Pool.deploy();
    const Streak = await ethers.getContractFactory('StreakBetEscrow');
    escrow = await Streak.deploy(owner.address, await pool.getAddress());

    await escrow.setChallengeStakeToken(await token.getAddress());
    await escrow.setChallengeTreasury(await treasury.getAddress());
    for (const tokenId of Object.values(AWARD_IDS)) await nft.registerAchievement(tokenId);
    await nft.grantMinter(await escrow.getAddress());
    await escrow.setStreakAwards(await nft.getAddress(), AWARD_IDS.completion, AWARD_IDS.first, AWARD_IDS.second, AWARD_IDS.third);
  });

  it('requires daily progress, the live invite code, a one-liter attestation, and peer review', async function () {
    await createMonthlyChallenge();
    await configureMeetups();
    await join(alice);
    await join(bob);
    await time.increaseTo(startTime + MEETUP_DAYS[0] * DAY + 1);

    await expect(escrow.connect(alice).selfCheckInMeetup(0, 0, 'wrong', 5, 4, true, ethers.id('progress')))
      .to.be.revertedWithCustomError(escrow, 'InvalidMeetupAction');
    await expect(escrow.connect(alice).selfCheckInMeetup(0, 0, INVITE_CODES[0], 5, 5, false, ethers.id('progress')))
      .to.be.revertedWithCustomError(escrow, 'InvalidMeetupAction');

    await escrow.connect(alice).selfCheckInMeetup(0, 0, INVITE_CODES[0], 5, 5, true, ethers.id('alice-progress'));
    await expect(escrow.connect(bob).reviewMeetupAttendance(0, 0, alice.address, true))
      .to.be.revertedWithCustomError(escrow, 'InvalidPeerReview');
    await escrow.connect(bob).selfCheckInMeetup(0, 0, INVITE_CODES[0], 5, 5, true, ethers.id('bob-progress'));
    await escrow.connect(bob).reviewMeetupAttendance(0, 0, alice.address, true);
    const entrant = await escrow.getStreakEntrant(0, alice.address);
    expect(entrant.verifiedMeetups).to.equal(1n);
    expect(entrant.status).to.equal(0n);
    await expect(escrow.connect(alice).submitReport(0, 'ipfs://bafy-progress-report'))
      .to.emit(escrow, 'WeeklyReport')
      .withArgs(0n, alice.address, 1n, 'ipfs://bafy-progress-report');
  });

  it('completes only after four unique peer-approved meetups and 28 activity days', async function () {
    await createMonthlyChallenge();
    await configureMeetups();
    await join(alice);
    await join(bob);
    for (let index = 0; index < 3; index += 1) {
      await attendMeetup(index, [alice, bob], account => (index + 1) * 7);
    }
    expect((await escrow.getStreakEntrant(0, alice.address)).status).to.equal(0n);
    await attendMeetup(3, [alice, bob], () => 28);
    const entrant = await escrow.getStreakEntrant(0, alice.address);
    expect(entrant.verifiedMeetups).to.equal(4n);
      expect(entrant.verifiedActivityDays).to.equal(28n);
    expect(entrant.status).to.equal(1n);
      expect((await escrow.getStreakEntrant(0, bob.address)).status).to.equal(1n);
      expect((await escrow.getCompetition(0)).winnerCount).to.equal(2n);
  });

  it('keeps a disputed two-person review open until a captain-approved guest breaks the tie', async function () {
    await createMonthlyChallenge();
    await configureMeetups();
    await join(alice);
    await join(bob);
    await time.increaseTo(startTime + MEETUP_DAYS[0] * DAY + 1);
    for (const account of [alice, bob]) {
      await escrow.connect(account).selfCheckInMeetup(0, 0, INVITE_CODES[0], 5, 5, true, ethers.id(`${account.address}:progress`));
    }
    await escrow.connect(bob).reviewMeetupAttendance(0, 0, alice.address, false);
    let entrant = await escrow.getStreakEntrant(0, alice.address);
    expect(entrant.disqualified).to.equal(false);
    expect(entrant.status).to.equal(0n);
    await escrow.inviteMeetupReviewer(0, 0, alice.address, carol.address);
    await escrow.connect(carol).reviewMeetupAttendance(0, 0, alice.address, true);
    entrant = await escrow.getStreakEntrant(0, alice.address);
    expect(entrant.disqualified).to.equal(false);
    expect(entrant.verifiedMeetups).to.equal(1n);
    expect(await escrow.meetupReviewerInvited(0, 0, alice.address, carol.address)).to.equal(true);
  });

  it('uses the majority of claimant and peer votes for three-person review', async function () {
    await createMonthlyChallenge();
    await configureMeetups();
    for (const account of [alice, bob, carol]) await join(account);
    await time.increaseTo(startTime + MEETUP_DAYS[0] * DAY + 1);
    for (const account of [alice, bob, carol]) {
      await escrow.connect(account).selfCheckInMeetup(0, 0, INVITE_CODES[0], 5, 5, true, ethers.id(`${account.address}:progress`));
    }
    await escrow.connect(bob).reviewMeetupAttendance(0, 0, alice.address, false);
    await escrow.connect(carol).reviewMeetupAttendance(0, 0, alice.address, true);
    const entrant = await escrow.getStreakEntrant(0, alice.address);
    expect(entrant.disqualified).to.equal(false);
    expect(entrant.verifiedMeetups).to.equal(1n);
  });

  it('automatically trusts a solo entrant self-check-in', async function () {
    await createMonthlyChallenge();
    await configureMeetups();
    await join(alice);
    await time.increaseTo(startTime + MEETUP_DAYS[0] * DAY + 1);
    await escrow.connect(alice).selfCheckInMeetup(0, 0, INVITE_CODES[0], 5, 5, true, ethers.id('alice-solo-progress'));
    const attendance = await escrow.meetupAttendance(0, 0, alice.address);
    const entrant = await escrow.getStreakEntrant(0, alice.address);
    expect(attendance.peerApproved).to.equal(true);
    expect(entrant.verifiedMeetups).to.equal(1n);
  });

  it('ranks completed participants by activity progress then awards reusable DNFTs and BNUT payouts', async function () {
    await createMonthlyChallenge();
    await configureMeetups();
    const accounts = [alice, bob, carol, dave];
    for (const account of accounts) await join(account);

    for (let index = 0; index < 4; index += 1) {
      const day = MEETUP_DAYS[index];
      await attendMeetup(index, accounts, account => {
        const indexOf = accounts.indexOf(account);
        const finalDays = [30, 29, 28, 27][indexOf];
        return Math.min(day + 1, finalDays);
      });
    }

    const before = await Promise.all(accounts.map(account => token.balanceOf(account.address)));
    await time.increaseTo(startTime + 30 * DAY);
    await escrow.settleCompetition(0, 'leaderboard-cid');

    expect(await token.balanceOf(alice.address) - before[0]).to.equal(ethers.parseEther('175'));
    expect(await token.balanceOf(bob.address) - before[1]).to.equal(ethers.parseEther('150'));
    expect(await token.balanceOf(carol.address) - before[2]).to.equal(ethers.parseEther('75'));
    expect(await nft.balanceOf(alice.address, AWARD_IDS.first)).to.equal(1n);
    expect(await nft.balanceOf(bob.address, AWARD_IDS.second)).to.equal(1n);
    expect(await nft.balanceOf(carol.address, AWARD_IDS.third)).to.equal(1n);
    expect(await nft.balanceOf(dave.address, AWARD_IDS.completion)).to.equal(0n);
  });

  it('sends the pool to the configured treasury when no participant completes', async function () {
    await createMonthlyChallenge();
    await configureMeetups();
    await join(alice);
    await time.increaseTo(startTime + 30 * DAY);
    await escrow.settleCompetition(0, '');
    expect(await treasury.getBalance()).to.equal(ethers.parseEther('100'));
  });

  it('supports another habit type by configuration without a new escrow contract', async function () {
    await createMonthlyChallenge();
    await escrow.configureStreakChallenge(0, 'exercise', 'complete a set together', 20, 4, 3, 1);
    const challenge = await escrow.getStreakChallenge(0);
    expect(challenge.habitType).to.equal('exercise');
    expect(challenge.requiredActivityDays).to.equal(20n);
    expect(challenge.minimumWeeklyLogs).to.equal(3n);
  });
});
