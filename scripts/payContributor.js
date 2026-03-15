// scripts/payContributor.js
// BigNuten Contributor Payout Script
//
// Calls `payContributor()` on the deployed BigNutenTreasury contract to send
// a $BNUT bounty to a contributor after they have completed a GitHub issue.
//
// This script is invoked by the `.github/workflows/bounty-payout.yml`
// workflow after manual approval by @TheJollyLaMa, and can also be
// called directly from the command line for ad-hoc payouts.
//
// Usage (CLI arguments via process.argv):
//   npx hardhat run scripts/payContributor.js --network polygon_mumbai \
//     -- --address 0xContributorAddress --amount 500 --issue "TheJollyLaMa/BigNuten_Vanilla#45"
//
// Usage (environment variables — preferred for CI):
//   CONTRIBUTOR_ADDRESS=0x...  BNUT_AMOUNT=500  ISSUE_REF="BigNuten_Vanilla#45" \
//   npx hardhat run scripts/payContributor.js --network polygon_mumbai
//
// Required env vars (in addition to PRIVATE_KEY / RPC URLs):
//   TREASURY_CONTRACT_ADDRESS — deployed treasury address
//   CONTRIBUTOR_ADDRESS       — contributor's wallet address
//   BNUT_AMOUNT               — amount in whole BNUT (not wei)
//   ISSUE_REF                 — e.g. "TheJollyLaMa/BigNuten_Vanilla#45"

const { ethers } = require("hardhat");

async function main() {
  // ── Configuration ─────────────────────────────────────────────────────────
  const treasuryAddress = process.env.TREASURY_CONTRACT_ADDRESS;
  const contributorAddress = process.env.CONTRIBUTOR_ADDRESS;
  const bnutAmountWhole = process.env.BNUT_AMOUNT; // whole BNUT, not wei
  const issueRef = process.env.ISSUE_REF || "unknown";

  if (!treasuryAddress) {
    throw new Error("Missing env var: TREASURY_CONTRACT_ADDRESS");
  }
  if (!contributorAddress) {
    throw new Error("Missing env var: CONTRIBUTOR_ADDRESS");
  }
  if (!bnutAmountWhole) {
    throw new Error("Missing env var: BNUT_AMOUNT");
  }

  // Convert whole BNUT to wei (18 decimals).
  const amountWei = ethers.parseEther(bnutAmountWhole);

  // ── Signer ────────────────────────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  console.log("\n💸  BigNuten Contributor Payout");
  console.log("════════════════════════════════════════");
  console.log(`Caller (owner)   : ${deployer.address}`);
  console.log(`Contributor      : ${contributorAddress}`);
  console.log(`Amount           : ${bnutAmountWhole} BNUT`);
  console.log(`Issue reference  : ${issueRef}`);
  console.log(`Treasury address : ${treasuryAddress}\n`);

  // ── Attach to Treasury Contract ───────────────────────────────────────────
  const treasury = await ethers.getContractAt(
    "BigNutenTreasury",
    treasuryAddress,
    deployer
  );

  // ── Pre-flight: Check Treasury Balance ───────────────────────────────────
  const balance = await treasury.getBalance();
  console.log(
    `Treasury BNUT balance : ${ethers.formatEther(balance)} BNUT`
  );

  if (balance < amountWei) {
    throw new Error(
      `Treasury balance (${ethers.formatEther(balance)} BNUT) is less than ` +
        `payout amount (${bnutAmountWhole} BNUT). Aborting.`
    );
  }

  // ── Send Payout ───────────────────────────────────────────────────────────
  console.log("📤  Sending payout transaction…");
  const tx = await treasury.payContributor(
    contributorAddress,
    amountWei,
    issueRef
  );
  console.log(`   Tx hash : ${tx.hash}`);
  console.log("   Waiting for confirmation…");
  const receipt = await tx.wait();

  console.log(
    `✅   Confirmed in block ${receipt.blockNumber} (gas used: ${receipt.gasUsed.toString()})`
  );
  console.log(
    `\n🎉  ${bnutAmountWhole} BNUT sent to ${contributorAddress} for ${issueRef}\n`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌  Payout failed:", error.message || error);
    process.exit(1);
  });
