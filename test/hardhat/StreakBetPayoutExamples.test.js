const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time, loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe('StreakBet generated rehearsal examples match contract transfers', function () {
  async function fixture() {
    const [owner, ...accounts] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory('MockERC20')).deploy('Example', 'BNUT', ethers.parseEther('100000'));
    const treasury = await (await ethers.getContractFactory('BigNutenTreasury')).deploy(await token.getAddress(), owner.address);
    const nft = await (await ethers.getContractFactory('MockStreakAwardNFT')).deploy(owner.address);
    const escrow = await (await ethers.getContractFactory('StreakBetEscrow')).deploy(owner.address, ethers.ZeroAddress);
    await escrow.setChallengeStakeToken(await token.getAddress());
    await escrow.setChallengeTreasury(await treasury.getAddress());
    for (const id of [10, 11, 12, 13]) await nft.registerAchievement(id);
    await nft.grantMinter(await escrow.getAddress());
    await escrow.setStreakAwards(await nft.getAddress(), 10, 11, 12, 13);
    return { treasury, accounts, token, escrow };
  }

  const cases = [
    [1, 1], [1, 0], [2, 2], [2, 1], [3, 3], [3, 2], [5, 5], [5, 3], [5, 0],
    [3, 3, 101n], [5, 3, 101n], [5, 5, 1n],
  ];
  for (const [entrants, completed, customStake] of cases) {
    it(`${entrants} entrants / ${completed} complete${customStake ? ` / ${customStake} base-unit stake` : ''}`, async function () {
      const { simulateStreakPayouts, EXAMPLE_STAKE, PAYOUT_SCENARIOS } = await import('../../js/streakPayouts.mjs');
      if (!customStake) expect(PAYOUT_SCENARIOS).to.deep.include({ entrants, completed });
      const stake = customStake || EXAMPLE_STAKE;
      const expected = simulateStreakPayouts({ entrants, completed, stake });
      const { treasury, accounts, token, escrow } = await loadFixture(fixture);
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
        await escrow.connect(accounts[index]).selfCheckInMeetup(0, 0, 'local-code', entrants - index, 1, true, ethers.id(`local-${index}`));
      }
      for (let index = 0; index < completed; index++) {
        if (entrants > 1) {
          await escrow.connect(accounts[(index + 1) % entrants]).reviewMeetupAttendance(0, 0, accounts[index].address, true);
        }
      }
      for (let index = completed; index < entrants; index++) await escrow.connect(accounts[index]).forfeit(0);
      await time.increaseTo(end + 1);
      await escrow.settleCompetition(0, 'ipfs://example-leaderboard');
      for (let index = 0; index < entrants; index++) {
        expect(await token.balanceOf(accounts[index].address)).to.equal(expected.finishers[index]?.payout || 0n);
      }
      expect(await token.balanceOf(await treasury.getAddress())).to.equal(expected.treasury);
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);
    });
  }

});
