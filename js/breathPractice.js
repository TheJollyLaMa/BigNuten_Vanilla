import { celebrateChantingCompletion } from './chakra.js';
import { chantingStats, formatChantingDuration } from './chantingStats.js';

const CUSTOM_KEY = 'bignuten.chanting.customMantras.v1';
const MANTRAS = ['Aum / Om', 'So Hum', 'Sat Nam', 'Ra Ma Da Sa', 'Om Namah Shivaya'];
const COLORS = ['#68caff', '#bd9fff', '#ffce80', '#89e6b2', '#ff9acb'];
const SENSATIONS = { chest: '🫁 Chest', sinus: '👃 Sinus', head: '🧠 Head', heart: '❤️ Heart', deep: '🌀 Deep', euphoric: '✨ Euphoric', calm: '😌 Calm', energized: '🔥 Energized' };

export function initChantingModal({ getFitnessData, saveFitnessData, showModal, hideModal }) {
  const modal = document.getElementById('chanting-modal');
  if (!modal) return;
  const $ = id => document.getElementById(`chanting-${id}`);
  const mantra = $('mantra'), custom = $('custom'), target = $('target'), notes = $('notes');
  let interval = null, startedAt = null, elapsedMs = 0, active = false, savedId = null;
  let sessionMantra = '', targetSeconds = 0;
  const sensations = new Set();
  let customs = [];
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    if (Array.isArray(stored)) customs = [...new Set(stored.filter(value => typeof value === 'string' && value.trim() && value.length <= 120))];
  } catch { /* A damaged preference must not prevent health logging. */ }
  function option(value) {
    const el = document.createElement('option');
    el.value = el.textContent = value;
    mantra.appendChild(el);
  }
  [...MANTRAS, ...customs.filter(value => !MANTRAS.includes(value))].forEach(option);
  const customOption = document.createElement('option');
  customOption.value = '__custom__'; customOption.textContent = 'Custom…'; mantra.appendChild(customOption);

  function stopTimer() {
    if (interval !== null) clearInterval(interval);
    interval = null;
  }
  function elapsed() { return elapsedMs + (startedAt === null ? 0 : Math.max(0, Date.now() - startedAt)); }
  function renderTimer() {
    const seconds = Math.floor(elapsed() / 1000);
    $('timer').textContent = formatChantingDuration(seconds);
    const goal = active ? targetSeconds : Math.max(0, Number(target.value) * 60 || 0);
    const progress = goal ? Math.min(1, seconds / goal) : 0;
    $('progress').style.strokeDashoffset = String(100 * (1 - progress));
    $('ring').setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    $('ring').setAttribute('aria-valuetext', goal ? `${seconds} of ${goal} seconds` : `${seconds} seconds, no target`);
    $('start').disabled = active;
    $('pause').disabled = !active;
    $('pause').textContent = active && startedAt === null ? 'Resume' : 'Pause';
    $('complete').disabled = !active || seconds < 1;
    mantra.disabled = target.disabled = active;
    $('custom-add').disabled = active;
    custom.disabled = active;
    modal.classList.toggle('chanting-running', startedAt !== null);
  }
  function renderHistory() {
    const sessions = getFitnessData().chantingSessions || [];
    const stats = chantingStats(sessions);
    $('summary').textContent = `${formatChantingDuration(stats.weeklySeconds)} in the last 7 days · ${stats.streak} day streak (UTC)`;
    const list = $('log'); list.replaceChildren();
    for (const session of [...sessions].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))) {
      const item = document.createElement('li');
      const presetIndex = MANTRAS.indexOf(session.mantra);
      const colorIndex = presetIndex >= 0 ? presetIndex : [...String(session.mantra)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % COLORS.length;
      item.style.borderColor = COLORS[colorIndex];
      const title = document.createElement('strong');
      const date = new Date(session.timestamp);
      title.textContent = `${Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()} — ${session.mantra} — ${formatChantingDuration(session.durationSeconds)}`;
      const detail = document.createElement('p');
      detail.textContent = [session.completedGoal ? 'Target reached' : '', String(session.notes || '').slice(0, 180), ...(Array.isArray(session.sensations) ? session.sensations : []).map(tag => SENSATIONS[tag] || tag)].filter(Boolean).join(' · ');
      item.append(title, detail); list.appendChild(item);
    }
    if (!sessions.length) list.textContent = 'No chanting sessions yet.';
  }
  function reset() {
    stopTimer(); startedAt = null; elapsedMs = 0; active = false; savedId = null;
    notes.value = ''; sensations.clear();
    for (const button of $('sensations').querySelectorAll('button')) button.setAttribute('aria-pressed', 'false');
    $('status').textContent = ''; renderTimer();
  }
  function close() {
    updateSaved();
    reset(); hideModal('chanting-modal');
    document.getElementById('chakra-throat')?.focus();
  }
  function updateSaved() {
    if (!savedId) return;
    try {
      const data = getFitnessData();
      const entry = data.chantingSessions.find(session => session.id === savedId);
      if (!entry) return;
      entry.notes = notes.value.trim(); entry.sensations = [...sensations];
      saveFitnessData(data); renderHistory();
      $('status').textContent = 'Session saved. Notes and sensations updated.';
    } catch (error) { $('status').textContent = `Could not save changes: ${error.message}`; }
  }
  for (const [value, label] of Object.entries(SENSATIONS)) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.dataset.sensation = value;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      if (sensations.has(value)) sensations.delete(value); else sensations.add(value);
      button.setAttribute('aria-pressed', String(sensations.has(value))); updateSaved();
    });
    $('sensations').appendChild(button);
  }
  function addCustom() {
    const value = custom.value.trim();
    if (!value) { $('status').textContent = 'Enter a custom mantra first.'; return; }
    try {
      if (!MANTRAS.includes(value) && !customs.includes(value)) {
        const next = [...customs, value];
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(next)); customs = next;
        option(value);
      }
      mantra.value = value; custom.value = ''; $('custom-wrap').hidden = true;
      $('status').textContent = 'Mantra ready.';
    } catch (error) { $('status').textContent = `Could not save custom mantra: ${error.message}`; }
  }
  mantra.addEventListener('change', () => { $('custom-wrap').hidden = mantra.value !== '__custom__'; });
  $('custom-add').addEventListener('click', addCustom);
  target.addEventListener('input', renderTimer);
  notes.addEventListener('change', updateSaved);
  $('start').addEventListener('click', () => {
    if (active) return;
    if (mantra.value === '__custom__') { addCustom(); if (mantra.value === '__custom__') return; }
    if (!target.checkValidity()) { target.reportValidity(); return; }
    if (savedId) reset();
    sessionMantra = mantra.value;
    targetSeconds = Math.round(Number(target.value) * 60) || 0;
    active = true; startedAt = Date.now();
    stopTimer(); interval = setInterval(renderTimer, 250);
    $('status').textContent = 'Chant at your own comfortable pace.'; renderTimer();
  });
  $('pause').addEventListener('click', () => {
    if (!active) return;
    if (startedAt !== null) {
      elapsedMs = elapsed(); startedAt = null; stopTimer();
      $('status').textContent = 'Paused.';
    } else {
      startedAt = Date.now(); stopTimer(); interval = setInterval(renderTimer, 250);
      $('status').textContent = 'Resumed.';
    }
    renderTimer();
  });
  $('complete').addEventListener('click', () => {
    if (!active) return;
    elapsedMs = elapsed(); startedAt = null; stopTimer();
    const durationSeconds = Math.floor(elapsedMs / 1000);
    if (durationSeconds < 1) { renderTimer(); return; }
    try {
      const data = getFitnessData();
      const id = `${Date.now()}-${crypto.randomUUID()}`;
      data.chantingSessions.push({ id, mantra: sessionMantra, durationSeconds, targetSeconds,
        completedGoal: targetSeconds > 0 && durationSeconds >= targetSeconds,
        notes: notes.value.trim(), sensations: [...sensations], timestamp: new Date().toISOString() });
      saveFitnessData(data); savedId = id; active = false;
      $('status').textContent = 'Session saved. Add notes or sensations below, or start a new session.';
      renderHistory(); celebrateChantingCompletion();
    } catch (error) { $('status').textContent = `Could not save session: ${error.message}. Retry Complete.`; }
    renderTimer();
  });
  document.getElementById('chakra-throat')?.addEventListener('click', () => {
    reset(); renderHistory(); showModal('chanting-modal'); $('start').focus();
  });
  $('close').addEventListener('click', close);
  $('cancel').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.classList.contains('modal-hidden')) { event.preventDefault(); close(); }
  });
  window.addEventListener('pagehide', reset);
  window.addEventListener('bignuten:fitness-data-restored', () => {
    if (!modal.classList.contains('modal-hidden')) { reset(); renderHistory(); }
  });
  renderTimer();
}
