# Dashboard browser smoke

```sh
npm ci
npx playwright install chromium
npm run test:smoke
```

The standalone Node runner serves this checkout on an ephemeral loopback port;
no app build, server dependency, account, secret, RPC, or IPFS service is required.
CI uses Node 24 and `playwright install --with-deps chromium`. Screenshots (including
failure screenshots) go to ignored `test-results/smoke/` and are uploaded as the
`dashboard-smoke-screenshots` Actions artifact, even on failure.

Optional ecosystem-compatible overrides:

- `PLAYWRIGHT_MODULE`: existing Playwright module specifier/path.
- `BASE_URL`: already-running static server instead of the built-in server.
- `SCREENSHOT_DIR`: screenshot destination (default `test-results/smoke`).

## Assertions and coverage

Each run uses isolated desktop (1440×1000) and mobile (390×844) contexts, UTC,
a fixed clock, reduced motion, and disabled decorative CSS animations. All actions
are real Playwright clicks with visibility, stability, and hit-testing checks;
there are no forced clicks or replaced app functions.

- Connect the EIP-1193 wallet on Base (`0x2105`); check connected account state and
  real ethers contract reads. The read-only mock account uses the app’s already-public whitelist entry solely
  to exercise the existing dashboard access gate. No real wallet/key exists;
  transactions and signing are unsupported and never sent.
- Discover all four `.dashboard-panel` surfaces from the real DOM: supplements,
  raw intake/nutrition (daily/weekly/monthly/annual), exercises, workout set list.
  Check populated content, toggle open/closed, and open/close each panel's Genie
  assistant. Submit one synthetic exercise through the real exercise form.
  Log a fractional raw-food serving through Diet → Raw food quick log; check
  canonical foods persistence, protein nutrition, Diet history and the recent-food UI.
  In the first Genie chat, assert no hosted request before permission, Cancel,
  Allow/remembered permission, a separate OpenAI consent and local-WebLLM switch.
  Hosted responses use synthetic local fixtures; Settings reset is asserted.
  Yoga Genie separately exercises consent before its prompt, Cancel and the local
  switch, with no hosted request from either declined action.
- Open/close moon/sun, water, emotion wheel, pain/body, Throat chanting, Heart vitals, weight (real Chart.js),
  measurements, supplements, diet, trends/correlation, exercise, About, Yoga Flow,
  Yoga Genie, workout timer (cancel), achievements, settings, Genie memory,
  BNUT admin, treasury, DeFi, subscription-plan admin, contributors, add contributor,
  competition admin, payroll, governance, community/data sharing, subscription,
  monthly challenge, bounty registration, nutrient goal, and manage nutrients.
- Open/close IPFS connect dialog and snapshot viewer. The snapshot viewer uses a
  prepared local storage-mode preference, **not** a connected provider or upload.
  Test first-visit education on desktop and the mobile data bottom sheet on mobile.
- Require every discovered dialog to be covered or explicitly explained. There
  are 39 covered dialogs/storage surfaces per viewport (40 across both), plus
  four panel Genie chats. Raw-food quick log is opened from the real Diet modal;
  the dynamically created hosted-consent dialog is also exercised. Desktop
  education and the mobile sheet are intentionally viewport-specific.
- Fail on console errors, uncaught page exceptions, failed requests, HTTP status
  >=400, unknown external endpoints, or unfixed modal interactions. The explicit
  commented error allowlist in the runner is **empty**. Future entries must have
  a narrow matcher and justification, and are always printed in the run output.

## Surface audit additions (#348)

See [AUDIT.md](AUDIT.md) for the source-backed surface matrix, scoped results and
bug links. The runner additionally checks chakra/aura canvas dimensions,
moon/sun text and ekadasi links, timezone selection persistence, all community
dashboard tabs, the actual Supporter DNFT menu route and purchase form presence,
and an active Yoga breathing/timer session through confirmed End. No prompt
reaches a real hosted AI service; no financial transaction or external upload is sent.

Workout cancellation has a known leaked preparation callback
([#362](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/362)). Its immediate
open/cancel check runs last with Playwright's clock paused so it cannot interrupt
unrelated dialogs. This is explicitly **not** timer lifecycle correctness coverage.
The raw-food gap #361 is addressed by the Diet quick-log route and persistence
assertions; the raw-food discovery exclusion has been removed.

`npm run test:node` also runs `test/fitnessRoundTrip.test.js`: synthetic, populated
values for every default schema key pass through the real JSON export handler,
clear/import handler and local snapshot recovery. Schema additions fail the
fixture key-set guard until covered. See the matrix for remaining acceptance gaps.

## Hermetic fixtures and boundaries

All external requests are intercepted. Chart.js, the bundled date-fns adapter,
and ethers CDN script requests are fulfilled from npm-installed copies; these
are real libraries, not app-global stubs. The HTML currently requests ethers
6.13.4; smoke uses the lockfile's compatible ethers 6.x version to satisfy current
Hardhat peer requirements. Chart/date libraries' currently unversioned CDN URLs
are similarly backed by the lockfile. No library is vendored into the app.
Google Fonts returns empty CSS (system-font fallback), external images return a
one-pixel image, GitHub lists return empty arrays, and public raw configuration
requests use this checkout's JSON. GitHub Models/OpenAI endpoints return fixed
synthetic responses and their request counts/bodies are captured for consent
assertions; no API key or health data is sent externally. Other endpoints,
including IPFS/API/model services, cannot reach the network and fail unless
explicitly fixture-mapped.
Base/Optimism RPC reads use actual ABI-encoded empty-chain values (zero balances,
no competitions/proposals, no admin role), not live state. Unexpected wallet
methods reject with EIP-1193 code 4200. Service workers are blocked.

This is a rendering/interaction smoke test, not a financial transaction,
AI-inference, provider-authentication, hardware, visual-regression, or live IPFS
integration test. Empty/unavailable backend states remain meaningful; it makes
no claim that production services or chain state are healthy.

## Bugs exposed and fixed

- `index.html`, moon close button: removed a redundant inline `hideModal` call
  that threw `ReferenceError` because module functions are not window globals;
  the existing event listener continues to close the modal normally.
- `css/styles.css`, contributor overlay/dialog: lifted them above the parent
  contributors modal so the nested close control is reachable.
- `js/genieChat.js` / `css/styles.css`, chat stacking: matched the existing Genie
  icon's layer so the fixed header cannot intercept the mobile chat close button.
- `css/styles.css`, mobile Yoga: reset the desktop flex-row `width: 0` to `100%`
  in the existing flex-column breakpoint so content and close controls render.
- `css/styles.css`, IPFS status: placed the positioned button above the title's
  full-width hitbox so the real mobile data-sheet trigger works.

## Reuse decision

Need: hermetic coverage for the receiving BigNuten dashboard, desktop and 390px.
Adapted **DecentHead** `426ccb7`, `test/browser-smoke.mjs` (module/base/screenshot
overrides, pageerror + console + failed request + HTTP error collection, screenshot
helper), and `.github/workflows/test.yml` browser job (Node 24, clean install,
Chromium install, always-uploaded screenshots). Adapted **DecentMarket** `234d1e2`,
`test/market-adoption.browser.mjs` (EIP-1193 Base wallet and routed RPC approach).
Both donors are Apache-2.0, credited to The Jolly LaMa / A Decent Agency.

Incompatibilities: BigNuten uses vanilla DOM and CDN scripts, not a vendored
DecentHead wallet component (`window.DecentHead.getWallet()` does not exist).
Its modal/panel selectors, ABIs, and storage/mobile states are app-specific.
The tiny built-in static server preserves a one-command local acceptance test
instead of requiring the donor CI's separate Python server. No speculative
shared abstraction or library-wide synchronization was introduced. Acceptance:
`npm run test:smoke` in this receiving checkout; both viewports pass with zero
console/page/network errors and an empty error allowlist.


## Recovery notice regression (#360)

Both viewport runs seed synthetic corrupt fitness data and a valid local
recovery point via `addInitScript` (once per browser session). They assert the
alert contains the recovery timestamp, click its accessible dismiss button,
verify persisted dismissal, and reload to verify the notice stays absent.
The fixture does not use real health data or contact a backup provider.

The Heart hub smoke flow runs at both viewport sizes: opens `#chakra-heart`,
logs an RHR reading, checks canonical persistence, history and trend windows,
reopens with the keyboard, checks the Breathwork placeholder and unit setting,
and confirms the automatic correlation series and hosted Genie consent/context.


## Throat chanting timer regression (#289)

Both viewport runs save a device-local custom mantra, set a six-second target,
check the progress ring halfway, pause for five seconds, resume and complete.
The saved duration excludes paused time; the target flag, notes, post-session
sensation update, session history, weekly total and throat score are asserted.
A second session verifies the target can be omitted. Close, Cancel, Escape and
backdrop dismissal each discard unfinished time, then advance twelve seconds
without a session write or timer callback. Interval instrumentation asserts
exactly one live chanting callback while running and zero after pause,
completion or dismissal.

The fixture switches from `page.clock.setFixedTime()` to `setSystemTime()` after
`pauseAt()`: elapsed `Date.now()` must advance with each `fastForward()`, not
stay frozen like the earlier date-only fixtures. Yoga's two-click confirmation
uses a browser double-click to stay inside its 3.5-second window on busy hosts.
Only synthetic sessions are used; no chanting data is sent to Genie or IPFS.
# StreakBet local-fork rehearsal

`npm run test:smoke` also runs the no-real-funds StreakBet browser rehearsal.
See [streakbet-rehearsal.md](streakbet-rehearsal.md) for the interactive
walkthrough, isolated local-fork setup and fail-closed guardrails.
