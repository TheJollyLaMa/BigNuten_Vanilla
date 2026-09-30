/**
 * js/contracts.js
 * BigNuten Mainnet Contract Addresses — Base default; Optimism retained as legacy record
 *
 * This file is the single source of truth for all deployed contract addresses,
 * network metadata, and token configuration used across the BigNuten app.
 *
 * Usage:
 *   Load this script (non-module) in index.html BEFORE any ES modules so that
 *   window.CONTRACTS and the individual window.*_CONTRACT_ADDRESS globals are
 *   available to every module on page load.
 *
 *   <script src="js/contracts.js"></script>
 */

(function initBigNutenContracts(global) {
  const STORAGE_KEY = 'bignuten.activeNetwork';
  const DEFAULT_NETWORK_KEY = 'base';

  const NETWORKS = {
    base: {
      key: 'base',
      label: 'Base Mainnet',
      shortLabel: 'Base',
      chainId: 8453,
      hexChainId: '0x2105',
      chainName: 'Base Mainnet',
      rpcUrl: 'https://mainnet.base.org',
      explorerBaseUrl: 'https://basescan.org',
      explorerAddressUrl: 'https://basescan.org/address/',
      explorerTxUrl: 'https://basescan.org/tx/',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      bnut: '0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736',
      networkRegistry: '0x0670B43b689D51Fd04741b52507D4f87c24A5E75',
      treasury: '0x9aC977ED07953B97575CdE424C9bb67b53D9D09E',
      subscription: '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d',
      governance: '0x9c9AE39400b9c723Dd395211aB643EAC3dFBFC5a',
      dnftEscrow: '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d',
      dnft: '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B',
      usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      aaveV3Pool: '',
      alchemistV2: '',
      streakBetEscrow: '0xFfd8453Ee3b2fF62DC2132Dd59a42F9f50447C95',
      ethPlanId: 0,
      bnutPlanId: 1,
    },
    optimism: {
      key: 'optimism',
      label: 'Optimism Mainnet',
      shortLabel: 'Optimism',
      chainId: 10,
      hexChainId: '0xa',
      chainName: 'Optimism Mainnet',
      rpcUrl: 'https://optimism-rpc.publicnode.com',
      explorerBaseUrl: 'https://optimistic.etherscan.io',
      explorerAddressUrl: 'https://optimistic.etherscan.io/address/',
      explorerTxUrl: 'https://optimistic.etherscan.io/tx/',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      bnut: '0x733c4d2Aae900E608147dd89Fa93606f89722823',
      networkRegistry: '',
      treasury: '0x143cC41AC075FFA40be1993827DA6ffB4638A363',
      subscription: '0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e',
      governance: '0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD',
      dnftEscrow: '0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e',
      dnft: '0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958',
      usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      aaveV3Pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      alchemistV2: '0x10294d57A419C8eb78C648372c5bAA27fD1484af',
      streakBetEscrow: '0x80f6492eFD6D27c877B2bd0936451f7AF61c7215',
      ethPlanId: 0,
      bnutPlanId: 1,
    },
  };

  function cloneNetworkConfig(network) {
    const config = {
      ...network,
      bnutToken: {
        symbol: 'BNUT',
        name: 'BigNuten',
        decimals: 18,
        address: network.bnut,
        chainId: network.chainId,
        coinImage: 'img/BigNuten.png',
      },
    };
    return config;
  }

  function getNetworkConfig(key) {
    return cloneNetworkConfig(NETWORKS[key] || NETWORKS[DEFAULT_NETWORK_KEY]);
  }

  function getStoredNetworkKey() {
    return DEFAULT_NETWORK_KEY;
  }

  function networkKeyForChainId(chainId) {
    return Object.keys(NETWORKS).find(key => Number(NETWORKS[key].chainId) === Number(chainId)) || null;
  }

  function getExplorerUrl(kind, value, key) {
    const cfg = getNetworkConfig(key || global.BIGNUTEN_ACTIVE_NETWORK_KEY || DEFAULT_NETWORK_KEY);
    if (!value) return '';
    if (kind === 'tx') return `${cfg.explorerTxUrl}${value}`;
    if (kind === 'address') return `${cfg.explorerAddressUrl}${value}`;
    return cfg.explorerBaseUrl;
  }

  function applyNetworkGlobals(key, { persist = true } = {}) {
    const activeKey = NETWORKS[key] ? key : DEFAULT_NETWORK_KEY;
    const config = getNetworkConfig(activeKey);

    global.BIGNUTEN_NETWORKS = NETWORKS;
    global.BIGNUTEN_NETWORK_STORAGE_KEY = STORAGE_KEY;
    global.BIGNUTEN_DEFAULT_NETWORK_KEY = DEFAULT_NETWORK_KEY;
    global.BIGNUTEN_ACTIVE_NETWORK_KEY = activeKey;
    global.BIGNUTEN_ACTIVE_NETWORK = config;

    global.BNUT_CONTRACT_ADDRESS = config.bnut;
    global.BIGNUTEN_NETWORK_REGISTRY_ADDRESS = config.networkRegistry;
    global.TREASURY_CONTRACT_ADDRESS = config.treasury;
    global.SUBSCRIPTION_CONTRACT_ADDRESS = config.subscription;
    global.GOVERNANCE_CONTRACT_ADDRESS = config.governance;
    global.DNFT_ESCROW_ADDRESS = config.dnftEscrow;
    global.DNFT_CONTRACT_ADDRESS = config.dnft;
    global.USDC_ADDRESS = config.usdc;
    global.AAVE_V3_POOL_ADDRESS = config.aaveV3Pool;
    global.ALCHEMIST_V2_ADDRESS = config.alchemistV2;
    global.STREAK_BET_ESCROW_ADDRESS = config.streakBetEscrow;
    global.BIGNUTEN_ETH_PLAN_ID = config.ethPlanId;
    global.BIGNUTEN_BNUT_PLAN_ID = config.bnutPlanId;
    global.CONTRACTS = config;

    if (persist) {
      try {
        global.localStorage.setItem(STORAGE_KEY, activeKey);
      } catch {
        // Ignore storage failures (private mode, restricted environments, etc.)
      }
    }

    global.dispatchEvent(new CustomEvent('bignuten:network-changed', {
      detail: { key: activeKey, config },
    }));

    return config;
  }

  global.getBigNutenNetworkConfig = getNetworkConfig;
  global.getActiveBigNutenNetwork = function getActiveBigNutenNetwork() {
    return getNetworkConfig(global.BIGNUTEN_ACTIVE_NETWORK_KEY || getStoredNetworkKey());
  };
  global.setActiveBigNutenNetwork = applyNetworkGlobals;
  global.getBigNutenExplorerUrl = getExplorerUrl;

  global.syncBigNutenNetworkFromWallet = async function syncBigNutenNetworkFromWallet({ warn = true, reload = false } = {}) {
    if (!global.ethereum) return { matched: false, reason: 'MetaMask unavailable' };
    const chainId = Number.parseInt(await global.ethereum.request({ method: 'eth_chainId' }), 16);
    const key = networkKeyForChainId(chainId);
    if (!key) {
      if (warn) global.alert(`⚠️ BigNuten does not have a configured contract context for chain ${chainId}. Switch back to Base (8453) or a supported legacy chain.`);
      return { matched: false, chainId };
    }
    const config = applyNetworkGlobals(key, { persist: false });
    if (warn && chainId !== 8453) {
      global.alert(`⚠️ You are using ${config.label}. Base is BigNuten's primary network; this network uses legacy contracts and balances. Contract state is network-specific.`);
    }
    if (reload) global.location.reload();
    return { matched: true, key, config };
  };

  applyNetworkGlobals(getStoredNetworkKey(), { persist: false });
})(window);
