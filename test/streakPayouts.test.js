const assert = require('node:assert/strict');
const test = require('node:test');
const { readFile } = require('node:fs/promises');

test('generated payout document stays reproducible and includes every rehearsal size', async () => {
  const { generatePayoutExamples } = await import('../scripts/generateStreakPayoutExamples.mjs');
  const { PAYOUT_SCENARIOS } = await import('../js/streakPayouts.mjs');
  assert.equal(await readFile('docs/STREAKBET_PAYOUT_EXAMPLES.md', 'utf8'), generatePayoutExamples());
  for (const entrants of [1, 2, 3, 5]) {
    assert.ok(PAYOUT_SCENARIOS.some(row => row.entrants === entrants && row.completed === entrants));
    assert.ok(PAYOUT_SCENARIOS.some(row => row.entrants === entrants && row.completed < entrants));
  }
});

test('integer model conserves the pot, handles odd stakes and fourth/fifth finishers', async () => {
  const { simulateStreakPayouts } = await import('../js/streakPayouts.mjs');
  for (const stake of [1n, 101n, 100n * 10n ** 18n]) {
    for (let entrants = 1; entrants <= 8; entrants++) {
      for (let completed = 0; completed <= entrants; completed++) {
        const result = simulateStreakPayouts({ entrants, completed, stake });
        assert.equal(result.finishers.reduce((sum, row) => sum + row.payout, result.treasury), result.pot);
        assert.equal(result.pot, BigInt(entrants) * stake);
        assert.ok(result.treasury >= 0n);
        for (const row of result.finishers) {
          assert.equal(row.principal, row.rank === 3 ? stake / 2n : stake);
          if (row.rank > 3) assert.equal(row.weight, 1n);
        }
      }
    }
  }
  const five = simulateStreakPayouts({ entrants: 5, completed: 5, stake: 100n });
  assert.deepEqual(five.finishers.map(row => row.payout), [118n, 112n, 56n, 106n, 106n]);
  assert.equal(five.treasury, 2n);
  for (const input of [
    { entrants: 0, completed: 0, stake: 1n },
    { entrants: 1, completed: 2, stake: 1n },
    { entrants: 2, completed: -1, stake: 1n },
    { entrants: 2.5, completed: 1, stake: 1n },
    { entrants: 2, completed: 1, stake: 0n },
    { entrants: 2, completed: 1, stake: 100 },
  ]) assert.throws(() => simulateStreakPayouts(input));
});

test('join disclosure uses actual terms and warns before live approval', async () => {
  const { joinDisclosure, renderPayoutExamples } = await import('../js/streakJourney.mjs');
  const text = joinDisclosure({ stakeAmount: 125n * 10n ** 18n, metadataCID: 'ipfs://rules' }, {
    requiredActivityDays: 26, requiredMeetups: 3, minimumWeeklyLogs: 4, meetupGoal: 'walk together',
  });
  for (const phrase of ['125 BNUT', '26 qualifying days', '3 meetups', '4 qualifying logs',
    'walk together', 'ipfs://rules', 'half principal', '3:2:1', 'not medical proof',
    'public IPFS', 'simulation', 'LIVE, not rehearsal']) assert.ok(text.includes(phrase), phrase);
  assert.match(renderPayoutExamples(), /Simulation only/);
  assert.equal((renderPayoutExamples().match(/<tr>/g) || []).length, 10);
  assert.match(joinDisclosure({ stakeAmount: 1n }, {}), /No public rules reference/);
});

test('join disclosure formats native ETH and ERC-20 amounts with their own decimals', async () => {
  const { joinDisclosure } = await import('../js/streakJourney.mjs');
  const config = {
    requiredActivityDays: 28, requiredMeetups: 4, minimumWeeklyLogs: 5, meetupGoal: 'meet locally',
  };
  const usdc = joinDisclosure({
    stakeToken: '0x1111111111111111111111111111111111111111',
    stakeAmount: 1_250_000n,
  }, config, { symbol: 'USDC', decimals: 6 });
  assert.match(usdc, /1\.25 USDC/);
  assert.match(usdc, /0x1111111111111111111111111111111111111111/);
  const eth = joinDisclosure({
    stakeToken: '0x0000000000000000000000000000000000000000',
    stakeAmount: 25n * 10n ** 16n,
  }, config, { symbol: 'ETH', decimals: 18 });
  assert.match(eth, /0\.25 ETH/);
  assert.match(eth, /plus network gas/);
  assert.match(eth, /Raw activity records stay local/);
});

test('default on-chain check-in commitment contains no raw activity records', async () => {
  const { publicCheckinCommitment } = await import('../js/streakJourney.mjs');
  const commitment = publicCheckinCommitment({
    competitionId: 7,
    meetupWeek: 2,
    wallet: '0xAbC',
    qualifyingDays: 11,
    weeklyMetricTotals: { hydration: 5 },
    activityRecords: [{ date: 'private-date', foods: ['private-food'] }],
  });
  assert.deepEqual(Object.keys(commitment), [
    'schema', 'competitionId', 'meetupWeek', 'wallet', 'qualifyingDays', 'weeklyMetricTotals',
  ]);
  assert.equal(JSON.stringify(commitment).includes('private-date'), false);
  assert.equal(commitment.wallet, '0xabc');
});
