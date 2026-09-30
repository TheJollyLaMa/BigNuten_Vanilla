'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ethers, network } = require('hardhat');
require('dotenv').config();

const ZERO = ethers.ZeroAddress;
const NFT_ROLE_ABI = [
  'function DEFAULT_ADMIN_ROLE() view returns(bytes32)',
  'function MINTER_ROLE() view returns(bytes32)',
  'function hasRole(bytes32,address) view returns(bool)',
  'function grantRole(bytes32,address)',
  'function revokeRole(bytes32,address)',
];
const STREAK_ADMIN_ABI = [
  'function owner() view returns(address)',
  'function paused() view returns(bool)',
  'function pause()',
  'function nextCompId() view returns(uint256)',
  'function challengeStakeToken() view returns(address)',
  'function challengeTreasury() view returns(address)',
  'function setChallengeStakeToken(address)',
  'function setChallengeTreasury(address)',
];

async function sendAndWait(label, transactionPromise) {
  const transaction = await transactionPromise;
  console.log(`${label}: ${transaction.hash}`);
  await transaction.wait();
}

function persistManifest(filePath, manifest) {
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function replaceBaseStreakAddress(source, expectedAddress, nextAddress) {
  const baseStart = source.indexOf('base: {');
  const optimismStart = source.indexOf('optimism: {', baseStart);
  if (baseStart < 0 || optimismStart < 0) throw new Error('Could not locate Base and Optimism network blocks in js/contracts.js.');
  const baseBlock = source.slice(baseStart, optimismStart);
  const field = /streakBetEscrow:\s*'([^']+)'/;
  const match = baseBlock.match(field);
  if (!match || match[1].toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error('Base streakBetEscrow address changed since this deployment manifest was created; inspect js/contracts.js before updating it.');
  }
  const updatedBlock = baseBlock.replace(field, `streakBetEscrow: '${nextAddress}'`);
  return `${source.slice(0, baseStart)}${updatedBlock}${source.slice(optimismStart)}`;
}

async function main() {
  if (network.name !== 'base') throw new Error('This replacement deployment is Base Mainnet only.');
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error('Set PRIVATE_KEY in .env to the Base deployment admin.');
  if (Number((await ethers.provider.getNetwork()).chainId) !== 8453) throw new Error('Expected Base Mainnet (chain ID 8453).');

  const manifestPath = path.resolve('deployments/base.json');
  const configPath = path.resolve('js/contracts.js');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(configPath)) throw new Error('Base deployment manifest or app config is missing.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.network !== 'base' || manifest.chainId !== 8453 || deployer.address.toLowerCase() !== String(manifest.deployer).toLowerCase()) {
    throw new Error('Signer and manifest must match the existing Base deployment admin.');
  }
  for (const [label, address] of [['BNUT', manifest.bnut], ['Treasury', manifest.treasury], ['DecentNFT', manifest.decentNft], ['old StreakBet', manifest.streakBetEscrow]]) {
    if (!ethers.isAddress(address) || (await ethers.provider.getCode(address)) === '0x') throw new Error(`${label} address is missing or has no Base contract code.`);
  }

  const oldAddress = manifest.streakBetEscrow;
  const oldStreak = new ethers.Contract(oldAddress, STREAK_ADMIN_ABI, deployer);
  if ((await oldStreak.owner()).toLowerCase() !== deployer.address.toLowerCase()) throw new Error('Signer does not own the existing StreakBet deployment.');
  if ((await oldStreak.nextCompId()) !== 0n) throw new Error('Existing StreakBet already has competitions; refusing to pause it or replace its app address.');

  let nextAddress = String(manifest.pendingStreakBetEscrow || '');
  if (!ethers.isAddress(nextAddress) || (await ethers.provider.getCode(nextAddress)) === '0x') {
    const factory = await ethers.getContractFactory('StreakBetEscrow');
    const replacement = await factory.deploy(deployer.address, ZERO);
    await replacement.waitForDeployment();
    nextAddress = await replacement.getAddress();
    manifest.pendingStreakBetEscrow = nextAddress;
    persistManifest(manifestPath, manifest);
    console.log(`Replacement StreakBetEscrow deployed: ${nextAddress}`);
  } else {
    console.log(`Resuming replacement StreakBetEscrow: ${nextAddress}`);
  }

  const replacement = new ethers.Contract(nextAddress, STREAK_ADMIN_ABI, deployer);
  if ((await replacement.owner()).toLowerCase() !== deployer.address.toLowerCase()) throw new Error('Replacement StreakBet owner does not match the deployment admin.');
  if ((await replacement.challengeStakeToken()).toLowerCase() !== manifest.bnut.toLowerCase()) {
    await sendAndWait('Configure replacement BNUT stake token', replacement.setChallengeStakeToken(manifest.bnut));
  }
  if ((await replacement.challengeTreasury()).toLowerCase() !== manifest.treasury.toLowerCase()) {
    await sendAndWait('Configure replacement Treasury', replacement.setChallengeTreasury(manifest.treasury));
  }

  const nft = new ethers.Contract(manifest.decentNft, NFT_ROLE_ABI, deployer);
  const [adminRole, minterRole] = await Promise.all([nft.DEFAULT_ADMIN_ROLE(), nft.MINTER_ROLE()]);
  if (!(await nft.hasRole(adminRole, deployer.address))) throw new Error('Signer does not have DecentNFT DEFAULT_ADMIN_ROLE.');
  if (!(await nft.hasRole(minterRole, nextAddress))) await sendAndWait('Grant replacement StreakBet MINTER_ROLE', nft.grantRole(minterRole, nextAddress));
  if (await nft.hasRole(minterRole, oldAddress)) await sendAndWait('Revoke retired StreakBet MINTER_ROLE', nft.revokeRole(minterRole, oldAddress));
  if (!(await oldStreak.paused())) await sendAndWait('Pause retired StreakBet', oldStreak.pause());

  const configSource = fs.readFileSync(configPath, 'utf8');
  const updatedConfig = replaceBaseStreakAddress(configSource, oldAddress, nextAddress);
  manifest.previousStreakBetEscrow = oldAddress;
  manifest.streakBetEscrow = nextAddress;
  delete manifest.pendingStreakBetEscrow;
  manifest.streakBetReplacementAt = new Date().toISOString();
  fs.writeFileSync(configPath, updatedConfig);
  persistManifest(manifestPath, manifest);

  console.log(`Base StreakBet app address updated to ${nextAddress}.`);
  console.log('Base BNUT, Treasury, DecentNFT, DecentEscrow, Governance, and Registry addresses were not redeployed.');
  console.log('Aave remains disabled; the replacement embeds the adaptive peer-review arbiter.');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
