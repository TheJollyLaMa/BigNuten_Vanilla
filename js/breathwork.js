// Yoga's existing 4–2–6–2 cue is shared with the Heart practice library.
export const YOGA_BREATH_PATTERN = Object.freeze({ inhale: 4, holdIn: 2, exhale: 6, holdOut: 2 });
export const BREATH_METHODS = Object.freeze({
  wim: { label: 'Wim Hof-style (paced, no retention) — caution', advanced: true, protocol: 'paced-recovery', pattern: { inhale: 2, holdIn: 0, exhale: 2, holdOut: 0 } },
  box: { label: 'Box Breathing', pattern: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 } },
  '478': { label: '4-7-8', pattern: { inhale: 4, holdIn: 7, exhale: 8, holdOut: 0 } },
  coherent: { label: 'Coherent Breathing', pattern: { inhale: 5, holdIn: 0, exhale: 5, holdOut: 0 } },
  extended: { label: 'Extended Exhale', pattern: { inhale: 4, holdIn: 0, exhale: 6, holdOut: 0 } },
  sama: { label: 'Sama Vritti', pattern: { inhale: 4, holdIn: 0, exhale: 4, holdOut: 0 } },
  yoga: { label: 'Yoga Flow (4–2–6–2)', pattern: YOGA_BREATH_PATTERN },
});
export const BREATH_FEELINGS = ['calm', 'energized', 'sleepy', 'strong', 'spacious', 'open-hearted', 'dizzy'];
export const BREATH_PHASES = [
  { key: 'inhale', label: 'Inhale', class: 'inhale' },
  { key: 'holdIn', label: 'Hold', class: 'hold' },
  { key: 'exhale', label: 'Exhale', class: 'exhale' },
  { key: 'holdOut', label: 'Hold', class: 'hold-out' },
];
export function validateBreathPattern(pattern) {
  if (!pattern || typeof pattern !== 'object' || Array.isArray(pattern) || Object.keys(pattern).length !== 4) throw new Error('Invalid breathing pattern.');
  for (const { key } of BREATH_PHASES) {
    if (!Number.isInteger(pattern[key]) || pattern[key] < (key === 'inhale' || key === 'exhale' ? 1 : 0) || pattern[key] > (key === 'holdIn' ? 7 : key === 'holdOut' ? 4 : 30)) throw new Error('Use 1–30 seconds for inhale/exhale, 0–7 for the inhale hold and 0–4 for the exhale hold.');
  }
  return pattern;
}
export function breathRoundSeconds(pattern, protocol) {
  const cycle = Object.values(validateBreathPattern(pattern)).reduce((a, b) => a + b, 0);
  return protocol === 'paced-recovery' ? cycle * 30 + 10 : cycle;
}
export function breathState(pattern, elapsedSeconds, protocol) {
  const cycle = breathRoundSeconds(pattern, protocol);
  let within = elapsedSeconds % cycle;
  let breath;
  if (protocol === 'paced-recovery') {
    const breathCycle = Object.values(pattern).reduce((a, b) => a + b, 0);
    if (within >= breathCycle * 30) return { key: 'recovery', label: 'Breathe normally (recovery)', class: 'recovery', remaining: Math.ceil(cycle - within), rounds: Math.floor(elapsedSeconds / cycle), progress: 0 };
    breath = Math.floor(within / breathCycle) + 1;
    within %= breathCycle;
  }
  for (const phase of BREATH_PHASES) {
    if (within < pattern[phase.key]) return { ...phase, ...(breath ? { breath } : {}), remaining: Math.ceil(pattern[phase.key] - within), rounds: Math.floor(elapsedSeconds / cycle), progress: within / pattern[phase.key] };
    within -= pattern[phase.key];
  }
}
function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
}
export function validateBreathSession(session) {
  if (!session || typeof session !== 'object' || typeof session.id !== 'string' || !session.id.trim() ||
      typeof session.method !== 'string' || !session.method.trim() || typeof session.notes !== 'string' ||
      !['', ...BREATH_FEELINGS].includes(session.feeling) || !Number.isInteger(session.rounds) || session.rounds < 0 ||
      !Number.isInteger(session.durationSeconds) || session.durationSeconds < 1 || session.durationSeconds > 86400 ||
      !validTimestamp(session.timestamp)) throw new Error('Invalid breathwork session.');
  validateBreathPattern(session.pattern);
  if (session.protocol !== undefined && session.protocol !== 'paced-recovery') throw new Error('Invalid breathing protocol.');
  if (session.protocol === 'paced-recovery' && (session.pattern.inhale !== 2 || session.pattern.exhale !== 2 || session.pattern.holdIn !== 0 || session.pattern.holdOut !== 0)) throw new Error('Paced recovery uses 30 gentle 2-second inhale/exhale breaths, then 10 seconds of normal breathing.');
  const cycle = breathRoundSeconds(session.pattern, session.protocol);
  if (session.rounds !== Math.floor(session.durationSeconds / cycle)) throw new Error('Breathwork rounds do not match duration.');
  return session;
}
export function normalizeBreathSessions(sessions = []) {
  if (!Array.isArray(sessions)) throw new Error('Invalid breathwork session list.');
  return sessions.map(validateBreathSession);
}
export function localPracticeDay(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function practiceSummary(sessions, now = new Date()) {
  const end = now.getTime(), cutoff = new Date(now); cutoff.setDate(now.getDate() - 6); cutoff.setHours(0, 0, 0, 0);
  const valid = sessions.filter(session => Date.parse(session.timestamp) <= end);
  const days = new Set(valid.map(session => localPracticeDay(session.timestamp)));
  const cursor = new Date(now);
  if (!days.has(localPracticeDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localPracticeDay(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return { seconds: valid.filter(session => Date.parse(session.timestamp) >= cutoff.getTime()).reduce((sum, session) => sum + session.durationSeconds, 0), streak };
}

/** A single owned interval; paused, cancelled and completed runs own no timer. */
export function createBreathTimer({ tick, complete, now = () => performance.now(), schedule = setInterval, clear = clearInterval }) {
  let interval = null, elapsed = 0, started = 0, target = 0, active = false;
  const stop = () => { if (interval !== null) clear(interval); interval = null; };
  const preciseSeconds = () => Math.min(target, (elapsed + (interval !== null ? now() - started : 0)) / 1000);
  const seconds = () => Math.floor(preciseSeconds());
  function update() {
    const value = seconds(); tick(value, preciseSeconds());
    if (value >= target) { stop(); active = false; elapsed = target * 1000; complete(value); }
  }
  return {
    start(targetSeconds) { stop(); elapsed = 0; target = targetSeconds; active = true; started = now(); interval = schedule(update, 200); update(); },
    pause() { if (interval === null) return; elapsed += now() - started; stop(); tick(seconds()); },
    resume() { if (!active || interval !== null) return; started = now(); interval = schedule(update, 200); update(); },
    end() { const value = seconds(); stop(); active = false; elapsed = value * 1000; return value; },
    cancel() { stop(); active = false; elapsed = 0; tick(0); },
  };
}
