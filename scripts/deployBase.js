'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ethers, network } = require('hardhat');
require('dotenv').config();

const ZERO = ethers.ZeroAddress;

async function deploy(factoryName, args) {
  const factory = await ethers.getContractFactory(factoryName);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${factoryName}: ${address}`);
  return { contract, address };
}

async function main() {
  if (network.name !== 'base') {
    throw new Error(`This script is Base Mainnet only. Use --network base, not ${network.name}.`);
  }

  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 8453) throw new Error(`Expected Base chain ID 8453, received ${chainId}`);

  console.log(`Deploying BigNuten Base contracts with ${deployer.address}`);
  console.log('The private key is supplied by Hardhat and is never printed.');

  const bnut = await deploy('BigNuten', [deployer.address]);
  const treasury = await deploy('BigNutenTreasury', [bnut.address, deployer.address]);
  const governance = await deploy('BigNutenGov', [deployer.address, bnut.address]);
  const registry = await deploy('BigNutenNetworkRegistry', [deployer.address]);

  const deployments = {
    network: 'base',
    chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    bnut: bnut.address,
    treasury: treasury.address,
    governance: governance.address,
    networkRegistry: registry.address,
    streakBetEscrow: null,
    aavePool: null,
    notes: [
      'BNUT initial supply remains in the deployer wallet until an explicit funding transfer is made.',
      'Configure the shared Settlements Router bignuten-data-rewards fund before registry rewards.',
      'Deploy DecentNFT/DecentEscrow from their owning repositories before wiring subscription/DNFT flows.',
    ],
  };

  const aavePool = String(process.env.BASE_AAVE_POOL_ADDRESS || '').trim();
  if (aavePool) {
    if (!ethers.isAddress(aavePool) || aavePool === ZERO) throw new Error('BASE_AAVE_POOL_ADDRESS must be a valid non-zero address');
    const streakBet = await deploy('StreakBetEscrow', [deployer.address, aavePool]);
    deployments.streakBetEscrow = streakBet.address;
    deployments.aavePool = aavePool;
  } else {
    console.log('StreakBetEscrow skipped: set BASE_AAVE_POOL_ADDRESS after verifying the Base Aave deployment.');
  }

  const outputDir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'base.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(deployments, null, 2)}\n`);
  console.log(`Deployment manifest written to ${outputPath}`);
  console.log('Next: verify contracts, fund the shared router allocation, configure registry PAYROLL_ROLE, and update js/contracts.js only after review.');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
