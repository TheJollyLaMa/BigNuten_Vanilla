import { celebrateBreathworkCompletion } from './chakra.js';
import { BREATH_METHODS, BREATH_PHASES, BREATH_FEELINGS, validateBreathPattern, validateBreathSession, breathRoundSeconds, breathState, createBreathTimer, practiceSummary } from './breathwork.js';

export function initHeartBreathwork({ modal, load, save }) {
  const find = id => modal.querySelector(`#breath-${id}`);
  const method = find('method'), rounds = find('rounds'), guide = find('guide'), status = find('status');
  const begin = find('begin'), pause = find('pause'), end = find('end');
  let pattern, sessionMethod, protocol, targetRounds, paused = false, pending = null, running = false;
  Object.entries(BREATH_METHODS).filter(([, value]) => !value.advanced).forEach(([key, value]) => method.add(new Option(value.label, key)));
  method.add(new Option('Custom', 'custom'));
  method.value = 'box';
  BREATH_FEELINGS.forEach(feeling => find('feeling').add(new Option(feeling, feeling)));
  function selectMethod() {
    const custom = method.value === 'custom'; find('custom').hidden = !custom;
    for (const phase of BREATH_PHASES) if (!custom) find(phase.key).value = BREATH_METHODS[method.value].pattern[phase.key];
  }
  const ack = find('ack');
  function updateBegin() { begin.disabled = running || !!pending || !!(BREATH_METHODS[method.value]?.advanced && !ack.checked); }
  function resetAdvanced() {
    ack.checked = false; find('advanced').hidden = true; find('show-advanced').setAttribute('aria-expanded', 'false');
    method.querySelector('option[value="wim"]')?.remove();
    if (!method.value) method.value = 'box';
    selectMethod(); updateBegin();
  }
  find('show-advanced').addEventListener('click', () => {
    find('advanced').hidden = false; find('show-advanced').setAttribute('aria-expanded', 'true');
    if (!method.querySelector('option[value="wim"]')) method.add(new Option(BREATH_METHODS.wim.label, 'wim'));
    ack.checked = false; updateBegin();
  });
  find('reset-advanced').addEventListener('click', resetAdvanced);
  ack.addEventListener('change', updateBegin);
  method.addEventListener('change', () => { selectMethod(); updateBegin(); }); selectMethod();
  const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  function controls(isRunning) {
    running = isRunning;
    method.disabled = rounds.disabled = running;
    find('custom').querySelectorAll('input').forEach(input => { input.disabled = running; });
    updateBegin(); pause.disabled = end.disabled = !running;
    find('show-advanced').disabled = find('reset-advanced').disabled = ack.disabled = running;
    find('save').disabled = !pending; pause.textContent = 'Pause'; paused = false;
  }
  function renderHistory() {
    const sessions = load().breathworkSessions || [];
    const summary = practiceSummary(sessions);
    find('summary').textContent = `Last 7 days: ${clock(summary.seconds)} · Streak: ${summary.streak} days`;
    find('history').replaceChildren();
    for (const session of [...sessions].sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
      const li = document.createElement('li');
      li.textContent = `${new Date(session.timestamp).toLocaleString()} — ${session.method} — ${session.rounds} rounds — ${clock(session.durationSeconds)}${session.feeling ? ` — ${session.feeling}` : ''}${session.notes ? ` — ${session.notes}` : ''}`;
      find('history').append(li);
    }
    if (!sessions.length) find('history').textContent = 'No sessions yet.';
  }
  function finish(seconds) {
    if (seconds < 1) { controls(false); status.textContent = 'No session recorded. Practise for at least one second.'; return; }
    const cycle = breathRoundSeconds(pattern, protocol);
    pending = { id: crypto.randomUUID(), method: sessionMethod, pattern: { ...pattern }, ...(protocol ? { protocol } : {}), rounds: Math.floor(seconds / cycle), durationSeconds: seconds, timestamp: new Date().toISOString() };
    guide.className = 'breath-guide'; guide.style.transform = ''; find('phase').textContent = 'Session ended'; controls(false);
    status.textContent = 'Session ended. Add a feeling or note, then save; cancel discards it.';
    find('feeling').focus();
  }
  const timer = createBreathTimer({
    tick(seconds, preciseSeconds = seconds) {
      find('elapsed').textContent = clock(seconds);
      if (!pattern || !seconds && !begin.disabled) { find('phase').textContent = 'Ready'; return; }
      const state = breathState(pattern, preciseSeconds, protocol);
      find('phase').textContent = `${state.label} · ${state.remaining}s`;
      find('round-count').textContent = `Round ${Math.min(state.rounds + 1, targetRounds)} / ${targetRounds}${state.breath ? ` · Breath ${state.breath} / 30` : ''}`;
      guide.className = `breath-guide ${state.class}`;
      const scale = state.key === 'inhale' ? 0.75 + state.progress * 0.25 : state.key === 'exhale' ? 1 - state.progress * 0.25 : state.key === 'holdIn' || state.key === 'recovery' ? 1 : 0.75;
      guide.style.transform = `scale(${scale})`;
    }, complete: finish,
  });
  begin.addEventListener('click', () => {
    try {
      if (pending) throw new Error('Save or cancel the previous session first.');
      if (BREATH_METHODS[method.value]?.advanced && !ack.checked) throw new Error('Acknowledge the Wim Hof-style cautions before starting.');
      protocol = BREATH_METHODS[method.value]?.protocol;
      targetRounds = rounds.valueAsNumber;
      if (!Number.isInteger(targetRounds) || targetRounds < 1 || targetRounds > 100) throw new Error('Choose 1–100 rounds.');
      pattern = validateBreathPattern(Object.fromEntries(BREATH_PHASES.map(phase => [phase.key, find(phase.key).valueAsNumber])));
      sessionMethod = method.value === 'custom' ? 'Custom' : BREATH_METHODS[method.value].label;
      controls(true); status.textContent = 'Breathe gently; stop if uncomfortable.';
      timer.start(breathRoundSeconds(pattern, protocol) * targetRounds);
    } catch (error) { status.textContent = error.message; }
  });
  pause.addEventListener('click', () => {
    if (paused) timer.resume(); else timer.pause();
    paused = !paused; pause.textContent = paused ? 'Resume' : 'Pause';
  });
  end.addEventListener('click', () => finish(timer.end()));
  find('save').addEventListener('click', () => {
    try {
      if (!pending) return;
      const session = validateBreathSession({ ...pending, feeling: find('feeling').value, notes: find('notes').value.trim() });
      const data = load(); data.breathworkSessions = [...(data.breathworkSessions || []), session]; save(data);
      pending = null; ack.checked = false; controls(false); renderHistory(); celebrateBreathworkCompletion();
      find('notes').value = ''; find('feeling').value = ''; status.textContent = 'Breathwork session saved.';
    } catch (error) { status.textContent = error.message; }
  });
  function cancel() {
    timer.cancel(); pending = null; pattern = null; guide.className = 'breath-guide'; guide.style.transform = '';
    controls(false); resetAdvanced(); find('phase').textContent = 'Ready'; find('round-count').textContent = '';
    find('notes').value = ''; find('feeling').value = ''; status.textContent = '';
  }
  find('cancel').addEventListener('click', cancel);
  window.addEventListener('pagehide', cancel);
  window.addEventListener('bignuten:fitness-data-restored', () => { cancel(); renderHistory(); });
  renderHistory(); controls(false);
  return { cancel };
}
