// hardhat.config.js
// BigNuten Hardhat Configuration
//
// Supports deployment to:
//   - Optimism Mainnet          (optimism)          ← primary production network
//   - Optimism Sepolia testnet  (optimism_sepolia)  ← staging / testing
//   - Base Sepolia testnet      (base_sepolia)
//   - Polygon Mumbai testnet    (polygon_mumbai)
//
// The PRIVATE_KEY is only required for contract *deployment* scripts.
// Day-to-day operations (e.g. payroll settlement) are done through the owner's
// own MetaMask wallet via the BigNuten UI — no private key stored in CI.
//
// Set all required env vars in a local .env file (see .env.example).
// Never commit your .env file — it is already in .gitignore.

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// ─── Environment Variable Helpers ─────────────────────────────────────────────
// Provide sensible defaults so that `npx hardhat compile` works without a .env.
const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000001";

const POLYGON_RPC_URL =
  process.env.POLYGON_RPC_URL || "https://rpc-mumbai.maticvigil.com";

const BASE_RPC_URL =
  process.env.BASE_RPC_URL || "https://sepolia.base.org";

// Optimism Mainnet (production) — chain ID 10
const OPTIMISM_MAINNET_RPC_URL =
  process.env.OPTIMISM_MAINNET_RPC_URL || "https://mainnet.optimism.io";

// Optimism Sepolia (staging) — chain ID 11155420
const OPTIMISM_RPC_URL =
  process.env.OPTIMISM_RPC_URL || "https://sepolia.optimism.io";

const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// HD wallet mnemonic — optional. When set, Hardhat derives 5 accounts from it
// (owner + Alice + Bob + Carol + Dave) for use with streakbot-live.js.
// If not set, PRIVATE_KEY is used (single-account mode for regular scripts).
const HD_MNEMONIC = process.env.HD_MNEMONIC || null;

/**
 * Build the `accounts` field for a live network:
 *   - If HD_MNEMONIC is set → derive 5 wallets at indices 0–4
 *                             (index 0 = owner/admin, indices 1–4 = Alice/Bob/Carol/Dave).
 *   - Otherwise            → single PRIVATE_KEY (regular deployments).
 */
function liveAccounts() {
  if (HD_MNEMONIC) {
    return { mnemonic: HD_MNEMONIC, count: 5 };
  }
  return [PRIVATE_KEY];
}

// ─── Hardhat Configuration ────────────────────────────────────────────────────

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // ── Solidity Compiler ────────────────────────────────────────────────────
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },

  // ── Network Definitions ──────────────────────────────────────────────────
  networks: {
    // Local Hardhat node — useful for fast unit tests.
    hardhat: {
      chainId: 31337,
    },

    // Optimism Mainnet (production) — primary target for BigNuten contracts.
    // Explorer: https://optimistic.etherscan.io
    optimism: {
      url: OPTIMISM_MAINNET_RPC_URL,
      accounts: liveAccounts(),
      chainId: 10,
    },

    // Polygon Mumbai testnet (MATIC)
    // Faucet: https://faucet.polygon.technology/
    polygon_mumbai: {
      url: POLYGON_RPC_URL,
      accounts: liveAccounts(),
      chainId: 80001,
    },

    // Base Sepolia testnet (ETH)
    // Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
    base_sepolia: {
      url: BASE_RPC_URL,
      accounts: liveAccounts(),
      chainId: 84532,
    },

    // Optimism Sepolia testnet (ETH) — staging before mainnet deployment.
    // Faucet: https://www.alchemy.com/faucets/optimism-sepolia
    optimism_sepolia: {
      url: OPTIMISM_RPC_URL,
      accounts: liveAccounts(),
      chainId: 11155420,
    },
  },

  // ── Contract Verification ────────────────────────────────────────────────
  // Allows `npx hardhat verify --network <network> <address>` after deployment.
  etherscan: {
    apiKey: {
      polygonMumbai: POLYGONSCAN_API_KEY,
      // Optimism Mainnet uses etherscan-compatible API:
      optimisticEthereum: ETHERSCAN_API_KEY,
      // Base and Optimism Sepolia use etherscan-compatible APIs:
      baseSepolia: ETHERSCAN_API_KEY,
      optimismSepolia: ETHERSCAN_API_KEY,
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "optimismSepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://sepolia-optimistic.etherscan.io",
        },
      },
    ],
  },

  // ── Gas Reporter (optional, controlled by REPORT_GAS env var) ───────────
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },

  // ── Paths (Hardhat defaults — listed here for clarity) ───────────────────
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
