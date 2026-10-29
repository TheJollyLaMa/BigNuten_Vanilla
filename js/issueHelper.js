// Deliberately independent of Genie models, storage, diagnostics and health logs.
export const ISSUE_KINDS = Object.freeze({
  bug: 'Bug report',
  feature: 'Feature idea',
  challenge: 'Challenge proposal',
  metric: 'Metric request',
});
export const ISSUE_LIMITS = Object.freeze({ field: 4000, title: 120, body: 6000, url: 7500 });
const DESTINATION = 'https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/new';
const ADDRESS = /0x[a-f0-9]{40}\b|\b(?:bc1|tb1)[a-z0-9]{25,87}\b|\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b|[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[a-f0-9]{1,4}:){2,}[a-f0-9:]{1,4}\b|::[a-f0-9]{1,4}\b|\b\d{1,6}\s+(?:[\p{L}\d.'-]+\s+){0,5}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|boulevard|blvd)\b/giu;
const CREDENTIAL_LABEL = String.raw`\b[a-z0-9_-]{0,64}(?:authorization|bearer|password|passwd|secret|seed(?:\s+phrase)?|mnemonic|private[\s_-]*key|api[\s_-]*key|client[\s_-]*secret|(?:access|refresh|session)[\s_-]*(?:key|token)|token|credential|jwt)\b`;
const MULTILINE_CREDENTIAL = new RegExp(CREDENTIAL_LABEL + `[ \\t:="'-]*\\r?\\n[\\s\\S]*`, 'gi');
const CREDENTIAL_LINE = new RegExp(CREDENTIAL_LABEL + '[^\\n]*', 'gi');

function text(value, limit, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  if (value.length > limit) throw new Error(`${label} is too long (maximum ${limit} characters).`);
  // Decode pasted URL-escaped credentials before scanning; never let a nested
  // encoding conceal a secret in the final GitHub URL.
  let result = value.normalize('NFKC').replace(/\p{Cf}/gu, '');
  for (let i = 0; i < 4 && /%[a-f0-9]{2}/i.test(result); i++) {
    try { result = decodeURIComponent(result); }
    catch { throw new Error(`${label} contains malformed URL encoding. Remove it before continuing.`); }
  }
  result = result.normalize('NFKC').replace(/\p{Cf}/gu, '');
  if (/%[a-f0-9]{2}/i.test(result)) throw new Error(`${label} contains excessive URL encoding.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uD800-\uDFFF]/u.test(result)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
  return result.trim();
}

function stripSecrets(value) {
  return value
    .replace(/-----BEGIN [^-]*(?:PRIVATE KEY|SECRET)[^-]*-----[\s\S]*?(?:-----END [^-]+-----|$)/gi, '[redacted sensitive text]')
    .replace(MULTILINE_CREDENTIAL, '[redacted sensitive text]')
    .replace(CREDENTIAL_LINE, '[redacted sensitive text]')
    .replace(/\b(?:gh[pousr]_[a-z0-9_]+|github_pat_[a-z0-9_]+|sk-[a-z0-9_-]+|(?:AKIA|ASIA)[A-Z0-9]{16}|xox[baprs]-[a-z0-9-]+)\b/gi, '[redacted sensitive text]')
    .replace(/\beyJ[a-z0-9_-]*\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, '[redacted sensitive text]')
    .replace(/\b[a-z0-9_-]{23,28}\.[a-z0-9_-]{6}\.[a-z0-9_-]{27,40}\b/gi, '[redacted sensitive text]')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s<>]+/gi, '[removed URL]')
    .replace(/(?:0x)?[a-f0-9]{48,}/gi, '[removed key-like data]')
    .replace(/\b[a-z0-9_+/=-]{32,}\b/gi, token => {
      // Only a syntactically valid public EVM address may reach the address gate.
      return /^0x[a-f0-9]{40}$/i.test(token) ? token : '[removed key-like data]';
    });
}

function allowedAddresses(values) {
  if (!Array.isArray(values) || values.length > 10) throw new Error('Keep at most 10 explicit public addresses.');
  return new Set(values.map(value => {
    const candidate = text(value, 160, 'Public address');
    const matches = candidate.match(ADDRESS);
    if (!matches || matches.length !== 1 || matches[0] !== candidate || stripSecrets(candidate) !== candidate) {
      throw new Error('Only exact public addresses are allowed; credentials and keys can never be kept.');
    }
    return candidate;
  }));
}

export function sanitizeIssueText(value, { allowAddresses = [], limit = ISSUE_LIMITS.field, label = 'Text' } = {}) {
  const original = text(value, limit, label);
  const allowed = allowedAddresses(allowAddresses);
  const clean = stripSecrets(original).replace(ADDRESS, match => allowed.has(match) ? match : '[removed address]');
  return { text: clean, redacted: clean !== original };
}

function options(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A draft object is required.');
  if (!Object.hasOwn(ISSUE_KINDS, value.kind)) throw new Error('Choose a supported issue type.');
  return { allowAddresses: value.allowAddresses ?? [] };
}

export function buildIssueDraft(input) {
  const settings = options(input);
  const fields = [
    ['surface', 'Which surface?'],
    ['happened', 'What happened / what is the idea?'],
    ['expected', 'What did you expect / what would improve?'],
    ['steps', 'Steps to reproduce / try the idea'],
  ];
  let redacted = false;
  const parts = fields.map(([key, label]) => {
    const clean = sanitizeIssueText(input[key], { ...settings, label });
    if (!clean.text) throw new Error(`Please answer: ${label}`);
    redacted ||= clean.redacted;
    return `### ${label}\n${clean.text}`;
  });
  const surface = sanitizeIssueText(input.surface, settings).text.replace(/\s+/g, ' ');
  const title = `${ISSUE_KINDS[input.kind]}: ${surface}`.slice(0, ISSUE_LIMITS.title).replace(/[\uD800-\uDBFF]$/, '');
  const body = `## ${ISSUE_KINDS[input.kind]}\n\n${parts.join('\n\n')}`;
  const result = reviewIssueDraft({ ...input, title, body });
  return { ...result, redacted: redacted || result.redacted };
}

// Every edited draft passes through the same gate again. No caller-supplied
// destination, template query, token, automatic diagnostic or model context.
export function reviewIssueDraft(input) {
  const settings = options(input);
  const title = sanitizeIssueText(input.title, { ...settings, limit: ISSUE_LIMITS.title, label: 'Title' });
  const body = sanitizeIssueText(input.body, { ...settings, limit: ISSUE_LIMITS.body, label: 'Draft' });
  if (!title.text || !body.text) throw new Error('Title and draft are required.');
  const url = new URL(DESTINATION);
  url.search = new URLSearchParams({ title: title.text, body: body.text }).toString();
  if (url.href.length > ISSUE_LIMITS.url) throw new Error('The GitHub link is too long. Shorten the draft and review again.');
  return { title: title.text, body: body.text, url: url.href, redacted: title.redacted || body.redacted };
}
