import { getDateInUserTz } from './timezone.js';
import { foodEntryDay } from './dietIntake.js';

const day = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ||
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Choose a valid observation date.');
  return value;
};
export function validateObservation(value) {
  if (!value || typeof value.id !== 'string' || !value.id || value.id.length > 100 ||
      typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 ||
      typeof value.recipeId !== 'string' || value.recipeId.length > 100 ||
      typeof value.note !== 'string' || value.note.length > 2000) throw new Error('Name the observation period and choose valid details.');
  const result = { id: value.id, name: value.name.trim(), recipeId: value.recipeId,
    start: day(value.start), end: day(value.end), note: value.note,
    fastStart: value.fastStart || '', fastEnd: value.fastEnd || '' };
  if (result.end < result.start || (Date.parse(result.end) - Date.parse(result.start)) / 86400000 > 365) throw new Error('Choose an end on/after start, within one year.');
  if (result.fastEnd && !result.fastStart) throw new Error('A fasting end needs a start.');
  for (const key of ['fastStart', 'fastEnd']) {
    if (result[key] && (typeof result[key] !== 'string' || !Number.isFinite(Date.parse(result[key])) ||
        new Date(result[key]).toISOString() !== result[key])) throw new Error('Invalid fasting timestamp.');
  }
  if (result.fastEnd && result.fastEnd <= result.fastStart) throw new Error('Fasting end must follow start.');
  return result;
}
export function validateObservedFast(value, now = new Date()) {
  const result = validateObservation(value);
  if ([result.fastStart, result.fastEnd].some(time => time && new Date(time) > now)) throw new Error('Record actual fasting times, not future times.');
  return result;
}
export function observationTimeline(value, data, dateInUserTz = getDateInUserTz) {
  const observation = validateObservation(value), rows = [];
  for (let cursor = Date.parse(`${observation.start}T12:00:00Z`); cursor <= Date.parse(`${observation.end}T12:00:00Z`); cursor += 86400000) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    const foods = (data.foods || []).filter(food => foodEntryDay(food, dateInUserTz) === date);
    const symptoms = (data.gutHealth?.symptoms || []).filter(item => dateInUserTz(item.timestamp) === date);
    const readings = (data.gutHealth?.sessions || []).flatMap(session => session.readings.map(reading => ({ ...reading, challenge: session.challenge })))
      .filter(reading => dateInUserTz(reading.timestamp) === date);
    const fasting = ['fastStart', 'fastEnd'].filter(key => observation[key] && dateInUserTz(observation[key]) === date)
      .map(key => ({ kind: key, timestamp: observation[key] }));
    rows.push({ date, foods, symptoms, readings, fasting,
      servings: foods.filter(food => food.recipeSnapshot?.id === observation.recipeId && food.unit === 'serving')
        .reduce((sum, food) => sum + food.amount, 0) });
  }
  return { rows, fastingHours: observation.fastStart && observation.fastEnd
    ? (Date.parse(observation.fastEnd) - Date.parse(observation.fastStart)) / 3600000 : null };
}
