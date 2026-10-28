'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

// Execute the production workout block without loading the app's unrelated integrations.
const app = readFileSync(require.resolve('../js/app.js'), 'utf8');
const source = app.slice(app.indexOf("const workoutModal = document.getElementById('workout-timer-modal');"), app.indexOf('const WALLET_WHITELIST ='));
function harness() {
  const nodes = [], timers = new Map(), ready = [];
  let nextTimer = 0, feelings = 0;
  const data = { exercises: { entries: [] }, sessionLog: [] };
  function element(id = '') {
    const node = { id, value: '1', style: {}, textContent: '', innerHTML: '',
      classList: { add() {}, remove() {} }, listeners: {},
      addEventListener(type, callback) { this.listeners[type] = callback; },
      querySelector: () => modal, appendChild() {}, insertBefore() {}, remove() {} };
    nodes.push(node);
    return node;
  }
  const modal = element();
  for (const id of ['workout-timer-modal', 'workout-current-title', 'workout-current-info', 'workout-next-info', 'workout-timer-display', 'start-workout-button', 'start-timer-button', 'pause-timer-button', 'work-duration', 'rest-duration']) element(id);
  const document = {
    getElementById: id => nodes.find(node => node.id === id) || null,
    createElement: () => element(), querySelector: () => modal, querySelectorAll: () => [],
  };
  const context = vm.createContext({ document, window: { addEventListener: (_, callback) => ready.push(callback) },
    setInterval(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearInterval: id => timers.delete(id), getFitnessData: () => data,
    saveFitnessData() {}, displayRecentExercises() {}, alert() {}, confirm: () => true,
    openFeelingsModal() { feelings++; }, sessionStartTime: null, sessionId: null,
  });
  vm.runInContext(source, context);
  vm.runInContext('playBeep = () => {};', context);
  ready.forEach(callback => callback());
  return {
    data, timers, get feelings() { return feelings; },
    run: code => vm.runInContext(code, context),
    click: id => document.getElementById(id).listeners.click(),
    tick(seconds) { for (let i = 0; i < seconds; i++) for (const [id, callback] of [...timers]) if (timers.has(id)) callback(); },
    title: () => document.getElementById('workout-current-title').textContent,
  };
}
const exercise = { type: 'exercise', name: 'Push-ups', reps: '6', weight: '10', setIndex: 0 };
const sequence = JSON.stringify([exercise, { type: 'rest', duration: 1 }, { ...exercise, setIndex: 1 }]);

for (const [phase, seconds] of [['Starting Soon', 0], ['Exercise', 11], ['Rest', 12], ['Prepare', 13]]) {
  test(`cancel during ${phase} stops every workout timer and prevents delayed completion`, () => {
    const h = harness();
    h.run(`prepareWorkoutSequence(${sequence})`);
    h.tick(seconds);
    assert.equal(h.title(), phase);
    assert.equal(h.timers.size, 1);
    h.click('cancel-workout-button');
    assert.equal(h.timers.size, 0);
    const canceled = JSON.stringify(h.data);
    h.tick(30);
    h.run('runWorkoutStep()');
    h.click('start-timer-button');
    assert.equal(JSON.stringify(h.data), canceled);
    assert.equal(h.data.sessionLog.length, 1);
    assert.equal(h.data.sessionLog[0].completed, false);
    assert.equal(h.feelings, 0);
  });
}

test('empty sequence cannot complete a workout', () => {
  const h = harness();
  h.run('runWorkoutStep()');
  assert.equal(h.data.sessionLog.length, 0);
  assert.equal(h.feelings, 0);
});

test('restarting preparation replaces its timer and Start does not bypass preparation', () => {
  const h = harness();
  h.run(`prepareWorkoutSequence(${sequence}); prepareWorkoutSequence(${sequence})`);
  h.click('start-timer-button');
  assert.equal(h.timers.size, 1);
  assert.equal(h.title(), 'Starting Soon');
});

test('uncanceled workout still completes through preparation, work, rest and next-set preparation', () => {
  const h = harness();
  h.run(`prepareWorkoutSequence(${sequence})`);
  h.tick(25);
  assert.equal(h.timers.size, 0);
  assert.equal(h.data.exercises.entries.length, 2);
  assert.equal(h.data.sessionLog.length, 1);
  assert.equal(h.data.sessionLog[0].completed, true);
  assert.equal(h.feelings, 1);
});
