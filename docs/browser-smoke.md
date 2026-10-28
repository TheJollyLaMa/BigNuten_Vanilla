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
- Open/close moon/sun, water, emotion wheel, pain/body, weight (real Chart.js),
  measurements, supplements, diet, trends/correlation, exercise, About, Yoga Flow,
  Yoga Genie, workout timer (cancel), achievements, settings, Genie memory,
  BNUT admin, treasury, DeFi, subscription-plan admin, contributors, add contributor,
  competition admin, payroll, governance, community/data sharing, subscription,
  monthly challenge, bounty registration, nutrient goal, and manage nutrients.
- Open/close IPFS connect dialog and snapshot viewer. The snapshot viewer uses a
  prepared local storage-mode preference, **not** a connected provider or upload.
  Test first-visit education on desktop and the mobile data bottom sheet on mobile.
- Require every discovered dialog to be covered or explicitly explained. There
  are 35 reachable dialogs/storage surfaces per viewport (36 across both), plus
  four panel Genie chats. The obsolete `rawFoodModal` is explicitly excluded:
  its `dietButton` opener does not exist; the real `dietBtn` opens `dietModal`.
  No replacement product flow is invented. Desktop education and the mobile
  sheet are intentionally viewport-specific.
- Fail on console errors, uncaught page exceptions, failed requests, HTTP status
  >=400, unknown external endpoints, or unfixed modal interactions. The explicit
  commented error allowlist in the runner is **empty**. Future entries must have
  a narrow matcher and justification, and are always printed in the run output.

## Hermetic fixtures and boundaries

All external requests are intercepted. Chart.js, the bundled date-fns adapter,
and ethers CDN script requests are fulfilled from npm-installed copies; these
are real libraries, not app-global stubs. The HTML currently requests ethers
6.13.4; smoke uses the lockfile's compatible ethers 6.x version to satisfy current
Hardhat peer requirements. Chart/date libraries' currently unversioned CDN URLs
are similarly backed by the lockfile. No library is vendored into the app.
Google Fonts returns empty CSS (system-font fallback), external images return a
one-pixel image, GitHub lists return empty arrays, and public raw configuration
requests use this checkout's JSON. Other endpoints, including IPFS/API/model
services, cannot reach the network and fail unless explicitly fixture-mapped.
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
