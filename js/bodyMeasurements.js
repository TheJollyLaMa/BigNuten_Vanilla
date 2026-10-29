import { getUnitSystem } from './metrics.js';
import { createMeasurement, measurementDisplay, shouldPromptMeasurements } from './workoutBody.js';

export function initBodyMeasurements({ load, save }) {
  const form = document.getElementById('measurement-form');
  if (!form) return;
  const picker = document.getElementById('measurement-type');
  const chartPicker = document.getElementById('measurement-chart-select');
  const status = document.getElementById('measurement-status');
  let chart, days = Infinity;
  function localNow() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString();
  }
  function setNow() {
    const now = localNow();
    form.elements['measurement-date'].value = now.slice(0, 10);
    form.elements['measurement-time'].value = now.slice(11, 16);
  }
  function render() {
    const data = load(), system = getUnitSystem();
    document.getElementById('measurement-value-label').textContent = `Measurement (${system === 'metric' ? 'cm' : 'inches'}):`;
    document.getElementById('measurement-reminder').hidden = !shouldPromptMeasurements(data.measurements, localNow().slice(0, 10), data.measurementReminderDismissedOn);
    const history = document.getElementById('measurement-history');
    history.replaceChildren();
    const grouped = new Map();
    const types = [...new Set(data.measurements.map(entry => entry.type).filter(Boolean))];
    for (const type of types) {
      for (const select of [picker, chartPicker]) if (![...select.options].some(option => option.value === type)) select.add(new Option(type, type));
    }
    const sorted = [...data.measurements].sort((a, b) => `${b.date}T${b.time || ''}`.localeCompare(`${a.date}T${a.time || ''}`));
    for (const entry of sorted) {
      const display = measurementDisplay(entry, system);
      const item = document.createElement('li');
      const fat = data.metricLogs.find(log => log.id === entry.bodyFatMetricId);
      item.textContent = `${entry.date || 'Date not recorded'} ${entry.time || ''} — ${entry.type || 'Measurement'}: ${Number(display.value.toFixed(2))} ${display.unit}${fat ? ` — Body fat: ${fat.value}% (${fat.source})` : ''} — Photo: ${entry.progressPhotoTaken ? 'taken' : 'not recorded'}${entry.progressPhotoNote ? ` — ${entry.progressPhotoNote}` : ''}`;
      history.append(item);
      const x = new Date(`${entry.date}T${entry.time || '00:00'}`);
      if (!Number.isFinite(x.getTime()) || !Number.isFinite(display.value) || (Date.now() - x.getTime()) / 86400000 > days || (chartPicker.value !== 'all' && entry.type !== chartPicker.value)) continue;
      const key = `${entry.type} (${display.unit})`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({ x, y: display.value });
    }
    if (!sorted.length) history.textContent = 'No measurements yet.';
    const colors = ['#00e5ff', '#ff6699', '#aa66ff', '#00ffcc', '#ffff00'];
    const datasets = [...grouped].map(([label, points], index) => ({ label, data: points.sort((a, b) => a.x - b.x), borderColor: colors[index % colors.length], tension: 0.2 }));
    if (typeof Chart !== 'undefined') {
      if (!chart) chart = new Chart(document.getElementById('measurement-chart'), {
        type: 'line', data: { datasets }, options: { scales: { x: { type: 'time', time: { unit: 'day' } }, y: { beginAtZero: true } } },
      });
      else { chart.data.datasets = datasets; chart.update(); }
    }
  }
  picker.addEventListener('change', () => {
    if (picker.value !== 'add-new') return;
    const type = prompt('Enter a new measurement type:')?.trim();
    if (type && type !== 'add-new') {
      if (![...picker.options].some(option => option.value === type)) picker.add(new Option(type, type));
      picker.value = type;
    } else picker.value = 'Bicep';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const bodyFatInput = document.getElementById('measurement-body-fat').value;
      const result = createMeasurement({
        type: picker.value, value: Number(document.getElementById('measurement').value),
        date: document.getElementById('measurement-date').value, time: document.getElementById('measurement-time').value,
        system: getUnitSystem(), photoTaken: document.getElementById('measurement-photo').checked,
        photoNote: document.getElementById('measurement-photo-note').value,
        bodyFat: bodyFatInput === '' ? null : Number(bodyFatInput), source: document.getElementById('measurement-body-fat-source').value,
      });
      const data = load();
      data.measurements.push(result.entry);
      if (result.metricLog) data.metricLogs.push(result.metricLog);
      save(data);
      form.reset(); setNow(); render();
      window.dispatchEvent(new Event('bignuten:fitness-data-restored'));
      status.textContent = 'Measurement saved. Photo metadata only; no image stored.';
    } catch (error) { status.textContent = error.message; }
  });
  chartPicker.addEventListener('change', render);
  document.querySelectorAll('#measurement-chart-toggle button').forEach(button => button.addEventListener('click', () => {
    days = ({ Day: 1, Week: 7, '2-Wk': 14, Month: 30, Year: 365, Max: Infinity })[button.textContent]; render();
  }));
  document.getElementById('measurement-reminder-dismiss').addEventListener('click', () => {
    const data = load(); data.measurementReminderDismissedOn = localNow().slice(0, 10); save(data); render();
  });
  document.getElementById('measurement-reminder-log').addEventListener('click', () => document.getElementById('log-measurements').click());
  document.getElementById('log-measurements').addEventListener('click', () => { setNow(); render(); });
  window.addEventListener('metricUnitsChanged', () => { document.getElementById('measurement').value = ''; render(); });
  window.addEventListener('bignuten:fitness-data-restored', render);
  setNow(); render();
}
