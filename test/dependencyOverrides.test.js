const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { mkdirSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { randomUUID } = require('node:crypto');

const fromHardhat = createRequire(require.resolve('hardhat/package.json'));
const fromSolc = createRequire(fromHardhat.resolve('solc/package.json'));
const fromReporter = createRequire(require.resolve('eth-gas-reporter/package.json'));
const fromLegacyEthers = createRequire(fromReporter.resolve('ethers/package.json'));

function workspace(t) {
  const dir = resolve('test-results', `dependency-audit-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('scoped audit overrides resolve from their actual consumers', () => {
  const fromProviders = createRequire(fromLegacyEthers.resolve('@ethersproject/providers/package.json'));
  const fromSentry = createRequire(fromHardhat.resolve('@sentry/node/package.json'));
  const fromVerify = createRequire(require.resolve('@nomicfoundation/hardhat-verify/package.json'));
  assert.equal(fromProviders('ws/package.json').version, '8.21.0');
  assert.equal(fromHardhat('ws/package.json').version, '7.5.13');
  assert.equal(fromVerify('undici/package.json').version, '6.29.1');
  assert.equal(fromSentry('cookie/package.json').version, '0.7.2');
  const uuid = fromHardhat('uuid');
  assert.equal(fromHardhat('uuid/package.json').version, '11.1.1');
  assert.ok(uuid.validate(uuid.v4()));
  const fromMocha = createRequire(fromHardhat.resolve('mocha/package.json'));
  const diff = fromMocha('diff');
  assert.equal(fromMocha('diff/package.json').version, '8.0.3');
  assert.equal(diff.applyPatch('before\n', diff.createPatch('fixture', 'before\n', 'after\n')), 'after\n');
  assert.deepEqual(fromSentry('cookie').parse('audit=fixture'), { audit: 'fixture' });
  for (const consumer of ['ethjs-unit', 'number-to-bn', 'elliptic']) {
    const fromConsumer = createRequire(require.resolve(`${consumer}/package.json`));
    assert.equal(fromConsumer('bn.js/package.json').version, '4.12.5');
  }
});

test('Hardhat HTTP provider keeps its JSON-RPC API with scoped Undici 6', async (t) => {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const rpc = JSON.parse(body);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: '0x7a69' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const { Pool } = fromHardhat('undici');
  const pool = new Pool(url);
  t.after(async () => {
    await pool.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const { HttpProvider } = require('hardhat/internal/core/providers/http');
  const provider = new HttpProvider(url, 'audit-fixture', {}, 2000, pool);
  assert.equal(await provider.request({ method: 'eth_chainId', params: [] }), '0x7a69');
});

test('Hardhat ZIP extraction API remains compatible with adm-zip 0.6.1', (t) => {
  const dir = workspace(t);
  const AdmZip = fromHardhat('adm-zip');
  const archive = new AdmZip();
  archive.addFile('solc.exe', Buffer.from('local compiler download fixture'));
  new AdmZip(archive.toBuffer()).extractAllTo(dir);
  assert.equal(readFileSync(join(dir, 'solc.exe'), 'utf8'), 'local compiler download fixture');
});

test('solc retains tmp.fileSync and cleanup without changing the compiler', (t) => {
  assert.equal(fromHardhat('solc/package.json').version, '0.8.26');
  assert.equal(fromSolc('tmp/package.json').version, '0.2.7');
  const dir = workspace(t);
  const file = fromSolc('tmp').fileSync({ tmpdir: dir, postfix: '.smt2' });
  assert.ok(existsSync(file.name));
  file.removeCallback();
  assert.equal(existsSync(file.name), false);
});

test('legacy gas-reporter ethers keeps signing and recovery with patched bn.js', async () => {
  const { Wallet, utils } = fromReporter('ethers');
  const wallet = new Wallet(`0x${'11'.repeat(32)}`);
  const signature = await wallet.signMessage('audit test fixture; no funds');
  assert.equal(utils.verifyMessage('audit test fixture; no funds', signature), wallet.address);
});
