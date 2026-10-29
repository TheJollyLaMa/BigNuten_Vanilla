const { expect } = require('chai');
const hre = require('hardhat');
const { deployRehearsal } = require('../../scripts/rehearsalFixture');

describe('StreakBet NO REAL FUNDS rehearsal', function () {
  it('runs create → configure → join → report → meetups → agree/dispute/guest → settle/mint, cancel and forfeit', async function () {
    const { createRehearsalSteps } = await import('../../js/streakRehearsal.mjs');
    const fixture = await deployRehearsal(hre);
    const states = [];
    const escrow = new hre.ethers.Contract(fixture.contracts.escrow.address, fixture.contracts.escrow.abi, hre.ethers.provider);
    expect(await escrow.streakPayoutPolicyVersion()).to.equal(2);
    expect(await escrow.finalReceiptAnchorVersion()).to.equal(1);
    const steps = await createRehearsalSteps(hre.ethers, hre.ethers.provider, fixture,
      (state, method) => states.push({ state, method }));
    expect(steps).to.have.length(14);
    let resultPreview;
    for (const step of steps) {
      const outcome = await step.run();
      if (outcome?.resultDocument) resultPreview = outcome.resultDocument;
    }
    expect(resultPreview.schema).to.equal('bignuten-competition-result/v1');
    expect(resultPreview.participants).to.have.length(2);
    expect(resultPreview.participants.some(person => person.actions.some(action => action.type === 'payout'))).to.equal(true);
    expect(resultPreview.awards).to.have.length(4);
    expect(new Set(resultPreview.awards.map(award => award.role))).to.deep.equal(new Set(['completion', 'first']));
    const payoutActions = resultPreview.participants.flatMap(person => person.actions)
      .filter(action => action.type === 'payout');
    expect(payoutActions).to.have.length(2);
    expect(payoutActions.every(action => action.place === 1)).to.equal(true);
    expect(resultPreview.awardLinks.every(link => !Object.hasOwn(link, 'metadataCID'))).to.equal(true);
    expect(resultPreview.manifest.cid).to.match(/^bafkrei/);
    const anchored = await escrow.finalReceiptAnchors(0);
    expect(anchored.receiptHash).to.equal(resultPreview.contentHash);
    expect(anchored.manifestHash).to.equal(resultPreview.manifest.contentHash);
    expect(anchored.cid).to.match(/^bafkrei/);
    await expect(escrow.connect(await hre.ethers.provider.getSigner(fixture.accounts[0]))
      .anchorFinalReceipt(0, anchored.cid, anchored.receiptHash, anchored.manifestHash))
      .to.be.revertedWithCustomError(escrow, 'InvalidReceiptAnchor');
    expect((await escrow.finalReceiptAnchors(0)).receiptHash).to.equal(resultPreview.contentHash);
    expect(JSON.stringify(resultPreview)).not.to.match(/activityDays|progressHash|proofCID|notes|healthData/i);
    expect(states.filter(item => item.state === 'confirmed')).to.have.length(41);
    expect(states.some(item => /Aave/.test(item.method))).to.equal(false);
    expect(await hre.ethers.provider.getBalance(fixture.contracts.escrow.address)).to.equal(0n);
    expect(await hre.ethers.provider.getCode(fixture.forbidden[0])).to.equal('0x');
  });

  it('refuses deployment on a non-Hardhat network before obtaining signers or sending funds', async function () {
    let accessed = false;
    try {
      await deployRehearsal({ network: { name: 'base' }, get ethers() { accessed = true; throw new Error('unsafe'); } });
      expect.fail('Expected a blocked deployment');
    } catch (error) {
      expect(error.message).to.include('REHEARSAL ONLY');
    }
    expect(accessed).to.equal(false);
  });
});
