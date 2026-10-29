import {
  collectCompetitionResult,
  verifyAwardMintsAgainstPayouts,
  verifyPublicResultDocument,
} from './streakResults.mjs';

const DAY = 86400;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function assertLocalRehearsalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !LOCAL_HOSTS.has(url.hostname) || url.username || url.password) {
    throw new Error('REHEARSAL ONLY: loopback HTTP required; no public RPC or real wallet');
  }
}

export function assertRehearsalTransaction(fixture, tx) {
  const allowed = Object.values(fixture.contracts).map(contract => contract.address.toLowerCase());
  if (!tx.to || !allowed.includes(tx.to.toLowerCase()) ||
      fixture.forbidden.includes(tx.to.toLowerCase()) || BigInt(tx.value || 0) !== 0n) {
    throw new Error('REHEARSAL ONLY: production addresses, native value and unknown targets are forbidden');
  }
  if (!fixture.accounts.some(account => account.toLowerCase() === String(tx.from).toLowerCase())) {
    throw new Error('REHEARSAL ONLY: only disposable local accounts may transact');
  }
}

export async function assertRehearsalContext(provider, fixture) {
  // Query on every action: getNetwork() may cache a previously safe chain.
  if (fixture.mode !== 'REHEARSAL' || fixture.chainId !== 31337 ||
      Number(await provider.send('eth_chainId', [])) !== 31337) {
    throw new Error('REHEARSAL ONLY: chain 31337 required; mainnets and public testnets are blocked');
  }
  for (const contract of Object.values(fixture.contracts)) {
    if (fixture.forbidden.includes(contract.address.toLowerCase())) {
      throw new Error('REHEARSAL ONLY: production address forbidden');
    }
  }
}

export async function readRehearsalReviewQueue(ethers, provider, fixture) {
  await assertRehearsalContext(provider, fixture);
  const spec = fixture.contracts.escrow;
  const escrow = new ethers.Contract(spec.address, spec.abi, provider);
  const queue = [];
  for (let meetup = 0; meetup < 4; meetup++) {
    for (const [index, label] of [[1, 'Alice'], [2, 'Bob']]) {
      const attendee = fixture.accounts[index];
      const attendance = await escrow.meetupAttendance(0, meetup, attendee);
      if (!attendance.checkedIn || attendance.peerApproved) continue;
      const tally = await escrow.getMeetupReviewTally(0, meetup, attendee);
      const tied = tally.approvals === tally.rejections;
      const invited = tied && await escrow.meetupReviewerInvited(0, meetup, attendee, fixture.accounts[3]);
      queue.push(`${label} — meetup ${meetup + 1} — ${tied ? 'DISPUTED' : 'PENDING peer review'} ` +
        `(${tally.approvals} agree / ${tally.rejections} dispute)` +
        (tied ? (invited ? ' — guest invited; awaiting tie-break' : ' — captain must invite a guest tie-break reviewer') : ''));
    }
  }
  return queue;
}

export async function createRehearsalSteps(ethers, provider, fixture, onTransaction = () => {}) {
  await assertRehearsalContext(provider, fixture);
  const signers = await Promise.all(fixture.accounts.map(account => provider.getSigner(account)));
  const contracts = Object.fromEntries(Object.entries(fixture.contracts).map(([key, spec]) =>
    [key, new ethers.Contract(spec.address, spec.abi, signers[0])]));
  for (const spec of Object.values(fixture.contracts)) {
    if (ethers.keccak256(await provider.getCode(spec.address)) !== spec.codeHash) {
      throw new Error('REHEARSAL ONLY: fresh fixture bytecode mismatch');
    }
  }
  const { token, escrow, nft } = contracts;
  const [captain, alice, bob, guest] = fixture.accounts;
  const stake = ethers.parseEther('10');
  const start = fixture.startTime;
  const end = start + 30 * DAY;
  const verify = (condition, message) => { if (!condition) throw new Error(message); };
  const send = async (contract, signer, method, args) => {
    await assertRehearsalContext(provider, fixture);
    const connected = contract.connect(signers[signer]);
    const request = await connected[method].populateTransaction(...args);
    assertRehearsalTransaction(fixture, { ...request, from: fixture.accounts[signer] });
    onTransaction('pending', method);
    const tx = await connected[method](...args);
    onTransaction('pending', `${method}: ${tx.hash}`);
    const receipt = await tx.wait();
    verify(receipt.status === 1, `${method} reverted`);
    onTransaction('confirmed', `${method}: ${tx.hash}`);
  };
  const advance = async timestamp => {
    await provider.send('evm_setNextBlockTimestamp', [timestamp]);
    await provider.send('evm_mine', []);
  };
  const params = name => ({
    name: `REHEARSAL — ${name} — NO REAL FUNDS`, stakeToken: token.target,
    stakeAmount: stake, totalWeeks: 4, startTime: start, endTime: end,
    joinDeadline: start, yieldEnabled: false, metadataCID: 'rehearsal:synthetic-only',
  });
  const join = async (id, signer) => {
    await send(token, signer, 'approve', [escrow.target, stake]);
    await send(escrow, signer, 'joinCompetition', [id]);
  };
  const checkIn = async index => {
    await advance(start + [5, 12, 19, 29][index] * DAY + 1);
    for (const signer of [1, 2]) await send(escrow, signer, 'selfCheckInMeetup',
      [0, index, `test-code-${index}`, Math.min((index + 1) * 7, 28), 7, true, ethers.id(`synthetic:${index}:${signer}`)]);
  };
  const steps = [];
  const step = (role, label, run) => steps.push({ role, label, run: async () => {
    await assertRehearsalContext(provider, fixture);
    return await run();
  } });
  step('Captain console', 'Create test competitions', async () => {
    for (const name of ['monthly challenge', 'cancel refund', 'voluntary forfeit']) {
      await send(escrow, 0, 'createCompetition', [params(name)]);
    }
    verify(await escrow.nextCompId() === 3n, 'Three competitions must exist');
  });
  step('Captain console', 'Configure monthly challenge', async () => {
    await send(escrow, 0, 'configureStreakChallenge', [0, 'hydration', 'synthetic one-liter attestation', 28, 4, 5, 1000]);
    verify((await escrow.getStreakChallenge(0)).enabled, 'Challenge configuration missing');
  });
  step('Participants', 'Join with fake TEST-BNUT', async () => {
    for (const signer of [1, 2]) await join(0, signer);
    await join(1, 1);
    await join(2, 2);
    verify((await escrow.getCompetition(0)).potBalance === stake * 2n, 'Fake stake accounting mismatch');
    verify(!((await escrow.getCompetition(0)).yieldEnabled), 'Yield must remain disabled');
  });
  step('Participants', 'Submit synthetic reports', async () => {
    await advance(start + 1);
    for (const signer of [1, 2]) await send(escrow, signer, 'submitReport', [0, 'rehearsal:synthetic-report']);
    verify((await escrow.getStreakEntrant(0, alice)).reportsSubmitted === 1n, 'Report missing');
  });
  step('Captain console', 'Schedule four test meetups', async () => {
    for (let index = 0; index < 4; index++) {
      const opens = start + [5, 12, 19, 29][index] * DAY;
      await send(escrow, 0, 'scheduleMeetup', [0, index, opens, opens + 3600,
        ethers.id(`test-code-${index}`), 'https://example.invalid/rehearsal']);
    }
  });
  step('Participants', 'Self check in — meetup 1', () => checkIn(0));
  step('Reviewer queue', 'Agree with Bob; dispute Alice', async () => {
    await send(escrow, 1, 'reviewMeetupAttendance', [0, 0, bob, true]);
    await send(escrow, 2, 'reviewMeetupAttendance', [0, 0, alice, false]);
    const tally = await escrow.getMeetupReviewTally(0, 0, alice);
    verify(tally.approvals === 1n && tally.rejections === 1n, 'Dispute must remain tied');
    verify((await escrow.getStreakEntrant(0, alice)).verifiedMeetups === 0n, 'Dispute cannot count as attendance');
  });
  step('Captain console', 'Invite guest tie-break reviewer', async () => {
    await send(escrow, 0, 'inviteMeetupReviewer', [0, 0, alice, guest]);
    verify(await escrow.meetupReviewerInvited(0, 0, alice, guest), 'Guest invitation missing');
  });
  step('Reviewer queue', 'Guest resolves Alice’s dispute', async () => {
    await send(escrow, 3, 'reviewMeetupAttendance', [0, 0, alice, true]);
    verify((await escrow.getStreakEntrant(0, alice)).verifiedMeetups === 1n, 'Guest decision missing');
  });
  step('Participants + reviewer queue', 'Complete remaining three meetups', async () => {
    for (let index = 1; index < 4; index++) {
      await checkIn(index);
      await send(escrow, 1, 'reviewMeetupAttendance', [0, index, bob, true]);
      await send(escrow, 2, 'reviewMeetupAttendance', [0, index, alice, true]);
    }
    for (const account of [alice, bob]) {
      const entrant = await escrow.getStreakEntrant(0, account);
      verify(entrant.status === 1n && entrant.verifiedActivityDays === 28n && entrant.verifiedMeetups === 4n,
        'Completion requires 28 activity days and four reviewed meetups');
    }
  });
  step('Captain console', 'Settle and verify achievement mint', async () => {
    await advance(end + 1);
    const before = await token.balanceOf(alice);
    const bobBefore = await token.balanceOf(bob);
    await send(escrow, 0, 'settleCompetition', [0, 'rehearsal:synthetic-leaderboard']);
    verify((await escrow.getCompetition(0)).status === 1n && (await escrow.getCompetition(0)).potBalance === 0n,
      'Settlement must empty the pot');
    verify(await token.balanceOf(alice) === before + stake, 'Winner fake-token refund missing');
    verify(await token.balanceOf(bob) === bobBefore + stake, 'Tied winner fake-token refund missing');
    for (const account of [alice, bob]) verify(await nft.balanceOf(account, 10) === 1n, 'Completion achievement missing');
    const [aliceResult, bobResult] = await Promise.all([
      escrow.getStreakEntrant(0, alice),
      escrow.getStreakEntrant(0, bob),
    ]);
    verify(
      aliceResult.place === 1n &&
      bobResult.place === 1n &&
      await nft.balanceOf(alice, 11) === 1n &&
      await nft.balanceOf(bob, 11) === 1n &&
      await nft.balanceOf(alice, 12) === 0n &&
      await nft.balanceOf(bob, 12) === 0n,
      'Tied first-place participants must share the first-place rank award',
    );
  });
  step('Captain console', 'Cancel and verify fake-token refund', async () => {
    const before = await token.balanceOf(alice);
    await send(escrow, 0, 'cancelCompetition', [1]);
    verify((await escrow.getCompetition(1)).status === 2n && await token.balanceOf(alice) === before + stake,
      'Cancellation refund missing');
  });
  step('Participants', 'Forfeit and verify no achievement', async () => {
    await send(escrow, 2, 'forfeit', [2]);
    verify((await escrow.getEntrant(2, bob)).status === 2n, 'Forfeit status missing');
    await send(escrow, 0, 'settleCompetition', [2, 'rehearsal:forfeit']);
    verify((await escrow.getCompetition(2)).winnerCount === 0n, 'Forfeit cannot win');
    verify(await nft.balanceOf(bob, 10) === 1n, 'Forfeit must not mint another achievement');
    verify(await provider.getBalance(escrow.target) === 0n, 'No native funds may enter escrow');
    verify(await token.allowance(alice, escrow.target) === 0n && await token.allowance(bob, escrow.target) === 0n,
      'Rehearsal must leave no token approvals');
  });
  step('Results archive', 'Build sanitized local result preview (not published)', async () => {
    const stored = await escrow.getCompetition(0);
    const roles = ['completion', 'first', 'second', 'third'];
    const awardMetadata = roles.map((role, index) => ({
      role,
      tokenId: String(10 + index),
      metadataCID: '',
    }));
    const awardLinks = awardMetadata.map(({ role, tokenId }) => ({
      role,
      tokenId,
      nftAddress: fixture.contracts.nft.address,
    }));
    const result = await collectCompetitionResult({
      ethers,
      provider,
      escrowAddress: fixture.contracts.escrow.address,
      compId: 0,
      competition: {
        id: 0,
        name: stored.name,
        stakeToken: stored.stakeToken,
        stakeAmount: String(stored.stakeAmount),
        totalWeeks: Number(stored.totalWeeks),
        startTime: Number(stored.startTime),
        endTime: Number(stored.endTime),
        metadataCID: stored.metadataCID,
        status: 'settled',
      },
      awardAddress: fixture.contracts.nft.address,
      awardMetadata,
      awardLinks,
    });
    await verifyPublicResultDocument(result.document, {
      chainId: 31337,
      contractAddress: fixture.contracts.escrow.address,
      competitionId: 0,
    });
    verify(result.document.participants.length === 2, 'Public result must include both participant wallets');
    verify(result.document.participants.some(person => person.actions.some(action => action.type === 'payout')),
      'Public result must include confirmed payout splits');
    verify(result.document.awards.length === 4, 'Public result must include confirmed completion and placement mint logs');
    verifyAwardMintsAgainstPayouts({
      awards: result.awardMints,
      actions: result.document.participants.flatMap(person =>
        person.actions.map(action => ({ ...action, wallet: person.wallet }))),
      awardLinks: result.document.awardLinks,
      escrowAddress: fixture.contracts.escrow.address,
    });
    verify(result.document.settlement?.leaderboardCID === 'rehearsal:synthetic-leaderboard',
      'Public result must link the actual local settlement event');
    verify(!JSON.stringify(result.document).match(/activityDays|progressHash|proofCID|notes|healthData/i),
      'Public result must omit health values, progress hashes, proof CIDs and notes');
    return { resultDocument: result.document, localOnly: true };
  });
  return steps;
}
