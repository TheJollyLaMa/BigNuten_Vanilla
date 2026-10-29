'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const log = (overrides = {}) => ({ id: 'sleep-1', metric: 'sleep', value: 27000, unit: 's', date: '2026-10-28', time: '07:30', note: 'Interrupted by noise', source: 'self-reported', ...overrides });
const session = () => ({ id: 'breath-1', method: 'Box Breathing', pattern: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 }, rounds: 2, durationSeconds: 32, notes: 'Gentle practice', feeling: 'calm', timestamp: '2026-10-28T07:30:00Z' });

test('sleep h:mm conversion stores canonical seconds with validated optional quality', async () => {
  const { parseSleepDuration, formatSleepDuration, validateMetricLog, getMetric, convertMetricValue } = await import('../js/metrics.js');
  for (const [text, seconds] of [['0:00', 0], ['7:30', 27000], ['24:00', 86400]]) {
    assert.equal(parseSleepDuration(text), seconds); assert.equal(formatSleepDuration(seconds), text);
    for (const system of ['imperial', 'metric']) assert.equal(convertMetricValue(seconds / 3600, getMetric('sleep'), system), seconds);
  }
  for (const text of ['7:60', '-1:00', '24:01', '7.5', '', '7:3', null]) assert.throws(() => parseSleepDuration(text));
  for (const quality of [1, 10, undefined]) assert.equal(validateMetricLog(log({ sleepQuality: quality })).sleepQuality, quality);
  for (const quality of [0, 11, 5.5, '5', null]) assert.throws(() => validateMetricLog(log({ sleepQuality: quality })));
});

test('sleep night is explicitly attributed to wake date, one log per wake day', async () => {
  const { normalizeMetricLogs, metricPoints, metricSeries, getMetric } = await import('../js/metrics.js');
  const night = log();
  assert.equal(normalizeMetricLogs([night])[0].date, '2026-10-28');
  assert.equal(metricPoints([night], metricSeries(getMetric('sleep'))[0])[0].x.getDate(), 28);
  assert.throws(() => normalizeMetricLogs([night, log({ id: 'duplicate', time: '08:00' })]), /one reading per day/);
  assert.equal(normalizeMetricLogs([night, log({ id: 'next-night', date: '2026-10-29' })]).length, 2);
});

test('energy allows only integer 1–10, daily uniqueness and missing days', async () => {
  const { validateMetricLog, normalizeMetricLogs, metricPoints, metricSeries, getMetric } = await import('../js/metrics.js');
  for (const value of [1, 10]) validateMetricLog(log({ metric: 'energy', unit: 'rating', value }));
  for (const value of [0, 11, 5.5, NaN, '5']) assert.throws(() => validateMetricLog(log({ metric: 'energy', unit: 'rating', value })));
  const energy = log({ metric: 'energy', unit: 'rating', value: 6 });
  assert.throws(() => normalizeMetricLogs([energy, { ...energy, id: 'another' }]));
  assert.deepEqual(metricPoints([], metricSeries(getMetric('energy'))[0]), []);
});

test('breathwork legacy defaults and schema JSON round trip retain one canonical session store', async () => {
  const { normalizeFitnessData, validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
  const { validateBreathSession } = await import('../js/breathwork.js');
  assert.deepEqual(normalizeFitnessData({}).breathworkSessions, []);
  const data = { breathworkSessions: [session()], metricLogs: [log({ sleepQuality: 8 }), log({ id: 'energy', metric: 'energy', unit: 'rating', value: 6 })] };
  const restored = validateFitnessSnapshot(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored.breathworkSessions, data.breathworkSessions); assert.deepEqual(restored.metricLogs, data.metricLogs);
  for (const patch of [{ durationSeconds: 0 }, { durationSeconds: Infinity }, { rounds: 8 }, { feeling: 'unknown' }, { timestamp: 'bad' }, { timestamp: '2026-02-30T12:00:00Z' }, { pattern: {} }]) assert.throws(() => validateBreathSession({ ...session(), ...patch }));
  assert.throws(() => normalizeFitnessData({ breathworkSessions: null }));
});

test('shared Yoga pattern and gentle presets have deterministic phases and skip zero holds', async () => {
  const { BREATH_METHODS, YOGA_BREATH_PATTERN, breathState, validateBreathPattern } = await import('../js/breathwork.js');
  assert.deepEqual(YOGA_BREATH_PATTERN, { inhale: 4, holdIn: 2, exhale: 6, holdOut: 2 });
  for (const method of Object.values(BREATH_METHODS)) validateBreathPattern(method.pattern);
  assert.equal(breathState(BREATH_METHODS.box.pattern, 4).key, 'holdIn');
  assert.equal(breathState(BREATH_METHODS.coherent.pattern, 5).key, 'exhale');
  assert.equal(breathState(BREATH_METHODS.coherent.pattern, 10).rounds, 1);
  assert.throws(() => validateBreathPattern({ inhale: 0, holdIn: 0, exhale: 0, holdOut: 0 }));
});

test('breath timer owns one interval and clears on pause, cancel, end and completion', async () => {
  const { createBreathTimer } = await import('../js/breathwork.js');
  let time = 0, callback, completed = [], ticks = [];
  const intervals = new Set();
  const timer = createBreathTimer({ now: () => time, schedule: cb => { callback = cb; const id = {}; intervals.add(id); return id; }, clear: id => intervals.delete(id), tick: value => ticks.push(value), complete: value => completed.push(value) });
  timer.start(16); timer.start(16); assert.equal(intervals.size, 1);
  time = 4000; callback(); assert.equal(ticks.at(-1), 4);
  timer.pause(); assert.equal(intervals.size, 0); time = 20000;
  timer.resume(); timer.resume(); assert.equal(intervals.size, 1);
  time = 32000; callback(); assert.deepEqual(completed, [16]); assert.equal(intervals.size, 0);
  timer.start(16); time += 3000; assert.equal(timer.end(), 3); assert.equal(intervals.size, 0);
  timer.start(16); timer.cancel(); assert.equal(intervals.size, 0); timer.resume(); assert.equal(intervals.size, 0);
});

test('practice summary uses local days, excludes future logs and carries yesterday streak', async () => {
  const { practiceSummary } = await import('../js/breathwork.js');
  const now = new Date(2026, 9, 28, 12);
  const dated = day => ({ ...session(), timestamp: new Date(2026, 9, day, 7).toISOString() });
  assert.deepEqual(practiceSummary([dated(27), dated(26), dated(29)], now), { seconds: 64, streak: 2 });
});

test('breathwork snapshot merge deduplicates stable IDs and preserves legacy profiles', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    global.window = { BIGNUTEN_STORAGE_RELAY_URL: '' };
    const { mergeSnapshotData } = await import('../js/fitnessData.js');
    const one = session(), two = { ...session(), id: 'breath-2' };
    const merged = mergeSnapshotData({ breathworkSessions: [one] }, { breathworkSessions: [one, two] });
    assert.deepEqual(merged.breathworkSessions, [one, two]);
    assert.deepEqual(mergeSnapshotData({ foods: [] }, merged).breathworkSessions, [one, two]);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else delete globalThis.window; }
});

test('Heart scoring combines saved breathwork with emotion and ignores future practice', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const now = new Date(), recent = new Date(now.getTime() - 2 * 86400000), future = new Date(now.getTime() + 86400000);
  let data = {};
  try {
    global.localStorage = { getItem: key => key === 'fitnessTrackerData' ? JSON.stringify(data) : null };
    const { computeChakraScores } = await import('../js/chakra.js');
    const score = () => computeChakraScores()['chakra-heart'];
    assert.equal(score(), 0);
    data = { breathworkSessions: [{ ...session(), timestamp: recent.toISOString() }] }; assert.equal(score(), 0.5);
    data = { breathworkSessions: [{ ...session(), timestamp: now.toISOString() }] }; assert.equal(score(), 1);
    data = { breathworkSessions: [{ ...session(), timestamp: future.toISOString() }] }; assert.equal(score(), 0);
    data.emotions = [{ timestamp: now.toISOString() }]; assert.equal(score(), 1);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
});

test('merging daily metrics retains local wake-night/energy records, not duplicate days', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    global.window = { BIGNUTEN_STORAGE_RELAY_URL: '' };
    const { mergeSnapshotData } = await import('../js/fitnessData.js');
    const { validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
    const local = log(), imported = log({ id: 'other-id', value: 28800, time: '06:00' });
    const merged = mergeSnapshotData({ metricLogs: [local] }, { metricLogs: [imported, log({ id: 'next', date: '2026-10-29' })] });
    assert.deepEqual(merged.metricLogs, [local, log({ id: 'next', date: '2026-10-29' })]);
    assert.deepEqual(validateFitnessSnapshot(merged).metricLogs, merged.metricLogs);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else delete globalThis.window; }
});

test('opt-in paced recovery fixes 30 breaths plus 10 seconds normal recovery with no holds', async () => {
  const { BREATH_METHODS, breathState, breathRoundSeconds, validateBreathSession } = await import('../js/breathwork.js');
  const { validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
  const { pattern, protocol, advanced, label } = BREATH_METHODS.wim;
  assert.equal(advanced, true); assert.equal(pattern.holdIn, 0); assert.equal(pattern.holdOut, 0);
  assert.equal(breathRoundSeconds(pattern, protocol), 130);
  assert.equal(breathState(pattern, 119, protocol).breath, 30);
  assert.equal(breathState(pattern, 120, protocol).key, 'recovery');
  assert.equal(breathState(pattern, 129, protocol).remaining, 1);
  assert.equal(breathState(pattern, 130, protocol).rounds, 1);
  const record = { ...session(), method: label, pattern, protocol, durationSeconds: 130, rounds: 1 };
  assert.deepEqual(validateBreathSession(record), record);
  assert.deepEqual(validateFitnessSnapshot(JSON.parse(JSON.stringify({ breathworkSessions: [record] }))).breathworkSessions, [record]);
  assert.throws(() => validateBreathSession({ ...record, pattern: { ...pattern, holdIn: 7 } }));
  assert.throws(() => validateBreathSession({ ...record, protocol: 'extended-retention' }));
});
