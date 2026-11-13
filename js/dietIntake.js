import { sleepBedtimeDate } from './metrics.js';
import { getDateInUserTz, getTimeInUserTz, getUserTimezone } from './timezone.js';
import { validateNutritionSource } from './nutritionDefaults.mjs';
import { validateMealRecipe } from './mealRecipes.mjs';

/** Shared by the full Diet logger and raw-food quick log; callers use the app's recovery-aware store. */
export function persistDietIntake({ name, amount, unit, nutr, time, nutritionSource, recipeSnapshot }, load, save, now = new Date()) {
  name = String(name || '').trim();
  unit = String(unit || '').trim();
  amount = Number(amount);
  if (!name || !unit || !Number.isFinite(amount) || amount <= 0) return null;
  if (nutr && Object.values(nutr).some(value => !Number.isFinite(value) || value < 0)) return null;
  const intake = {
    type: 'diet', name, amount, unit, nutr, date: now.toISOString(),
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || '')) ? time : getTimeInUserTz(now),
  };
  if (nutritionSource) intake.nutritionSource = validateNutritionSource(nutritionSource);
  if (recipeSnapshot) intake.recipeSnapshot = validateMealRecipe(recipeSnapshot);
  const data = load();
  data.foods ||= [];
  data.foods.push(intake);
  save(data);
  return intake;
}

export function changeDietEntry(entries, index, original, replacement) {
  if (!Number.isInteger(index) || !entries?.[index] || JSON.stringify(entries[index]) !== original) {
    throw new Error('This meal changed since it was opened. Reopen it before editing or removing.');
  }
  const next = entries.slice();
  if (replacement) next[index] = { ...entries[index], ...replacement, date: entries[index].date };
  else next.splice(index, 1);
  return next;
}

export function foodEntryDay(entry, dateInUserTz = getDateInUserTz) {
  const date = entry?.date || entry?.timestamp;
  if (typeof date !== 'string' || !date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return dateInUserTz(date);
}

export function foodsInNutritionPeriod(entries, today, days, dateInUserTz = getDateInUserTz) {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const firstDay = start.toISOString().slice(0, 10);
  return (Array.isArray(entries) ? entries : []).filter(entry => {
    const day = foodEntryDay(entry, dateInUserTz);
    return day && day >= firstDay && day <= today;
  });
}

export function summarizeCalories(entries, day, dateInUserTz = getDateInUserTz) {
  const todayEntries = (Array.isArray(entries) ? entries : []).filter(entry => foodEntryDay(entry, dateInUserTz) === day);
  let calories = 0;
  let entriesWithCalories = 0;
  for (const entry of todayEntries) {
    const raw = entry?.nutr?.calories;
    if ((typeof raw !== 'number' && typeof raw !== 'string') || String(raw).trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) continue;
    calories += Number(raw);
    entriesWithCalories++;
  }
  return { calories, entriesWithCalories, totalEntries: todayEntries.length };
}

export function summarizeCaloriesByDay(entries, dateInUserTz = getDateInUserTz) {
  const days = [...new Set((Array.isArray(entries) ? entries : []).map(entry => foodEntryDay(entry, dateInUserTz)).filter(Boolean))];
  return days.map(day => ({ day, ...summarizeCalories(entries, day, dateInUserTz) })).sort((a, b) => b.day.localeCompare(a.day));
}

function clockMinutes(value, timeZone = getUserTimezone()) {
  if (typeof value !== 'string' || !value) return null;
  if (/^\d{2}:\d{2}$/.test(value)) {
    const hour = Number(value.slice(0, 2));
    const minute = Number(value.slice(3, 5));
    return hour < 24 && minute < 60 ? hour * 60 + minute : null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function eventDate(entry, candidates, dateInUserTz) {
  for (const value of candidates) {
    if (typeof value !== 'string' || !value) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const day = dateInUserTz(value);
    if (day) return day;
  }
  return foodEntryDay(entry, dateInUserTz);
}

function formatGap(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

/** Build a factual same-day timeline and intervals only when both times are recorded. */
export function buildMealTimingInsights({ foods = [], workouts = [], sleepEntries = [], day, dateInUserTz = getDateInUserTz, timeZone = getUserTimezone() }) {
  const events = [];
  const meals = [];
  for (const food of foods) {
    if (foodEntryDay(food, dateInUserTz) !== day) continue;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(food.time || '') ? food.time : null;
    const minutes = time ? clockMinutes(time, timeZone) : null;
    events.push({ kind: 'meal', label: food.name || 'Food entry', time: time || 'time not recorded', minutes });
    if (minutes !== null) meals.push({ label: food.name || 'Food entry', minutes });
  }

  const workoutGaps = [];
  for (const workout of workouts) {
    const start = workout?.start || workout?.startedAt || workout?.timestamp;
    const workoutDay = eventDate(workout, [start, workout?.date], dateInUserTz);
    const minutes = clockMinutes(start, timeZone);
    if (workoutDay !== day || minutes === null) continue;
    const label = workout.name || workout.type || 'Workout';
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(start));
    events.push({ kind: 'workout', label, time, minutes });
    const lastMeal = meals.filter(meal => meal.minutes < minutes).sort((a, b) => b.minutes - a.minutes)[0];
    if (lastMeal) workoutGaps.push({ label, gap: formatGap(minutes - lastMeal.minutes) });
  }

  const sleepGaps = [];
  for (const sleep of sleepEntries) {
    const start = sleep?.sleepStart || sleep?.bedtime || sleep?.start || sleep?.startedAt;
    if (typeof start !== 'string' || !start) continue;
    const sleepDay = sleep?.metric === 'sleep' && start === sleep.bedtime
      ? sleepBedtimeDate(sleep) : eventDate(sleep, [start, sleep?.date], dateInUserTz);
    const minutes = clockMinutes(start, timeZone);
    if (sleepDay !== day || minutes === null) continue;
    const time = start.includes('T')
      ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(start))
      : start;
    events.push({ kind: 'sleep', label: 'Sleep', time, minutes });
    const lastMeal = meals.filter(meal => meal.minutes < minutes).sort((a, b) => b.minutes - a.minutes)[0];
    if (lastMeal) sleepGaps.push(formatGap(minutes - lastMeal.minutes));
  }

  events.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity));
  return { events, workoutGaps, sleepGaps };
}
