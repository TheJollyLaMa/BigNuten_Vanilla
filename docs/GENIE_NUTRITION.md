# Genie nutrition lookup (#390)

Open **Diet**, enter the food, quantity and unit, and choose **Nutrition label**
(**Genie** for an invited wallet) next to nutrition. Whole foods need a preparation when relevant; packaged foods need
the brand, exact variant and country/market. Optional product URLs, barcodes and
pasted labels help distinguish products. Barcode camera scanning and label-photo
recognition are not included.

The nutrition modal supports manual label entry without a model or wallet.
For search, connect an invited wallet using the site header, read/check the
food-only consent notice and choose **Sign in with invited wallet**. Signing
authorizes a 15-minute BigNuten Genie session only; it is not a transaction,
payment or token approval. Search requires the separately deployed BigNuten
Genie service, which also handles Health, Yoga and Community assistants.
DBusker credentials, sessions and conversations are not reused.

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
arbitrary product: reopen the nutrition review and choose the exact saved default. Saved
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
field. Unchecking food consent aborts pending lookup work;
it cannot recall already transmitted data. Wallet changes and closing the
modal cancel pending results. Service URL is browser-local configuration,
not a secret. No OpenAI key or bearer session token is persisted in the browser
by the shared Genie client.

## Shared Genie access (#394)

The invitation list gates **Genie assistants**, not health tracking. Weight,
Measurements, Supplements, Diet and Exercise navigation remains available
without a wallet or invitation. Existing separate admin/contract permissions
are unchanged. Manual nutrition review, approved defaults and browser-local
memory/privacy controls remain available when Genie access is locked.

**Settings → Check assistant access** sends only wallet address and chain ID. The server
verifies invitation eligibility and later verifies a purpose/origin/nonce-bound
wallet signature. One browser's assistants share a memory-only session, never
an OpenAI key. Sign out applies to all Genies. Wallet/service changes, expiry
and server rejection invalidate access; returning focus rechecks an active
session. Access failures are shown explicitly rather than falling back to an
ungated hosted provider.

Health, Yoga, Community and nutrition use **the same BigNuten server-held key
and original global call cap**, with separate contexts:

- Health includes only enabled log sections, selected time ranges, relevant
  browser-local summaries/pinned insights and the user's message.
- Yoga includes the current pose/flow, recent yoga sessions when present,
  its own recent conversation and the user's message.
- Community excludes Health logs/history/memory by default; it includes the
  shared guide and user's message. The separate model-free issue helper and
  local Quest Mode remain available without invited AI access.
- Nutrition includes food/product fields only and requires food-only consent.

Health, Yoga and Community have distinct remembered hosted-consent scopes.
Their notices list actual included categories before transmission. Resetting
hosted permissions or changing wallets requires permission again. Automatic
hosted Health summaries require existing Health permission; otherwise summaries
stay local. OpenAI Responses use `store: false`; this is **not a guarantee of
zero vendor retention**. BigNuten stores no prompts or conversations server-side.

The default chat backend is **Private BigNuten Genie**. Direct browser OpenAI
and GitHub Models calls/key-entry controls are retired; old stored keys are not
read or silently deleted. Settings offers explicit legacy-key removal.
Invited users may select local WebLLM, which downloads model files but processes
prompts locally. Yoga explains its hosted-backend requirement instead of
pretending to support local Yoga inference.

An invitation/signature does **not** select or isolate health profiles, sync
browsers, or enforce one active writer. Records remain browser/profile/origin
local; separate people must use separate browser profiles. Profile continuity
and writer coordination are still tracked in #391.

## Separate Render service

The additional service in [render.yaml](../render.yaml) is intentionally
disabled until configured. Use a **separate OpenAI project/key** for BigNuten
to track usage independently from DBusker. All BigNuten hosted Genies share
this key. Never put it in client files, GitHub, chat or browser settings.

In Render's **bignuten-nutrition → Environment**, configure:

| Variable | Value |
| --- | --- |
| `OPENAI_API_KEY` | Server-side OpenAI project key with Responses/web-search access |
| `BIGNUTEN_NUTRITION_WALLETS` | Comma-separated invited wallet addresses |
| `BIGNUTEN_NUTRITION_ALLOWED_ORIGINS` | Exact app origins, e.g. `https://thejollylama.github.io` (no paths); add only approved local origins |
| `BIGNUTEN_NUTRITION_ENABLED` | `true` only after configuration and deployment review |
| `BIGNUTEN_NUTRITION_MODEL` | Default `gpt-4.1`; verify current Responses + web-search + structured-output support for your project |
| `BIGNUTEN_NUTRITION_MAX_CALLS` | Shared lifetime call cap for nutrition and all hosted Genies, default 100; increasing it requires steward approval |
| `BIGNUTEN_NUTRITION_STATE_FILE` | `/var/data/nutrition-state.sqlite` on the private persistent disk |
| `NODE_VERSION` | `24.3.0` or compatible Node 24 with `node:sqlite` |

The Render disk requires a compatible paid service plan; do not replace it with
ephemeral storage and claim durable budgets. Service restart invalidates
sessions/challenges, but retains aggregate per-wallet call/token totals. No
food text or conversation logs are stored. Failed/canceled attempts count
toward the same call cap; six requests/minute/wallet, three active globally
and one active per session apply across both model routes. Reported token totals cover successful responses with
available usage only, and web-search charges are separate (at most three tool
calls are requested per lookup). Monitor OpenAI project budgets/alerts as well;
they may not enforce a hard spending cap.

The published app is preconfigured for the separate Render service at
`https://bignuten-nutrition.onrender.com`; the storage relay remains unchanged.
For another deployment, use **Nutrition review → Nutrition service setup** to save its
actual HTTPS service URL. This applies to **all Genies**, not just nutrition.
A saved browser override takes
precedence over `window.BIGNUTEN_NUTRITION_SERVICE_URL`. This endpoint
configuration does not itself establish that live AI search is enabled or
verified.

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
`node --test test/nutrition*.test.js test/genie*.test.js test/fitnessRoundTrip.test.js` and
`npm run test:smoke`. Fixtures use synthetic source/label data and mocked
providers, not live AI. Verify `/health` returns `enabled: true`, sign in
with an invited wallet and review one whole-food and one exact-product lookup
on the deployed app before calling search live. Verify one consented Health
and Yoga request against the deployed `/assistant` route before calling the
broader hosted integration live; guest manual tracking and uninvited denial
also need verification. Deploy backend capability before relying on the
updated frontend. Never use the private pilot
browser profile for validation.

Reuse decision: adapt BigNuten's cache/scaling, schema, recovery and full/quick
logging at `7bac130`; adapt DBusker server/model patterns at
`6be300e913c111cd6896c23cee32e1c399a7a1a8` (Apache-2.0). For #394, reuse
BigNuten's existing `geniePrivacy.js`, `genieChat.js`, `yoga.js` and nutrition
auth/budget at `8842bb9`; extract only the browser session client needed by
these established consumers. DBusker context, auth purpose, usage database
and deployment remain separate. No donor
health-sync or search integration was assumed. Canopy was consulted as a lead;
actual DBusker source/worktree was checked. Test results and deployed evidence
belong in the release PR; keep personal findings out of public inventories.
