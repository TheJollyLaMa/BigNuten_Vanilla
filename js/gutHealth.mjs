const GASES = ['hydrogen', 'methane'];
const PHASES = ['baseline', 'after-challenge', 'other'];
const SYMPTOMS = ['Bloating', 'Abdominal discomfort', 'Gas', 'Nausea', 'Constipation', 'Diarrhea', 'Other'];
const MAX_NOTE = 2000;
import { validateObservation } from './gutObservations.mjs';

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, field, { required = false, max = MAX_NOTE } = {}) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`Enter a valid ${field}.`);
  return value.trim();
}
function timestamp(value, field) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`Enter a valid ${field} timestamp.`);
  return value;
}
function id(value, field) { return text(value, `${field} ID`, { required: true, max: 100 }); }
function nullableId(value, field) { return value == null || value === '' ? null : id(value, field); }

export function validateGutGasReading(value, gas = 'breath') {
  if (!object(value)) throw new Error(`Enter a ${gas} value and its exact scale.`);
  if (value.value == null || (typeof value.value === 'string' && !value.value.trim()) || typeof value.value === 'boolean') throw new Error(`${gas} must be a finite, non-negative number.`);
  const amount = Number(value.value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${gas} must be a finite, non-negative number.`);
  const scale = text(value.scale, `${gas} unit or exact score scale`, { required: true, max: 80 });
  const scaleType = scale.toLowerCase() === 'ppm' ? 'ppm' : 'reported-scale';
  return { value: amount, scale, scaleType };
}

export function validateGutReading(reading) {
  if (!object(reading)) throw new Error('Breath reading must be an object.');
  const normalized = {
    id: id(reading.id, 'Reading'),
    timestamp: timestamp(reading.timestamp, 'Reading'),
    phase: text(reading.phase, 'reading phase', { required: true, max: 40 }),
    source: text(reading.source, 'manual reading source', { required: true, max: 120 }),
    hydrogen: reading.hydrogen == null ? null : validateGutGasReading(reading.hydrogen, 'Hydrogen'),
    methane: reading.methane == null ? null : validateGutGasReading(reading.methane, 'Methane'),
    note: text(reading.note ?? '', 'reading note'),
  };
  if (!PHASES.includes(normalized.phase)) throw new Error('Choose baseline, after challenge, or other for the reading phase.');
  if (!normalized.hydrogen && !normalized.methane) throw new Error('Enter hydrogen, methane, or both.');
  return normalized;
}

export function validateGutSession(session) {
  if (!object(session)) throw new Error('Test session must be an object.');
  if (!Array.isArray(session.readings)) throw new Error('Session readings must be a list.');
  const meal = session.mealContext == null ? null : (() => {
    if (!object(session.mealContext)) throw new Error('Meal context must be a linked diet record.');
    const fiber = session.mealContext.fiber == null || session.mealContext.fiber === '' ? null : Number(session.mealContext.fiber);
    if (fiber !== null && (!Number.isFinite(fiber) || fiber < 0)) throw new Error('Linked meal fiber must be non-negative.');
    return {
      id: text(session.mealContext.id ?? '', 'linked meal ID', { max: 100 }),
      name: text(session.mealContext.name, 'linked meal name', { required: true, max: 200 }),
      date: text(session.mealContext.date ?? '', 'linked meal date', { max: 40 }),
      fiber,
    };
  })();
  const result = {
    id: id(session.id, 'Session'),
    challenge: text(session.challenge ?? '', 'test or challenge name', { max: 200 }),
    startedAt: timestamp(session.startedAt, 'Session'),
    mealContext: meal,
    note: text(session.note ?? '', 'session note'),
    readings: session.readings.map(validateGutReading).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  };
  const readingIds = new Set();
  for (const reading of result.readings) {
    if (readingIds.has(reading.id)) throw new Error('A session cannot contain duplicate reading IDs.');
    readingIds.add(reading.id);
  }
  return result;
}

export function validateGutSymptom(symptom) {
  if (!object(symptom)) throw new Error('Symptom entry must be an object.');
  if (symptom.intensity == null || (typeof symptom.intensity === 'string' && !symptom.intensity.trim()) || typeof symptom.intensity === 'boolean') throw new Error('Symptom intensity must be a whole number from 0 to 10.');
  const intensity = Number(symptom.intensity);
  if (!Number.isInteger(intensity) || intensity < 0 || intensity > 10) throw new Error('Symptom intensity must be a whole number from 0 to 10.');
  const stoolForm = symptom.stoolForm == null || symptom.stoolForm === '' ? null : Number(symptom.stoolForm);
  if (stoolForm !== null && (!Number.isInteger(stoolForm) || stoolForm < 1 || stoolForm > 7)) throw new Error('Optional stool form must be a whole number from 1 to 7.');
  const type = text(symptom.type, 'symptom', { required: true, max: 80 });
  if (!SYMPTOMS.includes(type)) throw new Error('Choose a symptom from the list.');
  return {
    id: id(symptom.id, 'Symptom'),
    sessionId: nullableId(symptom.sessionId, 'Session'),
    timestamp: timestamp(symptom.timestamp, 'Symptom'),
    type,
    intensity,
    stoolForm,
    note: text(symptom.note ?? '', 'symptom note'),
  };
}

export function normalizeGutHealth(value) {
  if (value === undefined) return { sessions: [], symptoms: [] };
  if (!object(value)) throw new Error('Gut-health records must be an object.');
  if (value.sessions !== undefined && !Array.isArray(value.sessions)) throw new Error('Gut-health sessions must be a list.');
  if (value.symptoms !== undefined && !Array.isArray(value.symptoms)) throw new Error('Gut-health symptoms must be a list.');
  const sessions = (value.sessions || []).map(validateGutSession).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const symptoms = (value.symptoms || []).map(validateGutSymptom).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const sessionIds = new Set();
  for (const session of sessions) {
    if (sessionIds.has(session.id)) throw new Error('Gut-health session IDs must be unique.');
    sessionIds.add(session.id);
  }
  const symptomIds = new Set();
  for (const symptom of symptoms) {
    if (symptomIds.has(symptom.id)) throw new Error('Gut-health symptom IDs must be unique.');
    if (symptom.sessionId && !sessionIds.has(symptom.sessionId)) throw new Error('A symptom may reference only an existing test session.');
    symptomIds.add(symptom.id);
  }
  if (value.observations !== undefined && !Array.isArray(value.observations)) throw new Error('Observation periods must be a list.');
  const observations = (value.observations || []).map(validateObservation);
  if (new Set(observations.map(item => item.id)).size !== observations.length) throw new Error('Duplicate observation IDs.');
  return { sessions, symptoms, ...(observations.length ? { observations } : {}) };
}

/** Computes only like-for-like follow-up peaks against the earliest same-scale baseline. */
export function calculateGutProgress(value) {
  const data = normalizeGutHealth(value);
  const sessionResults = [];
  for (const session of data.sessions) {
    for (const gas of GASES) {
      const available = session.readings.filter(reading => reading[gas]);
      const baseline = available.find(reading => reading.phase === 'baseline');
      if (!baseline) continue;
      const comparable = available.filter(reading => reading[gas].scaleType === baseline[gas].scaleType && reading[gas].scale === baseline[gas].scale);
      const followups = comparable.filter(reading => reading.phase !== 'baseline');
      if (!followups.length) continue;
      const peak = followups.reduce((highest, reading) => reading[gas].value > highest.value ? reading[gas] : highest, followups[0][gas]);
      sessionResults.push({
        sessionId: session.id, challenge: session.challenge, date: session.startedAt,
        gas, scale: baseline[gas].scale, scaleType: baseline[gas].scaleType, baseline: baseline[gas].value, peak: peak.value,
        peakRise: peak.value - baseline[gas].value,
      });
    }
  }
  const groups = new Map();
  for (const result of sessionResults) {
    const key = `${result.gas}\u0000${result.scaleType}\u0000${result.scale}`;
    if (!groups.has(key)) groups.set(key, { gas: result.gas, scale: result.scale, scaleType: result.scaleType, results: [] });
    groups.get(key).results.push(result);
  }
  const trends = [...groups.values()].map(group => {
    const results = group.results.sort((a, b) => a.date.localeCompare(b.date));
    const xs = results.map(row => Date.parse(row.date) / 86_400_000);
    const ys = results.map(row => row.peakRise);
    const xMean = xs.reduce((sum, number) => sum + number, 0) / xs.length;
    const yMean = ys.reduce((sum, number) => sum + number, 0) / ys.length;
    const denominator = xs.reduce((sum, number) => sum + (number - xMean) ** 2, 0);
    const slopePerDay = results.length < 2 || denominator === 0 ? null
      : xs.reduce((sum, number, index) => sum + (number - xMean) * (ys[index] - yMean), 0) / denominator;
    return { gas: group.gas, scale: group.scale, scaleType: group.scaleType, results, slopePerDay };
  });
  return { sessionResults, trends };
}

function localDateTime(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function toIso(local) {
  const parsed = new Date(local);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Choose a valid date and time.');
  return parsed.toISOString();
}
function newId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
function el(tag, attrs = {}, value = '') {
  const node = document.createElement(tag);
  for (const [key, content] of Object.entries(attrs)) {
    if (key === 'className') node.className = content;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), content);
    else node.setAttribute(key, content);
  }
  if (value) node.textContent = value;
  return node;
}
function displayNumber(value) { return `${value > 0 ? '+' : ''}${Number(value.toFixed(2))}`; }

export function initGutHealth({ load, save, showModal, hideModal }) {
  const modal = document.getElementById('gut-health-modal');
  if (!modal) return;
  const sessionPicker = modal.querySelector('#gut-session-picker');
  const sessionForm = modal.querySelector('#gut-session-form');
  const readingForm = modal.querySelector('#gut-reading-form');
  const symptomForm = modal.querySelector('#gut-symptom-form');
  const status = modal.querySelector('#gut-health-status');
  const sessionList = modal.querySelector('#gut-session-history');
  const symptomList = modal.querySelector('#gut-symptom-history');
  const trendPicker = modal.querySelector('#gut-trend-picker');
  let editingSessionId = null, editingReadingId = null, editingSymptomId = null;

  function dataset() { return normalizeGutHealth(load().gutHealth); }
  function feedback(message = '') { status.textContent = message; }
  function setDatetime(input, value) { input.value = localDateTime(value ? new Date(value) : new Date()); }
  function resetReading() {
    editingReadingId = null; readingForm.reset(); setDatetime(readingForm.querySelector('[name="timestamp"]'));
    readingForm.querySelector('[name="phase"]').value = 'baseline';
    readingForm.querySelector('[name="source"]').value = '';
    readingForm.querySelector('button[type="submit"]').textContent = 'Save breath reading';
  }
  function resetSymptom() {
    editingSymptomId = null; symptomForm.reset(); setDatetime(symptomForm.querySelector('[name="timestamp"]'));
    symptomForm.querySelector('[name="intensity"]').value = '0';
    symptomForm.querySelector('[name="intensity-label"]').textContent = '0';
    symptomForm.querySelector('button[type="submit"]').textContent = 'Save symptom';
  }
  function renderSessionChoices(data = dataset()) {
    const current = sessionPicker.value;
    sessionPicker.replaceChildren(new Option('Choose a session', ''));
    for (const session of data.sessions) {
      const label = `${session.challenge || 'Untitled session'} — ${new Date(session.startedAt).toLocaleString()}`;
      sessionPicker.add(new Option(label, session.id));
    }
    if (data.sessions.some(session => session.id === current)) sessionPicker.value = current;
    const symptomSession = symptomForm.querySelector('[name="sessionId"]');
    const symptomCurrent = symptomSession.value;
    symptomSession.replaceChildren(new Option('No linked session', ''));
    for (const session of data.sessions) symptomSession.add(new Option(session.challenge || 'Untitled session', session.id));
    if (data.sessions.some(session => session.id === symptomCurrent)) symptomSession.value = symptomCurrent;
  }
  function renderMealChoices(selected = '') {
    const select = sessionForm.querySelector('[name="mealIndex"]');
    const foods = load().foods || [];
    select.replaceChildren(new Option('No meal linked', ''));
    foods.forEach((food, index) => {
      const label = [food.name || 'Meal', food.date || food.timestamp?.slice(0, 10), food.nutr?.fiber != null ? `${food.nutr.fiber} g fiber` : ''].filter(Boolean).join(' · ');
      select.add(new Option(label, String(index)));
    });
    if (selected !== '') select.value = String(selected);
  }
  function selectedSession(data = dataset()) { return data.sessions.find(session => session.id === sessionPicker.value); }
  function renderTrend(data) {
    const progress = calculateGutProgress(data);
    trendPicker.replaceChildren(new Option('Choose gas and scale', ''));
    for (const trend of progress.trends) trendPicker.add(new Option(`${trend.gas} · ${trend.scaleType === 'ppm' ? 'ppm' : `reported scale: ${trend.scale}`}`, `${trend.gas}\u0000${trend.scaleType}\u0000${trend.scale}`));
    const choice = progress.trends.find(item => `${item.gas}\u0000${item.scaleType}\u0000${item.scale}` === trendPicker.value) || progress.trends[0];
    if (choice) trendPicker.value = `${choice.gas}\u0000${choice.scaleType}\u0000${choice.scale}`;
    const chart = modal.querySelector('#gut-health-chart');
    chart.replaceChildren();
    chart.setAttribute('viewBox', '0 0 640 220');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', choice ? `${choice.gas} peak rises above baseline, measured as ${choice.scaleType === 'ppm' ? 'ppm' : `reported scale ${choice.scale}`}; see session history for exact values` : 'No comparable baseline and follow-up readings yet');
    const summary = modal.querySelector('#gut-trend-summary');
    summary.replaceChildren();
    if (!choice) {
      summary.textContent = 'Log a baseline and at least one follow-up reading with the same exact scale to see a session comparison.';
      return;
    }
    const rows = choice.results;
    const min = Math.min(0, ...rows.map(row => row.peakRise));
    const max = Math.max(0, ...rows.map(row => row.peakRise));
    const span = max - min || 1;
    const x = index => rows.length === 1 ? 320 : 55 + index * 530 / (rows.length - 1);
    const y = value => 175 - (value - min) / span * 130;
    const line = el('line', { x1: 45, y1: 175, x2: 595, y2: 175, stroke: '#29445b', 'stroke-width': 1 });
    chart.append(line);
    const polyline = el('polyline', { fill: 'none', stroke: '#00e5ff', 'stroke-width': 3, points: rows.map((row, index) => `${x(index)},${y(row.peakRise)}`).join(' ') });
    chart.append(polyline);
    rows.forEach((row, index) => {
      chart.append(el('circle', { cx: x(index), cy: y(row.peakRise), r: 5, fill: '#00e5ff' }));
      const date = new Date(row.date).toLocaleDateString();
      chart.append(el('text', { x: x(index), y: 198, fill: '#c8ebff', 'font-size': 11, 'text-anchor': 'middle' }, date));
    });
    const allValues = rows.map(row => `${row.challenge || new Date(row.date).toLocaleDateString()}: baseline ${row.baseline}, peak ${row.peak}, rise ${displayNumber(row.peakRise)} ${row.scaleType === 'ppm' ? 'ppm' : `reported scale (${row.scale})`}`);
    const history = el('ul');
    for (const value of allValues) history.append(el('li', {}, value));
    summary.append(history);
    const slope = choice.slopePerDay;
    const lineText = slope == null ? 'Trend needs at least two sessions on different dates.' : `Recorded trend: ${displayNumber(slope)} ${choice.scaleType === 'ppm' ? 'ppm' : `reported scale (${choice.scale})`} peak-rise per day across these sessions.`;
    summary.prepend(el('p', {}, lineText));
  }
  function render() {
    const data = dataset();
    renderSessionChoices(data);
    renderMealChoices();
    sessionList.replaceChildren();
    symptomList.replaceChildren();
    const current = selectedSession(data);
    for (const session of data.sessions.slice().reverse()) {
      const item = el('li', { className: 'gut-history-session' });
      const title = el('strong', {}, session.challenge || 'Untitled session');
      item.append(title, el('p', {}, `${new Date(session.startedAt).toLocaleString()} · ${session.readings.length} breath reading(s)${session.mealContext ? ` · linked diet log: ${session.mealContext.name}${session.mealContext.fiber !== null ? ` (${session.mealContext.fiber} g fiber)` : ''}` : ''}`));
      if (session.note) item.append(el('p', {}, session.note));
      for (const reading of session.readings.slice().reverse()) {
        const gases = GASES.filter(gas => reading[gas]).map(gas => `${gas}: ${reading[gas].value} ${reading[gas].scaleType === 'ppm' ? 'ppm' : `reported scale (${reading[gas].scale})`}`).join(' · ');
        const row = el('div', { className: 'gut-history-row' });
        row.append(el('span', {}, `${new Date(reading.timestamp).toLocaleString()} · ${reading.phase.replace('-', ' ')} · ${gases} · ${reading.source}${reading.note ? ` · ${reading.note}` : ''}`));
        const edit = el('button', { type: 'button', 'aria-label': `Edit breath reading ${new Date(reading.timestamp).toLocaleString()}` }, 'Edit');
        edit.addEventListener('click', () => editReading(session, reading));
        const remove = el('button', { type: 'button', 'aria-label': `Delete breath reading ${new Date(reading.timestamp).toLocaleString()}` }, 'Delete');
        remove.addEventListener('click', () => mutate(dataNow => {
          const parent = dataNow.sessions.find(entry => entry.id === session.id);
          parent.readings = parent.readings.filter(entry => entry.id !== reading.id);
        }, 'Breath reading deleted.'));
        row.append(edit, remove); item.append(row);
      }
      const select = el('button', { type: 'button' }, current?.id === session.id ? 'Selected session' : 'Select session');
      select.disabled = current?.id === session.id;
      select.addEventListener('click', () => { sessionPicker.value = session.id; render(); });
      item.append(select);
      sessionList.append(item);
    }
    if (!data.sessions.length) sessionList.append(el('li', {}, 'No test sessions yet. A session is optional for symptom entries.'));
    for (const symptom of data.symptoms.slice().reverse()) {
      const item = el('li', { className: 'gut-history-row' });
      const linked = data.sessions.find(session => session.id === symptom.sessionId);
      item.append(el('span', {}, `${new Date(symptom.timestamp).toLocaleString()} · ${symptom.type} ${symptom.intensity}/10${symptom.stoolForm ? ` · stool form ${symptom.stoolForm}/7` : ''}${linked ? ` · ${linked.challenge || 'test session'}` : ''}${symptom.note ? ` · ${symptom.note}` : ''}`));
      const edit = el('button', { type: 'button', 'aria-label': `Edit ${symptom.type} symptom` }, 'Edit');
      edit.addEventListener('click', () => editSymptom(symptom));
      const remove = el('button', { type: 'button', 'aria-label': `Delete ${symptom.type} symptom` }, 'Delete');
      remove.addEventListener('click', () => mutate(dataNow => { dataNow.symptoms = dataNow.symptoms.filter(entry => entry.id !== symptom.id); }, 'Symptom entry deleted.'));
      item.append(edit, remove); symptomList.append(item);
    }
    if (!data.symptoms.length) symptomList.append(el('li', {}, 'No symptoms recorded.'));
    renderTrend(data);
  }
  function mutate(change, success) {
    try {
      const data = dataset(); change(data); const next = load(); next.gutHealth = normalizeGutHealth(data); save(next);
      feedback(success); render();
    } catch (error) { feedback(error.message); }
  }
  function editReading(session, reading) {
    sessionPicker.value = session.id; editingReadingId = reading.id;
    const set = (name, value) => { readingForm.elements.namedItem(name).value = value ?? ''; };
    set('timestamp', localDateTime(new Date(reading.timestamp))); set('phase', reading.phase); set('source', reading.source); set('note', reading.note);
    for (const gas of GASES) { set(`${gas}Value`, reading[gas]?.value ?? ''); set(`${gas}Scale`, reading[gas]?.scale ?? ''); }
    readingForm.querySelector('button[type="submit"]').textContent = 'Update breath reading';
    feedback('Editing a breath reading.');
  }
  function editSymptom(symptom) {
    editingSymptomId = symptom.id;
    for (const name of ['sessionId', 'type', 'intensity', 'stoolForm', 'note']) symptomForm.elements.namedItem(name).value = symptom[name] ?? '';
    symptomForm.elements.namedItem('timestamp').value = localDateTime(new Date(symptom.timestamp));
    symptomForm.querySelector('[name="intensity-label"]').textContent = String(symptom.intensity);
    symptomForm.querySelector('button[type="submit"]').textContent = 'Update symptom';
    feedback('Editing a symptom entry.');
  }
  function resetSession() {
    editingSessionId = null; sessionForm.reset(); setDatetime(sessionForm.querySelector('[name="startedAt"]')); renderMealChoices();
    sessionForm.querySelector('button[type="submit"]').textContent = 'Create test / challenge session';
  }
  sessionForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const data = dataset(), mealIndex = sessionForm.elements.namedItem('mealIndex').value;
      const food = mealIndex === '' ? null : load().foods?.[Number(mealIndex)];
      const mealContext = food ? { id: String(food.id ?? ''), name: String(food.name || 'Meal'), date: String(food.date || food.timestamp || ''), fiber: food.nutr?.fiber == null ? null : Number(food.nutr.fiber) } : (editingSessionId ? data.sessions.find(session => session.id === editingSessionId)?.mealContext || null : null);
      const current = editingSessionId && data.sessions.find(session => session.id === editingSessionId);
      const session = validateGutSession({
        id: current?.id || newId('gut-session'), challenge: sessionForm.elements.namedItem('challenge').value,
        startedAt: toIso(sessionForm.elements.namedItem('startedAt').value), mealContext,
        note: sessionForm.elements.namedItem('note').value, readings: current?.readings || [],
      });
      if (current) data.sessions = data.sessions.map(entry => entry.id === current.id ? session : entry);
      else data.sessions.push(session);
      const next = load(); next.gutHealth = normalizeGutHealth(data); save(next);
      resetSession(); feedback('Test / challenge session saved.'); render();
      sessionPicker.value = session.id; render();
    } catch (error) { feedback(error.message); }
  });
  readingForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const data = dataset(), session = data.sessions.find(entry => entry.id === sessionPicker.value);
      if (!session) throw new Error('Choose a test session before saving breath readings.');
      const gas = name => {
        const value = readingForm.elements.namedItem(`${name}Value`).value.trim();
        const scale = readingForm.elements.namedItem(`${name}Scale`).value;
        return value === '' ? null : validateGutGasReading({ value, scale }, name);
      };
      const reading = validateGutReading({
        id: editingReadingId || newId('gut-reading'), timestamp: toIso(readingForm.elements.namedItem('timestamp').value),
        phase: readingForm.elements.namedItem('phase').value, source: readingForm.elements.namedItem('source').value,
        hydrogen: gas('hydrogen'), methane: gas('methane'), note: readingForm.elements.namedItem('note').value,
      });
      session.readings = session.readings.filter(entry => entry.id !== reading.id).concat(reading);
      mutate(dataNow => { dataNow.sessions = data.sessions; }, editingReadingId ? 'Breath reading updated.' : 'Breath reading saved.');
      resetReading();
    } catch (error) { feedback(error.message); }
  });
  symptomForm.addEventListener('input', event => {
    if (event.target.name === 'intensity') symptomForm.querySelector('[name="intensity-label"]').textContent = event.target.value;
  });
  symptomForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const data = dataset();
      const symptom = validateGutSymptom({
        id: editingSymptomId || newId('gut-symptom'), sessionId: symptomForm.elements.namedItem('sessionId').value || null,
        timestamp: toIso(symptomForm.elements.namedItem('timestamp').value), type: symptomForm.elements.namedItem('type').value,
        intensity: Number(symptomForm.elements.namedItem('intensity').value), stoolForm: symptomForm.elements.namedItem('stoolForm').value || null,
        note: symptomForm.elements.namedItem('note').value,
      });
      data.symptoms = data.symptoms.filter(entry => entry.id !== symptom.id).concat(symptom);
      mutate(dataNow => { dataNow.symptoms = data.symptoms; }, editingSymptomId ? 'Symptom entry updated.' : 'Symptom entry saved.');
      resetSymptom();
    } catch (error) { feedback(error.message); }
  });
  sessionPicker.addEventListener('change', () => {
    const session = selectedSession();
    if (session) {
      editingSessionId = session.id;
      sessionForm.querySelector('button[type="submit"]').textContent = 'Update test / challenge session';
      sessionForm.elements.namedItem('challenge').value = session.challenge;
      sessionForm.elements.namedItem('startedAt').value = localDateTime(new Date(session.startedAt));
      sessionForm.elements.namedItem('note').value = session.note;
      renderMealChoices('');
    }
    resetReading(); feedback(''); render();
  });
  modal.querySelector('#gut-session-new').addEventListener('click', resetSession);
  modal.querySelector('#gut-health-modal-close').addEventListener('click', () => hideModal('gut-health-modal'));
  modal.addEventListener('click', event => { if (event.target === modal) hideModal('gut-health-modal'); });
  modal.querySelector('#gut-session-delete').addEventListener('click', () => {
    const id = sessionPicker.value;
    if (!id) { feedback('Choose a session to delete.'); return; }
    mutate(data => { data.sessions = data.sessions.filter(entry => entry.id !== id); data.symptoms = data.symptoms.map(symptom => symptom.sessionId === id ? { ...symptom, sessionId: null } : symptom); }, 'Session deleted; its symptom entries were kept unlinked.');
    sessionPicker.value = ''; resetSession(); resetReading(); resetSymptom(); render();
  });
  trendPicker.addEventListener('change', () => render());
  modal.querySelector('#gut-symptom-clear').addEventListener('click', resetSymptom);
  document.getElementById('gut-health-open')?.addEventListener('click', () => { render(); showModal('gut-health-modal'); });
  window.addEventListener('bignuten:fitness-data-restored', render);
  setDatetime(sessionForm.querySelector('[name="startedAt"]'));
  resetReading(); resetSymptom(); render();
}

export const GUT_HEALTH_SYMPTOMS = [...SYMPTOMS];
