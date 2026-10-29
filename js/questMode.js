import { COMMUNITY_GUIDE_SECTIONS } from './communityGuide.mjs';

export const QUEST_STORAGE_KEY = 'bignuten:quest:v1';
export const QUEST_CHAPTERS = Object.freeze([
  { title: 'Welcome to the nest', sections: ['privacy'], target: '#aesculapius-right', hint: 'The right-hand staff opens the app menu. A DAO is a community coordinating through published rules and shared decisions.' },
  { title: 'Your data, your choice', sections: ['privacy'], target: '#aes-data-btn', hint: 'Open the right-hand menu to find Data Sharing and Data Storage. Looking is not permission to publish; Quest never opens or uploads your records.' },
  { title: 'Understand a challenge', sections: ['challenges', 'joining'], target: '#aes-challenge-btn', hint: 'Monthly Challenge is in the right-hand menu. Read the actual rules before any separate participation decision. No joining or stake is needed for this chapter.' },
  { title: 'Coordinate fairly', sections: ['captaining', 'reviews', 'disputes'], target: '#aes-gov-btn', hint: 'Governance is in the right-hand menu. Learn how community review differs from unilateral decisions. Quest casts no votes and creates no proposals.' },
  { title: 'Evidence, not promises', sections: ['awards', 'receipts'], target: '#aes-achieve-btn', hint: 'Achievements is in the right-hand menu. A local tour badge is not a competition award, financial entitlement, or proof of deployed capabilities.' },
  { title: 'Contribute safely', sections: ['issues', 'bounties'], target: '#genie-issue-helper-open', hint: 'Settings contains the model-free issue / idea helper. Use the button below to open a local draft; nothing is submitted for you.' },
  { title: 'Keep learning together', sections: ['privacy', 'issues'], target: '#aes-settings-btn', hint: 'Return through Settings → Quest Mode any time. Completing this reading tour earns only a browser-local keepsake, with no economic or access value.' },
].map(chapter => Object.freeze({ ...chapter, sections: Object.freeze(chapter.sections) })));

const initialState = () => ({ version: 1, enabled: false, chapter: 0, completed: [], badge: false });

export function normalizeQuestState(value) {
  if (!value || value.version !== 1 || typeof value.enabled !== 'boolean'
    || !Number.isInteger(value.chapter) || value.chapter < 0 || value.chapter >= QUEST_CHAPTERS.length
    || !Array.isArray(value.completed) || value.completed.some(index => !Number.isInteger(index) || index < 0 || index >= QUEST_CHAPTERS.length)
    || typeof value.badge !== 'boolean') throw new Error('Invalid Quest progress');
  const completed = [...new Set(value.completed)].sort((a, b) => a - b);
  return { version: 1, enabled: value.enabled, chapter: value.chapter, completed, badge: value.badge && completed.length === QUEST_CHAPTERS.length };
}

// Adapt the guarded browser-storage/progress pattern from Busking's tutorial,
// but surface failures instead of silently claiming progress was saved.
export function readQuestState(storage) {
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    const raw = storage.getItem(QUEST_STORAGE_KEY);
    return { state: raw === null ? initialState() : normalizeQuestState(JSON.parse(raw)), error: '' };
  } catch {
    return { state: initialState(), error: 'Saved progress is unavailable or invalid. Continue in this session, or clear Quest data and try again.' };
  }
}

export function persistQuestState(state, storage) {
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    storage.setItem(QUEST_STORAGE_KEY, JSON.stringify(normalizeQuestState(state)));
    return '';
  } catch {
    return 'Progress could not be saved. Changes and any badge are session-only; reload may restore older progress.';
  }
}

export function clearQuestState(storage) {
  try { if (storage === undefined) storage = globalThis.localStorage; storage.removeItem(QUEST_STORAGE_KEY); return ''; }
  catch { return 'Quest data could not be cleared from this browser. Previously saved progress may return on reload. Check browser storage permissions and retry.'; }
}

export function advanceQuest(state) {
  const next = normalizeQuestState(state);
  next.completed = [...new Set([...next.completed, next.chapter])].sort((a, b) => a - b);
  next.badge = next.completed.length === QUEST_CHAPTERS.length;
  next.chapter = Math.min(next.chapter + 1, QUEST_CHAPTERS.length - 1);
  return next;
}

export function questKey(buffer, event, blocked = false) {
  if (blocked || event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return { buffer: '', enter: false };
  if (event.key === 'Enter') return { buffer: '', enter: buffer === 'bnut' };
  const key = String(event.key).toLowerCase();
  if (!/^[bnut]$/.test(key)) return { buffer: '', enter: false };
  const candidate = buffer + key;
  return { buffer: 'bnut'.startsWith(candidate) ? candidate : key === 'b' ? 'b' : '', enter: false };
}

function node(tag, attributes = {}, text) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

export function initQuestMode() {
  const toggle = document.getElementById('quest-mode-toggle');
  if (!toggle || toggle.dataset.ready) return;
  toggle.dataset.ready = 'true';
  const settingsStatus = document.getElementById('quest-settings-status');
  const badgeLabel = document.getElementById('quest-local-badge');
  // Access to localStorage itself can throw (for example in privacy mode).
  let storage;
  try { storage = globalThis.localStorage; } catch { storage = null; }
  let { state, error } = readQuestState(storage);
  let overlay = null, controller = null, renderController = null, layoutObserver = null, modalObserver = null, previousFocus = null, highlighted = null, buffer = '';
  const visible = element => element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const otherModal = () => [...document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]')]
    .some(element => !overlay?.contains(element) && visible(element));
  function sync() {
    toggle.checked = Boolean(overlay);
    settingsStatus.textContent = error || 'Quest progress stays in this browser only. No wallet, hosted model, health records, uploads, or rewards.';
    badgeLabel.textContent = state.badge ? 'Nest Explorer · local completion badge only (no token, reward, or access value).' : 'No local completion badge yet.';
  }
  function save() { error = persistQuestState(state, storage); sync(); }
  function removeHighlight() {
    highlighted?.classList.remove('quest-highlight');
    highlighted = null;
  }
  function stop({ persist = true, restoreFocus = true } = {}) {
    controller?.abort();
    controller = null;
    renderController?.abort();
    renderController = null;
    layoutObserver?.disconnect();
    layoutObserver = null;
    modalObserver?.disconnect();
    modalObserver = null;
    removeHighlight();
    overlay?.remove();
    overlay = null;
    document.body.classList.remove('quest-mode', 'quest-suspended');
    document.body.style.removeProperty('--quest-bar-height');
    buffer = '';
    state.enabled = false;
    if (persist) save(); else sync();
    if (restoreFocus) {
      const returnTo = previousFocus?.isConnected && visible(previousFocus) ? previousFocus : document.getElementById('aesculapius-right');
      returnTo?.focus();
    }
  }
  function render() {
    renderController?.abort();
    renderController = new AbortController();
    removeHighlight();
    overlay.replaceChildren();
    const chapter = QUEST_CHAPTERS[state.chapter];
    const bar = node('header', { class: 'quest-bar', 'aria-label': 'Quest progress' });
    bar.append(node('span', { id: 'quest-chapter-label' }, `Chapter ${state.chapter + 1} of 7 · ${chapter.title}`));
    bar.append(node('progress', { max: '7', value: String(state.completed.length), 'aria-label': `${state.completed.length} of 7 chapters read` }));
    bar.append(node('span', {}, `${state.completed.length}/7 read · local only`));
    const button = (id, label, action) => {
      const element = node('button', { id, type: 'button' }, label);
      element.addEventListener('click', action, { signal: renderController.signal });
      return element;
    };
    bar.append(button('quest-exit', 'Exit Quest', () => stop()));
    const card = node('dialog', { id: 'quest-card', 'aria-labelledby': 'quest-title', 'aria-describedby': 'quest-safety' });
    card.append(node('h2', { id: 'quest-title', tabindex: '-1' }, `🦉 Nesten: ${chapter.title}`));
    card.append(node('p', { id: 'quest-safety' }, 'Reading tour only. Nothing here connects a wallet, signs, votes, joins, pays, mints, uploads, or claims rewards. Token/role unlock and on-chain rewards are deferred.'));
    card.append(node('p', {}, chapter.hint));
    const guide = node('details');
    guide.open = true;
    guide.append(node('summary', {}, 'Current shared Community Guide'));
    for (const id of chapter.sections) {
      const section = COMMUNITY_GUIDE_SECTIONS.find(section => section.id === id);
      guide.append(node('h3', {}, section.title), node('p', {}, section.text));
    }
    card.append(guide);
    const target = document.querySelector(chapter.target);
    const targetStatus = node('p', { id: 'quest-target-status', role: 'status' },
      visible(target) ? 'The related real UI is outlined. Quest does not activate it.' : 'Related UI is not currently visible or available. Use the menu directions above if you choose; no live data or capability is assumed.');
    card.append(targetStatus);
    if (visible(target)) {
      highlighted = target;
      target.classList.add('quest-highlight');
      card.append(button('quest-find-ui', 'Find related UI (focus only, no action)', () => target.focus({ preventScroll: true })));
    }
    if (state.chapter === 5) card.append(button('quest-issue-helper', 'Open local issue / idea helper (exits Quest)', () => {
      stop({ restoreFocus: false });
      document.getElementById('aesculapius-right')?.focus();
      document.dispatchEvent(new CustomEvent('bn:issue-helper'));
    }));
    if (state.chapter === 6) {
      const check = node('fieldset');
      check.append(node('legend', {}, 'Quick check: what does finishing this reading tour earn?'));
      for (const [value, text] of [['local', 'Only a local keepsake with no economic or access value'], ['reward', 'BNUT, a DNFT, or governance access']]) {
        const label = node('label');
        label.append(node('input', { type: 'radio', name: 'quest-check', value }), document.createTextNode(text));
        check.append(label);
      }
      const feedback = node('p', { id: 'quest-check-feedback', role: 'status' });
      check.append(button('quest-check-answer', 'Check my answer (not saved)', () => {
        const answer = check.querySelector('input:checked')?.value;
        feedback.textContent = answer === 'local' ? 'Correct. This is a local reading keepsake only.' : answer ? 'Not quite: token/role unlock and on-chain rewards are deferred. No financial or access entitlement is earned.' : 'Choose an answer first.';
      }), feedback);
      card.append(check);
    }
    const selectLabel = node('label', { for: 'quest-chapter-select' }, 'Read a chapter ');
    const select = node('select', { id: 'quest-chapter-select' });
    QUEST_CHAPTERS.forEach((chapter, index) => select.append(node('option', { value: String(index) }, `${index + 1}. ${chapter.title}`)));
    select.value = String(state.chapter);
    select.addEventListener('change', () => { state.chapter = Number(select.value); save(); render(); }, { signal: renderController.signal });
    selectLabel.append(select);
    card.append(selectLabel);
    const actions = node('div', { class: 'quest-actions' });
    const back = button('quest-back', 'Previous chapter', () => { state.chapter -= 1; save(); render(); });
    back.disabled = state.chapter === 0;
    actions.append(back, button('quest-next', state.chapter === 6 ? 'Mark read · finish locally' : 'Mark read · next chapter', () => {
      state = advanceQuest(state); save(); render();
    }));
    actions.append(button('quest-reset', 'Reset progress and badge', reset));
    card.append(actions, node('p', { id: 'quest-storage-status', role: 'status' }, error || 'Progress saved locally.'),
      node('p', { id: 'quest-badge', role: 'status' }, state.badge ? 'Nest Explorer · local completion badge. No reward, token, or access value.' : 'Read all seven chapters to earn a local-only completion badge.'),
      node('p', {}, 'Use Tab to move freely between Quest and the app. Previous/next buttons or arrow keys inside this card navigate; Escape exits. No focus trap.'));
    overlay.append(bar, card);
    layoutObserver?.disconnect();
    layoutObserver = new ResizeObserver(() => {
      document.body.style.setProperty('--quest-bar-height', `${bar.getBoundingClientRect().height}px`);
    });
    layoutObserver.observe(bar);
    card.show();
    card.querySelector('h2').focus({ preventScroll: true });
  }
  function start() {
    if (overlay) return;
    previousFocus = document.activeElement;
    const settings = document.getElementById('settings-modal');
    if (visible(settings)) document.getElementById('settings-modal-close')?.click();
    if (otherModal()) { error = 'Close the current dialog before starting Quest Mode.'; sync(); return; }
    state.enabled = true;
    overlay = node('section', { id: 'quest-overlay', 'aria-label': 'Local educational Quest Mode' });
    controller = new AbortController();
    document.body.append(overlay);
    document.body.classList.add('quest-mode');
    save();
    render();
    modalObserver = new MutationObserver(records => {
      if (!records.some(record => !overlay.contains(record.target) && (record.type === 'childList'
        || record.target.matches?.('dialog, [role="dialog"], [aria-modal="true"]')))) return;
      const suspended = otherModal();
      if (overlay.hidden !== suspended) overlay.hidden = suspended;
      document.body.classList.toggle('quest-suspended', suspended);
    });
    modalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'hidden'] });
    document.addEventListener('keydown', event => {
      if (event.isComposing || event.defaultPrevented || otherModal()) return;
      if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stop(); }
      else if (overlay.contains(event.target) && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'ArrowLeft' && state.chapter > 0) { state.chapter -= 1; save(); render(); }
        if (event.key === 'ArrowRight') { state = advanceQuest(state); save(); render(); }
      }
    }, { capture: true, signal: controller.signal });
  }
  function reset() { state = { ...initialState(), enabled: Boolean(overlay) }; save(); if (overlay) render(); }
  toggle.addEventListener('change', () => toggle.checked ? start() : stop());
  document.getElementById('quest-settings-reset').addEventListener('click', reset);
  document.getElementById('quest-settings-clear').addEventListener('click', () => {
    stop({ persist: false, restoreFocus: false });
    state = initialState();
    error = clearQuestState(storage);
    sync();
  });
  document.addEventListener('keydown', event => {
    if (overlay) return;
    const blocked = otherModal() || Boolean(event.target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="button"], [role="menuitem"]'));
    const result = questKey(buffer, event, blocked);
    buffer = result.buffer;
    if (result.enter) { event.preventDefault(); start(); }
  });
  // Break the sequence across focus changes without an idle/background timer.
  document.addEventListener('focusin', () => { buffer = ''; });
  window.addEventListener('blur', () => { buffer = ''; });
  sync();
  if (state.enabled) start();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initQuestMode, { once: true });
  else initQuestMode();
}
