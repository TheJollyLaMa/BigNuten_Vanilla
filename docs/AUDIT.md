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
| Sun / moon / ekadasi → `js/moonTracker.mjs`, `js/lunarAstronomy.mjs`, `#moon-modal` | Yes | Automated numerical checks: independent USNO phases/rise times and JPL planet/tithi fixtures. Browser coverage: separate tithi/age/moonrise count, explicit location/timezone, custom rule, Now/simulation and reduced motion. See `docs/MOON_TRACKER.md`; no official religious calendar/parana claim | B; `test/lunarAstronomy.test.js` | — |
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


## npm dependency advisory triage (#376)

### Scope and counts — 2026-11-02

Baseline: `origin/main` **59fa62b**, isolated `feat/npm-audit` worktree.
Commands: `npm ci`, then `npm audit --json`, both before and after the scoped
updates. Node **24.3.0**, npm **11.4.2**, public npm registry. Audit data changes
over time: the issue's historical 43 is not today's measured baseline.

Counts below use npm's **affected-package entries**, including metavulnerable
parents, not one count per GHSA, installed copy, or exploitable application bug.
Runtime means an affected installed instance imported by `services/` or shipped
to the browser; dev-only means contract/test/deployment tooling. Classification
is by actual import paths, **not** the manifest's `devDependencies` label.

| Scope | Before low | moderate | high | critical | total | After low | moderate | high | critical | total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Browser / Render runtime | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Development / operations tooling | 19 | 17 | 15 | 0 | 51 | 19 | 15 | 1 | 0 | 35 |
| All affected package entries | 19 | 17 | 15 | 0 | 51 | 19 | 15 | 1 | 0 | 35 |

Deduplicating `via[].source` gives **39 → 6 distinct advisories** (before:
8 low / 17 moderate / 14 high; after: 2 low / 3 moderate / 1 high).
The 6 residual GHSAs affect 35 parent/package entries; do not sum both metrics.
Low totals need not decrease because fixing a high/moderate child can downgrade
its parent's reported severity.

### Runtime boundary and limitations

- `services/storageRelay.js` (`verifyMessage`) and
  `services/nutritionService.mjs` (`getAddress`, `verifyMessage`) import root
  **ethers 6.17.0** and dotenv 16.6.1. Neither is affected in this audit.
  The affected `ethers` entry is **5.8.0 nested under eth-gas-reporter**.
  Its `@ethersproject/*` dependencies are tooling, not service dependencies.
- `index.html` loads CDN ethers **6.13.4**, Chart.js and the date-fns adapter;
  the browser uses native WebSocket rather than the npm Node `ws` transport.
  npm's lockfile audit does **not** scan CDN bytes, mutable CDN versions,
  vendored scripts, browser/Node built-ins, or Solidity contract correctness.
  Browser smoke substitutes local npm fixtures for the CDN resources; it is not
  evidence that live CDN assets were security-audited or upgraded.
- Render build commands currently install development dependencies as well.
  Dev-only means no observed request/browser import path, **not absent from the
  deployed filesystem**, harmless during builds, or immune to supply-chain risk.
  Do not simply use `npm audit --omit=dev` as proof: ethers is currently declared
  as devDependency despite its service use. Moving/pruning deployment packages
  needs a separate deployment test, not a blind omit-dev change here.
- Network parser flaws are reachable when developer tools contact hostile RPCs,
  downloads or explorers, even though no runtime application path was found.
  No keys, live transactions, private services or other worktrees were used.

### Every distinct baseline advisory: reachability and disposition

Every row below is **dev-only** at the affected installed instance. All GHSA
identifiers from the baseline JSON are listed, including advisories removed by
the updates. “Accepted” is risk acceptance under the conditions described, not a
claim the vulnerable code is unreachable in every possible tooling invocation.

| Package / advisory | Severity | Reachability in this repository | Disposition / rationale |
| --- | --- | --- | --- |
| `@fastify/busboy` — [GHSA-x8mw-p69m-v3mx](https://github.com/advisories/GHSA-x8mw-p69m-v3mx) | high | Undici 5 multipart parser in Hardhat/verification; not used by either Render HTTP server. | Removed with Undici 6. |
| `@fastify/busboy` — [GHSA-gxm5-99cw-xjw9](https://github.com/advisories/GHSA-gxm5-99cw-xjw9) | moderate | Undici 5 multipart parser in Hardhat/verification; not used by either Render HTTP server. | Removed with Undici 6. |
| `adm-zip` — [GHSA-xcpc-8h2w-3j85](https://github.com/advisories/GHSA-xcpc-8h2w-3j85) | high | Hardhat Windows compiler ZIP download/extraction; a compromised download or untrusted archive could trigger memory, extraction or permission flaws. | Hardhat-only override to 0.6.1; extraction API tested. |
| `adm-zip` — [GHSA-7q85-xj36-vmfc](https://github.com/advisories/GHSA-7q85-xj36-vmfc) | high | Hardhat Windows compiler ZIP download/extraction; a compromised download or untrusted archive could trigger memory, extraction or permission flaws. | Hardhat-only override to 0.6.1; extraction API tested. |
| `adm-zip` — [GHSA-rcw4-f5rp-g42v](https://github.com/advisories/GHSA-rcw4-f5rp-g42v) | high | Hardhat Windows compiler ZIP download/extraction; a compromised download or untrusted archive could trigger memory, extraction or permission flaws. | Hardhat-only override to 0.6.1; extraction API tested. |
| `adm-zip` — [GHSA-j5f4-cc29-5x44](https://github.com/advisories/GHSA-j5f4-cc29-5x44) | high | Hardhat Windows compiler ZIP download/extraction; a compromised download or untrusted archive could trigger memory, extraction or permission flaws. | Hardhat-only override to 0.6.1; extraction API tested. |
| `adm-zip` — [GHSA-p634-w6r4-rjp2](https://github.com/advisories/GHSA-p634-w6r4-rjp2) | moderate | Hardhat Windows compiler ZIP download/extraction; a compromised download or untrusted archive could trigger memory, extraction or permission flaws. | Hardhat-only override to 0.6.1; extraction API tested. |
| `adm-zip` — [GHSA-c6fg-446q-cg94](https://github.com/advisories/GHSA-c6fg-446q-cg94) | moderate | Hardhat Windows compiler ZIP download/extraction; a compromised download or untrusted archive could trigger memory, extraction or permission flaws. | Hardhat-only override to 0.6.1; extraction API tested. |
| `adm-zip` — [GHSA-8238-w5pm-2374](https://github.com/advisories/GHSA-8238-w5pm-2374) | high | Hardhat Windows compiler ZIP download/extraction; a compromised download or untrusted archive could trigger memory, extraction or permission flaws. | Hardhat-only override to 0.6.1; extraction API tested. |
| `bn.js` — [GHSA-378v-28hj-76wf](https://github.com/advisories/GHSA-378v-28hj-76wf) | moderate | Legacy web3/ethjs numeric conversion in gas/coverage tooling; malformed numeric inputs could hang tools. | Override only bn.js <5 to 4.12.5; retain 5.2.5 elsewhere. |
| `cookie` — [GHSA-pxg6-pf52-xh8x](https://github.com/advisories/GHSA-pxg6-pf52-xh8x) | low | Sentry integration installed by Hardhat; no browser/service cookie path through this package. | Sentry-only override to 0.7.2; parse API tested. |
| `diff` — [GHSA-73rr-hh4g-fpgx](https://github.com/advisories/GHSA-73rr-hh4g-fpgx) | low | Mocha assertion reporter uses createPatch, not vulnerable parsePatch/applyPatch on attacker patches. | Only diff 6/7 overridden to 8.0.3; createPatch/applyPatch compatibility tested. |
| `elliptic` — [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84) | low | Legacy ethers 5 signing and network-helper ethereumjs-util crypto. Reachable in developer signing; not ethers 6 service verification. | Accepted: no patched elliptic release. Avoid production keys in tool fixtures; migrate legacy gas/helper dependencies separately. |
| `glob` — [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | moderate | Mocha test discovery (glob 10); other reported glob 5/7/8 nodes are propagated via minimatch, not the direct AbortSignal advisory. Repository-owned patterns/files, not HTTP inputs. | Accepted: direct fix requires glob >14.0.1. Older callback APIs differ from current glob; defer coordinated Mocha/coverage/typechain upgrades. Do not rely on cancellation as a sandbox. |
| `minimatch` — [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | moderate | Mocha, coverage and typechain file matching with repository-owned globs. Attacker-controlled patterns could exhaust tool CPU/memory. | Accepted: fixed >=11.0.1 changes legacy callable APIs and requires newer Node. No global major override across callback-era consumers; review untrusted test/config changes. |
| `serialize-javascript` — [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq) | high | Mocha parallel worker option serialization; npm test runs serially, with repository-owned options. RCE/DoS requires crafted option objects; XSS requires embedding serialized function bodies into HTML, which this app does not do. | Accepted high risk in tooling: fix >=7.1.3 raises Node minimum to 20 versus declared >=18 and changes serialization behavior. Do not enable parallel runs with untrusted options or embed tool output as HTML; migrate Mocha and serialization together. |
| `serialize-javascript` — [GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v) | moderate | Mocha parallel worker option serialization; npm test runs serially, with repository-owned options. RCE/DoS requires crafted option objects; XSS requires embedding serialized function bodies into HTML, which this app does not do. | Accepted high risk in tooling: fix >=7.1.3 raises Node minimum to 20 versus declared >=18 and changes serialization behavior. Do not enable parallel runs with untrusted options or embed tool output as HTML; migrate Mocha and serialization together. |
| `serialize-javascript` — [GHSA-m5mm-p8h7-m29v](https://github.com/advisories/GHSA-m5mm-p8h7-m29v) | low | Mocha parallel worker option serialization; npm test runs serially, with repository-owned options. RCE/DoS requires crafted option objects; XSS requires embedding serialized function bodies into HTML, which this app does not do. | Accepted high risk in tooling: fix >=7.1.3 raises Node minimum to 20 versus declared >=18 and changes serialization behavior. Do not enable parallel runs with untrusted options or embed tool output as HTML; migrate Mocha and serialization together. |
| `tmp` — [GHSA-52f5-9888-hmc6](https://github.com/advisories/GHSA-52f5-9888-hmc6) | low | solc-js optional SMT solver fileSync helper; malicious prefix/postfix or symlinked directories could escape scratch space. Normal compiler settings do not enable SMT solving. | solc-only override to 0.2.7; fileSync/cleanup tested in project-owned directory. Compiler version unchanged. |
| `tmp` — [GHSA-ph9p-34f9-6g65](https://github.com/advisories/GHSA-ph9p-34f9-6g65) | high | solc-js optional SMT solver fileSync helper; malicious prefix/postfix or symlinked directories could escape scratch space. Normal compiler settings do not enable SMT solving. | solc-only override to 0.2.7; fileSync/cleanup tested in project-owned directory. Compiler version unchanged. |
| `undici` — [GHSA-g9mf-h72j-4rw9](https://github.com/advisories/GHSA-g9mf-h72j-4rw9) | moderate | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-2mjp-6q6p-2qxm](https://github.com/advisories/GHSA-2mjp-6q6p-2qxm) | moderate | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-vrm6-8vpv-qv8q](https://github.com/advisories/GHSA-vrm6-8vpv-qv8q) | high | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-v9p9-hfj2-hcw8](https://github.com/advisories/GHSA-v9p9-hfj2-hcw8) | high | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-4992-7rv2-5pvq](https://github.com/advisories/GHSA-4992-7rv2-5pvq) | moderate | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-p88m-4jfj-68fv](https://github.com/advisories/GHSA-p88m-4jfj-68fv) | moderate | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-vxpw-j846-p89q](https://github.com/advisories/GHSA-vxpw-j846-p89q) | high | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-g8m3-5g58-fq7m](https://github.com/advisories/GHSA-g8m3-5g58-fq7m) | low | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-8xcm-r25x-g524](https://github.com/advisories/GHSA-8xcm-r25x-g524) | moderate | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-m8rv-5g2x-5cg5](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5) | moderate | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-v3r7-h72x-cjcm](https://github.com/advisories/GHSA-v3r7-h72x-cjcm) | moderate | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-35p6-xmwp-9g52](https://github.com/advisories/GHSA-35p6-xmwp-9g52) | low | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) | low | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx) | high | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm) | high | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `undici` — [GHSA-9fm3-97px-rjf6](https://github.com/advisories/GHSA-9fm3-97px-rjf6) | moderate | Hardhat JSON-RPC, compiler downloads, telemetry, version checks and explorer verification. Hostile RPC/download/proxy responses can reach network parsers in developer tooling; services use Node built-in fetch, not this package. | Scoped overrides to 6.29.1; Hardhat HttpProvider round-trip tested. Removes vulnerable busboy dependency. Node >=18.17 required by Undici 6; validated on Node 24, as used in CI/Render. |
| `uuid` — [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | moderate | Hardhat analytics uses only v4(), not vulnerable v3/v5/v6 caller-supplied output buffers. | Hardhat-only override to 11.1.1; CommonJS v4/validate API tested. |
| `ws` — [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) | moderate | Only legacy ethers 5 provider ws 8.18.0 is affected. Runtime ethers 6 already resolves ws 8.21.0; Hardhat uses a separate unaffected ws 7.5.13. | Override exact ws 8.18.0 to 8.21.0; resolve from actual consumer to guard against stale lock entries. |
| `ws` — [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) | high | Only legacy ethers 5 provider ws 8.18.0 is affected. Runtime ethers 6 already resolves ws 8.21.0; Hardhat uses a separate unaffected ws 7.5.13. | Override exact ws 8.18.0 to 8.21.0; resolve from actual consumer to guard against stale lock entries. |

The final residual set is: elliptic GHSA-848j-6mx2-7j84; glob
GHSA-3g3m-2fjr-6pw4; minimatch GHSA-g3hv-75wg-m249; serialize-javascript
GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v and GHSA-m5mm-p8h7-m29v.
The tmp upgrade deliberately uses **0.2.7**, not 0.2.6, which is independently
affected by GHSA-7c78-jf6q-g5cm (not in the original 0.0.33 baseline).
Revisit these acceptances on the next Hardhat/Mocha/coverage upgrade or before
accepting untrusted patterns/options, exposing tool servers publicly, or using
production signing keys in these tools. A future newly reachable runtime import
invalidates the corresponding dev-only classification.

### Every affected package entry (including propagated parents)

All rows are **dev-only**. `via` identifies the next dependency edge; follow it
to the concrete advisory/reachability rationale above. “Resolved” means absent
from the final npm report, not necessarily removed from the dependency graph.

| Affected package | Before | After | Advisory dependency edge (`via`) |
| --- | --- | --- | --- |
| `@ethersproject/abi` | low | low | @ethersproject/hash |
| `@ethersproject/abstract-provider` | low | low | @ethersproject/transactions |
| `@ethersproject/abstract-signer` | low | low | @ethersproject/abstract-provider |
| `@ethersproject/contracts` | low | low | @ethersproject/abi, @ethersproject/abstract-provider, @ethersproject/abstract-signer, @ethersproject/transactions |
| `@ethersproject/hash` | low | low | @ethersproject/abstract-signer |
| `@ethersproject/hdnode` | low | low | @ethersproject/abstract-signer, @ethersproject/signing-key, @ethersproject/transactions, @ethersproject/wordlists |
| `@ethersproject/json-wallets` | low | low | @ethersproject/abstract-signer, @ethersproject/hdnode, @ethersproject/transactions |
| `@ethersproject/providers` | moderate | low | @ethersproject/abstract-provider, @ethersproject/abstract-signer, @ethersproject/hash, @ethersproject/transactions, ws |
| `@ethersproject/signing-key` | low | low | elliptic |
| `@ethersproject/transactions` | low | low | @ethersproject/signing-key |
| `@ethersproject/wallet` | low | low | @ethersproject/abstract-provider, @ethersproject/abstract-signer, @ethersproject/hash, @ethersproject/hdnode, @ethersproject/json-wallets, @ethersproject/signing-key, @ethersproject/transactions, @ethersproject/wordlists |
| `@ethersproject/wordlists` | low | low | @ethersproject/hash |
| `@fastify/busboy` | high | Resolved | @fastify/busboy |
| `@nomicfoundation/hardhat-chai-matchers` | high | Resolved | @nomicfoundation/hardhat-ethers, hardhat |
| `@nomicfoundation/hardhat-ethers` | high | Resolved | hardhat |
| `@nomicfoundation/hardhat-network-helpers` | high | low | ethereumjs-util, hardhat |
| `@nomicfoundation/hardhat-toolbox` | high | moderate | @nomicfoundation/hardhat-chai-matchers, @nomicfoundation/hardhat-ethers, @nomicfoundation/hardhat-network-helpers, @nomicfoundation/hardhat-verify, @typechain/ethers-v6, @typechain/hardhat, hardhat, hardhat-gas-reporter, solidity-coverage, typechain |
| `@nomicfoundation/hardhat-verify` | high | low | @ethersproject/abi, hardhat, undici |
| `@sentry/node` | low | Resolved | cookie |
| `@typechain/ethers-v6` | moderate | moderate | typechain |
| `@typechain/hardhat` | high | moderate | @typechain/ethers-v6, hardhat, typechain |
| `adm-zip` | high | Resolved | adm-zip |
| `bn.js` | moderate | Resolved | bn.js |
| `cookie` | low | Resolved | cookie |
| `diff` | low | Resolved | diff |
| `elliptic` | low | low | elliptic |
| `eth-gas-reporter` | moderate | moderate | mocha |
| `ethereum-cryptography` | low | low | secp256k1 |
| `ethereumjs-util` | low | low | ethereum-cryptography |
| `ethers` | moderate | low | @ethersproject/abi, @ethersproject/abstract-provider, @ethersproject/abstract-signer, @ethersproject/contracts, @ethersproject/hash, @ethersproject/hdnode, @ethersproject/json-wallets, @ethersproject/providers, @ethersproject/signing-key, @ethersproject/transactions, @ethersproject/wallet, @ethersproject/wordlists |
| `ethjs-unit` | moderate | Resolved | bn.js, number-to-bn |
| `glob` | moderate | moderate | glob, minimatch |
| `globby` | moderate | moderate | glob |
| `hardhat` | high | moderate | @ethersproject/abi, @sentry/node, adm-zip, solc, undici, uuid |
| `hardhat-gas-reporter` | high | moderate | eth-gas-reporter, hardhat |
| `minimatch` | moderate | moderate | minimatch |
| `mocha` | moderate | moderate | diff, glob, minimatch, serialize-javascript |
| `number-to-bn` | moderate | Resolved | bn.js |
| `recursive-readdir` | moderate | moderate | minimatch |
| `sc-istanbul` | moderate | moderate | glob |
| `secp256k1` | low | low | elliptic |
| `serialize-javascript` | high | high | serialize-javascript |
| `shelljs` | moderate | moderate | glob |
| `solc` | low | Resolved | tmp |
| `solidity-coverage` | high | moderate | globby, hardhat, mocha, recursive-readdir, sc-istanbul, shelljs, web3-utils |
| `tmp` | high | Resolved | tmp |
| `typechain` | moderate | moderate | glob |
| `undici` | high | Resolved | @fastify/busboy, undici |
| `uuid` | moderate | Resolved | uuid |
| `web3-utils` | moderate | Resolved | ethjs-unit, number-to-bn |
| `ws` | high | Resolved | ws |

### Change boundaries, reuse and validation

Only scoped dependency overrides / lock resolutions, their regression tests,
and this audit record change. No `npm audit fix --force`, blanket dependency
refresh, Hardhat 3/toolbox migration, contract source, OpenZeppelin version,
Solidity compiler version, optimizer setting, deployed address or secret changed.
Some overrides cross a dependency's declared major/0.x range **only where the
consumer APIs used here are retained**: Undici request/Pool, adm-zip extraction,
tmp fileSync/cleanup, cookie parse, uuid v4 and diff createPatch. These are not a
claim of whole-package interchangeability. Retain the scoped pins until upstream
consumers support patched releases; do not widen them to unrelated consumers.

Receiving need: reduce actual advisory exposure while retaining the existing
contract/browser/service behavior. Reused the installed Hardhat 2.29.1 consumers
at `hardhat/internal/core/providers/http`, its compiler ZIP extraction API,
`solc/smtsolver.js`, and existing npm/node:test/Playwright acceptance runners
from **59fa62b**; added `test/dependencyOverrides.test.js` rather than a new audit
framework or shared package. Search scope was this permitted checkout's source,
lockfile, existing audit/reuse notes, worktree branch metadata and current open
PR metadata; no other worktree/donor files were inspected or changed. No shared
library extraction, license change, cross-app auth/storage/deployment contract
or public Canopy inventory update is needed for npm resolution pins.

Validation on the final installed tree:

- `npm ci` reproduces the pinned graph; `npm audit --json` yields the counts above.
- `node --test test/dependencyOverrides.test.js`: 5 passing consumer tests,
  including nested resolution (the old pinned ws lock entry must not survive),
  loopback Hardhat JSON-RPC, ZIP extraction, tmp cleanup and legacy signing.
- `npm run compile -- --force`: all **17** contract artifacts' bytecode and
  deployedBytecode hashes match the baseline compilation; solc-js stays 0.8.26,
  configured compilers stay 0.8.24 / 0.8.20, OpenZeppelin stays 5.6.1.
- `npm test`: **103 Hardhat + 290 node tests**, all passing.
- `npm run validate:payroll` and workflow first-party JavaScript syntax checks pass.
- `npm run test:smoke`: PASS, dashboard desktop/mobile with zero unexpected
  console/page/network errors; no-real-funds local-chain rehearsal passes all
  14 browser actions, 41 fake-token transactions and 5 server guard checks.
  No production-chain test or live service/CDN security validation is claimed.
