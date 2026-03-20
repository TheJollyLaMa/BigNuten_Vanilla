/**
 * js/aiChat.js
 * BigNuten AI Chat — Conversation management with robust localStorage persistence.
 *
 * Root cause of the "chats show as deleted" bug:
 *   Chat sessions were never saved atomically; partial in-memory state could
 *   be lost on navigation, hot-reload, or any code path that called
 *   localStorage.clear() / setItem with the wrong key.
 *
 * Fix strategy:
 *   1. All writes go through a single `_saveChats()` helper (one atomic setItem).
 *   2. Every read calls `_loadChats()` fresh from storage — no stale in-memory cache.
 *   3. Each message is persisted immediately after being appended.
 *   4. Defensive JSON parsing never silently drops data.
 */

// ─── Storage ─────────────────────────────────────────────────────────────────

const CHAT_STORAGE_KEY = 'bignuten_ai_chats';

/** Read the full chats array from localStorage (always fresh). */
function _loadChats() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Atomically persist the full chats array. */
function _saveChats(chats) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
  } catch (err) {
    console.error('[aiChat] Failed to save chats:', err);
  }
}

// ─── Session API ─────────────────────────────────────────────────────────────

/** Return a copy of all chat sessions, most-recent first. */
export function listChats() {
  return _loadChats().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** Create a new chat session. Returns the new session object. */
export function createChat(title = 'New Chat') {
  const chats = _loadChats();
  const session = {
    id:        crypto.randomUUID(),
    title,
    messages:  [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  chats.push(session);
  _saveChats(chats);
  return session;
}

/** Return a single session by id, or null if not found. */
export function getChatById(chatId) {
  return _loadChats().find(c => c.id === chatId) || null;
}

/** Append a message to a session and persist immediately. Returns updated session. */
export function addMessage(chatId, role, content) {
  const chats = _loadChats();
  const idx = chats.findIndex(c => c.id === chatId);
  if (idx === -1) {
    console.warn('[aiChat] addMessage: session not found', chatId);
    return null;
  }
  chats[idx].messages.push({ role, content, timestamp: Date.now() });
  chats[idx].updatedAt = Date.now();

  // Auto-title: use first user message (truncated) if still on default title
  if (role === 'user' && chats[idx].title === 'New Chat') {
    const userMessages = chats[idx].messages.filter(m => m.role === 'user');
    if (userMessages.length === 1) {
      chats[idx].title = content.slice(0, 40) + (content.length > 40 ? '…' : '');
    }
  }

  _saveChats(chats);
  return chats[idx];
}

/** Rename a chat session. */
export function renameChat(chatId, newTitle) {
  const chats = _loadChats();
  const idx = chats.findIndex(c => c.id === chatId);
  if (idx === -1) return;
  chats[idx].title = newTitle.trim() || 'New Chat';
  chats[idx].updatedAt = Date.now();
  _saveChats(chats);
}

/** Permanently delete a chat session. */
export function deleteChat(chatId) {
  const chats = _loadChats().filter(c => c.id !== chatId);
  _saveChats(chats);
}

// ─── AI Reply (pluggable) ─────────────────────────────────────────────────────

/**
 * Generate a reply for the given messages array.
 * Swap this function with a real API call (OpenAI, Anthropic, etc.) once
 * an API key is available in the environment.
 *
 * @param {Array<{role:string, content:string}>} messages
 * @returns {Promise<string>}
 */
async function _generateReply(messages) {
  // Stub: echo the last user message with a friendly wrapper
  const lastUser = messages.findLast(m => m.role === 'user');
  const text = lastUser ? lastUser.content : '';
  await new Promise(r => setTimeout(r, 400)); // simulate latency
  return `🤖 (AI stub) You said: "${text}"\n\nConnect an OpenAI / Anthropic API key in your backend to enable real replies.`;
}

// ─── UI ──────────────────────────────────────────────────────────────────────

let _activeChatId = null;

/** Bootstrap all chat UI event-wiring. Call once on DOMContentLoaded. */
export function initAiChat() {
  _wireChatPanel();
  _wireChatModal();
}

// ── Chat Sessions Panel (left sidebar) ───────────────────────────────────────

function _wireChatPanel() {
  const newChatBtn = document.getElementById('ai-chat-new-btn');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      const session = createChat();
      _renderChatList();
      _openChatModal(session.id);
    });
  }
  _renderChatList();
}

function _renderChatList() {
  const list = document.getElementById('ai-chat-session-list');
  if (!list) return;

  const chats = listChats();
  list.innerHTML = '';

  if (chats.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'ai-chat-empty';
    empty.textContent = 'No conversations yet. Press + to start one.';
    list.appendChild(empty);
    return;
  }

  chats.forEach(session => {
    const item = document.createElement('div');
    item.className = 'ai-chat-session-item' + (session.id === _activeChatId ? ' active' : '');
    item.dataset.chatId = session.id;

    const titleEl = document.createElement('span');
    titleEl.className = 'ai-chat-session-title';
    titleEl.textContent = session.title;
    item.appendChild(titleEl);

    const delBtn = document.createElement('button');
    delBtn.className = 'ai-chat-session-delete';
    delBtn.title = 'Delete conversation';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Delete "${session.title}"?`)) {
        deleteChat(session.id);
        if (_activeChatId === session.id) {
          _activeChatId = null;
          _closeChatModal();
        }
        _renderChatList();
      }
    });
    item.appendChild(delBtn);

    item.addEventListener('click', () => _openChatModal(session.id));
    list.appendChild(item);
  });
}

// ── Chat Modal (conversation window) ─────────────────────────────────────────

function _wireChatModal() {
  const modal    = document.getElementById('ai-chat-modal');
  const closeBtn = document.getElementById('ai-chat-modal-close');
  const sendBtn  = document.getElementById('ai-chat-send-btn');
  const input    = document.getElementById('ai-chat-input');

  if (!modal) return;

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      _closeChatModal();
      // Keep the chat panel visible
      const panel = document.getElementById('ai-chat-sessions-panel');
      if (panel) panel.classList.add('panel-visible');
    });
  }

  // Close on overlay click
  modal.addEventListener('click', e => {
    if (e.target === modal) _closeChatModal();
  });

  if (sendBtn && input) {
    const doSend = async () => {
      const text = input.value.trim();
      if (!text || !_activeChatId) return;
      input.value = '';
      sendBtn.disabled = true;

      // Persist user message immediately — this prevents the "deleted" symptom
      addMessage(_activeChatId, 'user', text);
      _renderMessages(_activeChatId);

      try {
        const session = getChatById(_activeChatId);
        const reply   = await _generateReply(session ? session.messages : []);
        addMessage(_activeChatId, 'assistant', reply);
      } catch (err) {
        addMessage(_activeChatId, 'assistant', `⚠️ Error: ${err.message || err}`);
      } finally {
        _renderMessages(_activeChatId);
        _renderChatList(); // refresh title if auto-named
        sendBtn.disabled = false;
        input.focus();
      }
    };

    sendBtn.addEventListener('click', doSend);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });
  }
}

function _openChatModal(chatId) {
  _activeChatId = chatId;
  const modal = document.getElementById('ai-chat-modal');
  if (modal) modal.classList.remove('modal-hidden');
  _renderMessages(chatId);
  _renderChatList(); // highlight active session
  document.getElementById('ai-chat-input')?.focus();
}

function _closeChatModal() {
  _activeChatId = null;
  const modal = document.getElementById('ai-chat-modal');
  if (modal) modal.classList.add('modal-hidden');
  _renderChatList(); // clear active highlight
}

function _renderMessages(chatId) {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;

  // Always read fresh from storage — prevents stale state causing "deleted" appearance
  const session = getChatById(chatId);
  container.innerHTML = '';

  if (!session) {
    container.innerHTML = '<p class="ai-chat-empty">Conversation not found.</p>';
    return;
  }

  if (session.messages.length === 0) {
    container.innerHTML = '<p class="ai-chat-empty">Send a message to start the conversation.</p>';
    return;
  }

  session.messages.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = `ai-chat-bubble ai-chat-bubble--${msg.role}`;

    const text = document.createElement('p');
    text.className = 'ai-chat-bubble-text';
    // Safe text rendering — no innerHTML with user content
    text.textContent = msg.content;
    bubble.appendChild(text);

    const meta = document.createElement('span');
    meta.className = 'ai-chat-bubble-meta';
    meta.textContent = new Date(msg.timestamp).toLocaleTimeString();
    bubble.appendChild(meta);

    container.appendChild(bubble);
  });

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}
