export const COMMUNITY_GUIDE_SECTIONS = Object.freeze([
  Object.freeze({
    id: 'challenges',
    title: 'Challenges and challenge status',
    text: 'Challenge rules and targets come from the selected challenge configuration and its public rules; the planned hydration pilot uses 28 qualifying days in 30 days, four calls, and at least five qualifying logs per call week. Those are configuration values, not universal health targets. Browser-local logs and peer attestations are not medical or cryptographic proof. Follow your own care guidance; never force an activity or fluid intake to protect a stake.',
  }),
  Object.freeze({
    id: 'joining',
    title: 'Joining and locked stakes',
    text: 'Before choosing the real Join button, read the selected challenge’s asset, exact stake, rules, deadlines, forfeit consequences, and payout explainer. Joining commits the captured stake; there is no participant refund withdrawal before settlement. Voluntary forfeit loses the stake. Only captain cancellation refunds non-forfeited entrants, limited to the held balance. Settlement is not a guaranteed full-principal return.',
  }),
  Object.freeze({
    id: 'captaining',
    title: 'Captaining',
    text: 'The captain publishes clear rules, configures and schedules calls, reveals the meetup code during the call, and may invite a non-entrant guest to help resolve a tied review. Settlement is an owner action after challenge end. Captain actions and deployment capabilities are not inferred from source code; check the selected challenge’s actual controls and reported capabilities.',
  }),
  Object.freeze({
    id: 'reviews',
    title: 'Fair reviews',
    text: 'For the documented adaptive review policy, a solo entrant is self-trusted. With peers, a self-claim plus peer agreement verifies attendance; a dispute needs a strict majority after at least three votes. The captain cannot unilaterally declare attendance true. An invited non-entrant guest can review a tie. Confirm the selected contract’s review capability; a missing or unreadable capability is unavailable, not proof of support.',
  }),
  Object.freeze({
    id: 'disputes',
    title: 'Disputes and missed activity',
    text: 'A tied dispute is unresolved and does not count as an approved meetup; a strict majority resolves it. A missed day is not an immediate contract forfeit, but can make configured completion thresholds unreachable. Do not fabricate or backfill evidence. The walkthrough provides no make-up, grace period, appeal, or deadline extension. Ask the captain to clarify the published rules.',
  }),
  Object.freeze({
    id: 'awards',
    title: 'Earned awards and payout-policy capabilities',
    text: 'Awards are earned only at a successful owner-called settlement: completed entrants receive a completion award, and eligible finishers receive place awards. Joining, forfeiting, or cancellation does not mint awards; incomplete or forfeited entrants receive no settlement payout or award. Legacy strict ranking breaks ties by verified days, reports, qualification time, then join order. Source-only payout-policy version 2 ties equal verified days and report counts; time and join order do not break ties. Treat version 2 as active only when the selected contract reports that capability.',
  }),
  Object.freeze({
    id: 'receipts',
    title: 'Receipts and deployment evidence',
    text: 'A final receipt anchor is a separate capability from payout policy. Source supports one immutable final receipt CID per settled competition when finalReceiptAnchorVersion() reports version 1. Existing Base is not upgraded by source changes; a missing or unreadable capability is unavailable and blocks that flow. A receipt hash proves document integrity, not the truth of attendance or health claims. Repository notes are not live RPC verification.',
  }),
  Object.freeze({
    id: 'issues',
    title: 'Filing a useful issue',
    text: 'Describe the expected and actual result, short reproduction steps, app version, browser/device, and any visible error. Separate observations from guesses and say when or where it happened. Remove access tokens, private keys, personal health details, private wallet information, and other people’s data before sharing screenshots or logs. Ask before posting information that is not already public.',
  }),
  Object.freeze({
    id: 'bounties',
    title: 'Bounties',
    text: 'Read the repository’s current bounty scope and acceptance criteria before starting; ask maintainers when ownership or eligibility is unclear. Issue labels or merged code alone do not guarantee bounty approval or payment. This guide does not approve rewards or perform payroll operations.',
  }),
  Object.freeze({
    id: 'privacy',
    title: 'Data and privacy',
    text: 'Community Guide mode includes no health logs or Genie memory by default. The deterministic guide works without a model and does not request wallet access. Community AI, if used, receives only your message and shared guide text; hosted providers require a separate community-scope permission. Read-only challenge coaching uses public challenge/entrant/meetup reads only and never signs, submits, joins, reviews, settles, uploads, or publishes. On-chain counts, addresses, hashes, and votes are public. Raw activity records stay local unless you separately choose a public upload; public copies may persist.',
  }),
]);

const SECTION_BY_ID = new Map(COMMUNITY_GUIDE_SECTIONS.map(section => [section.id, section]));

export function buildCommunityGuidePrompt(question) {
  const safeQuestion = String(question ?? '').trim();
  return `You are Genie in Community Guide mode. Answer only from the shared guide below and the user's question. Be clear about uncertainty and distinguish source capability from deployed behavior. Do not request or infer health logs, Genie memory, wallet secrets, signatures, or transactions. Never claim to perform an action; point to the app's real controls for the user to choose.\n\n${COMMUNITY_GUIDE_SECTIONS.map(section => `## ${section.title}\n${section.text}`).join('\n\n')}\n\nUser question: ${safeQuestion}`;
}

export function buildCommunityTourText() {
  return COMMUNITY_GUIDE_SECTIONS.map((section, index) => `${index + 1}. ${section.title}\n${section.text}`).join('\n\n');
}

export function isCommunityCoachQuestion(question) {
  const text = String(question ?? '');
  if (/\b(issue|bug|pull request|code review)\b/i.test(text)) return false;
  return [
    /\bwhat do i need to do today\b/i,
    /\bwhat should i do today\b/i,
    /\bwhat do i need to do\b/i,
    /\bnext (?:meetup|call)\b/i,
    /\bwhen\b.*\b(?:meetup|meet|call)\b/i,
    /\bchallenge status\b/i,
    /\bhow\b.*\b(?:reviews?|voting|disputes?)\b/i,
    /\b(?:review|vote|dispute)\b.*\b(?:meetup|attendance|entrant|challenge|claim)\b/i,
    /\bwhat happens\b.*\b(?:miss|skip|late)\b/i,
    /\b(?:miss|skipped|late)\b.*\b(?:day|meetup|challenge|call|activity)\b/i,
  ].some(pattern => pattern.test(text));
}

export async function readCommunityChallengeState(contract, account = '', now = Date.now()) {
  if (!contract || typeof contract.nextCompId !== 'function') {
    throw new Error('Challenge reader is unavailable.');
  }
  const total = Number(await contract.nextCompId());
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Challenge count is unavailable.');
  const paused = typeof contract.paused === 'function' ? Boolean(await contract.paused()) : null;
  const challenges = [];

  for (let id = 0; id < total; id += 1) {
    const [competition, config] = await Promise.all([
      contract.getCompetition(id),
      contract.getStreakChallenge(id),
    ]);
    if (!config.enabled) continue;

    const entrant = account ? await contract.getStreakEntrant(id, account) : null;
    const meetupCount = Number(config.requiredMeetups);
    const meetups = [];
    for (let week = 0; week < meetupCount; week += 1) {
      const meetup = await contract.meetups(id, week);
      const checkedIn = entrant?.joined && typeof contract.meetupAttendance === 'function'
        ? Boolean((await contract.meetupAttendance(id, week, account)).checkedIn)
        : null;
      meetups.push({
        week: week + 1,
        configured: Boolean(meetup.configured),
        opensAt: Number(meetup.opensAt),
        closesAt: Number(meetup.closesAt),
        meetingUrl: safeMeetingUrl(meetup.meetingUrl),
        checkedIn,
      });
    }

    challenges.push({
      id,
      name: String(competition.name || `Challenge ${id + 1}`),
      status: Number(competition.status),
      startTime: Number(competition.startTime),
      endTime: Number(competition.endTime),
      joinDeadline: Number(competition.joinDeadline),
      requiredActivityDays: Number(config.requiredActivityDays),
      requiredMeetups: meetupCount,
      minimumWeeklyLogs: Number(config.minimumWeeklyLogs),
      meetupGoal: String(config.meetupGoal || ''),
      entrant: entrant ? {
        joined: Boolean(entrant.joined),
        reportsSubmitted: Number(entrant.reportsSubmitted),
        verifiedMeetups: Number(entrant.verifiedMeetups),
        verifiedActivityDays: Number(entrant.verifiedActivityDays),
        disqualified: Boolean(entrant.disqualified),
        complete: Number(entrant.status) === 1,
      } : null,
      meetups,
    });
  }

  return { available: true, observedAt: Number(now), accountConnected: Boolean(account), paused, challenges };
}

function safeMeetingUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export function buildChallengeCoachAnswer(question, state) {
  const prompt = String(question ?? '');
  const links = [{ label: 'Open Monthly Challenge', href: '#aes-challenge-btn' }];
  const kind = /\b(next meetup|next call|when.*meet)\b/i.test(prompt) ? 'meetup'
    : /\breview|vote|dispute\b/i.test(prompt) ? 'review'
      : /\bmiss(?:ed|ing)?|skip|late\b/i.test(prompt) ? 'missed' : 'today';

  if (kind === 'review') {
    return {
      text: SECTION_BY_ID.get('reviews').text,
      links,
    };
  }
  if (kind === 'missed') {
    return {
      text: SECTION_BY_ID.get('disputes').text,
      links,
    };
  }
  if (!state?.available) {
    return {
      text: 'UNAVAILABLE — I could not read the selected challenge state. No wallet access was requested and no action was taken. Retry the challenge panel or consult its published rules; I will not guess.',
      links,
    };
  }

  const active = state.challenges.filter(challenge => challenge.status === 0);
  const joined = active.find(challenge => challenge.entrant?.joined);
  const selected = joined || active[0];
  if (!selected) {
    return {
      text: state.challenges.length
        ? 'There is no active challenge in the state I read. Past or settled challenge data does not tell me what you must do today.'
        : 'No enabled monthly challenge was returned by the public reader. This may mean none is configured; it does not prove that no challenge exists if the read is incomplete.',
      links,
    };
  }

  const cardLink = { label: `Open ${selected.name}`, href: `#streak-challenge-${selected.id}` };
  if (kind === 'meetup') {
    const next = selected.meetups
      .filter(meetup => meetup.configured && (meetup.closesAt * 1000 >= state.observedAt))
      .sort((left, right) => left.opensAt - right.opensAt)[0];
    if (!next) {
      return { text: `${selected.name}: no future configured meetup was returned by the public read. Ask the captain to confirm the published schedule.`, links: [cardLink, ...links] };
    }
    const open = new Date(next.opensAt * 1000).toISOString();
    const close = new Date(next.closesAt * 1000).toISOString();
    const meetupLinks = next.meetingUrl
      ? [{ label: 'Open scheduled call', href: next.meetingUrl, external: true }, cardLink, ...links]
      : [cardLink, ...links];
    return {
      text: `${selected.name}: the next configured meetup is week ${next.week}, opening ${open} and closing ${close}.${next.checkedIn ? ' The read-only entrant record shows a check-in.' : ''} Confirm the call details with the captain; this coach does not join the call or submit a check-in.`,
      links: meetupLinks,
    };
  }

  if (selected.entrant?.joined) {
    const entrant = selected.entrant;
    return {
      text: `${selected.name}: public entrant state shows ${entrant.verifiedActivityDays}/${selected.requiredActivityDays} verified qualifying days, ${entrant.reportsSubmitted} weekly reports, and ${entrant.verifiedMeetups}/${selected.requiredMeetups} approved meetups${entrant.disqualified ? '; the entrant is marked disqualified' : ''}. These are on-chain values, not a reading of your local activity logs. Follow the selected challenge’s rules and do not force activity or fluid intake. The coach cannot check in or sign.`,
      links: [cardLink, ...links],
    };
  }
  if (!state.accountConnected) {
    return {
      text: `${selected.name}: no wallet account is available, so I cannot read entrant progress. The public challenge card may still show its rules and schedule. The coach does not request wallet access.`,
      links: [cardLink, ...links],
    };
  }
  return {
    text: `${selected.name}: this wallet is not listed as an entrant in the read state. Read the selected rules, exact captured stake, deadlines, forfeit terms, and payout explanation before you decide whether to use the real Join control. The coach does not join or connect a wallet.`,
    links: [cardLink, ...links],
  };
}
