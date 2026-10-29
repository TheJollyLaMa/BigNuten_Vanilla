import { assertLocalRehearsalUrl, createRehearsalSteps, readRehearsalReviewQueue } from './streakRehearsal.mjs';

const button = document.getElementById('next');
const status = document.getElementById('status');
try {
  assertLocalRehearsalUrl(location.href);
  if (window.ethereum) {
    // Deliberately never request or use the injected provider.
    status.textContent = 'Real wallet ignored. Only disposable local accounts are used.';
  }
  const response = await fetch('/rehearsal-fixture.json');
  if (!response.ok) throw new Error('Start npm run rehearsal:serve; the production app cannot serve a rehearsal fixture.');
  const fixture = await response.json();
  for (const [index, label] of ['Captain', 'Alice', 'Bob', 'Guest reviewer'].entries()) {
    const item = document.createElement('li');
    item.textContent = `${label} (disposable TEST account): ${fixture.accounts[index]}`;
    document.getElementById('accounts').append(item);
  }
  const provider = new window.ethers.JsonRpcProvider(new URL('/rehearsal-rpc', location.href).href);
  provider.pollingInterval = 50;
  const steps = await createRehearsalSteps(window.ethers, provider, fixture, (state, message) => {
    const item = document.createElement('li');
    item.dataset.state = state;
    item.textContent = `${state.toUpperCase()} — ${message}`;
    document.getElementById('transactions').append(item);
    status.textContent = `${state.toUpperCase()} — ${message}`;
  });
  let index = 0;
  const render = () => {
    button.disabled = index === steps.length;
    button.textContent = steps[index]?.label || 'Rehearsal complete — no real funds used';
    document.getElementById('role').textContent = steps[index]?.role || 'Rehearsal verified';
  };
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = `PENDING — ${steps[index].label}`;
    try {
      const outcome = await steps[index].run();
      if (outcome?.resultDocument) {
        document.getElementById('result-preview').textContent = JSON.stringify(outcome.resultDocument, null, 2);
        document.getElementById('result-state').textContent =
          `LOCAL DRAFT — ${outcome.resultDocument.participants.length} wallets, SHA-256 ${outcome.resultDocument.contentHash}. Not uploaded or published.`;
      }
      const queue = await readRehearsalReviewQueue(window.ethers, provider, fixture);
      const queueNode = document.getElementById('reviewer-queue');
      queueNode.replaceChildren(...(queue.length ? queue : ['No pending reviews.']).map(message => {
        const item = document.createElement('li');
        item.textContent = message;
        return item;
      }));
      const item = document.createElement('li');
      item.textContent = `CONFIRMED — ${steps[index].label}`;
      document.getElementById('completed').append(item);
      index++;
      status.textContent = index === steps.length
        ? `PASS — all ${steps.length} actions verified; no real funds or publication used.`
        : 'CONFIRMED — ready for the next action';
      render();
    } catch (error) {
      status.dataset.state = 'error';
      status.textContent = `BLOCKED — ${error.message}. Restart the disposable rehearsal; do not retry on a live chain.`;
    }
  });
  status.textContent = 'Ready — fake TEST-BNUT, chain 31337, disposable local accounts only.';
  render();
} catch (error) {
  status.dataset.state = 'error';
  status.textContent = `BLOCKED — ${error.message}`;
}
