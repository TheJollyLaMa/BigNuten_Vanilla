const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('BigNutenTreasury', function () {
  let treasury;
  let bnut;
  let owner;
  let alice;
  let bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('MockERC20');
    bnut = await Token.deploy('BigNuten', 'BNUT', ethers.parseEther('1000'));
    const Treasury = await ethers.getContractFactory('BigNutenTreasury');
    treasury = await Treasury.deploy(await bnut.getAddress(), owner.address);
    await bnut.transfer(await treasury.getAddress(), ethers.parseEther('100'));
  });

  it('pays a contributor once per issue ref', async function () {
    await expect(treasury.payContributor(alice.address, ethers.parseEther('5'), 'repo#1'))
      .to.emit(treasury, 'ContributorPaid')
      .withArgs(alice.address, ethers.parseEther('5'), 'repo#1');
    expect(await bnut.balanceOf(alice.address)).to.equal(ethers.parseEther('5'));
    await expect(treasury.payContributor(alice.address, 1n, 'repo#1')).to.be.revertedWith('Treasury: issue already paid');
  });

  it('rejects empty issue refs', async function () {
    await expect(treasury.payContributor(alice.address, 1n, '')).to.be.revertedWith('Treasury: issue ref required');
  });

  it('rejects duplicate refs inside one batch', async function () {
    await expect(
      treasury.batchPayContributors([alice.address, bob.address], [1n, 1n], ['repo#2', 'repo#2'])
    ).to.be.revertedWith('Treasury: issue already paid');
    expect(await treasury.isIssuePaid('repo#2')).to.equal(false);
  });

  it('prechecks the full batch total', async function () {
    await expect(
      treasury.batchPayContributors(
        [alice.address, bob.address],
        [ethers.parseEther('60'), ethers.parseEther('60')],
        ['repo#3', 'repo#4']
      )
    ).to.be.revertedWith('Treasury: insufficient BNUT balance');
  });

  it('pauses payouts but still allows emergency withdrawal', async function () {
    await treasury.pause();
    await expect(treasury.payContributor(alice.address, 1n, 'repo#5')).to.be.revertedWithCustomError(treasury, 'EnforcedPause');
    await expect(treasury.rewardDataSharing(alice.address, 1n, 'data')).to.be.revertedWithCustomError(treasury, 'EnforcedPause');
    await treasury.withdrawTokens(ethers.parseEther('100'));
    expect(await treasury.getBalance()).to.equal(0n);
    await treasury.unpause();
  });

  it('only the owner can pause', async function () {
    await expect(treasury.connect(alice).pause()).to.be.revertedWithCustomError(treasury, 'OwnableUnauthorizedAccount');
  });

  it('recovers non-BNUT tokens but not BNUT', async function () {
    const Token = await ethers.getContractFactory('MockERC20');
    const other = await Token.deploy('Other', 'OTH', 10n);
    await other.transfer(await treasury.getAddress(), 10n);
    await expect(treasury.recoverToken(await other.getAddress(), 10n))
      .to.emit(treasury, 'TokenRecovered')
      .withArgs(await other.getAddress(), owner.address, 10n);
    await expect(treasury.recoverToken(await bnut.getAddress(), 1n)).to.be.revertedWith('Treasury: use withdrawTokens for BNUT');
  });
});
