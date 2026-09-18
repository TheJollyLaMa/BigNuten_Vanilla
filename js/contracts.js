/**
 * js/contracts.js
 * BigNuten Mainnet Contract Addresses — Base default with Optimism fallback
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
      treasury: '',
      subscription: '',
      governance: '',
      dnftEscrow: '',
      dnft: '',
      usdc: '',
      aaveV3Pool: '',
      alchemistV2: '',
      streakBetEscrow: '',
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
      rpcUrl: 'https://mainnet.optimism.io',
      explorerBaseUrl: 'https://optimistic.etherscan.io',
      explorerAddressUrl: 'https://optimistic.etherscan.io/address/',
      explorerTxUrl: 'https://optimistic.etherscan.io/tx/',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      bnut: '0x733c4d2Aae900E608147dd89Fa93606f89722823',
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
    try {
      const stored = global.localStorage.getItem(STORAGE_KEY);
      return NETWORKS[stored] ? stored : DEFAULT_NETWORK_KEY;
    } catch {
      return DEFAULT_NETWORK_KEY;
    }
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

  applyNetworkGlobals(getStoredNetworkKey(), { persist: false });
})(window);
