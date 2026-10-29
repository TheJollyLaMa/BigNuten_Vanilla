const fs = require('node:fs');
const path = require('node:path');

async function deployRehearsal(hre) {
  if (hre.network.name !== 'hardhat' || Number((await hre.ethers.provider.getNetwork()).chainId) !== 31337) {
    throw new Error('REHEARSAL ONLY: an isolated Hardhat chain (31337) is required');
  }
  const { ethers } = hre;
  const signers = (await ethers.getSigners()).slice(0, 4);
  const deploy = async (name, args) => {
    const contract = await (await ethers.getContractFactory(name)).deploy(...args);
    await contract.waitForDeployment();
    return contract;
  };
  const token = await deploy('MockERC20', ['REHEARSAL fake BNUT — no value', 'TEST-BNUT', ethers.parseEther('1000')]);
  const treasury = await deploy('BigNutenTreasury', [await token.getAddress(), signers[0].address]);
  const nft = await deploy('MockStreakAwardNFT', [signers[0].address]);
  // No Aave integration, even a mock pool, is reachable in this rehearsal.
  const escrow = await deploy('StreakBetEscrow', [signers[0].address, ethers.ZeroAddress]);
  for (const tx of [
    () => escrow.setChallengeStakeToken(token.target),
    () => escrow.setChallengeTreasury(treasury.target),
    ...[10, 11, 12, 13].map(id => () => nft.registerAchievement(id)),
    () => nft.grantMinter(escrow.target),
    () => escrow.setStreakAwards(nft.target, 10, 11, 12, 13),
    () => token.transfer(signers[1].address, ethers.parseEther('100')),
    () => token.transfer(signers[2].address, ethers.parseEther('100')),
  ]) await (await tx()).wait();

  const contracts = {};
  for (const [key, contract, artifact] of [
    ['token', token, 'MockERC20'], ['treasury', treasury, 'BigNutenTreasury'],
    ['nft', nft, 'MockStreakAwardNFT'], ['escrow', escrow, 'StreakBetEscrow'],
  ]) {
    contracts[key] = {
      address: contract.target,
      abi: (await hre.artifacts.readArtifact(artifact)).abi,
      codeHash: ethers.keccak256(await ethers.provider.getCode(contract.target)),
    };
  }
  // Read production configuration only to DENY its addresses, never to connect.
  const productionSources = ['js/contracts.js', 'deployments/base.json'];
  const forbidden = [...new Set(productionSources.flatMap(file =>
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8').match(/0x[a-fA-F0-9]{40}\b/g) || []
  ).map(address => address.toLowerCase()))];
  return {
    mode: 'REHEARSAL', chainId: 31337, contracts, forbidden,
    accounts: signers.map(signer => signer.address),
    startTime: Number((await ethers.provider.getBlock('latest')).timestamp) + 600,
  };
}

module.exports = { deployRehearsal };
