import { TUTORIAL_CARDS, TUTORIAL_TOURS, tutorialCard, tutorialTour } from './tutorialContent.mjs';
import { COMMUNITY_GUIDE_SECTIONS } from './communityGuide.mjs';

export const RABBIT_STORAGE_KEY = 'bignuten:rabbit-tutorial:v1';
const hasTour = id => TUTORIAL_TOURS.some(tour => tour.id === id);
const hasCard = id => TUTORIAL_CARDS.some(card => card.id === id);

export function createRabbitState() {
  return { version: 1, dismissed: false, activeTour: 'starter', tours: {} };
}

export function normalizeRabbitState(value) {
  if (!value || value.version !== 1 || typeof value.dismissed !== 'boolean'
    || !hasTour(value.activeTour) || !value.tours || typeof value.tours !== 'object'
    || Array.isArray(value.tours)) throw new Error('Invalid tutorial progress');
  const tours = {};
  for (const [id, progress] of Object.entries(value.tours)) {
    const tour = hasTour(id) ? tutorialTour(id) : null;
    if (!tour || !progress || !Number.isInteger(progress.index) || progress.index < 0
      || progress.index > tour.cardIds.length || !Array.isArray(progress.read)
      || progress.read.some(cardId => !tour.cardIds.includes(cardId))) throw new Error('Invalid tutorial progress');
    tours[id] = { index: progress.index, read: tour.cardIds.filter(cardId => progress.read.includes(cardId)) };
  }
  return { version: 1, dismissed: value.dismissed, activeTour: value.activeTour, tours };
}

export function selectRabbitTour(state, tourId, { restart = false } = {}) {
  const next = normalizeRabbitState(state);
  if (!hasTour(tourId)) throw new Error('Unknown tutorial tour');
  next.activeTour = tourId;
  if (restart || !next.tours[tourId]) next.tours[tourId] = { index: 0, read: [] };
  return next;
}

export function navigateRabbitState(state, direction) {
  const next = selectRabbitTour(state, state.activeTour);
  const tour = tutorialTour(next.activeTour);
  const progress = next.tours[next.activeTour];
  if (!['previous', 'next', 'skip'].includes(direction)) throw new Error('Unknown tutorial navigation');
  if (direction === 'previous') progress.index = Math.max(0, progress.index - 1);
  else if (progress.index < tour.cardIds.length) {
    if (direction === 'next') {
      progress.read = tour.cardIds.filter(id => id === tour.cardIds[progress.index] || progress.read.includes(id));
    }
    progress.index += 1;
  }
  return next;
}

export function readRabbitState(storage) {
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    const raw = storage.getItem(RABBIT_STORAGE_KEY);
    return { state: raw === null ? createRabbitState() : normalizeRabbitState(JSON.parse(raw)), error: '' };
  } catch {
    return { state: createRabbitState(), error: 'Tutorial progress is unavailable or invalid. Continue for this session, or reset tutorial progress and retry.' };
  }
}

export function persistRabbitState(state, storage) {
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    storage.setItem(RABBIT_STORAGE_KEY, JSON.stringify(normalizeRabbitState(state)));
    return '';
  } catch {
    return 'Tutorial progress could not be saved; changes are session-only. Older progress may return after reload.';
  }
}

export function clearRabbitState(storage) {
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    storage.removeItem(RABBIT_STORAGE_KEY);
    return '';
  } catch {
    return 'Tutorial progress could not be cleared. Previously saved progress may return after reload; check browser storage permissions and retry.';
  }
}

// Only reviewed, existing openers belong here; content cannot grant click capabilities.
export const RABBIT_SAFE_OPENERS = Object.freeze({
  '#water-drop-empty': '#water-modal',
  '#water-drop-full': '#water-modal',
  '#log-weight': '#weight-modal',
  '#log-measurements': '#measurements-modal',
  '#log-supplements': '#supplements-modal',
  '#log-exercise': '#exercise-log-modal',
  '#dietBtn': '#dietModal',
  '#dietQuickLogBtn': '#rawFoodModal',
  '#emotion-icon': '#emotion-modal',
  '#chakra-sacral': '#pain-log-modal',
  '#chakra-heart': '#heart-modal',
  '#chakra-throat': '#chanting-modal',
  '#moon-icon': '#moon-modal',
  '#research-open': '#research-experiments-dialog',
  '#gut-health-open': '#gut-health-modal',
  '#aesculapius-right': '#aesculapius-dropdown',
  '[data-panel="recent-foods-list"]': '#recent-foods-list',
  '[data-panel="recent-supplements-list"]': '#recent-supplements-list',
  '#right-panel-toolbar [data-panel="recent-exercises-list"]': '#recent-exercises-list',
  '[data-panel="workout-set-list"]': '#workout-set-list',
});

export function rabbitTargetAvailable(selector, documentRef, visible) {
  if (!Object.hasOwn(RABBIT_SAFE_OPENERS, selector)) return false;
  const target = documentRef.querySelector(selector);
  return Boolean(target && documentRef.querySelector(RABBIT_SAFE_OPENERS[selector])
    && visible(target) && !target.disabled && target.getAttribute('aria-disabled') !== 'true'
    && !(target.form && ['submit', 'image'].includes(target.type))
    && !target.closest('[inert], [aria-disabled="true"]'));
}

function node(tag, attributes = {}, text) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

function mascot() {
  const face = node('span', { class: 'rabbit-mascot', 'aria-hidden': 'true' });
  face.append(node('i', { class: 'rabbit-ear rabbit-ear-left' }), node('i', { class: 'rabbit-ear rabbit-ear-right' }),
    node('i', { class: 'rabbit-face' }), node('i', { class: 'rabbit-nose' }));
  return face;
}

let singleton;
export function initRabbitTutorial() {
  if (singleton) return singleton;
  let storage;
  try { storage = globalThis.localStorage; } catch { storage = null; }
  let { state, error } = readRabbitState(storage);
  let panel = null, observer = null, previousFocus = null, highlighted = null;
  let suspended = false, paused = false, targetMessage = '';
  const visible = element => Boolean(element && !element.closest('[hidden], .hidden, .modal-hidden, [inert], [aria-hidden="true"]')
    && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const otherModal = () => [...document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"], .modal-overlay')]
    .some(element => !panel?.contains(element) && visible(element));
  function syncInvitation() {
    const welcome = document.getElementById('rabbit-tutorial-welcome');
    if (!welcome) return;
    const hidden = state.dismissed || Boolean(panel) || document.body.classList.contains('quest-mode') || otherModal();
    if (welcome.hidden !== hidden) welcome.hidden = hidden;
  }
  function positionInvitation() {
    const welcome = document.getElementById('rabbit-tutorial-welcome');
    const header = document.querySelector('body > header');
    if (welcome && header) welcome.style.setProperty('--rabbit-header-space', `${Math.max(0, header.getBoundingClientRect().bottom)}px`);
  }
  const button = (label, action, attributes = {}) => {
    const element = node('button', { type: 'button', ...attributes }, label);
    element.addEventListener('click', action);
    return element;
  };
  function removeHighlight() {
    highlighted?.classList.remove('rabbit-target-highlight');
    highlighted = null;
  }
  function sync() {
    const status = document.getElementById('rabbit-tutorial-library-status');
    const count = Object.values(state.tours).reduce((sum, tour) => sum + tour.read.length, 0);
    if (status) status.textContent = error || `${count} card reads across your tours. Browser-local reading progress only; no health records or completed logs are tracked.`;
    const welcome = document.getElementById('rabbit-tutorial-welcome');
    if (welcome) {
      syncInvitation();
      if (!welcome.childElementCount) {
        welcome.classList.add('rabbit-welcome');
        const copy = node('div');
        copy.append(node('strong', {}, 'A little curious? Follow the White Rabbit.'),
          node('p', {}, 'A few small steps to find your way. Optional, at your pace; nothing opens until you choose.'),
          node('p', { 'data-rabbit-welcome-status': '', role: 'status' }));
        welcome.append(mascot(), copy, node('button', { type: 'button', 'data-rabbit-tour': 'starter' }, 'Start here'),
          button('Dismiss invitation', () => { state.dismissed = true; save(); }));
      }
      const welcomeStatus = welcome.querySelector('[data-rabbit-welcome-status]');
      if (welcomeStatus) welcomeStatus.textContent = error;
    }
  }
  function save() {
    error = persistRabbitState(state, storage);
    sync();
  }
  function stop({ restoreFocus = true } = {}) {
    observer?.disconnect();
    observer = null;
    removeHighlight();
    panel?.remove();
    panel = null;
    suspended = false;
    paused = false;
    sync();
    if (restoreFocus && !otherModal()) {
      const returnTo = visible(previousFocus) ? previousFocus : document.getElementById('aesculapius-right');
      if (visible(returnTo)) returnTo.focus({ preventScroll: true });
    }
  }
  function focusHeading() { panel?.querySelector('[data-rabbit-heading]')?.focus({ preventScroll: true }); }
  function navigate(direction) {
    state = navigateRabbitState(state, direction);
    targetMessage = '';
    save();
    render();
    focusHeading();
  }
  function render() {
    if (!panel) return;
    removeHighlight();
    panel.replaceChildren();
    panel.hidden = suspended;
    const header = node('header', { class: 'rabbit-header' });
    const title = node('div');
    title.append(node('span', { class: 'rabbit-eyebrow' }, 'WHITE RABBIT · YOUR PACE'),
      node('strong', {}, paused ? 'Ready when you are' : tutorialTour(state.activeTour).title));
    header.append(mascot(), title, button('Exit', () => stop(), { id: 'rabbit-exit', 'aria-label': 'Exit White Rabbit tutorial' }));
    panel.append(header);
    if (paused) {
      panel.append(node('p', {}, 'Your place is kept. Continue the reading tour whenever you are ready.'),
        button('Resume tutorial', () => { paused = false; render(); focusHeading(); }, { id: 'rabbit-resume', class: 'rabbit-primary' }));
      return;
    }
    const tour = tutorialTour(state.activeTour);
    const progress = state.tours[state.activeTour];
    const cardId = tour.cardIds[progress.index];
    const card = hasCard(cardId) ? tutorialCard(cardId) : null;
    const meter = node('div', { class: 'rabbit-progress' });
    meter.append(node('progress', { max: String(tour.cardIds.length), value: String(progress.read.length),
      'aria-label': `${progress.read.length} of ${tour.cardIds.length} cards marked read` }),
    node('span', {}, `${progress.read.length}/${tour.cardIds.length} read`));
    panel.append(meter);
    const content = node('div', { class: 'rabbit-content' });
    if (card) {
      content.append(node('span', { class: 'rabbit-eyebrow' }, `Card ${progress.index + 1} of ${tour.cardIds.length}`),
        node('h2', { id: 'rabbit-title', tabindex: '-1', 'data-rabbit-heading': '' }, card.title),
        node('p', {}, card.body), node('p', { class: 'rabbit-prompt' }, card.prompt));
      if (card.sections?.length) {
        const guide = node('details');
        guide.append(node('summary', {}, 'Read the current Community Guide'));
        for (const id of card.sections) {
          const section = COMMUNITY_GUIDE_SECTIONS.find(item => item.id === id);
          if (section) guide.append(node('h3', {}, section.title), node('p', {}, section.text));
        }
        content.append(guide);
      }
      if (card.target) {
        const available = rabbitTargetAvailable(card.target, document, visible);
        const target = Object.hasOwn(RABBIT_SAFE_OPENERS, card.target) ? document.querySelector(card.target) : null;
        if (available && !suspended) {
          highlighted = target;
          target.classList.add('rabbit-target-highlight');
        }
        content.append(node('p', { id: 'rabbit-status', class: 'rabbit-target-status', role: 'status' }, targetMessage || (available
          ? 'The related control is available. You choose whether to open it; nothing is entered or saved for you.'
          : `Try it is unavailable here: the control is hidden, missing, disabled, or not a reviewed safe opener. Follow the directions above to find it manually, then resume this tour. No menus are opened for you.`)));
        if (available && card.actionLabel) content.append(button(`Try it · ${card.actionLabel}`, () => {
          if (otherModal() || !rabbitTargetAvailable(card.target, document, visible)) {
            targetMessage = 'That control is no longer available. Close any dialog and use the app directions manually.';
            render();
            return;
          }
          paused = true;
          removeHighlight();
          panel.hidden = true;
          try {
            target.click();
            document.dispatchEvent(new CustomEvent('bn:rabbit-target-opened', {
              detail: { tourId: tour.id, cardId: card.id, target: card.target },
            }));
            targetMessage = 'The opener was requested. No log completion is inferred.';
          } catch {
            targetMessage = 'The opener could not be used. Find the control manually; no completion was recorded.';
          }
          suspended = otherModal();
          render();
        }, { id: 'rabbit-try', class: 'rabbit-primary' }));
      }
    } else {
      content.append(node('h2', { id: 'rabbit-title', tabindex: '-1', 'data-rabbit-heading': '' }, 'A good place to pause'),
        node('p', {}, `${progress.read.length} of ${tour.cardIds.length} cards marked read. Skipped cards remain unread. This is reading progress, not proof of any real log, health outcome, reward, or access.`),
        button('Read this tour again', () => {
          state = selectRabbitTour(state, state.activeTour, { restart: true }); save(); render(); focusHeading();
        }));
    }
    panel.append(content);
    const navigation = node('nav', { class: 'rabbit-actions', 'aria-label': 'Tutorial cards' });
    const previous = button('Previous', () => navigate('previous'), { id: 'rabbit-back' });
    previous.disabled = progress.index === 0;
    navigation.append(previous);
    if (card) navigation.append(button('Skip card', () => navigate('skip'), { id: 'rabbit-skip' }),
      button(progress.index === tour.cardIds.length - 1 ? 'Mark read · finish' : 'Mark read · next', () => navigate('next'), { id: 'rabbit-next', class: 'rabbit-primary' }));
    panel.append(navigation);
    const label = node('label', { class: 'rabbit-tour-select' }, 'Choose a tour ');
    const select = node('select', { id: 'rabbit-tour-select', 'aria-label': 'Choose a White Rabbit tour' });
    for (const item of TUTORIAL_TOURS) select.append(node('option', { value: item.id }, item.title));
    select.value = state.activeTour;
    select.addEventListener('change', () => start(select.value));
    label.append(select);
    if (!content.querySelector('#rabbit-status')) panel.append(node('p', { id: 'rabbit-status', class: 'rabbit-footnote', role: 'status' }, 'Reading progress only; no real actions are marked complete.'));
    panel.append(label, node('p', { id: 'rabbit-storage-status', class: 'rabbit-footnote', role: 'status' }, error || 'Reading only · saved in this browser. You make any real entries yourself.'),
      node('p', { class: 'rabbit-footnote' }, 'Use the app freely. This guide yields to dialogs. Escape inside the guide exits; Tab is never trapped.'));
  }
  function syncModal() {
    if (!panel) return;
    const blocked = otherModal();
    if (blocked === suspended) return;
    suspended = blocked;
    if (blocked) paused = true;
    render();
  }
  function start(tourId = 'starter', options = {}) {
    if (!hasTour(tourId)) {
      error = 'That tutorial tour is unavailable. Choose a tour from the tutorial library.';
      sync();
      return false;
    }
    previousFocus = panel ? previousFocus : document.activeElement;
    document.dispatchEvent(new CustomEvent('bn:rabbit-start', { detail: { tourId } }));
    state = selectRabbitTour(state, tourId, options);
    paused = false;
    targetMessage = '';
    if (!panel) {
      panel = node('section', { id: 'rabbit-tutorial', class: 'rabbit-deck', 'aria-label': 'White Rabbit reading tutorial' });
      panel.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !event.defaultPrevented && !otherModal()) {
          event.preventDefault(); event.stopPropagation(); stop();
        }
      });
      document.body.append(panel);
      observer = new MutationObserver(records => {
        if (records.some(record => !panel?.contains(record.target))) syncModal();
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'open', 'hidden', 'aria-hidden', 'aria-modal'] });
    }
    suspended = otherModal();
    paused = suspended;
    save();
    render();
    if (!suspended) focusHeading();
    return true;
  }
  function reset() {
    stop({ restoreFocus: false });
    state = createRabbitState();
    error = clearRabbitState(storage);
    sync();
    return !error;
  }
  document.addEventListener('bn:quest-start', () => { if (panel) stop({ restoreFocus: false }); });
  window.addEventListener('resize', () => { syncModal(); positionInvitation(); syncInvitation(); });
  sync();
  positionInvitation();
  const invitationObserver = new MutationObserver(records => {
    const welcome = document.getElementById('rabbit-tutorial-welcome');
    if (records.some(record => !welcome?.contains(record.target) && !panel?.contains(record.target))) syncInvitation();
  });
  invitationObserver.observe(document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'open', 'hidden', 'aria-hidden', 'aria-modal'] });
  singleton = { start, stop, reset, getState: () => normalizeRabbitState(state) };
  return singleton;
}
