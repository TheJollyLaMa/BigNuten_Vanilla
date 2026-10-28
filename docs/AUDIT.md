# BigNuten surface audit

Audit for [#348](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/348),
2026-10-28, based on `origin/main` **e260f1a**. Existence was checked against
`index.html` and the actual `js/` handlers, not a feature roadmap.

Follow-up: [PR #364](https://github.com/TheJollyLaMa/BigNuten_Vanilla/pull/364)
addresses Genie privacy/consent (#349) and the raw-food opener/persistence (#361).
The matrix below retains its original e260f1a audit scope; see the current
[smoke guide](browser-smoke.md) and README for the added acceptance coverage.

## Method and result vocabulary

- **PASS / smoke**: real Chromium render/open/close assertions on desktop
  1440×1000 and mobile 390×844, with screenshots in `test-results/smoke/`.
  The automation performs the listed checks; no separate human visual review is
  claimed. `—` means no additional bug identified by these checks, not bug-free.
- **KNOWN GAP**: a source-confirmed surface or lifecycle limitation, linked below.
- All browser rows use **B = `test/browser-smoke.mjs`**. Every modal row gets
  visible, nonzero-size, screenshot, real trigger and real close assertions unless
  explicitly marked otherwise. Every dashboard panel gets content, toggle and
  Genie-chat open/close assertions. The DOM discovery guard rejects unaccounted
  dialogs; viewport-only education/sheet exceptions are explicit.
- Local fixture wallet and ABI-encoded empty-chain reads only. External services
  are intercepted; no signatures, transactions, uploads, AI prompts, credentials,
  or real health records. Offline/empty/unavailable states are retained. This is
  **not** production-chain, live-IPFS, purchase, or medical correctness validation.

## Health, dashboard and data surfaces

| Surface → actual source / selector | Exists? | Manual / automated check result | Automated test (file) | Bugs filed / tracked |
| --- | --- | --- | --- | --- |
| Nutrition / raw intake panel → `index.html`, `js/app.js`, `#recent-foods-list` | Yes | PASS / smoke: content, daily/weekly/monthly/annual DV navigation, Genie | B | — |
| Diet intake modal → `js/app.js`, `#dietModal` via `#dietBtn` | Yes | PASS / smoke: opens and closes | B | — |
| Legacy raw-food modal → `js/app.js`, `#rawFoodModal` expects missing `#dietButton` | Markup/handler, unreachable | KNOWN GAP: assert present but hidden and missing opener; not a successful user journey | B (explicit discovery exception) | [#361](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/361), concurrent worker |
| Nutrient goal / manage nutrients → `js/app.js`, `#dv-goal-modal`, `#dv-manage-modal` | Yes | PASS / smoke: reachable from nutrition panel | B | — |
| Exercise log / recent exercises → `js/app.js`, `#exercise-modal`, `#recent-exercises-list` | Yes | PASS / smoke: submit synthetic Push-ups, six reps, weight ten; recent log and add-to-workout button appear | B | — |
| Workout set list → `js/app.js`, `#workout-set-list` | Yes | PASS / smoke: add logged exercise, content and Genie | B | — |
| Workout timer / cancellation → `js/app.js`, `#workout-timer-modal` | Yes | PASS / fake-clock cancellation during initial and between-set preparation; advance 12s and assert no emotion modal or completed session | B; `test/workoutTimer.test.js` | Fixed: [#362](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/362) |
| Weight → `js/app.js`, `#weight-modal` | Yes | PASS / smoke: modal and real Chart.js initialization, no device acquisition | B; `test/fitnessRoundTrip.test.js` (record preservation) | — |
| Water meter / log → `js/app.js`, `#water-tracker`, `#water-modal` | Yes | PASS / smoke: visible meter and modal; not a persistence acceptance pass | B; `test/fitnessRoundTrip.test.js`, `test/snapshotRecovery.test.js` | [#257](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/257), [#265](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/265), [#204](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/204), concurrent worker |
| Supplements panel / form → `js/app.js`, `#recent-supplements-list`, `#supplements-modal` | Yes | PASS / smoke: panel, form modal and Genie | B; `test/fitnessRoundTrip.test.js` | — |
| Measurements → `js/app.js`, `#measurements-modal` | Yes | PASS / smoke: modal and chart initialization | B; `test/fitnessRoundTrip.test.js` | — |
| Pain / body log → `js/app.js`, `#pain-log-modal`, sacral chakra opener | Yes | PASS / smoke: open and close through body control | B; `test/fitnessRoundTrip.test.js` | — |
| Emotions → `js/feelingsWheel.js`, `js/app.js`, `#emotion-modal` | Yes | PASS / smoke: emotion wheel renders and closes | B; `test/fitnessRoundTrip.test.js` | — |
| Chakra / aura → `js/chakra.js`, `.chakra-icon`, `#chakra-aura-canvas` | Yes | PASS / smoke: visible icons and canvas with positive drawing dimensions; not a score/color correctness test | B | — |
| Yoga Flow → `js/yoga.js`, `#yoga-flow-modal` | Yes | PASS / smoke: start synthetic session, active screen/timer, confirm End, completion screen | B | — |
| Breathwork → `js/yoga.js`, `#yoga-breath-aura`, `#yoga-breath-label` | Within Yoga, not standalone | PASS / smoke: active breathing aura, inhale/exhale/hold cue and timer; not physiological validation | B | — |
| Sun / moon / ekadasi → `js/app.js`, `#moon-modal` | Yes | PASS / smoke: Moon Day and Sun Day text, location-unlinked state, ekadasi reference links. Fasting-day status can intentionally hide outside its date | B | — |
| Correlation graph → `js/correlationGraph.js`, `#correlation-graph-modal` | Yes | PASS / smoke: graph modal opens/closes; no statistical accuracy claim | B | — |
| About / timezone → `js/app.js`, `js/timezone.js`, `#about-modal`, `#tz-select` | Yes | PASS / smoke: clock visible, choose Honolulu and assert stored preference, return to UTC | B; `test/fitnessRoundTrip.test.js` (schema timeZone) | — |
| Community dashboard → `js/communityDashboard.js`, `#data-sharing-modal` | Yes (prototype local aggregates) | PASS / smoke: exercise, nutrition, BNUT and data-pool tabs each selected and content visible. Not proof of a shared public data pool | B; `test/dataSharingHistory.test.js`, `test/dataSharingRouter.test.js` | — |
| JSON data control / export / import → `js/dataControl.js` | Yes | PASS / node: real export Blob, clear isolated store, real FileReader import, persisted per-key equality and idempotent re-import | `test/fitnessRoundTrip.test.js`; B (storage controls) | Delete-data guardrail separately tracked in [#359](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/359) |
| Local snapshot / restore → `js/snapshotRecovery.js`, `js/fitnessSchema.js` | Yes | PASS / node: newest dated point restores all 13 populated defaultData keys and water caches after primary removal | `test/fitnessRoundTrip.test.js`, `test/snapshotRecovery.test.js` | Notice UX separately tracked in [#360](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/360) |
| IPFS connect / snapshot viewer → `js/dataControl.js`, `#ipfs-connect-dialog`, `#ipfs-snapshot-panel` | Yes | PASS / smoke: open/close disconnected connect UI and fixture-mode snapshot viewer; no remote connection/upload claimed | B; `test/dataControlStorage.test.js`, `test/snapshotTransport.test.js` | Water UI restore [#204](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/204) |
| IPFS onboarding / mobile data sheet → `js/dataControl.js`, `#ipfs-edu-overlay`, `#mobile-data-sheet` | Yes, viewport-specific | PASS / smoke: desktop education skip, mobile sheet open/close; opposite viewport explicitly N/A | B | — |
| Genie panel chats / Yoga Genie / memory → `js/genieChat.js`, `js/genieMemory.js`, `js/yoga.js` | Yes | PASS / smoke: enable setting, four panel chats, Yoga chat, memory review modal. No prompt/model download; privacy wording is not approved by rendering pass | B; `test/fitnessRoundTrip.test.js` (sessions/insights) | [#349](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/349), concurrent worker |
| Settings → `js/app.js`, `#settings-modal` | Yes | PASS / smoke: opens/closes; Genie toggle enabled for chat coverage | B | [#349](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/349) |

## Wallet, community and financial surfaces

| Surface → actual source / selector | Exists? | Manual / automated check result | Automated test (file) | Bugs filed / tracked |
| --- | --- | --- | --- | --- |
| Wallet / network → `js/app.js`, `js/contracts.js`, `#wallet-connect` | Yes | PASS / smoke: real connect control requests fixture account, connected dataset matches, chain is Base 8453 and real ethers eth_call reads occur. No live network switching or signing | B | — |
| Governance → `js/governance.js`, `#governance-modal` | Yes | PASS / smoke: open/close with read-only empty-chain fixture | B; Hardhat governance tests under `test/hardhat/` | — |
| Treasury → `js/treasury.js`, `js/app.js`, `#treasury-admin-modal` | Yes | PASS / smoke: admin-menu route, visible dialog, close; not settlement | B; `test/payroll.test.js` | — |
| Payroll → `js/treasury.js`, `js/app.js`, `#payroll-modal` | Yes | PASS / smoke: queue UI opens/closes; no payout sent | B; `test/payroll.test.js` | — |
| StreakBet user / achievement surface → `js/competitions.js`, `js/streakCompetitions.js`, `#achievements-modal`, `#comp-user-list` | Yes | PASS / smoke: explicit competition list content (empty/unavailable fixture state), open/close; no stakes | B; `test/streakRules.test.js`; Hardhat StreakBet tests under `test/hardhat/` | Lifecycle timer issue above is independent of escrow |
| Competition / StreakBet admin → `#comp-admin-modal`, `js/competitions.js`, `js/streakCompetitions.js` | Yes | PASS / smoke: menu route and dialog; no admin transaction | B | — |
| DNFT purchase → `js/app.js`, `#aes-dnft-btn` → `#about-modal`, `#dnft-supporter-section` | Yes | PASS / smoke: actual Supporter DNFT menu route, edition/deployment-status container and fiat wallet input visible; no purchase, approval, Stripe or PayPal submission | B; contract tests under `test/hardhat/` | — |
| DeFi panel → `js/defi.js`, `js/app.js`, `#defi-admin-modal` | Yes | PASS / smoke: real admin menu route, render and close; read-only fixtures, no deposits/borrowing/swaps | B | — |
| BNUT administration → `#bnut-admin-modal`, `js/app.js` | Yes | PASS / smoke: menu, render, close | B | — |
| Subscription-plan / escrow administration → `#escrow-admin-modal`, `js/app.js` | Yes | PASS / smoke: menu, render, close | B | — |
| Contributors / add contributor → `#contributors-admin-modal`, `#admin-add-contributor-modal`, `js/app.js` | Yes | PASS / smoke: parent and nested dialog reachable/closable | B | — |
| Subscription status → `#subscription-modal`, `js/subscription.js`, `js/app.js` | Yes | PASS / smoke: menu, render, close | B | — |
| Monthly challenge → `#challenge-modal`, `js/app.js` | Yes | PASS / smoke: menu, render, close | B | — |
| Bounty registration → `#bounty-register-modal`, `js/app.js` | Yes | PASS / smoke: menu, render, close | B | — |

## Reproduction and limits

```sh
npm ci
npm test                    # 63 Hardhat + 72 node tests
npx playwright install chromium # only if browser is missing
npm run test:smoke           # desktop and mobile, zero unexpected errors
```

The round-trip fixture explicitly enumerates every `defaultData` key, asserts
key-set equality so schema additions demand coverage, and uses nondefault values
for all keys except the fixed schema version. It tests the actual JSON handlers,
not a replacement serializer. Snapshot restore uses the production injected-store
helper and checks each persisted key. Clearing is an isolated in-memory test
operation, **not** certification of a user-facing “delete my data” flow (#359).

The #362 timer lifecycle fix shares one handle across preparation, work and rest
countdowns and clears it on cancel. An empty-sequence guard blocks stale step
callbacks. Desktop/mobile smoke advances a fake clock after both initial and
between-set preparation cancellation and verifies no delayed modal or session write.
Known water and Genie/raw-food issues remain with their coordinated workers.
No duplicate issues were filed for those. The only new audit issue is #362.

## Reuse decision

Need: complete receiving-app surface assertions and lossless default-schema backup
round trips. Reused the existing BigNuten `test/browser-smoke.mjs`, actual
`js/dataControl.js` export/import, `js/fitnessSchema.js` validation/defaults and
`js/snapshotRecovery.js#createSnapshotRecovery` at **e260f1a** (PR #358); no new
production helper. Adapted the existing local-store/global-fixture pattern from
`test/dataControlStorage.test.js` and `test/snapshotRecovery.test.js`.

Read-only donor inspection of origin/main: **DecentHead**
`426ccb7ad8de658cda374b11ebc4b544b35257e6`, `test/browser-smoke.mjs`, and
**DecentMarket** `234d1e21b706b365249aaeb26eb03c10e9da6973`,
`test/market-adoption.browser.mjs`. Their Apache-2.0 smoke/error collection,
EIP-1193 and routed-RPC patterns are already credited/adapted in the receiving
harness; extend that adaptation rather than duplicate it. BigNuten's vanilla
CDN DOM, schema, ABI, privacy and storage behavior differ from donor apps; no
shared abstraction or donor app runtime was imported. Consulted the Canopy
inventory as a curated lead, not a live/complete code index; checked local status
and worktrees and left concurrent water/Genie implementations untouched.
Acceptance is the receiving checkout's `npm test` and `npm run test:smoke`, not
a donor test result. No private findings were added to a public Canopy snapshot.

### Workout cancellation (#362)

Need: cancel every workout countdown without delayed completion. Adapted the
existing sequential countdowns in `js/app.js#prepareWorkoutSequence`,
`runWorkoutStep` and `startCountdown` at `d962efc`; all now share the existing
workout timer handle and a single cleanup helper. No external runtime, storage,
auth or deployment contract changes. Reused the receiving app's browser fixture
and fake clock; node tests execute the production workout block in an isolated
VM. Search scope was this worktree's workout sources/tests, current open PRs and
existing reuse notes above; no new cross-repo extraction was needed. Acceptance:
`npm test` and desktop/mobile `npm run test:smoke`, covering initial preparation,
between-set preparation and unchanged successful completion.
