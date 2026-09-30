'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ethers } = require('ethers');

test('builds unique ArtFi router payouts grouped by recipient with exact BNUT units', async () => {
  const { prepareDataSharingRouterPayouts } = await import('../js/dataSharing.js');
  const config = {
    repositorySlug: 'TheJollyLaMa/BigNuten_Vanilla',
    asset: { symbol: 'BNUT', decimals: 18 },
  };
  const payouts = prepareDataSharingRouterPayouts([
    { walletAddress: '0x0000000000000000000000000000000000000001', amount: '50', ref: 'opt-in' },
    { walletAddress: '0x0000000000000000000000000000000000000001', amount: '25.5', ref: 'week:1' },
    { walletAddress: '0x0000000000000000000000000000000000000002', amount: '25', ref: 'week:1' },
  ], ethers, config);

  assert.equal(payouts.length, 2);
  assert.equal(payouts[0].wallet, '0x0000000000000000000000000000000000000001');
  assert.deepEqual(payouts[0].amounts, [ethers.parseEther('50'), ethers.parseEther('25.5')]);
  assert.equal(payouts[1].amounts[0], ethers.parseEther('25'));
  assert.equal(new Set(payouts.flatMap(payout => payout.workReferences)).size, 3);
  assert.deepEqual(payouts[0].metadataUris, ['data-sharing:opt-in', 'data-sharing:week:1']);
  assert.ok(payouts.every(payout => payout.repositoryIdHashes.every(hash => hash === ethers.keccak256(ethers.toUtf8Bytes(config.repositorySlug)))));
  const retry = prepareDataSharingRouterPayouts([
    { walletAddress: '0x0000000000000000000000000000000000000001', amount: '50', ref: 'opt-in' },
    { walletAddress: '0x0000000000000000000000000000000000000001', amount: '25.5', ref: 'week:1' },
    { walletAddress: '0x0000000000000000000000000000000000000002', amount: '25', ref: 'week:1' },
  ], ethers, config);
  assert.deepEqual(retry.map(payout => payout.workReferences), payouts.map(payout => payout.workReferences));
});

test('rejects invalid wallets and non-positive reward values before preparing a router call', async () => {
  const { prepareDataSharingRouterPayouts } = await import('../js/dataSharing.js');
  const config = { repositorySlug: 'BigNuten', asset: { decimals: 18 } };
  assert.throws(() => prepareDataSharingRouterPayouts([
    { walletAddress: 'not-an-address', amount: '50', ref: 'opt-in' },
  ], ethers, config), /Invalid reward wallet/);
  assert.throws(() => prepareDataSharingRouterPayouts([
    { walletAddress: '0x0000000000000000000000000000000000000001', amount: '0', ref: 'opt-in' },
  ], ethers, config), /greater than zero/);
});
