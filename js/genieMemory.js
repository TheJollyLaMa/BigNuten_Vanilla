/**
 * genieMemory.js — Three-tier memory system for the Genie AI assistant.
 *
 * Tier 1 — Working Memory:  sessionStorage persistence of in-session messages.
 * Tier 2 — Short-Term Memory: auto-generated session summaries (last 10).
 * Tier 3 — Long-Term Memory: user-pinned or Genie-suggested insights (max 20).
 *
 * Reads/writes genieSessions[] and genieInsights[] inside fitnessTrackerData
 * stored in localStorage.
 */

const STORAGE_KEY = 'fitnessTrackerData';
const MAX_SESSIONS = 10;
const MAX_INSIGHTS = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1 — Working Memory (sessionStorage)
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_CHAT_KEY = (panelId) => `genieChatSession_${panelId}`;

/** Save the current message array for a panel to sessionStorage. */
export function saveSessionMessages(panelId, messages) {
  try {
    sessionStorage.setItem(SESSION_CHAT_KEY(panelId), JSON.stringify(messages));
  } catch { /* quota exceeded — silently ignore */ }
}

/** Load the saved message array for a panel from sessionStorage. */
export function loadSessionMessages(panelId) {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_CHAT_KEY(panelId)) || '[]');
  } catch (err) {
    console.warn('[GenieMemory] Failed to parse session messages:', err);
    return [];
  }
}

/** Clear session messages for a specific panel. */
export function clearSessionMessages(panelId) {
  sessionStorage.removeItem(SESSION_CHAT_KEY(panelId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2 — Short-Term Memory (session summaries)
// ─────────────────────────────────────────────────────────────────────────────

function _loadFitnessData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function _saveFitnessData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Return all stored session summaries. */
export function getGenieSessions() {
  const data = _loadFitnessData();
  return Array.isArray(data.genieSessions) ? data.genieSessions : [];
}

/** Save a new session summary, keeping only the most recent MAX_SESSIONS. */
export function saveGenieSession(session) {
  const data = _loadFitnessData();
  if (!Array.isArray(data.genieSessions)) data.genieSessions = [];
  data.genieSessions.unshift(session);
  if (data.genieSessions.length > MAX_SESSIONS) {
    data.genieSessions = data.genieSessions.slice(0, MAX_SESSIONS);
  }
  _saveFitnessData(data);
}

/** Update a session's userRating by id. */
export function rateGenieSession(sessionId, rating) {
  const data = _loadFitnessData();
  if (!Array.isArray(data.genieSessions)) return;
  const session = data.genieSessions.find(s => s.id === sessionId);
  if (session) {
    session.userRating = rating;
    _saveFitnessData(data);
  }
}

/** Delete a session summary by id. */
export function deleteGenieSession(sessionId) {
  const data = _loadFitnessData();
  if (!Array.isArray(data.genieSessions)) return;
  data.genieSessions = data.genieSessions.filter(s => s.id !== sessionId);
  _saveFitnessData(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 3 — Long-Term Memory (pinned insights)
// ─────────────────────────────────────────────────────────────────────────────

/** Return all stored insights. */
export function getGenieInsights() {
  const data = _loadFitnessData();
  return Array.isArray(data.genieInsights) ? data.genieInsights : [];
}

/** Pin a new insight. Returns false if limit reached. */
export function pinInsight(insight) {
  const data = _loadFitnessData();
  if (!Array.isArray(data.genieInsights)) data.genieInsights = [];
  if (data.genieInsights.length >= MAX_INSIGHTS) return false;
  data.genieInsights.push(insight);
  _saveFitnessData(data);
  return true;
}

/** Remove an insight by id. */
export function deleteInsight(insightId) {
  const data = _loadFitnessData();
  if (!Array.isArray(data.genieInsights)) return;
  data.genieInsights = data.genieInsights.filter(i => i.id !== insightId);
  _saveFitnessData(data);
}

/** Increment usedCount for insights being injected into a prompt. */
export function incrementInsightUsage(insightIds) {
  const data = _loadFitnessData();
  if (!Array.isArray(data.genieInsights)) return;
  const idSet = new Set(insightIds);
  data.genieInsights.forEach(i => {
    if (idSet.has(i.id)) i.usedCount = (i.usedCount || 0) + 1;
  });
  _saveFitnessData(data);
}

/** Clear all Genie memory (sessions + insights). */
export function clearAllGenieMemory() {
  const data = _loadFitnessData();
  data.genieSessions = [];
  data.genieInsights = [];
  _saveFitnessData(data);
  // Also clear all sessionStorage chat keys
  Object.keys(sessionStorage).forEach(key => {
    if (key.startsWith('genieChatSession_')) {
      sessionStorage.removeItem(key);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt injection helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format a timestamp for display, returning 'unknown date' if missing. */
function _formatDate(timestamp) {
  if (!timestamp) return 'unknown date';
  const datePart = timestamp.split('T')[0];
  return datePart || 'unknown date';
}

/** Build the "Recent Conversations" section for the system prompt. */
export function buildRecentSessionsPrompt() {
  const sessions = getGenieSessions();
  if (sessions.length === 0) return '';
  return '## Recent Genie Conversations (short-term memory)\n' +
    sessions.map(s =>
      `[${_formatDate(s.timestamp)}] ${s.summary || '(no summary)'}`
    ).join('\n\n');
}

/** Build the "Long-Term Memory" section for the system prompt. */
export function buildInsightsPrompt() {
  const insights = getGenieInsights();
  if (insights.length === 0) return '';
  // Track usage
  incrementInsightUsage(insights.map(i => i.id));
  return '## Long-Term Memory (pinned insights about this user)\n' +
    insights.map(i => `• ${i.text}`).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Summarization prompt builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the summarization prompt for a completed conversation.
 * @param {string} conversationText - The full conversation text to summarize.
 * @returns {string} The summarization prompt.
 */
export function buildSummarizePrompt(conversationText) {
  return `You are summarizing a health assistant conversation for long-term memory storage.
Keep the summary under 150 words. Focus on:
1. What the user asked about
2. Key facts or insights surfaced
3. Any patterns noticed across health categories
4. Any action items or recommendations made

Respond with ONLY a JSON object in this exact format (no markdown, no extra text):
{"summary":"your summary here","keyTopics":["topic1","topic2"],"suggestedInsight":"a single key insight worth remembering, or empty string if none"}

Conversation:
${conversationText}`;
}

/** Generate a simple UUID v4. */
export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export { MAX_SESSIONS, MAX_INSIGHTS };
