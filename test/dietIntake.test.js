'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let values;
before(() => {
  values = new Map([['userTimezone', 'America/New_York']]);
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
});
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

test('new food entries default to the selected timezone time and retain an explicit time', async () => {
  const { persistDietIntake } = await import('../js/dietIntake.js');
  const data = { foods: [] };
  const now = new Date('2026-10-28T15:15:00.000Z');
  const defaults = persistDietIntake({ name: 'Apple', amount: 1, unit: 'piece' }, () => data, () => {}, now);
  assert.equal(defaults.time, '11:15');
  assert.equal(defaults.date, now.toISOString());
  const explicit = persistDietIntake({ name: 'Oats', amount: 1, unit: 'serving', time: '08:30' }, () => data, () => {}, now);
  assert.equal(explicit.time, '08:30');
  assert.equal(data.foods.length, 2);
});

test('legacy foods keep time unrecorded while valid stored times normalize and invalid times are discarded', async () => {
  const { normalizeFitnessData } = await import('../js/fitnessSchema.js');
  const normalized = normalizeFitnessData({ foods: [
    { name: 'Legacy food' }, { name: 'Timed food', time: '08:30' }, { name: 'Invalid time', time: '25:99' },
  ] });
  assert.equal(Object.hasOwn(normalized.foods[0], 'time'), false);
  assert.equal(normalized.foods[1].time, '08:30');
  assert.equal(Object.hasOwn(normalized.foods[2], 'time'), false);
});

test('daily calories sum available values and report missing calorie entries', async () => {
  const { summarizeCalories, summarizeCaloriesByDay } = await import('../js/dietIntake.js');
  const dayOf = value => value.slice(0, 10);
  const foods = [
    { date: '2026-10-28T08:00:00Z', nutr: { calories: 120 } },
    { date: '2026-10-28', nutr: { calories: '80' } },
    { date: '2026-10-28', nutr: { protein: 4 } },
    { date: '2026-10-28', nutr: { calories: null } },
    { date: '2026-10-27', nutr: { calories: 50 } },
    { date: '2026-10-28', nutr: { calories: -5 } },
  ];
  assert.deepEqual(summarizeCalories(foods, '2026-10-28', dayOf), { calories: 200, entriesWithCalories: 2, totalEntries: 5 });
  assert.deepEqual(summarizeCaloriesByDay(foods, dayOf).map(({ day, calories }) => ({ day, calories })), [
    { day: '2026-10-28', calories: 200 }, { day: '2026-10-27', calories: 50 },
  ]);
});

test('meal insights calculate only recorded same-day intervals and omit absent sleep/workout data', async () => {
  const { buildMealTimingInsights } = await import('../js/dietIntake.js');
  const day = '2026-10-28';
  const dateOf = value => /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  const insights = buildMealTimingInsights({
    day, dateInUserTz: dateOf, timeZone: 'UTC',
    foods: [
      { name: 'Breakfast', date: day, time: '08:15' },
      { name: 'Snack', date: day },
      { name: 'Lunch', date: day, time: '11:30' },
      { name: 'Yesterday', date: '2026-10-27', time: '23:50' },
    ],
    workouts: [{ type: 'Run', start: '2026-10-28T12:00:00.000Z' }],
    sleepEntries: [{ date: day, sleepStart: '22:00' }],
  });
  assert.deepEqual(insights.workoutGaps, [{ label: 'Run', gap: '30m' }]);
  assert.deepEqual(insights.sleepGaps, ['10h 30m']);
  assert.ok(insights.events.some(event => event.label === 'Snack' && event.time === 'time not recorded'));
  const empty = buildMealTimingInsights({ day, dateInUserTz: dateOf, timeZone: 'UTC', foods: [{ name: 'Legacy', date: day }], sleepEntries: [{ metric: 'sleep', date: day, time: '22:00' }] });
  assert.deepEqual(empty.workoutGaps, []);
  assert.deepEqual(empty.sleepGaps, [], 'A sleep-duration log time is not assumed to be bedtime');
});
