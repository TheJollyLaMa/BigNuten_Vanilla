const DAY = 86400000;

export function formatChantingDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

function validSessions(sessions, now) {
  return (Array.isArray(sessions) ? sessions : []).filter(session =>
    session && typeof session.timestamp === 'string' && Number.isFinite(session.durationSeconds) && session.durationSeconds > 0 &&
    Number.isFinite(Date.parse(session.timestamp)) && Date.parse(session.timestamp) <= now);
}

// Match the existing chakra system's UTC day boundaries.
export function chantingScore(sessions, today = new Date().toISOString().slice(0, 10), now = Date.now()) {
  const valid = validSessions(sessions, now);
  if (valid.some(session => new Date(session.timestamp).toISOString().startsWith(today))) return 1;
  return valid.some(session => Date.parse(session.timestamp) >= now - 7 * DAY) ? 0.5 : 0;
}

export function chantingStats(sessions, now = Date.now()) {
  const valid = validSessions(sessions, now);
  const weeklySeconds = valid.filter(session => Date.parse(session.timestamp) >= now - 7 * DAY)
    .reduce((sum, session) => sum + session.durationSeconds, 0);
  const days = new Set(valid.map(session => new Date(session.timestamp).toISOString().slice(0, 10)));
  let day = Date.parse(new Date(now).toISOString().slice(0, 10));
  if (!days.has(new Date(day).toISOString().slice(0, 10))) day -= DAY;
  let streak = 0;
  while (days.has(new Date(day).toISOString().slice(0, 10))) { streak++; day -= DAY; }
  return { weeklySeconds, streak };
}
