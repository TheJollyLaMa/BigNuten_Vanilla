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
      window.__smokeEmitWalletEvent = (event, ...args) => { for (const listener of listeners.get(event) || []) listener(...args); };
    });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('smokeRecoverySeeded')) return;
      sessionStorage.setItem('smokeRecoverySeeded', 'true');
      localStorage.setItem('fitnessTrackerData', '{synthetic corrupt data');
      localStorage.setItem('bignutenRecoveryPoints.v1', JSON.stringify([{
        date: '2026-10-28T11:00:00Z',
        raw: JSON.stringify({ dataVersion: 1, weightLogs: [], waterDailyHistory: {} }),
      }]));
    });
    const hostedRequests = [];
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      external.add(request.url());
      if (libraries.has(request.url())) return route.fulfill({ contentType: 'text/javascript', body: await readFile(resolve(root, libraries.get(request.url()))) });
      if (['models.inference.ai.azure.com', 'api.openai.com'].includes(url.hostname)) {
        hostedRequests.push({ hostname: url.hostname, body: request.postDataJSON() });
        return route.fulfill({ json: { choices: [{ message: { content: 'Synthetic health response' } }] } });
      }
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
      const recoveryNotice = page.locator('#snapshot-recovery-notice');
      await recoveryNotice.waitFor({ state: 'visible' });
      assert.equal(await recoveryNotice.getAttribute('role'), 'alert');
      assert.match(await recoveryNotice.innerText(), /Restored local recovery point from 2026-10-28T11:00:00Z/);
      await recoveryNotice.getByRole('button', { name: 'Dismiss recovery notice', exact: true }).click();
      await recoveryNotice.waitFor({ state: 'detached' });
      const dismissal = await page.evaluate(() => localStorage.getItem('bignutenRecoveryDismissed.v1'));
      assert.ok(dismissal, 'Dismissal persisted for this recovery event');
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#app-title-name').waitFor({ state: 'visible' });
      assert.equal(await recoveryNotice.count(), 0, 'Dismissed recovery notice stays dismissed on reload');
      assert.equal(await page.evaluate(() => localStorage.getItem('bignutenRecoveryDismissed.v1')), dismissal);
      console.log(`${name}: recovery notice shown, dismissed accessibly and remains dismissed after reload`);

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
          // Keep the two confirmations within Yoga's 3.5-second window even
          // when concurrent browser runs make separate actions slow.
          await page.locator('#yoga-end-btn').dblclick();
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
      await modal('rawFoodModal', '#dietQuickLogBtn', '#closeRawFoodModal', ['#dietBtn']);
      await visible('#dietModal');
      await click('#dietQuickLogBtn');
      await page.locator('#rawFoodName').fill('Smoke carrot');
      await page.locator('#rawFoodAmount').fill('0.5');
      await page.locator('#rawFoodUnit').fill('cup');
      await page.locator('#rawFoodProtein').fill('1.2');
      await click('#rawFoodForm button[type="submit"]');
      await hidden('#rawFoodModal');
      await visible('#dietModal');
      assert.match(await page.locator('#dietAllTimeLog').innerText(), /Smoke carrot/);
      const food = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).foods.find(food => food.name === 'Smoke carrot'));
      assert.equal(food.type, 'diet'); assert.equal(food.amount, 0.5); assert.equal(food.unit, 'cup');
      assert.deepEqual(food.nutr, { protein: 1.2 });
      await click('#closeDietModal');
      await click('[data-panel="recent-foods-list"].panel-toggle-btn');
      assert.match(await page.locator('#recent-foods-list').innerText(), /Smoke carrot/);
      await click('[data-panel="recent-foods-list"].panel-toggle-btn');
      await click('#chakra-heart');
      await visible('#heart-modal');
      await page.locator('#metric-value').fill('62');
      await page.locator('#metric-note').fill('Synthetic resting reading');
      await click('#metric-log-form button[type="submit"]');
      assert.match(await page.locator('#metric-status').innerText(), /Reading saved/);
      assert.match(await page.locator('#metric-history').innerText(), /62 bpm.*Synthetic resting reading/);
      assert.match(await page.locator('#metric-summary').innerText(), /7-day reading average 62.0 bpm; lowest 62 \/ highest 62/);
      const metricLogs = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).metricLogs);
      assert.equal(metricLogs.length, 1);
      assert.equal(metricLogs[0].metric, 'rhr');
      assert.equal(metricLogs[0].unit, 'bpm');
      assert.equal(metricLogs[0].source, 'self-reported');
      assert.equal(metricLogs[0].value, 62);
      for (const days of ['1', '30', '7']) await page.locator('#metric-trend-range').selectOption(days);
      assert.equal(await page.locator('#metric-trend-chart').evaluate(canvas => Chart.getChart(canvas).data.datasets[0].data.length), 1);
      await click('#heart-breathwork-tab');
      await visible('#heart-breathwork');
      assert.match(await page.locator('#heart-breathwork').innerText(), /coming in #289/);
      await click('#heart-vitals-tab');
      await visible('#metric-history');
      await shot('heart-rhr-history');
      await click('#heart-modal-close');
      await hidden('#heart-modal');
      // Persistence and accessible keyboard entry use the same chakra handler.
      await page.locator('#chakra-heart').focus();
      await page.keyboard.press('Enter');
      await visible('#heart-modal');
      assert.match(await page.locator('#metric-history').innerText(), /Synthetic resting reading/);
      await page.keyboard.press('Escape');
      await hidden('#heart-modal');
      assert.equal(await page.locator('#chakra-heart').evaluate(el => el === document.activeElement), true);
      console.log(`${name}: Heart hub logged canonical RHR, rendered trend/history, and retained reading after reopen`);
      const panels = await page.locator('.dashboard-panel').evaluateAll(els => els.map(el => el.id));
      assert.equal(panels.length, 4, 'Update coverage when dashboard panels change');
      // Enable the assistant UI; hosted responses below are local synthetic fixtures.
      await click('#aesculapius-right'); await click('#aes-settings-btn');
      assert.equal(await page.locator('#settings-metric-units').inputValue(), 'imperial');
      await page.locator('#settings-metric-units').selectOption('metric');
      assert.equal(await page.evaluate(() => localStorage.getItem('metricDisplayUnits')), 'metric');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).metricLogs[0].unit), 'bpm');
      assert.equal(await page.locator('#pinata-key-persist').isChecked(), false, 'Pinata JWT persistence is opt-in');
      assert.match(await page.locator('#settings-modal').innerText(), /pin-only permissions/i);
      assert.match(await page.locator('#pinata-key-section').innerText(), /sessionStorage/i);
      await click('label:has(#genie-enabled-toggle)');
      assert.equal(await page.locator('#genie-enabled-toggle').isChecked(), true);
      await click('#settings-modal-close');
      await page.evaluate(() => localStorage.setItem('genieApiKey', 'synthetic-smoke-key'));
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
        if (id === panels[0]) {
          const chat = `.genie-chat-window[data-panel="${id}"]`;
          async function ask() {
            await page.locator(`${chat} .genie-chat-input`).fill('Review my health today');
            await click(`${chat} .genie-chat-send`);
          }
          await ask();
          await visible('#genie-consent-dialog');
          assert.match(await page.locator('#genie-consent-dialog').innerText(), /GitHub Models/);
          assert.match(await page.locator('#genie-consent-dialog ul').innerText(), /Food \/ Diet Log/);
          assert.match(await page.locator('#genie-consent-dialog ul').innerText(), /Vitals & Body Metrics/);
          assert.equal(hostedRequests.length, 0, 'No hosted request before permission');
          await shot('genie-consent');
          await click('[data-consent-action="cancel"]');
          await hidden('#genie-consent-dialog');
          await page.locator(`${chat} .genie-chat-input`).waitFor({ state: 'visible' });
          await page.waitForFunction(selector => !document.querySelector(selector).disabled, `${chat} .genie-chat-input`);
          assert.equal(hostedRequests.length, 0, 'Cancel sends nothing');
          await ask();
          await visible('#genie-consent-dialog');
          await click('[data-consent-action="allow"]');
          await page.waitForFunction(selector => !document.querySelector(selector).disabled, `${chat} .genie-chat-input`);
          assert.equal(hostedRequests.length, 1);
          assert.match(JSON.stringify(hostedRequests[0].body), /Vitals & Body Metrics/);
          assert.match(JSON.stringify(hostedRequests[0].body), /Synthetic resting reading/);
          assert.match(await page.locator(`${chat} .genie-chat-messages`).innerText(), /Synthetic health response/);
          await ask();
          await page.waitForFunction(selector => !document.querySelector(selector).disabled, `${chat} .genie-chat-input`);
          assert.equal(hostedRequests.length, 2, 'Permission remembered for GitHub Models');
          await hidden('#genie-consent-dialog');
          await page.evaluate(async () => { const genie = await import('/js/genieChat.js'); genie.setGenieBackend('openai'); });
          await ask();
          await visible('#genie-consent-dialog');
          assert.match(await page.locator('#genie-consent-dialog').innerText(), /OpenAI/);
          await click('[data-consent-action="local"]');
          await page.waitForFunction(selector => !document.querySelector(selector).disabled, `${chat} .genie-chat-input`);
          assert.equal(await page.evaluate(() => localStorage.getItem('genieBackend')), 'webllm');
          assert.equal(hostedRequests.length, 2, 'Local alternative sends nothing to either hosted backend');
          covered.add('genie-consent-dialog');
        }
        await click(`.genie-chat-window[data-panel="${id}"] .genie-chat-close`);
        await hidden(`.genie-chat-window[data-panel="${id}"]`);
        await click(`[data-panel="${id}"].panel-toggle-btn`);
        await hidden(`#${id}`);
      }
      for (const [id, trigger, close] of [
        ['moon-modal', '#moon-icon'], ['water-modal', '#water-drop-empty'],
        ['emotion-modal', '#emotion-icon'], ['pain-log-modal', '#chakra-sacral'],
        ['chanting-modal', '#chakra-throat'],
        ['heart-modal', '#chakra-heart'],
        ['weight-modal', '#log-weight'], ['measurements-modal', '#log-measurements'],
        ['supplements-modal', '#log-supplements'], ['dietModal', '#dietBtn', '#closeDietModal'],
        ['correlation-graph-modal', '#graph-icon'], ['exercise-modal', '#log-exercise'],
        ['about-modal', '#app-title-name'],
      ]) await modal(id, trigger, close);
      await click('#graph-icon');
      await click('[data-series="metric:rhr"]');
      assert.equal(await page.locator('#correlationChart').evaluate(canvas => Chart.getChart(canvas).data.datasets.some(series => /Resting heart rate/.test(series.label) && series.data.some(point => point.y === 62))), true);
      await click('#correlation-graph-modal .modal-close');
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
      await click('#genie-revoke-consent');
      assert.match(await page.locator('#genie-consent-status').innerText(), /permissions reset/);
      assert.equal(await page.evaluate(() => localStorage.getItem('genieHostedConsent:v1:github-models')), null);
      assert.equal(await page.locator('input[name="genie-backend"][value="webllm"]').isChecked(), true);
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
      await page.evaluate(async () => {
        const genie = await import('/js/genieChat.js');
        const privacy = await import('/js/geniePrivacy.js');
        privacy.revokeGenieHostedConsent();
        genie.setGenieBackend('github-models');
      });
      await click('#yoga-genie-btn');
      const beforeYoga = hostedRequests.length;
      await page.locator('#yoga-genie-input').fill('How can I modify this pose?');
      await click('#yoga-genie-send');
      await visible('#genie-consent-dialog');
      assert.match(await page.locator('#genie-consent-dialog ul').innerText(), /Current yoga pose and breath cue/);
      assert.equal(hostedRequests.length, beforeYoga, 'Yoga context waits for hosted consent');
      await click('[data-consent-action="cancel"]');
      await page.waitForFunction(() => !document.getElementById('yoga-genie-input').disabled);
      assert.equal(hostedRequests.length, beforeYoga, 'Yoga Cancel sends nothing');
      await page.locator('#yoga-genie-input').fill('Try locally instead');
      await click('#yoga-genie-send');
      await visible('#genie-consent-dialog');
      await click('[data-consent-action="local"]');
      await page.waitForFunction(() => !document.getElementById('yoga-genie-input').disabled);
      assert.equal(hostedRequests.length, beforeYoga, 'Yoga local alternative sends nothing');
      assert.match(await page.locator('#yoga-genie-messages').innerText(), /Yoga Genie needs a hosted backend/);
      assert.equal(await page.evaluate(() => localStorage.getItem('genieBackend')), 'webllm');
      await click('#yoga-genie-chat-close');
      await click('#yoga-close-btn');
      if (await page.locator('#workout-set-list').isVisible()) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      await page.clock.pauseAt(new Date('2026-10-28T12:00:00Z'));
      // Earlier fixtures freeze Date with setFixedTime; elapsed timers need
      // Date to advance alongside the paused, manually stepped clock.
      await page.clock.setSystemTime(new Date('2026-10-28T12:00:00Z'));
      // Track the chanting callback itself: elapsed-time assertions alone cannot
      // detect an interval that keeps rendering a reset timer after close.
      await page.evaluate(() => {
        const set = window.setInterval, clear = window.clearInterval;
        window.__chantingTimers = { active: new Set(), calls: 0 };
        window.setInterval = (callback, delay, ...args) => {
          if (callback.name !== 'renderTimer') return set(callback, delay, ...args);
          const id = set(() => { window.__chantingTimers.calls++; callback(); }, delay, ...args);
          window.__chantingTimers.active.add(id); return id;
        };
        window.clearInterval = id => { window.__chantingTimers.active.delete(id); clear(id); };
      });
      const chantSessions = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).chantingSessions || []);
      const timerCount = () => page.evaluate(() => window.__chantingTimers.active.size);
      const callbackCount = () => page.evaluate(() => window.__chantingTimers.calls);
      const beforeChanting = (await chantSessions()).length;
      await click('#chakra-throat');
      await page.locator('#chanting-mantra').selectOption('__custom__');
      await page.locator('#chanting-custom').fill('Synthetic calm mantra');
      await click('#chanting-custom-add');
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('bignuten.chanting.customMantras.v1'))), ['Synthetic calm mantra']);
      await page.locator('#chanting-target').fill('0.1');
      await click('#chanting-start');
      assert.equal(await timerCount(), 1);
      await page.clock.fastForward(3_000);
      assert.equal(await page.locator('#chanting-timer').innerText(), '00:00:03');
      assert.equal(await page.locator('#chanting-ring').getAttribute('aria-valuenow'), '50');
      await click('#chanting-pause');
      assert.equal(await timerCount(), 0);
      await page.clock.fastForward(5_000);
      assert.equal(await page.locator('#chanting-timer').innerText(), '00:00:03');
      assert.equal(await page.locator('#chanting-pause').innerText(), 'Resume');
      await click('#chanting-pause');
      assert.equal(await timerCount(), 1);
      await page.clock.fastForward(3_000);
      await page.locator('#chanting-notes').fill('Synthetic resonance');
      await click('#chanting-complete');
      assert.equal(await timerCount(), 0);
      assert.equal(await page.locator('#chanting-ring').getAttribute('aria-valuenow'), '100');
      await click('#chanting-sensations [data-sensation="calm"]');
      let completedChants = await chantSessions();
      assert.equal(completedChants.length, beforeChanting + 1);
      assert.equal(completedChants.at(-1).mantra, 'Synthetic calm mantra');
      assert.equal(completedChants.at(-1).durationSeconds, 6, 'paused time is excluded');
      assert.equal(completedChants.at(-1).targetSeconds, 6);
      assert.equal(completedChants.at(-1).completedGoal, true);
      assert.equal(completedChants.at(-1).notes, 'Synthetic resonance');
      assert.deepEqual(completedChants.at(-1).sensations, ['calm'], 'post-session tags update the saved record');
      assert.match(await page.locator('#chanting-log').innerText(), /Synthetic resonance/);
      assert.match(await page.locator('#chanting-summary').innerText(), /00:00:06.*1 day streak/);
      const { 'chakra-throat': throatScore } = await page.evaluate(async () => (await import('/js/chakra.js')).computeChakraScores());
      assert.equal(throatScore, 1);
      let calls = await callbackCount();
      await page.clock.fastForward(12_000);
      assert.equal(await callbackCount(), calls, 'complete clears all chanting callbacks');
      assert.deepEqual(await chantSessions(), completedChants, 'completion cannot save twice');
      await click('#chanting-close');
      // All dismissal paths discard unfinished sessions and stop callbacks.
      for (const dismissal of ['close', 'cancel', 'escape', 'backdrop']) {
        await click('#chakra-throat');
        assert.equal(await page.locator('#chanting-mantra').inputValue(), 'Synthetic calm mantra');
        await click('#chanting-start');
        await page.clock.fastForward(2_000);
        if (dismissal === 'escape') await page.keyboard.press('Escape');
        else if (dismissal === 'backdrop') await page.locator('#chanting-modal').click({ position: { x: 2, y: 2 } });
        else await click(`#chanting-${dismissal}`);
        await hidden('#chanting-modal');
        assert.equal(await timerCount(), 0);
        calls = await callbackCount();
        await page.clock.fastForward(12_000);
        assert.equal(await callbackCount(), calls, `${dismissal} clears every pending callback`);
        assert.deepEqual(await chantSessions(), completedChants, `${dismissal} does not log an unfinished session`);
      }
      await click('#chakra-throat');
      await page.locator('#chanting-target').fill('');
      await click('#chanting-start');
      await page.clock.fastForward(2_000);
      await click('#chanting-complete');
      completedChants = await chantSessions();
      assert.equal(completedChants.at(-1).targetSeconds, 0, 'target duration is optional');
      assert.equal(completedChants.at(-1).completedGoal, false);
      assert.equal(await timerCount(), 0);
      await click('#chanting-close');
      console.log(`${name}: chanting custom mantra, ring, pause/resume, completion, post-session tags and all dismissal timers verified`);
      if (!(await page.locator('#workout-set-list').isVisible())) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      await page.locator('#work-duration').fill('1');
      await page.locator('#rest-duration').fill('1');
      await page.locator('.workout-set-item .workout-sets').fill('2');
      for (const input of await page.locator('.workout-set-item .set-reps').all()) await input.fill('6');
      for (const input of await page.locator('.workout-set-item .set-weight').all()) await input.fill('10');
      // Step each countdown tick without rendering every decorative animation frame.
      async function advanceWorkoutClock(seconds) {
        for (let second = 0; second < seconds; second++) await page.clock.fastForward(1_000);
      }
      const sessions = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).sessionLog || []);
      async function cancelCountdown(title) {
        assert.equal(await page.locator('#workout-current-title').innerText(), title);
        const beforeCancel = await sessions();
        await click('#cancel-workout-button');
        await hidden('#workout-timer-modal');
        const canceled = await sessions();
        assert.equal(canceled.length, beforeCancel.length + 1, 'Cancel records exactly one session');
        assert.equal(canceled.at(-1).completed, false, 'Canceled session is not completed');
        await advanceWorkoutClock(12);
        await hidden('#emotion-modal');
        await hidden('#workout-timer-modal');
        assert.deepEqual(await sessions(), canceled, 'No delayed workout completion after cancel');
        console.log(`${name}: canceled ${title} countdown stays canceled after 12s`);
      }
      await click('#start-workout-button');
      await visible('#workout-timer-modal');
      covered.add('workout-timer-modal');
      await cancelCountdown('Starting Soon');
      // Repeat through the work/rest transition to cover the second preparation timer.
      if (!(await page.locator('#workout-set-list').isVisible())) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      await click('#start-workout-button');
      await visible('#workout-timer-modal');
      await advanceWorkoutClock(11);
      assert.equal(await page.locator('#workout-current-title').innerText(), 'Exercise');
      page.once('dialog', dialog => dialog.accept());
      await advanceWorkoutClock(1);
      await page.waitForFunction(() => document.getElementById('workout-current-title').textContent === 'Rest');
      await advanceWorkoutClock(1);
      await cancelCountdown('Prepare');
      if (await page.locator('#workout-set-list').isVisible()) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      if (name === 'mobile') await modal('mobile-data-sheet', '#ipfsIcon', '#mobile-sheet-close-btn');
      await modal('ipfs-connect-dialog', '#aes-storage-btn', '#ipfs-dialog-close-btn', ['#aesculapius-right']);
      // A prepared storage-mode preference is a UI fixture, not a connected IPFS
      // provider. Exercise the snapshot viewer without uploading private data.
      await page.evaluate(() => localStorage.setItem('storageMode', 'ipfs'));
      await modal('ipfs-snapshot-panel', '#aes-storage-btn', '#snapshot-panel-close', ['#aesculapius-right']);
      await page.evaluate(async () => {
        localStorage.setItem('storageMode', 'json-only');
        const { setManualPinataToken } = await import('/js/ipfsStorage.js');
        setManualPinataToken('synthetic-disconnect-jwt', { persist: true });
        window.__smokeEmitWalletEvent('accountsChanged', []);
      });
      assert.equal(await page.evaluate(() => sessionStorage.getItem('bignuten.pinata.jwt.session')), null, 'Wallet disconnect clears the session JWT');
      assert.equal(await page.evaluate(() => localStorage.getItem('bignuten.pinata.jwt.persisted')), null, 'Wallet disconnect clears explicitly persisted JWTs too');
      const exclusions = new Map([
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
