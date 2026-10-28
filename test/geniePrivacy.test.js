'use strict';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const keys = ['localStorage', 'document', 'fetch', 'CustomEvent', 'window', 'requestIdleCallback'];
const originals = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const values = new Map();
let privacy, genie, dialogs, requests;
let yogaElements;
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; }
  setAttribute() {}
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  addEventListener(name, callback) { this.events[name] = callback; }
  focus() {}
  showModal() { dialogs.push(this); }
  close() {}
  remove() { dialogs.splice(dialogs.indexOf(this), 1); }
  get lastElementChild() { return this.children.at(-1); }
}
function act(action) { dialogs.at(-1).children.at(-1).children.find(button => button.dataset.consentAction === action).events.click(); }
function listed() { return dialogs.at(-1).children.find(child => child.tag === 'ul').children.map(child => child.textContent); }
function seed(data) { values.set('fitnessTrackerData', JSON.stringify(data)); }
before(async () => {
  global.requestIdleCallback = () => {};
  global.window = { dispatchEvent() {}, addEventListener() {} };
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  global.document = { createElement: tag => new Element(tag), body: new Element('body'), querySelectorAll: () => [], getElementById: id => yogaElements?.[id] || null, dispatchEvent() {} };
  global.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  global.fetch = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ choices: [{ message: { content: 'Synthetic response' } }] }) }; };
  privacy = await import('../js/geniePrivacy.js');
  genie = await import('../js/genieChat.js');
});
after(() => { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
beforeEach(() => { values.clear(); dialogs = []; requests = []; values.set('genieApiKey', 'synthetic-key'); });

for (const backend of ['webllm', 'github-models', 'openai']) {
  test(`${backend}: privacy notice and data-source answer match processing location`, async () => {
    genie.setGenieBackend(backend);
    const notice = privacy.geniePrivacyNotice(backend);
    const answer = await genie.chatWithGenie('What data can you see?', 'test');
    assert.ok(answer.includes(notice));
    if (backend === 'webllm') { assert.match(notice, /locally in your browser/); assert.match(notice, /model download/i); }
    else { assert.match(notice, /hosted AI provider/); assert.match(notice, /After your permission/); assert.match(notice, /sent to that provider/); }
    assert.doesNotMatch(answer, /never leaves your device/);
    assert.equal(requests.length, 0);
    assert.equal(dialogs.length, 0);
  });
}

test('default backend stays GitHub Models; no fetch before consent and Cancel sends nothing', async () => {
  assert.equal(genie.getGenieBackend(), 'github-models');
  const pending = genie.chatWithGenie('Review my health today', 'test');
  assert.equal(dialogs.length, 1);
  assert.equal(requests.length, 0);
  assert.deepEqual(listed(), ['Your message']);
  act('cancel');
  assert.match(await pending, /cancelled/);
  assert.equal(requests.length, 0);
  assert.equal(privacy.hasGenieHostedConsent('github-models'), false);
});

test('Allow is remembered separately per backend and reset gates again', async () => {
  for (const backend of ['github-models', 'openai']) {
    genie.setGenieBackend(backend);
    const before = requests.length;
    const pending = genie.chatWithGenie('Review my health today', 'test');
    assert.equal(dialogs.length, 1);
    assert.equal(requests.length, before, 'No fetch before this backend receives permission');
    act('allow');
    assert.equal(await pending, 'Synthetic response');
    assert.equal(requests.length, before + 1);
    assert.ok(privacy.hasGenieHostedConsent(backend));
    assert.equal(await genie.chatWithGenie('Review my health today', 'test'), 'Synthetic response');
    assert.equal(dialogs.length, 0);
  }
  genie.setGenieBackend('github-models');
  await genie.chatWithGenie('Review my health today', 'test');
  assert.equal(dialogs.length, 0);
  privacy.revokeGenieHostedConsent();
  assert.equal(privacy.hasGenieHostedConsent('github-models'), false);
  assert.equal(privacy.hasGenieHostedConsent('openai'), false);
  const count = requests.length;
  const pending = genie.chatWithGenie('Review my health today', 'test');
  assert.equal(dialogs.length, 1);
  act('cancel');
  await pending;
  assert.equal(requests.length, count);
});

test('local alternative switches backend and sends nothing; Escape also cancels', async () => {
  let pending = genie.chatWithGenie('Review my health today', 'test');
  act('local');
  assert.match(await pending, /Switched to local WebLLM/);
  assert.equal(genie.getGenieBackend(), 'webllm');
  assert.equal(requests.length, 0);
  genie.setGenieBackend('openai');
  pending = genie.chatWithGenie('Review my health today', 'test');
  let prevented = false;
  dialogs.at(-1).events.cancel({ preventDefault() { prevented = true; } });
  assert.match(await pending, /cancelled/);
  assert.ok(prevented);
  assert.equal(requests.length, 0);
});

test('dialog categories are the actual prompt sections, including summaries and pinned memory', async () => {
  const entry = { date: new Date().toISOString(), name: 'synthetic', amount: 1, weight: 70 };
  seed({ exercises: { entries: [entry] }, sessionLog: [entry], foods: [entry], supplements: [entry], emotions: [entry], painLogs: [entry], weightLogs: [entry], measurements: [entry], genieSessions: [{ timestamp: entry.date, summary: 'Synthetic history' }], genieInsights: [{ id: 'synthetic', text: 'Synthetic insight' }] });
  const pending = genie.chatWithGenie('Review my health today', 'test');
  const categories = listed();
  assert.equal(categories.length, 11);
  for (const category of ['Exercise Log', 'Workout Sessions', 'Food / Diet Log', 'Supplement Log', 'Emotion Log', 'Pain Log', 'Weight Logs', 'Body Measurements']) assert.ok(categories.some(label => label.startsWith(category)), category);
  assert.ok(categories.includes('Recent conversation summaries'));
  assert.ok(categories.includes('Pinned health insights'));
  assert.ok(categories.includes('Your message'));
  act('allow'); await pending;
  const prompt = requests[0].body.messages[0].content;
  for (const category of categories.slice(0, 8)) assert.ok(prompt.includes(`## ${category}`));
  assert.ok(prompt.includes('Synthetic history'));
  assert.ok(prompt.includes('Synthetic insight'));
});

test('disabled, empty and out-of-timeframe log categories are not listed or sent', async () => {
  seed({ foods: [{ name: 'Secret food', date: new Date().toISOString() }], emotions: [{ date: '2000-01-01', emotion: 'Old emotion' }], weightLogs: [{ date: new Date().toISOString(), weight: 70 }] });
  values.set('genieContextCategories', JSON.stringify({ foods: false, emotions: true, weightLogs: true }));
  const pending = genie.chatWithGenie('Review my health today', 'test');
  assert.equal(listed().length, 2);
  assert.ok(listed()[0].startsWith('Weight Logs'));
  act('allow'); await pending;
  assert.doesNotMatch(requests[0].body.messages[0].content, /Secret food|Old emotion/);
});

test('longitudinal consent lists real summaries rather than guessed log categories', async () => {
  seed({ foods: [{ date: new Date().toISOString(), name: 'Synthetic' }] });
  const pending = genie.chatWithGenie('Review my all-time health history', 'test');
  assert.ok(listed().some(category => category.startsWith('Nutrition Summary')));
  act('allow'); await pending;
  assert.match(requests[0].body.messages[0].content, /Nutrition Summary/);
});

test('reset or backend change while consent is pending prevents the request', async () => {
  let pending = genie.chatWithGenie('Review my health today', 'test');
  privacy.revokeGenieHostedConsent(); act('allow'); await pending;
  assert.equal(requests.length, 0);
  assert.equal(privacy.hasGenieHostedConsent('github-models'), false);
  pending = genie.chatWithGenie('Review my health today', 'test');
  genie.setGenieBackend('openai'); act('allow');
  assert.match(await pending, /cancelled/);
  assert.equal(requests.length, 0);
});


test('WebLLM never asks hosted permission and concurrent hosted requests share one dialog', async () => {
  const unexpected = () => { throw new Error('Local processing must not ask hosted consent'); };
  assert.equal(await privacy.ensureGenieHostedConsent('webllm', ['Your message'], unexpected), 'allow');
  let finish, calls = 0;
  const request = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = privacy.ensureGenieHostedConsent('openai', ['Your message'], request);
  const second = privacy.ensureGenieHostedConsent('openai', ['Your message'], request);
  assert.equal(calls, 1);
  finish('allow');
  assert.deepEqual(await Promise.all([first, second]), ['allow', 'allow']);
  assert.ok(privacy.hasGenieHostedConsent('openai'));
});

test('failure to remember permission fails closed without a hosted fetch', async () => {
  const pending = genie.chatWithGenie('Review my health today', 'test');
  const save = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Storage unavailable'); };
  try { act('allow'); await assert.rejects(pending, /Storage unavailable/); }
  finally { localStorage.setItem = save; }
  assert.equal(requests.length, 0);
  assert.equal(privacy.hasGenieHostedConsent('github-models'), false);
});


let yogaImport = 0;
async function yogaChat() {
  yogaElements = Object.fromEntries(['input', 'send', 'messages', 'status'].map(name => [`yoga-genie-${name}`, new Element('div')]));
  const yoga = await import(`../js/yoga.js?test=${++yogaImport}`);
  return async text => { yogaElements['yoga-genie-input'].value = text; return yoga.sendGenieMessage(); };
}
async function waitForDialog() {
  for (let count = 0; count < 20 && !dialogs.length; count++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(dialogs.length, 1);
}

for (const backend of ['github-models', 'openai']) {
  test(`Yoga ${backend}: logged sessions cannot leave before consent; Allow remembered and reset gates again`, async () => {
    genie.setGenieBackend(backend);
    seed({ sessionLog: [{ type: 'yoga', date: new Date().toISOString(), name: 'Synthetic yoga session' }, { type: 'exercise', name: 'Not yoga' }] });
    const send = await yogaChat();
    let pending = send('Help with my pose');
    await waitForDialog();
    assert.equal(requests.length, 0);
    assert.deepEqual(listed(), ['Current yoga flow', 'Recent yoga sessions', 'Your message']);
    act('cancel'); await pending;
    assert.equal(requests.length, 0);
    pending = send('Try again');
    await waitForDialog();
    assert.ok(listed().includes('Yoga conversation history'));
    act('allow'); await pending;
    assert.equal(requests.length, 1);
    assert.match(requests[0].body.messages[0].content, /Synthetic yoga session/);
    assert.doesNotMatch(requests[0].body.messages[0].content, /Not yoga/);
    assert.equal(requests[0].body.messages.filter(message => message.content === 'Try again').length, 1);
    await send('Next question');
    assert.equal(requests.length, 2);
    privacy.revokeGenieHostedConsent();
    pending = send('Ask after reset');
    await waitForDialog();
    assert.equal(requests.length, 2);
    act('cancel'); await pending;
    assert.equal(requests.length, 2);
  });
}

test('Yoga local alternative switches to WebLLM, explains panel limitation and never fetches', async () => {
  seed({ sessionLog: [] });
  const send = await yogaChat();
  const pending = send('Help with my pose');
  await waitForDialog();
  assert.deepEqual(listed(), ['Current yoga flow', 'Your message']);
  act('local'); await pending;
  assert.equal(genie.getGenieBackend(), 'webllm');
  assert.equal(requests.length, 0);
  assert.match(yogaElements['yoga-genie-messages'].children.at(-1).textContent, /Nothing was sent.*Yoga Genie needs a hosted backend/);
  await send('Still local');
  assert.equal(requests.length, 0);
  assert.equal(dialogs.length, 0);
});


test('Yoga fetch defense fails closed if permission is revoked after the dialog resolves', async () => {
  seed({ sessionLog: [] });
  const send = await yogaChat();
  const pending = send('Help with my pose');
  await waitForDialog();
  const get = localStorage.getItem;
  const log = console.error;
  const errors = [];
  localStorage.getItem = key => {
    if (key === 'genieApiKey') privacy.revokeGenieHostedConsent();
    return get(key);
  };
  console.error = (...args) => errors.push(args);
  try { act('allow'); await pending; }
  finally { localStorage.getItem = get; console.error = log; }
  assert.equal(requests.length, 0);
  assert.equal(errors.length, 1);
  assert.match(yogaElements['yoga-genie-messages'].children.at(-1).textContent, /Hosted health-context permission required/);
});
