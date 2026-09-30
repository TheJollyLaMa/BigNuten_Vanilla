const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('BigNutenGov deployment', function () {
  let admin;
  let other;
  let token;
  let Gov;

  beforeEach(async function () {
    [admin, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('MockERC20');
    token = await Token.deploy('BigNuten', 'BNUT', ethers.parseEther('1000'));
    Gov = await ethers.getContractFactory('BigNutenGov');
  });

  it('rejects a zero admin', async function () {
    await expect(Gov.deploy(ethers.ZeroAddress, await token.getAddress()))
      .to.be.revertedWith('Governance: zero admin');
  });

  it('rejects a zero BNUT address', async function () {
    await expect(Gov.deploy(admin.address, ethers.ZeroAddress))
      .to.be.revertedWith('Governance: zero BNUT token');
  });

  it('rejects a BNUT address without contract code', async function () {
    await expect(Gov.deploy(admin.address, other.address))
      .to.be.revertedWith('Governance: BNUT token has no code');
  });

  it('stores the Base BNUT contract and grants admin role', async function () {
    const gov = await Gov.deploy(admin.address, await token.getAddress());
    expect(await gov.bnutToken()).to.equal(await token.getAddress());
    expect(await gov.hasRole(ethers.ZeroHash, admin.address)).to.equal(true);
  });

  it('allows an eligible wallet one advisory vote per proposal', async function () {
    const gov = await Gov.deploy(admin.address, await token.getAddress());
    await gov.grantRole(await gov.PROPOSER_ROLE(), admin.address);
    await gov.createProposal('Community choice', 'Choose an option', 'Yes', 'No', 0);
    await token.transfer(other.address, ethers.parseEther('1'));

    await gov.connect(other).castVote(1, true);
    expect((await gov.getProposal(1)).yesVotes).to.equal(1n);
    await expect(gov.connect(other).castVote(1, false))
      .to.be.revertedWith('Governance: already voted');
  });
});
