const { test } = require('node:test');
const assert = require('node:assert/strict');

test('confirmed Rama anchor advances using actual lunations, not fixed yearly dates', async () => {
  const { localCalendar } = await import('../js/lunarAstronomy.mjs');
  const { storyForObservance, neighboringObservances, STORIES } = await import('../js/ekadasiStories.mjs');
  const location = [43.0481, -76.1474, 'America/New_York'];
  const november = localCalendar('2026-11-06T12:00:00Z', ...location);
  const { last, next } = neighboringObservances(november.surroundingObservances, november.date, location[2]);
  assert.equal(storyForObservance(last)[0], 'Rama');
  assert.equal(storyForObservance(next)[0], 'Utthana');
  const nextCycle = localCalendar('2026-12-10T12:00:00Z', ...location);
  const stories = nextCycle.surroundingObservances.map(event => storyForObservance(event)[0]);
  assert.ok(stories.includes('Utpanna'));
  assert.ok(stories.includes('Mokshada'));
  const beginning = localCalendar('2026-11-10T12:00:00Z', ...location);
  assert.equal(storyForObservance(beginning.mostRecent)[0], 'Rama', 'Most recent crosses a new-moon boundary.');
  assert.equal(STORIES.length, 24);
  assert.equal(new Set(STORIES.map(([, slug]) => slug)).size, 24);
  const changed = { date: '2026-11-04', targetDay: 25, slug: 'utthana' };
  assert.equal(storyForObservance(last, changed)[0], 'Utthana');
  assert.equal(storyForObservance(next, changed)[0], 'Utpanna');
});

test('story window includes whole local days two before/after, including DST and date line', async () => {
  const { storyWindow } = await import('../js/ekadasiStories.mjs');
  const event = new Date('2026-11-04T11:43:00Z');
  for (const [date, expected] of [
    ['2026-11-02T05:00:00Z', true], ['2026-11-07T04:59:59Z', true],
    ['2026-11-02T04:59:59Z', false], ['2026-11-07T05:00:00Z', false],
  ]) assert.equal(storyWindow(new Date(date), event, 'America/New_York'), expected, date);
  const dstEvent = new Date('2026-11-01T12:00:00Z');
  assert.equal(storyWindow(new Date('2026-10-30T04:00:00Z'), dstEvent, 'America/New_York'), true);
  assert.equal(storyWindow(new Date('2026-11-07T10:00:00Z'), event, 'Pacific/Kiritimati'), false);
});

test('story reference rejects invalid dates, names and unsupported lunar days', async () => {
  const { validateStoryAnchor } = await import('../js/ekadasiStories.mjs');
  for (const anchor of [null, { date: '2026-02-30', targetDay: 25, slug: 'rama' },
    { date: '2031-01-01', targetDay: 25, slug: 'rama' },
    { date: '2026-11-04', targetDay: 26, slug: 'rama' },
    { date: '2026-11-04', targetDay: 25, slug: 'unknown' }]) {
    assert.throws(() => validateStoryAnchor(anchor));
  }
});

test('story neighbors use local date boundaries, omit unavailable rises and wrap years', async () => {
  const { localCalendar } = await import('../js/lunarAstronomy.mjs');
  const { neighboringObservances, storyForObservance } = await import('../js/ekadasiStories.mjs');
  const calendar = localCalendar('2027-01-01T12:00:00Z', 43.0481, -76.1474, 'America/New_York');
  const neighbors = neighboringObservances(calendar.surroundingObservances, calendar.date, calendar.timeZone);
  assert.equal(neighbors.last.sunrise.getUTCFullYear(), 2026);
  assert.equal(neighbors.next.sunrise.getUTCFullYear(), 2027);
  for (const event of [neighbors.last, neighbors.next]) assert.equal(storyForObservance(event).length, 2);
  assert.deepEqual(neighboringObservances([{ sunrise: null }], calendar.date, calendar.timeZone),
    { last: null, next: null });
  const event = { sunrise: new Date('2026-11-04T11:43:00Z') };
  assert.equal(neighboringObservances([event], new Date('2026-11-04T23:59:00Z'), calendar.timeZone).next, event,
    'Today remains coming until the local calendar day ends.');
});
