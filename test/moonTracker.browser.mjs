import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const source = await readFile(resolve(root, 'index.html'), 'utf8');
const start = source.indexOf('  <div id="moon-modal"');
const end = source.indexOf('  <!-- Water Intake Log Modal -->', start);
assert.ok(start > 0 && end > start);
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/styles.css"></head><body>
<button id="moon-icon">Moon tracker</button>${source.slice(start, end)}
<script type="module">
import {initMoonTracker,requestLocation} from '/js/moonTracker.mjs';
window.requestLocation=requestLocation;
initMoonTracker();
document.getElementById('moon-icon').onclick=()=>document.getElementById('moon-modal').classList.remove('modal-hidden');
document.querySelector('.modal-close').onclick=()=>document.getElementById('moon-modal').classList.add('modal-hidden');
</script></body></html>`;
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }).end(fixture); return; }
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(root + sep) || path.includes('/node_modules/') || path.slice(root.length).includes('/.')) {
    res.writeHead(403).end(); return;
  }
  try { res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(path)); }
  catch (error) {
    if (error.code !== 'ENOENT') console.error(error);
    res.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const shots = resolve(root, 'test-results/moon-tracker');
await mkdir(shots, { recursive: true });
try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, timezoneId: 'Pacific/Honolulu', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-11-04T10:46:00Z') });
    await page.addInitScript(() => {
      window.permissionRequests = 0;
      window.notifications = [];
      window.Notification = class {
        static async requestPermission() { window.permissionRequests++; return 'granted'; }
        constructor(title, options) { window.notifications.push({ title, options }); }
      };
    });
    await page.goto(base);
    await page.locator('#moon-icon').click();
    await page.locator('#moon-info').filter({ hasText: 'Krishna Ekadasi' }).waitFor();
    assert.match(await page.locator('#location-info').innerText(), /Location not linked/);
    assert.equal(await page.evaluate(() => window.permissionRequests), 0);
    assert.equal(await page.locator('#moon-notifications, #moon-notification-status, #ekadasi-info-card').count(), 0);
    assert.equal(await page.locator('#ekadasi-featured a').count(), 0, 'No invented local date without coordinates.');
    assert.equal(await page.locator('#moon-info-card #ekadasi-links').count(), 1);
    assert.deepEqual(await page.locator('#moon-info-card').evaluate(card => [...card.children].map(node => node.id)),
      ['moon-info', 'ekadasi-featured', 'ekadasi-links']);
    assert.doesNotMatch(await page.locator('#moon-modal').innerText(), /Link a location to calculate|About Jolly/);
    await page.locator('#moon-latitude').fill('43.0481');
    await page.locator('#moon-longitude').fill('-76.1474');
    await page.locator('#moon-timezone').fill('America/New_York');
    await page.locator('#moon-location-form button[type=submit]').click();
    assert.match(await page.locator('#moon-local-events').innerText(), /lunar day: 25/);
    assert.match(await page.locator('#ekadasi-info').innerText(), /Observance date is today: Nov 4/);
    assert.equal(await page.locator('#moon-location-details').getAttribute('open'), null);
    assert.match(await page.locator('#ekadasi-featured').innerText(), /Rama Ekadasi.*Nov 4/);
    assert.equal(await page.locator('#ekadasi-featured a').getAttribute('href'), 'https://iskcondesiretree.com/page/rama-ekadasi');
    await page.locator('#moon-info-card').screenshot({ path: resolve(shots, `${name}-story-top.png`) });
    await page.locator('#ekadasi-links > details > summary').click();
    assert.equal(await page.locator('#ekadasi-links [data-story] span').filter({ hasText: /Last|Coming/ }).count(), 2);
    assert.match(await page.locator('#ekadasi-links .ekadasi-next').innerText(), /Rama.*Coming.*Nov 4/);
    const color = await page.locator('#ekadasi-featured a').evaluate(link => getComputedStyle(link).color);
    assert.notEqual(color, 'rgb(0, 0, 238)');
    await page.clock.setSystemTime(new Date('2026-11-04T11:00:00Z'));
    await page.locator('#moon-modal .modal-close').click();
    await page.locator('#moon-icon').click();
    await page.locator('#moon-modal .modal-close').click();
    await page.locator('#moon-icon').click();
    assert.equal(await page.evaluate(() => window.notifications.length), 0, 'Removed reminders never request delivery.');
    await page.clock.setSystemTime(new Date('2026-11-05T12:00:00Z'));
    await page.locator('#moon-modal .modal-close').click();
    await page.locator('#moon-icon').click();
    assert.match(await page.locator('#moon-local-events').innerText(), /lunar day: 26/);
    assert.match(await page.locator('#ekadasi-info').innerText(), /Most recent observance: Nov 4/);
    assert.doesNotMatch(await page.locator('#ekadasi-info').innerText(), /Observance date is today/);
    assert.match(await page.locator('#ekadasi-links .ekadasi-last').innerText(), /Rama.*Last.*Nov 4/);
    assert.match(await page.locator('#ekadasi-links .ekadasi-next').innerText(), /Utthana.*Coming/);
    const highlights = await page.locator('#ekadasi-links .ekadasi-last, #ekadasi-links .ekadasi-next')
      .evaluateAll(rows => rows.map(row => getComputedStyle(row).backgroundColor));
    assert.notEqual(highlights[0], highlights[1]);
    for (const [date, count] of [['2026-11-02T12:00:00Z', 1], ['2026-11-06T12:00:00Z', 1], ['2026-11-07T12:00:00Z', 0]]) {
      await page.clock.setSystemTime(new Date(date));
      await page.locator('#moon-modal .modal-close').click();
      await page.locator('#moon-icon').click();
      assert.equal(await page.locator('#ekadasi-featured a').count(), count, date);
    }
    await page.clock.setSystemTime(new Date('2026-11-06T12:00:00Z'));
    await page.locator('#moon-modal .modal-close').click();
    await page.locator('#moon-icon').click();
    await page.locator('#ekadasi-links .ekadasi-next').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shots, `${name}-story-library.png`) });
    assert.ok(await page.locator('#moon-info-card').evaluate(card => card.scrollWidth <= card.clientWidth),
      'Expanded story library fits the card.');
    await page.locator('#ss-details > summary').click();
    await page.locator('#ss-timestamp').filter({ hasText: 'Now' }).waitFor();
    await page.locator('#ss-next-day').click();
    assert.match(await page.locator('#ss-timestamp').innerText(), /Simulation/);
    const distances = await page.locator('#ss-planet-list').innerText();
    await page.locator('#ss-date').fill('2026-12-01');
    await page.locator('#ss-date').dispatchEvent('change');
    assert.notEqual(await page.locator('#ss-planet-list').innerText(), distances);
    await page.locator('#ss-play').click();
    assert.match(await page.locator('#ss-error').innerText(), /Reduced motion/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#ss-play').click();
    await page.waitForFunction(() => document.getElementById('ss-play').textContent === 'Pause');
    const before = await page.locator('#ss-timestamp').innerText();
    await page.clock.runFor(250);
    assert.notEqual(await page.locator('#ss-timestamp').innerText(), before);
    await page.locator('#moon-modal .modal-close').click();
    const paused = await page.locator('#ss-timestamp').innerText();
    await page.clock.runFor(500);
    assert.equal(await page.locator('#ss-timestamp').innerText(), paused, 'Hidden modal stops animation.');
    await page.locator('#moon-icon').click();
    await page.locator('#ss-now').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.match(await page.locator('#ss-timestamp').innerText(), /^Now/);
    await page.locator('#ss-toggle-outer').click();
    assert.match(await page.locator('#ss-planet-list').innerText(), /Neptune/);
    await page.locator('#solar-system-canvas').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shots, `${name}-planetarium.png`) });
    await page.locator('#moon-location-details > summary').click();
    await page.locator('#moon-timezone').fill('Invalid/Timezone');
    await page.locator('#moon-location-form button[type=submit]').click();
    assert.match(await page.locator('#location-info').innerText(), /Location not applied/);
    await page.locator('#moon-clear-location').click();
    assert.equal(await page.locator('#moon-latitude').inputValue(), '');
    assert.equal(await page.locator('#moon-local-events').innerText(), '');
    await page.reload();
    await page.locator('#moon-icon').click();
    assert.match(await page.locator('#location-info').innerText(), /Location not linked/);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await page.locator('#ekadasi-links > details > summary').click();
    await page.locator('#ekadasi-links details details > summary').click();
    await page.locator('#ekadasi-links [name=story]').selectOption('utthana');
    await page.locator('#ekadasi-links [name=date]').fill('2026-11-04');
    await page.locator('#ekadasi-links [name=day]').selectOption('25');
    await page.locator('#ekadasi-links button[type=submit]').click();
    assert.match(await page.locator('#ekadasi-reference-status').innerText(), /saved on this device/);
    await page.reload();
    await page.locator('#moon-icon').click();
    assert.equal(await page.locator('#ekadasi-links [name=story]').inputValue(), 'utthana');
    assert.equal(await page.locator('#moon-latitude').inputValue(), '');
    assert.equal(await page.evaluate(() => localStorage.length), 1, 'Only the story reference persists, not location.');
    await page.evaluate(() => localStorage.setItem('bignuten:ekadasi-story-anchor:v1', '{"slug":"invalid"}'));
    await page.reload();
    await page.locator('#moon-icon').click();
    assert.match(await page.locator('#ekadasi-reference-status').textContent(), /could not be loaded/);
    assert.equal(await page.locator('#ekadasi-links [name=story]').inputValue(), 'rama');
    assert.deepEqual(errors, []);
    console.log(`${name}: compact story placement, Rama anchor/Utthana next, highlighted dates only, five-day window, no reminders, location, simulation, hidden stop and reload privacy passed.`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
