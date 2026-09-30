'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('combines daily hydration and exercise goals with an independent weekly weight check-in', async () => {
  const { evaluateStreakRules } = await import('../js/streakRules.mjs');
  const rules = {
    schema: 'bignuten-streak-rules/v1',
    requiredActivityDays: 2,
    metrics: [
      { id: 'water', type: 'hydration', label: 'Water', cadence: 'daily', target: 8 },
      { id: 'situps', type: 'exercise', label: 'Sit-ups', cadence: 'daily', exerciseType: 'Sit-ups', target: 20 },
      { id: 'weigh-in', type: 'weight', label: 'Scale', cadence: 'weekly', target: 1 },
    ],
  };
  const days = [
    { date: '2026-09-01', waterGlasses: 8, exerciseEntries: [{ type: 'Sit-ups', reps: 10, sets: 2 }], weightLogs: [{ weight: 150 }] },
    { date: '2026-09-02', waterGlasses: 8, exerciseEntries: [{ type: 'Sit-ups', reps: 25, sets: 1 }], weightLogs: [] },
    { date: '2026-09-03', waterGlasses: 7, exerciseEntries: [{ type: 'Sit-ups', reps: 40, sets: 1 }], weightLogs: [] },
  ];
  const result = evaluateStreakRules(rules, days, 0);
  assert.equal(result.totalActivityDays, 2);
  assert.equal(result.weeklyActivityDays, 2);
  assert.equal(result.weeklyRequirementsMet, true);
  assert.deepEqual(result.records.map(record => record.qualifies), [true, true, false]);
  assert.equal(result.records[0].metrics['weigh-in'].value, 1);
});

test('rejects ambiguous rules without a daily metric or with duplicate IDs', async () => {
  const { validateStreakRules } = await import('../js/streakRules.mjs');
  assert.throws(() => validateStreakRules({
    schema: 'bignuten-streak-rules/v1',
    metrics: [{ id: 'weight', type: 'weight', cadence: 'weekly', target: 1 }],
  }), /daily metric/);
  assert.throws(() => validateStreakRules({
    schema: 'bignuten-streak-rules/v1',
    metrics: [
      { id: 'water', type: 'hydration', cadence: 'daily', target: 8 },
      { id: 'water', type: 'exercise', exerciseType: 'Sit-ups', cadence: 'daily', target: 20 },
    ],
  }), /unique short slugs/);
});
