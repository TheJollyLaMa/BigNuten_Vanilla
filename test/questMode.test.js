const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
let quest, guide;
before(async () => {
  quest = await import('../js/questMode.js');
  guide = await import('../js/communityGuide.mjs');
});
const memory = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key), entries };
};
test('seven chapters reference the current shared guide without a parallel policy model', () => {
  assert.equal(quest.QUEST_CHAPTERS.length, 7);
  for (const chapter of quest.QUEST_CHAPTERS) {
    assert.ok(chapter.title && chapter.target && chapter.hint);
    for (const id of chapter.sections) assert.ok(guide.COMMUNITY_GUIDE_SECTIONS.some(section => section.id === id));
  }
});
test('progress advances deterministically and only all seven read chapters earn a local badge', () => {
  const { state } = quest.readQuestState(memory());
  const unchanged = structuredClone(state);
  let next = { ...state, enabled: true };
  for (let index = 0; index < 7; index++) {
    next = quest.advanceQuest(next);
    assert.equal(next.badge, index === 6);
  }
  assert.deepEqual(state, unchanged);
  assert.equal(next.chapter, 6);
  assert.equal(quest.advanceQuest(next).completed.length, 7);
  const skipped = quest.advanceQuest({ ...state, chapter: 6 });
  assert.equal(skipped.badge, false);
  assert.deepEqual(skipped.completed, [6]);
});
test('local state round-trips, deduplicates reads, and clear removes only Quest data', () => {
  const storage = memory();
  storage.setItem('unrelated', 'keep');
  const state = { ...quest.readQuestState(storage).state, enabled: true, chapter: 2, completed: [1, 0, 1] };
  assert.equal(quest.persistQuestState(state, storage), '');
  assert.deepEqual(quest.readQuestState(storage).state.completed, [0, 1]);
  assert.equal(quest.readQuestState(storage).state.enabled, true);
  assert.equal(quest.clearQuestState(storage), '');
  assert.equal(storage.getItem(quest.QUEST_STORAGE_KEY), null);
  assert.equal(storage.getItem('unrelated'), 'keep');
  assert.equal(quest.readQuestState(storage).state.badge, false);
});
test('invalid, denied, unavailable, quota-limited and removal-failure storage states are explicit', () => {
  const storage = memory();
  for (const raw of ['{', 'null', '{}', JSON.stringify({ version: 1, enabled: true, chapter: 88, completed: [], badge: true })]) {
    storage.setItem(quest.QUEST_STORAGE_KEY, raw);
    const result = quest.readQuestState(storage);
    assert.match(result.error, /unavailable or invalid/);
    assert.equal(result.state.enabled, false);
  }
  const denied = new Proxy({}, { get() { throw new Error('denied'); } });
  assert.match(quest.readQuestState(denied).error, /unavailable/);
  assert.match(quest.persistQuestState(quest.readQuestState(memory()).state, denied), /session-only/);
  assert.match(quest.clearQuestState(denied), /could not be cleared/);
  assert.match(quest.readQuestState(null).error, /unavailable/);
  const forged = { ...quest.readQuestState(memory()).state, badge: true };
  assert.equal(quest.normalizeQuestState(forged).badge, false);
});
test('BNUT Enter is exact, case-insensitive, modifier/repeat/composition-safe and blocked in typing/modal contexts', () => {
  const type = (keys, extra = {}, blocked = false) => {
    let result = { buffer: '', enter: false };
    for (const key of keys) result = quest.questKey(result.buffer, { key, ...extra }, blocked);
    return result;
  };
  assert.equal(type(['B', 'N', 'U', 'T', 'Enter']).enter, true);
  assert.equal(type(['b', 'n', 'x', 'u', 't', 'Enter']).enter, false);
  assert.equal(type(['b', 'n', 'u', 't', ' ' , 'Enter']).enter, false);
  assert.equal(type(['b', 'n', 'u', 't', 'Enter'], {}, true).enter, false);
  for (const property of ['ctrlKey', 'metaKey', 'altKey', 'repeat', 'isComposing', 'defaultPrevented']) {
    assert.equal(type(['b', 'n', 'u', 't', 'Enter'], { [property]: true }).enter, false);
  }
});
test('Quest has no wallet/network/model/upload or financial activation dependencies, timer or auto-click except closing Settings', () => {
  const source = readFileSync(require.resolve('../js/questMode.js'), 'utf8');
  assert.deepEqual([...source.matchAll(/^import .* from '(.+)';/gm)].map(match => match[1]), ['./communityGuide.mjs']);
  assert.doesNotMatch(source, /\b(?:fetch|setInterval|setTimeout|requestAnimationFrame|sendTransaction|signMessage|getSigner|readCommunityChallengeState)\s*\(/);
  assert.match(source, /new CustomEvent\('bn:issue-helper'\)/);
  assert.equal([...source.matchAll(/\.click\(/g)].length, 1);
  assert.match(source, /getElementById\('settings-modal-close'\)\?\.click\(\)/);
});
