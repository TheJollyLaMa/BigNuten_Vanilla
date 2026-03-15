// scripts/deploy.js
// BigNuten Smart Contract Deployment Script
//
// Deploys all four BigNuten contracts in dependency order:
//   1. BigNuten.sol          — ERC-20 $BNUT token
//   2. BigNutenTreasury.sol  — Treasury & contributor payouts
//   3. BigNutenSubscription.sol — Subscription management
//   4. BigNutenGovernance.sol   — Community governance
//
// After deployment the entire initial BNUT supply is transferred to the
// Treasury contract so that payouts can be made immediately.
//
// Usage:
//   npx hardhat run scripts/deploy.js --network polygon_mumbai
//   npx hardhat run scripts/deploy.js --network base_sepolia
//   npx hardhat run scripts/deploy.js --network optimism_sepolia
//
// Set PRIVATE_KEY and the relevant RPC URL in your .env file first.
// See .env.example for all required variables.

const { ethers } = require("hardhat");

async function main() {
  // ── Signers ──────────────────────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  console.log("\n🚀  BigNuten Contract Deployment");
  console.log("════════════════════════════════════════");
  console.log(`Deployer address : ${deployer.address}`);
  console.log(
    `Deployer balance : ${ethers.formatEther(
      await ethers.provider.getBalance(deployer.address)
    )} ETH\n`
  );

  // ── 1. Deploy BigNuten ERC-20 ($BNUT) ────────────────────────────────────
  console.log("1️⃣   Deploying BigNuten ERC-20 token ($BNUT)…");
  const BigNutenFactory = await ethers.getContractFactory("BigNuten");
  // Pass deployer as initialOwner; we will transfer the supply to Treasury next.
  const bigNuten = await BigNutenFactory.deploy(deployer.address);
  await bigNuten.waitForDeployment();
  const bnutAddress = await bigNuten.getAddress();
  console.log(`✅   BigNuten ($BNUT) deployed to : ${bnutAddress}\n`);

  // ── 2. Deploy BigNutenTreasury ────────────────────────────────────────────
  console.log("2️⃣   Deploying BigNutenTreasury…");
  const TreasuryFactory = await ethers.getContractFactory("BigNutenTreasury");
  const treasury = await TreasuryFactory.deploy(bnutAddress, deployer.address);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log(`✅   BigNutenTreasury deployed to : ${treasuryAddress}\n`);

  // ── 3. Deploy BigNutenSubscription ────────────────────────────────────────
  console.log("3️⃣   Deploying BigNutenSubscription…");
  const SubscriptionFactory = await ethers.getContractFactory(
    "BigNutenSubscription"
  );
  const subscription = await SubscriptionFactory.deploy(
    bnutAddress,
    deployer.address
  );
  await subscription.waitForDeployment();
  const subscriptionAddress = await subscription.getAddress();
  console.log(
    `✅   BigNutenSubscription deployed to : ${subscriptionAddress}\n`
  );

  // ── 4. Deploy BigNutenGovernance ──────────────────────────────────────────
  console.log("4️⃣   Deploying BigNutenGovernance…");
  const GovernanceFactory = await ethers.getContractFactory(
    "BigNutenGovernance"
  );
  const governance = await GovernanceFactory.deploy(
    bnutAddress,
    deployer.address
  );
  await governance.waitForDeployment();
  const governanceAddress = await governance.getAddress();
  console.log(
    `✅   BigNutenGovernance deployed to : ${governanceAddress}\n`
  );

  // ── 5. Transfer Initial BNUT Supply to Treasury ───────────────────────────
  console.log("💸  Transferring initial BNUT supply to Treasury…");
  const totalSupply = await bigNuten.totalSupply();
  const transferTx = await bigNuten.transfer(treasuryAddress, totalSupply);
  await transferTx.wait();
  console.log(
    `✅   ${ethers.formatEther(totalSupply)} BNUT transferred to Treasury\n`
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("════════════════════════════════════════");
  console.log("📋  Deployment Summary");
  console.log("════════════════════════════════════════");
  console.log(`BNUT_CONTRACT_ADDRESS        = ${bnutAddress}`);
  console.log(`TREASURY_CONTRACT_ADDRESS    = ${treasuryAddress}`);
  console.log(`SUBSCRIPTION_CONTRACT_ADDRESS= ${subscriptionAddress}`);
  console.log(`GOVERNANCE_CONTRACT_ADDRESS  = ${governanceAddress}`);
  console.log("════════════════════════════════════════");
  console.log("\n📝  Add these addresses to your .env file.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌  Deployment failed:", error);
    process.exit(1);
  });
