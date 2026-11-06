import { Astronomy, checkedDate, localDate, lunarState } from './lunarAstronomy.mjs';

export const STORIES = [
  ['Kamada', 'kamada'], ['Varuthini', 'varuthini'], ['Mohini', 'mohini'], ['Apara', 'apara'],
  ['Pandava Nirjala', 'pandava-nirjala'], ['Yogini', 'yogini'], ['Sayana', 'sayana'], ['Kamika', 'kamika'],
  ['Pavitropana', 'pavitropana'], ['Aja', 'aja-annada'], ['Parsva', 'parsva'], ['Indira', 'indira'],
  ['Papankusha', 'papankusha'], ['Rama', 'rama'], ['Utthana', 'utthana'], ['Utpanna', 'utpanna'],
  ['Mokshada', 'mokshada'], ['Saphala', 'saphala'], ['Putrada', 'putrada'], ['Sat-Tila', 'sattila'],
  ['Bhaimi', 'bhaimi'], ['Vijaya', 'vijaya'], ['Amalaki', 'amalaki'], ['Papamochani', 'papamochani'],
];
export const STORY_ANCHOR_KEY = 'bignuten:ekadasi-story-anchor:v1';
export const DEFAULT_STORY_ANCHOR = { date: '2026-11-04', targetDay: 25, slug: 'rama' };
const DAY = 86400000;
const cycleCache = new Map();

export function validateStoryAnchor(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      ![11, 25].includes(value.targetDay) || !STORIES.some(([, slug]) => slug === value.slug)) {
    throw new Error('Choose a story, valid reference date and lunar day 11 or 25.');
  }
  const date = checkedDate(`${value.date}T12:00:00Z`);
  if (date.toISOString().slice(0, 10) !== value.date) throw new Error('Invalid story reference date.');
  return { date: value.date, targetDay: value.targetDay, slug: value.slug };
}

export function storyForObservance(event, anchor = DEFAULT_STORY_ANCHOR) {
  anchor = validateStoryAnchor(anchor);
  const start = lunarState(`${anchor.date}T12:00:00Z`).newMoon;
  const end = event.newMoon;
  if (!(end instanceof Date) || !Number.isFinite(end.getTime())) throw new Error('Story needs an astronomical lunation.');
  const key = `${start.toISOString()}/${end.toISOString()}`;
  let cycles = cycleCache.get(key);
  if (cycles === undefined) {
    const direction = end > start ? 1 : -1;
    let cursor = start;
    cycles = 0;
    while (Math.abs(end - cursor) > DAY) {
      const next = Astronomy.SearchMoonPhase(0, new Date(cursor.getTime() + direction * DAY), direction * 32);
      if (!next || Math.abs(cycles) >= 90) throw new Error('Story sequence is outside the supported lunar range.');
      cursor = next.date;
      cycles += direction;
    }
    cycleCache.set(key, cycles);
  }
  if (![11, 25].includes(event.targetDay)) throw new Error('Unsupported observance day.');
  const anchorIndex = STORIES.findIndex(([, slug]) => slug === anchor.slug);
  const offset = cycles * 2 + (event.targetDay === 25 ? 1 : 0) - (anchor.targetDay === 25 ? 1 : 0);
  return STORIES[((anchorIndex + offset) % STORIES.length + STORIES.length) % STORIES.length];
}

export function storyWindow(now, observance, timeZone) {
  const day = value => Date.parse(`${localDate(value, timeZone)}T00:00:00Z`);
  return Math.abs(day(now) - day(observance)) <= 2 * DAY;
}

export function neighboringObservances(events, now, timeZone) {
  const today = localDate(now, timeZone);
  const available = events.filter(event => event.sunrise).sort((a, b) => a.sunrise - b.sunrise);
  return {
    last: available.filter(event => localDate(event.sunrise, timeZone) < today).at(-1) || null,
    next: available.find(event => localDate(event.sunrise, timeZone) >= today) || null,
  };
}
