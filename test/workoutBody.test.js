'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = import('../js/workoutBody.js');
const schema = import('../js/fitnessSchema.js');
const measurement = { type: 'Waist', measurement: 80, unit: 'cm', date: '2026-10-28', time: '12:00', progressPhotoTaken: true, progressPhotoNote: 'Kept offline' };

test('session RPE accepts optional 1–10 integer and rejects invalid effort', async () => {
  const { normalizeWorkoutSession } = await domain;
  for (const rpe of [1, 7, 10]) assert.equal(normalizeWorkoutSession({ rpe }).rpe, rpe);
  for (const rpe of [0, 11, 1.5, '7', null, NaN]) assert.throws(() => normalizeWorkoutSession({ rpe }));
  assert.deepEqual(normalizeWorkoutSession({ sessionId: 'legacy' }), { sessionId: 'legacy' });
});

test('duration computes elapsed seconds across dates and overrides explicit duration', async () => {
  const { normalizeWorkoutSession, workoutDurationSeconds, formatWorkoutDuration } = await domain;
  const session = { start: '2026-10-28T23:59:30Z', end: '2026-10-29T00:01:00Z', durationSeconds: 1 };
  assert.equal(workoutDurationSeconds(session), 90);
  assert.equal(normalizeWorkoutSession(session).durationSeconds, 90);
  assert.equal(formatWorkoutDuration(session), '1.5 min');
  assert.equal(formatWorkoutDuration({ durationSeconds: 3600 }), '60 min');
  assert.equal(formatWorkoutDuration({}), 'duration not recorded');
  assert.equal(formatWorkoutDuration({ start: 'bad', end: 'bad' }), 'duration not recorded');
  assert.equal(workoutDurationSeconds({ start: session.end, end: session.start }), null);
});

test('explicit duration validates seconds including a recorded zero', async () => {
  const { normalizeWorkoutSession } = await domain;
  for (const durationSeconds of [0, 90, 3600.5]) assert.equal(normalizeWorkoutSession({ durationSeconds }).durationSeconds, durationSeconds);
  for (const durationSeconds of [-1, Infinity, NaN, '90', null]) assert.throws(() => normalizeWorkoutSession({ durationSeconds }));
});

test('recovery notes and workout type metadata validate without mutating sessions', async () => {
  const { normalizeWorkoutSession } = await domain;
  const session = { recovery: { soreness: true, tightness: false, note: 'Back tight' }, workoutTypes: ['Push-ups'] };
  assert.deepEqual(normalizeWorkoutSession(session), session);
  for (const recovery of [null, [], { soreness: 'yes', tightness: false, note: '' }, { soreness: true, tightness: 1, note: '' }, { soreness: true, tightness: false, note: null }]) assert.throws(() => normalizeWorkoutSession({ recovery }));
  assert.throws(() => normalizeWorkoutSession({ workoutTypes: [1] }));
});

test('legacy aliases and unitless body measurements load unchanged', async () => {
  const { normalizeFitnessData } = await schema;
  const legacy = { measurement: '12', type: 'Bicep', date: '2025-05-01' };
  const session = { sessionId: 'old', totalWorkSeconds: 60 };
  const data = normalizeFitnessData({ bodyMeasurements: [legacy], workoutSessions: [session] });
  assert.deepEqual(data.measurements, [legacy]);
  assert.deepEqual(data.sessionLog, [session]);
  assert.equal(data.measurementReminderDismissedOn, '');
  assert.deepEqual(normalizeFitnessData({}).sessionLog, []);
});

test('measurement conversion respects preference and never guesses unspecified legacy units', async () => {
  const { measurementDisplay } = await domain;
  assert.deepEqual(measurementDisplay({ measurement: 25.4, unit: 'cm' }), { value: 10, unit: 'in' });
  assert.deepEqual(measurementDisplay({ measurement: 10, unit: 'in' }, 'metric'), { value: 25.4, unit: 'cm' });
  assert.deepEqual(measurementDisplay({ measurement: '12' }, 'metric'), { value: 12, unit: 'legacy units (not specified)' });
});

test('measurement fields reject invalid units, values, dates and photo metadata', async () => {
  const { normalizeMeasurement } = await domain;
  assert.deepEqual(normalizeMeasurement(measurement), measurement);
  assert.equal(normalizeMeasurement({ ...measurement, progressPhotoTaken: false }).progressPhotoTaken, false);
  assert.equal(normalizeMeasurement({ measurement: '12' }).progressPhotoTaken, undefined);
  for (const override of [{ unit: 'kg' }, { measurement: 0 }, { measurement: Infinity }, { measurement: '80' }, { date: '2026-02-30' }, { time: '25:00' }, { progressPhotoTaken: 'yes' }, { progressPhotoNote: {} }, { bodyFatMetricId: '' }]) assert.throws(() => normalizeMeasurement({ ...measurement, ...override }));
});

test('monthly prompt has an exact 30-day calendar boundary across DST/year changes', async () => {
  const { shouldPromptMeasurements } = await domain;
  assert.equal(shouldPromptMeasurements([], '2026-10-28'), true);
  assert.equal(shouldPromptMeasurements([{ date: '2026-09-29' }], '2026-10-28'), false);
  assert.equal(shouldPromptMeasurements([{ date: '2026-09-28' }], '2026-10-28'), true);
  assert.equal(shouldPromptMeasurements([{ date: '2026-10-01' }, { date: '2025-05-01' }], '2026-10-28'), false);
  assert.equal(shouldPromptMeasurements([{ date: '2026-03-01' }], '2026-03-31'), true);
  assert.equal(shouldPromptMeasurements([{ date: '2025-12-15' }], '2026-01-14'), true);
  assert.equal(shouldPromptMeasurements([{ date: 'bad' }, { date: '2027-01-01' }], '2026-10-28'), true);
});

test('dismissal snoozes the gentle reminder 30 days and is schema-validated', async () => {
  const { shouldPromptMeasurements } = await domain;
  const { normalizeFitnessData } = await schema;
  assert.equal(shouldPromptMeasurements([], '2026-10-28', '2026-10-01'), false);
  assert.equal(shouldPromptMeasurements([], '2026-10-31', '2026-10-01'), true);
  assert.equal(normalizeFitnessData({ measurementReminderDismissedOn: '2026-10-28' }).measurementReminderDismissedOn, '2026-10-28');
  for (const measurementReminderDismissedOn of [12, '2026-02-31', 'bad']) assert.throws(() => normalizeFitnessData({ measurementReminderDismissedOn }));
});

test('body fat is a percent registry metric exposed to the hub/chart/correlation', async () => {
  const { getMetric, validateMetricLog, metricSeries, metricPoints } = await import('../js/metrics.js');
  const metric = getMetric('bodyFat');
  assert.equal(metric.referenceRange, undefined, 'No universal adult body-fat reference band');
  assert.deepEqual(metric.entrySources, ['self-reported', 'imported']);
  const log = { id: 'fat', metric: 'bodyFat', value: 22.5, unit: '%', date: '2026-10-28', time: '12:00', note: 'Device reading', source: 'imported' };
  assert.equal(validateMetricLog(log).source, 'imported');
  assert.equal(metricSeries(metric)[0].key, 'metric:bodyFat');
  assert.equal(metricPoints([log], metricSeries(metric)[0])[0].y, 22.5);
  for (const value of [0, 75.1, NaN, '22']) assert.throws(() => validateMetricLog({ ...log, value }));
});

test('new measurement stores cm plus photo metadata and one linked manual body fat reading', async () => {
  const { createMeasurement } = await domain;
  const options = { type: 'Waist', value: 10, date: '2026-10-28', time: '12:00', system: 'imperial', photoTaken: true, photoNote: ' Offline only ', bodyFat: 22.5, source: 'self-reported' };
  const { entry, metricLog } = createMeasurement(options);
  assert.equal(entry.measurement, 25.4);
  assert.equal(entry.unit, 'cm');
  assert.equal(entry.progressPhotoNote, 'Offline only');
  assert.equal(entry.bodyFatMetricId, metricLog.id);
  assert.equal(metricLog.value, 22.5);
  assert.equal(metricLog.source, 'self-reported');
  assert.equal(createMeasurement({ ...options, system: 'metric', bodyFat: null }).metricLog, null);
  for (const override of [{ value: -1 }, { bodyFat: 100 }, { source: 'device' }, { type: 'add-new' }]) assert.throws(() => createMeasurement({ ...options, ...override }));
});

test('schema validation retains additions and rejects invalid session and measurement records', async () => {
  const { validateFitnessSnapshot } = await schema;
  assert.deepEqual(validateFitnessSnapshot({ measurements: [measurement] }).measurements[0], measurement);
  assert.throws(() => validateFitnessSnapshot({ sessionLog: [{ rpe: 11 }] }));
  assert.throws(() => validateFitnessSnapshot({ measurements: [{ ...measurement, progressPhotoTaken: 1 }] }));
});


test('session backup merge retains stable legacy session identity and latest reminder dismissal', async () => {
  const original = global.window;
  let mergeSnapshotData;
  try {
    global.window = { BIGNUTEN_STORAGE_RELAY_URL: '' };
    ({ mergeSnapshotData } = await import('../js/fitnessData.js'));
  } finally { if (original === undefined) delete global.window; else global.window = original; }
  const current = { sessionLog: [{ sessionId: 'legacy', rpe: 7 }], measurementReminderDismissedOn: '2026-10-28' };
  const imported = { sessionLog: [{ sessionId: 'legacy' }, { id: 'new', rpe: 5 }], measurementReminderDismissedOn: '2026-10-01' };
  const merged = mergeSnapshotData(current, imported);
  assert.equal(merged.sessionLog.length, 2);
  assert.equal(merged.sessionLog.find(row => row.sessionId === 'legacy').rpe, 7);
  assert.equal(merged.measurementReminderDismissedOn, '2026-10-28');
  assert.deepEqual(mergeSnapshotData(merged, imported), merged);
});
