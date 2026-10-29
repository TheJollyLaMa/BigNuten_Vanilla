const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Final receipt immutable owner anchoring', function () {
  const cid = `bafkrei${'a'.repeat(52)}`;
  const digest = ethers.sha256(ethers.toUtf8Bytes('canonical public JSON'));
  let escrow, owner, other;
  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    escrow = await (await ethers.getContractFactory('StreakBetEscrow')).deploy(owner.address, ethers.ZeroAddress);
    const now = await time.latest();
    for (let i = 0; i < 3; i++) await escrow.createCompetition({
      name: 'Local receipt', stakeToken: ethers.ZeroAddress, stakeAmount: 1,
      totalWeeks: 1, startTime: now + 100, endTime: now + 200, joinDeadline: now + 110,
      yieldEnabled: false, metadataCID: '',
    });
    await escrow.cancelCompetition(2);
    await time.increaseTo(now + 201);
    await escrow.settleCompetition(0, 'manifestCID');
  });
  it('advertises an independent capability and starts empty', async function () {
    expect(await escrow.finalReceiptAnchorVersion()).to.equal(1);
    expect((await escrow.finalReceiptAnchors(0)).cid).to.equal('');
    expect(await escrow.settlementManifestCID(0)).to.equal('manifestCID');
  });
  it('rejects nonowner, nonexistent, active and cancelled IDs', async function () {
    await expect(escrow.connect(other).anchorFinalReceipt(0, cid, digest, digest)).to.be.revertedWithCustomError(escrow, 'OwnableUnauthorizedAccount');
    for (const id of [1, 2, 999]) await expect(escrow.anchorFinalReceipt(id, cid, digest, digest)).to.be.revertedWithCustomError(escrow, 'InvalidReceiptAnchor');
  });
  it('rejects empty/invalid CID or hashes and leaves no anchor', async function () {
    for (const invalid of ['', 'bafyFake', `ipfs://${cid}`, `${cid}/private`, cid.slice(0, -1) + 'b', `bafkreiz${'a'.repeat(51)}`, 'z'.repeat(59)]) {
      await expect(escrow.anchorFinalReceipt(0, invalid, digest, digest)).to.be.revertedWithCustomError(escrow, 'InvalidReceiptAnchor');
    }
    await expect(escrow.anchorFinalReceipt(0, cid, ethers.ZeroHash, digest)).to.be.revertedWithCustomError(escrow, 'InvalidReceiptAnchor');
    await expect(escrow.anchorFinalReceipt(0, cid, digest, ethers.ZeroHash)).to.be.revertedWithCustomError(escrow, 'InvalidReceiptAnchor');
    expect((await escrow.finalReceiptAnchors(0)).cid).to.equal('');
  });
  it('emits competition and manifest linkage, persists exact bytes32 hashes and rejects every replacement', async function () {
    await expect(escrow.anchorFinalReceipt(0, cid, digest, digest)).to.emit(escrow, 'FinalReceiptAnchored')
      .withArgs(0, cid, digest, 'manifestCID', digest);
    const anchor = await escrow.finalReceiptAnchors(0);
    expect([...anchor]).to.deep.equal([cid, digest, digest]);
    await expect(escrow.anchorFinalReceipt(0, cid, digest, digest)).to.be.revertedWithCustomError(escrow, 'InvalidReceiptAnchor');
    await expect(escrow.anchorFinalReceipt(0, `bafybei${'a'.repeat(52)}`, digest, digest)).to.be.revertedWithCustomError(escrow, 'InvalidReceiptAnchor');
  });
});
