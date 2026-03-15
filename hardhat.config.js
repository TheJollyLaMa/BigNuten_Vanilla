// hardhat.config.js
// BigNuten Hardhat Configuration
//
// Supports deployment to:
//   - Polygon Mumbai testnet    (polygon_mumbai)
//   - Base Sepolia testnet      (base_sepolia)
//   - Optimism Sepolia testnet  (optimism_sepolia)
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

const OPTIMISM_RPC_URL =
  process.env.OPTIMISM_RPC_URL || "https://sepolia.optimism.io";

const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// ─── Hardhat Configuration ────────────────────────────────────────────────────

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // ── Solidity Compiler ────────────────────────────────────────────────────
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Optimise for typical deployment + frequent calls balance.
      },
    },
  },

  // ── Network Definitions ──────────────────────────────────────────────────
  networks: {
    // Local Hardhat node — useful for fast unit tests.
    hardhat: {
      chainId: 31337,
    },

    // Polygon Mumbai testnet (MATIC)
    // Faucet: https://faucet.polygon.technology/
    polygon_mumbai: {
      url: POLYGON_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 80001,
    },

    // Base Sepolia testnet (ETH)
    // Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
    base_sepolia: {
      url: BASE_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 84532,
    },

    // Optimism Sepolia testnet (ETH)
    // Faucet: https://www.alchemy.com/faucets/optimism-sepolia
    optimism_sepolia: {
      url: OPTIMISM_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 11155420,
    },
  },

  // ── Contract Verification ────────────────────────────────────────────────
  // Allows `npx hardhat verify --network <network> <address>` after deployment.
  etherscan: {
    apiKey: {
      polygonMumbai: POLYGONSCAN_API_KEY,
      // Base and Optimism use etherscan-compatible APIs:
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
