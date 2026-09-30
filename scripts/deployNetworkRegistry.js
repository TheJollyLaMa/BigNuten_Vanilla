const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory('BigNutenNetworkRegistry');
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();
  console.log(`BigNutenNetworkRegistry deployed: ${await registry.getAddress()}`);
  console.log(`Admin: ${deployer.address}`);
  console.log('Next: configure bignuten-data-rewards on the shared Settlements Router and grant this registry PAYROLL_ROLE.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});