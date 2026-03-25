/**
 * genieChat.js — WebLLM-powered Genie Chat assistant for BigNuten side panels.
 *
 * Exports:
 *   initGenieChat()   — call once on DOMContentLoaded
 *
 * Behaviour:
 *   • Reads the 'genieEnabled' key in localStorage (true/false).
 *   • When enabled, injects a genie icon button into each .dashboard-panel.
 *   • Clicking the icon toggles an attached chat window that uses the
 *     user's local BigNuten data as context for the LLM.
 *   • WebLLM (via CDN) is lazy-loaded only when the user first opens a chat.
 *   • Per-panel open/close state is preserved in localStorage.
 */

const LS_ENABLED  = 'genieEnabled';
const LS_OPEN     = 'genieChatOpen';   // JSON object: { panelId: true/false }
const STORAGE_KEY = 'fitnessTrackerData';

// WebLLM CDN – use a small but capable quantized model.
const WEBLLM_CDN  = 'https://esm.run/@mlc-ai/web-llm';
// Model to use: Llama-3.2-1B-Instruct-q4f32_1-MLC is small (~0.7 GB) and fast.
const MODEL_ID    = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';

let _engine = null;          // singleton WebLLM engine
let _engineLoading = false;  // guard against concurrent init calls
let _engineReady   = false;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function initGenieChat() {
  _applyEnabledState();

  // When a panel opens/closes (class toggle), re-evaluate genie icon visibility.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const panel = /** @type {HTMLElement} */ (m.target);
        if (panel.classList.contains('dashboard-panel')) {
          if (panel.classList.contains('panel-visible')) {
            _injectGenieIcon(panel);
          }
        }
      }
    }
  });

  document.querySelectorAll('.dashboard-panel').forEach(panel => {
    observer.observe(panel, { attributes: true });
    // If panel is already visible on load, inject immediately.
    if (panel.classList.contains('panel-visible')) {
      _injectGenieIcon(panel);
    }
  });
}

/** Called by the Settings toggle. */
export function setGenieEnabled(enabled) {
  localStorage.setItem(LS_ENABLED, enabled ? 'true' : 'false');
  _applyEnabledState();
}

export function isGenieEnabled() {
  return localStorage.getItem(LS_ENABLED) === 'true';
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function _applyEnabledState() {
  const enabled = isGenieEnabled();
  if (enabled) {
    // Inject into currently visible panels.
    document.querySelectorAll('.dashboard-panel.panel-visible').forEach(_injectGenieIcon);
    // Restore open chat windows.
    _restoreOpenChats();
  } else {
    // Remove all genie UI.
    document.querySelectorAll('.genie-icon-btn').forEach(el => el.remove());
    document.querySelectorAll('.genie-chat-window').forEach(el => el.remove());
  }
}

function _injectGenieIcon(panel) {
  if (!isGenieEnabled()) return;
  if (panel.querySelector('.genie-icon-btn')) return;  // already injected

  const btn = document.createElement('button');
  btn.className = 'genie-icon-btn';
  btn.setAttribute('aria-label', 'Open Genie AI assistant');
  btn.setAttribute('title', 'Ask your AI Genie 🧞');
  btn.innerHTML = '🧞';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    _toggleChatWindow(panel);
  });

  panel.appendChild(btn);

  // Restore open state if this chat was previously open.
  const openState = _loadOpenState();
  if (openState[panel.id]) {
    _openChatWindow(panel);
  }
}

function _toggleChatWindow(panel) {
  const existing = panel.querySelector('.genie-chat-window');
  if (existing) {
    _closeChatWindow(panel);
  } else {
    _openChatWindow(panel);
  }
}

function _openChatWindow(panel) {
  if (panel.querySelector('.genie-chat-window')) return;

  const win = _buildChatWindow(panel);
  panel.appendChild(win);
  _saveOpenState(panel.id, true);

  // Focus the input.
  const input = win.querySelector('.genie-chat-input');
  if (input) setTimeout(() => input.focus(), 50);
}

function _closeChatWindow(panel) {
  const win = panel.querySelector('.genie-chat-window');
  if (win) {
    win.remove();
    _saveOpenState(panel.id, false);
  }
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

  // Close button
  win.querySelector('.genie-chat-close').addEventListener('click', (e) => {
    e.stopPropagation();
    _closeChatWindow(panel);
  });

  // Send on button click or Enter (Shift+Enter = newline)
  const sendBtn  = win.querySelector('.genie-chat-send');
  const inputEl  = win.querySelector('.genie-chat-input');
  const messagesEl = win.querySelector('.genie-chat-messages');
  const statusEl   = win.querySelector('.genie-chat-status');

  sendBtn.addEventListener('click', () => _sendMessage(panel, inputEl, messagesEl, statusEl));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _sendMessage(panel, inputEl, messagesEl, statusEl);
    }
  });

  // Show a welcome message and prime the context.
  _appendMessage(messagesEl, 'genie', _getWelcomeMessage(panel));

  return win;
}

function _getWelcomeMessage(panel) {
  const panelId = panel.id;
  const msgs = {
    'recent-supplements-list': "Hi! I'm your supplement Genie 🧞. Ask me about your supplement regimen or recommendations!",
    'recent-foods-list':       "Hi! I'm your nutrition Genie 🧞. Ask me about your diet, daily values, or meal suggestions!",
    'recent-exercises-list':   "Hi! I'm your exercise Genie 🧞. Ask me about your workout history or what to work on next!",
    'workout-set-list':        "Hi! I'm your workout Genie 🧞. Ask me to plan your session or review your progress!",
  };
  return msgs[panelId] || "Hi! I'm your BigNuten Genie 🧞. Ask me anything about your health data!";
}

async function _sendMessage(panel, inputEl, messagesEl, statusEl) {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  inputEl.disabled = true;
  panel.querySelector('.genie-chat-send').disabled = true;

  _appendMessage(messagesEl, 'user', text);

  try {
    if (!_engineReady) {
      statusEl.textContent = '⏳ Loading AI model (first-time download, ~700 MB cached for future use)…';
      await _loadEngine(statusEl);
    }

    statusEl.textContent = '🧞 Thinking…';
    const reply = await _chat(text, panel, statusEl);
    _appendMessage(messagesEl, 'genie', reply);
    statusEl.textContent = '';
  } catch (err) {
    console.error('[GenieChat]', err);
    _appendMessage(messagesEl, 'error', `⚠️ Error: ${err.message || 'Unknown error'}`);
    statusEl.textContent = '';
  } finally {
    inputEl.disabled = false;
    const sendBtn = panel.querySelector('.genie-chat-send');
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
  if (_engineReady) return;
  if (_engineLoading) {
    // Wait for the in-progress load to finish.
    await _waitUntilReady();
    return;
  }

  _engineLoading = true;

  try {
    // Lazy-import WebLLM from CDN (code-split; only fetched when first needed).
    const webllm = await import(/* webpackIgnore: true */ WEBLLM_CDN);
    const engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (progress) => {
        if (statusEl) {
          const pct = progress.progress != null
            ? ` (${Math.round(progress.progress * 100)}%)`
            : '';
          statusEl.textContent = `⏳ ${progress.text || 'Loading model…'}${pct}`;
        }
      },
    });
    _engine = engine;
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
// Chat logic (with BigNuten context injection)
// ─────────────────────────────────────────────────────────────────────────────

async function _chat(userMessage, panel, statusEl) {
  const systemPrompt = _buildSystemPrompt(panel);

  const messages = [
    { role: 'system',    content: systemPrompt },
    { role: 'user',      content: userMessage  },
  ];

  // Stream the reply for a responsive feel.
  let reply = '';
  const chunks = await _engine.chat.completions.create({
    messages,
    stream:      true,
    temperature: 0.7,
    max_tokens:  512,
  });

  for await (const chunk of chunks) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    reply += delta;
    if (statusEl) statusEl.textContent = '🧞 Typing…';
  }

  return reply.trim() || '(no response)';
}

function _buildSystemPrompt(panel) {
  const data = _loadFitnessData();
  const now  = new Date().toISOString();

  // Gather panel-relevant context.
  const sections = [];
  const panelId  = panel.id;

  if (['recent-exercises-list', 'workout-set-list'].includes(panelId)) {
    const entries = _getRecentExercises(data, 90);
    sections.push(`## Exercise History (last 90 days)\n${JSON.stringify(entries, null, 2)}`);
    const sessionLog = (data.sessionLog || []).slice(-20);
    if (sessionLog.length) {
      sections.push(`## Recent Workout Sessions (last 20)\n${JSON.stringify(sessionLog, null, 2)}`);
    }
  }

  if (['recent-supplements-list'].includes(panelId)) {
    const supps = (data.supplements || []).slice(-50);
    sections.push(`## Supplement Log (last 50 entries)\n${JSON.stringify(supps, null, 2)}`);
  }

  if (['recent-foods-list'].includes(panelId)) {
    const foods = (data.foods || []).slice(-50);
    sections.push(`## Diet / Food Log (last 50 entries)\n${JSON.stringify(foods, null, 2)}`);
    const weights = (data.weightLogs || []).slice(-30);
    if (weights.length) {
      sections.push(`## Weight Logs (last 30)\n${JSON.stringify(weights, null, 2)}`);
    }
  }

  const contextBlock = sections.length
    ? sections.join('\n\n')
    : 'No data available yet.';

  return `You are Genie, a friendly and knowledgeable fitness assistant embedded in the BigNuten health tracker app. \
You have access to the user's personal health data stored locally on their device. \
All data stays local — nothing is sent to a server. Current time: ${now}.

Here is the user's relevant BigNuten data:
${contextBlock}

Answer the user's questions helpfully and concisely, focusing on their personal data where relevant. \
Use clear, encouraging language and always respect user privacy.`;
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
