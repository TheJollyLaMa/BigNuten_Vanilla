import { normalizeWorkoutSession, workoutDurationSeconds, formatWorkoutDuration } from './workoutBody.js';

export function initWorkoutReview({ load, save, onSaved = () => {} }) {
  const form = document.getElementById('workout-session-form');
  const picker = document.getElementById('workout-session-picker');
  const typePicker = document.getElementById('workout-trend-type');
  const status = document.getElementById('workout-session-status');
  let chart;
  function sessions() { return load().sessionLog || []; }
  function fill() {
    const session = sessions()[Number(picker.value)];
    form.hidden = !session;
    if (!session) return;
    document.getElementById('workout-rpe').value = session.rpe ?? '';
    const duration = workoutDurationSeconds(session);
    const input = document.getElementById('workout-session-duration');
    input.value = duration === null ? '' : Number((duration / 60).toFixed(4));
    input.disabled = Number.isFinite(Date.parse(session.start)) && Number.isFinite(Date.parse(session.end)) && Date.parse(session.end) >= Date.parse(session.start);
    document.getElementById('workout-soreness').checked = session.recovery?.soreness || false;
    document.getElementById('workout-tightness').checked = session.recovery?.tightness || false;
    document.getElementById('workout-recovery-note').value = session.recovery?.note || '';
  }
  function workoutTypes(session, data) {
    return session.workoutTypes || [...new Set(data.exercises.entries.filter(entry => entry.workoutSessionId === session.sessionId).map(entry => entry.type))];
  }
  function render() {
    const data = load(), selected = picker.value;
    picker.replaceChildren();
    const history = document.getElementById('workout-session-history');
    history.replaceChildren();
    data.sessionLog.forEach((session, index) => {
      const label = `${session.start || session.date || session.sessionId || 'Legacy session'} — ${session.completed === false ? 'canceled' : 'workout'} — ${formatWorkoutDuration(session)}`;
      picker.add(new Option(label, String(index)));
      const item = document.createElement('li');
      const recovery = session.recovery;
      item.textContent = `${label} — RPE ${session.rpe ?? 'not recorded'}${recovery ? ` — ${[recovery.soreness ? 'soreness' : '', recovery.tightness ? 'tightness' : '', recovery.note].filter(Boolean).join('; ') || 'no recovery concerns recorded'}` : ''}`;
      history.prepend(item);
    });
    if (!data.sessionLog.length) history.textContent = 'No workout sessions yet.';
    picker.value = [...picker.options].some(option => option.value === selected) ? selected : String(data.sessionLog.length - 1);
    fill();
    const types = [...new Set(data.sessionLog.flatMap(session => workoutTypes(session, data)))];
    const selectedType = typePicker.value;
    typePicker.replaceChildren(new Option('All workout types', 'all'), ...types.map(type => new Option(type, type)));
    if (types.includes(selectedType)) typePicker.value = selectedType;
    renderChart();
  }
  function renderChart() {
    const data = load();
    const rows = data.sessionLog.filter(session => typePicker.value === 'all' || workoutTypes(session, data).includes(typePicker.value));
    const points = key => rows.map(session => ({ x: new Date(session.start || session.date), y: key === 'rpe' ? session.rpe : workoutDurationSeconds(session) === null ? null : workoutDurationSeconds(session) / 60 })).filter(point => Number.isFinite(point.x.getTime()) && typeof point.y === 'number').sort((a, b) => a.x - b.x);
    chart?.destroy();
    if (typeof Chart !== 'undefined') chart = new Chart(document.getElementById('workout-session-chart'), {
      type: 'line', data: { datasets: [
        { label: 'Session RPE (1–10)', data: points('rpe'), borderColor: '#ffbb66', yAxisID: 'rpe' },
        { label: 'Elapsed duration (min)', data: points('duration'), borderColor: '#00e5ff', yAxisID: 'duration' },
      ] }, options: { scales: { x: { type: 'time' }, rpe: { min: 1, max: 10, title: { display: true, text: 'RPE' } }, duration: { position: 'right', beginAtZero: true, title: { display: true, text: 'Minutes' } } } },
    });
  }
  picker.addEventListener('change', () => { status.textContent = ''; fill(); });
  typePicker.addEventListener('change', renderChart);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const data = load(), index = Number(picker.value), session = { ...data.sessionLog[index] };
      const rpe = document.getElementById('workout-rpe').value;
      if (rpe === '') delete session.rpe; else session.rpe = Number(rpe);
      const input = document.getElementById('workout-session-duration');
      if (!input.disabled) {
        if (input.value === '') delete session.durationSeconds;
        else session.durationSeconds = Number(input.value) * 60;
      }
      session.recovery = { soreness: document.getElementById('workout-soreness').checked, tightness: document.getElementById('workout-tightness').checked, note: document.getElementById('workout-recovery-note').value.trim() };
      data.sessionLog[index] = normalizeWorkoutSession(session);
      save(data); render(); onSaved(); status.textContent = 'Workout details saved.';
    } catch (error) { status.textContent = error.message; }
  });
  window.addEventListener('bignuten:workout-recorded', () => { picker.value = ''; render(); picker.value = String(sessions().length - 1); fill(); });
  window.addEventListener('bignuten:fitness-data-restored', render);
  render();
}
