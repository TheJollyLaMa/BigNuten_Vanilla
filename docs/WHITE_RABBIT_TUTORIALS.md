# Follow the White Rabbit

BigNuten's introductory tutorial is an invitation, not a prerequisite.
Use **About → Follow the White Rabbit** to start or replay the main welcome
journey, the complete deck, or a shorter topic tour. Community Quest's existing
seven reading chapters are also available there; its original Settings
entrypoint, progress and local badge remain intact.

The six-card main journey is followed by a 32-card complete library and three
topic paths: **Food and everyday care**, **Movement and mindfulness**, and
**Community and collaboration**. Cards overlap deliberately between paths;
each path keeps its own reading position. A dismissible first-visit invitation
also offers the main journey without opening it automatically.

## What the guide does

- Explain actual use cases in short cards, with a choice to explore or skip.
- Offer a short main journey before the larger health/community toolkit.
- Point to real app controls and offer safe panel navigation only after an
  explicit user action. The user still chooses what to enter and save.
- Distinguish reading progress from real health activity. Finishing a card
  is not proof of logging, completing a session, attending a meetup or earning
  any reward.
- Yield to real app dialogs while users explore, then let them continue.
- Keep tutorial progress separate from health records and Quest progress.

The rabbit does not fill or save health records, start a workout, breathing
exercise or audio, request location/notification/wallet permission, connect
a provider, invoke a model, upload, vote, stake, purchase or transact.
Missing or hidden controls are reported as unavailable with directions;
the guide does not bypass permission checks or assume a service is live.

## Small wins without pressure

The main journey introduces privacy, water, feelings, comfortable breathing
and a manageable return routine. Users can skip every action, stop a practice,
exit the guide, or return to an earlier card. There is no countdown, penalty
for absence, coercive streak, forced personal disclosure or automatic
notification subscription.

Water is logged with the app's existing **glasses** counter. Its `8` display
reference is not an individualized intake prescription. Nutrition estimates
need review. The supplements panel is not a medication scheduling, prescribing
or clinical decision system. Weight/measurements and feelings are optional,
not diagnoses or competitive scores.

The Moon tracker now separates conventional tithis from the custom local
lunar-day rule described in [Moon Tracker](MOON_TRACKER.md). Tutorial copy must
not turn it into a verified religious calendar or prescribe fasting.
Community aggregates/prototypes, financial source capabilities, actual
deployed services and planned #412 work remain distinct.

## Local state and privacy

Tutorial state records only reading/navigation preferences and local progress;
it must never contain a copy of health logs, wallet identity, precise location,
chat history or secret credentials. It stays in the current browser and is not
synchronized or authoritative.

About provides a rabbit-progress clear action. This must not clear health
records, the connected profile, or the separate Quest badge. Storage failures
are explicitly displayed; session-only operation is not claimed to be
persistent. Launching another guide closes the previous one so two educational
overlays cannot compete.

## Closed contributor reward pilot

The steward-approved seed group is the union of the published BigNuten and
DecentBusking payroll whitelists, plus Zaal and GrannyLyn. The reviewed, deduplicated snapshot
is in [tutorial-reward-pilot.json](../tutorial-reward-pilot.json), with exact
source Git blob hashes. It contains membership/payment-routing facts only,
not either project's payroll balances or health records. It is a frozen
candidate roster, not a live synchronization or an authorization service.
Existing payroll contributors, balances and payout policies are unchanged.
GrannyLyn is separately recorded as a wallet-only invitation under
`invitedParticipants` in the contributor registry, not as a fabricated
GitHub contributor or an approved payable entry.

**Only future reward eligibility is restricted.** Tutorials, manual tracking
and reading progress remain wallet-free. No reward amount has been approved;
the pilot is unfunded and claims are disabled. The earlier 15 BNUT suggestion
was not approved and does not account for Zaal, so it is not a budget.

GrannyLyn's steward-supplied wallet is included, with GitHub registration and
wallet-ownership verification pending; she can explore without a GitHub account.
Zaal is included as invited but pending verified identity/payment registration;
do not guess a GitHub login or wallet. Copilot remains an automation identity,
not a human first-use tester: preserve its BigNuten wallet and Busking
retain-in-fund policies separately rather than redirecting either payroll.

Before any payout feature can activate, approve the participating humans,
per-person amounts and total cap, select/verify the BNUT chain and funding
source, and review duplicate/replay protection and wallet ownership. Editable
browser-local progress is not proof of eligibility or a payable entitlement.
Reward useful, voluntarily reviewed learning/feedback, not fabricated logs,
public health disclosure, fasting, body rankings or repeated clicks. Any
future payment needs separate authorization and financial acceptance tests.

## Content and maintenance

The reviewed card/tour manifest is in `js/tutorialContent.mjs`. Each card has
a stable ID, concrete use case, short guidance and an optional existing UI
target. Community material references `COMMUNITY_GUIDE_SECTIONS` rather than
maintaining a separate financial/privacy policy.

If a UI target changes, update the card, target-map checks and browser tests.
When a service is unavailable, the correct behavior is an honest explanation,
not an imaginary success. All topic tours must remain reachable from About.
No card may label a navigation event as a successful save.

## Reuse decision

Receiving need: an attractive, actionable first-run guide with a replayable
library. Existing BigNuten `js/questMode.js` at main `1629891` supplies prior
patterns for local progress, keyboard navigation, modal yielding and cleanup;
`js/communityGuide.mjs` supplies canonical community text. Preserve the Quest
state schema and seven-chapter badge semantics, and use mutual-exclusion
events to coordinate guides.

DecentBusking's `js/tutorial.js` (last tracked change `3a0741b`) was identified
as the familiar White Rabbit design lead, but its local checkout contains
uncommitted changes and no tracked license was found in the inspected scope.
Do not copy that file or its radio/payment workflows. The rabbit presentation
here is original, and it has no dependency on Busking.

Canopy's curated inventory was checked for onboarding reuse leads, not treated
as a current source-code index. The known BigNuten worktrees and open PRs/issues
were checked for competing implementations. This is scoped reuse research,
not whole-library coverage. No new framework, hosted tutorial service,
telemetry or model dependency is required.

The reward-pilot roster adapts only public registry facts from BigNuten's
`contributor-accounts.json` blob `5f4276b32dd476305e390a1f0847249b40a4eb20`
and DecentBusking's corresponding blob
`0ff8153221e1aa11f5670ebbda1ffadf60a9b4f0`. It does not copy Busking code,
change either payroll, assume cross-project token/chain equivalence, or
constitute a tested payment integration. Receiving-app tests verify membership,
wallet deduplication, separate source payout modes and disabled claims.

## Acceptance evidence

Use the existing Node suite and desktop/mobile smoke runner. Test a real
fixture water entry through its normal controls, confirm it appears once,
remove it through the normal correction control, then replay/skip/exit without
extra records. Existing feelings and optional session checks exercise their
real flows. Test all About tour launches, resume/reset, storage errors, modal
yielding, Quest exclusion, narrow screens and reduced motion.

Implementation validation:

- All 354 Node tests pass, including the pilot roster, content/target map and isolated
  progress, corrupt/denied storage, navigation and safe-opener checks.
- The desktop/mobile walkthrough uses disposable synthetic records: one
  actual glass of water, its correction, and one deliberate emotion save.
  Tutorial replay never adds another entry. Opening Heart/Breathwork does
  not begin a timer or save a session.
- Browser checks cover every About tour, viewport bounds, modal pause/resume,
  skip/back, reload/resume, keyboard Escape, reset/deletion failure, and both
  directions of Quest exclusion. Reset preserves health and Quest records.
  The walkthrough asserts no hosted-model or signing/transaction requests.
- The existing full-app browser suite separately exercises user-started
  breathwork completion/cancellation and real workout/chanting flows.

Scripted walkthroughs are not evidence of improved retention or an observed
human usability study. Before claiming either, collect explicit observations
with consenting new users and without collecting private health records.
That observed new-user check remains an acceptance follow-up for #420, not
something automated fixtures can certify.
