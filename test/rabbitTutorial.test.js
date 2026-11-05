const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
let rabbit, content;
before(async () => {
  rabbit = await import('../js/rabbitTutorial.mjs');
  content = await import('../js/tutorialContent.mjs');
});
function memory() {
  const entries = new Map();
  return {
    entries, getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key),
  };
}
test('tutorial state is isolated, versioned, dormant and contains no personal records', () => {
  const state = rabbit.createRabbitState();
  assert.deepEqual(state, { version: 1, dismissed: false, activeTour: 'starter', tours: {} });
  assert.notEqual(rabbit.RABBIT_STORAGE_KEY, 'bignuten:quest:v1');
  assert.match(rabbit.RABBIT_STORAGE_KEY, /:v1$/);
  assert.deepEqual(rabbit.normalizeRabbitState(state), state);
});
test('read navigation, skips, backtracking and end position never fabricate log completion', () => {
  const initial = rabbit.createRabbitState();
  let state = rabbit.selectRabbitTour(initial, 'starter');
  const tour = content.tutorialTour('starter');
  const untouched = structuredClone(state);
  state = rabbit.navigateRabbitState(state, 'previous');
  assert.equal(state.tours.starter.index, 0);
  state = rabbit.navigateRabbitState(state, 'next');
  assert.deepEqual(state.tours.starter.read, [tour.cardIds[0]]);
  state = rabbit.navigateRabbitState(state, 'skip');
  assert.equal(state.tours.starter.index, Math.min(2, tour.cardIds.length));
  assert.deepEqual(state.tours.starter.read, [tour.cardIds[0]]);
  for (let index = 0; index < tour.cardIds.length + 2; index++) state = rabbit.navigateRabbitState(state, 'next');
  assert.equal(state.tours.starter.index, tour.cardIds.length);
  assert.ok(!state.tours.starter.read.includes(tour.cardIds[1]));
  assert.equal('completed' in state, false);
  assert.deepEqual(rabbit.selectRabbitTour(initial, 'starter'), untouched);
  assert.deepEqual(initial, rabbit.createRabbitState());
  assert.throws(() => rabbit.navigateRabbitState(state, 'save'), /Unknown/);
});
test('each tour resumes its own place, restart is explicit and invitation dismissal round-trips', () => {
  let state = rabbit.navigateRabbitState(rabbit.selectRabbitTour(rabbit.createRabbitState(), 'starter'), 'next');
  state.dismissed = true;
  state = rabbit.selectRabbitTour(state, 'food-care');
  assert.equal(state.tours['food-care'].index, 0);
  state = rabbit.selectRabbitTour(state, 'starter');
  assert.equal(state.tours.starter.index, 1);
  const storage = memory();
  assert.equal(rabbit.persistRabbitState(state, storage), '');
  assert.deepEqual(rabbit.readRabbitState(storage).state, state);
  assert.equal(rabbit.readRabbitState(storage).state.dismissed, true);
  const reset = rabbit.selectRabbitTour(state, 'starter', { restart: true });
  assert.deepEqual(reset.tours.starter, { index: 0, read: [] });
  assert.deepEqual(reset.tours['food-care'], state.tours['food-care']);
  assert.throws(() => rabbit.selectRabbitTour(state, 'made-up'), /Unknown/);
});
test('normalization deduplicates reads and rejects unknown tours, ids, indices and versions', () => {
  const state = rabbit.selectRabbitTour(rabbit.createRabbitState(), 'starter');
  const first = content.tutorialTour('starter').cardIds[0];
  state.tours.starter.read = [first, first];
  assert.deepEqual(rabbit.normalizeRabbitState(state).tours.starter.read, [first]);
  const invalid = [
    null, {}, { ...state, version: 2 }, { ...state, dismissed: 'yes' },
    { ...state, activeTour: 'missing' }, { ...state, tours: [] },
    { ...state, tours: { unknown: { index: 0, read: [] } } },
    ...[-1, 0.5, 999].map(index => ({ ...state, tours: { starter: { index, read: [] } } })),
    { ...state, tours: { starter: { index: 0, read: ['missing-card'] } } },
    { ...state, tours: { starter: { index: 0, read: null } } },
  ];
  for (const value of invalid) assert.throws(() => rabbit.normalizeRabbitState(value));
});
test('denied, corrupt and quota-limited storage report honest session-only errors', () => {
  const storage = memory();
  for (const raw of ['{', 'null', '{}', JSON.stringify({ version: 7 })]) {
    storage.setItem(rabbit.RABBIT_STORAGE_KEY, raw);
    const result = rabbit.readRabbitState(storage);
    assert.match(result.error, /unavailable or invalid/);
    assert.deepEqual(result.state, rabbit.createRabbitState());
  }
  const denied = new Proxy({}, { get() { throw new Error('denied'); } });
  assert.match(rabbit.readRabbitState(denied).error, /unavailable/);
  assert.match(rabbit.readRabbitState(null).error, /unavailable/);
  assert.match(rabbit.persistRabbitState(rabbit.createRabbitState(), denied), /session-only/);
  assert.match(rabbit.persistRabbitState({}, storage), /could not be saved/);
  assert.match(rabbit.clearRabbitState(denied), /could not be cleared/);
  assert.match(rabbit.clearRabbitState(null), /may return after reload/);
});
test('reset removes only tutorial progress, not Quest or app health storage', () => {
  const storage = memory();
  storage.setItem('bignuten:quest:v1', 'quest-data');
  storage.setItem('fitnessData', 'private-data');
  rabbit.persistRabbitState({ ...rabbit.createRabbitState(), dismissed: true }, storage);
  assert.equal(rabbit.clearRabbitState(storage), '');
  assert.equal(storage.getItem(rabbit.RABBIT_STORAGE_KEY), null);
  assert.equal(storage.getItem('bignuten:quest:v1'), 'quest-data');
  assert.equal(storage.getItem('fitnessData'), 'private-data');
  assert.equal(rabbit.readRabbitState(storage).state.dismissed, false);
});
test('Try it requires a reviewed opener, visible enabled target and existing capability UI', () => {
  for (const card of content.TUTORIAL_CARDS.filter(item => item.target)) {
    assert.ok(Object.hasOwn(rabbit.RABBIT_SAFE_OPENERS, card.target), `${card.id} uses a reviewed opener`);
  }
  const target = { disabled: false, getAttribute: () => null, closest: () => null };
  const modal = {};
  const documentRef = { querySelector: selector => selector === '#water-drop-empty' ? target : selector === '#water-modal' ? modal : null };
  assert.equal(rabbit.rabbitTargetAvailable('#water-drop-empty', documentRef, () => true), true);
  assert.equal(rabbit.rabbitTargetAvailable('#water-drop-empty', documentRef, () => false), false);
  assert.equal(rabbit.rabbitTargetAvailable('#water-log-btn', documentRef, () => true), false);
  assert.equal(rabbit.rabbitTargetAvailable('button[type="submit"]', documentRef, () => true), false);
  target.disabled = true;
  assert.equal(rabbit.rabbitTargetAvailable('#water-drop-empty', documentRef, () => true), false);
  target.disabled = false;
  target.getAttribute = () => 'true';
  assert.equal(rabbit.rabbitTargetAvailable('#water-drop-empty', documentRef, () => true), false);
  target.getAttribute = () => null;
  target.closest = () => ({ inert: true });
  assert.equal(rabbit.rabbitTargetAvailable('#water-drop-empty', documentRef, () => true), false);
  target.closest = () => null;
  target.form = {};
  target.type = 'submit';
  assert.equal(rabbit.rabbitTargetAvailable('#water-drop-empty', documentRef, () => true), false);
  assert.equal(rabbit.rabbitTargetAvailable('#water-drop-empty', { querySelector: () => null }, () => true), false);
});
test('runtime is nonmodal, event-driven and has no personal-data, permission, timer or network dependency', () => {
  const source = readFileSync(require.resolve('../js/rabbitTutorial.mjs'), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|setInterval|setTimeout|requestAnimationFrame|showModal|getUserMedia|requestPermission|sendTransaction|signMessage|getFitnessData)\s*\(/);
  assert.doesNotMatch(source, /node\('dialog'/);
  assert.match(source, /bn:rabbit-start/);
  assert.match(source, /bn:quest-start/);
  assert.match(source, /\.modal-overlay/);
  assert.match(source, /Resume tutorial/);
  assert.match(source, /target\.click\(\)/);
});
