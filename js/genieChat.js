/**
 * genieChat.js — AI Chat assistant for BigNuten side panels.
 *
 * Supports multiple backends:
 *   • WebLLM (local, private — default offline fallback)
 *   • GitHub Models (Claude 3.5 Sonnet / GPT-4o — hosted)
 *   • OpenAI API (GPT-4o — hosted)
 *
 * Exports:
 *   initGenieChat()   — call once on DOMContentLoaded
 *
 * Behaviour:
 *   • Reads the 'genieEnabled' key in localStorage (true/false).
 *   • When enabled, injects a genie icon button onto document.body, positioned
 *     via getBoundingClientRect() so it hangs off the outer edge of each open
 *     side panel.
 *   • Clicking the icon toggles a chat window that sits ALONGSIDE the panel
 *     (toward the page centre), never on top of it.
 *   • WebLLM (via CDN) is lazy-loaded only when the user first sends a message
 *     and the WebLLM backend is selected.
 *   • Hosted backends (GitHub Models, OpenAI) use the user's API key stored in
 *     localStorage — keys are never hardcoded or logged.
 *   • LLM is strictly data-driven: it only reports what is in the logs and says
 *     "The logs don't show data for that" when information is missing.
 *   • Per-panel open/close state is preserved in localStorage.
 */

const LS_ENABLED      = 'genieEnabled';
const LS_OPEN         = 'genieChatOpen';    // JSON object: { panelId: true/false }
const LS_MODEL_ID     = 'genieModelId';
const LS_BACKEND      = 'genieBackend';     // 'webllm' | 'github-models' | 'openai'
const LS_API_KEY      = 'genieApiKey';      // user-provided key, localStorage only
const LS_MODEL_NAME   = 'genieModelName';   // hosted model name (persisted per-user)
const STORAGE_KEY     = 'fitnessTrackerData';

const DEFAULT_BACKEND = 'github-models'; // default to hosted for best experience

// GitHub Models endpoint (OpenAI-compatible)
const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';

// ── Hosted model catalogues ─────────────────────────────────────────────────
// Each entry: { value: modelId, label: display name }
// Update these lists when providers add/rename models.
const GITHUB_MODELS_LIST = [
  { value: 'gpt-4o',                        label: 'GPT-4o' },
  { value: 'gpt-4o-mini',                   label: 'GPT-4o Mini' },
  { value: 'claude-3-5-sonnet-20241022',     label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-5-haiku-20241022',      label: 'Claude 3.5 Haiku' },
  { value: 'meta-llama-3-3-70b-instruct',   label: 'Llama 3.3 70B' },
  { value: 'mistral-large-2402',             label: 'Mistral Large' },
];

const OPENAI_MODELS_LIST = [
  { value: 'gpt-4o',          label: 'GPT-4o' },
  { value: 'gpt-4o-mini',     label: 'GPT-4o Mini' },
  { value: 'gpt-3.5-turbo',   label: 'GPT-3.5 Turbo' },
];

const DEFAULT_HOSTED_MODEL = 'gpt-4o'; // safe default for both backends

// Context window for hosted models (no 4K cap — use generous budget)
const HOSTED_CONTEXT_TOKENS = 32_000;

// Maximum reply tokens for hosted backends
const HOSTED_MAX_TOKENS = 1200;

// Regex that matches meta-questions about what data Genie has access to.
// Using non-greedy .*? to avoid catastrophic backtracking.
const META_QUESTION_RE = /what\s+data|where.*?find|connected\s+to|where.*?coming\s+from/i;

// WebLLM CDN – pinned to a released version that fully supports Phi-3.5-mini
// and its 128K context window (requires >=0.2.73).
const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm@0.2.73';

// Available models: id → { label, sizeDesc, contextTokens }
// NOTE: All currently published WebLLM WASM backends are limited to 4 096 tokens
// regardless of the model's advertised context length.  We hard-cap at 4 096 here
// so prompts never overflow the runtime.
const GENIE_MODELS = {
  'Phi-3.5-mini-instruct-q4f16_1-MLC': {
    label:         'Phi-3.5-mini (2.2 GB, 4K context)',
    sizeDesc:      '~2.2 GB',
    contextTokens: 4_096,
  },
};

const DEFAULT_MODEL_ID = 'Phi-3.5-mini-instruct-q4f16_1-MLC';

// Panels that live on the LEFT side of the screen.
const LEFT_PANEL_IDS = new Set(['recent-supplements-list', 'recent-foods-list']);

let _engine        = null;
let _engineLoading = false;
let _engineReady   = false;
let _loadedModelId = null;   // which model is currently loaded in the engine

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function initGenieChat() {
  _applyEnabledState();

  // Watch all dashboard-panel class changes to show/hide genie elements.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
      const panel = /** @type {HTMLElement} */ (m.target);
      if (!panel.classList.contains('dashboard-panel')) continue;

      if (panel.classList.contains('panel-visible')) {
        _injectGenieIcon(panel);
      } else {
        _removeGenieElements(panel.id);
      }
    }
  });

  document.querySelectorAll('.dashboard-panel').forEach(panel => {
    observer.observe(panel, { attributes: true });
    if (panel.classList.contains('panel-visible')) {
      _injectGenieIcon(panel);
    }
  });

  // Keep icon/chat positions in sync when the window is resized.
  window.addEventListener('resize', _updateAllPositions);
}

/** Called by the Settings toggle. */
export function setGenieEnabled(enabled) {
  localStorage.setItem(LS_ENABLED, enabled ? 'true' : 'false');
  _applyEnabledState();
}

export function isGenieEnabled() {
  return localStorage.getItem(LS_ENABLED) === 'true';
}

/** Returns the currently selected model ID (persisted in localStorage). */
export function getGenieModelId() {
  const stored = localStorage.getItem(LS_MODEL_ID);
  return (stored && GENIE_MODELS[stored]) ? stored : DEFAULT_MODEL_ID;
}

/** Switch the active model. Resets the engine so it reloads on next use. */
export function setGenieModelId(modelId) {
  if (!GENIE_MODELS[modelId]) return;
  localStorage.setItem(LS_MODEL_ID, modelId);
  // Force engine reload on next message.
  _engine        = null;
  _engineReady   = false;
  _engineLoading = false;
  _loadedModelId = null;
}

/** Returns the map of all available models (id → metadata). */
export function getGenieModels() {
  return GENIE_MODELS;
}

/** Returns the active backend: 'webllm' | 'github-models' | 'openai' */
export function getGenieBackend() {
  const stored = localStorage.getItem(LS_BACKEND);
  return ['webllm', 'github-models', 'openai'].includes(stored)
    ? stored
    : DEFAULT_BACKEND;
}

export function setGenieBackend(backend) {
  localStorage.setItem(LS_BACKEND, backend);
  // Force WebLLM engine reset if switching away from it and back
  if (backend !== 'webllm') {
    _engine        = null;
    _engineReady   = false;
    _engineLoading = false;
    _loadedModelId = null;
  }
}

/**
 * Returns the user's API key from localStorage.
 * The key is stored as plain text in localStorage by design — there is no
 * server-side component. Callers must not log the returned value.
 */
export function getGenieApiKey() {
  return localStorage.getItem(LS_API_KEY) || '';
}

/**
 * Persist or clear the user's API key in localStorage.
 * Stored as plain text — intentional for a purely client-side app with no server.
 */
export function setGenieApiKey(key) {
  if (key) {
    localStorage.setItem(LS_API_KEY, key);
  } else {
    localStorage.removeItem(LS_API_KEY);
  }
}

export function hasGenieApiKey() {
  return !!getGenieApiKey();
}

// ── Hosted model picker helpers ─────────────────────────────────────────────

/** Returns the model list for a given backend (or empty array for webllm). */
export function getHostedModelsForBackend(backend) {
  if (backend === 'github-models') return GITHUB_MODELS_LIST;
  if (backend === 'openai')        return OPENAI_MODELS_LIST;
  return [];
}

/** Returns the persisted hosted model name (or a safe default). */
export function getGenieHostedModelName() {
  const stored  = localStorage.getItem(LS_MODEL_NAME);
  const backend = getGenieBackend();
  const list    = getHostedModelsForBackend(backend);
  // Return stored value if it's still valid for the current backend
  if (stored && list.some(m => m.value === stored)) return stored;
  // Fall back to the safe default
  return DEFAULT_HOSTED_MODEL;
}

/** Persist the hosted model name. */
export function setGenieHostedModelName(name) {
  localStorage.setItem(LS_MODEL_NAME, name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function _applyEnabledState() {
  if (isGenieEnabled()) {
    document.querySelectorAll('.dashboard-panel.panel-visible').forEach(_injectGenieIcon);
    _restoreOpenChats();
  } else {
    document.querySelectorAll('.genie-icon-btn').forEach(el => el.remove());
    document.querySelectorAll('.genie-chat-window').forEach(el => el.remove());
  }
}

function _isLeftPanel(panelId) {
  return LEFT_PANEL_IDS.has(panelId);
}

/** Append a genie icon to document.body and position it on the outer edge of panel. */
function _injectGenieIcon(panel) {
  if (!isGenieEnabled()) return;
  if (document.querySelector(`.genie-icon-btn[data-panel="${panel.id}"]`)) return;

  const btn = document.createElement('button');
  btn.className = 'genie-icon-btn';
  btn.dataset.panel = panel.id;
  btn.setAttribute('aria-label', 'Open Genie AI assistant');
  btn.setAttribute('title', 'Ask your AI Genie 🧞');
  btn.innerHTML = '🧞';

  // stopPropagation so the panel's outside-click handler doesn't close the panel.
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    _toggleChatWindow(panel);
  });

  document.body.appendChild(btn);
  _positionGenieIcon(btn, panel);

  // Restore previously-open chat window for this panel.
  const openState = _loadOpenState();
  if (openState[panel.id]) {
    _openChatWindow(panel);
  }
}

/** Position icon at the true corner of the panel (45° overlap on both edges). */
function _positionGenieIcon(btn, panel) {
  const rect    = panel.getBoundingClientRect();
  const ICON_W  = 36;
  // Half the icon overlaps each edge so the centre sits exactly on the corner.
  const HALF    = ICON_W / 2;

  btn.style.position = 'fixed';
  btn.style.zIndex   = '99999';

  if (_isMobile()) {
    // Mobile panels span full width at the bottom; place icon at the top-right corner.
    btn.style.top  = (rect.top - HALF) + 'px';
    btn.style.left = (rect.right - HALF) + 'px';
  } else if (_isLeftPanel(panel.id)) {
    // Left panel → icon sits at the top-right corner.
    btn.style.top  = (rect.top - HALF) + 'px';
    btn.style.left = (rect.right - HALF) + 'px';
  } else {
    // Right panel → icon sits at the top-left corner.
    btn.style.top  = (rect.top - HALF) + 'px';
    btn.style.left = (rect.left - HALF) + 'px';
  }
}

/** Remove icon + chat from body when a panel is hidden. */
function _removeGenieElements(panelId) {
  document.querySelector(`.genie-icon-btn[data-panel="${panelId}"]`)?.remove();
  const win = document.querySelector(`.genie-chat-window[data-panel="${panelId}"]`);
  if (win) {
    win.remove();
    _saveOpenState(panelId, false);
  }
}

/** Re-position all genie elements (called on window resize). */
function _updateAllPositions() {
  document.querySelectorAll('.genie-icon-btn[data-panel]').forEach(btn => {
    const panelId = btn.dataset.panel;
    const panel   = document.getElementById(panelId);
    if (panel && panel.classList.contains('panel-visible')) {
      _positionGenieIcon(btn, panel);
      const win = document.querySelector(`.genie-chat-window[data-panel="${panelId}"]`);
      if (win) _positionChatWindow(win, panel);
    }
  });
}

function _toggleChatWindow(panel) {
  const existing = document.querySelector(`.genie-chat-window[data-panel="${panel.id}"]`);
  if (existing) {
    _closeChatWindow(panel.id);
  } else {
    _openChatWindow(panel);
  }
}

function _openChatWindow(panel) {
  if (document.querySelector(`.genie-chat-window[data-panel="${panel.id}"]`)) return;

  const win = _buildChatWindow(panel);
  win.dataset.panel = panel.id;
  document.body.appendChild(win);
  _positionChatWindow(win, panel);
  _saveOpenState(panel.id, true);

  const input = win.querySelector('.genie-chat-input');
  if (input) setTimeout(() => input.focus(), 50);
}

function _closeChatWindow(panelId) {
  const win = document.querySelector(`.genie-chat-window[data-panel="${panelId}"]`);
  if (win) {
    win.remove();
    _saveOpenState(panelId, false);
  }
}

/** Position chat window ALONGSIDE the panel (toward the page centre). */
function _positionChatWindow(win, panel) {
  const rect      = panel.getBoundingClientRect();
  const CHAT_W    = 320;
  const GAP       = 8;   // gap between panel edge and chat window
  const TOP_OFFSET = 46; // drop below the genie icon (36px) + small gap

  const rawTop  = rect.top + TOP_OFFSET;
  const top     = Math.max(8, rawTop);
  const maxH    = window.innerHeight - top - 12;

  win.style.position  = 'fixed';
  win.style.width     = CHAT_W + 'px';
  win.style.maxHeight = Math.min(420, maxH) + 'px';
  win.style.top       = top + 'px';
  win.style.zIndex    = '1150';

  if (_isMobile()) {
    // On mobile open chat ABOVE the panel.
    const chatH  = Math.min(420, maxH);
    win.style.top    = Math.max(8, rect.top - chatH - GAP) + 'px';
    win.style.left   = '8px';
    win.style.width  = (window.innerWidth - 16) + 'px';
  } else if (_isLeftPanel(panel.id)) {
    // Left panel → chat opens to its RIGHT (toward centre).
    const left = rect.right + GAP;
    win.style.left = Math.min(left, window.innerWidth - CHAT_W - 10) + 'px';
  } else {
    // Right panel → chat opens to its LEFT (toward centre).
    const left = rect.left - CHAT_W - GAP;
    win.style.left = Math.max(10, left) + 'px';
  }
}

function _isMobile() {
  return window.innerWidth <= 700;
}

function _buildGenieHint() {
  const backend = getGenieBackend();
  const hints = {
    'webllm':        '🔒 Local &amp; private — powered by WebLLM',
    'github-models': '⭐ Powered by GitHub Models (Claude/GPT-4o)',
    'openai':        '🟢 Powered by OpenAI API',
  };
  return hints[backend] || hints['webllm'];
}

function _buildChatWindow(panel) {
  const win = document.createElement('div');
  win.className = 'genie-chat-window';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Genie AI Chat');

  win.innerHTML = `
    <div class="genie-chat-header">
      <span class="genie-chat-title">🧞 Genie Assistant</span>
      <button class="genie-chat-close" aria-label="Close genie chat">✕</button>
    </div>
    <div class="genie-chat-status" aria-live="polite"></div>
    <div class="genie-chat-messages" role="log" aria-live="polite"></div>
    <div class="genie-chat-input-row">
      <textarea class="genie-chat-input" rows="2" placeholder="Ask your Genie…" aria-label="Chat message"></textarea>
      <button class="genie-chat-send" aria-label="Send message">Send</button>
    </div>
    <div class="genie-chat-hint">${_buildGenieHint()}</div>
  `;

  // Prevent clicks inside the chat from bubbling to the document outside-click
  // handler (which would close the side panel).
  win.addEventListener('click', (e) => e.stopPropagation());

  win.querySelector('.genie-chat-close').addEventListener('click', (e) => {
    e.stopPropagation();
    _closeChatWindow(panel.id);
  });

  const sendBtn    = win.querySelector('.genie-chat-send');
  const inputEl    = win.querySelector('.genie-chat-input');
  const messagesEl = win.querySelector('.genie-chat-messages');
  const statusEl   = win.querySelector('.genie-chat-status');

  sendBtn.addEventListener('click', () => _sendMessage(panel.id, inputEl, messagesEl, statusEl));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _sendMessage(panel.id, inputEl, messagesEl, statusEl);
    }
  });

  _appendMessage(messagesEl, 'genie', _getWelcomeMessage(panel.id));

  return win;
}

function _getWelcomeMessage(panelId) {
  const msgs = {
    'recent-supplements-list': "Hi! I'm your supplement Genie 🧞. Ask me what your logs show — e.g. \"What supplements did I take this week?\"",
    'recent-foods-list':       "Hi! I'm your nutrition Genie 🧞. Ask me what the logs say — e.g. \"What did I eat yesterday?\"",
    'recent-exercises-list':   "Hi! I'm your exercise Genie 🧞. Ask me what the logs show — e.g. \"What muscles have I worked this month?\"",
    'workout-set-list':        "Hi! I'm your workout Genie 🧞. Ask me what the logs say — e.g. \"What did I do in my last session?\"",
  };
  return msgs[panelId] || "Hi! I'm your BigNuten Genie 🧞. Ask me what your logs say!";
}

async function _sendMessage(panelId, inputEl, messagesEl, statusEl) {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value    = '';
  inputEl.disabled = true;

  const win     = document.querySelector(`.genie-chat-window[data-panel="${panelId}"]`);
  const sendBtn = win ? win.querySelector('.genie-chat-send') : null;
  if (sendBtn) sendBtn.disabled = true;

  _appendMessage(messagesEl, 'user', text);

  try {
    const backend = getGenieBackend();

    // Only load WebLLM engine if using local backend
    if (backend === 'webllm') {
      const modelId   = getGenieModelId();
      const modelMeta = GENIE_MODELS[modelId] || GENIE_MODELS[DEFAULT_MODEL_ID];
      const sizeDesc  = modelMeta.sizeDesc;

      if (!_engineReady || _loadedModelId !== modelId) {
        statusEl.textContent = `⏳ Loading AI model (first-time download, ${sizeDesc} cached for future use)…`;
        await _loadEngine(statusEl);
      }
    }

    statusEl.textContent = '🧞 Thinking…';
    const reply = await _chat(text, panelId, statusEl);
    _appendMessage(messagesEl, 'genie', reply);
    statusEl.textContent = '';
  } catch (err) {
    console.error('[GenieChat]', err);
    _appendMessage(messagesEl, 'error', `⚠️ Error: ${err.message || 'Unknown error'}`);
    statusEl.textContent = '';
  } finally {
    inputEl.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    inputEl.focus();
  }
}

function _appendMessage(messagesEl, role, text) {
  const div = document.createElement('div');
  div.className = `genie-msg genie-msg-${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebLLM engine
// ─────────────────────────────────────────────────────────────────────────────

async function _loadEngine(statusEl) {
  const modelId = getGenieModelId();

  // If already loaded with the same model, nothing to do.
  if (_engineReady && _loadedModelId === modelId) return;

  // If a different model was requested while loading, let the current load finish
  // then the caller will detect the mismatch and reload.
  if (_engineLoading) {
    await _waitUntilReady();
    return;
  }

  _engineLoading = true;
  _engineReady   = false;
  _engine        = null;

  const sizeDesc = GENIE_MODELS[modelId]?.sizeDesc ?? '';

  try {
    // Lazy-import WebLLM from CDN (code-split; only fetched when first needed).
    const webllm = await import(/* webpackIgnore: true */ WEBLLM_CDN);
    const engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (progress) => {
        if (statusEl) {
          const pct = progress.progress != null
            ? ` (${Math.round(progress.progress * 100)}%)`
            : '';
          statusEl.textContent = `⏳ ${progress.text || 'Loading model…'}${pct}`;
        }
      },
    });
    _engine        = engine;
    _loadedModelId = modelId;
    _engineReady   = true;
    _engineLoading = false;
  } catch (err) {
    _engineLoading = false;
    throw err;
  }
}

function _waitUntilReady(maxWait = 120_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = setInterval(() => {
      if (_engineReady) { clearInterval(check); resolve(); }
      if (Date.now() - start > maxWait) {
        clearInterval(check);
        reject(new Error('Model loading timed out.'));
      }
    }, 500);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Token-budget guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rough token estimator: 1 token ≈ 4 characters (standard heuristic).
 * Errs on the side of over-counting to stay safe.
 */
function _estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Context-window budget constants.
 * We reserve space for system preamble/rules (~700 tokens — includes chat-template
 * overhead of ~200 tokens that WebLLM adds internally) and the reply (~512 tokens),
 * leaving the rest for the data block.
 */
const TOKEN_RESERVE_OVERHEAD = 700;
const TOKEN_RESERVE_REPLY    = 512;
// Fraction of the data budget allocated to the food-log section (the rest goes to weight logs).
const FOOD_SECTION_BUDGET_RATIO = 0.6;
// Minimum token budget to allocate for the weight-log section.
const MIN_WEIGHT_LOG_TOKENS = 200;
// Default look-back window (in days) when the query timeframe is ambiguous.
const DEFAULT_QUERY_DAYS = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Query-context parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a user message for timeframe / data-type hints.
 *
 * Returns { days, label, longitudinal, targetDate } where:
 *   days         – how many calendar days back to include (0 = all time)
 *   label        – human-readable window name used in section headers
 *   longitudinal – true when the user wants long-range statistics (triggers summary mode)
 *   targetDate   – exact YYYY-MM-DD date string when filtering to a single calendar day
 *                  (currently set for "yesterday" queries); null otherwise
 */
function _parseQueryContext(userMessage) {
  const msg = userMessage.toLowerCase();

  if (/\btoday\b/.test(msg))
    return { days: 1,   label: 'today',         longitudinal: false, targetDate: null };
  if (/\byesterday\b/.test(msg)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return { days: 2, label: 'yesterday', longitudinal: false, targetDate: `${yyyy}-${mm}-${dd}` };
  }
  if (/\bthis\s*week\b|\blast\s*7\s*days?\b/.test(msg))
    return { days: 7,   label: 'this week',      longitudinal: false, targetDate: null };
  if (/\blast\s*week\b/.test(msg))
    return { days: 14,  label: 'last week',      longitudinal: false, targetDate: null };
  if (/\bthis\s*month\b|\blast\s*30\s*days?\b/.test(msg))
    return { days: 30,  label: 'this month',     longitudinal: false, targetDate: null };
  if (/\blast\s*month\b|\blast\s*[23]\s*months?\b/.test(msg))
    return { days: 60,  label: 'last month',     longitudinal: false, targetDate: null };
  if (/\bthis\s*year\b|\blast\s*year\b|\ball[- ]?time\b|\bever\b|\bprogress\b|\bhistory\b/.test(msg))
    return { days: 0,   label: 'all time',       longitudinal: true,  targetDate: null };

  // Ambiguous — default to last DEFAULT_QUERY_DAYS days.
  return { days: DEFAULT_QUERY_DAYS, label: `last ${DEFAULT_QUERY_DAYS} days`, longitudinal: false, targetDate: null };
}

/**
 * Filter an array of log entries to those within the last `days` calendar days.
 * If `days === 0`, returns the full array unchanged.
 * If `targetDate` (YYYY-MM-DD) is provided, returns only entries whose date matches
 * that exact calendar day (used for "yesterday" queries).
 * Falls back to comparing any of: timestamp, date, createdAt, loggedAt.
 */
function _filterByTimeframe(arr, days, targetDate = null) {
  if (!arr || arr.length === 0) return [];

  if (targetDate) {
    // Exact calendar-day match — avoids the rolling-window ambiguity for "yesterday".
    return arr.filter(e => {
      const raw = e.timestamp || e.date || e.createdAt || e.loggedAt || 0;
      const d   = new Date(raw);
      const entryDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return entryDate === targetDate;
    });
  }

  if (days === 0) return arr;
  const cutoff = Date.now() - days * 86_400_000;
  return arr.filter(e => {
    const raw = e.timestamp || e.date || e.createdAt || e.loggedAt || 0;
    return new Date(raw).getTime() >= cutoff;
  });
}

/**
 * Compute a compact statistics summary (count / min / max / avg) for a numeric
 * field across a log array.
 *
 * @param {Array<Object>} arr          – array of log entry objects
 * @param {string}        numericField – property name that holds the numeric value
 * @param {string}        label        – prefix shown in the returned string
 * @returns {string|null} A single-line summary string, or null if arr is empty.
 */
function _buildNumericSummary(arr, numericField, label) {
  if (!arr || arr.length === 0) return null;
  const values = arr
    .map(e => parseFloat(e[numericField]))
    .filter(v => !isNaN(v));
  if (values.length === 0) return `${label}: ${arr.length} entries (no numeric values found)`;
  const min = Math.min(...values).toFixed(1);
  const max = Math.max(...values).toFixed(1);
  const avg = (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
  return `${label}: ${arr.length} entries — min ${min}, max ${max}, avg ${avg}`;
}

/**
 * Build data sections for the given panel, automatically trimming entries to
 * fit within `budgetTokens`.
 *
 * @param {string} panelId
 * @param {number} budgetTokens   – token budget available for data content
 * @param {string} [userMessage]  – raw user query (used to detect timeframe)
 * @returns {{ sections: string[], trimmed: boolean, longitudinal: boolean, windowLabel: string }}
 */
function _buildDataSections(panelId, budgetTokens, userMessage = '') {
  const data = _loadFitnessData();
  const sections = [];
  let trimmed = false;

  const { days, label: windowLabel, longitudinal, targetDate } = _parseQueryContext(userMessage);

  /** Fit a JSON array into `maxTokens`, removing oldest entries first. */
  function fitArray(arr, maxTokens, label) {
    if (!arr || arr.length === 0) return null;
    let slice = arr;
    let json  = JSON.stringify(slice, null, 2);
    while (_estimateTokens(json) > maxTokens && slice.length > 1) {
      // Remove at least one entry per iteration, targeting ~20% reduction.
      const dropCount = Math.max(1, Math.floor(slice.length * 0.2));
      slice = slice.slice(dropCount);
      json  = JSON.stringify(slice, null, 2);
      trimmed = true;
    }
    if (_estimateTokens(json) > maxTokens) {
      // Even a single entry is too large — surface this gracefully.
      trimmed = true;
      return null;
    }
    const note = trimmed
      ? ` (trimmed to ${slice.length} most-recent entries to fit context window)`
      : ` (${slice.length} entries)`;
    return `${label}${note}\n${json}`;
  }

  if (['recent-exercises-list', 'workout-set-list'].includes(panelId)) {
    const perSectionBudget = Math.floor(budgetTokens / 2);

    if (longitudinal) {
      // Long-range query: include a compact statistics summary instead of raw entries.
      const allExercises = data.exercises?.entries || [];
      const summaryLine  = `Exercise entries total: ${allExercises.length}`;
      sections.push(`## Exercise Summary (${windowLabel})\n${summaryLine}`);
    } else {
      const exercises = _filterByTimeframe(data.exercises?.entries || [], days, targetDate);
      const exSection = fitArray(exercises, perSectionBudget, `## Exercise Log (${windowLabel})`);
      if (exSection) sections.push(exSection);
    }

    const sessionLog = (data.sessionLog || []).slice(-20);
    const sesSection = fitArray(sessionLog, perSectionBudget, '## Workout Sessions (last 20)');
    if (sesSection) sections.push(sesSection);
  }

  if (panelId === 'recent-supplements-list') {
    if (longitudinal) {
      const allSupps   = data.supplements || [];
      const summaryLine = _buildNumericSummary(allSupps, 'amount', `Supplements (${windowLabel})`)
        || `Supplement entries: ${allSupps.length}`;
      sections.push(`## Supplement Summary (${windowLabel})\n${summaryLine}`);
    } else {
      const supps = _filterByTimeframe(data.supplements || [], days, targetDate);
      const sec = fitArray(supps, budgetTokens, `## Supplement Log (${windowLabel})`);
      if (sec) sections.push(sec);
    }
  }

  if (panelId === 'recent-foods-list') {
    const perSectionBudget = Math.floor(budgetTokens * FOOD_SECTION_BUDGET_RATIO);

    if (longitudinal) {
      const allFoods   = data.foods || [];
      const allWeights = data.weightLogs || [];
      const wtSummary  = _buildNumericSummary(allWeights, 'weight', 'Weight log')
        || `Weight entries: ${allWeights.length}`;
      sections.push(
        `## Nutrition & Weight Summary (${windowLabel})\n` +
        `Total food entries: ${allFoods.length}\n${wtSummary}`
      );
    } else {
      const foods   = _filterByTimeframe(data.foods || [], days, targetDate);
      const foodSec = fitArray(foods, perSectionBudget, `## Food / Diet Log (${windowLabel})`);
      if (foodSec) sections.push(foodSec);

      const weights        = _filterByTimeframe(data.weightLogs || [], days, targetDate);
      const foodTokensUsed = foodSec ? _estimateTokens(foodSec) : 0;
      const wtBudget       = Math.max(MIN_WEIGHT_LOG_TOKENS, budgetTokens - foodTokensUsed);
      const wtSec          = fitArray(weights, wtBudget, `## Weight Logs (${windowLabel})`);
      if (wtSec) sections.push(wtSec);
    }
  }

  return { sections, trimmed, longitudinal, windowLabel, targetDate };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat logic (with BigNuten context injection)
// ─────────────────────────────────────────────────────────────────────────────

async function _chat(userMessage, panelId, statusEl) {
  // Short-circuit meta-questions about the assistant's data source — these need
  // no data block and would otherwise hit the same token budget as any other query.
  if (META_QUESTION_RE.test(userMessage)) {
    const backend = getGenieBackend();
    const backendLabel = {
      'webllm':        'WebLLM (local, private)',
      'github-models': 'GitHub Models (Claude/GPT-4o, hosted)',
      'openai':        'OpenAI API (hosted)',
    }[backend] || backend;
    return `🧞 I read your locally-stored BigNuten fitness logs. ` +
           `Currently running via: ${backendLabel}. ` +
           `Your fitness data never leaves your device. ` +
           `I can see: food logs, weight logs, supplements, exercises, and workout sessions.`;
  }

  const backend = getGenieBackend();

  // Context window budget: hosted models get a much larger window
  const contextTokens = (backend === 'webllm')
    ? (GENIE_MODELS[getGenieModelId()]?.contextTokens ?? 4_096)
    : HOSTED_CONTEXT_TOKENS;

  const dataBudget    = contextTokens - TOKEN_RESERVE_OVERHEAD - TOKEN_RESERVE_REPLY
                        - _estimateTokens(userMessage);

  if (dataBudget < 50) {
    return '⚠️ Your message is too long for the model context window. Try a shorter question.';
  }

  const { sections, trimmed, longitudinal, windowLabel, targetDate } = _buildDataSections(panelId, dataBudget, userMessage);

  if (longitudinal && sections.length === 0) {
    return '🧞 Multi-year analysis requires a larger context window. Try asking about a specific week or month.';
  }

  const contextBlock = sections.length
    ? sections.join('\n\n')
    : '(no data logged yet)';

  const systemPrompt = _buildSystemPromptText(contextBlock, trimmed, targetDate);
  const fullTokenEst = _estimateTokens(systemPrompt) + _estimateTokens(userMessage);

  if (fullTokenEst > contextTokens - TOKEN_RESERVE_REPLY - 300) {
    return '⚠️ Your logs are too large for the context window. Try asking about a shorter time range.';
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage  },
  ];

  // ── Dispatch to the selected backend ──────────────────────────────────
  if (backend === 'github-models') {
    return _chatViaGitHubModels(messages, statusEl);
  }
  if (backend === 'openai') {
    return _chatViaOpenAI(messages, statusEl);
  }

  // Default: WebLLM (existing streaming path)
  return _chatViaWebLLM(messages, statusEl);
}

/**
 * Send messages to GitHub Models (OpenAI-compatible endpoint).
 * Uses the user's GitHub PAT (Personal Access Token) with models:read scope.
 * Key is read from localStorage — never hardcoded.
 */
async function _chatViaGitHubModels(messages, statusEl) {
  const key = getGenieApiKey();
  if (!key) {
    throw new Error(
      '🔑 No API key saved. Go to Settings → Genie AI → paste your GitHub PAT and click Save.'
    );
  }

  const modelName = getGenieHostedModelName();
  if (statusEl) statusEl.textContent = '🧞 Thinking (GitHub Models)…';

  const res = await fetch(GITHUB_MODELS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       modelName,
      messages,
      max_tokens:  HOSTED_MAX_TOKENS,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `HTTP ${res.status}`;
    if (_isUnknownModelError(msg)) {
      throw new Error(
        `⚠️ Unknown model "${modelName}". Please go to Settings → Genie AI and choose a different model from the dropdown.`
      );
    }
    throw new Error(`GitHub Models error: ${msg}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '(no response)';
}

/**
 * Send messages to OpenAI API directly.
 * Key is read from localStorage — never hardcoded.
 */
async function _chatViaOpenAI(messages, statusEl) {
  const key = getGenieApiKey();
  if (!key) {
    throw new Error(
      '🔑 No API key saved. Go to Settings → Genie AI → paste your OpenAI API key and click Save.'
    );
  }

  const modelName = getGenieHostedModelName();
  if (statusEl) statusEl.textContent = '🧞 Thinking (OpenAI)…';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       modelName,
      messages,
      max_tokens:  HOSTED_MAX_TOKENS,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `HTTP ${res.status}`;
    if (_isUnknownModelError(msg)) {
      throw new Error(
        `⚠️ Unknown model "${modelName}". Please go to Settings → Genie AI and choose a different model from the dropdown.`
      );
    }
    throw new Error(`OpenAI error: ${msg}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '(no response)';
}

/** Check if an error message indicates an unknown/invalid model. */
function _isUnknownModelError(msg) {
  const lower = (msg || '').toLowerCase();
  return lower.includes('unknown model') ||
         lower.includes('model not found') ||
         lower.includes('does not exist') ||
         lower.includes('invalid model');
}

/** Extracted WebLLM streaming path (was inline in _chat) — unchanged logic */
async function _chatViaWebLLM(messages, statusEl) {
  let reply = '';
  const chunks = await _engine.chat.completions.create({
    messages,
    stream:      true,
    temperature: 0,
    max_tokens:  512,
  });
  for await (const chunk of chunks) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    reply += delta;
    if (statusEl) statusEl.textContent = '🧞 Typing…';
  }
  return reply.trim() || '(no response)';
}

function _buildSystemPromptText(contextBlock, trimmed, targetDate = null) {
  const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const trimNote = trimmed
    ? '\nNote: Some older log entries were omitted to fit the context window.'
    : '';
  const dateNote = targetDate
    ? `\nFocus date: ${targetDate} — the user is asking about THIS calendar day only.`
    : '';

  return `You are Genie, a knowledgeable and compassionate AI health companion \
for the BigNuten personal wellness tracker. You have two superpowers:

1. ACCESS TO THE USER'S REAL LOGGED DATA (shown below) — their actual exercises, \
supplements, foods, weight, emotions, pain logs, breathwork, and chanting sessions.

2. DEEP KNOWLEDGE about health, nutrition, fitness science, supplements, \
herbalism, mind-body connection, and wellness — like a brilliant friend who \
happens to have a PhD in integrative medicine.

Current date/time: ${now}${dateNote}${trimNote}

--- USER'S LOGGED DATA ---
${contextBlock}
--- END LOGGED DATA ---

HOW TO RESPOND:
- When asked about logged data (what did I take, how much did I weigh, etc.) — \
report exactly what the logs show. Be precise with dates, amounts, and names.
- When asked what something DOES or MEANS (e.g. "what does Maca do?", \
"is this a good dose?", "why might I be feeling this way?") — combine the \
log data WITH your knowledge to give a genuinely useful, insightful answer.
- When you spot interesting patterns across data categories (supplements + mood, \
exercise + sleep, pain + nutrition) — proactively mention them. The user wants insight.
- Be warm, encouraging, and specific. You know this person's actual data — \
use it to personalize every answer.
- If data is missing for something asked, say so clearly but still offer \
relevant general guidance if it would help.
- Keep responses focused and readable. Use bullet points for lists of facts, \
prose for insights and explanations.`;
}

function _getRecentExercises(data, days) {
  const cutoff = Date.now() - days * 86_400_000;
  const entries = data.exercises?.entries || [];
  return entries.filter(e => {
    const t = new Date(e.timestamp || e.date || 0).getTime();
    return t >= cutoff;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────────────────────────────────────

function _loadFitnessData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function _loadOpenState() {
  try {
    const raw = localStorage.getItem(LS_OPEN);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function _saveOpenState(panelId, open) {
  const state = _loadOpenState();
  state[panelId] = open;
  localStorage.setItem(LS_OPEN, JSON.stringify(state));
}

function _restoreOpenChats() {
  const openState = _loadOpenState();
  document.querySelectorAll('.dashboard-panel.panel-visible').forEach(panel => {
    if (openState[panel.id]) {
      _injectGenieIcon(panel);
      _openChatWindow(panel);
    }
  });
}

