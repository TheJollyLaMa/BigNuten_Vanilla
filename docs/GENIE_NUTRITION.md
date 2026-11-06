# Genie nutrition lookup (#390, #403, #423, #426)

Open **Diet** and enter the food, quantity and unit. When the nutrient fields are
blank, the card fills itself about a second later: first from the shared
community library (free, no wallet), then, for invited wallets, from Genie.
**Genie** explicitly rechecks a food, bypassing a previously wrong cached match.
There is no separate review window,
consent checkbox, sign-in button or clarification question. Logging remains a
separate action.

Genie behaves like a knowledgeable person checking a few references: it weighs
the three or four most plausible interpretations, picks the most likely one for
how the food is being logged (for example, pasta measured in cups is cooked) and
states that assumption in one line. Homemade or mixed foods are estimated from
their main ingredients. Added minerals/vitamins, fortification and iodized salt
must not be assumed nutritionally negligible. Genie returns a not-found answer only for input that is
not food or drink.

Auto-fill never overwrites figures you typed. It runs once per food identity
and unit (failures are not retried automatically; press Genie to retry), and it
is suppressed while any nutrient field has a value. Changing the food name
clears figures that came from the previous food, unless you typed them.

The form starts with food, amount, unit and time, followed by **Log Entry**,
the nutrition card/Genie and expandable micronutrients. The daily editable log
is at the bottom. The separate raw-food quick log, all-time list, calorie
totals, defaults/portion-management controls and token counters are removed
from this view; stored history and defaults are not deleted.

An optional **Product label** disclosure accepts label facts or a product URL
for an explicit Genie recheck. User-provided label facts take precedence over
generic values. Label/URL requests are not published in the shared food cache.
Manual nutrient entry and automatic shared-food reuse remain wallet-free.
Barcode camera scanning and label-photo recognition are not included.

### Correcting a meal

Each entry in today's log has **Edit** and **Delete**. Editing fills the
same form and replaces only that entry on **Save changes**, preserving its
original date. **Cancel edit** leaves the original unchanged. Removal requires
confirmation and recalculates recent foods and nutrient totals. A changed or
stale record is rejected rather than editing/deleting another meal by index.
Saving while Genie is pending or the portion is undefined is blocked. Saving
without nutrition requires confirmation; entries can still be intentionally
logged without figures.

Both the dashboard's recent-food entries and the daily Diet log show adjacent
**Edit** and **Delete** buttons before the nutrient contents. Dashboard nutrition
details expand in place and remain open while reading; they are not a narrow
hover-only popup. Edit opens the same prefilled Diet form, scrolls it into view,
and supports a new Genie request or manual name/value changes. Clicking a food
row no longer silently enters the old repeat-intake prompt. Daily entries grow
with their contents rather than shrinking inside a fixed-height nested list.
Dashboard actions address the exact selected entry, including earlier entries
within the seven selected-timezone calendar days, not the latest meal with the
same name. Stored historical meals outside that view remain unchanged.

Amount is a count of the selected unit: **1 serving (65 g)** and **65 g** are
equivalent, while **65 servings (65 g)** means **4,225 g**. Large serving counts
show a warning and require confirmation. They are never silently reinterpreted.
The #426 screenshot reproduced exactly from the public generic-oyster cache:
199 kcal/100 g × 65 g/serving × 65 servings = 8,407.75 kcal (displayed 8,408).
That was also a generic estimate, not a verified Wegmans product label. The
user-reported 160 kcal/10 g protein per 65 g must not be presented as a verified
micronutrient composition. Private Brave entries require correction in that
browser; deployment does not rewrite personal records.

## Estimates and sources

Cards are labeled **Genie estimate** unless every value and portion comes from
a web source the lookup actually searched, in which case they are
**source-backed**. Every provider request now permits web search, including
brand names typed into the generic food field, so exact product verification
is not gated on a hidden packaged-food selector. Generic/homemade results may
still be estimates. Unsearched or rewritten
URLs are dropped and the card is downgraded to an estimate rather than
rejected. Estimates are good enough for practical food logging, not lab-grade
or label-verified values, allergen-safety guarantees or dietary/medical advice.

Unknown nutrients stay blank. Potassium uses the existing app's **%DV** unit
(4700 mg = 100%).

## Vitamins, minerals and coverage

The main food card has an expandable **Vitamins, minerals and additional
nutrients** section. A single registry in `js/nutritionDefaults.mjs` defines 37
fields shared by manual entry, Genie output, food-card/default validation,
portion scaling, meal history, food popovers and Daily Value management.
It includes iodine, potassium, copper, calcium, magnesium, iron, zinc, selenium,
phosphorus, chloride, manganese, chromium, molybdenum, choline and the main
vitamins, as well as macros, added sugar, saturated fat and cholesterol.

Amounts apply to the selected food quantity. Iodine/selenium/B12 and similar
fields use **mcg**, copper/calcium/magnesium use **mg**, vitamin A uses **mcg
RAE**, folate **mcg DFE**, niacin **mg NE**, and vitamin E **mg
alpha-tocopherol**. These equivalents must not be guessed from incompatible
units. For compatibility, potassium remains stored as %DV and vitamin D as IU:
**1% potassium DV = 47 mg**, **40 IU vitamin D = 1 mcg**. Old food logs are
not rewritten. Small micronutrient amounts are not rounded to whole numbers
or one decimal in the form.

Reference goals use the current
[FDA label Daily Values](https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels):
potassium 4700 mg, calcium 1300 mg, magnesium 420 mg, copper 0.9 mg,
iodine 150 mcg, and vitamin D 20 mcg (800 IU). Calories retain the 2000 kcal
label reference. Total sugar has **no FDA DV**; added sugar has a separate
50 g reference. Existing custom goals and visible-row preferences are
preserved. Label references are not personal prescriptions or safe upper
limits for every person.

Daily Value totals report **N of M food entries have data** for each nutrient.
No known value displays **Unknown**, not zero; a genuine recorded numeric zero
is retained. A known subtotal with missing entries is explicitly **partial**,
not a complete intake or a deficiency finding. Periods use the selected
timezone's calendar days and exclude future days. Supplement dosage is not
automatically treated as nutrient content.

New Genie requests include the complete nutrient schema. Missing label fields
and unavailable iodine/trace-mineral composition must remain null; values
must not be invented from macros or unspecified fortification. Whole-food
Genie values remain estimates, not independently measured facts. Sources
verify the returned URL provenance, not laboratory accuracy of every number.
Review against a matching label or reliable composition reference when possible.

When an older incomplete community card is used, an invited Genie user
automatically requests one micronutrient upgrade. Existing numeric figures
(including zero) and base quantity are retained; only missing values are added,
scaled into that base. Combined facts are conservatively labeled as estimates.
The checked schema version is saved even if some nutrients remain unknown.
The service durably records the attempt before provider work, so failure,
unavailable data or restart does not trigger repeated paid micronutrient calls.
Failures are shown explicitly; existing facts remain usable. A failed check
requires steward intervention to allow another attempt. The check consumes
the existing shared call budget and never bypasses invitation or cap controls.

Local defaults are also checked when selected/used and retain their figures;
successful merged upgrades are saved locally. Personal defaults/edits are
never sent for enrichment: only the existing food identity/portion-unit request
is used. Non-invited users can reuse shared upgrades but cannot trigger paid
work. This is on-use upgrading, not a bulk refresh of the food library.
Historical meals are not rewritten. Manual entry remains available.
Legacy browser-cache entries are upgraded and saved in place when their
original base amount/unit and nutrient values form a valid card. Entries with
no original serving or invalid units cannot be safely scaled: the UI explicitly
asks for review rather than guessing their base or overwriting their figures.
Active manual figure edits suppress automatic lookups.

New meal saves retain card-level quality, source links, retrieval date and
notes in `nutritionSource`. Editing figures changes the saved quality to
user-entered; older meals without this metadata say provenance was not
recorded. Metadata survives the same JSON/encrypted snapshot path as the meal.

### Reuse and validation

For #423, adapt the receiving app's existing `nutritionDefaults.mjs`,
`nutritionLookupUI.mjs`, `dietIntake.js`, `fitnessSchema.js` and
`services/nutritionModel.mjs` at main `4b288cd`. These already share food-card
validation, portion conversion, recovery-aware saving and provider contracts.
The same registry now supplies the food form and daily reference table instead
of maintaining divergent nutrient lists. Canopy's curated inventory was checked
for nutrition leads; this was scoped research, not a whole-library scan.
No new nutrition provider, framework, dependency or telemetry is introduced.

Regression coverage includes registry shape/units, exact copper/B12/iodine
scaling, old potassium/vitamin D units, legacy key spellings without double
counting, null/zero/partial totals, timezone periods, source metadata and
snapshot round trips, plus the complete provider output schema. The existing
desktop/mobile smoke runner saves a synthetic micronutrient meal through the
real form, checks source history and visible daily coverage, and distinguishes
unavailable selenium from a known zinc zero. It also upgrades old shared facts,
local defaults and the legacy browser cache, preserving original figures and
verifying reuse without another paid check. Service tests cover durable
attempts across restart, unavailable data, provider failure, incompatible
base units and the existing shared call cap. Synthetic references are testing
fixtures, not independently verified composition data for real foods.

## Portions and scaling

Changing amounts or compatible units recalculates from the original unrounded
base without another lookup. Mass conversion supports grams and ounces. US
nutrition-label volume units are used: cup = 240 ml, tablespoon = 15 ml,
teaspoon = 5 ml, fluid ounce = 30 ml. Cards include household portions such as
cups, tablespoons, pieces and servings, estimated from typical density when no
source states them. When the selected unit has no portion yet (for example an
older community card without a cup weight), Genie fills just that portion
automatically for invited wallets, sending only the unit, not the amount eaten.

The serving option displays its size. For an incorrect portion, provide its
label in **Product label** and press **Genie**, or use a known gram quantity.
Undefined conversions block logging until corrected. Old meals are unchanged.

## Provider calls and budget

Each Genie lookup is one provider call (at most two optional web-search tool uses)
reserved against the unchanged shared lifetime cap and the
per-wallet rate limit. Community hits use none. There are no automatic paid
retries. Nutrition has a 90-second timeout; Health, Yoga and Community retain
their existing behavior.

Existing local defaults still prefill without a model call and are enriched
on use when incomplete. Ambiguous names do not choose an arbitrary default.
The form no longer exposes default creation/deletion. Explicit Genie refresh
updates the matching cached/default facts, unlike automatic enrichment, which
retains existing figures. One-off manual meal edits do not overwrite approved
defaults. Budget accounting remains server-side; token totals are not displayed
in the food-entry form.

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

An explicit `POST /lookup` with `refresh: true` bypasses reuse and reserves a
normal paid call. A valid provider result may replace even an old source-backed
reference, with the new result's actual quality, so bad matches can be corrected
without inventing a new food name. Failure leaves existing facts intact.
Pasted-label and product-URL responses stay local rather than replacing public
references. Refresh still honors invitation, consent, rate, concurrency and
budget checks; it is never sent by automatic enrichment.

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
