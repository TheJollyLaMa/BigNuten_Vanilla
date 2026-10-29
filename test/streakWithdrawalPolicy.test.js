const assert = require('node:assert/strict');
const test = require('node:test');
const { readFile } = require('node:fs/promises');
const vm = require('node:vm');

const config = {
  requiredActivityDays: 26, requiredMeetups: 3, minimumWeeklyLogs: 4, meetupGoal: 'walk together',
};
const assets = [
  { symbol: 'ETH', decimals: 18, native: true },
  { symbol: 'BNUT', decimals: 18, native: false },
  { symbol: 'USDC', decimals: 6, native: false },
];

function assertPolicy(text) {
  for (const phrase of [
    'no participant refund withdrawal before settlement',
    'Voluntary forfeit loses your stake',
    'Only captain (contract owner) cancellation refunds non-forfeited entrants',
    'limited to the actual held balance under the current contract',
    'Final settlement is a ranked payout, not an early refund or a guaranteed full-principal return',
  ]) assert.ok(text.includes(phrase), phrase);
}

test('pre-join confirmation, challenge card and walkthrough disclose the approved stake commitment', async () => {
  const { joinDisclosure } = await import('../js/streakJourney.mjs');
  for (const asset of assets) {
    const text = joinDisclosure({
      stakeAmount: 125n * 10n ** BigInt(asset.decimals), metadataCID: 'ipfs://rules',
      stakeToken: asset.native ? '0x0000000000000000000000000000000000000000' : '0x1111111111111111111111111111111111111111',
    }, config, asset);
    assertPolicy(text);
    assert.ok(text.indexOf('no participant refund') < text.indexOf('Continue to wallet approval and stake?'));
  }
  const source = await readFile('js/streakCompetitions.js', 'utf8');
  assertPolicy(source.slice(source.indexOf('Before joining:'), source.indexOf('Before joining:') + 1700));
  const html = await readFile('index.html', 'utf8');
  assertPolicy(html.slice(html.indexOf('<strong>Stake commitment:</strong>'), html.indexOf('<strong>Stake commitment:</strong>') + 700));
});

test('actual Join handler confirms the policy before approval or value transfer, and decline sends nothing', async t => {
  const { joinDisclosure } = await import('../js/streakJourney.mjs');
  const source = await readFile('js/streakCompetitions.js', 'utf8');
  const handlerSource = source.slice(source.indexOf('function bindStreakActions('), source.indexOf('\nfunction inviteCode('));
  assert.ok(handlerSource.startsWith('function bindStreakActions('));
  for (const asset of assets) {
    for (const accepted of [false, true]) {
      for (const approved of asset.native ? [false] : [false, true]) {
        await t.test(`${asset.symbol}: ${accepted ? 'accept' : 'decline'}, allowance ${approved ? 'sufficient' : 'absent'}`, async () => {
          const events = [];
          const stakeAmount = 125n * 10n ** BigInt(asset.decimals);
          const competition = {
            stakeAmount, stakeToken: asset.native ? '0x0000000000000000000000000000000000000000' : 'token',
            status: 0, joinDeadline: 9999999999n, metadataCID: 'ipfs://rules',
          };
          const reader = {
            getCompetition: async () => competition, getStreakChallenge: async () => config,
            paused: async () => false, runner: { getBalance: async () => stakeAmount * 2n },
          };
          const contract = {
            joinCompetition: async (id, options) => {
              assert.equal(id, 7);
              assert.equal(options?.value, asset.native ? stakeAmount : undefined);
              assert.deepEqual(Object.keys(options || {}), asset.native ? ['value'] : []);
              events.push('stake');
              return { wait: async () => events.push('stake confirmed') };
            },
          };
          let click;
          const button = {
            disabled: false, dataset: { streakAction: 'join', comp: '7' },
            addEventListener: (event, callback) => { assert.equal(event, 'click'); click = callback; },
          };
          const context = {
            joinDisclosure, readContract: async () => reader,
            streakPayoutPolicyVersion: async () => 1,
            signerContract: async () => ({ account: 'entrant', signer: {}, contract }),
            challengeAsset: async () => asset,
            competitionEngineVersion: async () => 2, COMPETITION_ENGINE_VERSION: 2,
            ERC20_ABI: [], streakAddress: () => 'escrow',
            ethers: {
              Contract: function () {
                return {
                  balanceOf: async () => stakeAmount * 2n,
                  allowance: async () => approved ? stakeAmount : 0n,
                  approve: async (address, amount) => {
                    assert.equal(address, 'escrow');
                    assert.equal(amount, stakeAmount);
                    events.push('approve');
                    return { wait: async () => events.push('approval confirmed') };
                  },
                };
              },
            },
            confirm: text => { assertPolicy(text); events.push('disclose'); return accepted; },
            alert: message => assert.fail(message),
            renderStreakChallenges: async () => events.push('render'),
          };
          vm.createContext(context);
          vm.runInContext(handlerSource, context);
          context.bindStreakActions({ querySelectorAll: () => [button] });
          await click();
          assert.deepEqual(events, !accepted ? ['disclose'] : asset.native || approved
            ? ['disclose', 'stake', 'stake confirmed', 'render']
            : ['disclose', 'approve', 'approval confirmed', 'stake', 'stake confirmed', 'render']);
          assert.equal(button.disabled, false);
        });
      }
    }
  }
});
