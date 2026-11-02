'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const gut = import('../js/gutHealth.mjs');
const scaleType = scale => scale.toLowerCase() === 'ppm' ? 'ppm' : 'reported-scale';
const measured = (value, scale) => ({ value, scale, scaleType: scaleType(scale) });
const baseline = (id, timestamp, hydrogen, scale = 'ppm', methane = null) => ({
  id, timestamp, phase: 'baseline', source: 'FoodMarble AIRE 2 (manual)', note: '',
  hydrogen: hydrogen == null ? null : measured(hydrogen, scale), methane: methane == null ? null : measured(methane.value, methane.scale),
});
const followup = (id, timestamp, hydrogen, scale = 'ppm', methane = null) => ({
  id, timestamp, phase: 'after-challenge', source: 'FoodMarble AIRE 2 (manual)', note: '',
  hydrogen: hydrogen == null ? null : measured(hydrogen, scale), methane: methane == null ? null : measured(methane.value, methane.scale),
});
const session = (id, startedAt, readings, challenge = 'Synthetic challenge') => ({ id, startedAt, challenge, mealContext: null, note: '', readings });

test('gut-health normalization preserves manual gas readings, symptom-only logs, and legacy defaults', async () => {
  const { normalizeGutHealth } = await gut;
  assert.deepEqual(normalizeGutHealth(), { sessions: [], symptoms: [] });
  const value = {
    sessions: [session('s1', '2026-10-28T10:00:00.000Z', [baseline('r1', '2026-10-28T10:00:00.000Z', 4), followup('r2', '2026-10-28T10:30:00.000Z', 19)])],
    symptoms: [{ id: 'x1', sessionId: null, timestamp: '2026-10-28T11:00:00.000Z', type: 'Bloating', intensity: 4, stoolForm: null, note: '' }],
  };
  assert.deepEqual(normalizeGutHealth(value), value);
});

test('manual readings preserve unknown gases and exact scales without cross-scale comparisons', async () => {
  const { validateGutReading, calculateGutProgress } = await gut;
  const hydrogenOnly = validateGutReading(baseline('h-only', '2026-10-28T10:00:00.000Z', 5));
  const methaneOnly = validateGutReading({ ...baseline('m-only', '2026-10-28T10:00:00.000Z', null), methane: measured(2, 'device score 0–10') });
  assert.equal(hydrogenOnly.methane, null);
  assert.equal(methaneOnly.hydrogen, null);
  const progress = calculateGutProgress({ sessions: [session('s1', '2026-10-28T10:00:00.000Z', [
    baseline('b', '2026-10-28T10:00:00.000Z', 5),
    followup('ppm', '2026-10-28T10:30:00.000Z', 24),
    followup('vendor', '2026-10-28T11:00:00.000Z', 9, 'AIRE score'),
  ])], symptoms: [] });
  assert.equal(progress.sessionResults.length, 1);
  assert.equal(progress.sessionResults[0].peak, 24);
  assert.equal(progress.sessionResults[0].peakRise, 19);
  assert.equal(progress.sessionResults[0].scale, 'ppm');
  assert.equal(progress.sessionResults[0].scaleType, 'ppm');
  assert.equal(hydrogenOnly.hydrogen.scaleType, 'ppm');
  assert.equal(methaneOnly.methane.scaleType, 'reported-scale');
});

test('progress reports one peak rise per gas and a same-scale time trend only', async () => {
  const { calculateGutProgress } = await gut;
  const sessions = [
    session('s1', '2026-10-01T10:00:00.000Z', [baseline('b1', '2026-10-01T10:00:00.000Z', 4, 'ppm', measured(2, 'ppm')), followup('f1', '2026-10-01T10:30:00.000Z', 20, 'ppm', measured(7, 'ppm'))]),
    session('s2', '2026-10-03T10:00:00.000Z', [baseline('b2', '2026-10-03T10:00:00.000Z', 8, 'ppm', measured(4, 'ppm')), followup('f2', '2026-10-03T10:30:00.000Z', 16, 'ppm', measured(9, 'ppm'))]),
    session('s3', '2026-10-05T10:00:00.000Z', [baseline('b3', '2026-10-05T10:00:00.000Z', 2, 'AIRE score'), followup('f3', '2026-10-05T10:30:00.000Z', 7, 'AIRE score')]),
  ];
  const { sessionResults, trends } = calculateGutProgress({ sessions, symptoms: [] });
  assert.equal(sessionResults.length, 5);
  const hydrogenPpm = trends.find(trend => trend.gas === 'hydrogen' && trend.scaleType === 'ppm' && trend.scale === 'ppm');
  assert.equal(hydrogenPpm.results.length, 2);
  assert.equal(hydrogenPpm.results[0].peakRise, 16);
  assert.equal(hydrogenPpm.results[1].peakRise, 8);
  assert.ok(hydrogenPpm.slopePerDay < 0);
  const methanePpm = trends.find(trend => trend.gas === 'methane');
  assert.deepEqual(methanePpm.results.map(result => result.peakRise), [5, 5]);
  assert.equal(methanePpm.slopePerDay, 0, 'flat readings across separate dates have a zero slope');
  const vendorScale = trends.find(trend => trend.gas === 'hydrogen' && trend.scaleType === 'reported-scale');
  assert.equal(vendorScale.scale, 'AIRE score');
});

test('invalid readings, timestamps, symptoms and dangling session links are rejected', async () => {
  const { normalizeGutHealth, validateGutReading } = await gut;
  for (const reading of [
    baseline('x', '2026-02-30T10:00:00.000Z', 1),
    baseline('x', '2026-10-28T10:00:00.000Z', -1),
    { ...baseline('x', '2026-10-28T10:00:00.000Z', null), hydrogen: { value: null, scale: 'ppm' } },
    baseline('x', '2026-10-28T10:00:00.000Z', Infinity),
    { ...baseline('x', '2026-10-28T10:00:00.000Z', null), methane: null },
    baseline('x', '2026-10-28T10:00:00.000Z', 1, ' '),
  ]) assert.throws(() => validateGutReading(reading));
  assert.throws(() => normalizeGutHealth({ sessions: [], symptoms: [{ id: 'x', sessionId: null, timestamp: '2026-10-28T10:00:00.000Z', type: 'Bloating', intensity: 11 }] }));
  assert.throws(() => normalizeGutHealth({ sessions: [], symptoms: [{ id: 'x', sessionId: null, timestamp: '2026-10-28T10:00:00.000Z', type: 'Bloating', intensity: null }] }));
  assert.throws(() => normalizeGutHealth({ sessions: [], symptoms: [{ id: 'x', sessionId: 'missing', timestamp: '2026-10-28T10:00:00.000Z', type: 'Gas', intensity: 2 }] }));
  assert.throws(() => normalizeGutHealth({ sessions: [session('same', '2026-10-28T10:00:00.000Z', []), session('same', '2026-10-28T11:00:00.000Z', [])] }));
});

test('fitness snapshot schema and snapshot merge retain gut sessions and symptom logs by ID', async () => {
  const { cloneDefaultData, normalizeFitnessData, validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
  const originalWindow = global.window;
  global.window = { BIGNUTEN_STORAGE_RELAY_URL: '' };
  let mergeSnapshotData;
  try { ({ mergeSnapshotData } = await import('../js/fitnessData.js')); }
  finally { if (originalWindow === undefined) delete global.window; else global.window = originalWindow; }
  const base = cloneDefaultData();
  assert.deepEqual(base.gutHealth, { sessions: [], symptoms: [] });
  assert.deepEqual(normalizeFitnessData({ weightLogs: [] }).gutHealth, { sessions: [], symptoms: [] });
  const session1 = session('s1', '2026-10-28T10:00:00.000Z', [baseline('r1', '2026-10-28T10:00:00.000Z', 4)]);
  const session2 = { ...session1, readings: [followup('r2', '2026-10-28T10:30:00.000Z', 20)] };
  const symptom = { id: 'x1', sessionId: 's1', timestamp: '2026-10-28T11:00:00.000Z', type: 'Gas', intensity: 3, stoolForm: null, note: '' };
  const local = { ...base, gutHealth: { sessions: [session1], symptoms: [] } };
  const imported = { ...base, gutHealth: { sessions: [session2], symptoms: [symptom] } };
  assert.deepEqual(validateFitnessSnapshot(imported).gutHealth, imported.gutHealth);
  const merged = mergeSnapshotData(local, imported);
  assert.deepEqual(merged.gutHealth.sessions[0].readings.map(reading => reading.id), ['r1', 'r2']);
  assert.deepEqual(merged.gutHealth.symptoms, [symptom]);
  assert.deepEqual(mergeSnapshotData(merged, imported).gutHealth, merged.gutHealth, 're-import remains idempotent');
});
