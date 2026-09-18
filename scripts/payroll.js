const BOUNTY_LABEL_RE = /^bounty:\s*(\d+(?:\.\d+)?)\s*\$?(ART|BNUT)$/i;
const TEST_BOUNTY_LABEL_RE = /^test-bounty:\s*(\d+(?:\.\d+)?)\s*\$?(ART|BNUT)$/i;
const IDEA_CREDIT_LABEL_RE = /^idea-credit:\s*@?([-\w]+)$/i;
const CLOSING_ISSUE_RE = /(?:closes?|fixes?|resolves?)\s+(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#(\d+)/gi;
const TITLE_ISSUE_RE = /#(\d+)/g;
const SUPPORTED_CURRENCIES = new Set(['ART', 'BNUT']);

const CONTRIBUTOR_ALIASES = {
  'copilot-swe-agent': 'copilot',
  'copilot-swe-agent[bot]': 'copilot',
};

function normalizeLogin(login) {
  const value = String(login || '').trim();
  return CONTRIBUTOR_ALIASES[value.toLowerCase()] || value;
}

function normalizeCurrency(currency) {
  const value = String(currency || 'BNUT').trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(value)) throw new Error(`Unsupported payout currency: ${currency}`);
  return value;
}

function labelNames(issue) {
  return (issue.labels || []).map(label => typeof label === 'string' ? label : label.name);
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Invalid payout amount: ${value}`);
  return String(Number(amount.toFixed(8)));
}

function parseAmountLabels(issue, pattern = BOUNTY_LABEL_RE) {
  const byCurrency = new Map();
  for (const label of labelNames(issue)) {
    const match = String(label || '').match(pattern);
    if (!match) continue;
    if (Number(match[1]) <= 0) continue;
    const currency = normalizeCurrency(match[2]);
    if (byCurrency.has(currency)) {
      throw new Error(`Ambiguous ${currency} bounty labels: "${byCurrency.get(currency).label}" and "${label}"`);
    }
    byCurrency.set(currency, { label, amount: normalizeAmount(match[1]), currency });
  }
  return [...byCurrency.values()];
}

function parseAmountLabel(issue, pattern = BOUNTY_LABEL_RE) {
  return parseAmountLabels(issue, pattern)[0] || null;
}

function parseIdeaCredit(issue) {
  for (const label of labelNames(issue)) {
    const match = String(label || '').match(IDEA_CREDIT_LABEL_RE);
    if (match) return normalizeLogin(match[1]);
  }
  return null;
}

function extractIssueNumbers({ body = '', title = '', linked = [], override = [] } = {}) {
  const numbers = new Set();
  for (const value of override) {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) numbers.add(number);
  }
  for (const match of String(body).matchAll(CLOSING_ISSUE_RE)) numbers.add(Number(match[1]));
  for (const match of String(title).matchAll(TITLE_ISSUE_RE)) numbers.add(Number(match[1]));
  for (const value of linked) {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) numbers.add(number);
  }
  return [...numbers];
}

function splitIdeaCredit(amount) {
  const total = Number(normalizeAmount(amount));
  return {
    implementer: normalizeAmount(total * 0.8),
    originator: normalizeAmount(total * 0.2),
  };
}

function findAccount(accounts, login) {
  const normalized = normalizeLogin(login).toLowerCase();
  return (accounts.contributors || []).find(
    account => String(account.github || '').trim().toLowerCase() === normalized
  );
}

function requireWhitelistedAccount(accounts, candidates, description) {
  for (const login of candidates) {
    const account = findAccount(accounts, login);
    if (account && String(account.walletAddress || '').trim()) return account;
  }
  throw new Error(`No whitelisted wallet found for ${description}: ${candidates.filter(Boolean).join(', ') || 'none'}`);
}

function entryRole(entry) {
  return String(entry.role || 'contributor').trim().toLowerCase();
}

function entryCurrency(entry) {
  return normalizeCurrency(entry.currency);
}

function isDuplicate(queue, candidate) {
  const candidateIssueRef = String(candidate.issueRef || '').trim();
  const candidateGithub = String(candidate.contributorGithub || '').trim().toLowerCase();
  const candidateRole = entryRole(candidate);
  const candidateCurrency = entryCurrency(candidate);

  return [...(queue.pending || []), ...(queue.settled || [])].some(entry => {
    if (String(entry.issueRef || '').trim() !== candidateIssueRef) return false;
    if (entryCurrency(entry) !== candidateCurrency) return false;

    const entryGithub = String(entry.contributorGithub || '').trim().toLowerCase();
    const entryRoleName = entryRole(entry);
    if (entryGithub === candidateGithub && entryRoleName === candidateRole) return true;

    const ideaRoles = new Set(['implementer', 'idea-originator']);
    return entryGithub === candidateGithub && ideaRoles.has(entryRoleName) && ideaRoles.has(candidateRole);
  });
}

function pickWhitelistedTester({ assigneeLogins = [], accounts, commenter = '' } = {}) {
  const eligible = assigneeLogins
    .map(login => normalizeLogin(login))
    .filter(Boolean)
    .map(login => findAccount(accounts, login))
    .filter(account => account && String(account.walletAddress || '').trim());
  if (eligible.length === 0) throw new Error('No assigned tester on this issue has a whitelisted wallet.');

  const commenterKey = normalizeLogin(commenter).toLowerCase();
  const commenterMatch = eligible.find(
    account => String(account.github || '').trim().toLowerCase() === commenterKey
  );
  if (commenterMatch) return commenterMatch;
  if (eligible.length > 1) {
    throw new Error(`Multiple assigned testers have whitelisted wallets: ${eligible.map(account => account.github).join(', ')}`);
  }
  return eligible[0];
}

function createBountyEntries({ issue, pr, accounts, queue, repoSlug, queuedAt, queuedBy }) {
  const bounties = parseAmountLabels(issue);
  if (bounties.length === 0) return { entries: [], reason: 'missing-bounty-label' };

  const prAuthor = normalizeLogin(pr.user && pr.user.login);
  const assignees = (issue.assignees || []).map(assignee => normalizeLogin(assignee.login));
  const candidates = [...new Set([prAuthor, ...assignees].filter(Boolean))];
  const implementer = requireWhitelistedAccount(accounts, candidates, 'PR author or issue assignee');
  const ideaOriginatorLogin = parseIdeaCredit(issue);
  const originator = ideaOriginatorLogin
    ? requireWhitelistedAccount(accounts, [ideaOriginatorLogin], 'idea originator')
    : null;
  const issueRef = `${repoSlug}#${issue.number}`;
  const entries = [];

  for (const bounty of bounties) {
    const common = { issueRef, currency: bounty.currency, queuedAt, queuedBy, prNumber: pr.number };
    if (originator) {
      const split = splitIdeaCredit(bounty.amount);
      entries.push(
        {
          ...common,
          contributor: implementer.walletAddress,
          contributorGithub: implementer.github,
          amount: split.implementer,
          role: 'implementer',
        },
        {
          ...common,
          contributor: originator.walletAddress,
          contributorGithub: originator.github,
          amount: split.originator,
          role: 'idea-originator',
        }
      );
    } else {
      entries.push({
        ...common,
        contributor: implementer.walletAddress,
        contributorGithub: implementer.github,
        amount: bounty.amount,
      });
    }
  }

  const newEntries = entries.filter(entry => !isDuplicate(queue, entry));
  return {
    entries: newEntries,
    skippedDuplicates: entries.length - newEntries.length,
    bountyLabels: bounties.map(bounty => bounty.label),
  };
}

function accountField(currency, suffix) {
  return `${currency.toLowerCase()}${suffix}`;
}

function applyAccountAccrual(accounts, entries) {
  for (const entry of entries) {
    const account = findAccount(accounts, entry.contributorGithub);
    if (!account) continue;
    const pendingField = accountField(entryCurrency(entry), 'Pending');
    account[pendingField] = Number(((Number(account[pendingField]) || 0) + Number(entry.amount)).toFixed(8));
    if (!Array.isArray(account.issuesClosed)) account.issuesClosed = [];
    if (!account.issuesClosed.includes(entry.issueRef)) account.issuesClosed.push(entry.issueRef);
    if (entryRole(entry) === 'idea-originator') {
      if (!Array.isArray(account.ideasCredited)) account.ideasCredited = [];
      if (!account.ideasCredited.includes(entry.issueRef)) account.ideasCredited.push(entry.issueRef);
    }
  }
}

function settleEntries({
  queue,
  accounts,
  contributorGithub = '',
  issueRef = '',
  currency = '',
  txHash = '',
  settledAt,
  settledBy,
}) {
  const contributorFilter = String(contributorGithub).trim().toLowerCase();
  const issueFilter = String(issueRef).trim();
  const currencyFilter = currency ? normalizeCurrency(currency) : '';
  const matches = entry =>
    (!contributorFilter || String(entry.contributorGithub || '').trim().toLowerCase() === contributorFilter) &&
    (!issueFilter || String(entry.issueRef || '').trim() === issueFilter) &&
    (!currencyFilter || entryCurrency(entry) === currencyFilter);
  const selected = (queue.pending || []).filter(matches);
  queue.pending = (queue.pending || []).filter(entry => !matches(entry));

  const settled = selected.map(entry => ({
    ...entry,
    settledAt,
    settledBy,
    ...(txHash ? { txHash } : {}),
  }));
  if (!Array.isArray(queue.settled)) queue.settled = [];
  queue.settled.push(...settled);

  for (const entry of settled) {
    const account = findAccount(accounts, entry.contributorGithub);
    if (!account) continue;
    const normalizedCurrency = entryCurrency(entry);
    const pendingField = accountField(normalizedCurrency, 'Pending');
    const earnedField = accountField(normalizedCurrency, 'Earned');
    account[pendingField] = Number(Math.max(0, (Number(account[pendingField]) || 0) - Number(entry.amount)).toFixed(8));
    account[earnedField] = Number(((Number(account[earnedField]) || 0) + Number(entry.amount)).toFixed(8));
  }
  return settled;
}

module.exports = {
  BOUNTY_LABEL_RE,
  TEST_BOUNTY_LABEL_RE,
  SUPPORTED_CURRENCIES,
  applyAccountAccrual,
  createBountyEntries,
  entryCurrency,
  extractIssueNumbers,
  findAccount,
  isDuplicate,
  normalizeAmount,
  normalizeCurrency,
  normalizeLogin,
  parseAmountLabel,
  parseAmountLabels,
  parseIdeaCredit,
  pickWhitelistedTester,
  settleEntries,
  splitIdeaCredit,
};