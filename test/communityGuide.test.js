'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let COMMUNITY_GUIDE_SECTIONS;
let buildCommunityGuidePrompt;
let buildCommunityTourText;
let buildChallengeCoachAnswer;
let isCommunityCoachQuestion;
let readCommunityChallengeState;
let buildHealthCompanionPrompt;

const now = Date.parse('2026-10-29T12:00:00Z');

before(async () => {
  ({
    COMMUNITY_GUIDE_SECTIONS,
    buildCommunityGuidePrompt,
    buildCommunityTourText,
    buildChallengeCoachAnswer,
    isCommunityCoachQuestion,
    readCommunityChallengeState,
  } = await import('../js/communityGuide.mjs'));
  ({ buildHealthCompanionPrompt } = await import('../js/genieChat.js'));
});

function fakeContract({ joined = true, meetingUrl = 'https://meet.example.test/call' } = {}) {
  const reads = [];
  const competition = {
    name: 'Hydration circle',
    status: 0,
    startTime: 1_798_000_000,
    endTime: 1_801_000_000,
    joinDeadline: 1_799_000_000,
  };
  const config = {
    enabled: true,
    requiredActivityDays: 28,
    requiredMeetups: 2,
    minimumWeeklyLogs: 5,
    meetupGoal: 'a shared goal',
  };
  const entrant = {
    joined,
    reportsSubmitted: 1,
    verifiedMeetups: 1,
    verifiedActivityDays: 7,
    disqualified: false,
    status: 0,
  };
  const contract = {
    async nextCompId() { reads.push('nextCompId'); return 2; },
    async paused() { reads.push('paused'); return false; },
    async getCompetition(id) {
      reads.push(`getCompetition:${id}`);
      return id === 0 ? competition : { ...competition, name: 'Disabled challenge' };
    },
    async getStreakChallenge(id) {
      reads.push(`getStreakChallenge:${id}`);
      return id === 0 ? config : { ...config, enabled: false };
    },
    async getStreakEntrant(id) { reads.push(`getStreakEntrant:${id}`); return entrant; },
    async meetups(id, week) {
      reads.push(`meetups:${id}:${week}`);
      return week === 0
        ? { configured: true, opensAt: Math.floor(now / 1000) + 3600, closesAt: Math.floor(now / 1000) + 7200, meetingUrl }
        : { configured: false, opensAt: 0, closesAt: 0, meetingUrl: '' };
    },
    async meetupAttendance(id, week) {
      reads.push(`meetupAttendance:${id}:${week}`);
      return { checkedIn: week === 0 };
    },
  };
  return { contract, reads };
}

test('shared guide corpus powers the deterministic no-model tour and pure Genie prompt', () => {
  const prompt = buildCommunityGuidePrompt('How do reviews work?');
  const tour = buildCommunityTourText();
  for (const section of ['challenges', 'joining', 'captaining', 'reviews', 'disputes', 'awards', 'receipts', 'issues', 'bounties', 'privacy']) {
    const item = COMMUNITY_GUIDE_SECTIONS.find(entry => entry.id === section);
    assert.ok(item, section);
    assert.ok(prompt.includes(item.text), section);
    assert.ok(tour.includes(item.title), section);
  }
  assert.match(prompt, /no health logs or Genie memory/i);
  assert.match(prompt, /Source-only payout-policy version 2/);
  assert.match(prompt, /finalReceiptAnchorVersion/);
  assert.doesNotMatch(prompt, /Secret health log/);
});

test('health companion prompt builder is pure and keeps existing context boundaries explicit', () => {
  const fixed = new Date('2026-10-29T12:00:00Z');
  const prompt = buildHealthCompanionPrompt('## Exercise Log\nSynthetic health entry', true, '2026-10-28', {
    text: 'Pinned synthetic insight',
  }, fixed);
  assert.match(prompt, /Synthetic health entry/);
  assert.match(prompt, /Pinned synthetic insight/);
  assert.match(prompt, /2026-10-28/);
  assert.match(prompt, /Some older log entries were omitted/);
  assert.doesNotMatch(prompt, /Community Guide/);
});

test('mock contract reads only public getters and coach reports on-chain state without reading health logs', async () => {
  const { contract, reads } = fakeContract();
  const state = await readCommunityChallengeState(contract, '0x1234', now);
  assert.deepEqual(reads, [
    'nextCompId', 'paused', 'getCompetition:0', 'getStreakChallenge:0',
    'getStreakEntrant:0', 'meetups:0:0', 'meetupAttendance:0:0',
    'meetups:0:1', 'meetupAttendance:0:1',
    'getCompetition:1', 'getStreakChallenge:1',
  ]);
  assert.equal(state.challenges.length, 1);
  assert.equal(state.challenges[0].entrant.verifiedActivityDays, 7);
  assert.equal(state.challenges[0].meetups[0].checkedIn, true);
  assert.equal(state.challenges[0].meetups[1].configured, false);
  const today = buildChallengeCoachAnswer('What do I need to do today?', state);
  assert.match(today.text, /7\/28 verified qualifying days/);
  assert.match(today.text, /not a reading of your local activity logs/);
  assert.deepEqual(today.links.map(link => link.href), ['#streak-challenge-0', '#aes-challenge-btn']);
  assert.ok(reads.every(name => !/join|submit|review|settle|upload|publish/i.test(name)));
});

test('mock meetup read links only the configured https call and displays unavailable cases honestly', async () => {
  const { contract } = fakeContract();
  const state = await readCommunityChallengeState(contract, '', now);
  const answer = buildChallengeCoachAnswer('When is the next meetup?', state);
  assert.match(answer.text, /2026-10-29T13:00:00.000Z/);
  assert.equal(answer.links[0].href, 'https://meet.example.test/call');
  assert.equal(answer.links[0].external, true);

  const unsafe = fakeContract({ meetingUrl: 'javascript:alert(1)' });
  const unsafeState = await readCommunityChallengeState(unsafe.contract, '', now);
  assert.equal(buildChallengeCoachAnswer('When is the next meetup?', unsafeState).links[0].href, '#streak-challenge-0');
  assert.match(buildChallengeCoachAnswer('What do I need to do today?', { available: false }).text, /^UNAVAILABLE/);
});

test('coach review and missed-day answers stay policy-bounded and never imply automatic forfeit', () => {
  const review = buildChallengeCoachAnswer('How do reviews work?', null);
  assert.match(review.text, /strict majority after at least three votes/);
  assert.match(review.text, /missing or unreadable capability is unavailable/);
  const missed = buildChallengeCoachAnswer('What happens if I miss?', null);
  assert.match(missed.text, /not an immediate contract forfeit/);
  assert.match(missed.text, /no make-up, grace period, appeal, or deadline extension/);
  assert.doesNotMatch(missed.text, /you automatically forfeit/);
  assert.equal(isCommunityCoachQuestion('What do I need to do today?'), true);
  assert.equal(isCommunityCoachQuestion('What is a great issue report?'), false);
});
