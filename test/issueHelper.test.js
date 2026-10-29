const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
let helper;
before(async () => { helper = await import('../js/issueHelper.js'); });
const address = '0x' + 'a1'.repeat(20);
const privateKey = '0x' + 'ab'.repeat(32);
const input = overrides => ({
  kind: 'bug', surface: 'Water panel', happened: 'The button did not open.',
  expected: 'A dialog should open.', steps: '1. Click the water icon.', ...overrides,
});

test('all four interviews produce fixed-origin, pure encoded title/body links', () => {
  for (const kind of Object.keys(helper.ISSUE_KINDS)) {
    const draft = helper.buildIssueDraft(input({ kind, happened: 'A & B # ? + = / café 🧞\n<script>alert(1)</script>' }));
    const url = new URL(draft.url);
    assert.equal(url.origin + url.pathname, 'https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/new');
    assert.deepEqual([...url.searchParams.keys()], ['title', 'body']);
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.get('title'), draft.title);
    assert.equal(url.searchParams.get('body'), draft.body);
    assert.match(draft.body, /A & B # \? \+ = \/ café 🧞/);
    assert.match(draft.body, /What happened/);
    assert.match(draft.body, /Steps to reproduce/);
  }
});

test('default removes wallet, email, IP and street address-like text', () => {
  const sensitive = [address, 'person@example.com', 'имя@example.com', '192.168.1.1', '123 Example Street', '2001:db8:0:1:0:0:0:1', '::1'];
  const result = helper.buildIssueDraft(input({ happened: sensitive.join('\n') }));
  for (const item of sensitive) assert.ok(!decodeURIComponent(result.url).includes(item), item);
  assert.equal(result.redacted, true);
  assert.match(result.body, /\[removed address\]/);
});

test('only explicit exact opt-in addresses survive, and opted-out addresses are removed', () => {
  const draft = helper.buildIssueDraft(input({
    allowAddresses: [address, 'public@example.com'],
    happened: `${address}\npublic@example.com\nprivate@example.com`,
  }));
  assert.match(draft.body, new RegExp(address));
  assert.match(draft.body, /public@example.com/);
  assert.doesNotMatch(draft.body, /private@example.com/);
  const reviewed = helper.reviewIssueDraft({ ...draft, kind: 'bug' });
  assert.doesNotMatch(reviewed.body, new RegExp(address));
});

test('credentials are stripped even if a public address inside them is allowlisted', () => {
  const sample = [
    `private key: ${address}`,
    `api_key: ${privateKey}`,
    'Authorization: Bearer synthetic-sensitive-value',
    'password=hunter-example',
    'CLIENT_SECRET=synthetic-client-value',
    'OPENAI_API_KEY=synthetic-config-value',
    'myPassword=synthetic-config-value',
    'seed phrase: synthetic mnemonic words',
    'seed phrase:\nsynthetic mnemonic words\nmore synthetic mnemonic words',
    'password:\nsynthetic-sensitive-password',
    `api_key:\n${address}`,
    'ghp_syntheticExampleCredential',
    'github_pat_syntheticExampleCredential',
    'sk-syntheticExampleCredential',
    'AKIAABCDEFGHIJKLMNOP',
    'ASIAABCDEFGHIJKLMNOP',
    'xoxb-123456-234567-syntheticSlackValue',
    'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.signature',
    '-----BEGIN PRIVATE KEY-----\nsynthetic-private-material\n-----END PRIVATE KEY-----',
    'https://user:pass@example.com/path?access=private&nested=1',
    'ssh://user:pass@example.com/private',
    privateKey,
    'ZxY1'.repeat(12),
  ];
  for (const happened of sample) {
    const result = helper.buildIssueDraft(input({ happened, allowAddresses: [address] }));
    assert.equal(result.redacted, true);
    assert.ok(!result.body.includes(happened), happened);
    assert.ok(!result.url.includes(encodeURIComponent(happened)));
    if (happened.startsWith('private key')) assert.ok(!result.body.includes(address));
  }
  for (const keep of [privateKey, 'ghp_syntheticExampleCredential', `secret:${address}`, 'ordinary text']) {
    assert.throws(() => helper.buildIssueDraft(input({ allowAddresses: [keep] })), /Only exact public addresses/);
  }
});

test('encoded, nested-encoded and invisible-character credentials cannot bypass the gate', () => {
  for (const value of [
    'ghp_syntheticExampleCredential',
    'pri\u200bvate key: synthetic-private-value',
    privateKey,
    address,
  ]) {
    let happened = value;
    for (let i = 0; i < 3; i++) {
      happened = [...Buffer.from(happened)].map(byte => '%' + byte.toString(16).padStart(2, '0')).join('');
      if (happened.length > helper.ISSUE_LIMITS.field) break;
      const result = helper.buildIssueDraft(input({ happened }));
      assert.equal(result.redacted, true);
      assert.ok(!result.body.includes(value));
    }
  }
});

test('editing title and body is sanitized again, redaction is idempotent', () => {
  const result = helper.reviewIssueDraft({
    kind: 'bug', title: `Title ${address}`, body: `edited\napiKey=${privateKey}\n${address}`,
    allowAddresses: [address],
  });
  assert.ok(result.body.includes(address), 'explicit public address in ordinary text');
  assert.ok(!result.body.includes(privateKey));
  assert.equal(helper.reviewIssueDraft({ ...result, kind: 'bug', allowAddresses: [address] }).body, result.body);
  const clean = helper.sanitizeIssueText(`secret: synthetic-value\n${address}`);
  assert.equal(helper.sanitizeIssueText(clean.text).text, clean.text);
  const boundary = helper.buildIssueDraft(input({ surface: 'x '.repeat(53) + 'x🧞 boundary' }));
  assert.ok(boundary.title.length <= helper.ISSUE_LIMITS.title);
  assert.doesNotThrow(() => encodeURIComponent(boundary.title));
});

test('malformed, unsupported, missing and oversized input fails explicitly without partial links', () => {
  for (const value of [null, [], {}, 42]) assert.throws(() => helper.buildIssueDraft(value), /draft|type/);
  assert.throws(() => helper.buildIssueDraft(input({ kind: '__proto__' })), /type/);
  for (const happened of ['', '  ', undefined, {}, '\ud800', '\0', '%ab', '%25ab']) {
    assert.throws(() => helper.buildIssueDraft(input({ happened })), /answer|text|characters|encoding/);
  }
  assert.throws(() => helper.buildIssueDraft(input({ happened: 'x'.repeat(4001) })), /too long/);
  assert.throws(() => helper.buildIssueDraft(input({ allowAddresses: address })), /at most/);
  assert.throws(() => helper.buildIssueDraft(input({ allowAddresses: Array(11).fill(address) })), /at most/);
  assert.throws(() => helper.reviewIssueDraft({ kind: 'bug', title: 'x'.repeat(121), body: 'ok' }), /too long/);
  assert.throws(() => helper.reviewIssueDraft({ kind: 'bug', title: 'ok', body: 'x'.repeat(6001) }), /too long/);
  assert.throws(() => helper.reviewIssueDraft({ kind: 'bug', title: 'ok', body: '🧞'.repeat(2000) }), /link is too long/);
});

test('no health collection, token reads, hosted model, storage or network access', () => {
  const originals = new Map();
  for (const key of ['localStorage', 'sessionStorage', 'fetch', 'document', 'window', 'ethereum']) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, get() { throw new Error(`Unexpected ${key} access`); } });
  }
  try {
    const draft = helper.buildIssueDraft(input({ health: 'SHOULD NOT BE INCLUDED', diagnostics: 'PRIVATE', apiKey: 'PRIVATE' }));
    assert.doesNotMatch(draft.body, /SHOULD NOT BE INCLUDED|PRIVATE/);
    assert.doesNotMatch(draft.body, /weight|painLogs|fitnessTrackerData|health logs/i);
    assert.equal(draft.redacted, false);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
  const source = readFileSync('js/issueHelper.js', 'utf8');
  assert.doesNotMatch(source, /\bimport\b|\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(/);
});

test('new templates have public-data warnings and existing contributor form is byte-for-byte preserved', () => {
  const old = readFileSync('.github/ISSUE_TEMPLATE/contributor-request.yml');
  assert.equal(createHash('sha256').update(old).digest('hex'), 'fcf82c168d79cd918832fbf547c717c706ce408df95b875f4d8c5eae006cb2b5');
  const yaml = require('js-yaml');
  for (const name of ['bug-report', 'feature-idea', 'challenge-proposal', 'metric-request']) {
    const source = readFileSync(`.github/ISSUE_TEMPLATE/${name}.yml`, 'utf8');
    const template = yaml.load(source);
    assert.equal(typeof template.name, 'string');
    assert.match(source, /public/i);
    assert.match(source, /health/i);
    assert.match(source, /credentials/i);
    assert.equal(template.body.filter(field => field.validations?.required).length, 4);
    assert.equal(new Set(template.body.map(field => field.id).filter(Boolean)).size, 4);
    assert.ok(!template.body.some(field => field.id === 'wallet'));
  }
});
