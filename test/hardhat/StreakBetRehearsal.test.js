const { expect } = require('chai');
const hre = require('hardhat');
const { deployRehearsal } = require('../../scripts/rehearsalFixture');

describe('StreakBet NO REAL FUNDS rehearsal', function () {
  it('runs create → configure → join → report → meetups → agree/dispute/guest → settle/mint, cancel and forfeit', async function () {
    const { createRehearsalSteps } = await import('../../js/streakRehearsal.mjs');
    const fixture = await deployRehearsal(hre);
    const states = [];
    const steps = await createRehearsalSteps(hre.ethers, hre.ethers.provider, fixture,
      (state, method) => states.push({ state, method }));
    expect(steps).to.have.length(13);
    for (const step of steps) await step.run();
    expect(states.filter(item => item.state === 'confirmed')).to.have.length(40);
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
