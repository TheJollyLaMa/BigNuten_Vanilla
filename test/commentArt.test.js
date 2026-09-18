const test = require('node:test');
const assert = require('node:assert/strict');
const { ARTWORKS, BIGNUTEN_LOGO_URL, ENS_ETH_LOGO_URL, artworkIndex, renderArtworkTable, renderBigNutenComment, selectArtwork } = require('../scripts/commentArt');
const { buildMergedPayrollComment } = require('../scripts/processMergedBounty');
const { buildTestingComment } = require('../scripts/processTestingBounty');
const { buildSettlementComment } = require('../scripts/settlePayroll');

test('contains 25 unique visible 10x10 branded scenes', () => {
  assert.equal(ARTWORKS.length, 25);
  assert.equal(new Set(ARTWORKS.map(artwork => JSON.stringify(artwork.rows))).size, 25);
  for (const artwork of ARTWORKS) {
    assert.equal(artwork.rows.length, 10);
    artwork.rows.forEach(row => assert.equal(row.length, 10));
    assert.ok(artwork.rows.flat().includes('🥜'));
    assert.ok(artwork.rows.flat().includes('💠'));
  }
});

test('selects scenes deterministically and rotates through all scenes', () => {
  assert.equal(selectArtwork(30, 'merged'), selectArtwork(30, 'merged'));
  const selected = new Set();
  for (let issue = 1; issue <= 100; issue += 1) selected.add(artworkIndex(issue, `event-${issue % 4}`));
  assert.equal(selected.size, 25);
});

test('renders both repo-hosted logos as cells without a dropdown', () => {
  const rendered = renderBigNutenComment('Queued 10 ART.', 30, 'merged');
  assert.ok(rendered.includes(BIGNUTEN_LOGO_URL));
  assert.ok(rendered.includes(ENS_ETH_LOGO_URL));
  assert.doesNotMatch(rendered, /<details>|<summary>|```/);
  const table = renderArtworkTable(selectArtwork(30, 'merged'));
  assert.equal((table.match(/<tr>/g) || []).length, 10);
  assert.equal((table.match(/<td /g) || []).length, 100);
});

test('production comments include currencies and branding', () => {
  const comments = [
    buildMergedPayrollComment({ entries: [{ amount: '20', currency: 'ART', contributorGithub: 'builder', role: 'implementer' }], isManual: false, prNumber: 32, issueNumber: 30 }),
    buildTestingComment('Queued 5 BNUT.', 30, 'test-approved'),
    buildSettlementComment({ entries: [{ amount: '20', currency: 'ART' }, { amount: '5' }], actor: 'TheJollyLaMa', txHash: '0x123', issueNumber: 30 }),
  ];
  assert.match(comments[0], /20 ART/);
  assert.match(comments[1], /5 BNUT/);
  assert.match(comments[2], /20 ART, 5 BNUT/);
  comments.forEach(comment => assert.match(comment, /BigNuten logo/));
});