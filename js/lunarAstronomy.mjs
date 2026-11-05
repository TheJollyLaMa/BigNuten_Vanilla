import * as Astronomy from './vendor/astronomy-engine.mjs';

export { Astronomy };
const DAY = 86400000;
export const SUPPORTED_RANGE = '2024–2030';
const NAMES = [
  'Pratipada', 'Dvitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadasi', 'Dvadashi', 'Trayodashi', 'Chaturdashi', 'Purnima',
];

export function checkedDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 2024 || date.getUTCFullYear() > 2030) {
    throw new RangeError(`Astronomy dates must be within ${SUPPORTED_RANGE}.`);
  }
  return date;
}

export function observerFor(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new RangeError('Enter latitude from -90 to 90 and longitude from -180 to 180.');
  }
  return new Astronomy.Observer(latitude, longitude, 0);
}

export function localDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = name => parts.find(p => p.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function lunarState(value) {
  const date = checkedDate(value);
  const phase = Astronomy.MoonPhase(date);
  const tithi = Math.floor(phase / 12) + 1;
  const start = Astronomy.SearchMoonPhase((tithi - 1) * 12, new Date(date.getTime() - 3 * DAY), 4);
  const end = Astronomy.SearchMoonPhase((tithi * 12) % 360, date, 3);
  const newMoon = Astronomy.SearchMoonPhase(0, date, -32);
  if (!start || !end || !newMoon) throw new Error('Lunar boundary search unavailable.');
  return {
    date, phase, tithi,
    name: `${tithi <= 15 ? 'Shukla' : 'Krishna'} ${tithi === 30 ? 'Amavasya' : NAMES[(tithi - 1) % 15]}`,
    start: start.date, end: end.date, newMoon: newMoon.date,
    ageDays: (date - newMoon.date) / DAY,
    illumination: Astronomy.Illumination(Astronomy.Body.Moon, date).phase_fraction,
  };
}

export function riseEvents(body, observer, start, end) {
  const events = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const remaining = (end - cursor) / DAY;
    const event = Astronomy.SearchRiseSet(body, observer, 1, cursor, remaining);
    if (!event || event.date >= end) break;
    events.push(event.date);
    cursor = new Date(event.date.getTime() + 1000);
    if (events.length > 40) throw new Error('Unexpected rise-event count.');
  }
  return events;
}

export function selectJollyObservance(rises, sunrises, targetDay) {
  const moonrise = rises[targetDay - 1];
  if (!moonrise) return { targetDay, moonrise: null, sunrise: null, reason: `No ${targetDay}th moonrise in this lunation.` };
  const sunrise = sunrises.find(value => value >= moonrise) || null;
  return {
    targetDay, moonrise, sunrise,
    reason: sunrise ? '' : 'No sunrise within the supported search window.',
  };
}

export function localLunation(newMoon, observer) {
  const next = Astronomy.SearchMoonPhase(0, new Date(newMoon.getTime() + DAY), 32);
  if (!next) throw new Error('Next new moon unavailable.');
  const rises = riseEvents(Astronomy.Body.Moon, observer, newMoon, next.date);
  const sunrises = riseEvents(Astronomy.Body.Sun, observer, newMoon, new Date(next.date.getTime() + 3 * DAY));
  const observances = [11, 25].map(day => selectJollyObservance(rises, sunrises, day));
  return { newMoon, nextNewMoon: next.date, rises, sunrises, observances };
}

export function localCalendar(value, latitude, longitude, timeZone) {
  const state = lunarState(value);
  const observer = observerFor(latitude, longitude);
  localDate(state.date, timeZone);
  const cycle = localLunation(state.newMoon, observer);
  const nextCycle = localLunation(cycle.nextNewMoon, observer);
  const today = localDate(state.date, timeZone);
  const day = cycle.rises.filter(rise => rise <= state.date).length;
  const all = [...cycle.observances, ...nextCycle.observances];
  const upcoming = all.find(event => event.sunrise && localDate(event.sunrise, timeZone) >= today) || null;
  const sunrise = cycle.sunrises.find(rise => localDate(rise, timeZone) === today) || null;
  const sunset = upcoming?.sunrise
    ? Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, upcoming.sunrise, -2)?.date || null
    : null;
  return {
    ...state, ...cycle, day, sunrise, upcoming, sunset, today, timeZone,
    moonrise: cycle.rises.find(rise => localDate(rise, timeZone) === today) || null,
    isObservance: Boolean(upcoming?.sunrise && localDate(upcoming.sunrise, timeZone) === today),
  };
}

export function heliocentric(body, date) {
  const vector = Astronomy.RotateVector(Astronomy.Rotation_EQJ_ECL(), Astronomy.HelioVector(body, checkedDate(date)));
  return { x: vector.x, y: vector.y, z: vector.z, radius: vector.Length() };
}

export function lunarVector(date) {
  return Astronomy.RotateVector(Astronomy.Rotation_EQJ_ECL(), Astronomy.GeoMoon(checkedDate(date)));
}
