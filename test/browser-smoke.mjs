// Adapted from DecentHead 426ccb7 test/browser-smoke.mjs (Apache-2.0), with
// EIP-1193/route fixtures adapted from DecentMarket 234d1e2 (Apache-2.0).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Interface, ZeroAddress } from 'ethers';
import { BASE_SUPPORTER } from '../js/supporterToken.mjs';
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
  try { const content = await readFile(path); res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); res.end(content); }
  catch { res.writeHead(404).end('Not found'); }
});
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.BASE_URL || `http://127.0.0.1:${server.address().port}`;
const origin = new URL(base).origin;

// Encode synthetic chain reads/writes using real ABIs, not an ethers stub.
// All wallet/RPC calls are local fixtures; no real transactions or funds exist.
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
// Read-only synthetic wallet; invitation decisions are fixture-owned.
// There is no real wallet, signature, key, or external RPC behind this provider.
const wallet = '0x' + '12'.repeat(20);
let activeWallet = wallet;
const walletCalls = [];
let walletGranted = false;
// Synthetic reviewed listing: never a real deployed BigNuten token or listing.
const reviewedSupporter = {
  contract: BASE_SUPPORTER.nftAddress, tokenId: '406', listingId: '42',
  paymentToken: BASE_SUPPORTER.usdcAddress, expectedPriceAmount: '10000000',
  metadataUri: 'ipfs://synthetic-metadata', imageUri: 'ipfs://synthetic-art',
};
let supporterFixture = null;
const supporterRequests = [], supporterTransactions = new Map();
function supporterRpc({ method, params = [] }) {
  if (!supporterFixture) return undefined;
  supporterRequests.push({ method, params });
  const blockHash = '0x' + 'ab'.repeat(32);
  if (method === 'eth_chainId') return supporterFixture.chain;
  if (method === 'wallet_switchEthereumChain') {
    assert.equal(params[0].chainId, '0x2105');
    if (supporterFixture.reject) return { __smokeError: 4001, message: 'Synthetic wallet rejection' };
    supporterFixture.chain = params[0].chainId; return null;
  }
  if (method === 'eth_call') {
    const entry = functions.get(params[0].data?.slice(0, 10));
    if (entry?.fragment.name === 'getListing') {
      assert.equal(params[0].to.toLowerCase(), BASE_SUPPORTER.escrowAddress.toLowerCase());
      assert.equal(entry.iface.decodeFunctionData(entry.fragment, params[0].data)[0], 42n);
      return entry.iface.encodeFunctionResult(entry.fragment, [[reviewedSupporter.contract,
        supporterFixture.mismatch ? 999n : 406n, 0n, reviewedSupporter.paymentToken, 10000000n,
        supporterFixture.soldOut ? 0n : 3n, true, 'Synthetic fixture']]);
    }
    if (entry?.fragment.name === 'getNFTBalance') return entry.iface.encodeFunctionResult(entry.fragment, [3n]);
    if (entry?.fragment.name === 'allowance') return entry.iface.encodeFunctionResult(entry.fragment, [0n]);
  }
  if (method === 'eth_estimateGas') return '0x30000';
  if (method === 'eth_sendTransaction') {
    const hash = '0x' + (supporterTransactions.size + 1).toString(16).padStart(64, '0');
    const tx = params[0];
    supporterTransactions.set(hash, { hash, from: wallet, to: tx.to, input: tx.data, value: '0x0',
      gas: '0x30000', gasPrice: '0x1', nonce: '0x0', type: '0x0', chainId: '0x2105',
      blockHash, blockNumber: '0x100', transactionIndex: '0x0', v: '0x1b', r: '0x1', s: '0x1' });
    return hash;
  }
  if (method === 'eth_getTransactionByHash') return supporterTransactions.get(params[0]) || null;
  if (method === 'eth_getTransactionReceipt') {
    const tx = supporterTransactions.get(params[0]);
    return tx ? { transactionHash: tx.hash, from: tx.from, to: tx.to, blockHash,
      blockNumber: '0x100', transactionIndex: '0x0', contractAddress: null, logs: [],
      logsBloom: '0x' + '00'.repeat(256), cumulativeGasUsed: '0x30000', gasUsed: '0x30000',
      effectiveGasPrice: '0x1', status: '0x1', type: '0x0' } : null;
  }
  return undefined;
}
async function rpc({ method, params = [] }) {
  walletCalls.push(method);
  const supporterResult = supporterRpc({ method, params });
  if (supporterResult !== undefined) return supporterResult;
  switch (method) {
    case 'eth_accounts': return walletGranted ? [activeWallet] : [];
    case 'eth_requestAccounts': walletGranted = true; return [activeWallet];
    case 'eth_chainId': return '0x2105';
    case 'net_version': return '8453';
    case 'eth_blockNumber': return '0x100';
    case 'eth_getBalance': case 'eth_getTransactionCount': case 'eth_gasPrice': return '0x0';
    case 'eth_getCode': return '0x01';
    case 'eth_getLogs': return [];
    case 'wallet_switchEthereumChain': case 'wallet_addEthereumChain': return null;
    case 'personal_sign': return '0x' + '11'.repeat(65); // UI-only signature; service tests verify real ephemeral signatures.
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
const allowedErrors = [{
  issue: '#394: deliberate uninvited-wallet challenge rejection',
  match: /^console: Failed to load resource:.*403.*"url":"https:\/\/bignuten-nutrition\.onrender\.com\/challenge"/,
}, {
  issue: '#390: deliberate nutrition provider failure with reported usage',
  match: /^console: Failed to load resource:.*502.*"url":"https:\/\/nutrition\.fixture\/lookup"/,
}];
let browser;
async function profileContinuityTabs(viewport, name) {
  const context = await browser.newContext({ viewport, locale: 'en-US', serviceWorkers: 'block' });
  await context.addInitScript(() => localStorage.setItem('legacyContinuitySeed', 'synthetic-legacy-profile'));
  const walletA = '0x' + 'a1'.repeat(20), walletB = '0x' + 'b2'.repeat(20);
  const first = await context.newPage(), second = await context.newPage();
  try {
    await first.goto(`${base}/test/profile-continuity-harness.html?wallet=${walletA}`);
    await first.waitForFunction(() => window.profileHarness?.status === 'writer');
    await second.goto(`${base}/test/profile-continuity-harness.html?wallet=${walletB}`);
    await second.waitForFunction(() => window.profileHarness?.status === 'writer');
    await first.evaluate(() => window.profileHarness.write('fitnessTrackerData', JSON.stringify({ weight: 150, emotion: 'synthetic' })));
    assert.equal(await second.evaluate(() => window.profileHarness.read('fitnessTrackerData')), null, 'different wallets do not share local health data');
    await second.evaluate(() => window.profileHarness.write('fitnessTrackerData', 'wallet-b-only'));
    assert.equal(await first.evaluate(() => window.profileHarness.read('fitnessTrackerData')), JSON.stringify({ weight: 150, emotion: 'synthetic' }));
    assert.equal(await first.evaluate(() => window.profileHarness.readGuest('legacyContinuitySeed')), 'synthetic-legacy-profile', 'legacy data is preserved under the guest profile');
    assert.equal(await first.evaluate(() => window.profileHarness.readLegacy('legacyContinuitySeed')), 'synthetic-legacy-profile', 'migration never deletes the unnamespaced original');

    await second.evaluate(id => window.profileHarness.switchProfile(id), `wallet-${walletA.toLowerCase()}`);
    await second.waitForFunction(() => window.profileHarness?.status === 'readonly');
    assert.equal(await second.evaluate(() => window.profileHarness.read('fitnessTrackerData')), JSON.stringify({ weight: 150, emotion: 'synthetic' }));
    await first.evaluate(() => { window.profileHarnessApprove = true; });
    const takeover = second.evaluate(() => window.profileHarness.takeOver({ timeoutMs: 3000, pollMs: 10 }));
    assert.equal(await takeover, true, 'explicit takeover obtains the writer lock');
    await first.waitForFunction(() => window.profileHarness.status === 'readonly');
    assert.equal(await first.evaluate(() => { try { window.profileHarness.write('fitnessTrackerData', 'stale overwrite'); return 'wrote'; } catch (error) { return error.code; } }), 'PROFILE_READ_ONLY', 'stale writer cannot overwrite after takeover');
    await second.evaluate(() => window.profileHarness.write('fitnessTrackerData', 'wallet-a-after-takeover'));
    assert.equal(await second.evaluate(() => window.profileHarness.read('fitnessTrackerData')), 'wallet-a-after-takeover');
    console.log(`${name}: wallet isolation, legacy-copy preservation and fenced tab takeover passed`);
  } finally {
    await context.close();
  }
}
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const name = viewport.width === 390 ? 'mobile' : 'desktop';
    await profileContinuityTabs(viewport, name);
    walletCalls.length = 0;
    walletGranted = false;
    activeWallet = wallet;
    const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const restoredSnapshot = {
      dataVersion: 1,
      waterDailyHistory: { '2026-10-28': 4, '2026-10-27': 2 },
      weightLogs: [{ weight: 178, timestamp: '2026-10-28T10:00:00Z' }],
      foods: [{ name: 'Synthetic restore meal', amount: 1, unit: 'serving', date: '2026-10-28', nutr: { calories: 246, protein: 12 } }],
      supplements: [{ name: 'Synthetic restore supplement', weight: 10, date: '2026-10-28', time: '10:00' }],
      exercises: { types: ['Push-ups'], entries: [{ type: 'Push-ups', timestamp: '2026-10-28T10:00:00Z', sets: [{ reps: 8, weight: 10 }] }] },
      sessionLog: [{ id: 'synthetic-legacy-workout', date: '2026-10-27' }],
      measurements: [{ type: 'Bicep', measurement: '12', date: '2026-10-28', time: '10:00' }],
      painLogs: [{ bodyArea: 'Synthetic restore area', severity: 2, timestamp: '2026-10-28T10:00:00Z' }],
      emotions: [{ emotion: 'Joy', context: 'manual', timestamp: '2026-10-28T10:00:00Z' }],
    };
    const page = await context.newPage();
    // Software-rendered canvas plus screenshot capture is slower on CI CPUs.
    page.setDefaultTimeout(30_000);
    await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') });
    await page.clock.setSystemTime(new Date('2026-10-28T12:00:00Z'));
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
        request: async args => {
          const result = await window.__smokeRpc(args);
          if (result?.__smokeError) throw Object.assign(new Error(result.message), { code: result.__smokeError });
          return result;
        },
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
    const hostedRequests = [], autoLookups = [], researchRequests = [];
    let deniedChallenges = 0;
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin && url.pathname.endsWith('/js/supporter-token.json') && supporterFixture) {
        return route.fulfill({ json: reviewedSupporter });
      }
      if (url.origin === origin) return route.continue();
      external.add(request.url());
      if (libraries.has(request.url())) return route.fulfill({ contentType: 'text/javascript', body: await readFile(resolve(root, libraries.get(request.url()))) });
      if (url.hostname === 'bignuten-nutrition.onrender.com') {
        const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        const body = request.method() === 'POST' ? request.postDataJSON() : null;
        if (url.pathname === '/challenge') {
          assert.deepEqual(Object.keys(body).sort(), ['address', 'chainId']);
          if (body.address !== wallet) {
            deniedChallenges++;
            return route.fulfill({ status: 403, headers, json: { error: 'Genie access is not enabled for this wallet. Manual tracking remains available.' } });
          }
          return route.fulfill({ headers, json: { nonce: 'b'.repeat(64),
            message: `${new URL(origin).host} wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to BigNuten Genie access only. No transaction, payment or token approval.\n\nURI: ${origin}/\n` } });
        }
        if (url.pathname === '/session') return route.fulfill({ headers, json: request.method() === 'DELETE' ? { cleared: true }
          : { token: 'a'.repeat(64), wallet, expiresAt: await page.evaluate(() => Date.now()) + 900000 } });
        if (url.pathname === '/usage') return route.fulfill({ headers, json: { calls: hostedRequests.length, inputTokens: 10, outputTokens: 20 } });
        if (url.pathname === '/foods') return route.fulfill({ headers, json: { found: false } });
        if (url.pathname === '/lookup') {
          autoLookups.push(body);
          return route.fulfill({ headers, json: { found: false, reason: 'Synthetic hosted fixture has no card.', usage: { calls: 0, inputTokens: 0, outputTokens: 0 } } });
        }
        if (url.pathname === '/research/oembed') {
          assert.deepEqual(Object.keys(body).sort(), ['consent', 'videoId']);
          assert.equal(body.consent, true);
          researchRequests.push({ path: url.pathname, body });
          return route.fulfill({ headers, json: { title: `Synthetic YouTube ${body.videoId}`, thumbnailUrl: `https://i.ytimg.com/vi/${body.videoId}/hqdefault.jpg`, usage: { calls: researchRequests.length, inputTokens: 0, outputTokens: 0 } } });
        }
        if (url.pathname === '/research/captions') {
          assert.deepEqual(Object.keys(body).sort(), ['consent', 'videoId']);
          assert.equal(body.consent, true);
          researchRequests.push({ path: url.pathname, body });
          return route.fulfill({ headers, json: { transcript: 'Synthetic captions about a gentle sleep routine.', source: 'youtube-captions', language: 'en', usage: { calls: researchRequests.length, inputTokens: 0, outputTokens: 0 } } });
        }
        if (url.pathname === '/research/protocol') {
          assert.deepEqual(Object.keys(body).sort(), ['consent', 'metrics', 'title', 'transcript']);
          assert.equal(body.consent, true);
          assert.match(body.transcript, /Synthetic pasted transcript/);
          assert.ok(body.metrics.some(metric => metric.id === 'sleep'));
          researchRequests.push({ path: url.pathname, body });
          return route.fulfill({ headers, json: { protocol: { title: 'Synthetic sleep routine', summary: 'A consistent wind-down routine to observe.', rationale: 'Track sleep without treating short-term change as proof.', durationDays: 7, baselineDays: 3,
            actions: [{ action: 'Use a comfortable wind-down routine', dose: 'Optional; no supplements', timing: 'Before bed' }],
            targetMetrics: [{ metricId: 'sleep', metricLabel: 'Sleep duration', direction: 'observe' }], clinicianReviewRequired: false, clinicianReviewReason: '' },
            usage: { calls: researchRequests.length, inputTokens: 25, outputTokens: 18 } } });
        }
        assert.equal(url.pathname, '/assistant', 'Every private Genie route needs an explicit fixture');
        assert.deepEqual(Object.keys(body).sort(), ['assistant', 'consent', 'messages']);
        assert.equal(body.consent, true);
        hostedRequests.push({ hostname: url.hostname, body });
        return route.fulfill({ headers, json: { answer: body.assistant === 'yoga' ? 'Synthetic yoga response' : 'Synthetic health response', usage: { calls: hostedRequests.length, inputTokens: 10, outputTokens: 20 } } });
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
          const card = page.locator('#about-supporter-token');
          await page.waitForFunction(() => document.querySelector('#about-supporter-token').dataset.supporterState === 'coming-soon');
          assert.match(await card.innerText(), /BigNuten Supporter Token coming soon on Base/);
          assert.equal(await card.locator('[data-supporter-stamp]').isVisible(), true);
          assert.equal(await card.locator('[data-supporter-buy]').isDisabled(), true);
          const txCount = walletCalls.filter(method => method === 'eth_sendTransaction').length;
          await card.locator('[data-supporter-buy]').evaluate(button => button.click());
          assert.equal(walletCalls.filter(method => method === 'eth_sendTransaction').length, txCount, 'Unset config never requests a transaction');
          assert.doesNotMatch(await page.locator('body').innerText(), new RegExp(['arti', 'zen'].join(''), 'i'));
          if (trigger === '#app-title-name') {
            for (const scenario of ['mismatch', 'soldOut', 'reject', 'matching']) {
              supporterFixture = { chain: '0x1', [scenario]: true };
              supporterRequests.length = 0;
              supporterTransactions.clear();
              await click('#about-modal .modal-close');
              await click('#app-title-name');
              const expected = scenario === 'mismatch' ? 'failed' : scenario === 'soldOut' ? 'sold-out' : 'ready';
              await page.waitForFunction(expected => document.querySelector('#about-supporter-token').dataset.supporterState === expected, expected);
              assert.equal(await card.locator('[data-supporter-stamp]').isVisible(), false);
              if (scenario === 'mismatch' || scenario === 'soldOut') {
                assert.equal(await card.locator('[data-supporter-buy]').isDisabled(), true);
                assert.equal(supporterTransactions.size, 0);
              } else {
                assert.match(await card.locator('[data-supporter-terms]').innerText(), /10\.0 USDC on Base · 3 remaining/);
                await card.locator('[data-supporter-buy]').click();
                await page.waitForFunction(expected => document.querySelector('#about-supporter-token').dataset.supporterState === expected,
                  scenario === 'reject' ? 'user-rejected' : 'success');
                if (scenario === 'reject') assert.equal(supporterTransactions.size, 0);
                else {
                  const switched = supporterRequests.findIndex(request => request.method === 'wallet_switchEthereumChain');
                  const sent = supporterRequests.flatMap((request, index) => request.method === 'eth_sendTransaction' ? [{ ...request, index }] : []);
                  assert.equal(supporterRequests[switched].params[0].chainId, '0x2105');
                  assert.equal(sent.length, 2, 'Exactly approval then purchase');
                  assert.ok(switched < sent[0].index);
                  const approve = functions.get(sent[0].params[0].data.slice(0, 10));
                  assert.equal(approve.fragment.name, 'approve');
                  assert.equal(sent[0].params[0].to.toLowerCase(), reviewedSupporter.paymentToken.toLowerCase());
                  const approvalArgs = approve.iface.decodeFunctionData(approve.fragment, sent[0].params[0].data);
                  assert.equal(approvalArgs[0].toLowerCase(), BASE_SUPPORTER.escrowAddress.toLowerCase());
                  assert.equal(approvalArgs[1], 10000000n);
                  const purchase = functions.get(sent[1].params[0].data.slice(0, 10));
                  assert.equal(purchase.fragment.name, 'purchaseWithToken');
                  assert.equal(sent[1].params[0].to.toLowerCase(), BASE_SUPPORTER.escrowAddress.toLowerCase());
                  assert.deepEqual([...purchase.iface.decodeFunctionData(purchase.fragment, sent[1].params[0].data)], [42n, 1n]);
                  assert.match(await card.locator('[data-supporter-status] a').getAttribute('href'), /^https:\/\/basescan\.org\/tx\/0x[0-9a-f]{64}$/);
                }
              }
            }
            supporterFixture = null;
            await click('#about-modal .modal-close');
            await click('#app-title-name');
            await page.waitForFunction(() => document.querySelector('#about-supporter-token').dataset.supporterState === 'coming-soon');
            console.log(`${name}: Supporter coming-soon, mismatch, sold-out, rejection, and Base USDC purchase fixtures passed`);
          }
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
      if (process.env.SUPPORTER_ONLY === '1') {
        await modal('about-modal', '#app-title-name');
        assert.deepEqual(unexpected, [], 'Supporter fixtures never reach an unmocked external endpoint');
        assert.deepEqual(failed, [], 'Supporter fixture network requests succeed');
        continue;
      }
      await visible('#dietBtn');
      assert.equal(await page.locator('.genie-icon-btn').count(), 0, 'Guest has health controls, not Genie icons');
      assert.equal(await page.locator('#yoga-genie-btn').isVisible(), false);
      assert.equal(await page.locator('#dietNutritionGenie').isVisible(), false);
      assert.equal(await page.locator('#genie-api-key-input').count(), 0, 'No browser AI-key entry is offered');
      await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('fitnessTrackerData'));
        data.weightLogs.push({ weight: 149, timestamp: '2026-10-27T10:00:00Z' });
        data.emotions.push({ emotion: 'Synthetic calm', context: 'continuity smoke', timestamp: '2026-10-27T10:01:00Z' });
        data.waterDailyHistory['2026-10-27'] = 2;
        localStorage.setItem('fitnessTrackerData', JSON.stringify(data));
      });
      await click('#wallet-connect');
      await page.waitForFunction(() => document.getElementById('wallet-connect')?.dataset.walletState === 'connected');
      await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
      assert.equal(await page.locator('#wallet-connect').getAttribute('data-wallet-address'), wallet);
      await page.waitForFunction(() => document.getElementById('assistant-access-status').textContent.includes('available for this wallet'));
      if (name === 'desktop') {
        await page.waitForTimeout(150);
        if (await page.locator('#ipfs-edu-overlay').isVisible()) {
          await click('#ipfs-edu-skip-btn');
          await hidden('#ipfs-edu-overlay');
        }
      }
      await click('#aesculapius-right');
      await click('#aes-settings-btn');
      await page.waitForFunction(() => {
        const button = document.getElementById('bn-profile-copy-guest');
        return button && !button.hidden && document.getElementById('bn-profile-state').textContent === 'Editing here';
      });
      await page.locator('#bn-profile-details').evaluate(element => { element.open = true; });
      page.once('dialog', dialog => dialog.accept());
      await click('#bn-profile-copy-guest');
      await page.waitForFunction(() => document.getElementById('bn-profile-state').textContent.includes('Copied'));
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).emotions.some(entry => entry.emotion === 'Synthetic calm')), true, 'explicit guest copy retains synthetic health records in wallet profile');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bignutenProfileCopyBackups.v1')).length), 1, 'source and destination bytes were backed up before merging');
      await page.locator('#bn-profile-details').evaluate(element => { element.open = false; });
      await click('#assistant-access-check');
      await page.waitForFunction(() => document.getElementById('assistant-access-status').textContent.startsWith('Signed in'));
      await click('#settings-modal-close');
      for (const selector of ['#body-figure-wrapper', '#water-tracker', 'footer', '#wallet-connect', '#chakra-aura-canvas', '.chakra-icon']) await visible(selector);
      assert.equal(await page.evaluate(() => window.ethereum.request({ method: 'eth_chainId' })), '0x2105');
      assert.ok(await page.locator('#chakra-aura-canvas').evaluate(canvas => canvas.width > 0 && canvas.height > 0), 'Aura canvas has drawing dimensions');
      await shot('dashboard');
      await visible('#measurement-reminder');
      await click('#measurement-reminder-dismiss');
      await hidden('#measurement-reminder');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).measurementReminderDismissedOn), '2026-10-28');
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
        assert.match(await page.locator('#dietAllTimeLog').textContent(), /time not recorded/, 'Legacy food times remain visibly unrecorded');
        assert.match(await page.locator('#dv-card-content .dv-row').filter({ has: page.locator('[data-nutr-key="calories"]') }).textContent(), /246 \/ 2,000 kcal/);
        assert.match(await page.locator('#pain-log-list').textContent(), /Synthetic restore area/);
        assert.equal(await page.locator('#feelings-analytics .ew-analytics-empty').count(), 0);
        assert.equal(await page.evaluate(() => Chart.getChart(document.getElementById('measurement-chart')).data.datasets[0].data[0].y), 12);
        assert.equal(await page.evaluate(() => Chart.getChart(document.getElementById('correlationChart')).data.datasets.find(dataset => dataset.label.includes('Water')).data.at(-1).y), 4, `${source}: open water trend refreshed`);
        await shot(`${source}-restored-dashboard`);
        console.log(`${name}: ${source} restore repopulated water, weight, food/nutrition, supplements, exercises, measurements, pain and feelings without reload`);
      }
      await click('#correlation-graph-modal .modal-close');
      await click('#gut-health-open');
      await visible('#gut-health-modal');
      assert.match(await page.locator('.gut-health-notice').innerText(), /not diagnosis/i);
      await page.locator('#gut-session-challenge').fill('Synthetic smoke session');
      await page.locator('#gut-session-start').fill('2026-10-28T10:00');
      const mealValue = await page.locator('#gut-meal-link option').filter({ hasText: 'Synthetic restore meal' }).getAttribute('value');
      assert.ok(mealValue, 'Existing diet entry is available as an optional reference');
      await page.locator('#gut-meal-link').selectOption(mealValue);
      await page.locator('#gut-session-form button[type="submit"]').click();
      assert.match(await page.locator('#gut-health-status').innerText(), /session saved/i);
      assert.ok(await page.locator('#gut-session-picker').inputValue(), `Newly created session remains selected; options=${await page.locator('#gut-session-picker').innerText()} state=${JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).gutHealth))}`);
      await page.locator('#gut-reading-time').fill('2026-10-28T10:00');
      await page.locator('#gut-reading-phase').selectOption('baseline');
      await page.locator('#gut-hydrogen').fill('4');
      await page.locator('#gut-hydrogen-scale').fill('ppm');
      await page.locator('#gut-reading-source').fill('FoodMarble AIRE 2 (manual)');
      await page.locator('#gut-reading-form button[type="submit"]').click();
      assert.match(await page.locator('#gut-health-status').innerText(), /Breath reading saved/i, 'Baseline submit status');
      await page.locator('#gut-reading-time').fill('2026-10-28T10:30');
      await page.locator('#gut-reading-phase').selectOption('after-challenge');
      await page.locator('#gut-hydrogen').fill('18');
      await page.locator('#gut-hydrogen-scale').fill('ppm');
      await page.locator('#gut-methane').fill('3');
      await page.locator('#gut-methane-scale').fill('FoodMarble AIRE 2 score');
      await page.locator('#gut-reading-source').fill('FoodMarble AIRE 2 (manual)');
      await page.locator('#gut-reading-form button[type="submit"]').click();
      await page.locator('#gut-symptom-session').selectOption(await page.locator('#gut-session-picker').inputValue());
      await page.locator('#gut-symptom-type').selectOption('Bloating');
      await page.locator('#gut-symptom-intensity').fill('4');
      await page.locator('#gut-symptom-form button[type="submit"]').click();
      assert.match(await page.locator('#gut-session-history').innerText(), /Hydrogen|hydrogen/);
      assert.match(await page.locator('#gut-session-history').innerText(), /linked diet log: Synthetic restore meal/);
      assert.match(await page.locator('#gut-symptom-history').innerText(), /Bloating 4\/10/);
      assert.equal(await page.locator('#gut-health-chart circle').count(), 1, 'Same-scale hydrogen session renders a chart point');
      assert.match(await page.locator('#gut-trend-summary').innerText(), /rise \+14 ppm/);
      const baselineEdit = page.locator('#gut-session-history button[aria-label^="Edit breath reading"]').last();
      await baselineEdit.click();
      await page.locator('#gut-hydrogen').fill('5');
      await page.locator('#gut-reading-form button[type="submit"]').click();
      assert.match(await page.locator('#gut-trend-summary').innerText(), /rise \+13 ppm/, 'Corrected baseline updates the same-scale chart');
      const storedGut = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).gutHealth);
      assert.equal(storedGut.sessions[0].readings.length, 2);
      assert.equal(storedGut.sessions[0].readings.find(reading => reading.phase === 'baseline').hydrogen.value, 5);
      assert.equal(storedGut.sessions[0].mealContext.name, 'Synthetic restore meal');
      assert.equal(storedGut.symptoms[0].sessionId, storedGut.sessions[0].id);
      await shot(`${name}-gut-health-tracker`);
      await click('#gut-health-modal-close');
      await hidden('#gut-health-modal');
      covered.add('gut-health-modal');
      console.log(`${name}: manually logged gut session, breath trend, meal reference and symptom`);
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
      await page.locator('#rawFoodCalories').fill('40');
      await page.locator('#rawFoodTime').fill('10:15');
      await click('#rawFoodForm button[type="submit"]');
      await hidden('#rawFoodModal');
      await visible('#dietModal');
      assert.match(await page.locator('#dietAllTimeLog').innerText(), /Smoke carrot/);
      const food = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).foods.find(food => food.name === 'Smoke carrot'));
      assert.equal(food.type, 'diet'); assert.equal(food.amount, 0.5); assert.equal(food.unit, 'cup');
      assert.deepEqual(food.nutr, { protein: 1.2, calories: 40 });
      assert.equal(food.time, '10:15');
      await page.locator('#dietFoodName').fill('Smoke oats');
      await page.locator('#dietFoodAmount').fill('1');
      await page.locator('#dietFoodUnit').selectOption('serving');
      await page.locator('#dietFoodTime').fill('11:30');
      await page.locator('#dietNutrCalories').fill('90');
      await click('#dietForm button[type="submit"]');
      assert.match(await page.locator('#diet-today-calories').innerText(), /376 kcal · 3 of 3 entries have calories/);
      const timelineText = await page.locator('#diet-meal-timeline').innerText();
      assert.match(timelineText, /10:15/); assert.match(timelineText, /Smoke carrot/);
      assert.match(timelineText, /11:30/); assert.match(timelineText, /Smoke oats/);
      const editableTime = page.locator('#dietAllTimeLog .diet-log-entry').filter({ hasText: 'Smoke oats' }).locator('.diet-log-time');
      await editableTime.fill('11:45');
      await editableTime.dispatchEvent('change');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).foods.find(food => food.name === 'Smoke oats').time), '11:45');
      await page.locator('#dietFoodName').fill('Synthetic Genie oats');
      await page.locator('#dietFoodAmount').fill('50');
      await page.locator('#dietFoodUnit').selectOption('g');
      await page.locator('#dietFoodTime').fill('12:15');
      const beforeNutrition = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).foods.length);
      assert.equal(await page.locator('#nutritionLookupDialog').count(), 0, 'No extra nutrition review modal');
      await page.locator('#nutritionLookupInline > details > summary').click();
      assert.equal(await page.locator('#nutritionServiceUrl').inputValue(), 'https://bignuten-nutrition.onrender.com', 'Published default uses the separate nutrition service');
      await page.locator('#dietFoodAmount').fill('100');
      await page.locator('#dietNutrCalories').fill('389');
      await page.locator('#dietNutrProtein').fill('16.9');
      await click('#nutritionKeep');
      await page.locator('#dietFoodAmount').fill('50');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '195');
      assert.equal(await page.locator('#dietNutrProtein').inputValue(), '8.5');
      assert.equal(await page.locator('#dietFoodAmount').inputValue(), '50');
      assert.equal(await page.locator('#dietFoodTime').inputValue(), '12:15');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).foods.length), beforeNutrition);
      await page.locator('#dietFoodAmount').fill('100');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '389');
      await page.locator('#dietFoodUnit').selectOption('ml');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '');
      assert.match(await page.locator('#dietNutritionStatus').innerText(), /Cannot scale/);
      await page.locator('#dietFoodUnit').selectOption('g');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '389');
      await page.locator('#dietFoodAmount').fill('1');
      await page.locator('#dietFoodUnit').selectOption('cup');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '');
      assert.equal(await page.locator('#nutritionPortionEditor').isVisible(), true);
      await page.locator('#nutritionPortionAmount').fill('80');
      await click('#nutritionApplyPortion');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '311');
      await page.locator('#dietFoodAmount').fill('0.5');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '156');
      await page.locator('#dietFoodAmount').fill('2');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '622');
      await page.locator('#dietFoodUnit').selectOption('serving');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '778');
      assert.match(await page.locator('#dietFoodUnit option:checked').innerText(), /100 g/);
      await click('#nutritionAdjustPortion');
      await page.locator('#nutritionPortionAmount').fill('30');
      await click('#nutritionApplyPortion');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '233');
      await click('#nutritionKeep');
      await page.locator('#dietFoodAmount').fill('100');
      await page.locator('#dietFoodUnit').selectOption('g');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '389', 'Portion edits never replace the unrounded nutrient base');
      await page.locator('#dietNutrCalories').fill('400');
      await click('#dietForm button[type="submit"]');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).nutritionDefaults[0].nutr.calories), 389, 'One-off logging cannot replace approved defaults');
      await page.locator('#dietFoodName').fill('Synthetic Genie oats');
      await page.locator('#dietFoodAmount').fill('50');
      await page.locator('#dietFoodUnit').selectOption('g');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '195');
      await page.locator('#dietFoodAmount').fill('0.5');
      await page.locator('#dietFoodUnit').selectOption('cup');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '156', 'Saved food-specific portion survives form reset and default prefill');
      await page.locator('#dietFoodAmount').fill('50');
      await page.locator('#dietFoodUnit').selectOption('g');
      await shot('genie-nutrition-prefill');
      const nutritionRequests = [];
      let sharedFixture = null;
      await page.route('https://nutrition.fixture/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const body = route.request().postDataJSON();
        nutritionRequests.push({ path, body });
        if (path === '/challenge') return route.fulfill({ json: { nonce: 'synthetic', accessMode: 'address-only', message: `${wallet}\nSign in to BigNuten Genie access only. No transaction, payment or token approval.\nURI: ${origin}/\n` } });
        if (path === '/session') return route.fulfill({ json: { token: 'a'.repeat(64), wallet: wallet.toLowerCase(), expiresAt: await page.evaluate(() => Date.now()) + 900000 } });
        if (path === '/foods') {
          return route.fulfill({ json: sharedFixture && body.input.name === sharedFixture.name
            ? { found: true, cached: true, card: sharedFixture } : { found: false } });
        }
        assert.equal(path, '/lookup');
        assert.deepEqual(Object.keys(body).sort(), body.portionUnit ? ['consent', 'input', 'portionUnit'] : ['consent', 'input']);
        assert.ok(!JSON.stringify(body).includes('Synthetic restore meal'));
        if (body.input.name === 'Pasta') {
          return route.fulfill({ status: 502, json: { error: 'Synthetic extraction failure. No card was applied.',
            usage: { calls: 3, inputTokens: 25, outputTokens: 30 } } });
        }
        sharedFixture = { ...body.input, amount: 100, unit: 'g', serving: '', ingredients: 'Synthetic oats',
            measures: [{ amount: 1, unit: 'cup', baseAmount: 140, sourceUrl: 'https://example.com/synthetic-label' },
              { amount: 1, unit: 'serving', baseAmount: 80, sourceUrl: 'https://example.com/synthetic-label' }],
            nutr: { calories: 389, protein: 16.9 }, quality: 'source-backed',
            retrievedAt: '2026-10-28T12:00:00Z', note: 'Synthetic fixture',
            sources: [{ url: 'https://example.com/synthetic-label', title: 'Synthetic label source' }] };
        return route.fulfill({ json: { found: true, reason: 'Synthetic exact product match; review label.',
          usage: { calls: 2, inputTokens: 10, outputTokens: 20 }, card: sharedFixture } });
      });
      await page.locator('#nutritionLookupInline details details > summary').click();
      await page.locator('#nutritionServiceUrl').fill('https://nutrition.fixture');
      await click('#nutritionSaveService');
      await page.waitForFunction(() => !document.getElementById('dietNutritionGenie').hidden);
      assert.equal(await page.locator('#nutritionServiceUrl').inputValue(), 'https://nutrition.fixture');
      await page.locator('#nutritionKind').selectOption('packaged');
      await page.locator('#nutritionBrand').fill('Synthetic brand');
      await page.locator('#nutritionMarket').fill('US');
      const signatureCount = walletCalls.filter(method => method === 'personal_sign').length;
      await click('#dietNutritionGenie');
      await page.waitForFunction(() => document.getElementById('nutritionLookupStatus').textContent.startsWith('Filled by Genie (source-backed)'));
      assert.equal(nutritionRequests.filter(request => request.path === '/lookup').length, 1);
      assert.equal(walletCalls.filter(method => method === 'personal_sign').length, signatureCount, 'Address-only mode never signs');
      assert.equal(await page.locator('#nutritionConsent').count(), 0);
      assert.equal(await page.locator('#nutritionSignIn').count(), 0);
      assert.match(await page.locator('#nutritionUsage').innerText(), /2 shared provider calls/);
      assert.match(await page.locator('#nutritionProvenance').innerText(), /source-backed/);
      assert.equal(await page.locator('#nutritionSources a').getAttribute('href'), 'https://example.com/synthetic-label');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '195');
      const beforeScaling = nutritionRequests.length;
      await page.locator('#dietFoodAmount').fill('0.5');
      await page.locator('#dietFoodUnit').selectOption('cup');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '272');
      await page.locator('#dietFoodAmount').fill('2');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '1089');
      await page.locator('#dietFoodUnit').selectOption('serving');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '622');
      assert.match(await page.locator('#dietFoodUnit option:checked').innerText(), /80 g/);
      assert.equal(nutritionRequests.length, beforeScaling, 'Portion arithmetic makes no network requests');
      await page.locator('#dietFoodAmount').fill('50');
      await page.locator('#dietFoodUnit').selectOption('g');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).nutritionDefaults.length), 1, 'Direct fill does not silently save a local default');
      const beforeReuse = nutritionRequests.length;
      await click('#dietNutritionGenie');
      await page.waitForFunction(() => document.getElementById('nutritionLookupStatus').textContent.startsWith('Filled from the community'));
      assert.equal(nutritionRequests.slice(beforeReuse).some(request => request.path === '/lookup'), false, 'Shared food hit never calls Genie');
      sharedFixture = { ...sharedFixture, measures: [] };
      await page.locator('#dietFoodAmount').fill('0.5');
      await page.locator('#dietFoodUnit').selectOption('cup');
      await click('#dietNutritionGenie');
      await page.waitForFunction(() => document.getElementById('nutritionLookupStatus').textContent.startsWith('Filled by Genie'));
      assert.equal(nutritionRequests.at(-1).body.portionUnit, 'cup', 'Legacy cache misses request only the missing portion unit, not meal quantities');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '272', 'Legacy cached facts gain a source-defined cup equivalent');
      const afterPortion = nutritionRequests.length;
      await page.locator('#dietFoodAmount').fill('2');
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '1089');
      assert.equal(nutritionRequests.length, afterPortion);
      await page.locator('#dietFoodAmount').fill('50');
      await page.locator('#dietFoodUnit').selectOption('g');
      assert.equal(await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].some(key => /nutrition.*token/i.test(key))), false);
      const beforeAuto = nutritionRequests.filter(request => request.path === '/lookup').length;
      await page.locator('#dietFoodName').fill('Pasta');
      await page.waitForFunction(() => document.getElementById('nutritionLookupStatus').textContent.includes('Synthetic extraction failure'));
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '', 'A new food name clears stale figures before auto-fill');
      assert.equal(nutritionRequests.filter(request => request.path === '/lookup').length, beforeAuto + 1, 'An empty card auto-fills with one Genie call, no button or clarification');
      assert.equal(nutritionRequests.at(-1).body.input.preparation, '');
      assert.match(await page.locator('#nutritionUsage').innerText(), /3 shared provider calls; 25 input \/ 30 output/);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).nutritionDefaults.length), 1, 'Failed extraction never changes saved defaults');
      assert.equal(await page.locator('#nutritionClarification').count(), 0);
      await page.locator('#dietFoodAmount').fill('60');
      await page.waitForTimeout(1300);
      assert.equal(nutritionRequests.filter(request => request.path === '/lookup').length, beforeAuto + 1, 'Auto-fill never retries the same food automatically');
      await page.locator('#dietNutrCalories').fill('210');
      await page.locator('#nutritionPreparation').fill('Cooked');
      await page.waitForTimeout(1300);
      assert.equal(await page.locator('#dietNutrCalories').inputValue(), '210', 'Typed figures are never cleared or overwritten');
      assert.equal(nutritionRequests.filter(request => request.path === '/lookup').length, beforeAuto + 1, 'Typed figures suppress auto-fill');
      await page.locator('#dietNutrCalories').fill('');
      await page.locator('#nutritionPreparation').fill('');
      await page.evaluate(async () => {
        localStorage.removeItem('bignutenNutritionServiceUrl');
        const { genieClient } = await import('/js/genieService.mjs');
        genieClient.clear('Synthetic endpoint reset'); await genieClient.refresh(); await genieClient.ensureSignedIn();
      });
      console.log(`${name}: direct Genie fill, empty-card auto-fill, zero-signature pilot, shared reuse and failure usage passed`);
      console.log(`${name}: inline manual defaults, proportional scaling and no automatic logging passed`);
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
      await page.locator('#metric-picker').selectOption('temperature');
      await page.locator('#metric-value').fill('98.6');
      await page.locator('#metric-note').fill('Synthetic oral thermometer');
      await click('#metric-log-form button[type="submit"]');
      assert.match(await page.locator('#metric-status').innerText(), /Reading saved/);
      assert.match(await page.locator('#metric-history').innerText(), /98.6 °F/);
      assert.match(await page.locator('#metric-summary').innerText(), /adult resting reference 97.7–99.14 °F/);
      await page.locator('#metric-value').fill('103.1');
      await click('#metric-log-form button[type="submit"]');
      assert.match(await page.locator('#metric-history').innerText(), /outside adult resting reference/);
      assert.equal(await page.locator('#metric-trend-chart').evaluate(canvas => Chart.getChart(canvas).data.datasets[0].pointBackgroundColor.includes('#ffae42')), true);
      await shot('heart-temperature-history');
      await page.locator('#metric-picker').selectOption('bp');
      await page.locator('#metric-value-systolic').fill('80');
      await page.locator('#metric-value-diastolic').fill('80');
      await click('#metric-log-form button[type="submit"]');
      assert.match(await page.locator('#metric-status').innerText(), /Systolic must be greater than diastolic/);
      await page.locator('#metric-value-systolic').fill('120');
      await page.locator('#metric-note').fill('Synthetic cuff reading');
      await click('#metric-log-form button[type="submit"]');
      assert.match(await page.locator('#metric-status').innerText(), /Reading saved/);
      assert.match(await page.locator('#metric-history').innerText(), /Systolic: 120 mmHg \/ Diastolic: 80 mmHg/);
      assert.match(await page.locator('#metric-summary').innerText(), /30-day reading average 120.0 mmHg/);
      assert.equal(await page.locator('#metric-trend-chart').evaluate(canvas => Chart.getChart(canvas).data.datasets.length), 2);
      await shot('heart-bp-history');
      for (const [id, value] of [['spo2', '92'], ['rr', '22'], ['hrv', '42.5'], ['vo2max', '45.5']]) {
        await page.locator('#metric-picker').selectOption(id);
        await page.locator('#metric-value').fill(value);
        if (id === 'vo2max') await page.locator('#metric-source').selectOption('estimated');
        await click('#metric-log-form button[type="submit"]');
        assert.match(await page.locator('#metric-status').innerText(), /Reading saved/);
        if (id === 'spo2' || id === 'rr') assert.match(await page.locator('#metric-history').innerText(), /outside adult resting reference/);
      }
      const vitalLogs = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).metricLogs);
      assert.equal(vitalLogs.length, 8);
      assert.ok(Math.abs(vitalLogs.find(log => log.metric === 'temperature').value - 310.15) < 1e-8);
      assert.equal(vitalLogs.find(log => log.metric === 'temperature').unit, 'K');
      assert.deepEqual(vitalLogs.find(log => log.metric === 'bp').value, { systolic: 15998.64, diastolic: 10665.76 });
      assert.equal(vitalLogs.find(log => log.metric === 'bp').unit, 'Pa');
      assert.equal(vitalLogs.find(log => log.metric === 'vo2max').source, 'estimated');

      await page.locator('#metric-picker').selectOption('sleep');
      await page.locator('#metric-value').fill('7:30');
      await page.locator('#metric-optional-rating').fill('8');
      await page.locator('#metric-optional-time').fill('23:00');
      await page.locator('#metric-datetime').fill('2026-10-28T07:30');
      await page.locator('#metric-note').fill('Synthetic sleep: caffeine and dreams');
      await click('#metric-log-form button[type="submit"]');
      assert.match(await page.locator('#metric-status').innerText(), /Reading saved/);
      assert.match(await page.locator('#metric-history').innerText(), /7:30 h:mm.*quality 8\/10.*caffeine/);
      assert.match(await page.locator('#metric-summary').innerText(), /7-day reading average 7:30 h:mm/);
      await page.locator('#metric-picker').selectOption('energy');
      await page.locator('#metric-value').fill('7');
      await click('#metric-log-form button[type="submit"]');
      assert.match(await page.locator('#metric-status').innerText(), /Reading saved/);
      const sleepEnergy = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).metricLogs);
      assert.equal(sleepEnergy.find(log => log.metric === 'sleep').value, 27000);
      assert.equal(sleepEnergy.find(log => log.metric === 'sleep').date, '2026-10-28');
      assert.equal(sleepEnergy.find(log => log.metric === 'sleep').bedtime, '23:00');
      assert.equal(sleepEnergy.find(log => log.metric === 'energy').value, 7);
      await page.locator('#metric-picker').selectOption('rhr');
      await click('#heart-breathwork-tab');
      await visible('#heart-breathwork');
      assert.equal(await page.locator('#breath-method').inputValue(), 'box');
      await page.locator('#breath-rounds').fill('1');
      await click('#breath-begin');
      assert.match(await page.locator('#breath-phase').innerText(), /Inhale/);
      await page.clock.fastForward(4000);
      await click('#breath-pause');
      const pausedBreath = await page.locator('#breath-elapsed').innerText();
      assert.match(await page.locator('#breath-phase').innerText(), /Paused — breathe normally/);
      await page.clock.fastForward(3000);
      assert.equal(await page.locator('#breath-elapsed').innerText(), pausedBreath);
      await click('#breath-pause');
      await page.clock.fastForward(12000);
      assert.equal(await page.locator('#breath-pause').isDisabled(), true);
      await page.locator('#breath-feeling').selectOption('calm');
      await page.locator('#breath-notes').fill('Synthetic paced breathing');
      await click('#breath-save');
      assert.match(await page.locator('#breath-history').innerText(), /Box Breathing.*1 rounds.*0:16.*calm/);
      await shot('heart-breathwork-saved');
      const breaths = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).breathworkSessions);
      assert.equal(breaths.length, 1); assert.equal(breaths[0].durationSeconds, 16);
      await click('#breath-begin'); await page.clock.fastForward(2000); await click('#breath-cancel');
      await page.clock.fastForward(17000);
      assert.equal(await page.locator('#breath-elapsed').innerText(), '0:00');
      assert.equal(await page.locator('#breath-save').isDisabled(), true);
      await click('#breath-begin'); await page.clock.fastForward(2000);
      await click('#heart-modal-close'); await page.clock.fastForward(17000);
      await click('#chakra-heart');
      assert.equal(await page.locator('#breath-elapsed').innerText(), '0:00');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).breathworkSessions.length), 1);
      assert.equal(await page.locator('#breath-method option[value="wim"]').count(), 0);
      await click('#breath-show-advanced');
      await page.locator('#breath-method').selectOption('wim');
      assert.equal(await page.locator('#breath-ack').isChecked(), false);
      assert.equal(await page.locator('#breath-begin').isDisabled(), true, 'Advanced practice cannot start without acknowledgement');
      await page.locator('#breath-begin').dispatchEvent('click');
      assert.match(await page.locator('#breath-status').innerText(), /Acknowledge/);
      await page.locator('#breath-ack').check();
      await click('#breath-begin'); await page.clock.fastForward(2000);
      await click('#breath-cancel');
      assert.equal(await page.locator('#breath-ack').isChecked(), false);
      assert.equal(await page.locator('#breath-method option[value="wim"]').count(), 0);
      console.log(`${name}: sleep/energy canonical logs and guided breathwork pause/complete/cancel/close persisted correctly`);
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
      console.log(`${name}: Heart hub logged seven canonical vitals, BP ordering, reference highlights and estimated VO2 provenance; retained readings after reopen`);
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
      // Real settings → interview → edit → re-sanitize → review → GitHub link.
      // Never follow the link or submit an issue in a smoke run.
      const helperHostedBefore = hostedRequests.length;
      const helperStorageBefore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      await click('#genie-issue-helper-open');
      await visible('#issue-helper-dialog');
      assert.match(await page.locator('#issue-helper-dialog').innerText(), /No health logs/);
      assert.equal(await page.locator('#issue-helper-address-opt-in').isChecked(), false);
      await page.locator('#issue-helper-surface').fill('Water panel');
      await page.locator('#issue-helper-happened').fill('Button does not open\napi_key=synthetic-smoke-private\ncontact@example.com');
      await page.locator('#issue-helper-expected').fill('Dialog opens');
      await page.locator('#issue-helper-steps').fill('Click water icon');
      await click('#issue-helper-build');
      assert.match(await page.locator('#issue-helper-status').innerText(), /removed/);
      assert.doesNotMatch(await page.locator('#issue-helper-draft-body').inputValue(), /synthetic-smoke-private|contact@example.com|Synthetic resting reading/);
      await page.locator('#issue-helper-draft-title').fill('Edited issue & idea 🧞');
      await page.locator('#issue-helper-draft-body').fill('Edited synthetic steps & expected.\npassword=synthetic-edited-private');
      await click('#issue-helper-review');
      assert.match(await page.locator('#issue-helper-reviewed').innerText(), /Edited synthetic steps/);
      assert.doesNotMatch(await page.locator('#issue-helper-reviewed').innerText(), /synthetic-edited-private/);
      assert.equal(await page.locator('#issue-helper-github-link').getAttribute('href'), null);
      await page.locator('#issue-helper-confirm').check();
      const issueUrl = new URL(await page.locator('#issue-helper-github-link').getAttribute('href'));
      assert.equal(issueUrl.origin + issueUrl.pathname, 'https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/new');
      assert.equal(issueUrl.searchParams.get('title'), 'Edited issue & idea 🧞');
      assert.equal(issueUrl.searchParams.get('body'), await page.locator('#issue-helper-draft-body').inputValue());
      assert.doesNotMatch(issueUrl.href, /synthetic-edited-private|synthetic-smoke-private/);
      await shot('issue-helper-reviewed');
      await page.locator('#issue-helper-draft-body').fill('New edit after review');
      assert.equal(await page.locator('#issue-helper-github-link').getAttribute('href'), null, 'Editing invalidates outgoing link');
      await click('#issue-helper-review');
      await page.locator('#issue-helper-confirm').check();
      assert.match(await page.locator('#issue-helper-github-link').getAttribute('href'), /New\+edit\+after\+review/);
      await page.locator('#issue-helper-address-opt-in').check();
      assert.equal(await page.locator('#issue-helper-github-link').getAttribute('href'), null, 'Address setting invalidates review');
      await page.locator('#issue-helper-addresses').fill('0x' + 'ab'.repeat(32));
      await click('#issue-helper-review');
      assert.match(await page.locator('#issue-helper-status').innerText(), /keys can never be kept/);
      assert.equal(await page.locator('#issue-helper-github-link').getAttribute('href'), null, 'A key cannot be allowlisted');
      const publicAddress = '0x' + 'a1'.repeat(20);
      await page.locator('#issue-helper-addresses').fill(publicAddress);
      await page.locator('#issue-helper-draft-body').fill(`Synthetic public example ${publicAddress}`);
      await click('#issue-helper-review');
      await page.locator('#issue-helper-confirm').check();
      assert.ok(new URL(await page.locator('#issue-helper-github-link').getAttribute('href')).searchParams.get('body').includes(publicAddress));
      await page.locator('#issue-helper-address-opt-in').uncheck();
      await click('#issue-helper-review');
      assert.doesNotMatch(await page.locator('#issue-helper-reviewed').innerText(), new RegExp(publicAddress));
      assert.equal(hostedRequests.length, helperHostedBefore, 'No helper draft sent to hosted AI');
      await click('#issue-helper-close');
      await hidden('#issue-helper-dialog');
      assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), helperStorageBefore, 'No draft or consent persisted');
      covered.add('issue-helper-dialog');
      if (await page.locator('#genie-enabled-toggle').isChecked()) {
        await click('label:has(#genie-enabled-toggle)');
        assert.equal(await page.locator('#genie-enabled-toggle').isChecked(), false);
      }
      await click('label:has(#genie-enabled-toggle)');
      assert.equal(await page.locator('#genie-enabled-toggle').isChecked(), true);
      await click('#settings-modal-close');
      await click('#chakra-heart');
      await page.locator('#metric-picker').selectOption('temperature');
      assert.match(await page.locator('#metric-history').innerText(), /37 °C/);
      await page.locator('#metric-value').fill('37');
      await click('#metric-log-form button[type="submit"]');
      assert.match(await page.locator('#metric-status').innerText(), /Reading saved/);
      await page.locator('#metric-picker').selectOption('bp');
      assert.match(await page.locator('#metric-value-fields').innerText(), /Systolic \(mmHg\)/i);
      assert.match(await page.locator('#metric-history').innerText(), /120 mmHg/);
      await page.locator('#metric-picker').selectOption('rhr');
      await click('#heart-modal-close');

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
          await page.locator(`${chat} .genie-mode-selector`).selectOption('health');
          async function ask() {
            await page.locator(`${chat} .genie-chat-input`).fill('Review my health today');
            await click(`${chat} .genie-chat-send`);
          }
          await ask();
          await visible('#genie-consent-dialog');
          assert.match(await page.locator('#genie-consent-dialog').innerText(), /private Genie service/);
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
          assert.equal(hostedRequests.length, 2, 'Permission remembered for private Health companion');
          await hidden('#genie-consent-dialog');
          await page.evaluate(async () => { const privacy = await import('/js/geniePrivacy.js'); privacy.revokeGenieHostedConsent(); });
          await ask();
          await visible('#genie-consent-dialog');
          assert.match(await page.locator('#genie-consent-dialog').innerText(), /OpenAI/);
          await click('[data-consent-action="local"]');
          await page.waitForFunction(selector => !document.querySelector(selector).disabled, `${chat} .genie-chat-input`);
          assert.equal(await page.evaluate(() => localStorage.getItem('genieBackend')), 'webllm');
          assert.equal(hostedRequests.length, 2, 'Local alternative sends nothing to either hosted backend');

          await page.locator(`${chat} .genie-mode-selector`).selectOption('community');
          assert.match(await page.locator(`${chat} .genie-community-note`).innerText(), /no health logs or Genie memory by default/i);
          await click(`${chat} .genie-guide-tour`);
          const tourText = await page.locator(`${chat} .genie-chat-messages`).innerText();
          assert.match(tourText, /Filing a useful issue/);
          assert.match(tourText, /Community Guide mode includes no health logs or Genie memory/);
          assert.equal(hostedRequests.length, 2, 'Offline deterministic tour does not call a model');
          await shot('genie-community-offline-tour');

          await click(`${chat} .genie-coach-today`);
          const walletAccessBeforeCoach = walletCalls.filter(method => method === 'eth_requestAccounts').length;
          await click(`${chat} .genie-chat-send`);
          await page.waitForFunction(selector => !document.querySelector(selector).disabled, `${chat} .genie-chat-input`);
          assert.match(await page.locator(`${chat} .genie-chat-messages`).innerText(), /No enabled monthly challenge|UNAVAILABLE/);
          assert.equal(hostedRequests.length, 2, 'Read-only challenge coach does not call hosted AI');
          assert.equal(walletCalls.filter(method => method === 'eth_requestAccounts').length, walletAccessBeforeCoach, 'Coach never requests wallet access');

          await page.evaluate(async () => { const genie = await import('/js/genieChat.js'); genie.setGenieBackend('private-genie'); });
          const healthSessionBeforeCommunity = await page.evaluate(() => sessionStorage.getItem('genieChatSession_recent-exercises-list'));
          await page.locator(`${chat} .genie-chat-input`).fill('How do I write a helpful issue?');
          await click(`${chat} .genie-chat-send`);
          await visible('#genie-consent-dialog');
          assert.match(await page.locator('#genie-consent-dialog').innerText(), /Community Guide/);
          assert.match(await page.locator('#genie-consent-dialog').innerText(), /no health logs or Genie memory by default/i);
          assert.deepEqual((await page.locator('#genie-consent-dialog ul li').allTextContents()), ['Shared Community Guide text', 'Your message']);
          assert.equal(hostedRequests.length, 2, 'Community consent is required even after health-mode consent');
          await click('[data-consent-action="cancel"]');
          await hidden('#genie-consent-dialog');
          await page.waitForFunction(selector => !document.querySelector(selector).disabled, `${chat} .genie-chat-input`);
          assert.equal(hostedRequests.length, 2, 'Cancel sends no Community Guide content');
          await page.locator(`${chat} .genie-chat-input`).fill('How do I write a helpful issue?');
          await click(`${chat} .genie-chat-send`);
          await visible('#genie-consent-dialog');
          await click('[data-consent-action="allow"]');
          await page.waitForFunction(selector => !document.querySelector(selector).disabled, `${chat} .genie-chat-input`);
          assert.equal(hostedRequests.length, 3);
          const communityBody = JSON.stringify(hostedRequests[2].body);
          assert.match(communityBody, /Community Guide/);
          assert.doesNotMatch(communityBody, /Synthetic resting reading|Synthetic restore meal|Synthetic restore supplement|Vitals & Body Metrics|Synthetic health response/);
          assert.equal(await page.evaluate(() => sessionStorage.getItem('genieChatSession_recent-exercises-list')), healthSessionBeforeCommunity, 'Community messages do not enter Health companion session memory');
          await visible(`${chat} .genie-issue-helper-open`);
          await click(`${chat} .genie-issue-helper-open`);
          await visible('#issue-helper-dialog');
          assert.match(await page.locator('#issue-helper-dialog').innerText(), /Model-free and local/);
          await click('#issue-helper-close');
          await hidden('#issue-helper-dialog');
          assert.equal(await page.locator(`${chat} .genie-mode-selector`).inputValue(), 'community', 'Issue helper leaves Community Guide mode intact');
          await page.evaluate(() => document.dispatchEvent(new CustomEvent('bn:issue-helper')));
          await visible('#issue-helper-dialog');
          await click('#issue-helper-close');
          assert.equal(hostedRequests.length, 3, 'Issue-helper entry points never call a hosted model');
          await page.evaluate(async () => { const genie = await import('/js/genieChat.js'); genie.setGenieBackend('webllm'); });
          covered.add('genie-community-guide-and-coach');
          covered.add('genie-consent-dialog');
        }
        await click(`.genie-chat-window[data-panel="${id}"] .genie-chat-close`);
        await hidden(`.genie-chat-window[data-panel="${id}"]`);
        await click(`[data-panel="${id}"].panel-toggle-btn`);
        await hidden(`#${id}`);
      }
      // Separate helper discovery check; do not enter the model/consent path.
      await click(`[data-panel="${panels[0]}"].panel-toggle-btn`);
      await click(`.genie-icon-btn[data-panel="${panels[0]}"]`);
      await click(`.genie-chat-window[data-panel="${panels[0]}"] .genie-issue-helper-open`);
      await visible('#issue-helper-dialog');
      assert.equal(await page.locator('#issue-helper-happened').inputValue(), '', 'New helper never imports chat or health context');
      await click('#issue-helper-close');
      await click(`.genie-chat-window[data-panel="${panels[0]}"] .genie-chat-close`);
      await click(`[data-panel="${panels[0]}"].panel-toggle-btn`);
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
      await click('[data-series="metric:sleep"]');
      await click('[data-series="metric:energy"]');
      assert.equal(await page.locator('#correlationChart').evaluate(canvas => {
        const datasets = Chart.getChart(canvas).data.datasets;
        return datasets.some(series => /Sleep duration/.test(series.label) && series.data.some(point => point.y === 7.5)) && datasets.some(series => /Daily energy/.test(series.label) && series.data.some(point => point.y === 7));
      }), true);
      await click('#correlation-graph-modal .modal-close');
      for (const [id, trigger] of [
        ['bnut-admin-modal', '#admin-bnut-btn'], ['treasury-admin-modal', '#admin-treasury-btn'],
        ['defi-admin-modal', '#admin-defi-btn'], ['escrow-admin-modal', '#admin-escrow-btn'],
        ['contributors-admin-modal', '#admin-contributors-btn'], ['comp-admin-modal', '#admin-comp-btn'],
        ['payroll-modal', '#admin-payroll-btn'],
      ]) await modal(id, trigger, undefined, ['#aesculapius-left']);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.streakSettlementCapture), 'bound', 'monthly settlement controls are intercepted by the verified results workflow');
      assert.equal(await page.locator('#competition-results-admin [data-streak-results-refresh]').count(), 1, 'competition admin exposes a local/read-only results refresh');
      assert.equal(await page.locator('#competition-awards-root').count(), 1, 'competition admin exposes the separate local award metadata/template panel');
      await page.evaluate(() => {
        const probe = document.createElement('button');
        probe.dataset.streakAction = 'settle';
        probe.dataset.comp = '0';
        probe.textContent = 'Synthetic settlement interception probe';
        probe.addEventListener('click', () => { window.__legacySettleProbeReached = true; });
        document.querySelector('#comp-admin-modal .gov-modal').append(probe);
        probe.click();
      });
      await visible('#streak-settlement-preview');
      await page.waitForFunction(() =>
        /BLOCKED \/ UNAVAILABLE/.test(document.querySelector('#streak-settlement-preview')?.innerText || ''),
      null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => window.__legacySettleProbeReached === true), false, 'capture-phase guard prevents legacy settle handlers from bypassing the verified workflow');
      assert.match(await page.locator('#streak-settlement-preview').innerText(), /BLOCKED \/ UNAVAILABLE/);
      for (const [id, trigger] of [
        ['achievements-modal', '#aes-achieve-btn'], ['settings-modal', '#aes-settings-btn'],
        ['governance-modal', '#aes-gov-btn'], ['data-sharing-modal', '#aes-data-btn'],
        ['subscription-modal', '#aes-sub-btn'], ['challenge-modal', '#aes-challenge-btn'],
        ['bounty-register-modal', '#aes-bounty-register-btn'],
      ]) await modal(id, trigger, undefined, ['#aesculapius-right']);
      await click('#aesculapius-right');
      await click('#aes-challenge-btn');
      await visible('#challenge-modal');
      assert.equal(await page.locator('#streak-results-user [data-streak-results-refresh]').count(), 1, 'dashboard challenge view exposes live/archive results');
      const rehearsalWalletCalls = walletCalls.length;
      assert.match(await page.locator('#streak-journey').innerText(), /Commit:[\s\S]*Practice:[\s\S]*Gather:[\s\S]*Review:[\s\S]*Settle:/);
      assert.match(await page.locator('#streak-journey').innerText(), /not medical proof/);
      assert.match(await page.locator('#streak-journey').innerText(), /occupied third-place slot, which starts with half principal/i);
      assert.match(await page.locator('#streak-journey').innerText(), /source-only payout-policy version 2 ties equal verified activity-day and report counts/i);
      await page.locator('#streak-payout-details > summary').click();
      assert.match(await page.locator('#streak-payout-examples').innerText(), /Legacy strict-ranking simulation only/);
      assert.match(await page.locator('#streak-payout-examples').innerText(), /Source-only ranked-tie simulation/);
      assert.equal(await page.locator('#streak-payout-examples table').count(), 2);
      assert.equal(await page.locator('#streak-payout-examples table').nth(0).locator('tbody tr').count(), 9);
      assert.equal(await page.locator('#streak-payout-examples table').nth(1).locator('tbody tr').count(), 6);
      assert.match(await page.locator('#streak-payout-examples table').nth(0).locator('tbody').innerText(), /#5:/);
      assert.equal(walletCalls.slice(rehearsalWalletCalls).some(method => /sendTransaction|sign|requestAccounts/.test(method)), false, 'Reading rehearsal must not request signatures, transfers or wallet access');
      await click('#challenge-modal-close');
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
        genie.setGenieBackend('private-genie');
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
      await page.locator('#yoga-genie-input').fill('How can I modify this pose?');
      await click('#yoga-genie-send');
      await visible('#genie-consent-dialog');
      await click('[data-consent-action="allow"]');
      await page.waitForFunction(() => !document.getElementById('yoga-genie-input').disabled);
      assert.equal(hostedRequests.length, beforeYoga + 1);
      assert.equal(hostedRequests.at(-1).body.assistant, 'yoga');
      assert.doesNotMatch(JSON.stringify(hostedRequests.at(-1).body), /Vitals & Body Metrics|Synthetic resting reading|Food \/ Diet Log/);
      assert.match(await page.locator('#yoga-genie-messages').innerText(), /Synthetic yoga response/);
      await page.evaluate(async () => { (await import('/js/geniePrivacy.js')).revokeGenieHostedConsent(); });
      await page.locator('#yoga-genie-input').fill('Try locally instead');
      await click('#yoga-genie-send');
      await visible('#genie-consent-dialog');
      await click('[data-consent-action="local"]');
      await page.waitForFunction(() => !document.getElementById('yoga-genie-input').disabled);
      assert.equal(hostedRequests.length, beforeYoga + 1, 'Yoga local alternative sends nothing');
      assert.match(await page.locator('#yoga-genie-messages').innerText(), /Yoga Genie needs a hosted backend/);
      assert.equal(await page.evaluate(() => localStorage.getItem('genieBackend')), 'webllm');
      await click('#yoga-genie-chat-close');
      await click('#yoga-close-btn');
      if (await page.locator('#workout-set-list').isVisible()) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      // Leave headroom: pausing at the exact live time races CI command latency.
      await page.clock.setSystemTime(new Date('2026-10-28T11:59:00Z'));
      await page.clock.pauseAt(new Date('2026-10-28T12:00:00Z'));
      // Elapsed timers need Date to advance with the manually stepped clock.
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
      // Complete a real short workout, then update the same session record.
      if (await page.locator('#workout-set-list').isVisible()) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      await click('[data-panel="recent-exercises-list"].panel-toggle-btn');
      await click('#exercises-last7days .exercise-add-btn');
      if (await page.locator('#recent-exercises-list').isVisible()) await click('[data-panel="recent-exercises-list"].panel-toggle-btn');
      if (!(await page.locator('#workout-set-list').isVisible())) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      await page.locator('.workout-set-item .workout-sets').fill('1');
      await page.locator('.workout-set-item .set-reps').fill('6');
      await page.locator('.workout-set-item .set-weight').fill('10');
      const beforeComplete = await sessions();
      await click('#start-workout-button');
      await advanceWorkoutClock(11);
      page.once('dialog', dialog => dialog.accept());
      await advanceWorkoutClock(1);
      await hidden('#workout-timer-modal');
      await visible('#emotion-modal');
      await click('#emotion-modal .modal-close');
      const completedSessions = await sessions();
      assert.equal(completedSessions.length, beforeComplete.length + 1);
      assert.equal(completedSessions.at(-1).completed, true);
      assert.equal(completedSessions.at(-1).durationSeconds, 12);
      if (!(await page.locator('#workout-set-list').isVisible())) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      assert.equal(await page.locator('#workout-session-duration').isDisabled(), true);
      await page.locator('#workout-rpe').fill('7');
      await page.locator('#workout-soreness').check();
      await page.locator('#workout-tightness').check();
      await page.locator('#workout-recovery-note').fill('Synthetic legs sore, back tight');
      await click('#workout-session-form button[type="submit"]');
      const reviewed = (await sessions()).at(-1);
      assert.equal(reviewed.rpe, 7);
      assert.equal(reviewed.durationSeconds, 12);
      assert.deepEqual(reviewed.recovery, { soreness: true, tightness: true, note: 'Synthetic legs sore, back tight' });
      assert.equal((await sessions()).length, completedSessions.length, 'Review updates, never duplicates sessions');
      assert.match(await page.locator('#workout-session-history').innerText(), /RPE 7.*legs sore/);
      await page.locator('#workout-trend-type').selectOption('Push-ups');
      assert.equal(await page.locator('#workout-session-chart').evaluate(canvas => Chart.getChart(canvas).data.datasets[0].data.at(-1).y), 7);
      await shot('workout-recovery');
      await page.locator('#workout-session-picker').selectOption('0');
      assert.equal(await page.locator('#workout-session-duration').isEnabled(), true);
      assert.match(await page.locator('#workout-session-history').innerText(), /duration not recorded/);
      await page.locator('#workout-session-duration').fill('30');
      await click('#workout-session-form button[type="submit"]');
      assert.equal((await sessions())[0].durationSeconds, 1800);
      assert.match(await page.locator('#lifetime-stats-summary').textContent(), /Recorded elapsed duration/);
      await click('[data-panel="workout-set-list"].panel-toggle-btn');
      // Settings was switched to metric earlier. Store cm, not the display value in inches.
      await click('#log-measurements');
      await page.locator('#measurement-type').selectOption('Waist');
      await page.locator('#measurement').fill('80');
      await page.locator('#measurement-date').fill('2026-10-28');
      await page.locator('#measurement-time').fill('12:00');
      await page.locator('#measurement-body-fat').fill('22.5');
      await page.locator('#measurement-body-fat-source').selectOption('imported');
      await page.locator('#measurement-photo').check();
      await page.locator('#measurement-photo-note').fill('Synthetic private photo elsewhere');
      await click('#measurement-form button[type="submit"]');
      const body = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')));
      const latestMeasurement = body.measurements.at(-1);
      assert.equal(latestMeasurement.measurement, 80);
      assert.equal(latestMeasurement.unit, 'cm');
      assert.equal(latestMeasurement.progressPhotoTaken, true);
      assert.equal(latestMeasurement.progressPhotoNote, 'Synthetic private photo elsewhere');
      const fat = body.metricLogs.find(log => log.id === latestMeasurement.bodyFatMetricId);
      assert.equal(fat.value, 22.5); assert.equal(fat.source, 'imported'); assert.equal(fat.unit, '%');
      assert.match(await page.locator('#measurement-history').innerText(), /Waist: 80 cm.*Body fat: 22.5%.*Photo: taken/);
      assert.match(await page.locator('#measurement-history').innerText(), /legacy units \(not specified\)/);
      await shot('measurement-photo-metadata');
      await click('#measurements-modal .modal-close');
      await click('#chakra-heart');
      await page.locator('#metric-picker').selectOption('bodyFat');
      assert.match(await page.locator('#metric-history').innerText(), /22.5 %.*imported/);
      assert.equal(await page.locator('#metric-trend-chart').evaluate(canvas => Chart.getChart(canvas).data.datasets[0].data.at(-1).y), 22.5);
      await click('#heart-modal-close');
      await click('#graph-icon');
      await click('[data-series="metric:bodyFat"]');
      assert.equal(await page.locator('#correlationChart').evaluate(canvas => Chart.getChart(canvas).data.datasets.find(dataset => dataset.label.includes('Body fat')).data.at(-1).y), 22.5);
      await click('#correlation-graph-modal .modal-close');
      await advanceWorkoutClock(12);
      assert.equal((await sessions()).length, completedSessions.length, 'Completed timer does not run again');
      console.log(`${name}: completed workout with elapsed duration, RPE/recovery, canonical measurement/photo metadata and body-fat hub/correlation`);
      if (await page.locator('#workout-set-list').isVisible()) await click('[data-panel="workout-set-list"].panel-toggle-btn');
      if (name === 'mobile') await modal('mobile-data-sheet', '#ipfsIcon', '#mobile-sheet-close-btn');
      await modal('ipfs-connect-dialog', '#aes-storage-btn', '#ipfs-dialog-close-btn', ['#aesculapius-right']);
      // A prepared storage-mode preference is a UI fixture, not a connected IPFS
      // provider. Exercise the snapshot viewer without uploading private data.
      await page.evaluate(() => localStorage.setItem('storageMode', 'ipfs'));
      await modal('ipfs-snapshot-panel', '#aes-storage-btn', '#snapshot-panel-close', ['#aesculapius-right']);
      // Real local-only Quest UI on desktop and mobile, never wallet actions.
      const questHostedBefore = hostedRequests.length;
      const questWalletBefore = walletCalls.length;
      await click('#aesculapius-right'); await click('#aes-settings-btn');
      assert.equal(await page.locator('#quest-mode-toggle').isChecked(), false);
      await page.locator('#quest-mode-toggle').check();
      await visible('#quest-card');
      covered.add('quest-card');
      assert.match(await page.locator('#quest-chapter-label').innerText(), /Chapter 1 of 7/);
      assert.match(await page.locator('#quest-card').innerText(), /Token\/role unlock and on-chain rewards are deferred/);
      await click('#quest-find-ui');
      assert.equal(await page.locator('#aesculapius-right').evaluate(element => element === document.activeElement), true);
      // An independently opened dialog takes precedence over Quest, without
      // losing progress or intercepting its text and Escape handling.
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('bn:issue-helper')));
      await visible('#issue-helper-dialog');
      await hidden('#quest-overlay');
      await page.locator('#issue-helper-surface').fill('BNUT');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#issue-helper-surface').inputValue(), 'BNUT');
      await page.locator('#issue-helper-close').focus();
      await page.keyboard.press('Escape');
      await hidden('#issue-helper-dialog');
      await visible('#quest-card');
      assert.match(await page.locator('#quest-chapter-label').innerText(), /Chapter 1 of 7/);
      await page.locator('#quest-title').focus();
      await page.keyboard.press('ArrowRight');
      assert.match(await page.locator('#quest-chapter-label').innerText(), /Chapter 2 of 7/);
      await shot('quest-progress');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.getElementById('quest-mode-toggle')?.dataset.ready === 'true');
      await visible('#quest-card');
      await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
      assert.match(await page.locator('#quest-chapter-label').innerText(), /Chapter 2 of 7/);
      for (let chapter = 1; chapter < 7; chapter++) await click('#quest-next');
      assert.match(await page.locator('#quest-badge').innerText(), /local completion badge/);
      await page.locator('#quest-card input[value="reward"]').check();
      await click('#quest-check-answer');
      assert.match(await page.locator('#quest-check-feedback').innerText(), /deferred/);
      await page.locator('#quest-card input[value="local"]').check();
      await click('#quest-check-answer');
      assert.match(await page.locator('#quest-check-feedback').innerText(), /Correct/);
      assert.equal(await page.locator('#quest-overlay progress').getAttribute('value'), '7');
      const questBox = await page.locator('#quest-card').boundingBox();
      assert.ok(questBox.x >= 0 && questBox.x + questBox.width <= viewport.width, 'Quest card fits the viewport');
      await shot('quest-local-badge');
      await click('#quest-exit');
      await hidden('#quest-overlay');
      assert.equal(await page.locator('body').evaluate(body => body.classList.contains('quest-mode')), false);
      await page.reload({ waitUntil: 'networkidle' });
      await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
      await hidden('#quest-overlay');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bignuten:quest:v1')).badge), true);
      // Easter egg never intercepts typed content or any other open modal.
      await click('#aesculapius-right'); await click('#aes-settings-btn');
      assert.match(await page.locator('#quest-local-badge').innerText(), /Nest Explorer/);
      await page.locator('#settings-metric-units').focus();
      await page.keyboard.type('BNUT'); await page.keyboard.press('Enter');
      await hidden('#quest-overlay');
      await click('#settings-modal-close');
      await page.evaluate(() => {
        const editor = document.createElement('div');
        editor.id = 'quest-smoke-editor';
        editor.contentEditable = 'true';
        document.body.append(editor);
        editor.focus();
      });
      await page.keyboard.type('BNUT'); await page.keyboard.press('Enter');
      await hidden('#quest-overlay');
      assert.match(await page.locator('#quest-smoke-editor').innerText(), /BNUT/);
      await page.locator('#quest-smoke-editor').evaluate(element => element.remove());
      await page.locator('body').click({ position: { x: 2, y: viewport.height / 2 } });
      await page.keyboard.type('BNUT'); await page.keyboard.press('Enter');
      await visible('#quest-card');
      await page.locator('#quest-chapter-select').selectOption('5');
      await click('#quest-issue-helper');
      await hidden('#quest-overlay');
      await visible('#issue-helper-dialog');
      await page.locator('#issue-helper-surface').focus();
      await page.keyboard.type('BNUT'); await page.keyboard.press('Enter');
      await hidden('#quest-overlay');
      assert.equal(await page.locator('#issue-helper-surface').inputValue(), 'BNUT');
      await click('#issue-helper-close');
      // Save and deletion failures are reported; other app keys are untouched.
      await click('#aesculapius-right'); await click('#aes-settings-btn');
      await page.evaluate(() => {
        window.__questSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (key.endsWith('bignuten:quest:v1')) throw new DOMException('Synthetic quota', 'QuotaExceededError');
          return window.__questSetItem.call(this, key, value);
        };
      });
      await click('#quest-settings-reset');
      assert.match(await page.locator('#quest-settings-status').innerText(), /session-only/);
      assert.match(await page.locator('#quest-local-badge').innerText(), /No local completion badge/);
      await page.evaluate(() => {
        Storage.prototype.setItem = window.__questSetItem;
        delete window.__questSetItem;
        window.__questRemoveItem = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function(key) {
          if (key.endsWith('bignuten:quest:v1')) throw new DOMException('Synthetic denied', 'SecurityError');
          return window.__questRemoveItem.call(this, key);
        };
      });
      await click('#quest-settings-clear');
      assert.match(await page.locator('#quest-settings-status').innerText(), /could not be cleared/);
      await page.evaluate(() => {
        Storage.prototype.removeItem = window.__questRemoveItem;
        delete window.__questRemoveItem;
      });
      await click('#quest-settings-clear');
      assert.equal(await page.evaluate(() => localStorage.getItem('bignuten:quest:v1')), null);
      await page.locator('#quest-mode-toggle').check();
      await visible('#quest-card');
      assert.match(await page.locator('#quest-chapter-label').innerText(), /Chapter 1 of 7/);
      await page.locator('#quest-title').focus();
      await page.keyboard.press('Escape');
      await hidden('#quest-overlay');
      assert.equal(hostedRequests.length, questHostedBefore, 'Quest never calls a hosted model');
      assert.deepEqual(walletCalls.slice(questWalletBefore).filter(method => /sign|send|requestAccounts|switchEthereumChain|addEthereumChain/i.test(method)), [], 'Quest never signs, sends, connects or switches a wallet');
      console.log(`${name}: Quest opt-in, keyboard safety, reload/resume, seven chapters, local badge, issue-helper handoff, exit, reset/clear and storage failures verified without financial actions`);
      await click('#research-open');
      await visible('#research-experiments-dialog');
      covered.add('research-experiments-dialog');
      assert.match(await page.locator('#research-library').innerText(), /private research library is empty/i);
      assert.ok(await page.locator('#research-experiments-dialog').evaluate(dialog => dialog.getBoundingClientRect().width <= window.innerWidth), `${name}: research dialog fits the viewport`);
      const modelCallsBeforePaste = hostedRequests.length;
      await page.locator('#research-url').fill('https://www.youtube.com/watch?v=abcdefghijk');
      await click('#research-preview');
      await page.waitForFunction(() => document.getElementById('research-new-title').value.includes('abcdefghijk'));
      await page.locator('#research-category').selectOption('sleep');
      await page.locator('#research-tags').fill('sleep, routine');
      await page.locator('#research-transcript').fill('Synthetic pasted transcript: keep a consistent, comfortable bedtime routine.');
      const serviceCallsBeforePaste = researchRequests.length;
      await page.locator('#research-add-form button[type="submit"]').click();
      await page.waitForFunction(() => document.getElementById('research-status').textContent.includes('Saved privately on this device'));
      assert.equal(hostedRequests.length, modelCallsBeforePaste, 'Pasting and saving a transcript makes no AI request');
      assert.equal(researchRequests.length, serviceCallsBeforePaste, 'Manual transcript save makes no service request');
      let savedResearch = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).latestResearch);
      assert.equal(savedResearch.length, 1);
      assert.equal(savedResearch[0].transcript, 'Synthetic pasted transcript: keep a consistent, comfortable bedtime routine.');
      assert.equal(savedResearch[0].title, 'Synthetic YouTube abcdefghijk', 'YouTube oEmbed title is saved');
      await page.locator('#research-url').fill('https://youtu.be/lmnopqrstuv');
      await click('#research-preview');
      await page.waitForFunction(() => document.getElementById('research-new-title').value.includes('lmnopqrstuv'));
      await page.locator('#research-add-form button[type="submit"]').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).latestResearch.length === 2);
      await page.locator('#research-filter').selectOption('sleep');
      await page.waitForFunction(() => document.querySelectorAll('.research-card').length === 1);
      await page.locator('#research-filter').selectOption('all');
      const captionCard = page.locator('.research-card').filter({ hasText: 'Synthetic YouTube lmnopqrstuv' });
      await captionCard.locator('[data-action="fetch-captions"]').click();
      await page.waitForFunction(() => document.getElementById('research-status').textContent.includes('No AI model was called'));
      assert.equal(researchRequests.filter(call => call.path === '/research/oembed').length, 2, 'Explicit oEmbed action sends one video ID per video');
      assert.equal(researchRequests.filter(call => call.path === '/research/captions').length, 1, 'Caption action calls the hosted caption endpoint once');
      assert.equal(researchRequests.find(call => call.path === '/research/captions').body.videoId, 'lmnopqrstuv');
      const pastedCard = page.locator('.research-card').filter({ hasText: 'Synthetic YouTube abcdefghijk' });
      await pastedCard.locator('[data-action="include-research"]').check();
      await page.locator('#research-genie-consent').check();
      await page.locator('#research-target-metrics input[data-metric-id="sleep"]').check();
      await pastedCard.locator('[data-action="draft-protocol"]').click();
      await page.waitForFunction(() => !document.getElementById('research-draft-protocol').hidden);
      assert.equal(researchRequests.filter(call => call.path === '/research/protocol').length, 1, 'Genie protocol action makes one structured request');
      assert.equal(researchRequests.at(-1).body.transcript, savedResearch.find(entry => entry.youtubeId === 'abcdefghijk').transcript, 'Only the chosen transcript is sent for protocol drafting');
      await page.locator('#research-draft-form button[type="submit"]').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).researchProtocols.length === 1);
      await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('fitnessTrackerData'));
        data.metricLogs = [
          { id: 'synthetic-research-sleep-1', metric: 'sleep', value: 25200, unit: 's', date: '2026-10-25', time: '21:00', note: '', source: 'self-reported' },
          { id: 'synthetic-research-sleep-2', metric: 'sleep', value: 25200, unit: 's', date: '2026-10-26', time: '21:00', note: '', source: 'self-reported' },
          { id: 'synthetic-research-sleep-3', metric: 'sleep', value: 25200, unit: 's', date: '2026-10-27', time: '21:00', note: '', source: 'self-reported' },
          { id: 'synthetic-research-sleep-4', metric: 'sleep', value: 28800, unit: 's', date: '2026-10-28', time: '21:00', note: '', source: 'self-reported' },
        ];
        localStorage.setItem('fitnessTrackerData', JSON.stringify(data));
      });
      await page.locator('[data-action="start-experiment"] button[type="submit"]').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).researchExperiments.length === 1);
      const checkIn = page.locator('form[data-action="check-in"]');
      await checkIn.locator('[name="status"]').selectOption('done');
      await checkIn.locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.getElementById('research-status').textContent.includes('Saved done'));
      const comparison = await page.locator('.research-experiment-result').innerText();
      assert.match(comparison, /Adherence: 100%/);
      assert.match(comparison, /baseline 25200/);
      assert.match(comparison, /during 28800/);
      assert.match(comparison, /Personal observation only/);
      await page.locator('#research-search').fill('no matching research result');
      await page.waitForFunction(() => document.getElementById('research-library').textContent.includes('No saved videos match'));
      assert.match(await page.locator('#research-library').innerText(), /No saved videos match/);
      await page.locator('#research-search').fill('');
      await page.locator('#research-experiments-dialog .research-close').click();
      await hidden('#research-experiments-dialog');
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#app-title-name').waitFor({ state: 'visible' });
      await click('#research-open');
      await visible('#research-experiments-dialog');
      savedResearch = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).latestResearch);
      assert.equal(savedResearch.length, 2, 'Research entries persist after reload');
      assert.equal(await page.locator('.research-experiment-card').count(), 1, 'Experiment and check-in persist after reload');
      await page.locator('.research-card').filter({ hasText: 'Synthetic YouTube lmnopqrstuv' }).locator('[data-action="delete-research"]').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).latestResearch.length === 1);
      await page.locator('#research-experiments-dialog .research-close').click();
      await hidden('#research-experiments-dialog');
      console.log(`${name}: research URL/oEmbed, offline transcript save, best-effort captions, consented protocol, local experiment, comparison and reload persistence verified`);

      const recordsBeforeLock = await page.evaluate(() => localStorage.getItem('fitnessTrackerData'));
      const modelCallsBeforeLock = hostedRequests.length;
      const deniedWallet = '0x' + '34'.repeat(20);
      activeWallet = deniedWallet;
      await Promise.all([
        page.waitForNavigation(),
        page.evaluate(address => window.__smokeEmitWalletEvent('accountsChanged', [address]), deniedWallet),
      ]);
      await page.waitForFunction(() => window.__bignutenProfileIsReady === true);
      await page.waitForFunction(() => document.getElementById('assistant-access-status')?.textContent.includes('not enabled'));
      assert.ok(deniedChallenges >= 1 && deniedChallenges <= 2, 'The uninvited wallet challenge is rejected, with at most one reload retry');
      assert.equal(await page.locator('.genie-icon-btn').count(), 0);
      assert.equal(await page.locator('.genie-chat-window').count(), 0);
      assert.equal(await page.locator('#yoga-genie-btn').isVisible(), false);
      await visible('#dietBtn');
      assert.equal(await page.locator('#dietNutritionGenie').isVisible(), false);
      const deniedProfile = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')));
      assert.equal(deniedProfile.emotions.length, 0, 'another wallet sees its own empty local profile, not the previous wallet records');
      assert.equal(hostedRequests.length, modelCallsBeforeLock, 'Uninvited wallet sends no model context');
      activeWallet = wallet;
      await Promise.all([
        page.waitForNavigation(),
        page.evaluate(address => window.__smokeEmitWalletEvent('accountsChanged', [address]), wallet),
      ]);
      await page.waitForFunction(() => window.__bignutenProfileIsReady === true);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).emotions.some(entry => entry.emotion === 'Joy')), true, 'switching back restores the active wallet profile after the explicit snapshot restore');
      walletGranted = false;
      await Promise.all([
        page.waitForNavigation(),
        page.evaluate(async () => {
          localStorage.setItem('storageMode', 'json-only');
          const { setManualPinataToken } = await import('/js/ipfsStorage.js');
          setManualPinataToken('synthetic-disconnect-jwt', { persist: true });
          window.__smokeEmitWalletEvent('accountsChanged', []);
        }),
      ]);
      await page.waitForFunction(() => window.__bignutenProfileIsReady === true);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('bignuten.pinata.jwt.session')), null, 'Wallet disconnect clears the session JWT');
      assert.equal(await page.evaluate(() => localStorage.getItem('bignuten.pinata.jwt.persisted')), null, 'Wallet disconnect clears explicitly persisted JWTs too');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).emotions.some(entry => entry.emotion === 'Synthetic calm')), true, 'wallet disconnect returns to the intact guest profile');
      console.log(`${name}: real HTTP 403 fixture locks Genie, wallet switching isolates profiles, and reconnect/disconnect preserves prior data`);
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
      // Editing the card or food intentionally aborts an in-flight auto-fill request.
      const canceledRequest = /^https:\/\/(nutrition\.fixture|bignuten-nutrition\.onrender\.com)\/(foods|lookup|challenge): net::ERR_ABORTED$/;
      assert.deepEqual(failed.filter(failure => !['403 https://bignuten-nutrition.onrender.com/challenge', '502 https://nutrition.fixture/lookup'].includes(failure) && !canceledRequest.test(failure)), [], 'No failed requests beyond deliberate invitation/provider failures or canceled requests during profile switches');
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
