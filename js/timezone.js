/**
 * timezone.js
 * Utility module for user-selectable local timezone support.
 *
 * All storage and API logs continue in Zulu (UTC).
 * User-facing date/time displays are rendered in the user's chosen timezone,
 * which is persisted in localStorage under the key 'userTimezone'.
 */

const TZ_KEY = 'userTimezone';

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
  localStorage.setItem(TZ_KEY, tz);
  window.dispatchEvent(new CustomEvent('timezonechange', { detail: { timezone: tz } }));
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
 * Returns today's date string (YYYY-MM-DD) in the user's selected timezone.
 * Use this instead of `new Date().toISOString().split('T')[0]` wherever the
 * intent is "what day is it for the user right now?".
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getTodayInUserTz() {
  const tz = getUserTimezone();
  const now = new Date();
  // Build a date string like "6/15/2025" in the target timezone then parse it
  const parts = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz
  }).formatToParts(now);

  const p = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
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
