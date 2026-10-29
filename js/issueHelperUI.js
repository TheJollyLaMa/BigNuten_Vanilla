import { ISSUE_KINDS, ISSUE_LIMITS, buildIssueDraft, reviewIssueDraft } from './issueHelper.js';

function element(tag, attributes = {}, content) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (content) node.textContent = content;
  return node;
}

export function openIssueHelper() {
  if (document.getElementById('issue-helper-dialog')) return;
  const previous = document.activeElement;
  const dialog = element('dialog', { id: 'issue-helper-dialog', 'aria-labelledby': 'issue-helper-title' });
  dialog.addEventListener('click', event => event.stopPropagation());
  const heading = element('h2', { id: 'issue-helper-title' }, 'Genie issue / idea helper');
  const notice = element('p', {}, 'Model-free and local. Nothing is posted, uploaded, saved, or sent to an AI model. No health logs, wallet, diagnostics, or chat history are collected. Do not paste health data, secrets, or personal details. GitHub issues are public: you review and submit there.');
  const warning = element('p', {}, 'Key/credential/URL and address-like text is stripped by default. Detection is conservative, not a guarantee: inspect every word. Only explicit public addresses can be kept; secrets can never be kept.');
  const form = element('form', { autocomplete: 'off', spellcheck: 'false' });
  form.addEventListener('submit', event => event.preventDefault());
  function field(id, label, tag = 'textarea', limit = ISSUE_LIMITS.field) {
    const wrapper = element('label', { for: id }, label);
    const input = element(tag, { id, maxlength: String(limit) });
    wrapper.appendChild(input);
    form.appendChild(wrapper);
    return input;
  }
  const kind = field('issue-helper-kind', 'Issue type', 'select');
  for (const [value, label] of Object.entries(ISSUE_KINDS)) kind.appendChild(element('option', { value }, label));
  const surface = field('issue-helper-surface', 'Which surface? (panel, page, or control)', 'input');
  const happened = field('issue-helper-happened', 'What happened, or what is your idea?');
  const expected = field('issue-helper-expected', 'What did you expect, or what would improve?');
  const steps = field('issue-helper-steps', 'Steps to reproduce or try the idea (say “not applicable” if needed)');
  const optInLabel = element('label', { class: 'issue-helper-check' });
  const optIn = element('input', { id: 'issue-helper-address-opt-in', type: 'checkbox' });
  optInLabel.append(optIn, document.createTextNode('I explicitly want to keep listed public addresses (visible to everyone on GitHub).'));
  form.appendChild(optInLabel);
  const addresses = field('issue-helper-addresses', 'Exact public addresses to keep, one per line (optional; never keys)', 'textarea', 1600);
  addresses.disabled = true;
  const actions = element('div', { class: 'issue-helper-actions' });
  function button(id, label, handler) {
    const node = element('button', { id, type: 'button' }, label);
    node.addEventListener('click', handler);
    return node;
  }
  const status = element('p', { id: 'issue-helper-status', role: 'status' });
  const preview = element('section', { id: 'issue-helper-preview', hidden: '' });
  const previewHeading = element('h3', {}, 'Edit draft, then review');
  const title = element('input', { id: 'issue-helper-draft-title', maxlength: String(ISSUE_LIMITS.title), 'aria-label': 'Draft title' });
  const body = element('textarea', { id: 'issue-helper-draft-body', maxlength: String(ISSUE_LIMITS.body), 'aria-label': 'Draft body', rows: '12' });
  const output = element('pre', { id: 'issue-helper-reviewed', hidden: '' });
  const confirmLabel = element('label', { class: 'issue-helper-check', hidden: '' });
  const confirm = element('input', { id: 'issue-helper-confirm', type: 'checkbox' });
  confirmLabel.append(confirm, document.createTextNode('I reviewed the safe text above; it contains no health data, secrets, or unwanted personal details. Open a public GitHub draft only.'));
  const link = element('a', { id: 'issue-helper-github-link', target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer', hidden: '' }, 'Open prefilled draft on GitHub — I submit there');
  let reviewedUrl = null;
  function invalidate() {
    reviewedUrl = null;
    confirm.checked = false;
    confirmLabel.hidden = true;
    output.hidden = true;
    link.hidden = true;
    link.removeAttribute('href');
  }
  function settings() {
    return { kind: kind.value, allowAddresses: optIn.checked ? addresses.value.split('\n').map(s => s.trim()).filter(Boolean) : [] };
  }
  function run(action) {
    invalidate();
    try {
      const result = action();
      title.value = result.title;
      body.value = result.body;
      preview.hidden = false;
      status.textContent = result.redacted ? 'Sensitive-looking text removed. Check the sanitized draft carefully.' : 'No additional patterns detected. Check manually: filtering cannot detect every secret or health detail.';
      return result;
    } catch (error) {
      status.textContent = error.message;
      return null;
    }
  }
  const draftButton = button('issue-helper-build', 'Create safe draft', () => {
    run(() => buildIssueDraft({ ...settings(), surface: surface.value, happened: happened.value, expected: expected.value, steps: steps.value }));
  });
  const review = button('issue-helper-review', 'Review safe draft and link', () => {
    const result = run(() => reviewIssueDraft({ ...settings(), title: title.value, body: body.value }));
    if (!result) return;
    reviewedUrl = result.url;
    output.textContent = `${result.title}\n\n${result.body}`;
    output.hidden = false;
    confirmLabel.hidden = false;
  });
  confirm.addEventListener('change', () => {
    link.hidden = !confirm.checked || !reviewedUrl;
    if (confirm.checked && reviewedUrl) link.href = reviewedUrl;
    else link.removeAttribute('href');
  });
  // Editing anything invalidates the previously approved outgoing link.
  for (const node of [kind, surface, happened, expected, steps, addresses, title, body]) node.addEventListener('input', invalidate);
  optIn.addEventListener('change', () => { addresses.disabled = !optIn.checked; invalidate(); });
  const close = () => { dialog.close(); dialog.remove(); previous?.focus(); };
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  actions.append(draftButton, button('issue-helper-close', 'Close and discard', close));
  preview.append(previewHeading, title, body, review, output, confirmLabel, link);
  form.append(actions, status, preview);
  dialog.append(heading, notice, warning, form);
  document.body.appendChild(dialog);
  dialog.showModal();
  surface.focus();
}

function init() {
  document.getElementById('genie-issue-helper-open')?.addEventListener('click', openIssueHelper);
  document.addEventListener('bn:issue-helper', openIssueHelper);
  const mount = () => {
    for (const header of document.querySelectorAll('.genie-chat-header, .yoga-genie-chat-header')) {
      if (header.querySelector('.genie-issue-helper-open')) continue;
      const button = element('button', { type: 'button', class: 'genie-issue-helper-open', title: 'Private, model-free issue draft' }, 'Issue / idea');
      button.addEventListener('click', openIssueHelper);
      header.appendChild(button);
    }
  };
  mount();
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
