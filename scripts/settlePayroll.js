const fs = require('fs');
const path = require('path');
const { renderBigNutenComment } = require('./commentArt');
const { postIssueComment, repositoryCoordinates } = require('./githubApi');
const { settleEntries } = require('./payroll');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'payroll-queue.json');
const ACCOUNTS_PATH = path.join(ROOT, 'contributor-accounts.json');
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function writeJson(filePath, value) { fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`); }

function buildSettlementComment({ entries, actor, txHash, issueNumber }) {
  const totals = new Map();
  for (const entry of entries) {
    const currency = entry.currency || 'BNUT';
    totals.set(currency, (totals.get(currency) || 0) + Number(entry.amount));
  }
  const summary = [...totals].map(([currency, amount]) => `${amount} ${currency}`).join(', ');
  return renderBigNutenComment([
    `✅ Settled ${entries.length} payroll entr${entries.length === 1 ? 'y' : 'ies'} (${summary}) by @${actor}.`,
    txHash ? `🔗 Tx: ${txHash}` : '',
  ].filter(Boolean).join('\n'), issueNumber, 'settlement');
}

async function main() {
  const { owner, repo } = repositoryCoordinates();
  const issueRef = String(process.env.INPUT_ISSUE_REF || '').trim();
  const txHash = String(process.env.INPUT_TX_HASH || '').trim();
  const queue = readJson(QUEUE_PATH);
  const accounts = readJson(ACCOUNTS_PATH);
  const entries = settleEntries({
    queue, accounts, issueRef, txHash,
    contributorGithub: String(process.env.INPUT_CONTRIBUTOR_GITHUB || '').trim(),
    currency: String(process.env.INPUT_CURRENCY || '').trim(),
    settledAt: new Date().toISOString(), settledBy: process.env.GITHUB_ACTOR || 'github-actions[bot]',
  });
  if (entries.length === 0) return;
  writeJson(QUEUE_PATH, queue);
  writeJson(ACCOUNTS_PATH, accounts);
  const issueMatch = issueRef.match(/#(\d+)$/);
  if (issueMatch) {
    const issueNumber = Number(issueMatch[1]);
    await postIssueComment(owner, repo, issueNumber, buildSettlementComment({ entries, actor: process.env.GITHUB_ACTOR || 'github-actions[bot]', txHash, issueNumber }));
  }
  console.log(`Settled ${entries.length} payroll entries.`);
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { buildSettlementComment };