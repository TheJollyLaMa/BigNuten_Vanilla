/**
 * timezone.js
 * Utility module for user-selectable local timezone support.
 *
 * All storage and API logs continue in Zulu (UTC).
 * User-facing date/time displays are rendered in the user's chosen timezone,
 * which is persisted in localStorage under the key 'userTimezone'.
 *
 * Day cycle:
 * Users can set a custom "day start" time (e.g. 04:30 for early risers or
 * 18:00 for shift workers).  All personal stat boundaries (water, steps,
 * exercise, supplements, etc.) are calculated relative to this offset.
 * Community/leaderboard aggregations continue to use UTC midnight for fairness.
 */

const TZ_KEY = 'userTimezone';

/** localStorage key for the day-cycle start time (stored as "HH:MM", 24 h). */
const DAY_CYCLE_KEY = 'dayCycleStart';

/** Default day-cycle start — 04:30 AM. */
export const DAY_CYCLE_DEFAULT = '04:30';

/** Milliseconds in one calendar day. */
const MS_PER_DAY = 86400000;

/**
 * Returns the user's currently selected IANA timezone string.
 * Falls back to the browser/system timezone if none has been set.
 * @returns {string} IANA timezone identifier, e.g. "America/New_York"
 */
export function getUserTimezone() {
  return localStorage.getItem(TZ_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Persists the user's chosen IANA timezone to localStorage and dispatches
 * a custom 'timezonechange' event on window so other modules can react.
 * @param {string} tz - IANA timezone identifier
 */
export function setUserTimezone(tz) {
  const previous = localStorage.getItem(TZ_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  localStorage.setItem(TZ_KEY, tz);
  window.dispatchEvent(new CustomEvent('timezonechange', { detail: { timezone: tz, previousTimeZone: previous } }));
}

/**
 * Returns the user's stored day-cycle start time as an "HH:MM" string.
 * Defaults to DAY_CYCLE_DEFAULT ("04:30") if not set.
 * @returns {string} "HH:MM" in 24 h format
 */
export function getDayCycleStart() {
  return localStorage.getItem(DAY_CYCLE_KEY) || DAY_CYCLE_DEFAULT;
}

/**
 * Persists the user's chosen day-cycle start time to localStorage and
 * dispatches a custom 'daycyclechange' event so other modules can react.
 * @param {string} timeStr - "HH:MM" in 24 h format (e.g. "04:30" or "18:00")
 */
export function setDayCycleStart(timeStr) {
  localStorage.setItem(DAY_CYCLE_KEY, timeStr);
  window.dispatchEvent(new CustomEvent('daycyclechange', { detail: { dayCycleStart: timeStr } }));
}

/**
 * Converts any ISO/Date-parseable timestamp to the YYYY-MM-DD "day date"
 * string that the timestamp belongs to, accounting for both the user's
 * timezone and their custom day-cycle start time.
 *
 * Example: with a 04:30 day start, a log entry at 03:15 on 2025-06-15
 * (in the user's timezone) belongs to the 2025-06-14 cycle.
 *
 * @param {string|Date} isoOrDate
 * @returns {string|null} YYYY-MM-DD or null if the input is invalid
 */
export function getDateInUserTz(isoOrDate) {
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return null;

  const tz = getUserTimezone();
  const [cycleHour, cycleMinute] = getDayCycleStart().split(':').map(Number);

  const fmt = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: tz,
  });
  const p = {};
  fmt.formatToParts(d).forEach(({ type, value }) => { p[type] = value; });

  const entryHour   = parseInt(p.hour,   10);
  const entryMinute = parseInt(p.minute, 10);
  const beforeCycle = entryHour < cycleHour ||
    (entryHour === cycleHour && entryMinute < cycleMinute);

  if (beforeCycle) {
    // Belongs to the previous calendar day
    const prev = new Date(d.getTime() - MS_PER_DAY);
    const pp = {};
    new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: tz,
    }).formatToParts(prev).forEach(({ type, value }) => { pp[type] = value; });
    return `${pp.year}-${pp.month}-${pp.day}`;
  }

  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Formats a UTC ISO timestamp (or any Date-parseable string) for display
 * in the user's selected timezone.
 * @param {string|Date} isoOrDate - UTC timestamp
 * @param {Intl.DateTimeFormatOptions} [options] - Optional Intl.DateTimeFormat options
 * @returns {string} Localised date/time string
 */
export function formatInUserTz(isoOrDate, options = {}) {
  const tz = getUserTimezone();
  const defaults = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  };
  return new Date(isoOrDate).toLocaleString(undefined, { ...defaults, ...options, timeZone: tz });
}

/**
 * Returns today's date string (YYYY-MM-DD) in the user's selected timezone,
 * adjusted for their custom day-cycle start time.
 *
 * If the current wall-clock time (in the user's timezone) is before the
 * day-cycle start, the returned date is "yesterday" — because the new day
 * hasn't officially started yet for this user.
 *
 * Use this instead of `new Date().toISOString().split('T')[0]` wherever the
 * intent is "what day is it for the user right now?".
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getTodayInUserTz() {
  const tz = getUserTimezone();
  const [cycleHour, cycleMinute] = getDayCycleStart().split(':').map(Number);
  const now = new Date();

  // Get current date AND time parts in the user's timezone
  const fmt = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: tz,
  });
  const p = {};
  fmt.formatToParts(now).forEach(({ type, value }) => { p[type] = value; });

  const currentHour   = parseInt(p.hour,   10);
  const currentMinute = parseInt(p.minute, 10);
  const beforeCycle   = currentHour < cycleHour ||
    (currentHour === cycleHour && currentMinute < cycleMinute);

  if (beforeCycle) {
    // Roll back one calendar day — the new day cycle hasn't started yet
    const yesterday = new Date(now.getTime() - MS_PER_DAY);
    const yp = {};
    new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: tz,
    }).formatToParts(yesterday).forEach(({ type, value }) => { yp[type] = value; });
    return `${yp.year}-${yp.month}-${yp.day}`;
  }

  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Returns a compact time string for the live clock widget (e.g. "14:35 EST").
 * @returns {string}
 */
export function getCurrentTimeInUserTz() {
  const tz = getUserTimezone();
  return new Date().toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: tz,
    timeZoneName: 'short'
  });
}

/**
 * Returns a curated list of IANA timezone identifiers grouped by region.
 * Covers all major populated timezones without depending on any external library.
 * @returns {Array<{group: string, zones: string[]}>}
 */
export function getGroupedTimezones() {
  return [
    {
      group: 'UTC',
      zones: ['UTC']
    },
    {
      group: 'Africa',
      zones: [
        'Africa/Abidjan', 'Africa/Cairo', 'Africa/Casablanca', 'Africa/Johannesburg',
        'Africa/Lagos', 'Africa/Nairobi'
      ]
    },
    {
      group: 'Americas',
      zones: [
        'America/Anchorage', 'America/Bogota', 'America/Buenos_Aires',
        'America/Chicago', 'America/Denver', 'America/Halifax',
        'America/Los_Angeles', 'America/Mexico_City', 'America/New_York',
        'America/Phoenix', 'America/Santiago', 'America/Sao_Paulo',
        'America/St_Johns', 'America/Toronto', 'America/Vancouver',
        'Pacific/Honolulu'
      ]
    },
    {
      group: 'Asia',
      zones: [
        'Asia/Bangkok', 'Asia/Colombo', 'Asia/Dhaka', 'Asia/Dubai',
        'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem',
        'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kuala_Lumpur',
        'Asia/Manila', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai',
        'Asia/Singapore', 'Asia/Taipei', 'Asia/Tehran', 'Asia/Tokyo'
      ]
    },
    {
      group: 'Atlantic',
      zones: [
        'Atlantic/Azores', 'Atlantic/Cape_Verde'
      ]
    },
    {
      group: 'Australia & Pacific',
      zones: [
        'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Darwin',
        'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
        'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Guam'
      ]
    },
    {
      group: 'Europe',
      zones: [
        'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin', 'Europe/Brussels',
        'Europe/Bucharest', 'Europe/Dublin', 'Europe/Helsinki',
        'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London',
        'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris',
        'Europe/Prague', 'Europe/Rome', 'Europe/Stockholm',
        'Europe/Warsaw', 'Europe/Zurich'
      ]
    }
  ];
}
