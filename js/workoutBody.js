import { validateMetricLog } from './metrics.js';

export function workoutDurationSeconds(session) {
  const start = Date.parse(session.start), end = Date.parse(session.end);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return (end - start) / 1000;
  return session.durationSeconds ?? null;
}

export function formatWorkoutDuration(session) {
  const seconds = workoutDurationSeconds(session);
  return seconds === null ? 'duration not recorded' : `${Number((seconds / 60).toFixed(2))} min`;
}

export function normalizeWorkoutSession(session) {
  const result = { ...session };
  if (session.rpe !== undefined && (!Number.isInteger(session.rpe) || session.rpe < 1 || session.rpe > 10)) throw new Error('RPE must be an integer from 1 to 10.');
  if (session.durationSeconds !== undefined && (typeof session.durationSeconds !== 'number' || !Number.isFinite(session.durationSeconds) || session.durationSeconds < 0)) throw new Error('Duration must be a non-negative number of seconds.');
  if (session.recovery !== undefined) {
    const recovery = session.recovery;
    if (!recovery || typeof recovery !== 'object' || Array.isArray(recovery) || typeof recovery.soreness !== 'boolean' || typeof recovery.tightness !== 'boolean' || typeof recovery.note !== 'string') throw new Error('Invalid workout recovery notes.');
  }
  if (session.workoutTypes !== undefined && (!Array.isArray(session.workoutTypes) || session.workoutTypes.some(type => typeof type !== 'string'))) throw new Error('Invalid workout types.');
  const duration = workoutDurationSeconds(session);
  if (duration !== null) result.durationSeconds = duration;
  return result;
}

export function normalizeMeasurement(entry) {
  if (entry.unit !== undefined && !['cm', 'in'].includes(entry.unit)) throw new Error('Invalid measurement unit.');
  if (entry.unit !== undefined) {
    if (typeof entry.type !== 'string' || !entry.type.trim()) throw new Error('Invalid measurement type.');
    const date = new Date(`${entry.date}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(entry.time)) throw new Error('Invalid measurement date or time.');
  }
  if (entry.unit !== undefined && (typeof entry.measurement !== 'number' || !Number.isFinite(entry.measurement) || entry.measurement <= 0)) throw new Error('Measurement must be positive.');
  if (entry.progressPhotoTaken !== undefined && typeof entry.progressPhotoTaken !== 'boolean') throw new Error('Invalid progress photo flag.');
  if (entry.progressPhotoNote !== undefined && typeof entry.progressPhotoNote !== 'string') throw new Error('Invalid progress photo note.');
  if (entry.bodyFatMetricId !== undefined && (typeof entry.bodyFatMetricId !== 'string' || !entry.bodyFatMetricId.trim())) throw new Error('Invalid body fat reading reference.');
  return { ...entry };
}

export function measurementDisplay(entry, system = 'imperial') {
  if (!entry.unit) return { value: Number(entry.measurement), unit: 'legacy units (not specified)' };
  const cm = entry.measurement * (entry.unit === 'in' ? 2.54 : 1);
  return { value: system === 'metric' ? cm : cm / 2.54, unit: system === 'metric' ? 'cm' : 'in' };
}

export function measurementDayNumber(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? parsed.getTime() / 86400000 : NaN;
}
export function shouldPromptMeasurements(measurements, today, dismissedOn = '') {
  const current = measurementDayNumber(today);
  if (!Number.isFinite(current)) return false;
  const dates = measurements.map(entry => measurementDayNumber(entry.date)).filter(date => Number.isFinite(date) && date <= current);
  const dismissed = measurementDayNumber(dismissedOn);
  const last = Math.max(...dates, Number.isFinite(dismissed) ? dismissed : -Infinity);
  return current - last >= 30;
}

export function createMeasurement({ type, value, date, time, system, photoTaken, photoNote, bodyFat, source }) {
  if (!type || type === 'add-new' || !Number.isFinite(value) || value <= 0) throw new Error('Enter a measurement type and a positive value.');
  const id = crypto.randomUUID();
  const entry = normalizeMeasurement({ id, type, measurement: value * (system === 'metric' ? 1 : 2.54), unit: 'cm', date, time, progressPhotoTaken: photoTaken, progressPhotoNote: photoNote.trim() });
  if (bodyFat !== null && bodyFat !== undefined) {
    const log = { id: crypto.randomUUID(), metric: 'bodyFat', value: bodyFat, unit: '%', date, time, note: '', source: source || 'self-reported' };
    validateMetricLog(log);
    entry.bodyFatMetricId = log.id;
    return { entry, metricLog: log };
  }
  return { entry, metricLog: null };
}
