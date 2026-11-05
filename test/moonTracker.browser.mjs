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
    await page.locator('#moon-latitude').fill('43.0481');
    await page.locator('#moon-longitude').fill('-76.1474');
    await page.locator('#moon-timezone').fill('America/New_York');
    await page.locator('#moon-location-form button[type=submit]').click();
    assert.match(await page.locator('#moon-local-events').innerText(), /count: 24/);
    assert.match(await page.locator('#ekadasi-info').innerText(), /Nov 5/);
    assert.equal(await page.locator('#moon-location-details').getAttribute('open'), null);
    await page.locator('#moon-notifications').click();
    await page.locator('#moon-notification-status').filter({ hasText: 'Reminders on' }).waitFor();
    assert.equal(await page.evaluate(() => window.permissionRequests), 1);
    assert.equal(await page.evaluate(() => window.notifications.length), 0, 'Next sunrise is more than 24h away.');
    await page.clock.setSystemTime(new Date('2026-11-04T15:00:00Z'));
    await page.locator('#moon-modal .modal-close').click();
    await page.locator('#moon-icon').click();
    await page.waitForFunction(() => window.notifications.length === 1);
    await page.locator('#moon-modal .modal-close').click();
    await page.locator('#moon-icon').click();
    assert.equal(await page.evaluate(() => window.notifications.length), 1, 'Reopen does not duplicate reminder.');
    await page.locator('#moon-notifications').click();
    assert.match(await page.locator('#moon-notification-status').innerText(), /turned off/);
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
    assert.deepEqual(errors, []);
    console.log(`${name}: location, custom rule, no implicit permissions, reminder dedup/off, simulation, reduced motion, hidden stop, error and reload privacy passed.`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
