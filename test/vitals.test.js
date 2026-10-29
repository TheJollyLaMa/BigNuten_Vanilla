'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const registry = import('../js/metrics.js');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
const samples = [
  ['temperature', 98.6, 37, 310.15],
  ['bp', { systolic: 120, diastolic: 80 }, { systolic: 120, diastolic: 80 }, { systolic: 15998.64, diastolic: 10665.76 }],
  ['spo2', 98, 98, 98],
  ['rr', 16, 16, 16],
  ['hrv', 42.5, 42.5, 42.5],
  ['vo2max', 45.5, 45.5, 45.5],
];

for (const [id, imperial, metric, canonical] of samples) {
  test(`${id}: registered units, inclusive input guards, display round trips and snapshot recovery`, async () => {
    const { getMetric, metricFields, convertMetricValue, validateMetricValue, validateMetricLog, metricSeries, metricPoints } = await registry;
    const definition = getMetric(id);
    assert.match(definition.safetyNotice, /Not medical advice/);
    assert.equal(definition.multiplePerDay, true);
    for (const [system, input] of [['imperial', imperial], ['metric', metric]]) {
      const stored = convertMetricValue(input, definition, system);
      validateMetricValue(definition, stored);
      const restored = convertMetricValue(stored, definition, system, 'fromCanonical');
      if (definition.fields) {
        for (const key of Object.keys(canonical)) { close(stored[key], canonical[key]); close(restored[key], input[key]); }
      } else { close(stored, canonical); close(restored, input); }
    }
    for (const field of metricFields(definition)) {
      const value = number => field.key ? { ...canonical, [field.key]: number } : number;
      for (const edge of field.range) {
        // Satisfy the paired-field ordering while checking inclusive BP boundaries.
        const candidate = value(edge);
        if (field.key === 'systolic') candidate.diastolic = Math.min(canonical.diastolic, edge - 133.322);
        if (field.key === 'diastolic') candidate.systolic = Math.max(canonical.systolic, edge + 133.322);
        assert.deepEqual(validateMetricValue(definition, candidate), candidate);
      }
      for (const invalid of [field.range[0] - 1, field.range[1] + 1, NaN, Infinity, -Infinity, '98', null, [], {}]) {
        assert.throws(() => validateMetricValue(definition, value(invalid)), `${id}/${field.key}: ${invalid}`);
      }
    }
    const logs = ['self-reported', 'estimated', 'imported'].map((source, i) => validateMetricLog({
      id: `${id}-${i}`, metric: id, value: canonical, unit: definition.canonicalUnit,
      date: '2026-10-28', time: `10:0${i}`, note: 'Synthetic source/device/protocol', source,
    }));
    const { validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
    const { createSnapshotRecovery } = await import('../js/snapshotRecovery.js');
    const bytes = new Map();
    const storage = { getItem: key => bytes.get(key) ?? null, setItem: (key, value) => bytes.set(key, value), removeItem: key => bytes.delete(key), keys: () => bytes.keys() };
    const recovery = createSnapshotRecovery(storage, () => '2026-10-28T12:00:00Z', () => '2026-10-28');
    recovery.save(validateFitnessSnapshot(JSON.parse(JSON.stringify({ metricLogs: logs }))));
    storage.removeItem('fitnessTrackerData');
    assert.ok(recovery.recover());
    assert.deepEqual(JSON.parse(storage.getItem('fitnessTrackerData')).metricLogs, logs);
    const series = metricSeries(definition);
    assert.equal(series.length, definition.fields ? 2 : 1);
    assert.equal(metricPoints(logs, series[0]).length, 3);
  });
}

test('blood pressure rejects equal, reversed, incomplete and extra fields in both display systems', async () => {
  const { getMetric, convertMetricValue, validateMetricValue } = await registry;
  const bp = getMetric('bp');
  for (const system of ['imperial', 'metric']) {
    for (const value of [{ systolic: 80, diastolic: 80 }, { systolic: 80, diastolic: 120 }]) {
      assert.throws(() => validateMetricValue(bp, convertMetricValue(value, bp, system)), /Systolic must be greater than diastolic/);
    }
  }
  for (const value of [{ systolic: 15998.64 }, { systolic: 15998.64, diastolic: 10665.76, extra: 1 }, null, []]) {
    assert.throws(() => validateMetricValue(bp, value));
  }
  assert.equal(bp.fields.systolic.displayUnits.metric.unit, 'mmHg');
  assert.equal(bp.fields.diastolic.displayUnits.metric.unit, 'mmHg');
});

test('reference ranges are separate from accepted readings; HRV and VO2 have no universal healthy target', async () => {
  const { getMetric, metricFields, validateMetricValue } = await registry;
  for (const id of ['temperature', 'bp', 'spo2', 'rr']) {
    for (const field of metricFields(getMetric(id))) {
      assert.ok(field.referenceRange[0] > field.range[0]);
      assert.ok(field.referenceRange[1] <= field.range[1]);
    }
  }
  for (const id of ['hrv', 'vo2max']) assert.equal(getMetric(id).referenceRange, undefined);
  assert.equal(validateMetricValue(getMetric('spo2'), 50), 50);
  assert.equal(validateMetricValue(getMetric('spo2'), 100), 100);
  assert.match(getMetric('hrv').safetyNotice, /RMSSD.*not SDNN/);
  assert.match(getMetric('hrv').safetyNotice, /vary by device/);
  assert.deepEqual(getMetric('vo2max').entrySources, ['self-reported', 'estimated']);
});
