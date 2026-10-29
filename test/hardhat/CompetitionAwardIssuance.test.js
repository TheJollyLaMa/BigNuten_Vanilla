const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const DAY = 24 * 60 * 60;
const STAKE = ethers.parseEther('10');

describe('Competition Achievement award issuance', function () {
  let owner, alice, bob, carol, dave;
  let token, treasury, nft, escrow;

  async function registerAwardIds(ids) {
    for (const id of ids) await nft.registerAchievement(id);
  }

  async function configureCompetition(compId, startTime, ids, name = `Challenge ${compId}`) {
    await escrow.setStreakAwards(await nft.getAddress(), ids[0], ids[1], ids[2], ids[3]);
    const createReceipt = await (await escrow.createCompetition({
      name,
      stakeToken: await token.getAddress(),
      stakeAmount: STAKE,
      totalWeeks: 1,
      startTime,
      endTime: startTime + 7 * DAY,
      joinDeadline: startTime,
      yieldEnabled: false,
      metadataCID: 'ipfs://bafyrules',
    })).wait();
    await escrow.configureStreakChallenge(compId, 'hydration', 'drink water daily', 1, 1, 1, 1);
    await escrow.scheduleMeetup(
      compId,
      0,
      startTime + DAY,
      startTime + DAY + 60 * 60,
      ethers.keccak256(ethers.toUtf8Bytes(`invite-${compId}`)),
      '',
    );
    return { createReceipt };
  }

  async function join(compId, account) {
    await token.transfer(account.address, STAKE);
    await token.connect(account).approve(await escrow.getAddress(), STAKE);
    return (await escrow.connect(account).joinCompetition(compId)).wait();
  }

  async function selfCheckIn(compId, account, code, progressLabel) {
    await escrow.connect(account).selfCheckInMeetup(
      compId,
      0,
      code,
      1,
      1,
      true,
      ethers.id(progressLabel),
    );
  }

  async function review(compId, reviewer, attendee) {
    await escrow.connect(reviewer).reviewMeetupAttendance(compId, 0, attendee.address, true);
  }

  async function parsedMints(receipt) {
    const nftAddress = (await nft.getAddress()).toLowerCase();
    return receipt.logs
      .filter(log => log.address.toLowerCase() === nftAddress)
      .map(log => nft.interface.parseLog(log).args)
      .map(args => ({
        tokenId: args.tokenId,
        to: args.to,
        amount: args.amount,
        minter: args.minter.toLowerCase(),
      }));
  }

  async function expectNoAwardMints(receipt) {
    expect(await parsedMints(receipt)).to.deep.equal([]);
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
  });

  it('uses a fresh configured ERC-1155 token range per competition and mints only for completed entrants at settlement', async function () {
    const { buildCompetitionAwardMetadata } = await import('../../js/competitionAwards.mjs');
    const deployment = {
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      nftAddress: await nft.getAddress(),
      escrowAddress: await escrow.getAddress(),
      stakeTokenAddress: await token.getAddress(),
    };
    const buildRecords = (competitionId, startTime, ids) => buildCompetitionAwardMetadata({
      competition: {
        id: competitionId,
        name: 'Hydration Week',
        groupName: 'Local fixture group',
        creator: owner.address,
        stakeToken: { address: deployment.stakeTokenAddress, symbol: 'BNUT', decimals: 18 },
        stakeAmount: '10',
        startTime,
        endTime: startTime + 7 * DAY,
        rules: {
          schema: 'bignuten-streak-rules/v1',
          metrics: [{ id: 'water', type: 'hydration', cadence: 'daily', target: 5 }],
          requiredActivityDays: 1,
        },
        rulesCID: 'ipfs://bafylocalrules',
      },
      deployment,
      awardTokenIds: { completion: ids[0], first: ids[1], second: ids[2], third: ids[3] },
    });

    const startTime = Number(await time.latest()) + 600;
    const firstRecords = buildRecords(0, startTime, [10, 11, 12, 13]);
    const secondRecords = buildRecords(1, startTime, [20, 21, 22, 23]);
    const firstRange = firstRecords.map(record => Number(record.tokenId));
    const secondRange = secondRecords.map(record => Number(record.tokenId));
    await registerAwardIds([...firstRange, ...secondRange]);
    await nft.grantMinter(await escrow.getAddress());

    expect(firstRecords[0].metadata.properties.competition.id).to.equal('0');
    expect(firstRecords[0].metadata.properties.links.escrowAddress).to.equal(await escrow.getAddress());
    expect(secondRecords[0].metadata.properties.competition.id).to.equal('1');
    await configureCompetition(0, startTime, firstRange, 'Hydration Week');
    await configureCompetition(1, startTime, secondRange, 'Hydration Week');
    await join(0, alice);
    await join(0, bob);
    await join(0, carol);
    await join(0, owner);
    await join(1, dave);

    for (const tokenId of [...firstRange, ...secondRange]) {
      expect(await nft.balanceOf(alice.address, tokenId)).to.equal(0n);
      expect(await nft.balanceOf(carol.address, tokenId)).to.equal(0n);
      expect(await nft.balanceOf(dave.address, tokenId)).to.equal(0n);
    }

    await time.increaseTo(startTime + DAY + 1);
    const completers = [alice, bob, carol];
    for (const account of completers) await selfCheckIn(0, account, 'invite-0', `local-fixture-${account.address}-progress`);
    for (let index = 0; index < completers.length; index += 1) {
      await review(0, completers[(index + 1) % completers.length], completers[index]);
    }

    await selfCheckIn(1, dave, 'invite-1', 'local-fixture-dave-progress');
    expect((await escrow.getStreakEntrant(0, alice.address)).status).to.equal(1n);
    expect((await escrow.getStreakEntrant(0, bob.address)).status).to.equal(1n);
    expect((await escrow.getStreakEntrant(0, carol.address)).status).to.equal(1n);
    expect((await escrow.getStreakEntrant(0, owner.address)).status).to.equal(0n);
    expect((await escrow.getStreakEntrant(1, dave.address)).status).to.equal(1n);

    await time.increaseTo(startTime + 7 * DAY);
    const firstReceipt = await (await escrow.settleCompetition(0, '')).wait();
    const firstMints = await parsedMints(firstReceipt);
    const escrowAddress = (await escrow.getAddress()).toLowerCase();
    expect(firstMints).to.deep.equal([
      { tokenId: 10n, to: alice.address, amount: 1n, minter: escrowAddress },
      { tokenId: 11n, to: alice.address, amount: 1n, minter: escrowAddress },
      { tokenId: 10n, to: bob.address, amount: 1n, minter: escrowAddress },
      { tokenId: 12n, to: bob.address, amount: 1n, minter: escrowAddress },
      { tokenId: 10n, to: carol.address, amount: 1n, minter: escrowAddress },
      { tokenId: 13n, to: carol.address, amount: 1n, minter: escrowAddress },
    ]);

    const secondReceipt = await (await escrow.settleCompetition(1, '')).wait();
    expect(await parsedMints(secondReceipt)).to.deep.equal([
      { tokenId: 20n, to: dave.address, amount: 1n, minter: escrowAddress },
      { tokenId: 21n, to: dave.address, amount: 1n, minter: escrowAddress },
    ]);

    expect(await nft.balanceOf(alice.address, 10)).to.equal(1n);
    expect(await nft.balanceOf(alice.address, 11)).to.equal(1n);
    expect(await nft.balanceOf(bob.address, 10)).to.equal(1n);
    expect(await nft.balanceOf(bob.address, 12)).to.equal(1n);
    expect(await nft.balanceOf(carol.address, 10)).to.equal(1n);
    expect(await nft.balanceOf(carol.address, 13)).to.equal(1n);
    expect(await nft.balanceOf(owner.address, 10)).to.equal(0n);
    expect((await escrow.getStreakEntrant(0, owner.address)).status).to.equal(2n);
    expect(await nft.balanceOf(dave.address, 20)).to.equal(1n);
    expect(await nft.balanceOf(dave.address, 21)).to.equal(1n);
    await expect(escrow.settleCompetition(0, '')).to.be.revertedWith('Escrow: comp not active');
    expect(await nft.balanceOf(alice.address, 10)).to.equal(1n);
  });

  it('does not mint on cancellation or failed mint; a failed settlement is retryable', async function () {
    const cancelRange = [30, 31, 32, 33];
    const failureRange = [40, 41, 42, 43];
    await registerAwardIds([...cancelRange, ...failureRange]);
    await nft.grantMinter(await escrow.getAddress());
    const startTime = Number(await time.latest()) + 600;

    await configureCompetition(0, startTime, cancelRange, 'Cancelled Challenge');
    await join(0, alice);
    await escrow.cancelCompetition(0);
    expect((await escrow.getCompetition(0)).status).to.equal(2n);
    expect(await token.balanceOf(alice.address)).to.equal(STAKE);
    for (const tokenId of cancelRange) expect(await nft.balanceOf(alice.address, tokenId)).to.equal(0n);

    await configureCompetition(1, startTime, failureRange, 'Mint Failure Challenge');
    await join(1, dave);
    await join(1, bob);
    await time.increaseTo(startTime + DAY + 1);
    await selfCheckIn(1, dave, 'invite-1', 'local-fixture-failure-progress');
    await selfCheckIn(1, bob, 'invite-1', 'local-fixture-failure-peer-progress');
    await review(1, bob, dave);
    await review(1, dave, bob);
    expect((await escrow.getStreakEntrant(1, dave.address)).status).to.equal(1n);
    expect((await escrow.getStreakEntrant(1, bob.address)).status).to.equal(1n);
    await time.increaseTo(startTime + 7 * DAY);

    await nft.setMintFailureAfter(1);
    await expect(escrow.settleCompetition(1, '')).to.be.revertedWith('MockNFT: mint failure');
    expect((await escrow.getCompetition(1)).status).to.equal(0n);
    expect((await escrow.getStreakEntrant(1, dave.address)).status).to.equal(1n);
    expect((await escrow.getStreakEntrant(1, bob.address)).status).to.equal(1n);
    expect(await token.balanceOf(dave.address)).to.equal(0n);
    expect(await token.balanceOf(bob.address)).to.equal(0n);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(STAKE * 2n);
    for (const tokenId of failureRange) {
      expect(await nft.balanceOf(dave.address, tokenId)).to.equal(0n);
      expect(await nft.balanceOf(bob.address, tokenId)).to.equal(0n);
    }

    await nft.setMintFailure(false);
    const receipt = await (await escrow.settleCompetition(1, '')).wait();
    expect((await parsedMints(receipt)).map(mint => mint.tokenId)).to.deep.equal([40n, 41n, 40n, 42n]);
    expect((await escrow.getCompetition(1)).status).to.equal(1n);
    expect(await token.balanceOf(dave.address)).to.equal(STAKE);
    expect(await token.balanceOf(bob.address)).to.equal(STAKE);
  });

  it('does not issue enrollment awards on create, join, voluntary forfeit, or cancellation', async function () {
    const forfeitedRange = [60, 61, 62, 63];
    const cancelledRange = [70, 71, 72, 73];
    await registerAwardIds([...forfeitedRange, ...cancelledRange]);
    await nft.grantMinter(await escrow.getAddress());
    const startTime = Number(await time.latest()) + 600;

    const { createReceipt: forfeitedCreate } = await configureCompetition(0, startTime, forfeitedRange);
    await expectNoAwardMints(forfeitedCreate);
    await expectNoAwardMints(await join(0, alice));
    await expectNoAwardMints(await (await escrow.connect(alice).forfeit(0)).wait());

    const { createReceipt: cancelledCreate } = await configureCompetition(1, startTime, cancelledRange);
    await expectNoAwardMints(cancelledCreate);
    await expectNoAwardMints(await join(1, bob));
    await expectNoAwardMints(await (await escrow.cancelCompetition(1)).wait());

    for (const tokenId of [...forfeitedRange, ...cancelledRange]) {
      expect(await nft.balanceOf(alice.address, tokenId)).to.equal(0n);
      expect(await nft.balanceOf(bob.address, tokenId)).to.equal(0n);
    }
    expect((await escrow.getStreakEntrant(0, alice.address)).status).to.equal(2n);
    expect((await escrow.getCompetition(1)).status).to.equal(2n);
  });

  it('enforces owner setup, NFT minter permission, and distinct role IDs', async function () {
    const range = [50, 51, 52, 53];
    await registerAwardIds(range);

    await expect(nft.connect(alice).registerAchievement(99)).to.be.revertedWith('MockNFT: not admin');
    await expect(escrow.connect(alice).setStreakAwards(await nft.getAddress(), ...range))
      .to.be.revertedWithCustomError(escrow, 'OwnableUnauthorizedAccount');
    await expect(escrow.setStreakAwards(await nft.getAddress(), ...range))
      .to.be.revertedWithCustomError(escrow, 'InvalidStreakAward').withArgs(3);

    await nft.grantMinter(await escrow.getAddress());
    await expect(escrow.setStreakAwards(await nft.getAddress(), 50, 50, 52, 53))
      .to.be.revertedWithCustomError(escrow, 'InvalidStreakAward').withArgs(2);
    await escrow.setStreakAwards(await nft.getAddress(), ...range);
    await expect(nft.connect(alice).mintAchievement(alice.address, 50, 1))
      .to.be.revertedWith('MockNFT: not minter');
  });
});
