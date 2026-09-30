'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ethers, network } = require('hardhat');
require('dotenv').config();

const ZERO = ethers.ZeroAddress;
// Existing Base BNUT (AccessControl, MINTER_ROLE, 1B cap). Never redeploy the token.
const BASE_BNUT = '0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function envAddress(name, fallback) {
  const value = String(process.env[name] || fallback || '').trim();
  if (!ethers.isAddress(value) || value === ZERO) throw new Error(`${name} must be a valid non-zero address`);
  return ethers.getAddress(value);
}

async function deploy(factoryName, args) {
  const factory = await ethers.getContractFactory(factoryName);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${factoryName}: ${address}`);
  return { contract, address };
}

async function deployArtifact(label, artifactPath, args) {
  const resolvedPath = path.resolve(artifactPath);
  if (!fs.existsSync(resolvedPath)) throw new Error(`${label} artifact not found: ${resolvedPath}`);
  const artifact = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, (await ethers.getSigners())[0]);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${label}: ${address}`);
  return { contract, address };
}

async function main() {
  if (network.name !== 'base') {
    throw new Error(`This script is Base Mainnet only. Use --network base, not ${network.name}.`);
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error('Set PRIVATE_KEY in .env to the funded Base deployer wallet before deploying.');
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 8453) throw new Error(`Expected Base chain ID 8453, received ${chainId}`);

  console.log(`Deploying BigNuten Base contracts with ${deployer.address}`);
  console.log('The private key is supplied by Hardhat and is never printed.');

  const bnutAddress = envAddress('BASE_BNUT_ADDRESS', BASE_BNUT);
  if ((await ethers.provider.getCode(bnutAddress)) === '0x') throw new Error(`No contract at BNUT ${bnutAddress}`);
  console.log(`Using existing Base BNUT: ${bnutAddress}`);

  let aavePool = null;
  const configuredAavePool = String(process.env.BASE_AAVE_POOL_ADDRESS || '').trim();
  if (configuredAavePool) {
    aavePool = envAddress('BASE_AAVE_POOL_ADDRESS');
    if ((await ethers.provider.getCode(aavePool)) === '0x') throw new Error(`No contract at Aave pool ${aavePool}`);
    const pool = new ethers.Contract(aavePool, [
      'function ADDRESSES_PROVIDER() view returns (address)',
      'function getReserveNormalizedIncome(address asset) view returns (uint256)',
    ], ethers.provider);
    const addressesProviderAddress = await pool.ADDRESSES_PROVIDER();
    const addressesProvider = new ethers.Contract(addressesProviderAddress, [
      'function getPool() view returns (address)',
    ], ethers.provider);
    const registeredPool = await addressesProvider.getPool();
    if (registeredPool.toLowerCase() !== aavePool.toLowerCase()) {
      throw new Error('BASE_AAVE_POOL_ADDRESS does not match its Aave addresses provider');
    }
    if ((await pool.getReserveNormalizedIncome(BASE_USDC)) === 0n) {
      throw new Error('Base USDC is not an active reserve in BASE_AAVE_POOL_ADDRESS');
    }
    console.log(`Verified Base Aave V3 pool: ${aavePool}`);
  }

  const treasury = await deploy('BigNutenTreasury', [bnutAddress, deployer.address]);
  const governance = await deploy('BigNutenGov', [deployer.address, bnutAddress]);
  const registry = await deploy('BigNutenNetworkRegistry', [deployer.address]);
  const streakBet = await deploy('StreakBetEscrow', [deployer.address, aavePool || ZERO]);
  const challengeTokenSetup = await streakBet.contract.setChallengeStakeToken(bnutAddress);
  await challengeTokenSetup.wait();
  const treasurySetup = await streakBet.contract.setChallengeTreasury(treasury.address);
  await treasurySetup.wait();
  console.log(`StreakBet challenge token and treasury configured for BNUT: ${treasury.address}`);

  const deployments = {
    network: 'base',
    chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    bnut: bnutAddress,
    treasury: treasury.address,
    governance: governance.address,
    networkRegistry: registry.address,
    streakBetEscrow: streakBet.address,
    aavePool,
    decentNft: null,
    decentEscrow: null,
    notes: [
      'BNUT is the existing Base token; the treasury holds nothing until explicitly funded.',
      'Configure the shared Settlements Router bignuten-data-rewards fund before registry rewards.',
      aavePool
        ? 'StreakBetEscrow is configured with the verified Base Aave pool; yield remains opt-in per competition.'
        : 'StreakBetEscrow is deployed without Aave; configure an Aave pool in a later cycle if desired.',
      'StreakBetEscrow is the single reusable engine for water, nutrition, exercise, weight, and future meetup challenges.',
      'Set DecentNFT metadata URIs before registering tokens; publish and pin the metadata through the storage workflow.',
    ],
  };

  if (!aavePool) console.log('StreakBetEscrow deployed without Aave; all non-yield competition features remain available.');

  const nftArtifact = String(process.env.DECENT_NFT_ARTIFACT || '').trim();
  if (nftArtifact) {
    const baseUri = String(process.env.BASE_DECENT_NFT_BASE_URI || '').trim();
    const royaltyReceiver = String(process.env.BASE_DECENT_NFT_ROYALTY_RECEIVER || deployer.address).trim();
    const royaltyBps = Number(process.env.BASE_DECENT_NFT_ROYALTY_BPS || 500);
    if ((baseUri && !/^ipfs:\/\/[a-z0-9]+\/$/i.test(baseUri)) || !ethers.isAddress(royaltyReceiver) || !Number.isInteger(royaltyBps) || royaltyBps < 0 || royaltyBps > 1_000) {
      throw new Error('BASE_DECENT_NFT_BASE_URI must be blank or ipfs://<CID>/, royalty receiver must be an address, and royalty BPS must be 0-1000');
    }
    const nft = await deployArtifact('DecentNFT_v0_2', nftArtifact, [baseUri, royaltyReceiver, royaltyBps]);
    deployments.decentNft = nft.address;
    deployments.decentNftBaseUri = baseUri || null;
    if (!baseUri) console.log('DecentNFT deployed without metadata; setBaseURI before registering any token.');
  } else {
    console.log('DecentNFT skipped: set DECENT_NFT_ARTIFACT after compiling DecentMarket.');
  }

  const escrowArtifact = String(process.env.DECENT_ESCROW_ARTIFACT || '').trim();
  if (escrowArtifact) {
    const escrow = await deployArtifact('DecentEscrow_v001', escrowArtifact, [deployer.address]);
    deployments.decentEscrow = escrow.address;
  } else {
    console.log('DecentEscrow skipped: set DECENT_ESCROW_ARTIFACT after compiling DecentMarket.');
  }

  const outputDir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'base.json');
  if (fs.existsSync(outputPath)) {
    fs.copyFileSync(outputPath, path.join(outputDir, `base.${Date.now()}.bak.json`));
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(deployments, null, 2)}\n`);
  console.log(`Deployment manifest written to ${outputPath}`);
  console.log('Next: verify contracts, fund the shared router allocation, configure registry PAYROLL_ROLE, and update app addresses after review.');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
