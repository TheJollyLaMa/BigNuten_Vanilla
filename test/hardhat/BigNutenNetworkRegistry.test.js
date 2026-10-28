const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('BigNutenNetworkRegistry', function () {
  let registry;
  let admin;
  let operator;
  let checker;

  beforeEach(async function () {
    [admin, operator, checker] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory('BigNutenNetworkRegistry');
    registry = await Registry.deploy(admin.address);
    await registry.grantRole(await registry.NODE_CHECKER_ROLE(), checker.address);
  });

  it('registers nodes and reaches eligibility only through independent checks', async function () {
    const nodeDid = ethers.id('node-did');
    const peerId = ethers.id('peer-id');
    await registry.connect(operator).registerNode(nodeDid, peerId, 'kubo/ipfs-desktop');
    await registry.setNodeApproval(1, true);

    const month = 202610;
    const challenge = ethers.id('challenge');
    await registry.setMonthChallenge(month, challenge);
    expect(await registry.rewardEligible(1, month)).to.equal(false);

    for (let index = 0; index < 25; index += 1) {
      await time.increase(12 * 60 * 60);
      await registry.connect(checker).recordNodeCheck(1, month, challenge, ethers.id(`proof-${index}`), 3);
    }

    expect(await registry.rewardEligible(1, month)).to.equal(true);
    await expect(registry.connect(operator).claimMonthlyReward(1, month))
      .to.be.revertedWith('Reward payout is not configured');
  });
});
