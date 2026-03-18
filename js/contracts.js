/**
 * js/contracts.js
 * BigNuten Mainnet Contract Addresses — Optimism (Chain ID 10)
 *
 * This file is the single source of truth for all deployed contract addresses
 * and token metadata used across the BigNuten app, prize flows, and governance.
 *
 * Related issue: #39 — Deploy $BNUT ERC-20 Token & Add to contracts.js
 *
 * Usage:
 *   Load this script (non-module) in index.html BEFORE any ES modules so that
 *   window.CONTRACTS and the individual window.*_CONTRACT_ADDRESS globals are
 *   available to every module on page load.
 *
 *   <script src="js/contracts.js"></script>
 */

// ─── Network ──────────────────────────────────────────────────────────────────

/** Optimism Mainnet chain ID (decimal). */
const OPTIMISM_CHAIN_ID = 10;

/** Public read-only RPC for Optimism Mainnet. */
const OPTIMISM_RPC_URL = 'https://mainnet.optimism.io';

// ─── Contract Addresses ───────────────────────────────────────────────────────

/**
 * $BNUT ERC-20 governance & rewards token.
 * Deployed on Optimism Mainnet.
 * Symbol: BNUT | Decimals: 18 | Max supply: 1,000,000,000
 */
const BNUT_CONTRACT_ADDRESS = '0x733c4d2Aae900E608147dd89Fa93606f89722823';

/**
 * BigNutenSubscription — on-chain subscription management.
 * Accepts ETH and $BNUT. Not yet deployed; placeholder until live.
 */
const SUBSCRIPTION_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * BigNutenGovernance — community proposal voting powered by $BNUT.
 * Not yet deployed; placeholder until live.
 */
const GOVERNANCE_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * BigNutenEscrow (DecentEscrow) — trustless DNFT / ERC-1155 escrow.
 * Deployed on Optimism Mainnet.
 */
const DNFT_ESCROW_ADDRESS = '0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e';

/**
 * USDC on Optimism Mainnet — used as the default payment token in escrow.
 */
const USDC_ADDRESS = '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85';

// ─── Token Metadata ───────────────────────────────────────────────────────────

/**
 * Canonical $BNUT token metadata.
 * coinImage points to the app favicon, used wherever $BNUT is rendered as a coin.
 */
const BNUT_TOKEN = {
  symbol:     'BNUT',
  name:       'BigNuten',
  decimals:   18,
  address:    BNUT_CONTRACT_ADDRESS,
  chainId:    OPTIMISM_CHAIN_ID,
  coinImage:  'img/BigNuten.png',
};

// ─── Aggregated CONTRACTS object ─────────────────────────────────────────────

/**
 * All deployed contract addresses and token metadata in one object.
 * Accessible globally as window.CONTRACTS from any script on the page.
 */
const CONTRACTS = {
  chainId:      OPTIMISM_CHAIN_ID,
  rpcUrl:       OPTIMISM_RPC_URL,
  bnut:         BNUT_CONTRACT_ADDRESS,
  subscription: SUBSCRIPTION_CONTRACT_ADDRESS,
  governance:   GOVERNANCE_CONTRACT_ADDRESS,
  dnftEscrow:   DNFT_ESCROW_ADDRESS,
  usdc:         USDC_ADDRESS,
  bnutToken:    BNUT_TOKEN,
};

// ─── Expose as window globals ─────────────────────────────────────────────────

// Individual address globals — consumed by subscription.js and governance.js
// via their  window.BNUT_CONTRACT_ADDRESS || "0x000…"  fallback pattern.
window.BNUT_CONTRACT_ADDRESS         = BNUT_CONTRACT_ADDRESS;
window.SUBSCRIPTION_CONTRACT_ADDRESS = SUBSCRIPTION_CONTRACT_ADDRESS;
window.GOVERNANCE_CONTRACT_ADDRESS   = GOVERNANCE_CONTRACT_ADDRESS;

// Full CONTRACTS object for use in app.js and future modules.
window.CONTRACTS = CONTRACTS;
