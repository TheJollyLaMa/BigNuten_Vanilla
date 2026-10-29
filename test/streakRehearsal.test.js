const { test } = require('node:test');
const assert = require('node:assert/strict');

const address = number => `0x${String(number).padStart(40, '0')}`;
const fixture = {
  mode: 'REHEARSAL', chainId: 31337, forbidden: [address(9)],
  contracts: { token: { address: address(1) }, escrow: { address: address(2) } },
  accounts: [address(3)],
};

test('rehearsal accepts loopback HTTP only, not public/testnet RPCs or embedded credentials', async () => {
  const { assertLocalRehearsalUrl } = await import('../js/streakRehearsal.mjs');
  for (const url of ['http://127.0.0.1:1234', 'http://localhost:1234', 'http://[::1]:1234']) assertLocalRehearsalUrl(url);
  for (const url of ['https://mainnet.base.org', 'https://sepolia.base.org', 'http://localhost.evil.invalid', 'http://user:pass@localhost']) {
    assert.throws(() => assertLocalRehearsalUrl(url), /REHEARSAL ONLY/);
  }
});

test('rehearsal blocks production, unknown targets, native stakes, contract creation and non-disposable senders', async () => {
  const { assertRehearsalTransaction: guard } = await import('../js/streakRehearsal.mjs');
  const tx = { from: address(3), to: address(1), value: '0x0' };
  guard(fixture, tx);
  for (const changed of [
    { to: address(9) }, { to: address(8) }, { to: null }, { value: '0x1' }, { from: address(8) },
  ]) assert.throws(() => guard(fixture, { ...tx, ...changed }), /REHEARSAL ONLY/);
  assert.throws(() => guard({ ...fixture, forbidden: [address(1)] }, tx), /production/);
});

test('rehearsal rechecks the chain every action and rejects mainnets, testnets and production addresses', async () => {
  const { assertRehearsalContext: guard } = await import('../js/streakRehearsal.mjs');
  let chainId = 31337;
  const provider = { send: async method => { assert.equal(method, 'eth_chainId'); return chainId; } };
  await guard(provider, fixture);
  for (chainId of [1, 10, 8453, 84532, 11155420]) await assert.rejects(guard(provider, fixture), /REHEARSAL ONLY/);
  chainId = 31337;
  await assert.rejects(guard(provider, { ...fixture, mode: 'LIVE' }), /REHEARSAL ONLY/);
  await assert.rejects(guard(provider, { ...fixture, forbidden: [address(1)] }), /production address/);
});
