// Adapted from DecentBusking about-override.js's reviewed-listing checks and
// approve-then-purchase flow (Apache-2.0); both About surfaces share this controller.
export const BASE_SUPPORTER = Object.freeze({
  chainId: 8453,
  hexChainId: '0x2105',
  escrowAddress: '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d',
  nftAddress: '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B',
  usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
});
const fields = ['contract', 'tokenId', 'listingId', 'paymentToken', 'expectedPriceAmount', 'metadataUri', 'imageUri'];
const sameAddress = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const uint = value => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && BigInt(value) < 2n ** 256n;
const uri = value => typeof value === 'string' && /^(https:\/\/[^\s]+|ipfs:\/\/[A-Za-z0-9][^\s]*)$/.test(value);

export function validateSupporterConfig(config) {
  if (!config || fields.every(field => config[field] == null || config[field] === '')) return { state: 'coming-soon' };
  if (!sameAddress(config.contract, BASE_SUPPORTER.nftAddress)
    || !sameAddress(config.paymentToken, BASE_SUPPORTER.usdcAddress)
    || !uint(config.tokenId) || !uint(config.listingId) || !uint(config.expectedPriceAmount)
    || BigInt(config.expectedPriceAmount) === 0n || !uri(config.metadataUri) || !uri(config.imageUri)) {
    return { state: 'failed', message: 'Supporter config is incomplete or not approved for Base.' };
  }
  return { state: 'configured' };
}

export function validateSupporterListing(config, listing, stock) {
  const checked = validateSupporterConfig(config);
  if (checked.state !== 'configured') return checked;
  try {
    if (!sameAddress(listing.nftContract, config.contract) || BigInt(listing.tokenId) !== BigInt(config.tokenId)
      || BigInt(listing.priceETH) !== 0n || !sameAddress(listing.priceToken, config.paymentToken)
      || BigInt(listing.priceAmount) !== BigInt(config.expectedPriceAmount)) {
      return { state: 'failed', message: 'Live listing differs from the reviewed BigNuten Supporter terms. Purchase disabled.' };
    }
    const available = BigInt(listing.available);
    if (available === 0n) return { state: 'sold-out', available, message: 'Sold out — no BigNuten Supporter Tokens remaining.' };
    if (listing.active !== true || available < 0n || BigInt(stock) < available) {
      return { state: 'failed', message: 'Listing inactive or escrow stock does not cover remaining supply. Purchase disabled.' };
    }
    return { state: 'ready', available };
  } catch {
    return { state: 'failed', message: 'Could not verify the reviewed listing. Purchase disabled.' };
  }
}

function imageUrl(value) {
  return value.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${value.slice(7)}` : value;
}
function errorCode(error) { return error?.code ?? error?.info?.error?.code ?? error?.error?.code; }

export function createSupporterController({ roots, ethers, network, escrowAbi, erc20Abi, loadConfig }) {
  let busy = false, config, ready = false;
  const buttons = roots.flatMap(root => [...root.querySelectorAll('[data-supporter-buy]')]);
  function state(name, message, enabled = false, txHash) {
    for (const root of roots) {
      root.dataset.supporterState = name;
      const stamp = root.querySelector('[data-supporter-stamp]');
      if (stamp) stamp.hidden = name !== 'coming-soon';
      const status = root.querySelector('[data-supporter-status]');
      status.textContent = message;
      if (txHash && /^0x[0-9a-f]{64}$/i.test(txHash)) {
        const link = document.createElement('a');
        link.href = `https://basescan.org/tx/${txHash}`;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'View transaction on Basescan';
        status.append(' ', link);
      }
    }
    for (const button of buttons) {
      button.disabled = !enabled;
      button.textContent = name === 'coming-soon' ? 'Coming soon' : name === 'sold-out' ? 'Sold out'
        : name === 'loading' ? 'Please wait…' : enabled ? 'Buy with USDC on Base' : 'Purchase unavailable';
    }
  }
  async function check(escrow) {
    const listing = await escrow.getListing(config.listingId);
    const stock = await escrow.getNFTBalance(config.contract, config.tokenId);
    const result = validateSupporterListing(config, listing, stock);
    ready = result.state === 'ready';
    if (ready || result.state === 'sold-out') {
      for (const root of roots) root.querySelector('[data-supporter-terms]').textContent =
        `${ethers.formatUnits(config.expectedPriceAmount, 6)} USDC on Base · ${result.available} remaining`;
    }
    if (!ready) {
      if (result.state !== 'sold-out') {
        for (const root of roots) root.querySelector('[data-supporter-terms]').textContent = 'Listing terms unavailable until verified.';
      }
      state(result.state, result.message);
      return false;
    }
    return true;
  }
  async function refresh() {
    if (busy) return;
    busy = true; ready = false;
    for (const root of roots) {
      root.querySelector('[data-supporter-terms]').textContent = 'Price (USDC on Base) and remaining stock pending listing.';
      const image = root.querySelector('.supporter-token-image');
      if (image) { image.onerror = null; image.src = 'img/BigNuten.png'; }
    }
    state('loading', 'Loading reviewed BigNuten Supporter listing…');
    try {
      config = Object.freeze({ ...await loadConfig() });
      const result = validateSupporterConfig(config);
      if (result.state === 'coming-soon') {
        state('coming-soon', 'BigNuten Supporter Token coming soon on Base. No purchase is available yet.');
        return;
      }
      if (result.state !== 'configured') { state(result.state, result.message); return; }
      if (!ethers) throw new Error('Wallet library unavailable. Refresh to try again.');
      for (const root of roots) {
        const image = root.querySelector('.supporter-token-image');
        if (image) {
          // Public IPFS gateways rate-limit; fall back to the bundled copy of the reviewed art, then the app logo.
          image.onerror = () => { image.onerror = () => { image.onerror = null; image.src = 'img/BigNuten.png'; }; image.src = 'img/supporter-token.png'; };
          image.src = imageUrl(config.imageUri);
        }
      }
      const provider = new ethers.JsonRpcProvider(network.rpcUrl, network.chainId, { staticNetwork: true });
      try {
        if (await check(new ethers.Contract(BASE_SUPPORTER.escrowAddress, escrowAbi, provider))) {
          state('ready', 'Reviewed listing verified. Connect MetaMask to purchase one token.', true);
        }
      } finally { provider.destroy(); }
    } catch (error) { state('failed', `Failed to load Supporter listing: ${error.message}`); }
    finally { busy = false; }
  }
  async function buy() {
    if (busy || !ready || validateSupporterConfig(config).state !== 'configured') return;
    busy = true;
    state('loading', 'Connecting MetaMask…');
    try {
      const wallet = window.ethereum;
      if (!wallet) throw new Error('MetaMask not found. Install MetaMask, then reopen About.');
      const accounts = await wallet.request({ method: 'eth_requestAccounts' });
      const buyer = accounts[0];
      if (await wallet.request({ method: 'eth_chainId' }) !== BASE_SUPPORTER.hexChainId) {
        state('wrong-network', 'Wrong network. Switch MetaMask to Base (8453) to continue.');
        try {
          await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_SUPPORTER.hexChainId }] });
        } catch (error) {
          if (errorCode(error) !== 4902) throw error;
          await wallet.request({ method: 'wallet_addEthereumChain', params: [{ chainId: BASE_SUPPORTER.hexChainId,
            chainName: network.chainName, nativeCurrency: network.nativeCurrency,
            rpcUrls: [network.rpcUrl], blockExplorerUrls: ['https://basescan.org'] }] });
          await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_SUPPORTER.hexChainId }] });
        }
      }
      async function guard() {
        if (await wallet.request({ method: 'eth_chainId' }) !== BASE_SUPPORTER.hexChainId) {
          const error = new Error('Wrong network. Switch MetaMask to Base and reopen About.');
          error.code = 'WRONG_NETWORK'; throw error;
        }
        const current = await wallet.request({ method: 'eth_accounts' });
        if (!sameAddress(current[0], buyer)) throw new Error('Wallet changed. Reopen About to retry.');
      }
      await guard();
      const provider = new ethers.BrowserProvider(wallet);
      const signer = await provider.getSigner(buyer);
      const escrow = new ethers.Contract(BASE_SUPPORTER.escrowAddress, escrowAbi, signer);
      const token = new ethers.Contract(config.paymentToken, erc20Abi, signer);
      state('loading', 'Verifying listing and USDC allowance…');
      if (!await check(escrow)) return;
      const allowance = await token.allowance(buyer, BASE_SUPPORTER.escrowAddress);
      if (allowance < BigInt(config.expectedPriceAmount)) {
        if (!await check(escrow)) return;
        await guard();
        state('loading', 'Approve exact USDC amount in MetaMask…');
        const approval = await token.approve(BASE_SUPPORTER.escrowAddress, config.expectedPriceAmount);
        await approval.wait();
      }
      if (!await check(escrow)) return;
      await guard();
      state('loading', 'Confirm purchase in MetaMask…');
      const purchase = await escrow.purchaseWithToken(config.listingId, 1);
      state('loading', 'Waiting for purchase confirmation…');
      await purchase.wait();
      try { await check(escrow); }
      catch {
        for (const root of roots) root.querySelector('[data-supporter-terms]').textContent = 'Reopen About to refresh remaining stock.';
      }
      ready = false;
      state('success', 'Success! BigNuten Supporter Token transferred to your wallet.', false, purchase.hash);
    } catch (error) {
      const code = errorCode(error);
      const rejected = code === 4001 || code === 'ACTION_REJECTED';
      const wrongNetwork = code === 'WRONG_NETWORK' || code === 4902;
      state(rejected ? 'user-rejected' : wrongNetwork ? 'wrong-network' : 'failed', rejected
        ? 'User rejected the wallet request. No purchase completed. Reopen About to retry.'
        : `Purchase failed: ${error.shortMessage || error.message}. Reopen About to retry.`);
      ready = false;
    } finally { busy = false; }
  }
  for (const button of buttons) button.addEventListener('click', buy);
  return { refresh };
}
