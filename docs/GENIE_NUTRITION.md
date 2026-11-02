# Genie nutrition lookup (#390, #403)

Open **Diet** and enter the food, quantity and unit. When the nutrient fields are
blank, the card fills itself about a second later: first from the shared
community library (free, no wallet), then, for invited wallets, from Genie.
**Genie** can also be pressed manually. There is no separate review window,
consent checkbox, sign-in button or clarification question. Logging remains a
separate action.

Genie behaves like a knowledgeable person checking a few references: it weighs
the three or four most plausible interpretations, picks the most likely one for
how the food is being logged (for example, pasta measured in cups is cooked) and
states that assumption in one line. Homemade or mixed foods are estimated from
their main ingredients; trace additions such as probiotic cultures add
negligible nutrition. Genie returns a not-found answer only for input that is
not food or drink.

Auto-fill never overwrites figures you typed. It runs once per food identity
and unit (failures are not retried automatically; press Genie to retry), and it
is suppressed while any nutrient field has a value. Changing the food name
clears figures that came from the previous food, unless you typed them.

The inline **Food details / saved defaults** section supports preparation,
exact product brand/market/barcode, manual serving descriptions and local
defaults. Manual nutrient fields and **Use community food facts (no AI)** remain
available without a wallet. Barcode camera scanning and label-photo recognition
are not included.

## Estimates and sources

Cards are labeled **Genie estimate** unless every value and portion comes from
a web source the lookup actually searched, in which case they are
**source-backed**. Generic and homemade foods use one fast structured call with
no web search, so they are estimates with no source links. Packaged products
(and lookups with a product URL) may use web search; unsearched or rewritten
URLs are dropped and the card is downgraded to an estimate rather than
rejected. Estimates are good enough for practical food logging, not lab-grade
or label-verified values, allergen-safety guarantees or dietary/medical advice.

Unknown nutrients stay blank. Potassium uses the existing app's **%DV** unit
(4700 mg = 100%).

## Portions and scaling

Changing amounts or compatible units recalculates from the original unrounded
base without another lookup. Mass conversion supports grams and ounces. US
nutrition-label volume units are used: cup = 240 ml, tablespoon = 15 ml,
teaspoon = 5 ml, fluid ounce = 30 ml. Cards include household portions such as
cups, tablespoons, pieces and servings, estimated from typical density when no
source states them. When the selected unit has no portion yet (for example an
older community card without a cup weight), Genie fills just that portion
automatically for invited wallets, sending only the unit, not the amount eaten.

The serving option displays its size. **Define / adjust this portion** sets a
personal portion from a label or scale. Overrides stay local, mark the card
user-entered and are kept across reloads only when saved as a default. They
never overwrite the public reference. Old meals are unchanged.

## Provider calls and budget

Each Genie lookup is one provider call (at most two web-search tool uses for
packaged products) reserved against the unchanged shared lifetime cap and the
per-wallet rate limit. Community hits use none. There are no automatic paid
retries. Nutrition has a 90-second timeout; Health, Yoga and Community retain
their existing behavior.

Approved defaults include exact identity/preparation, brand, market and barcode
when supplied. Multiple defaults sharing a typed name do not auto-select an
arbitrary product: choose the exact saved default in the inline details. Saved
defaults prefill without another model call, and logging/one-off edits do not
replace them. Edited figures save as user-entered defaults only when explicitly
requested.

## Shared public food library

The existing service disk stores validated Genie food cards, both source-backed
and labeled estimates, keyed by food name/type, preparation, brand, market and
barcode (case/whitespace normalized). Cooked and dry foods, brands and markets
remain distinct. The supplied identity fields always replace whatever the model
returns, so a lookup cannot rewrite a food or product identity.

Only the food identity, serving/portion equivalents, nutrients, ingredients,
quality label, assumption note, source links and retrieval date are stored;
there is no wallet attribution, meal quantity/time, health record or
conversation. User-entered cards, personal edits/defaults and pasted-label
requests are not published. Shared data is public, not encrypted personal
backup. Previously shared cards remain shared when someone deletes local health
data.

`POST /foods` reads exact matches from approved origins without a wallet, model
call or enabled provider key. `POST /lookup` also rechecks the library before
reserving a provider call, including after the global cap is exhausted. A new
result that adds a requested missing portion may replace the existing reference,
except that an estimate never replaces a source-backed card. Failed or
user-entered results never overwrite a shared reference. Concurrent identical
misses return an explicit busy message rather than paying twice. There is no
arbitrary browser card-upload endpoint. This is a food reference library, not
health-profile or cross-browser log synchronization.

## Local records and privacy

Defaults are part of `fitnessTrackerData.nutritionDefaults`, included in
intentional JSON/encrypted snapshot backups and local recovery. JSON downloads
are plaintext, browser storage is not encrypted, and no cross-browser sync is
added. Imports retain an existing local default for the same exact identity;
replacement is explicit. Health-data deletion clears defaults with the primary
profile. The legacy `dietNutrCache` remains for manual entries, but cannot
overwrite approved defaults.

Lookup sends only the supplied food/product fields (and a requested portion
unit) to the service and OpenAI. It does not include health logs, symptoms, chat history, Genie
memory or DBusker context. Do not paste personal notes into the product label
field. Food/amount changes, manual editing, wallet changes and closing Diet
cancel pending results; cancellation cannot recall transmitted provider data.
Service URL is browser-local configuration,
not a secret. No OpenAI key or bearer session token is persisted in the browser
by the shared Genie client.

## Shared Genie access (#394)

The invitation list gates **Genie assistants**, not health tracking. Weight,
Measurements, Supplements, Diet and Exercise navigation remains available
without a wallet or invitation. Existing separate admin/contract permissions
are unchanged. Manual nutrition review, approved defaults and browser-local
memory/privacy controls remain available when Genie access is locked.

**Settings → Check assistant access** sends only wallet address and chain ID. The server
checks invitation eligibility. The default **signed** mode verifies a
purpose/origin/nonce-bound wallet signature. The steward-approved
**address-only pilot** mode skips signatures across all hosted Genies: anyone
can claim an invited address, so it is a convenience gate, not verified private
access control. It does not expose another user's browser-local health records,
but it can permit impersonation and consumption of the shared allowance.
Do not treat per-address usage in that mode as verified ownership.
One browser's assistants share a memory-only 15-minute session, never
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
zero vendor retention**. BigNuten stores no prompts or conversations server-side;
public Genie food cards (source-backed or labeled estimates) are the explicit exception to local-only food facts.

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
| `BIGNUTEN_GENIE_ACCESS_MODE` | `signed` (default) or explicitly approved `address-only` pilot; the latter does not prove wallet ownership |
| `BIGNUTEN_NUTRITION_MAX_CALLS` | Shared lifetime call cap for nutrition and all hosted Genies, default 100; increasing it requires steward approval |
| `BIGNUTEN_NUTRITION_STATE_FILE` | `/var/data/nutrition-state.sqlite` on the private persistent disk |
| `NODE_VERSION` | `24.3.0` or compatible Node 24 with `node:sqlite` |

The Render disk requires a compatible paid service plan; do not replace it with
ephemeral storage and claim durable budgets. Service restart invalidates
sessions/challenges, but retains aggregate per-wallet call/token totals. No
prompts or conversation logs are stored; the separate public `foods` table stores
only Genie food cards (source-backed or labeled estimates) without wallet attribution. Provider-reported token usage is
recorded before card validation, including rejected/incomplete responses when
usage is available; error responses update the nutrition usage display.
Unavailable usage is not reconstructed or presented as a complete billing total.
Failed/canceled attempts count
toward the same call cap; six requests/minute/wallet, three active globally
and one active per session apply across both model routes. Reported token totals
include failed nutrition responses when usage is available; web-search charges
are separate (at most one tool call per lookup). Monitor OpenAI project budgets/alerts as well;
they may not enforce a hard spending cap.

The published app is preconfigured for the separate Render service at
`https://bignuten-nutrition.onrender.com`; the storage relay remains unchanged.
For another deployment, use **Diet → Food details / saved defaults → Nutrition service setup** to save its
actual HTTPS service URL. This applies to **all Genies**, not just nutrition.
A saved browser override takes
precedence over `window.BIGNUTEN_NUTRITION_SERVICE_URL`. This endpoint
configuration does not itself establish that live AI search is enabled or
verified.

Auth adapts DBusker's invited-wallet, purpose/origin/nonce-bound sign-in and
hashed short-lived sessions using BigNuten's existing ethers v6 primitives.
Unlike DBusker's SIWE parser dependency, this service verifies an exact
server-issued sign-in message in signed mode. Address-only mode explicitly
trusts the claimed address, with the impersonation limitations described above.
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

For the staged lookup repair, adapt the per-attempt reserve/finish pattern in
DBusker `agent-service/server.mjs` at the same `6be300e` commit, retaining the
existing BigNuten SQLite ledger and food-only boundary. #403 later replaced the
two-stage search/extraction adapter with a single best-estimate call: the inspected donor handles community retrieval,
not a tested nutrition integration. The donor checkout's unrelated unfinished
radio/promotion work is not part of this change.
