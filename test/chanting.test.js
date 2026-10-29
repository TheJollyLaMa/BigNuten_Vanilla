'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
let stats, schema, chakra;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const values = new Map();
before(async () => {
  global.localStorage = { getItem: key => values.get(key) ?? null };
  stats = await import('../js/chantingStats.js');
  schema = await import('../js/fitnessSchema.js');
  chakra = await import('../js/chakra.js');
});
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage); else delete global.localStorage;
});
const now = Date.parse('2026-10-28T12:00:00Z');
const session = (timestamp, durationSeconds = 60) => ({ timestamp, durationSeconds });

test('chanting formats elapsed hours, minutes and seconds', () => {
  assert.equal(stats.formatChantingDuration(3723), '01:02:03');
  assert.equal(stats.formatChantingDuration(-3), '00:00:00');
});
test('chanting scores today, the rolling week and never; ignores invalid, future and empty sessions', () => {
  const score = sessions => stats.chantingScore(sessions, '2026-10-28', now);
  assert.equal(score([session('2026-10-28T11:00:00Z')]), 1);
  assert.equal(score([session('2026-10-22T11:00:00Z')]), .5);
  assert.equal(score([session('2026-10-21T11:59:59Z')]), 0);
  for (const sessions of [undefined, [], [session('invalid')], [session('2026-10-29T11:00:00Z')], [session('2026-10-28T11:00:00Z', 0)], [null]]) assert.equal(score(sessions), 0);
});
test('weekly totals and UTC streak count distinct consecutive days, including yesterday-only continuity', () => {
  const sessions = [session('2026-10-28T11:00:00Z'), session('2026-10-28T10:00:00Z', 30), session('2026-10-27T10:00:00Z'), session('2026-10-26T10:00:00Z'), session('2026-10-24T10:00:00Z'), session('2026-10-01T10:00:00Z'), session('invalid'), session('2026-10-29T10:00:00Z')];
  assert.deepEqual(stats.chantingStats(sessions, now), { weeklySeconds: 270, streak: 3 });
  assert.deepEqual(stats.chantingStats(sessions.slice(2), now), { weeklySeconds: 180, streak: 2 });
  assert.deepEqual(stats.chantingStats([], now), { weeklySeconds: 0, streak: 0 });
});
test('legacy snapshots normalize chanting to an empty list and reject malformed record lists', () => {
  assert.deepEqual(schema.validateFitnessSnapshot({ weightLogs: [] }).chantingSessions, []);
  assert.deepEqual(schema.normalizeFitnessData({ chantingSessions: null }).chantingSessions, []);
  for (const chantingSessions of [{}, [null]]) assert.throws(() => schema.validateFitnessSnapshot({ chantingSessions }));
  assert.equal(schema.validateFitnessSnapshot({ chantingSessions: [{ id: 'only-chanting' }] }).chantingSessions.length, 1);
});
test('real throat score preserves hydration and uses the maximum of hydration and chanting', () => {
  const timestamp = new Date(Date.now() - 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  values.set('fitnessTrackerData', JSON.stringify({ chantingSessions: [session(timestamp)] }));
  values.set('waterTrackerData', JSON.stringify({ date: today, count: 0 }));
  assert.equal(chakra.computeChakraScores()['chakra-throat'], 1);
  values.set('fitnessTrackerData', JSON.stringify({ chantingSessions: [] }));
  values.set('waterTrackerData', JSON.stringify({ date: today, count: 8 }));
  assert.equal(chakra.computeChakraScores()['chakra-throat'], 1);
  values.set('waterTrackerData', JSON.stringify({ date: today, count: 0 }));
  assert.equal(chakra.computeChakraScores()['chakra-throat'], 0);
});
