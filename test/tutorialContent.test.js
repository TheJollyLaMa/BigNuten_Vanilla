'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

let TUTORIAL_CARDS;
let TUTORIAL_TOURS;
let tutorialCard;
let tutorialTour;
let COMMUNITY_GUIDE_SECTIONS;

before(async () => {
  ({ TUTORIAL_CARDS, TUTORIAL_TOURS, tutorialCard, tutorialTour } =
    await import('../js/tutorialContent.mjs'));
  ({ COMMUNITY_GUIDE_SECTIONS } = await import('../js/communityGuide.mjs'));
});

const cardKeys = ['id', 'title', 'body', 'prompt', 'target', 'actionLabel', 'sections'];
const tourKeys = ['id', 'title', 'description', 'cardIds'];
const allowedTargets = new Set([
  '#water-drop-empty',
  '#emotion-icon',
  '#chakra-heart',
  '#dietBtn',
  '#log-supplements',
  '#log-measurements',
  '#chakra-sacral',
  '#log-exercise',
  '[data-panel="workout-set-list"]',
  '#chakra-throat',
  '#moon-icon',
  '#log-weight',
  '#aesculapius-right',
]);

test('exports 32 cards and the five requested replayable tours', () => {
  assert.equal(TUTORIAL_CARDS.length, 32);
  assert.deepEqual(
    TUTORIAL_TOURS.map(tour => tour.id),
    ['starter', 'complete', 'food-care', 'movement-mind', 'together'],
  );
  assert.equal(TUTORIAL_TOURS[0].cardIds.length, 6);
  assert.equal(TUTORIAL_TOURS[1].cardIds.length, TUTORIAL_CARDS.length);
});

test('card and tour shapes are exact, ids unique, and every tour reference resolves', () => {
  const cardIds = TUTORIAL_CARDS.map(card => card.id);
  const tourIds = TUTORIAL_TOURS.map(tour => tour.id);
  assert.equal(new Set(cardIds).size, cardIds.length);
  assert.equal(new Set(tourIds).size, tourIds.length);

  for (const card of TUTORIAL_CARDS) {
    assert.deepEqual(Object.keys(card).sort(), [...cardKeys].sort(), card.id);
    for (const key of ['id', 'title', 'body', 'prompt', 'target', 'actionLabel']) {
      assert.equal(typeof card[key], 'string', `${card.id}.${key}`);
    }
    assert.ok(card.id.length > 0);
    assert.ok(card.title.length > 0);
    assert.ok(card.body.length > 0 && card.body.length < 650, `${card.id} body length`);
    assert.ok(card.prompt.length > 0);
    assert.ok(Array.isArray(card.sections));
    assert.ok(card.target === '' || allowedTargets.has(card.target), `${card.id} target`);
    assert.equal(Boolean(card.actionLabel), Boolean(card.target), `${card.id} action label`);
    assert.equal(tutorialCard(card.id), card);
  }

  for (const tour of TUTORIAL_TOURS) {
    assert.deepEqual(Object.keys(tour).sort(), [...tourKeys].sort(), tour.id);
    assert.equal(typeof tour.title, 'string');
    assert.equal(typeof tour.description, 'string');
    assert.ok(tour.cardIds.length > 0);
    assert.equal(new Set(tour.cardIds).size, tour.cardIds.length, `${tour.id} duplicate card`);
    for (const cardId of tour.cardIds) assert.ok(cardIds.includes(cardId), `${tour.id}: ${cardId}`);
    assert.equal(tutorialTour(tour.id), tour);
  }
});

test('starter begins with welcome and privacy, then water, emotions, breathing, and return ritual', () => {
  assert.deepEqual(TUTORIAL_TOURS.find(tour => tour.id === 'starter').cardIds, [
    'welcome',
    'privacy-first',
    'hydration',
    'feelings',
    'breathing',
    'return-ritual',
  ]);
});

test('the topical tours together make every card available without the complete tour', () => {
  const topicTours = TUTORIAL_TOURS.filter(tour => tour.id !== 'complete');
  const topicCardIds = new Set(topicTours.flatMap(tour => tour.cardIds));
  assert.deepEqual(
    [...TUTORIAL_CARDS.map(card => card.id).filter(id => !topicCardIds.has(id))],
    [],
  );
});

test('targets are existing allowlisted UI openers and action labels match target presence', () => {
  const html = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');

  for (const card of TUTORIAL_CARDS.filter(item => item.target)) {
    if (card.target.startsWith('#')) {
      const id = card.target.slice(1);
      assert.match(html, new RegExp(`\\bid="${id}"`), card.id);
    } else {
      const [, attr, value] = card.target.match(/^\[([a-z-]+)="([^"]+)"\]$/) || [];
      assert.ok(attr && value, `${card.id} selector syntax`);
      assert.match(html, new RegExp(`\\b${attr}="${value}"`), card.id);
    }
    assert.ok(card.actionLabel.length > 0, card.id);
  }
  assert.ok(TUTORIAL_CARDS.filter(card => !card.target).every(card => card.actionLabel === ''));
});

test('community references use canonical guide section ids only', () => {
  const sectionIds = new Set(COMMUNITY_GUIDE_SECTIONS.map(section => section.id));
  for (const card of TUTORIAL_CARDS) {
    for (const sectionId of card.sections) {
      assert.ok(sectionIds.has(sectionId), `${card.id}: ${sectionId}`);
    }
  }
  assert.ok(TUTORIAL_CARDS.some(card => card.sections.includes('issues')));
  assert.ok(TUTORIAL_CARDS.some(card => card.sections.includes('privacy')));
});

test('sensitive content states health, lunar, community, and financial boundaries', () => {
  const byId = Object.fromEntries(TUTORIAL_CARDS.map(card => [card.id, card]));
  assert.match(byId.hydration.body, /glasses today/i);
  assert.match(byId.hydration.body, /0\/8.*not a personal goal/i);
  assert.match(byId['medication-boundaries'].body, /not a medication manager/i);
  assert.match(byId['lunar-rule'].body, /not been independently checked across other cycles/i);
  assert.match(byId['lunar-rule'].body, /not a required meal cutoff/i);
  assert.match(byId['community-prototype'].body, /does not guarantee a live service/i);
  assert.match(byId['bounties-not-promises'].body, /does not guarantee approval or payment/i);
  assert.match(byId['feature-boundaries'].body, /never connects a wallet, signs, joins, uploads, purchases, or sends a transaction/i);
});

test('practical cards describe actual user-selected workflows without starting them', () => {
  const body = id => tutorialCard(id).body;
  assert.equal(tutorialCard('breathing').target, '#chakra-heart');
  for (const word of ['Heart', 'Breathwork', 'Begin', 'Pause', 'End', 'Save session', 'Cancel / discard']) {
    assert.ok(body('breathing').includes(word), word);
  }
  for (const word of ['best-estimate draft', 'portion', 'scales', 'deliberately save']) {
    assert.ok(body('food-estimates').includes(word), word);
  }
  for (const word of ['Exercises', '+', 'sets', 'Start Workout', 'separate']) {
    assert.ok(body('workout-intervals').includes(word), word);
  }
  for (const word of ['mantra', 'target minutes', 'Start', 'Pause', 'Complete session']) {
    assert.ok(body('chanting').includes(word), word);
  }
  assert.equal(tutorialCard('weight-log').target, '#log-weight');
  assert.equal(tutorialCard('compare-gently').target, '');
  assert.match(body('weight-log'), /manual.*lbs.*Log Weight/i);
  assert.match(body('genie-help'), /Settings.*permission.*manual tracking works without Genie/i);
  assert.match(body('backup-continuity'), /JSON is plaintext.*encrypted backup options.*Wallet connection alone never switches or syncs records/i);
  assert.match(body('share-with-friend'), /Share a link, not your backup/i);
  assert.match(body('fork-and-contribute'), /https:\/\/github\.com\/TheJollyLaMa\/BigNuten_Vanilla/);
  assert.match(body('fork-and-contribute'), /Clone downloads.*Fork creates/i);
});

test('Heart workflow labels exist in the receiving UI and module is ASCII', () => {
  const html = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
  for (const id of ['heart-breathwork-tab', 'breath-begin', 'breath-pause', 'breath-end', 'breath-save', 'breath-cancel']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  const moduleSource = fs.readFileSync(new URL('../js/tutorialContent.mjs', `file://${__filename}`), 'utf8');
  assert.doesNotMatch(moduleSource, /[^\x00-\x7F]/);
});

test('lookup helpers throw explicit errors for unknown ids', () => {
  assert.throws(() => tutorialCard('not-a-card'), {
    name: 'Error',
    message: 'Unknown tutorial card: not-a-card',
  });
  assert.throws(() => tutorialTour('not-a-tour'), {
    name: 'Error',
    message: 'Unknown tutorial tour: not-a-tour',
  });
});
