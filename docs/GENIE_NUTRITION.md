# Genie nutrition lookup (#390)

Open **Diet**, enter the food, quantity and unit, and choose **Genie** next to
nutrition. Whole foods need a preparation when relevant; packaged foods need
the brand, exact variant and country/market. Optional product URLs, barcodes and
pasted labels help distinguish products. Barcode camera scanning and label-photo
recognition are not included.

The nutrition modal supports manual label entry without a model or wallet.
For search, connect an invited wallet using the site header, read/check the
food-only consent notice and choose **Sign in with invited wallet**. Signing
authorizes a 15-minute nutrition session only; it is not a transaction. Search
requires a separately deployed BigNuten nutrition service. Existing Genie chat
keys/settings and DBusker sessions are not used by this service.

Review/edit the resulting card, base amount/unit, source-defined serving,
ingredients and source links. Check the review box, then choose **Use for this
entry only** or **Save as default per serving & use**. The original food form
returns with scaled figures, keeping your quantity and time. Logging remains a
separate action. Cancel does not change the original form or defaults.

Unknown nutrients stay blank. Potassium uses the existing app's **%DV** unit,
not mg; the lookup only fills an explicit source-label %DV. Mass conversion
supports grams and ounces; milliliters remain volume. No mass/volume, cup/piece
or differently defined serving conversion is guessed. Choose the same base
unit or explicitly enter a matching serving. Source-backed means traceable,
not independently verified. A search result is not proof a label is current,
an allergen-safety guarantee or dietary/medical advice.

Approved defaults include exact identity/preparation, brand, market and barcode
when supplied. Multiple defaults sharing a typed name do not auto-select an
arbitrary product: reopen Genie and choose the exact saved default. Saved
defaults prefill without another model call, and logging/one-off edits do not
replace them. Old logged meals are unchanged when a default is replaced.
Editing card values labels them user-entered and requires fresh review.

## Local records and privacy

Defaults are part of `fitnessTrackerData.nutritionDefaults`, included in
intentional JSON/encrypted snapshot backups and local recovery. JSON downloads
are plaintext, browser storage is not encrypted, and no cross-browser sync is
added. Imports retain an existing local default for the same exact identity;
replacement is explicit. Health-data deletion clears defaults with the primary
profile. The legacy `dietNutrCache` remains for manual entries, but cannot
overwrite approved defaults.

Lookup sends only the supplied food/product fields to the service and OpenAI
web search. It does not include health logs, symptoms, chat history, Genie
memory or DBusker context. Do not paste personal notes into the product label
field. Revoking consent aborts pending work and clears the in-memory session;
it cannot recall already transmitted data. Wallet changes and closing the
modal cancel pending results. Service URL is browser-local configuration,
not a secret. No OpenAI key or bearer session token is persisted in the browser
by nutrition lookup.

## Separate Render service

The additional service in [render.yaml](../render.yaml) is intentionally
disabled until configured. Use a **separate OpenAI project/key** for BigNuten
to track usage independently from DBusker. Never put that key in client files,
GitHub, chat or **Settings → Genie AI** for this feature.

In Render's **bignuten-nutrition → Environment**, configure:

| Variable | Value |
| --- | --- |
| `OPENAI_API_KEY` | Server-side OpenAI project key with Responses/web-search access |
| `BIGNUTEN_NUTRITION_WALLETS` | Comma-separated invited wallet addresses |
| `BIGNUTEN_NUTRITION_ALLOWED_ORIGINS` | Exact app origins, e.g. `https://thejollylama.github.io` (no paths); add only approved local origins |
| `BIGNUTEN_NUTRITION_ENABLED` | `true` only after configuration and deployment review |
| `BIGNUTEN_NUTRITION_MODEL` | Default `gpt-4.1`; verify current Responses + web-search + structured-output support for your project |
| `BIGNUTEN_NUTRITION_MAX_CALLS` | Lifetime service call cap, default 100; increasing it requires steward approval |
| `BIGNUTEN_NUTRITION_STATE_FILE` | `/var/data/nutrition-state.sqlite` on the private persistent disk |
| `NODE_VERSION` | `24.3.0` or compatible Node 24 with `node:sqlite` |

The Render disk requires a compatible paid service plan; do not replace it with
ephemeral storage and claim durable budgets. Service restart invalidates
sessions/challenges, but retains aggregate per-wallet call/token totals. No
food text or conversation logs are stored. Failed/canceled attempts count
toward the call cap; reported token totals cover successful responses with
available usage only, and web-search charges are separate (at most three tool
calls are requested per lookup). Monitor OpenAI project budgets/alerts as well;
they may not enforce a hard spending cap.

In **Genie nutrition review → Nutrition service setup**, paste Render's actual
HTTPS service URL and save it. Alternatively a deployment may explicitly set
`window.BIGNUTEN_NUTRITION_SERVICE_URL` before opening the modal. Do not assume
a guessed Render hostname is deployed.

Auth adapts DBusker's invited-wallet, purpose/origin/nonce-bound sign-in and
hashed short-lived sessions using BigNuten's existing ethers v6 primitives.
Unlike DBusker's SIWE parser dependency, this service verifies an exact
server-issued sign-in message; no client-supplied identity fields are trusted.
The service enforces origin, invitation, rate/concurrency limits, single-use
nonces and a durable call budget. One Render instance is supported: multiple
replicas need a shared auth/budget design first.

## Verification and release

Use Node 24.3+ for the full test suite and nutrition service (CI runs Node 24).
The static browser app still needs no Node runtime. Run
`node --test test/nutrition*.test.js test/fitnessRoundTrip.test.js` and
`npm run test:smoke`. Fixtures use synthetic source/label data and mocked
providers, not live AI. Verify `/health` returns `enabled: true`, sign in
with an invited wallet and review one whole-food and one exact-product lookup
on the deployed app before calling search live. Never use the private pilot
browser profile for validation.

Reuse decision: adapt BigNuten's cache/scaling, schema, recovery and full/quick
logging at `7bac130`; adapt DBusker `6be300e` server/model patterns (Apache-2.0).
Context, auth purpose, usage database and deployment are separate. No donor
health-sync or search integration was assumed. Canopy was consulted as a lead;
actual DBusker source/worktree was checked. Test results and deployed evidence
belong in the release PR; keep personal findings out of public inventories.
