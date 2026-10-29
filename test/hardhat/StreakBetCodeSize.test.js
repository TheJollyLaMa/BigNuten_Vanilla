const { expect } = require('chai');
const { artifacts, ethers } = require('hardhat');

describe('StreakBetEscrow deployment size', function () {
  it('keeps the combined payout and receipt runtime within EIP-170', async function () {
    const artifact = await artifacts.readArtifact('StreakBetEscrow');
    const bytes = ethers.getBytes(artifact.deployedBytecode).length;
    expect(bytes, `StreakBetEscrow runtime is ${bytes} bytes; EIP-170 allows 24576`).to.be.at.most(24576);
  });
});
