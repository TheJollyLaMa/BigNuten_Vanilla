/** Hosted AI opt-in is separate from public community data-sharing consent. */
const CONSENT_PREFIX = 'genieHostedConsent:v1:';
const HOSTED_LABELS = { 'github-models': 'GitHub Models', openai: 'OpenAI' };
let revision = 0;
const pending = new Map();

function consentKey(backend, scope = 'health') {
  return scope === 'community'
    ? `${CONSENT_PREFIX}community:${backend}`
    : `${CONSENT_PREFIX}${backend}`;
}

export function geniePrivacyNotice(backend, scope = 'health') {
  if (backend === 'webllm') {
    return scope === 'community'
      ? 'WebLLM processes your message and shared Community Guide text locally in your browser; no health logs or Genie memory are included. They are not sent to a hosted AI provider. The model download requires a network connection.'
      : 'WebLLM processes your prompts and health context locally in your browser; they are not sent to a hosted AI provider. The model download requires a network connection.';
  }
  if (scope === 'community') {
    return `${HOSTED_LABELS[backend] || backend} is a hosted AI provider. After your permission, your message and the shared Community Guide text are sent to that provider for processing. Community Guide mode includes no health logs or Genie memory by default. This permission is separate from Health companion permission. Cancel sends nothing. You can revoke permission in Settings → Genie AI; revocation cannot recall data already sent.`;
  }
  return `${HOSTED_LABELS[backend] || backend} is a hosted AI provider. After your permission, your message, included health logs, and Genie memory are sent to that provider for processing, subject to its policies. Cancel sends nothing. You can revoke permission in Settings → Genie AI; revocation cannot recall data already sent.`;
}

export function hasGenieHostedConsent(backend, scope = 'health') {
  return Boolean(HOSTED_LABELS[backend]) && localStorage.getItem(consentKey(backend, scope)) === 'allowed';
}

export function revokeGenieHostedConsent() {
  for (const backend of Object.keys(HOSTED_LABELS)) {
    localStorage.removeItem(consentKey(backend, 'health'));
    localStorage.removeItem(consentKey(backend, 'community'));
  }
  revision++;
}

export async function ensureGenieHostedConsent(backend, categories, request = showConsentDialog, scope = 'health') {
  if (backend === 'webllm') return 'allow';
  if (!HOSTED_LABELS[backend]) return 'cancel';
  if (hasGenieHostedConsent(backend, scope)) return 'allow';
  const key = `${scope}:${backend}`;
  if (pending.has(key)) return pending.get(key);
  const started = revision;
  const permission = (async () => {
    const action = await request(backend, categories, scope);
    // Resetting permission while a dialog is open must not re-grant it.
    if (started !== revision) return 'cancel';
    if (action === 'allow') localStorage.setItem(consentKey(backend, scope), 'allowed');
    return action;
  })();
  pending.set(key, permission);
  try { return await permission; }
  finally { if (pending.get(key) === permission) pending.delete(key); }
}

function showConsentDialog(backend, categories, scope = 'health') {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'genie-consent-dialog';
    dialog.className = 'genie-consent-dialog';
    // The dashboard closes panels on outside clicks; keep the initiating chat open.
    dialog.addEventListener('click', event => event.stopPropagation());
    dialog.setAttribute('aria-labelledby', 'genie-consent-title');
    dialog.setAttribute('aria-describedby', 'genie-consent-notice');
    const title = document.createElement('h2');
    title.id = 'genie-consent-title';
    title.textContent = scope === 'community'
      ? `Share Community Guide text with ${HOSTED_LABELS[backend]}?`
      : `Share health context with ${HOSTED_LABELS[backend]}?`;
    const notice = document.createElement('p');
    notice.id = 'genie-consent-notice';
    notice.textContent = geniePrivacyNotice(backend, scope);
    const label = document.createElement('p');
    label.textContent = 'This request includes:';
    const list = document.createElement('ul');
    for (const category of categories) {
      const item = document.createElement('li');
      item.textContent = category;
      list.appendChild(item);
    }
    const future = document.createElement('p');
    future.textContent = 'Allow remembers permission for this backend on this browser, including future enabled log categories, messages and memory. Use the Data controls to limit logs. Local WebLLM requires a model download and resending your question.';
    const actions = document.createElement('div');
    const finish = action => {
      dialog.close();
      dialog.remove();
      previousFocus?.focus();
      resolve(action);
    };
    for (const [action, text] of [['allow', 'Allow'], ['local', 'Use local WebLLM instead'], ['cancel', 'Cancel']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.consentAction = action;
      button.textContent = text;
      button.addEventListener('click', () => finish(action));
      actions.appendChild(button);
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish('cancel'); });
    dialog.append(title, notice, label, list, future, actions);
    document.body.appendChild(dialog);
    dialog.showModal();
    actions.lastElementChild.focus();
  });
}
