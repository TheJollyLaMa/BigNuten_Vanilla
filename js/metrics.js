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
  {
    id: 'temperature',
    label: 'Body temperature',
    canonicalUnit: 'K',
    displayUnits: { imperial: displayUnit('°F', 5 / 9, 273.15 - 32 * 5 / 9), metric: displayUnit('°C', 1, 273.15) },
    range: [298.15, 318.15], // 25–45 °C: input guardrails, not a healthy range.
    // Adult resting reference: https://medlineplus.gov/ency/article/002341.htm
    referenceRange: [309.65, 310.45],
    input: { type: 'number', step: 'any' },
    chartType: 'line',
    // Care guidance: https://medlineplus.gov/ency/article/003090.htm and /000038.htm
    safetyNotice: 'Not medical advice. Adult resting reference only; temperature varies with measurement site, time and activity. Note the thermometer/site used. Seek urgent help for a temperature below 35°C (95°F), confusion or difficulty breathing. Contact a clinician for a persistent or rising fever, especially above 39.4°C (103°F). Children, pregnancy and immune suppression need individual advice; do not rely on this chart for triage.',
    multiplePerDay: true,
  },
  {
    id: 'bp',
    label: 'Blood pressure',
    canonicalUnit: 'Pa',
    fields: {
      systolic: {
        label: 'Systolic', range: [40 * 133.322, 300 * 133.322],
        // Adult resting reference: https://medlineplus.gov/ency/article/002341.htm
        referenceRange: [90 * 133.322, 120 * 133.322],
        input: { type: 'number', step: 'any' },
        displayUnits: { imperial: displayUnit('mmHg', 133.322), metric: displayUnit('mmHg', 133.322) },
      },
      diastolic: {
        label: 'Diastolic', range: [20 * 133.322, 200 * 133.322],
        referenceRange: [60 * 133.322, 80 * 133.322],
        input: { type: 'number', step: 'any' },
        displayUnits: { imperial: displayUnit('mmHg', 133.322), metric: displayUnit('mmHg', 133.322) },
      },
    },
    greaterThan: { systolic: 'diastolic' },
    chartType: 'line',
    // AHA crisis guidance (either pressure): https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/hypertensive-crisis-when-you-should-call-911-for-high-blood-pressure
    safetyNotice: 'Not medical advice. Use a correctly sized cuff after resting; record both numbers from the same reading. Adult reference bands are not diagnostic cutoffs or treatment targets. If systolic is above 180 OR diastolic above 120 mmHg, repeat after at least one minute: if still high, contact a clinician immediately; with chest pain, breathlessness, weakness or vision changes, call emergency services without waiting. Seek urgent help for fainting or other severe symptoms even with lower readings. Discuss persistent unusual readings with your clinician.',
    multiplePerDay: true,
  },
  {
    id: 'spo2',
    label: 'Blood oxygen (SpO2)',
    canonicalUnit: '%',
    displayUnits: { imperial: displayUnit('%'), metric: displayUnit('%') },
    range: [50, 100],
    // Reference and care thresholds: https://medlineplus.gov/lab-tests/pulse-oximetry/
    referenceRange: [95, 100],
    input: { type: 'number', step: 'any' },
    chartType: 'line',
    safetyNotice: 'Not medical advice. Oximeters can be inaccurate: skin pigmentation, poor circulation, cold fingers and nail polish can affect readings. Altitude and lung conditions may change your personal target; follow your care plan. Contact a clinician for readings of 92% or lower; seek immediate medical attention at 88% or lower, or for severe breathlessness, blue lips or chest pain regardless of the number. Do not delay care to recheck a device.',
    multiplePerDay: true,
  },
  {
    id: 'rr',
    label: 'Resting respiratory rate',
    canonicalUnit: 'breaths/min',
    displayUnits: { imperial: displayUnit('breaths/min'), metric: displayUnit('breaths/min') },
    range: [2, 80],
    // Adult resting reference: https://medlineplus.gov/ency/article/002341.htm
    referenceRange: [12, 18],
    input: { type: 'number', step: 'any' },
    chartType: 'line',
    safetyNotice: 'Not medical advice. Count breaths for a full minute while quietly resting, not immediately after exercise. The shaded reference is for adults at rest, not children. Discuss persistent changes with a clinician. Seek emergency help for severe difficulty breathing, blue lips, confusion or fainting regardless of the rate.',
    multiplePerDay: true,
  },
  {
    id: 'hrv',
    label: 'Heart rate variability (RMSSD)',
    canonicalUnit: 'ms',
    displayUnits: { imperial: displayUnit('ms'), metric: displayUnit('ms') },
    range: [0, 500],
    input: { type: 'number', step: 'any' },
    chartType: 'line',
    // Method definition and comparability: https://pmc.ncbi.nlm.nih.gov/articles/PMC5624990/
    safetyNotice: 'Not medical advice. Enter RMSSD in milliseconds (root mean square of successive normal beat-interval differences), not SDNN or a device readiness score. Values vary by device, recording length, posture and artifacts; note the device and method and compare like-for-like measurements. There is no universal healthy HRV cutoff here, and higher is not always better. Discuss sustained unexplained changes with a clinician; seek urgent care for chest pain, fainting or severe breathlessness regardless of HRV.',
    multiplePerDay: true,
  },
  {
    id: 'vo2max',
    label: 'VO2 max',
    canonicalUnit: 'mL/kg/min',
    displayUnits: { imperial: displayUnit('mL/kg/min'), metric: displayUnit('mL/kg/min') },
    range: [1, 120],
    input: { type: 'number', step: 'any' },
    entrySources: ['self-reported', 'estimated'],
    chartType: 'line',
    // No automatic estimate: existing sessionLog/exercise sets lack measured cycling
    // power, protocol stages, or timed distance/heart-rate data for a validated test.
    safetyNotice: 'Not medical advice. Manually record a lab result as self-reported, or a device/test estimate as estimated; note its source and protocol. Estimates differ by device and test and are not interchangeable with measured oxygen uptake. No automatic estimate is calculated from workout durations or lifting sets. There is no universal target here. Do not attempt a maximal test without appropriate professional guidance. Discuss unexplained declines with a clinician; stop exercise and seek urgent care for chest pain, fainting or severe breathlessness.',
    multiplePerDay: true,
  },
  {
    id: 'bodyFat', label: 'Body fat', canonicalUnit: '%',
    displayUnits: { imperial: displayUnit('%'), metric: displayUnit('%') },
    range: [1, 75], input: { type: 'number', step: 'any' }, chartType: 'line',
    entrySources: ['self-reported', 'imported'],
    safetyNotice: 'Not medical advice. Optional manual reading, not a diagnosis. Methods and devices vary; compare readings from the same method. No calculated estimate is provided. No universal reference band: interpretation varies with age, sex and measurement method.',
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
  for (const [higher, lower] of Object.entries(metric.greaterThan || {})) {
    if (value[higher] <= value[lower]) {
      throw new Error(`${metric.fields[higher].label} must be greater than ${metric.fields[lower].label.toLowerCase()}.`);
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
