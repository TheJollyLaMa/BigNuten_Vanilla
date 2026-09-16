const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEST_BOUNTY_LABEL_RE,
  applyAccountAccrual,
  createBountyEntries,
  entryCurrency,
  isDuplicate,
  parseAmountLabels,
  settleEntries,
} = require('../scripts/payroll');

const owner = {
  github: 'TheJollyLaMa',
  walletAddress: '0x807061DF657A7697c04045dA7d16D941861cAABc',
};

function fixture(issue = {}) {
  return {
    issue: {
      number: 14,
      labels: [{ name: 'bounty: 100 ART' }, { name: 'bounty: 50 $BNUT' }],
      assignees: [{ login: owner.github }],
      ...issue,
    },
    pr: { number: 15, user: { login: 'copilot-swe-agent[bot]' } },
    accounts: { contributors: [{ ...owner }] },
    queue: { pending: [], settled: [] },
    repoSlug: 'TheJollyLaMa/BigNuten_Vanilla',
    queuedAt: '2026-09-16T00:00:00.000Z',
    queuedBy: 'github-actions[bot]',
  };
}

test('parses one exact positive-decimal label per supported currency', () => {
  assert.deepEqual(parseAmountLabels(fixture().issue).map(({ amount, currency }) => [amount, currency]), [
    ['100', 'ART'],
    ['50', 'BNUT'],
  ]);
  assert.deepEqual(parseAmountLabels({ labels: ['test-bounty: 2.5 $ART', 'test-bounty: 3 BNUT'] }, TEST_BOUNTY_LABEL_RE)
    .map(({ amount, currency }) => [amount, currency]), [['2.5', 'ART'], ['3', 'BNUT']]);
  assert.deepEqual(parseAmountLabels({ labels: ['bounty: 0 ART', 'bounty: -1 BNUT', 'bounty: 1 ETH'] }), []);
});

test('rejects duplicate labels for the same currency as ambiguous', () => {
  assert.throws(() => parseAmountLabels({ labels: ['bounty: 1 ART', 'bounty: 2 $ART'] }), /Ambiguous ART/);
});

test('creates an uppercase-currency entry for every bounty currency', () => {
  const result = createBountyEntries(fixture());
  assert.deepEqual(result.entries.map(entry => [entry.amount, entry.currency]), [['100', 'ART'], ['50', 'BNUT']]);
});

test('applies idea credit independently to every bounty currency', () => {
  const result = createBountyEntries(fixture({
    labels: ['bounty: 100 ART', 'bounty: 50 BNUT', 'idea-credit: @TheJollyLaMa'],
  }));
  assert.deepEqual(result.entries.map(entry => [entry.currency, entry.role, entry.amount]), [
    ['ART', 'implementer', '80'],
    ['ART', 'idea-originator', '20'],
    ['BNUT', 'implementer', '40'],
    ['BNUT', 'idea-originator', '10'],
  ]);
});

test('deduplication is role and currency aware while legacy entries are BNUT', () => {
  const legacy = {
    issueRef: 'TheJollyLaMa/BigNuten_Vanilla#14',
    contributorGithub: owner.github,
    role: 'tester',
  };
  const queue = { pending: [legacy], settled: [] };
  assert.equal(entryCurrency(legacy), 'BNUT');
  assert.equal(isDuplicate(queue, { ...legacy, currency: 'BNUT' }), true);
  assert.equal(isDuplicate(queue, { ...legacy, currency: 'ART' }), false);
  assert.equal(isDuplicate(queue, { ...legacy, currency: 'BNUT', role: 'implementer' }), false);
});

test('same-person idea roles remain mutually exclusive within each currency', () => {
  const queue = { pending: [{
    issueRef: 'TheJollyLaMa/BigNuten_Vanilla#14',
    contributorGithub: owner.github,
    currency: 'ART',
    role: 'implementer',
  }], settled: [] };
  assert.equal(isDuplicate(queue, {
    issueRef: 'TheJollyLaMa/BigNuten_Vanilla#14',
    contributorGithub: owner.github,
    currency: 'ART',
    role: 'idea-originator',
  }), true);
  assert.equal(isDuplicate(queue, {
    issueRef: 'TheJollyLaMa/BigNuten_Vanilla#14',
    contributorGithub: owner.github,
    currency: 'BNUT',
    role: 'idea-originator',
  }), false);
});

test('accrual lazily initializes currency fields and keeps issue histories unique', () => {
  const accounts = { contributors: [{ ...owner, bnutPending: 7, artEarned: 3 }] };
  const entries = [
    { issueRef: 'org/repo#1', contributorGithub: owner.github, amount: '5', currency: 'ART', role: 'idea-originator' },
    { issueRef: 'org/repo#1', contributorGithub: owner.github, amount: '2', currency: 'BNUT' },
  ];
  applyAccountAccrual(accounts, entries);
  const account = accounts.contributors[0];
  assert.equal(account.artPending, 5);
  assert.equal(account.artEarned, 3);
  assert.equal(account.bnutPending, 9);
  assert.deepEqual(account.issuesClosed, ['org/repo#1']);
  assert.deepEqual(account.ideasCredited, ['org/repo#1']);
});

test('settlement can filter currency and treats missing currency as BNUT', () => {
  const art = { issueRef: 'org/repo#1', contributorGithub: owner.github, amount: '10', currency: 'ART' };
  const legacyBnut = { issueRef: 'org/repo#1', contributorGithub: owner.github, amount: '20' };
  const queue = { pending: [art, legacyBnut], settled: [] };
  const accounts = { contributors: [{ ...owner, artPending: 10, bnutPending: 20, bnutEarned: 4 }] };
  const settled = settleEntries({
    queue,
    accounts,
    currency: 'BNUT',
    settledAt: '2026-09-16T01:00:00.000Z',
    settledBy: owner.github,
  });
  assert.equal(settled.length, 1);
  assert.equal(queue.pending[0].currency, 'ART');
  assert.equal(accounts.contributors[0].bnutPending, 0);
  assert.equal(accounts.contributors[0].bnutEarned, 24);
  assert.equal(accounts.contributors[0].artPending, 10);
});