// Adapted from DecentHead 426ccb7 test/browser-smoke.mjs (Apache-2.0), with
// EIP-1193/route fixtures adapted from DecentMarket 234d1e2 (Apache-2.0).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Interface, ZeroAddress } from 'ethers';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const shots = resolve(process.env.SCREENSHOT_DIR || 'test-results/smoke');
await mkdir(shots, { recursive: true });

// Standalone npm test:smoke needs no separate server process. BASE_URL also
// supports the ecosystem's externally served CI/development pattern.
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.jpg': 'image/jpeg' };
const server = process.env.BASE_URL ? null : createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(root + sep) || path.includes(`${sep}node_modules${sep}`) || /(?:^|\/)\./.test(path.slice(root.length))) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path)); }
  catch { res.writeHead(404).end('Not found'); }
});
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.BASE_URL || `http://127.0.0.1:${server.address().port}`;
const origin = new URL(base).origin;

// Encode empty-chain reads using real ABIs, not an ethers stub. No signed
// transactions are simulated: a smoke run must never spend or send anything.
const functions = new Map();
function addAbi(abi) {
  const iface = new Interface(abi);
  for (const fragment of iface.fragments.filter(f => f.type === 'function')) functions.set(fragment.selector, { iface, fragment });
}
for (const file of await readdir(resolve(root, 'abis'))) {
  const json = JSON.parse(await readFile(resolve(root, 'abis', file), 'utf8'));
  addAbi(json.abi || json);
}
for (const file of (await readdir(resolve(root, 'js'))).filter(f => f.endsWith('.js'))) {
  const source = await readFile(resolve(root, 'js', file), 'utf8');
  for (const match of source.matchAll(/['"](function [^'"\n]+)['"]/g)) {
    try { addAbi([match[1]]); } catch { /* Not every documentation string is an ABI. */ }
  }
}
function emptyValue(type) {
  if (type.baseType === 'array') return type.arrayLength < 0 ? [] : Array.from({ length: type.arrayLength }, () => emptyValue(type.arrayChildren));
  if (type.baseType === 'tuple') return type.components.map(emptyValue);
  if (type.type === 'address') return ZeroAddress;
  if (type.type === 'bool') return false;
  if (type.type === 'string') return '';
  if (type.type.startsWith('bytes')) return '0x' + '00'.repeat(Number(type.type.slice(5)) || 0);
  return 0;
}
// Use the app's already-public allowlisted address only as a read-only fixture.
// There is no real wallet, signature, key, or external RPC behind this provider.
const appSource = await readFile(resolve(root, 'js/app.js'), 'utf8');
const wallet = appSource.match(/const WALLET_WHITELIST = \[\s*"(0x[0-9a-f]{40})"/i)?.[1];
assert.ok(wallet, 'Dashboard access requires a configured public whitelist fixture');
const walletCalls = [];
let walletGranted = false;
async function rpc({ method, params = [] }) {
  walletCalls.push(method);
  switch (method) {
    case 'eth_accounts': return walletGranted ? [wallet] : [];
    case 'eth_requestAccounts': walletGranted = true; return [wallet];
    case 'eth_chainId': return '0x2105';
    case 'net_version': return '8453';
    case 'eth_blockNumber': return '0x100';
    case 'eth_getBalance': case 'eth_getTransactionCount': case 'eth_gasPrice': return '0x0';
    case 'eth_getCode': return '0x01';
    case 'eth_getLogs': return [];
    case 'wallet_switchEthereumChain': case 'wallet_addEthereumChain': return null;
    case 'eth_call': {
      const entry = functions.get(params[0].data?.slice(0, 10));
      assert.ok(entry, `Unfixtureed eth_call ${params[0].data}`);
      return entry.iface.encodeFunctionResult(entry.fragment, entry.fragment.outputs.map(emptyValue));
    }
    default: throw Object.assign(new Error(`Unsupported smoke wallet method: ${method}`), { code: 4200 });
  }
}
const libraries = new Map([
  ['https://cdn.jsdelivr.net/npm/chart.js', 'node_modules/chart.js/dist/chart.umd.js'],
  ['https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns', 'node_modules/chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js'],
  ['https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js', 'node_modules/ethers/dist/ethers.umd.min.js'],
]);
// No console/page/network failure is silently ignored. Keep this explicit even
// when empty; any future exception needs a bug reference and narrow matcher.
const allowedErrors = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const name = viewport.width === 390 ? 'mobile' : 'desktop';
    walletCalls.length = 0;
    walletGranted = false;
    const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const restoredSnapshot = {
      dataVersion: 1,
      waterDailyHistory: { '2026-10-28': 4, '2026-10-27': 2 },
      weightLogs: [{ weight: 178, timestamp: '2026-10-28T10:00:00Z' }],
      foods: [{ name: 'Synthetic restore meal', amount: 1, unit: 'serving', date: '2026-10-28', nutr: { calories: 246, protein: 12 } }],
      supplements: [{ name: 'Synthetic restore supplement', weight: 10, date: '2026-10-28', time: '10:00' }],
      exercises: { types: ['Push-ups'], entries: [{ type: 'Push-ups', timestamp: '2026-10-28T10:00:00Z', sets: [{ reps: 8, weight: 10 }] }] },
      measurements: [{ type: 'Bicep', measurement: '12', date: '2026-10-28', time: '10:00' }],
      painLogs: [{ bodyArea: 'Synthetic restore area', severity: 2, timestamp: '2026-10-28T10:00:00Z' }],
      emotions: [{ emotion: 'Joy', context: 'manual', timestamp: '2026-10-28T10:00:00Z' }],
    };
    const page = await context.newPage();
    // Software-rendered canvas plus screenshot capture is slower on CI CPUs.
    page.setDefaultTimeout(30_000);
    await page.clock.setFixedTime(new Date('2026-10-28T12:00:00Z'));
    const errors = [], failed = [], unexpected = [], external = new Set();
    page.on('pageerror', error => errors.push(`pageerror: ${error.stack || error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()} ${JSON.stringify(message.location())}`); });
    page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    await page.routeWebSocket('**/*', socket => {
      unexpected.push(`WebSocket ${socket.url()}`);
      socket.close({ code: 1008, reason: 'Network disabled by smoke harness' });
    });
    await page.exposeFunction('__smokeRpc', rpc);
    await page.addInitScript(() => {
      const listeners = new Map();
      window.ethereum = {
        isMetaMask: true,
        request: args => window.__smokeRpc(args),
        on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); return this; },
        removeListener(event, listener) { listeners.get(event)?.delete(listener); return this; },
      };
    });
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      external.add(request.url());
      if (libraries.has(request.url())) return route.fulfill({ contentType: 'text/javascript', body: await readFile(resolve(root, libraries.get(request.url()))) });
      if (url.pathname.endsWith('/ipfs/bafysyntheticwaterrestore')) return route.fulfill({ json: restoredSnapshot });
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
      if (request.method() === 'POST' && /base\.org|publicnode\.com|optimism\.io|llamarpc\.com/.test(url.hostname)) {
        const calls = request.postDataJSON();
        const reply = async c => ({ jsonrpc: '2.0', id: c.id, result: await rpc(c) });
        return route.fulfill({ json: Array.isArray(calls) ? await Promise.all(calls.map(reply)) : await reply(calls) });
      }
      if (url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith('/TheJollyLaMa/BigNuten_Vanilla/main/')) {
        const file = url.pathname.split('/').pop();
        if (['payroll-queue.json', 'contributor-accounts.json', 'network-registry.json'].includes(file)) return route.fulfill({ contentType: 'application/json', body: await readFile(resolve(root, file)) });
      }
      if (url.hostname === 'api.github.com') return route.fulfill({ json: [] });
      unexpected.push(request.url());
      return route.fulfill({ status: 503, json: { error: 'External network disabled by smoke harness' } });
    });
    async function shot(label) { await page.screenshot({ path: resolve(shots, `${name}-${label}.png`), fullPage: true }); }
    try {
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.locator('#app-title-name').waitFor({ state: 'visible' });
      // Decorative infinite transforms prevent actionability stability; motion
      // itself is not under test. Keep layout, hit testing and real clicks.
      await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
      const covered = new Set();
      async function visible(selector) { await page.locator(selector).first().waitFor({ state: 'visible' }); }
      async function hidden(selector) { await page.locator(selector).waitFor({ state: 'hidden' }); }
      async function click(selector) { await page.locator(selector).first().click(); }
      async function modal(id, trigger, close = `#${id} .modal-close`, before = []) {
        console.log(`${name}: ${id}`);
        for (const selector of before) {
          if (selector.startsWith('[data-panel=')) {
            const id = await page.locator(selector).getAttribute('data-panel');
            if (!(await page.locator(`#${id}`).isVisible())) await click(selector);
          } else await click(selector);
        }
        await click(trigger);
        await visible(`#${id}`);
        const box = await page.locator(`#${id}`).boundingBox();
        assert.ok(box.width > 0 && box.height > 0, `${id} renders`);
        // Surface-specific checks supplement the shared render/open/close assertion.
        if (id === 'moon-modal') {
          assert.match(await page.locator('#moon-info').innerText(), /Moon Day:.*Sun Day:/);
          assert.match(await page.locator('#location-info').innerText(), /Location not linked/);
          assert.ok(await page.locator('#ekadasi-links a').count(), 'Ekadasi reference links render even outside a fasting day');
        }
        if (id === 'about-modal') {
          await visible('#tz-clock');
          await page.locator('#tz-select').selectOption('Pacific/Honolulu');
          assert.equal(await page.evaluate(() => localStorage.getItem('userTimezone')), 'Pacific/Honolulu');
          await page.locator('#tz-select').selectOption('UTC');
        }
        if (id === 'about-modal' && trigger === '#aes-dnft-btn') {
          await visible('#dnft-supporter-section');
          await visible('#dnft-buy-cards');
          assert.ok((await page.locator('#dnft-buy-cards').innerText()).trim(), 'DNFT editions or deployment-unavailable message renders');
          await visible('#dnft-fiat-wallet');
        }
        if (id === 'data-sharing-modal') {
          for (const tab of ['exercise', 'nutrition', 'bnut', 'datapool']) {
            await click(`.comm-tab[data-tab="${tab}"]`);
            await visible(`#comm-tab-${tab}`);
            assert.equal(await page.locator(`.comm-tab[data-tab="${tab}"]`).getAttribute('aria-selected'), 'true');
            assert.ok((await page.locator(`#comm-tab-${tab}`).innerText()).trim(), `${tab} community content`);
          }
        }
        if (id === 'achievements-modal') {
          await visible('#comp-user-list');
          assert.ok((await page.locator('#comp-user-list').innerText()).trim(), 'StreakBet empty/unavailable state is explicit');
        }
        if (id === 'yoga-flow-modal') {
          await click('#yoga-start-btn');
          await visible('#yoga-active-screen');
          await visible('#yoga-breath-aura');
          assert.match(await page.locator('#yoga-breath-label').innerText(), /Inhale|Exhale|Hold/);
          assert.match(await page.locator('#yoga-timer-display').innerText(), /\d+:\d{2}/);
          await click('#yoga-end-btn'); await click('#yoga-end-btn');
          await visible('#yoga-complete-screen');
        }
        await shot(id);
        await click(close);
        await hidden(`#${id}`);
        covered.add(id);
      }
      if (name === 'desktop') {
        await visible('#ipfs-edu-overlay'); await shot('ipfs-education');
        await click('#ipfs-edu-skip-btn'); await hidden('#ipfs-edu-overlay'); covered.add('ipfs-edu-overlay');
      }
      await click('#wallet-connect');
      await page.waitForFunction(() => document.getElementById('wallet-connect').dataset.walletState === 'connected');
      assert.equal(await page.locator('#wallet-connect').getAttribute('data-wallet-address'), wallet);
      for (const selector of ['#body-figure-wrapper', '#water-tracker', 'footer', '#wallet-connect', '#chakra-aura-canvas', '.chakra-icon']) await visible(selector);
      assert.equal(await page.evaluate(() => window.ethereum.request({ method: 'eth_chainId' })), '0x2105');
      assert.ok(await page.locator('#chakra-aura-canvas').evaluate(canvas => canvas.width > 0 && canvas.height > 0), 'Aura canvas has drawing dimensions');
      await shot('dashboard');
      await click('#water-drop-empty');
      for (let count = 0; count < 10; count++) await click('#water-log-btn');
      assert.equal(await page.locator('#water-modal-count').innerText(), '10 / 8');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).waterDailyHistory['2026-10-28']), 10);
      await click('#water-modal-close');
      await click('#graph-icon');
      // A fresh data profile in an already running document is the incognito
      // restore regression: no navigation/reload may be needed to fill panels.
      for (const source of ['json', 'cid']) {
        await page.evaluate(async ({ source, snapshot }) => {
          for (const key of ['fitnessTrackerData', 'waterDailyHistory', 'waterTrackerData', 'bignutenRecoveryPoints.v1', 'bignutenRecoveryUndo.v1']) localStorage.removeItem(key);
          if (source === 'json') {
            const { importDataFromJSONFile } = await import('/js/dataControl.js');
            await importDataFromJSONFile(new File([JSON.stringify(snapshot)], 'synthetic-restore.json', { type: 'application/json' }));
          } else {
            const { importAndMergeFromCID } = await import('/js/fitnessData.js');
            await importAndMergeFromCID('bafysyntheticwaterrestore');
          }
        }, { source, snapshot: restoredSnapshot });
        assert.equal(await page.locator('#water-count-label').innerText(), '4/8', `${source}: water restored without reload`);
        assert.equal(await page.locator('#current-weight-display').innerText(), '178 lbs');
        assert.match(await page.locator('#foods-last7days').textContent(), /Synthetic restore meal/);
        assert.match(await page.locator('#supplement-entries').textContent(), /Synthetic restore supplement/);
        assert.match(await page.locator('#exercises-last7days').textContent(), /Push-ups/);
        assert.match(await page.locator('#exercise-list').textContent(), /8 reps/);
        assert.match(await page.locator('#dietAllTimeLog').textContent(), /Synthetic restore meal/);
        assert.match(await page.locator('#dv-card-content .dv-row').filter({ has: page.locator('[data-nutr-key="calories"]') }).textContent(), /246 \/ 2,000 kcal/);
        assert.match(await page.locator('#pain-log-list').textContent(), /Synthetic restore area/);
        assert.equal(await page.locator('#feelings-analytics .ew-analytics-empty').count(), 0);
        assert.equal(await page.evaluate(() => Chart.getChart(document.getElementById('measurement-chart')).data.datasets[0].data[0].y), 12);
        assert.equal(await page.evaluate(() => Chart.getChart(document.getElementById('correlationChart')).data.datasets.find(dataset => dataset.label.includes('Water')).data.at(-1).y), 4, `${source}: open water trend refreshed`);
        await shot(`${source}-restored-dashboard`);
        console.log(`${name}: ${source} restore repopulated water, weight, food/nutrition, supplements, exercises, measurements, pain and feelings without reload`);
      }
      await click('#correlation-graph-modal .modal-close');
      // Log one synthetic exercise through the real form to populate the workout
      // path. Fresh browser contexts guarantee this never touches user data.
      await click('#log-exercise');
      await page.locator('#exercise-type').selectOption('Push-ups');
      await page.locator('[name="set-reps-0"]').fill('6');
      await page.locator('[name="set-weight-0"]').fill('10');
      await page.locator('#exercise-date').fill('2026-10-28');
      await page.locator('#exercise-time').fill('12:00');
      await page.locator('#exercise-form button[type="submit"]').click();
      assert.ok(await page.locator('#exercises-last7days .exercise-add-btn').count(), 'Exercise form populated recent logs');
      await click('#exercise-modal .modal-close');
      const panels = await page.locator('.dashboard-panel').evaluateAll(els => els.map(el => el.id));
      assert.equal(panels.length, 4, 'Update coverage when dashboard panels change');
      // Enable the assistant UI without sending prompts/downloading a model.
      await click('#aesculapius-right'); await click('#aes-settings-btn');
      await click('label:has(#genie-enabled-toggle)');
      assert.equal(await page.locator('#genie-enabled-toggle').isChecked(), true);
      await click('#settings-modal-close');
      for (const id of panels) {
        await click(`[data-panel="${id}"].panel-toggle-btn`);
        await visible(`#${id}`);
        assert.ok((await page.locator(`#${id}`).innerText()).trim(), `${id} has content`);
        if (id === 'recent-exercises-list') await click('#exercises-last7days .exercise-add-btn');
        if (id === 'recent-foods-list') {
          await visible('#dv-card-content .dv-row');
          for (const period of ['weekly', 'monthly', 'annual', 'daily']) {
            await click(`.dv-period-btn[data-period="${period}"]`);
            assert.equal(await page.locator(`.dv-period-btn[data-period="${period}"]`).getAttribute('class'), 'dv-period-btn active');
          }
        }
        await shot(id);
        await click(`.genie-icon-btn[data-panel="${id}"]`);
        await visible(`.genie-chat-window[data-panel="${id}"]`);
        await shot(`${id}-genie`);
        await click(`.genie-chat-window[data-panel="${id}"] .genie-chat-close`);
        await hidden(`.genie-chat-window[data-panel="${id}"]`);
        await click(`[data-panel="${id}"].panel-toggle-btn`);
        await hidden(`#${id}`);
      }
      for (const [id, trigger, close] of [
        ['moon-modal', '#moon-icon'], ['water-modal', '#water-drop-empty'],
        ['emotion-modal', '#emotion-icon'], ['pain-log-modal', '#chakra-sacral'],
        ['weight-modal', '#log-weight'], ['measurements-modal', '#log-measurements'],
        ['supplements-modal', '#log-supplements'], ['dietModal', '#dietBtn', '#closeDietModal'],
        ['correlation-graph-modal', '#graph-icon'], ['exercise-modal', '#log-exercise'],
        ['about-modal', '#app-title-name'],
      ]) await modal(id, trigger, close);
      for (const [id, trigger] of [
        ['bnut-admin-modal', '#admin-bnut-btn'], ['treasury-admin-modal', '#admin-treasury-btn'],
        ['defi-admin-modal', '#admin-defi-btn'], ['escrow-admin-modal', '#admin-escrow-btn'],
        ['contributors-admin-modal', '#admin-contributors-btn'], ['comp-admin-modal', '#admin-comp-btn'],
        ['payroll-modal', '#admin-payroll-btn'],
      ]) await modal(id, trigger, undefined, ['#aesculapius-left']);
      for (const [id, trigger] of [
        ['achievements-modal', '#aes-achieve-btn'], ['settings-modal', '#aes-settings-btn'],
        ['governance-modal', '#aes-gov-btn'], ['data-sharing-modal', '#aes-data-btn'],
        ['subscription-modal', '#aes-sub-btn'], ['challenge-modal', '#aes-challenge-btn'],
        ['bounty-register-modal', '#aes-bounty-register-btn'],
      ]) await modal(id, trigger, undefined, ['#aesculapius-right']);
      await modal('about-modal', '#aes-dnft-btn', undefined, ['#aesculapius-right']);
      await modal('genie-memory-modal', '#genie-memory-review-btn', undefined, ['#aesculapius-right', '#aes-settings-btn']);
      await click('#settings-modal-close');
      await modal('admin-add-contributor-modal', '#admin-contrib-add-btn', undefined, ['#aesculapius-left', '#admin-contributors-btn']);
      await click('#contributors-admin-modal-close');
      await modal('dv-goal-modal', '.dv-row__pct--btn', undefined, ['[data-panel="recent-foods-list"].panel-toggle-btn']);
      if (await page.locator('#recent-foods-list').isVisible()) await click('[data-panel="recent-foods-list"].panel-toggle-btn');
      await modal('dv-manage-modal', '#dv-manage-open-btn', undefined, ['[data-panel="recent-foods-list"].panel-toggle-btn']);
      if (await page.locator('#recent-foods-list').isVisible()) await click('[data-panel="recent-foods-list"].panel-toggle-btn');
      await modal('yoga-flow-modal', '#yoga-flow-btn', '#yoga-close-btn', ['[data-panel="workout-set-list"].panel-toggle-btn']);
      if (await page.locator('#workout-set-list').isVisible()) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      await modal('yoga-genie-panel', '#yoga-genie-btn', '#yoga-genie-chat-close', ['[data-panel="workout-set-list"].panel-toggle-btn', '#yoga-flow-btn']);
      await click('#yoga-close-btn');
      if (await page.locator('#workout-set-list').isVisible()) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      if (name === 'mobile') await modal('mobile-data-sheet', '#ipfsIcon', '#mobile-sheet-close-btn');
      await modal('ipfs-connect-dialog', '#aes-storage-btn', '#ipfs-dialog-close-btn', ['#aesculapius-right']);
      // A prepared storage-mode preference is a UI fixture, not a connected IPFS
      // provider. Exercise the snapshot viewer without uploading private data.
      await page.evaluate(() => localStorage.setItem('storageMode', 'ipfs'));
      await modal('ipfs-snapshot-panel', '#aes-storage-btn', '#snapshot-panel-close', ['#aesculapius-right']);
      await page.evaluate(() => localStorage.setItem('storageMode', 'json-only'));
      assert.equal(await page.locator('#rawFoodModal').count(), 1, 'Legacy raw-food surface exists (#361)');
      await hidden('#rawFoodModal');
      assert.equal(await page.locator('#dietButton').count(), 0, 'Legacy opener absent until #361 is resolved');
      // #362: cancellation leaks its preparation timer. Check the real cancel
      // control last with timers paused; do not let the known delayed callback
      // interfere with independent surfaces or claim timer lifecycle coverage.
      await page.clock.pauseAt(new Date('2026-10-28T12:00:00Z'));
      await modal('workout-timer-modal', '#start-workout-button', '#cancel-workout-button', ['[data-panel="workout-set-list"].panel-toggle-btn']);
      if (await page.locator('#workout-set-list').isVisible()) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      const exclusions = new Map([
        ['rawFoodModal', 'Legacy dialog has no #dietButton opener; #dietBtn opens #dietModal instead.'],
        ...(name === 'desktop' ? [['mobile-data-sheet', 'Mobile-only IPFS menu by design.']] : [['ipfs-edu-overlay', 'Desktop-only onboarding by design.']]),
      ]);
      const discovered = await page.locator('.modal-overlay[id], #dietModal, #rawFoodModal, [role="dialog"], #ipfs-snapshot-panel').evaluateAll(els => els.map(el => el.id));
      assert.deepEqual(discovered.filter(id => !covered.has(id) && !exclusions.has(id)), [], 'Every discovered dialog must be checked or explicitly explained');
      for (const [id, reason] of exclusions) console.log(`NOT APPLICABLE (${name}): ${id}: ${reason}`);
      await page.waitForLoadState('networkidle');
      assert.ok(walletCalls.includes('eth_requestAccounts'), 'Real wallet connect requested fixture account');
      assert.ok(walletCalls.includes('eth_call'), 'Real ethers contract reads exercised');
      console.log(`${name}: covered ${panels.length} panels / ${covered.size} dialogs; ${external.size} external URLs fulfilled locally`);
      assert.deepEqual(unexpected, [], 'External requests need explicit fixtures');
      assert.deepEqual(failed, [], 'No failed requests or HTTP errors');
      const unallowed = errors.filter(error => !allowedErrors.some(entry => entry.match.test(error)));
      for (const error of errors.filter(error => !unallowed.includes(error))) console.warn(`ALLOWLISTED (${name}): ${error}`);
      assert.deepEqual(unallowed, [], 'No unexpected console errors or page exceptions');
      console.log(`${name}: zero unexpected console/page/network errors (${errors.length} allowed)`);
    } catch (error) {
      try { await shot('failure'); } catch (shotError) { console.error('Failure screenshot unavailable:', shotError.message); }
      console.error(JSON.stringify({ viewport, errors, failed, unexpected }, null, 2));
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
