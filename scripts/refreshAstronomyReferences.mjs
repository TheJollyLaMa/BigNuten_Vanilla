import { writeFile, mkdir } from 'node:fs/promises';
import { Astronomy } from '../js/lunarAstronomy.mjs';

const DAY = 86400000;
const dates = [];
const boundaries = [];
for (let year = 2024; year <= 2030; year++) {
  for (const month of [1, 4, 7, 10]) dates.push(new Date(Date.UTC(year, month - 1, 1)));
  let start = new Date(Date.UTC(year, 0, 1));
  for (let i = 0; i < 30; i++) {
    const phase = Astronomy.MoonPhase(start);
    const angle = ((Math.floor(phase / 12) + 1) * 12) % 360;
    const next = Astronomy.SearchMoonPhase(angle, start, 3);
    if (!next) throw new Error('Boundary generation failed.');
    boundaries.push({ date: next.date.toISOString(), angle });
    start = new Date(next.date.getTime() + 60000);
  }
}

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
        console.warn(`${url.host}: HTTP ${response.status}; retrying (${attempt + 1}/2).`);
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000));
        continue;
      }
      throw new Error(`${url.host}: HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.error) throw new Error(`${url.host}: ${JSON.stringify(data.error)}`);
    return data;
  }
}

async function vectors(command, center, instants) {
  if (instants.length > 28) {
    const rows = [];
    for (let index = 0; index < instants.length; index += 28) {
      rows.push(...await vectors(command, center, instants.slice(index, index + 28)));
    }
    return rows;
  }
  const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api');
  for (const [key, value] of Object.entries({
    format: 'json', COMMAND: `'${command}'`, CENTER: `'${center}'`, EPHEM_TYPE: "'VECTORS'",
    OUT_UNITS: "'AU-D'", VEC_TABLE: "'2'", REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'",
    VEC_CORR: "'NONE'", CSV_FORMAT: "'YES'", TIME_TYPE: "'UT'",
    TLIST: `'${instants.map(date => date.getTime() / DAY + 2440587.5).join('\n')}'`,
  })) url.searchParams.set(key, value);
  const data = await getJson(url);
  const block = data.result?.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!block) throw new Error(`JPL returned no vector block for ${command}: ${data.result?.slice(-1000)}`);
  const rows = block.trim().split('\n').map(line => {
    const columns = line.split(',').map(value => value.trim());
    const vector = columns.slice(2, 8).map(Number);
    if (vector.length !== 6 || !vector.every(Number.isFinite)) throw new Error('Invalid JPL vector row.');
    return vector;
  });
  if (rows.length !== instants.length) throw new Error(`JPL row count mismatch for ${command}.`);
  return rows;
}

const result = {
  provenance: {
    retrievedAt: new Date().toISOString(),
    phases: 'https://aa.usno.navy.mil/api/moon/phases/year?year=YEAR',
    vectors: 'https://ssd.jpl.nasa.gov/api/horizons.api',
    frame: 'Geometric ecliptic J2000 / ICRF; AU and AU/day; input instants UT.',
    sampling: '28 quarterly planet dates and 210 tithi transitions (30 consecutive transitions starting January 1 of each year), 2024–2030. Not an exhaustive bound over the continuous range.',
    transitions: 'Engine-predicted transition instants are query inputs, not expected answers. JPL independently supplies Sun/Moon position and velocity at those instants; tests convert phase residual to timing error.',
  },
  phases: [], planets: {}, boundaries: [],
};
for (let year = 2024; year <= 2030; year++) {
  const data = await getJson(new URL(`https://aa.usno.navy.mil/api/moon/phases/year?year=${year}`));
  result.phases.push(...data.phasedata);
}
for (const [name, id] of Object.entries({
  Mercury: 199, Venus: 299, Earth: 399, Mars: 499, Jupiter: 599, Saturn: 699, Uranus: 799, Neptune: 899,
})) {
  console.log(`Fetching JPL ${name} references…`);
  const rows = await vectors(id, '500@10', dates);
  result.planets[name] = rows.map((vector, i) => ({ date: dates[i].toISOString(), vector }));
}
const instants = boundaries.map(item => new Date(item.date));
const sun = await vectors(10, '500@399', instants);
const moon = await vectors(301, '500@399', instants);
result.boundaries = boundaries.map((item, i) => ({ ...item, sun: sun[i], moon: moon[i] }));
const riseUrl = new URL('https://aa.usno.navy.mil/api/rstt/oneday?date=2026-11-04&coords=43.0481,-76.1474&tz=-5');
result.riseReference = { url: riseUrl.href, data: (await getJson(riseUrl)).properties.data };
const destination = new URL('../test/fixtures/astronomy-references.json', import.meta.url);
await mkdir(new URL('../test/fixtures/', import.meta.url), { recursive: true });
await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Saved ${result.phases.length} phase references, ${Object.keys(result.planets).length * dates.length} planet vectors and ${result.boundaries.length} independent tithi checks.`);
