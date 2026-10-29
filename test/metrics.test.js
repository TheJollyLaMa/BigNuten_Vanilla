'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const registry = import('../js/metrics.js');
const reading = (overrides = {}) => ({ id: 'rhr-1', metric: 'rhr', value: 62, unit: 'bpm', date: '2026-10-28', time: '10:30', note: 'After resting', source: 'self-reported', ...overrides });

test('RHR registry defines the complete reference metric and inclusive range', async () => {
  const { getMetric, validateMetricValue, validateMetricLog } = await registry;
  const rhr = getMetric('rhr');
  assert.equal(rhr.canonicalUnit, 'bpm');
  assert.equal(rhr.multiplePerDay, true);
  assert.equal(rhr.input.type, 'number');
  assert.equal(rhr.chartType, 'line');
  assert.match(rhr.safetyNotice, /Not medical advice/);
  for (const value of [30, 62, 220]) assert.equal(validateMetricValue(rhr, value), value);
  for (const value of [29, 221, NaN, Infinity, '62', null, {}, [62]]) assert.throws(() => validateMetricValue(rhr, value));
  assert.deepEqual(validateMetricLog(reading()), reading());
});

test('metric records reject display units, invalid metadata and invalid calendar times', async () => {
  const { validateMetricLog } = await registry;
  for (const overrides of [
    { metric: 'unknown' }, { unit: 'hz' }, { id: '' }, { id: 1 }, { note: null },
    { source: 'device' }, { date: '2026-02-30' }, { date: 'bad' },
    { time: '24:00' }, { time: '12:60' }, { time: 'noon' },
  ]) assert.throws(() => validateMetricLog(reading(overrides)), JSON.stringify(overrides));
  for (const source of ['self-reported', 'estimated', 'imported']) assert.equal(validateMetricLog(reading({ source })).source, source);
});

test('affine unit conversions support identity, temperature, length and pressure', async () => {
  const { displayUnit, toCanonical, fromCanonical, getMetric, getUnitSystem } = await registry;
  const celsius = { displayUnits: { imperial: displayUnit('°F', 5 / 9, -32 * 5 / 9), metric: displayUnit('°C') } };
  assert.ok(Math.abs(toCanonical(98.6, celsius) - 37) < 1e-10);
  assert.ok(Math.abs(fromCanonical(37, celsius) - 98.6) < 1e-10);
  const length = { displayUnits: { imperial: displayUnit('in', 0.0254), metric: displayUnit('cm', 0.01) } };
  assert.equal(toCanonical(100, length, 'metric'), 1);
  assert.equal(toCanonical(10, length), 0.254);
  assert.equal(fromCanonical(0.254, length), 10);
  const pressure = { displayUnits: { imperial: displayUnit('mmHg', 133.322), metric: displayUnit('kPa', 1000) } };
  assert.equal(toCanonical(120, pressure), 15998.64);
  assert.equal(toCanonical(16, pressure, 'metric'), 16000);
  for (const system of ['imperial', 'metric']) {
    assert.equal(toCanonical(62, getMetric('rhr'), system), 62);
    assert.equal(fromCanonical(62, getMetric('rhr'), system), 62);
  }
  assert.equal(getUnitSystem({ getItem: () => null }), 'imperial');
  assert.equal(getUnitSystem({ getItem: () => 'metric' }), 'metric');
  assert.equal(getUnitSystem({ getItem: () => 'invalid' }), 'imperial');
  assert.throws(() => toCanonical('', celsius));
});

test('compound BP definition converts, validates and exposes both chart series without specialized UI code', async () => {
  const { METRIC_REGISTRY, displayUnit, convertMetricValue, validateMetricValue, metricSeries, metricPoints } = await registry;
  const field = label => ({ label, range: [1000, 40000], input: { type: 'number', step: 'any' }, displayUnits: { imperial: displayUnit('mmHg', 133.322), metric: displayUnit('kPa', 1000) } });
  const bp = { id: 'bp-test', canonicalUnit: 'Pa', fields: { systolic: field('Systolic'), diastolic: field('Diastolic') } };
  const canonical = convertMetricValue({ systolic: 120, diastolic: 80 }, bp, 'imperial');
  assert.deepEqual(validateMetricValue(bp, canonical), canonical);
  assert.deepEqual(convertMetricValue(canonical, bp, 'imperial', 'fromCanonical'), { systolic: 120, diastolic: 80 });
  assert.throws(() => validateMetricValue(bp, { systolic: 16000 }));
  assert.throws(() => validateMetricValue(bp, { ...canonical, extra: 1 }));
  assert.throws(() => validateMetricValue(bp, { ...canonical, diastolic: '80' }));
  const series = metricSeries(bp);
  assert.deepEqual(series.map(entry => entry.key), ['metric:bp-test:systolic', 'metric:bp-test:diastolic']);
  const logs = [reading({ metric: bp.id, value: canonical, unit: 'Pa' })];
  assert.equal(metricPoints(logs, series[0])[0].y, 120);
  assert.equal(metricPoints(logs, series[1])[0].y, 80);
  METRIC_REGISTRY.push({ ...bp, label: 'Blood pressure test', chartType: 'line', safetyNotice: 'Test only', multiplePerDay: true });
  try {
    const { validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
    const restored = validateFitnessSnapshot(JSON.parse(JSON.stringify({ metricLogs: logs })));
    assert.deepEqual(restored.metricLogs[0].value, canonical);
    assert.equal(restored.metricLogs[0].unit, 'Pa');
  } finally { METRIC_REGISTRY.pop(); }
});

test('a registry-only single-reading metric enforces the daily rule', async () => {
  const { METRIC_REGISTRY, getMetric, normalizeMetricLogs } = await registry;
  METRIC_REGISTRY.push({ ...getMetric('rhr'), id: 'daily-test', multiplePerDay: false });
  try {
    const first = reading({ metric: 'daily-test' });
    const second = reading({ metric: 'daily-test', id: 'next', time: '11:30' });
    assert.throws(() => normalizeMetricLogs([first, second]), /Only one reading per day/);
    assert.equal(normalizeMetricLogs([first, { ...second, date: '2026-10-29' }]).length, 2);
    assert.equal(normalizeMetricLogs([reading(), reading({ id: 'another-rhr' })]).length, 2);
  } finally { METRIC_REGISTRY.pop(); }
});

test('legacy fitness data and wrapped snapshots load with an empty metric list', async () => {
  const { normalizeFitnessData, validateFitnessSnapshot, cloneDefaultData } = await import('../js/fitnessSchema.js');
  assert.deepEqual(cloneDefaultData().metricLogs, []);
  for (const raw of [{ weightLogs: [] }, { data: { weightLogs: [] } }, { __bignutenSnapshot: true, version: 1, data: { foods: [] } }]) {
    assert.deepEqual(normalizeFitnessData(raw).metricLogs, []);
    assert.deepEqual(validateFitnessSnapshot(raw).metricLogs, []);
  }
  assert.deepEqual(normalizeFitnessData(null).metricLogs, []);
});

test('metric schema preserves provenance and multiple readings, rejects malformed records', async () => {
  const { validateFitnessSnapshot, normalizeFitnessData } = await import('../js/fitnessSchema.js');
  const logs = [reading(), reading({ id: 'rhr-2', value: 64, time: '11:30', source: 'imported' })];
  assert.deepEqual(validateFitnessSnapshot({ metricLogs: logs }).metricLogs, logs);
  assert.deepEqual(normalizeFitnessData({ metricLogs: logs }).metricLogs, logs);
  for (const metricLogs of [null, {}, [null], [reading({ unit: 'display' })], [reading({ value: 500 })]]) {
    assert.throws(() => validateFitnessSnapshot({ metricLogs }));
    assert.throws(() => normalizeFitnessData({ metricLogs }));
  }
});

test('snapshot merge deduplicates by ID without losing same-day readings and sorts by time', async () => {
  const original = global.window;
  let mergeSnapshotData;
  try {
    global.window = { BIGNUTEN_STORAGE_RELAY_URL: '' };
    ({ mergeSnapshotData } = await import('../js/fitnessData.js'));
  } finally {
    if (original === undefined) delete global.window; else global.window = original;
  }
  const first = reading(), second = reading({ id: 'rhr-2', time: '11:30' });
  const merged = mergeSnapshotData({ metricLogs: [second] }, { metricLogs: [first, second] });
  assert.deepEqual(merged.metricLogs, [first, second]);
  assert.deepEqual(mergeSnapshotData(merged, { metricLogs: [first, second] }), merged);
  assert.deepEqual(mergeSnapshotData({ foods: [] }, { metricLogs: [first] }).metricLogs, [first]);
});

test('clearLocalHealthData removes metrics and all recovery copies, without resetting unit preferences', async () => {
  const { clearLocalHealthData, createSnapshotRecovery } = await import('../js/snapshotRecovery.js');
  const values = new Map([['metricDisplayUnits', 'metric']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), keys: () => values.keys() };
  const recovery = createSnapshotRecovery(storage, () => '2026-10-28T12:00:00Z', () => '2026-10-28');
  recovery.save({ metricLogs: [reading()] });
  storage.setItem('fitnessTrackerSnapshot-2026-10-28', JSON.stringify({ metricLogs: [reading()] }));
  assert.match(storage.getItem('fitnessTrackerData'), /rhr-1/);
  assert.ok(recovery.points().length);
  clearLocalHealthData(storage);
  assert.equal(storage.getItem('fitnessTrackerData'), null);
  assert.deepEqual(recovery.points(), []);
  assert.deepEqual([...values.keys()], ['metricDisplayUnits']);
  assert.equal(recovery.recover(), null);
});
