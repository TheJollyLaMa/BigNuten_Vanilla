const fs = require('fs');
const path = require('path');
const { renderBigNutenComment } = require('./commentArt');
const { githubRequest, postIssueComment, repositoryCoordinates } = require('./githubApi');
const { TEST_BOUNTY_LABEL_RE, applyAccountAccrual, isDuplicate, normalizeLogin, parseAmountLabels, pickWhitelistedTester } = require('./payroll');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'payroll-queue.json');
const ACCOUNTS_PATH = path.join(ROOT, 'contributor-accounts.json');
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function writeJson(filePath, value) { fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`); }
function buildTestingComment(message, issueNumber, commentType) { return renderBigNutenComment(message, issueNumber, commentType); }

async function main() {
  const { owner, repo } = repositoryCoordinates();
  const event = readJson(process.env.GITHUB_EVENT_PATH);
  const comment = String(event.comment && event.comment.body || '').trim();
  const commenter = normalizeLogin(event.comment && event.comment.user && event.comment.user.login);
  const issueNumber = Number(event.issue && event.issue.number);
  const issue = await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  const bounties = parseAmountLabels(issue, TEST_BOUNTY_LABEL_RE);
  if (bounties.length === 0) return;
  const assigneeLogins = (issue.assignees || []).map(assignee => normalizeLogin(assignee.login));
  if (comment.startsWith('/test-complete')) {
    const assigned = assigneeLogins.some(login => login.toLowerCase() === commenter.toLowerCase());
    const message = assigned
      ? `✅ Thanks @${commenter}. Your testing work is awaiting owner approval with \`/test-approved\`.`
      : '⚠️ Only assigned testers can use `/test-complete`.';
    await postIssueComment(owner, repo, issueNumber, buildTestingComment(message, issueNumber, assigned ? 'test-complete' : 'test-rejected'));
    return;
  }
  if (!comment.startsWith('/test-approved')) return;
  if (commenter.toLowerCase() !== owner.toLowerCase()) {
    await postIssueComment(owner, repo, issueNumber, buildTestingComment('⚠️ Only the repository owner can approve testing payouts.', issueNumber, 'test-rejected'));
    return;
  }
  const queue = readJson(QUEUE_PATH);
  const accounts = readJson(ACCOUNTS_PATH);
  if (!Array.isArray(queue.pending)) queue.pending = [];
  if (!Array.isArray(queue.settled)) queue.settled = [];
  const tester = pickWhitelistedTester({ assigneeLogins, accounts, commenter });
  const entries = bounties.map(bounty => ({
    issueRef: `${owner}/${repo}#${issueNumber}`, contributor: tester.walletAddress,
    contributorGithub: tester.github, amount: bounty.amount, currency: bounty.currency, role: 'tester',
    queuedAt: new Date().toISOString(), queuedBy: process.env.GITHUB_ACTOR || commenter,
  })).filter(entry => !isDuplicate(queue, entry));
  if (entries.length === 0) return;
  queue.pending.push(...entries);
  applyAccountAccrual(accounts, entries);
  writeJson(QUEUE_PATH, queue);
  writeJson(ACCOUNTS_PATH, accounts);
  const summary = entries.map(entry => `**${entry.amount} ${entry.currency}**`).join(' and ');
  await postIssueComment(owner, repo, issueNumber, buildTestingComment(`✅ Queued ${summary} testing bounty for @${tester.github}, pending administrator settlement.`, issueNumber, 'test-approved'));
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { buildTestingComment };