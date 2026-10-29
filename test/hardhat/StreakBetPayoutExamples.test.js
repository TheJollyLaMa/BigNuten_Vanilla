const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time, loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe('StreakBet generated rehearsal examples match contract transfers', function () {
  async function fixture(tokenDecimals = 18) {
    const [owner, ...accounts] = await ethers.getSigners();
    const token = tokenDecimals === 18
      ? await (await ethers.getContractFactory('MockERC20')).deploy('Example', 'BNUT', ethers.parseEther('100000'))
      : await (await ethers.getContractFactory('MockERC20Decimals')).deploy('Example', 'TEST', tokenDecimals, ethers.parseEther('100000'));
    const treasury = await (await ethers.getContractFactory('BigNutenTreasury')).deploy(await token.getAddress(), owner.address);
    const nft = await (await ethers.getContractFactory('MockStreakAwardNFT')).deploy(owner.address);
    const escrow = await (await ethers.getContractFactory('StreakBetEscrow')).deploy(owner.address, ethers.ZeroAddress);
    await escrow.setChallengeStakeToken(await token.getAddress());
    await escrow.setChallengeTreasury(await treasury.getAddress());
    for (const id of [10, 11, 12, 13]) await nft.registerAchievement(id);
    await nft.grantMinter(await escrow.getAddress());
    await escrow.setStreakAwards(await nft.getAddress(), 10, 11, 12, 13);
    return { treasury, accounts, token, nft, escrow };
  }
  async function sixDecimalFixture() {
    return fixture(6);
  }

  async function settleAndCheck({ entrants, completed, stake, scores = [], policy = 'ranked-ties', tokenDecimals = 18 }) {
      const { simulateStreakPayouts, PAYOUT_SCENARIOS } = await import('../../js/streakPayouts.mjs');
      if (stake === 100n * 10n ** 18n) {
        expect(PAYOUT_SCENARIOS).to.deep.include({ entrants, completed });
      }
      const expected = simulateStreakPayouts({ entrants, completed, stake, scores, policy });
      const { treasury, accounts, token, nft, escrow } = await loadFixture(
        tokenDecimals === 6 ? sixDecimalFixture : fixture,
      );
      expect(await escrow.competitionEngineVersion()).to.equal(2n);
      expect(await escrow.streakPayoutPolicyVersion()).to.equal(2n);
      const start = Number(await time.latest()) + 300;
      const end = start + 7 * 86400;
      const opens = start + 86400;
      await escrow.createCompetition({
        name: 'Local rehearsal', stakeToken: await token.getAddress(), stakeAmount: stake,
        totalWeeks: 1, startTime: start, endTime: end, joinDeadline: start,
        yieldEnabled: false, metadataCID: 'habit:hydration',
      });
      await escrow.configureStreakChallenge(0, 'hydration', 'example goal', 1, 1, 1, 1);
      await escrow.scheduleMeetup(0, 0, opens, opens + 3600, ethers.id('local-code'), 'https://example.invalid');
      for (const account of accounts.slice(0, entrants)) {
        await token.transfer(account.address, stake);
        await token.connect(account).approve(await escrow.getAddress(), stake);
        await escrow.connect(account).joinCompetition(0);
      }
      await time.increaseTo(opens + 1);
      // Check in everyone before forfeiting so each multi-entrant claim has an eligible peer.
      for (let index = 0; completed > 0 && index < entrants; index++) {
        const activityDays = scores[index]?.verifiedActivityDays ?? entrants - index;
        await escrow.connect(accounts[index]).selfCheckInMeetup(0, 0, 'local-code', activityDays, 1, true, ethers.id(`local-${index}`));
      }
      for (let index = 0; index < completed; index++) {
        if (entrants > 1) {
          await time.increase(1);
          await escrow.connect(accounts[(index + 1) % entrants]).reviewMeetupAttendance(0, 0, accounts[index].address, true);
        }
        for (let report = 0; report < (scores[index]?.reportsSubmitted || 0); report += 1) {
          await escrow.connect(accounts[index]).submitReport(0, '');
        }
      }
      for (let index = completed; index < entrants; index++) await escrow.connect(accounts[index]).forfeit(0);
      await time.increaseTo(end + 1);
      await escrow.settleCompetition(0, 'ipfs://example-leaderboard');
      for (let index = 0; index < entrants; index++) {
        const expectedEntrant = expected.finishers.find(row => row.entrantIndex === index);
        expect(await token.balanceOf(accounts[index].address)).to.equal(expectedEntrant?.payout || 0n);
        expect(await nft.balanceOf(accounts[index].address, 10)).to.equal(expectedEntrant ? 1n : 0n);
        for (const [place, awardId] of [[1, 11], [2, 12], [3, 13]]) {
          expect(await nft.balanceOf(accounts[index].address, awardId))
            .to.equal(expectedEntrant?.place === place ? 1n : 0n);
        }
        if (expectedEntrant) {
          const actualEntrant = await escrow.getStreakEntrant(0, accounts[index].address);
          expect(actualEntrant.place).to.equal(BigInt(expectedEntrant.place));
          expectedEntrant.qualifiedAt = actualEntrant.qualifiedAt;
        }
      }
      if (policy === 'ranked-ties') {
        const tiedRanks = new Map();
        for (const row of expected.finishers) {
          if (!tiedRanks.has(row.rank)) tiedRanks.set(row.rank, []);
          tiedRanks.get(row.rank).push(row);
        }
        for (const group of tiedRanks.values()) {
          if (group.length > 1) {
            expect(new Set(group.map(row => row.qualifiedAt.toString())).size).to.equal(group.length);
          }
        }
      }
      expect(await token.balanceOf(await treasury.getAddress())).to.equal(expected.treasury);
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);
  }

  const cases = [
    { entrants: 1, completed: 1 }, { entrants: 1, completed: 0 },
    { entrants: 2, completed: 2 }, { entrants: 2, completed: 1 },
    { entrants: 3, completed: 3 }, { entrants: 3, completed: 2 },
    { entrants: 5, completed: 5 }, { entrants: 5, completed: 3 },
    { entrants: 5, completed: 0 },
    { entrants: 3, completed: 3, stake: 101n },
    { entrants: 5, completed: 3, stake: 101n },
    { entrants: 5, completed: 5, stake: 1n },
  ];
  for (const scenario of cases) {
    const stake = scenario.stake || 100n * 10n ** 18n;
    it(`ranked source ${scenario.entrants} entrants / ${scenario.completed} complete / ${stake} raw units`, async function () {
      await settleAndCheck({ ...scenario, stake });
    });
  }

  const tieCases = [
    {
      entrants: 1, completed: 1, stake: 101n, policy: 'ranked-ties',
      scores: [{ verifiedActivityDays: 2, reportsSubmitted: 1 }],
    },
    {
      entrants: 2, completed: 2, stake: 1n, policy: 'ranked-ties',
      scores: [{ verifiedActivityDays: 2, reportsSubmitted: 0 }, { verifiedActivityDays: 2, reportsSubmitted: 0 }],
    },
    {
      entrants: 3, completed: 3, stake: 101n, policy: 'ranked-ties',
      scores: Array.from({ length: 3 }, () => ({ verifiedActivityDays: 7, reportsSubmitted: 1 })),
    },
    {
      entrants: 5, completed: 5, stake: 101n, policy: 'ranked-ties',
      scores: Array.from({ length: 5 }, () => ({ verifiedActivityDays: 7, reportsSubmitted: 1 })),
    },
    {
      entrants: 5, completed: 5, stake: 101n, policy: 'ranked-ties',
      scores: [
        { verifiedActivityDays: 5, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 1 },
        { verifiedActivityDays: 2, reportsSubmitted: 1 },
        { verifiedActivityDays: 2, reportsSubmitted: 1 },
      ],
    },
    {
      entrants: 5, completed: 5, stake: 101n, policy: 'ranked-ties',
      scores: [
        { verifiedActivityDays: 5, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 1 },
        { verifiedActivityDays: 3, reportsSubmitted: 1 },
        { verifiedActivityDays: 2, reportsSubmitted: 1 },
      ],
    },
    {
      entrants: 5, completed: 5, stake: 101_000_001n, tokenDecimals: 6, policy: 'ranked-ties',
      scores: [
        { verifiedActivityDays: 5, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 1 },
        { verifiedActivityDays: 3, reportsSubmitted: 1 },
        { verifiedActivityDays: 2, reportsSubmitted: 1 },
      ],
    },
    {
      entrants: 5, completed: 5, stake: 101_000_000_000_000_000_001n, tokenDecimals: 18, policy: 'ranked-ties',
      scores: [
        { verifiedActivityDays: 5, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 1 },
        { verifiedActivityDays: 3, reportsSubmitted: 1 },
        { verifiedActivityDays: 2, reportsSubmitted: 1 },
      ],
    },
    {
      entrants: 5, completed: 5, stake: 101n, policy: 'ranked-ties',
      scores: [
        { verifiedActivityDays: 5, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 1 },
        { verifiedActivityDays: 3, reportsSubmitted: 1 },
        { verifiedActivityDays: 3, reportsSubmitted: 1 },
        { verifiedActivityDays: 2, reportsSubmitted: 1 },
      ],
    },
    {
      entrants: 5, completed: 5, stake: 101n, policy: 'ranked-ties',
      scores: [
        { verifiedActivityDays: 5, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 1 },
        { verifiedActivityDays: 4, reportsSubmitted: 0 },
        { verifiedActivityDays: 3, reportsSubmitted: 1 },
        { verifiedActivityDays: 2, reportsSubmitted: 1 },
      ],
    },
  ];
  for (const [index, scenario] of tieCases.entries()) {
    it(`ranked-tie scenario ${index + 1} matches exact model payouts, shared ranks, and award issuance`, async function () {
      await settleAndCheck(scenario);
    });
  }
});
