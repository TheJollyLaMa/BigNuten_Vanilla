import { METRIC_REGISTRY, getMetric, metricFields, getDisplayUnit, convertMetricValue,
  validateMetricLog, normalizeMetricLogs, getUnitSystem, UNIT_SYSTEM_KEY, metricSeries, metricPoints } from './metrics.js';

/** Heart hub follows the shared chakra modal lifecycle; storage stays in fitnessTrackerData. */
export function initHeartMetrics({ load, save, showModal, hideModal }) {
  const modal = document.getElementById('heart-modal');
  if (!modal) return;
  const picker = modal.querySelector('#metric-picker');
  const form = modal.querySelector('#metric-log-form');
  const fields = modal.querySelector('#metric-value-fields');
  const datetime = modal.querySelector('#metric-datetime');
  const note = modal.querySelector('#metric-note');
  const status = modal.querySelector('#metric-status');
  const range = modal.querySelector('#metric-trend-range');
  let chart;
  let opener;

  METRIC_REGISTRY.forEach(metric => picker.add(new Option(metric.label, metric.id)));
  function setNow() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    datetime.value = now.toISOString().slice(0, 16);
  }
  function renderFields() {
    const metric = getMetric(picker.value);
    fields.replaceChildren();
    for (const field of metricFields(metric)) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      const unit = getDisplayUnit(field, getUnitSystem());
      label.textContent = `${field.label} (${unit.unit})`;
      input.id = `metric-value${field.key ? `-${field.key}` : ''}`;
      input.name = field.key || 'value';
      input.type = field.input.type;
      input.step = field.input.step ?? 'any';
      input.min = (field.range[0] - unit.offset) / unit.scale;
      input.max = (field.range[1] - unit.offset) / unit.scale;
      input.required = true;
      label.append(input);
      fields.append(label);
    }
    modal.querySelector('#metric-safety').textContent = metric.safetyNotice;
    status.textContent = '';
    render();
  }
  function render() {
    const metric = getMetric(picker.value);
    const logs = (load().metricLogs || []).filter(log => log.metric === metric.id)
      .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
    const history = modal.querySelector('#metric-history');
    history.replaceChildren();
    if (!logs.length) {
      const empty = document.createElement('li');
      empty.textContent = 'No readings yet.';
      history.append(empty);
    }
    for (const log of logs) {
      const li = document.createElement('li');
      const converted = convertMetricValue(log.value, metric, getUnitSystem(), 'fromCanonical');
      const reading = metricFields(metric).map(field => {
        const value = field.key ? converted[field.key] : converted;
        return `${field.key ? `${field.label}: ` : ''}${Number(value.toFixed(2))} ${getDisplayUnit(field, getUnitSystem()).unit}`;
      }).join(' / ');
      const text = document.createElement('span');
      text.textContent = `${log.date} ${log.time} — ${reading}${log.note ? ` — ${log.note}` : ''} (${log.source})`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete reading ${log.date} ${log.time}`);
      remove.addEventListener('click', () => {
        try {
          const data = load();
          data.metricLogs = data.metricLogs.filter(entry => entry.id !== log.id);
          save(data);
          render();
        } catch (error) { status.textContent = error.message; }
      });
      li.append(text, remove);
      history.append(li);
    }
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
    const cutoff = new Date(now); cutoff.setDate(now.getDate() - (Number(range.value) - 1)); cutoff.setHours(0, 0, 0, 0);
    const series = metricSeries(metric);
    const summaries = [];
    const datasets = series.map((entry, index) => {
      const points = metricPoints(logs, entry, getUnitSystem());
      const weekly = points.filter(point => point.x >= weekStart && point.x <= now).map(point => point.y);
      const unit = getDisplayUnit(entry.field, getUnitSystem()).unit;
      summaries.push(weekly.length
        ? `${entry.label}: 7-day reading average ${(weekly.reduce((sum, value) => sum + value, 0) / weekly.length).toFixed(1)} ${unit}; lowest ${Math.min(...weekly)} / highest ${Math.max(...weekly)} ${unit}.`
        : `${entry.label}: no readings in the last 7 days.`);
      return { label: `${entry.label} (${unit})`, data: points.filter(point => point.x >= cutoff && point.x <= now), borderColor: index ? '#66bbff' : '#42d68b', backgroundColor: '#42d68b55', tension: 0.2 };
    });
    modal.querySelector('#metric-summary').textContent = summaries.join(' ');
    chart?.destroy();
    if (typeof Chart !== 'undefined') chart = new Chart(modal.querySelector('#metric-trend-chart'), {
      type: metric.chartType,
      data: { datasets },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: 'time', time: { unit: range.value === '1' ? 'hour' : 'day' } } } },
    });
  }
  function close() {
    hideModal('heart-modal');
    chart?.destroy(); chart = null;
    opener?.focus();
  }
  const heart = document.getElementById('chakra-heart');
  heart?.setAttribute('role', 'button');
  heart?.setAttribute('tabindex', '0');
  heart?.setAttribute('aria-haspopup', 'dialog');
  function open() {
    opener = heart;
    setNow();
    showModal('heart-modal');
    renderFields();
    modal.querySelector('#heart-modal-close').focus();
  }
  heart?.addEventListener('click', open);
  heart?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
  });
  modal.querySelector('#heart-modal-close').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button, input, select, textarea, [tabindex="0"]')]
      .filter(el => !el.disabled && el.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  const tabs = [...modal.querySelectorAll('[role="tab"]')];
  function activateTab(tab) {
    tabs.forEach(button => {
      const active = button === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      document.getElementById(button.getAttribute('aria-controls')).hidden = !active;
    });
    if (tab.id === 'heart-vitals-tab') render();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1)
        : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      activateTab(next); next.focus();
    });
  });
  picker.addEventListener('change', renderFields);
  range.addEventListener('change', render);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const metric = getMetric(picker.value);
      const values = Object.fromEntries([...fields.querySelectorAll('input')].map(input => [input.name, input.valueAsNumber]));
      const [date, time] = datetime.value.split('T');
      const log = validateMetricLog({
        id: crypto.randomUUID(), metric: metric.id,
        value: convertMetricValue(metric.fields ? values : values.value, metric, getUnitSystem()),
        unit: metric.canonicalUnit, date, time, note: note.value.trim(), source: 'self-reported',
      });
      const data = load();
      data.metricLogs = normalizeMetricLogs([...(data.metricLogs || []), log]);
      save(data);
      note.value = '';
      fields.querySelectorAll('input').forEach(input => { input.value = ''; });
      render();
      status.textContent = 'Reading saved.';
    } catch (error) { status.textContent = error.message; }
  });
  const setting = document.getElementById('settings-metric-units');
  if (setting) {
    setting.value = getUnitSystem();
    setting.addEventListener('change', () => {
      localStorage.setItem(UNIT_SYSTEM_KEY, setting.value);
      renderFields();
      window.dispatchEvent(new Event('metricUnitsChanged'));
    });
  }
  window.addEventListener('bignuten:fitness-data-restored', () => { if (!modal.classList.contains('modal-hidden')) render(); });
}
