// A local Hardhat source node is forked, never a public network. No production
// RPC, mnemonic, private key, wallet or deployment file is used as a connection.
const hre = require('hardhat');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { deployRehearsal } = require('./rehearsalFixture');

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function main() {
  if (hre.network.name !== 'hardhat') throw new Error('REHEARSAL ONLY: HARDHAT_NETWORK must be hardhat');
  await hre.run('compile', { quiet: true });
  const { assertRehearsalTransaction } = await import('../js/streakRehearsal.mjs');
  const reservation = createServer();
  const sourcePort = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const sourceUrl = `http://127.0.0.1:${sourcePort}`;
  const source = spawn(process.execPath, [
    require.resolve('hardhat/internal/cli/cli'), 'node', '--hostname', '127.0.0.1', '--port', String(sourcePort),
  ], { cwd: path.join(__dirname, '..'), env: { ...process.env, HARDHAT_NETWORK: 'hardhat' }, stdio: 'ignore' });
  let server;
  let browser;
  const transactions = [];
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(sourceUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        });
        ready = (await response.json()).result === '0x7a69';
        if (ready) break;
      } catch { /* The child is still starting. */ }
      if (source.exitCode !== null) throw new Error('Local source node exited before readiness');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Local source node must be responsive');
    await hre.network.provider.request({ method: 'hardhat_reset', params: [{ forking: { jsonRpcUrl: sourceUrl } }] });
    const metadata = await hre.network.provider.request({ method: 'hardhat_metadata' });
    assert.ok(metadata.forkedNetwork, 'Browser run must use a real local fork');
    const fixture = await deployRehearsal(hre);
    const readableMethods = new Set([
      'eth_chainId', 'eth_accounts', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBalance',
      'eth_getCode', 'eth_call', 'eth_getTransactionCount', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
      'eth_feeHistory', 'eth_getTransactionByHash', 'eth_getTransactionReceipt',
      'evm_setNextBlockTimestamp', 'evm_mine',
    ]);
    const interfaces = Object.fromEntries(Object.entries(fixture.contracts).map(([key, spec]) =>
      [spec.address.toLowerCase(), { key, iface: new hre.ethers.Interface(spec.abi) }]));
    const allowedWrites = {
      token: new Set(['approve']),
      escrow: new Set(['createCompetition', 'configureStreakChallenge', 'joinCompetition', 'submitReport',
        'scheduleMeetup', 'selfCheckInMeetup', 'reviewMeetupAttendance', 'inviteMeetupReviewer',
        'settleCompetition', 'cancelCompetition', 'forfeit']),
    };
    async function rpc(request) {
      const { method, params = [], id } = request;
      try {
        if (method === 'eth_sendTransaction' || method === 'eth_estimateGas') {
          const tx = params[0];
          assertRehearsalTransaction(fixture, tx);
          const target = interfaces[tx.to.toLowerCase()];
          const decoded = target.iface.parseTransaction({ data: tx.data, value: tx.value || 0 });
          assert.ok(allowedWrites[target.key]?.has(decoded.name), 'Rehearsal method not allowed');
          if (decoded.name === 'approve') {
            assert.equal(decoded.args[0].toLowerCase(), fixture.contracts.escrow.address.toLowerCase());
            assert.equal(decoded.args[1], hre.ethers.parseEther('10'), 'Only exact fake stakes may be approved');
          }
          if (decoded.name === 'createCompetition') {
            assert.equal(decoded.args[0].stakeToken.toLowerCase(), fixture.contracts.token.address.toLowerCase());
            assert.equal(decoded.args[0].yieldEnabled, false);
          }
          if (method === 'eth_sendTransaction') transactions.push({ to: tx.to, value: tx.value || '0x0', method: decoded.name });
        } else {
          assert.ok(readableMethods.has(method), `RPC method blocked: ${method}`);
          if (method === 'eth_call') assertRehearsalTransaction(fixture, { ...params[0], from: fixture.accounts[0] });
        }
        const result = await hre.network.provider.request({ method, params });
        return { jsonrpc: '2.0', id, result };
      } catch (error) {
        return { jsonrpc: '2.0', id, error: { code: -32000, message: error.message } };
      }
    }
    const assets = {
      '/': ['rehearsal.html', 'text/html'],
      '/rehearsal.html': ['rehearsal.html', 'text/html'],
      '/rehearsal-ethers.js': ['node_modules/ethers/dist/ethers.umd.min.js', 'text/javascript'],
      '/js/streakRehearsal.mjs': ['js/streakRehearsal.mjs', 'text/javascript'],
      '/js/streakRehearsalPage.mjs': ['js/streakRehearsalPage.mjs', 'text/javascript'],
    };
    server = createServer(async (req, res) => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
        res.writeHead(403).end(); return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");
      try {
        if (req.url === '/rehearsal-rpc' && req.method === 'POST' && req.headers['content-type'] === 'application/json') {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 65536) throw new Error('RPC body too large');
          }
          const request = JSON.parse(body);
          const result = Array.isArray(request) ? await Promise.all(request.map(rpc)) : await rpc(request);
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
        } else if (req.url === '/rehearsal-fixture.json' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(fixture));
        } else if (assets[req.url] && req.method === 'GET') {
          const [file, type] = assets[req.url];
          res.writeHead(200, { 'Content-Type': type }).end(await readFile(path.join(__dirname, '..', file)));
        } else res.writeHead(404).end();
      } catch (error) { res.writeHead(400).end(error.message); }
    });
    const port = await listen(server);
    const url = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(url)).status, 200, 'Rehearsal UI must respond');
    console.log(`TEST MODE: local fork rehearsal at ${url} — fake tokens; NO REAL FUNDS`);
    if (process.argv.includes('--serve')) {
      await new Promise(resolve => {
        process.once('SIGINT', resolve);
        process.once('SIGTERM', resolve);
      });
      return;
    }
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === url) return route.continue();
      errors.push(`External network request blocked: ${route.request().url()}`);
      return route.abort();
    });
    await page.addInitScript(() => {
      window.rehearsalWalletCalls = 0;
      window.ethereum = { request() {
        window.rehearsalWalletCalls++;
        throw new Error('A real wallet must NEVER be called');
      } };
    });
    await page.goto(url);
    assert.match(await page.locator('#test-mode').innerText(), /TEST MODE.*LOCAL FORK/);
    assert.match(await page.locator('body').innerText(), /fake token with no value/);
    for (let index = 0; index < 13; index++) {
      await page.waitForFunction(() => !document.getElementById('next').disabled ||
        document.getElementById('status').dataset.state === 'error');
      assert.equal(await page.locator('#status').getAttribute('data-state'), null, await page.locator('#status').innerText());
      await page.locator('#next').click();
      await page.waitForFunction(count =>
        document.querySelectorAll('#completed li').length === count ||
        document.getElementById('status').dataset.state === 'error', index + 1);
      assert.equal(await page.locator('#completed li').count(), index + 1, await page.locator('#status').innerText());
      if (index === 5) assert.equal(await page.locator('#reviewer-queue li').count(), 2);
      if (index === 6) assert.match(await page.locator('#reviewer-queue').innerText(), /Alice.*DISPUTED.*captain must invite/);
      if (index === 7) assert.match(await page.locator('#reviewer-queue').innerText(), /guest invited; awaiting tie-break/);
      if (index === 8) assert.match(await page.locator('#reviewer-queue').innerText(), /No pending reviews/);
    }
    assert.match(await page.locator('#status').innerText(), /^PASS/);
    assert.ok(await page.locator('[data-state="pending"]').count() > 0);
    assert.ok(await page.locator('[data-state="confirmed"]').count() > 0);
    assert.equal(await page.evaluate(() => window.rehearsalWalletCalls), 0);
    assert.deepEqual(errors, []);
    // Exercise server guards, not just client-side validation.
    const rejected = async (method, params) => {
      const response = await fetch(`${url}/rehearsal-rpc`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      assert.ok((await response.json()).error, `${method} must be blocked`);
    };
    await rejected('eth_sendTransaction', [{ from: fixture.accounts[0], to: fixture.forbidden[0], value: '0x0' }]);
    await rejected('eth_sendTransaction', [{ from: fixture.accounts[0], to: fixture.contracts.escrow.address, value: '0x1' }]);
    await rejected('eth_sendRawTransaction', ['0x00']);
    await rejected('hardhat_reset', []);
    assert.equal((await fetch(url, { headers: { Origin: 'https://example.invalid' } })).status, 403);
    assert.equal(transactions.length, 40);
    assert.ok(transactions.every(tx => BigInt(tx.value) === 0n && !fixture.forbidden.includes(tx.to.toLowerCase())));
    assert.ok(!transactions.some(tx => /Aave|transfer|mint/i.test(tx.method)));
    await mkdir('test-results/rehearsal', { recursive: true });
    await page.screenshot({ path: 'test-results/rehearsal/complete.png', fullPage: true });
    await writeFile('test-results/rehearsal/result.json', JSON.stringify({
      mode: 'REHEARSAL', chainId: 31337, localFork: true, actions: 13,
      realFunds: false, transactions,
    }, null, 2));
    console.log(`PASS: 13 local-fork browser actions, ${transactions.length} confirmed fake-token transactions; 5 server guard checks`);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    source.kill('SIGTERM');
    await new Promise(resolve => {
      if (source.exitCode !== null || source.signalCode !== null) resolve();
      else source.once('exit', resolve);
    });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
