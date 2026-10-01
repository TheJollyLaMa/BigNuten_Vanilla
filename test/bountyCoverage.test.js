'use strict';

const assert = require('node:assert/strict');
const { before, describe, it } = require('mocha');

let getBountyCoverage;
let summarizeBountyIssues;

describe('Payroll bounty coverage', () => {
  before(async () => {
    ({ getBountyCoverage, summarizeBountyIssues } = await import('../js/treasury.js'));
  });

  it('summarizes open BNUT and test-bounty labels while ignoring PRs, closed issues, and other tokens', () => {
    const result = summarizeBountyIssues([
      { number: 10, title: 'Feature', state: 'open', html_url: 'https://github.com/example/repo/issues/10', labels: [{ name: 'bounty: 2 BNUT' }, { name: 'test-bounty: 0.5 BNUT' }] },
      { number: 11, title: 'Closed', state: 'closed', labels: [{ name: 'bounty: 10 BNUT' }] },
      { number: 12, title: 'PR', state: 'open', pull_request: {}, labels: [{ name: 'bounty: 8 BNUT' }] },
      { number: 13, title: 'Other token', state: 'open', labels: [{ name: 'bounty: 4 ART' }] },
    ]);

    assert.equal(result.totalBnut, 2.5);
    assert.equal(result.issueCount, 1);
    assert.equal(result.rewardCount, 2);
    assert.equal(result.issues[0].number, 10);
  });

  it('fetches open bounty labels page by page and reports coverage totals', async () => {
    const pages = [];
    const fetchImpl = async url => {
      const page = Number(new URL(url).searchParams.get('page'));
      pages.push(page);
      return {
        ok: true,
        json: async () => page === 1
          ? [
            { number: 20, title: 'Bounty', state: 'open', labels: [{ name: 'bounty: 7 BNUT' }] },
            ...Array.from({ length: 99 }, (_, index) => ({ number: 21 + index, state: 'open', labels: [] })),
          ]
          : [],
      };
    };
    const result = await getBountyCoverage({ forceRefresh: true, fetchImpl });
    assert.equal(result.totalBnut, 7);
    assert.equal(result.issueCount, 1);
    assert.deepEqual(pages, [1, 2]);
  });
});
