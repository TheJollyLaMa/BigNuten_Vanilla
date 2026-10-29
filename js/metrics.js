/** Canonical = display * scale + offset. Conversion metadata stays serializable. */
export const displayUnit = (unit, scale = 1, offset = 0) => ({ unit, scale, offset });

export const METRIC_REGISTRY = [
  {
    id: 'rhr',
    label: 'Resting heart rate',
    canonicalUnit: 'bpm',
    displayUnits: { imperial: displayUnit('bpm'), metric: displayUnit('bpm') },
    range: [30, 220],
    input: { type: 'number', step: 1 },
    chartType: 'line',
    safetyNotice: 'Not medical advice. Measure after resting quietly. Seek urgent care for chest pain, fainting or severe shortness of breath; discuss persistent unusual readings with a clinician. Lowest is not necessarily healthiest.',
    multiplePerDay: true,
  },
];

export function getMetric(id) {
  const metric = METRIC_REGISTRY.find(entry => entry.id === id);
  if (!metric) throw new Error(`Unknown metric: ${id}`);
  return metric;
}

export function metricFields(metric) {
  return metric.fields ? Object.entries(metric.fields).map(([key, field]) => ({ key, ...field }))
    : [{ key: null, label: metric.label, ...metric }];
}

export function getDisplayUnit(metric, system = 'imperial') {
  return metric.displayUnits[system] || metric.displayUnits.imperial;
}

export function toCanonical(value, definition, system = 'imperial') {
  const { scale, offset } = getDisplayUnit(definition, system);
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Enter a finite number.');
  return value * scale + offset;
}

export function fromCanonical(value, definition, system = 'imperial') {
  const { scale, offset } = getDisplayUnit(definition, system);
  return (value - offset) / scale;
}

export function convertMetricValue(value, metric, system, direction = 'toCanonical') {
  const convert = direction === 'fromCanonical' ? fromCanonical : toCanonical;
  if (!metric.fields) return convert(value, metric, system);
  return Object.fromEntries(metricFields(metric).map(field => [field.key, convert(value?.[field.key], field, system)]));
}

export function validateMetricValue(metric, value) {
  const fields = metricFields(metric);
  if (metric.fields && (!value || Array.isArray(value) || typeof value !== 'object' ||
      Object.keys(value).length !== fields.length)) throw new Error('Invalid compound reading.');
  for (const field of fields) {
    const number = field.key === null ? value : value[field.key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < field.range[0] || number > field.range[1]) {
      throw new Error(`${field.label}: enter ${field.range[0]}–${field.range[1]} ${metric.canonicalUnit}.`);
    }
  }
  return value;
}

export function validateMetricLog(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid metric log.');
  const metric = getMetric(entry.metric);
  validateMetricValue(metric, entry.value);
  if (entry.unit !== metric.canonicalUnit) throw new Error('Metric logs must use canonical units.');
  const date = typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
    ? new Date(`${entry.date}T12:00:00Z`) : new Date(NaN);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date ||
      typeof entry.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(entry.time)) throw new Error('Invalid metric date or time.');
  if (typeof entry.id !== 'string' || !entry.id.trim() || typeof entry.note !== 'string' ||
      !['self-reported', 'estimated', 'imported'].includes(entry.source)) throw new Error('Invalid metric metadata.');
  return entry;
}

export function normalizeMetricLogs(logs = []) {
  if (!Array.isArray(logs)) throw new Error('Invalid metric log list.');
  const days = new Set();
  return logs.map(entry => {
    validateMetricLog(entry);
    const key = `${entry.metric}:${entry.date}`;
    if (!getMetric(entry.metric).multiplePerDay && days.has(key)) throw new Error('Only one reading per day is allowed.');
    days.add(key);
    return entry;
  });
}

export const UNIT_SYSTEM_KEY = 'metricDisplayUnits';
export function getUnitSystem(storage = globalThis.localStorage) {
  return storage?.getItem(UNIT_SYSTEM_KEY) === 'metric' ? 'metric' : 'imperial';
}

export function metricSeries(metric) {
  return metricFields(metric).map(field => ({
    key: `metric:${metric.id}${field.key ? `:${field.key}` : ''}`,
    label: field.label,
    metric,
    field,
  }));
}

export function metricPoints(logs, series, system = 'imperial') {
  return (logs || []).filter(log => log.metric === series.metric.id).map(log => ({
    x: new Date(`${log.date}T${log.time}`),
    y: fromCanonical(series.field.key ? log.value[series.field.key] : log.value, series.field, system),
  })).filter(point => Number.isFinite(point.x.getTime()) && Number.isFinite(point.y)).sort((a, b) => a.x - b.x);
}
