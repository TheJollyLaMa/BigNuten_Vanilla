const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
let api, reference;
before(async () => {
  api = await import('../js/lunarAstronomy.mjs');
  reference = JSON.parse(readFileSync(new URL('./fixtures/astronomy-references.json', `file://${__filename}`), 'utf8'));
});
const publicLocation = [43.0481, -76.1474, 'America/New_York'];
const delta = (a, b) => ((a - b + 540) % 360) - 180;
const longitude = vector => Math.atan2(vector[1], vector[0]) * 180 / Math.PI;
const rate = vector => (vector[0] * vector[4] - vector[1] * vector[3]) /
  (vector[0] ** 2 + vector[1] ** 2) * 180 / Math.PI;

test('all sampled primary phases agree with independent USNO minute-rounded times within two minutes', t => {
  const angles = { 'New Moon': 0, 'First Quarter': 90, 'Full Moon': 180, 'Last Quarter': 270 };
  let max = 0;
  for (const item of reference.phases) {
    const expected = new Date(`${item.year}-${String(item.month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}T${item.time}:00Z`);
    const found = api.Astronomy.SearchMoonPhase(angles[item.phase], new Date(expected.getTime() - 86400000), 2);
    const error = Math.abs(found.date - expected) / 1000;
    max = Math.max(max, error);
    assert.ok(error <= 120, `${item.phase} ${expected.toISOString()}: ${error}s`);
  }
  t.diagnostic(`${reference.phases.length} phase fixtures; maximum error ${max.toFixed(2)} seconds (reference rounded to minute).`);
});

test('sampled tithi boundaries agree with independent JPL Sun/Moon vectors within two minutes', t => {
  let max = 0;
  for (const item of reference.boundaries) {
    const angle = longitude(item.moon) - longitude(item.sun);
    const degreesPerDay = rate(item.moon) - rate(item.sun);
    const errorSeconds = Math.abs(delta(angle, item.angle) / degreesPerDay * 86400);
    max = Math.max(max, errorSeconds);
    assert.ok(errorSeconds <= 120, `${item.date}: ${errorSeconds}s`);
  }
  t.diagnostic(`${reference.boundaries.length} independent tithi residuals; maximum equivalent error ${max.toFixed(2)} seconds.`);
});

test('quarterly planetary positions agree with JPL in matching ecliptic J2000 frame within 0.1 degree', t => {
  let max = 0;
  for (const [body, samples] of Object.entries(reference.planets)) {
    for (const sample of samples) {
      const actual = api.heliocentric(body, new Date(sample.date));
      const expected = sample.vector;
      const dot = actual.x * expected[0] + actual.y * expected[1] + actual.z * expected[2];
      const cosine = Math.max(-1, Math.min(1, dot / actual.radius / Math.hypot(...expected.slice(0, 3))));
      const error = Math.acos(cosine) * 180 / Math.PI;
      max = Math.max(max, error);
      assert.ok(error <= 0.1, `${body} ${sample.date}: ${error}°`);
    }
  }
  t.diagnostic(`Maximum sampled planetary angular error ${max.toFixed(6)} degrees.`);
});

test('reported dates keep tithi, elapsed age and local moonrise count separate', () => {
  for (const [day, expectedTithi, expectedCount] of [[3, 25, 23], [4, 26, 24], [5, 27, 25]]) {
    const state = api.localCalendar(new Date(`2026-11-0${day}T10:46:00Z`), ...publicLocation);
    assert.equal(state.tithi, expectedTithi);
    assert.equal(state.day, expectedCount);
    assert.equal(api.localDate(state.upcoming.sunrise, publicLocation[2]), '2026-11-05');
    assert.equal(state.isObservance, day === 5);
  }
});

test('actual local sunrise and moonrise agree with public USNO event times within two minutes', () => {
  const state = api.localCalendar(new Date('2026-11-04T10:46:00Z'), ...publicLocation);
  const data = reference.riseReference.data;
  const sunrise = data.sundata.find(item => item.phen === 'Rise').time;
  const moonrise = data.moondata.find(item => item.phen === 'Rise').time;
  for (const [actual, localTime] of [[state.sunrise, sunrise], [state.moonrise, moonrise]]) {
    const expected = new Date(`2026-11-04T${localTime}:00-05:00`);
    assert.ok(Math.abs(actual - expected) <= 120000);
  }
});

test('Jolly selection compares target moonrise with sunrise, including equality, not fixed 6am', () => {
  const sunrise = new Date('2026-11-04T11:43:00Z');
  const next = new Date('2026-11-05T11:44:00Z');
  for (const [offset, expected] of [[-1, sunrise], [0, sunrise], [1, next]]) {
    const rises = [new Date(sunrise.getTime() + offset)];
    assert.equal(api.selectJollyObservance(rises, [sunrise, next], 1).sunrise, expected);
  }
  assert.match(api.selectJollyObservance([], [sunrise], 25).reason, /No 25th moonrise/);
  assert.match(api.selectJollyObservance([sunrise], [], 1).reason, /No sunrise/);
});

test('tithi transitions change at the numerical boundary, not at civil midnight or moonrise', () => {
  const state = api.lunarState(new Date('2026-11-04T12:00:00Z'));
  const before = api.lunarState(new Date(state.end.getTime() - 10000));
  const after = api.lunarState(new Date(state.end.getTime() + 10000));
  assert.equal(after.tithi, before.tithi % 30 + 1);
  assert.notEqual(before.ageDays % 1, 0);
});

test('location timezone dates handle DST and date line independently from device timezone', () => {
  assert.equal(api.localDate(new Date('2026-11-01T05:30:00Z'), 'America/New_York'), '2026-11-01');
  assert.equal(api.localDate(new Date('2026-11-01T06:30:00Z'), 'America/New_York'), '2026-11-01');
  const instant = new Date('2026-11-04T12:00:00Z');
  assert.equal(api.localDate(instant, 'Pacific/Kiritimati'), '2026-11-05');
  assert.equal(api.localDate(instant, 'Pacific/Honolulu'), '2026-11-04');
});

test('polar missing events and invalid inputs do not become guessed times or dates', () => {
  const observer = api.observerFor(90, 0);
  assert.deepEqual(api.riseEvents(api.Astronomy.Body.Sun, observer, new Date('2026-12-01Z'), new Date('2026-12-05Z')), []);
  assert.throws(() => api.observerFor(NaN, 0), /latitude/);
  assert.throws(() => api.observerFor(0, 181), /longitude/);
  assert.throws(() => api.checkedDate('invalid'), /2024/);
  assert.throws(() => api.checkedDate('2031-01-01'), /2030/);
  assert.throws(() => api.localDate(new Date(), 'Imaginary/Zone'));
});

test('Moon vector advances with the chosen simulation instant', () => {
  const a = api.lunarVector(new Date('2026-11-04T00:00:00Z'));
  const b = api.lunarVector(new Date('2026-11-05T00:00:00Z'));
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.0001);
});

test('location changes rise events, while astronomical tithi remains shared', () => {
  const date = new Date('2026-11-04T12:00:00Z');
  const syracuse = api.localCalendar(date, ...publicLocation);
  const london = api.localCalendar(date, 51.5074, -0.1278, 'Europe/London');
  assert.equal(syracuse.tithi, london.tithi);
  assert.notEqual(syracuse.sunrise.toISOString(), london.sunrise.toISOString());
  assert.notEqual(syracuse.upcoming.moonrise.toISOString(), london.upcoming.moonrise.toISOString());
});

test('moonrise count resets at a calculated new moon and calendar results cross civil month/year boundaries', () => {
  const before = api.localCalendar(new Date('2026-11-09T06:00:00Z'), ...publicLocation);
  const after = api.localCalendar(new Date('2026-11-09T08:00:00Z'), ...publicLocation);
  assert.ok(before.day >= 25);
  assert.equal(after.day, 0);
  for (const date of ['2024-01-01T12:00:00Z', '2024-02-29T12:00:00Z', '2026-11-01T06:30:00Z', '2030-12-31T12:00:00Z']) {
    const state = api.localCalendar(new Date(date), ...publicLocation);
    assert.ok(state.newMoon <= state.date && state.nextNewMoon > state.date);
    assert.ok(state.upcoming.sunrise >= state.upcoming.moonrise);
  }
});

test('vendored browser engine is byte-identical to the pinned MIT dependency', () => {
  const { resolve } = require('node:path');
  const { createHash } = require('node:crypto');
  const digest = path => createHash('sha256').update(readFileSync(resolve(__dirname, '..', path))).digest('hex');
  assert.equal(digest('js/vendor/astronomy-engine.mjs'), digest('node_modules/astronomy-engine/esm/astronomy.js'));
});
