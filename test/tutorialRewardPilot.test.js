const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAddress, ZeroAddress } = require('ethers');
const pilot = require('../tutorial-reward-pilot.json');
const accounts = require('../contributor-accounts.json');

test('reward pilot is unfunded and cannot gate tutorials or authorize claims', () => {
  assert.equal(pilot.version, 1);
  assert.equal(pilot.campaign, 'white-rabbit-closed-trial-v1');
  assert.equal(pilot.status, 'awaiting-budget-and-funding');
  assert.equal(pilot.scope, 'reward-eligibility-only');
  assert.equal(pilot.approvedBudgetBNUT, null);
  assert.equal(pilot.funded, false);
  assert.equal(pilot.claimsEnabled, false);
  assert.equal(pilot.reviewRequired, true);
});

test('closed trial snapshots both public payroll sources without importing balances', () => {
  assert.deepEqual(pilot.sources.map(source => source.repository).sort(), [
    'TheJollyLaMa/BigNuten_Vanilla', 'TheJollyLaMa/DecentBusking',
  ]);
  for (const source of pilot.sources) {
    assert.equal(source.path, 'contributor-accounts.json');
    assert.match(source.blobSha, /^[a-f0-9]{40}$/);
  }
  assert.deepEqual(pilot.participants.map(participant => participant.id).sort(), [
    'copilot', 'grannylyn', 'joseacabrerav', 'thejollylama', 'withinthevacuum', 'zaal',
  ]);
  const json = JSON.stringify(pilot);
  assert.doesNotMatch(json, /bnutEarned|bnutPending|ethEarned|ethPending|issuesClosed|healthLogs|privateKey/);
  for (const account of accounts.contributors) {
    const participant = pilot.participants.find(item => item.github?.toLowerCase() === account.github.toLowerCase());
    assert.ok(participant, account.github);
    const policy = participant.sourcePolicies.find(item => item.repository === 'TheJollyLaMa/BigNuten_Vanilla');
    assert.equal(policy.walletAddress.toLowerCase(), account.walletAddress.toLowerCase());
  }
});

test('identities and wallets are deduplicated without merging different source payout policies', () => {
  assert.equal(new Set(pilot.participants.map(participant => participant.id)).size, pilot.participants.length);
  const owners = new Map();
  for (const participant of pilot.participants) {
    if (participant.walletAddress) {
      assert.ok(isAddress(participant.walletAddress));
      const wallet = participant.walletAddress.toLowerCase();
      assert.ok(!owners.has(wallet) || owners.get(wallet) === participant.id);
      owners.set(wallet, participant.id);
    }
    assert.equal(new Set(participant.sourcePolicies.map(policy => policy.repository)).size, participant.sourcePolicies.length);
    for (const policy of participant.sourcePolicies) {
      assert.ok(pilot.sources.some(source => source.repository === policy.repository));
      if (policy.payoutMode === 'retain-in-fund') {
        assert.equal(policy.walletAddress, null);
        continue;
      }
      assert.equal(policy.payoutMode, 'wallet');
      assert.ok(isAddress(policy.walletAddress));
      assert.notEqual(policy.walletAddress.toLowerCase(), ZeroAddress);
      const wallet = policy.walletAddress.toLowerCase();
      assert.ok(!owners.has(wallet) || owners.get(wallet) === participant.id, 'Different participants cannot share a reward identity.');
      owners.set(wallet, participant.id);
    }
  }
  const bot = pilot.participants.find(participant => participant.id === 'copilot');
  assert.equal(bot.kind, 'automation');
  assert.deepEqual(bot.sourcePolicies.map(policy => policy.payoutMode), ['wallet', 'retain-in-fund']);
});

test('Zaal is invited without inventing a GitHub identity or payment wallet', () => {
  const zaal = pilot.participants.find(participant => participant.id === 'zaal');
  assert.equal(zaal.displayName, 'Zaal');
  assert.equal(zaal.kind, 'human');
  assert.equal(zaal.registration, 'pending-identity-and-wallet');
  assert.equal(zaal.github, null);
  assert.deepEqual(zaal.sourcePolicies, []);
});

test('GrannyLyn is invited by wallet without fabricating payroll enrollment', () => {
  const granny = pilot.participants.find(participant => participant.id === 'grannylyn');
  assert.equal(granny.github, null);
  assert.equal(granny.registration, 'pending-github-registration');
  assert.equal(granny.walletAddress, '0xF18E19c537a7A99571Bc3F8cef81DCBCaea7c3AE');
  assert.deepEqual(granny.sourcePolicies, []);
  const invite = accounts.invitedParticipants.find(participant => participant.displayName === granny.displayName);
  assert.equal(invite.github, null);
  assert.equal(invite.walletAddress, granny.walletAddress);
  assert.ok(!accounts.contributors.some(participant => participant.walletAddress?.toLowerCase() === granny.walletAddress.toLowerCase()));
});
