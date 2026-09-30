'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ethers, network } = require('hardhat');
require('dotenv').config();

const ZERO = ethers.ZeroAddress;
const AWARD_COUNT = 4;
const NFT_ABI = [
  'function DEFAULT_ADMIN_ROLE() view returns(bytes32)',
  'function MINTER_ROLE() view returns(bytes32)',
  'function hasRole(bytes32,address) view returns(bool)',
  'function grantRole(bytes32,address)',
  'function nextTokenId() view returns(uint256)',
  'function contractURI() view returns(string)',
  'function setContractURI(string)',
  'function registerToken(uint256,string,uint8,address,uint96) returns(uint256)',
  'function creatorOf(uint256) view returns(address)',
  'function kindOf(uint256) view returns(uint8)',
  'function maxSupply(uint256) view returns(uint256)',
  'function uri(uint256) view returns(string)',
];
const STREAK_ABI = [
  'function owner() view returns(address)',
  'function setStreakAwards(address,uint256,uint256,uint256,uint256)',
  'function streakAwardNFT() view returns(address)',
  'function completionAwardId() view returns(uint256)',
  'function firstPlaceAwardId() view returns(uint256)',
  'function secondPlaceAwardId() view returns(uint256)',
  'function thirdPlaceAwardId() view returns(uint256)',
];

async function sendAndWait(label, transactionPromise) {
  const transaction = await transactionPromise;
  console.log(`${label}: ${transaction.hash}`);
  await transaction.wait();
}

async function main() {
  if (network.name !== 'base') throw new Error('This setup script is Base Mainnet only.');
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error('Set PRIVATE_KEY in .env to the Base deployment admin.');
  if (Number((await ethers.provider.getNetwork()).chainId) !== 8453) throw new Error('Expected Base Mainnet (chain ID 8453).');
  const firstAwardId = Number(process.env.STREAK_AWARD_FIRST_ID || 0);
  if (!Number.isSafeInteger(firstAwardId) || firstAwardId < 0) throw new Error('STREAK_AWARD_FIRST_ID must be a non-negative integer.');
  const expectedTokenIds = Array.from({ length: AWARD_COUNT }, (_, index) => firstAwardId + index);

  const deploymentsPath = path.resolve('deployments/base.json');
  const metadataPath = path.resolve(process.env.DECENT_METADATA_MANIFEST || 'deployments/decent-metadata-cids.json');
  if (!fs.existsSync(deploymentsPath)) throw new Error(`Deployment manifest not found: ${deploymentsPath}`);
  if (!fs.existsSync(metadataPath)) throw new Error(`Metadata CID manifest not found: ${metadataPath}; publish metadata first.`);
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (deployments.network !== 'base' || deployments.chainId !== 8453) throw new Error('Deployment manifest is not for Base Mainnet.');
  if (!ethers.isAddress(deployments.deployer) || deployer.address.toLowerCase() !== deployments.deployer.toLowerCase()) {
    throw new Error('The configured signer must match the Base deployment admin.');
  }
  if (!/^ipfs:\/\/[a-zA-Z0-9]+$/.test(String(metadata.collectionUri || ''))) throw new Error('Metadata manifest needs an IPFS collectionUri.');

  const tokens = Array.isArray(metadata.tokens) ? [...metadata.tokens].sort((left, right) => left.tokenId - right.tokenId) : [];
  if (tokens.length !== expectedTokenIds.length || tokens.some((token, index) => token.tokenId !== expectedTokenIds[index] || !/^ipfs:\/\/[a-zA-Z0-9]+$/.test(String(token.uri || '')))) {
    throw new Error(`Metadata manifest must contain IPFS metadata URIs for token IDs ${expectedTokenIds.join(', ')}.`);
  }
  if (!ethers.isAddress(deployments.decentNft) || !ethers.isAddress(deployments.streakBetEscrow)) {
    throw new Error('Base DecentNFT or StreakBetEscrow address is missing from the deployment manifest.');
  }
  if ((await ethers.provider.getCode(deployments.decentNft)) === '0x' || (await ethers.provider.getCode(deployments.streakBetEscrow)) === '0x') {
    throw new Error('No deployed DecentNFT or StreakBetEscrow code found at the manifest addresses.');
  }

  const nft = new ethers.Contract(deployments.decentNft, NFT_ABI, deployer);
  const streak = new ethers.Contract(deployments.streakBetEscrow, STREAK_ABI, deployer);
  const [adminRole, minterRole, streakOwner] = await Promise.all([
    nft.DEFAULT_ADMIN_ROLE(), nft.MINTER_ROLE(), streak.owner(),
  ]);
  if (!(await nft.hasRole(adminRole, deployer.address))) throw new Error('Signer does not have DecentNFT DEFAULT_ADMIN_ROLE.');
  if (streakOwner.toLowerCase() !== deployer.address.toLowerCase()) throw new Error('Signer does not own StreakBetEscrow.');

  const collectionUri = String(metadata.collectionUri);
  if ((await nft.contractURI()) !== collectionUri) {
    await sendAndWait('Set DecentNFT collection URI', nft.setContractURI(collectionUri));
  }

  const existingCount = Number(await nft.nextTokenId());
  if (existingCount < firstAwardId || existingCount > firstAwardId + AWARD_COUNT) {
    throw new Error(`DecentNFT next token ID is ${existingCount}; expected ${firstAwardId} through ${firstAwardId + AWARD_COUNT}.`);
  }
  for (let tokenId = firstAwardId; tokenId < existingCount; tokenId += 1) {
    const metadataIndex = tokenId - firstAwardId;
    const [creator, kind, maxSupply, tokenUri] = await Promise.all([
      nft.creatorOf(tokenId), nft.kindOf(tokenId), nft.maxSupply(tokenId), nft.uri(tokenId),
    ]);
    if (creator === ZERO || Number(kind) !== 1 || maxSupply !== 0n || tokenUri !== tokens[metadataIndex].uri) {
      throw new Error(`Existing token ID ${tokenId} does not match the expected unlimited Achievement metadata.`);
    }
  }
  for (let tokenId = existingCount; tokenId < firstAwardId + AWARD_COUNT; tokenId += 1) {
    const metadataIndex = tokenId - firstAwardId;
    await sendAndWait(`Register unlimited Achievement token ${tokenId}`, nft.registerToken(0, tokens[metadataIndex].uri, 1, ZERO, 0));
  }

  if (!(await nft.hasRole(minterRole, deployments.streakBetEscrow))) {
    await sendAndWait('Grant StreakBetEscrow MINTER_ROLE', nft.grantRole(minterRole, deployments.streakBetEscrow));
  }

  const currentAwards = await Promise.all([
    streak.streakAwardNFT(), streak.completionAwardId(), streak.firstPlaceAwardId(),
    streak.secondPlaceAwardId(), streak.thirdPlaceAwardId(),
  ]);
  const expectedAwards = [deployments.decentNft, ...expectedTokenIds.map(BigInt)];
  const awardsMatch = currentAwards.every((value, index) => String(value).toLowerCase() === String(expectedAwards[index]).toLowerCase());
  if (!awardsMatch) {
    await sendAndWait('Configure reusable StreakBet awards', streak.setStreakAwards(deployments.decentNft, ...expectedTokenIds));
  }

  console.log(`Base award setup complete for ${deployments.decentNft}.`);
  console.log(`Achievement IDs ${expectedTokenIds.join(', ')}: completion, first, second, third; all have unlimited supply.`);
  console.log(`StreakBetEscrow ${deployments.streakBetEscrow} has MINTER_ROLE and reusable awards are configured.`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});