const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const modulePromise = import('../js/supporterToken.mjs');
const config = {
  contract: '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B', tokenId: '406', listingId: '42',
  paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', expectedPriceAmount: '10000000',
  metadataUri: 'ipfs://synthetic-metadata', imageUri: 'https://example.test/supporter.png',
};
const listing = { nftContract: config.contract, tokenId: 406n, priceETH: 0n,
  priceToken: config.paymentToken, priceAmount: 10000000n, available: 3n, active: true };

test('reviewed config: unset is coming soon; valid pins support zero IDs and large uint256 strings', async () => {
  const { validateSupporterConfig: validate } = await modulePromise;
  assert.equal(validate(null).state, 'coming-soon');
  assert.equal(validate(JSON.parse(readFileSync('js/supporter-token.json'))).state, 'coming-soon');
  assert.equal(validate(config).state, 'configured');
  assert.equal(validate({ ...config, tokenId: '0', listingId: '0' }).state, 'configured');
  assert.equal(validate({ ...config, tokenId: (2n ** 255n).toString() }).state, 'configured');
  for (const patch of [{ contract: '0x' + '11'.repeat(20) }, { paymentToken: '0x' + '22'.repeat(20) },
    { tokenId: 406 }, { listingId: '-1' }, { listingId: '1.2' }, { listingId: (2n ** 256n).toString() },
    { expectedPriceAmount: '0' }, { imageUri: 'javascript:alert(1)' }, { metadataUri: null }]) {
    assert.equal(validate({ ...config, ...patch }).state, 'failed', JSON.stringify(patch));
  }
  assert.equal(validate({ listingId: '42' }).state, 'failed');
});

test('listing must exactly match all reviewed terms and escrow must cover all available stock', async () => {
  const { validateSupporterListing: validate } = await modulePromise;
  assert.equal(validate(config, listing, 3n).state, 'ready');
  assert.equal(validate(config, listing, 4n).state, 'ready');
  assert.equal(validate(config, { ...listing, nftContract: config.contract.toLowerCase() }, 3n).state, 'ready');
  for (const patch of [{ nftContract: '0x' + '11'.repeat(20) }, { tokenId: 407n }, { priceETH: 1n },
    { priceToken: '0x' + '00'.repeat(20) }, { priceAmount: 1n }, { active: false }, { available: -1n }]) {
    assert.equal(validate(config, { ...listing, ...patch }, 3n).state, 'failed');
  }
  assert.equal(validate(config, listing, 2n).state, 'failed');
  assert.equal(validate(config, { ...listing, available: 0n }, 0n).state, 'sold-out');
  assert.equal(validate(config, {}, 0n).state, 'failed');
  assert.equal(validate(null, listing, 3n).state, 'coming-soon');
});

test('retired support service is absent from first-party app, styles, and documentation', () => {
  const retired = new RegExp(['arti', 'zen'].join(''), 'i');
  const files = ['index.html', 'README.md'];
  function collect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) collect(path);
      else if (/\.(?:md|html|css|m?js|json)$/i.test(path)) files.push(path);
    }
  }
  for (const dir of ['js', 'css', 'docs']) collect(dir);
  for (const path of files) assert.doesNotMatch(readFileSync(path, 'utf8'), retired, path);
});

test('shared controller guards Base/account changes, adds Base, skips sufficient allowance, and revalidates after approval', async () => {
  const { BASE_SUPPORTER, createSupporterController } = await modulePromise;
  const previousWindow = global.window, previousDocument = global.document;
  try {
    for (const scenario of ['unset', 'unknown-chain', 'allowance', 'changed-listing', 'changed-account', 'rejected', 'wrong-network', 'read-failed']) {
      const writes = [], walletCalls = [];
      let chain = '0x1', approved = false, switched = false, account = '0x' + '12'.repeat(20);
      const elements = Object.fromEntries(['[data-supporter-buy]', '[data-supporter-terms]', '[data-supporter-status]'].map(key => [key, {
        textContent: '', disabled: true, append() {}, addEventListener(_name, listener) { this.click = listener; },
      }]));
      const root = { dataset: {}, querySelector: key => elements[key], querySelectorAll: key => [elements[key]] };
      global.document = { createElement: () => ({}) };
      global.window = { ethereum: { async request({ method, params }) {
        walletCalls.push(method);
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
        if (method === 'eth_chainId') return chain;
        if (method === 'wallet_addEthereumChain') {
          assert.equal(params[0].chainId, '0x2105'); return null;
        }
        if (method === 'wallet_switchEthereumChain') {
          assert.equal(params[0].chainId, '0x2105');
          if (scenario === 'rejected') throw Object.assign(new Error('Rejected'), { code: 4001 });
          if (scenario === 'unknown-chain' && !switched) {
            switched = true; throw Object.assign(new Error('Unknown chain'), { code: 4902 });
          }
          if (scenario !== 'wrong-network') chain = '0x2105';
          return null;
        }
        throw new Error(`Unexpected request: ${method}`);
      } } };
      const escrow = {
        async getListing(id) {
          assert.equal(id, '42');
          if (scenario === 'read-failed') throw new Error('RPC unavailable');
          return { ...listing, tokenId: scenario === 'changed-listing' && approved ? 999n : listing.tokenId };
        },
        async getNFTBalance(nft, id) { assert.equal(nft, config.contract); assert.equal(id, config.tokenId); return 3n; },
        async purchaseWithToken(id, amount) {
          writes.push(['purchase', id, amount]);
          return { hash: '0x' + 'ab'.repeat(32), async wait() {} };
        },
      };
      const token = {
        async allowance() {
          if (scenario === 'changed-account') account = '0x' + '34'.repeat(20);
          return scenario === 'allowance' ? 10000000n : 0n;
        },
        async approve(spender, amount) {
          writes.push(['approve', spender, amount]);
          return { async wait() { approved = true; } };
        },
      };
      const ethers = {
        formatUnits: () => '10.0',
        JsonRpcProvider: class { destroy() {} },
        BrowserProvider: class { async getSigner() { return {}; } },
        Contract: class { constructor(address) { return address === BASE_SUPPORTER.escrowAddress ? escrow : token; } },
      };
      const controller = createSupporterController({ roots: [root], ethers,
        network: { rpcUrl: 'https://example.test', chainId: 8453 }, escrowAbi: [], erc20Abi: [],
        loadConfig: async () => scenario === 'unset' ? null : config });
      await controller.refresh();
      if (scenario === 'unset' || scenario === 'read-failed') {
        assert.equal(root.dataset.supporterState, scenario === 'unset' ? 'coming-soon' : 'failed');
        await elements['[data-supporter-buy]'].click();
        assert.deepEqual(walletCalls, []);
      } else {
        assert.equal(root.dataset.supporterState, 'ready');
        await elements['[data-supporter-buy]'].click();
        if (scenario === 'allowance' || scenario === 'unknown-chain') {
          assert.equal(root.dataset.supporterState, 'success');
          assert.deepEqual(writes.at(-1), ['purchase', '42', 1]);
          if (scenario === 'allowance') assert.equal(writes.length, 1);
          else {
            assert.ok(walletCalls.includes('wallet_addEthereumChain'));
            assert.equal(walletCalls.filter(method => method === 'wallet_switchEthereumChain').length, 2);
            assert.deepEqual(writes[0], ['approve', BASE_SUPPORTER.escrowAddress, config.expectedPriceAmount]);
          }
        } else {
          assert.equal(root.dataset.supporterState, scenario === 'rejected' ? 'user-rejected' : scenario === 'wrong-network' ? 'wrong-network' : 'failed');
          assert.equal(writes.some(write => write[0] === 'purchase'), false);
          assert.equal(writes.length, scenario === 'changed-listing' ? 1 : 0);
        }
      }
      assert.equal(elements['[data-supporter-buy]'].disabled, true, scenario);
    }
  } finally { global.window = previousWindow; global.document = previousDocument; }
});
