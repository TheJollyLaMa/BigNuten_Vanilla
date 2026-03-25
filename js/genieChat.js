/**
 * genieChat.js — WebLLM-powered Genie Chat assistant for BigNuten side panels.
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
 *   • WebLLM (via CDN) is lazy-loaded only when the user first sends a message.
 *   • LLM is strictly data-driven: it only reports what is in the logs and says
 *     "The logs don't show data for that" when information is missing.
 *   • Per-panel open/close state is preserved in localStorage.
 */

const LS_ENABLED   = 'genieEnabled';
const LS_OPEN      = 'genieChatOpen';    // JSON object: { panelId: true/false }
const LS_MODEL_ID  = 'genieModelId';
const STORAGE_KEY  = 'fitnessTrackerData';

// WebLLM CDN – use a small but capable quantized model.
const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm';

// Available models: id → { label, sizeDesc, contextTokens }
const GENIE_MODELS = {
  'Phi-3.5-mini-instruct-q4f16_1-MLC': {
    label:         'Phi-3.5-mini (2.2 GB, 128K context) — Recommended',
    sizeDesc:      '~2.2 GB',
    contextTokens: 131_072,
  },
  'Llama-3.2-1B-Instruct-q4f32_1-MLC': {
    label:         'Llama-3.2-1B (0.7 GB, 4K context) — Low-spec devices',
    sizeDesc:      '~0.7 GB',
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

/** Position icon on the outer edge of the panel (just touching). */
function _positionGenieIcon(btn, panel) {
  const rect     = panel.getBoundingClientRect();
  const ICON_W   = 36;
  const OVERLAP  = 4;  // px the icon overlaps the panel border

  btn.style.position = 'fixed';
  btn.style.top      = (rect.top + 10) + 'px';
  btn.style.zIndex   = '1200';

  if (_isMobile()) {
    // On mobile the panels span full width at the bottom; hang icon off the top edge.
    btn.style.top  = (rect.top - ICON_W + OVERLAP) + 'px';
    btn.style.left = (rect.right - ICON_W - 10) + 'px';
  } else if (_isLeftPanel(panel.id)) {
    // Left panel → icon hangs off its RIGHT (inner) edge toward the page centre.
    btn.style.left = (rect.right - OVERLAP) + 'px';
  } else {
    // Right panel → icon hangs off its LEFT (inner) edge toward the page centre.
    btn.style.left = (rect.left - ICON_W + OVERLAP) + 'px';
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
    <div class="genie-chat-hint">Your data stays local — powered by WebLLM 🔒</div>
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
    const modelId   = getGenieModelId();
    const modelMeta = GENIE_MODELS[modelId] || GENIE_MODELS[DEFAULT_MODEL_ID];
    const sizeDesc  = modelMeta.sizeDesc;

    if (!_engineReady || _loadedModelId !== modelId) {
      statusEl.textContent = `⏳ Loading AI model (first-time download, ${sizeDesc} cached for future use)…`;
      await _loadEngine(statusEl);
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
 * We reserve space for system preamble/rules (~400 tokens) and the reply
 * (~512 tokens), leaving the rest for the data block.
 */
const TOKEN_RESERVE_OVERHEAD = 400;
const TOKEN_RESERVE_REPLY    = 512;
// Fraction of the data budget allocated to the food-log section (the rest goes to weight logs).
const FOOD_SECTION_BUDGET_RATIO = 0.6;
// Minimum token budget to allocate for the weight-log section.
const MIN_WEIGHT_LOG_TOKENS = 200;

/**
 * Build data sections for the given panel, automatically trimming entries to
 * fit within `budgetTokens`. Returns { sections, trimmed } where `trimmed` is
 * true when data had to be cut.
 */
function _buildDataSections(panelId, budgetTokens) {
  const data = _loadFitnessData();
  const sections = [];
  let trimmed = false;

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
    const note = trimmed ? ` (trimmed to ${slice.length} most-recent entries to fit context window)` : ` (${slice.length} entries)`;
    return `${label}${note}\n${json}`;
  }

  if (['recent-exercises-list', 'workout-set-list'].includes(panelId)) {
    const perSectionBudget = Math.floor(budgetTokens / 2);
    const exercises = _getRecentExercises(data, 90);
    const exSection = fitArray(exercises, perSectionBudget, '## Exercise Log (last 90 days)');
    if (exSection) sections.push(exSection);

    const sessionLog = (data.sessionLog || []).slice(-20);
    const sesSection = fitArray(sessionLog, perSectionBudget, '## Workout Sessions (last 20)');
    if (sesSection) sections.push(sesSection);
  }

  if (panelId === 'recent-supplements-list') {
    const supps = (data.supplements || []).slice(-50);
    const sec = fitArray(supps, budgetTokens, '## Supplement Log (last 50 entries)');
    if (sec) sections.push(sec);
  }

  if (panelId === 'recent-foods-list') {
    const perSectionBudget = Math.floor(budgetTokens * FOOD_SECTION_BUDGET_RATIO);
    const foods = (data.foods || []).slice(-50);
    const foodSec = fitArray(foods, perSectionBudget, '## Food / Diet Log (last 50 entries)');
    if (foodSec) sections.push(foodSec);

    const weights = (data.weightLogs || []).slice(-30);
    const foodTokensUsed = foodSec ? _estimateTokens(foodSec) : 0;
    const wtBudget = Math.max(MIN_WEIGHT_LOG_TOKENS, budgetTokens - foodTokensUsed);
    const wtSec = fitArray(weights, wtBudget, '## Weight Logs (last 30)');
    if (wtSec) sections.push(wtSec);
  }

  return { sections, trimmed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat logic (with BigNuten context injection)
// ─────────────────────────────────────────────────────────────────────────────

async function _chat(userMessage, panelId, statusEl) {
  const modelId       = getGenieModelId();
  const contextTokens = GENIE_MODELS[modelId]?.contextTokens ?? 4_096;
  const dataBudget    = contextTokens - TOKEN_RESERVE_OVERHEAD - TOKEN_RESERVE_REPLY
                        - _estimateTokens(userMessage);

  if (dataBudget < 50) {
    // Even with an empty data block, the prompt is too large.
    return "⚠️ Your message is too long for the selected model's context window. Please try a shorter question, or switch to Phi-3.5-mini (128K context) in Settings.";
  }

  const { sections, trimmed } = _buildDataSections(panelId, dataBudget);

  const contextBlock = sections.length
    ? sections.join('\n\n')
    : '(no data logged yet)';

  // Final safety check after building the full prompt.
  const systemPrompt = _buildSystemPromptText(contextBlock, trimmed);
  const fullTokenEst = _estimateTokens(systemPrompt) + _estimateTokens(userMessage);
  if (fullTokenEst > contextTokens - TOKEN_RESERVE_REPLY) {
    return "⚠️ Your logs are too large to fit in the context window even after trimming. " +
           "Try asking about a shorter time range, or switch to Phi-3.5-mini (128K context) in Genie Settings for larger logs.";
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage  },
  ];

  // Stream the reply for a responsive feel.
  let reply  = '';
  const chunks = await _engine.chat.completions.create({
    messages,
    stream:      true,
    temperature: 0,    // greedy decoding for consistent responses
    max_tokens:  512,
  });

  for await (const chunk of chunks) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    reply += delta;
    if (statusEl) statusEl.textContent = '🧞 Typing…';
  }

  return reply.trim() || "(no response)";
}

function _buildSystemPromptText(contextBlock, trimmed) {
  const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const trimNote = trimmed
    ? '\nNote: Some older log entries were omitted to fit the context window.'
    : '';

  return `You are Genie, a data-query assistant for the BigNuten fitness tracker. \
Your ONLY job is to answer questions about the user's actual logged data shown below. \
All data is stored locally — nothing is sent to any server.

Current date/time: ${now}${trimNote}

--- USER DATA ---
${contextBlock}
--- END USER DATA ---

STRICT RULES — follow these exactly:
1. ONLY state facts that are explicitly present in the data above.
2. If the data does not contain the answer, reply with exactly: "The logs don't show data for that."
3. Do NOT make up, estimate, infer, or guess any value not in the data.
4. Do NOT give generic health or fitness advice unless the user explicitly asks for it AND it is directly supported by the data.
5. When asked what was eaten, taken, or exercised on a specific date, search the data by date and list exactly what the entries show.
6. Be concise. State the facts, cite the relevant log entries, and stop. Do not pad responses.
7. If data is empty or missing, say so clearly and briefly.`;
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

