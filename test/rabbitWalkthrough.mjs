import assert from 'node:assert/strict';

export async function rabbitWalkthrough(page, { name, walletCalls, hostedRequests, shot }) {
  const click = selector => page.locator(selector).first().click();
  const tours = await page.evaluate(async () => {
    const { TUTORIAL_TOURS, TUTORIAL_CARDS } = await import('/js/tutorialContent.mjs');
    return TUTORIAL_TOURS.map(tour => ({
      ...tour, cards: tour.cardIds.map(id => TUTORIAL_CARDS.find(card => card.id === id)),
    }));
  });
  const starter = tours.find(tour => tour.id === 'starter');
  const beforeCalls = walletCalls.length;
  const beforeModels = hostedRequests.length;
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')));
  const waterBefore = before.waterDailyHistory['2026-10-28'] || 0;
  await click('#app-title-name');
  assert.equal(await page.locator('#rabbit-tutorial-library [data-rabbit-tour]').count(), tours.length);
  await shot('rabbit-library');
  await click('#rabbit-tutorial-library [data-rabbit-tour="starter"]');
  await page.locator('#about-modal').waitFor({ state: 'hidden' });
  await page.locator('#rabbit-tutorial').waitFor({ state: 'visible' });
  const box = await page.locator('#rabbit-tutorial').boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height, 'Tutorial fits the viewport.');
  await shot('rabbit-starter');
  let testedWater = false;
  let testedEmotion = false;
  for (let index = 0; index < starter.cards.length; index++) {
    const card = starter.cards[index];
    assert.equal(await page.locator('#rabbit-title').innerText(), card.title);
    if (card.id === 'hydration') {
      await click('#rabbit-try');
      await page.locator('#water-modal').waitFor({ state: 'visible' });
      await page.locator('#rabbit-tutorial').waitFor({ state: 'hidden' });
      await click('#water-log-btn');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).waterDailyHistory['2026-10-28']), waterBefore + 1);
      assert.equal(await page.locator('#water-modal-count').innerText(), `${waterBefore + 1} / 8`);
      await click('#water-remove-btn');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).waterDailyHistory['2026-10-28']), waterBefore);
      await click('#water-modal-close');
      await page.locator('#rabbit-tutorial').waitFor({ state: 'visible' });
      await click('#rabbit-resume');
      testedWater = true;
    }
    if (card.id === 'feelings') {
      await click('#rabbit-try');
      await page.locator('#emotion-modal').waitFor({ state: 'visible' });
      await page.locator('#rabbit-tutorial').waitFor({ state: 'hidden' });
      await page.locator('#emotionSlices [data-label="Joy"]').first().dispatchEvent('click');
      await click('#ew-log-btn');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).emotions.length), before.emotions.length + 1);
      await click('#emotion-modal .modal-close');
      await page.locator('#rabbit-tutorial').waitFor({ state: 'visible' });
      await click('#rabbit-resume');
      testedEmotion = true;
    }
    if (card.id === 'breathing') {
      await click('#rabbit-try');
      await page.locator('#heart-modal').waitFor({ state: 'visible' });
      await page.locator('#rabbit-tutorial').waitFor({ state: 'hidden' });
      await click('#heart-breathwork-tab');
      assert.equal(await page.locator('#breath-phase').innerText(), 'Ready');
      assert.equal(await page.locator('#breath-elapsed').innerText(), '0:00');
      assert.equal(await page.evaluate(() => (JSON.parse(localStorage.getItem('fitnessTrackerData')).breathworkSessions || []).length), (before.breathworkSessions || []).length, 'Opening breathwork never starts or saves a practice.');
      await click('#heart-modal-close');
      await page.locator('#rabbit-tutorial').waitFor({ state: 'visible' });
      await click('#rabbit-resume');
    }
    if (index < starter.cards.length - 1) await click('#rabbit-next');
  }
  assert.ok(testedWater && testedEmotion, 'Starter includes real water and emotion use cases.');
  await click('#rabbit-exit');
  await page.locator('#rabbit-tutorial').waitFor({ state: 'detached' });
  for (const tour of tours) {
    await click('#app-title-name');
    await click(`#rabbit-tutorial-library [data-rabbit-tour="${tour.id}"]`);
    await page.locator('#rabbit-tutorial').waitFor({ state: 'visible' });
    await click('#rabbit-exit');
  }
  await click('#app-title-name');
  await click('#rabbit-tutorial-library [data-rabbit-tour="complete"]');
  await click('#rabbit-skip');
  assert.equal(await page.locator('#rabbit-title').innerText(), tours.find(tour => tour.id === 'complete').cards[1].title);
  await click('#rabbit-back');
  assert.equal(await page.locator('#rabbit-title').innerText(), tours.find(tour => tour.id === 'complete').cards[0].title);
  await click('#rabbit-next');
  await click('#rabbit-exit');
  await page.reload({ waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
  await click('#app-title-name');
  await click('#rabbit-tutorial-library [data-rabbit-tour="complete"]');
  assert.equal(await page.locator('#rabbit-title').innerText(), tours.find(tour => tour.id === 'complete').cards[1].title, 'Tour resumes its saved card after reload.');
  await page.locator('#rabbit-title').focus();
  await page.keyboard.press('Escape');
  await page.locator('#rabbit-tutorial').waitFor({ state: 'detached' });
  await click('#app-title-name');
  await click('#rabbit-quest-launch');
  await page.locator('#quest-card').waitFor({ state: 'visible' });
  await page.evaluate(async () => (await import('/js/rabbitTutorial.mjs')).initRabbitTutorial().start('starter'));
  await page.locator('#quest-overlay').waitFor({ state: 'detached' });
  await page.locator('#rabbit-tutorial').waitFor({ state: 'visible' });
  await click('#app-title-name');
  await click('#rabbit-quest-launch');
  await page.locator('#rabbit-tutorial').waitFor({ state: 'detached' });
  await page.locator('#quest-card').waitFor({ state: 'visible' });
  await click('#quest-exit');
  const questBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('bignuten:quest:v1')));
  await click('#app-title-name');
  await page.evaluate(() => {
    window.__rabbitRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key) {
      if (key.endsWith('bignuten:rabbit-tutorial:v1')) throw new DOMException('Synthetic denied', 'SecurityError');
      return window.__rabbitRemoveItem.call(this, key);
    };
  });
  await click('[data-rabbit-reset]');
  assert.match(await page.locator('#rabbit-tutorial-library-status').innerText(), /could not be cleared/);
  await page.evaluate(() => {
    Storage.prototype.removeItem = window.__rabbitRemoveItem;
    delete window.__rabbitRemoveItem;
  });
  await click('[data-rabbit-reset]');
  assert.equal(await page.evaluate(() => localStorage.getItem('bignuten:rabbit-tutorial:v1')), null);
  const questAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('bignuten:quest:v1')));
  assert.deepEqual(questAfter, questBefore, 'Rabbit reset preserves Quest reading progress.');
  await click('#about-modal-close');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).waterDailyHistory['2026-10-28']), waterBefore, 'Replaying tours never logs more water.');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTrackerData')).emotions.length), before.emotions.length + 1, 'Replaying never logs another emotion.');
  assert.deepEqual(walletCalls.slice(beforeCalls).filter(method => /requestAccounts|sendTransaction|sign|wallet_/i.test(method)), [], 'No tutorial wallet requests.');
  assert.equal(hostedRequests.length, beforeModels, 'No tutorial hosted-model calls.');
  console.log(`${name}: About library, real water/emotion, optional breathwork, resume/reload/reset, Quest exclusion and action-free replay passed.`);
}
