# Gut-health tracker

The Gut button opens an optional, browser-local tracker for manual hydrogen and
methane breath readings, test/challenge sessions, and digestive symptom
check-ins. Symptoms can be recorded without owning a breath device or creating a
test session. This is a logging and reflection aid, **not diagnosis, treatment
advice, or a SIBO/IMO test**.

## Manual entry and comparisons

- No FoodMarble AIRE 2 or other-device API/Bluetooth integration is implemented
  or implied. Enter a source/device name and the exact scale printed by that
  source yourself.
- A reading may contain hydrogen, methane, or both. Missing gases stay missing;
  the tracker does not invent zeroes, convert vendor scores to ppm, or combine
  differently labeled scales. The data distinguishes `ppm` from an exact, user-reported scale label.
- A test session can link an already-existing diet entry as optional context,
  including its recorded fiber value when present. This is only a reference:
  linking a test session never creates or changes a meal log. FODMAP content is not
  inferred.
- Comparisons show the earliest recorded baseline and the highest later reading
  on that same scale for each gas. Session trends require same-scale entries on
  separate dates. These are descriptive calculations, not validated clinical
  thresholds or treatment targets. A lower reading is not proof of recovery,
  and an association between meals, symptoms, and readings does not establish
  cause.
- Session and symptom entries can be edited or deleted; deleting a session
  keeps its symptoms but removes their session link. Entries are included in the
  existing fitness-data JSON export/import and snapshot recovery/merge paths.

## Privacy and safety

Records use the existing `fitnessTrackerData` browser profile. Browser storage
is **not encrypted** and anyone with access to the browser profile may be able
to inspect it. JSON export is explicit and user initiated through the existing
data controls; exports are plaintext. This tracker does not send its values to
hosted Genie prompts, community sharing, issue drafts, telemetry, or public
records. It does not recommend restrictive diets, supplements, antibiotics,
antimicrobials, or test preparation. Consult a qualified clinician about
symptoms, suspected SIBO/IMO, test selection, or care. Do not delay professional
care based on a consumer device score or this app.

Use synthetic records only in tests, screenshots, and public examples. FoodMarble
integration options, licensing, data export, and any developer API were not
verified for this implementation; manual entry remains the only supported
source workflow.

## Personal smoothie recipes and observation periods (#435)

Open **Gut → Start Gut Vitality Yogurt Smoothie recipe**. The starter includes
the supplied yogurt, inulin, hemp protein, ghee, nutritional yeast, mushroom
blend and liquid choices. Ranges, optional products, unspecified inulin/liquid
amounts and the supplied approximate nutrition remain editable notes, not
verified facts. No strain purity, viable CFU count, nutrient fortification or
fermentation safety is inferred.

1. Confirm the name, ingredients, quantities and **batch yield in servings**.
   Remove ingredients not used. Blank quantities and nutrients stay unknown.
   Copy known food portions from the existing log or enter facts for the exact
   amount in each row. Copying is not another intake.
2. Use **Sum ingredient facts** for calculated batch/per-serving nutrition.
   Missing ingredient values make a nutrient a partial known subtotal, not
   zero. Alternatively choose **My approximate card for the whole batch** and
   enter the values you have explicitly chosen to track as estimates. The
   starter's 380–420 calorie range is not silently replaced by 400.
   **Copy supplied smoothie point estimates** explicitly confirms copying the
   supplied point values and converts the specified %DV into existing units
   using generic FDA reference values, scaled to your batch yield. Calories,
   lower-bound vitamin claims, unspecified electrolytes and unsupported fatty
   acid fields remain blank. This action does not verify the estimates.
3. **Save recipe** does not mean eaten. **Review & log portion** opens the
   existing Food intake card at one serving; change to half/two servings,
   review the values and explicitly press **Log Entry**. A saved recipe is
   also searchable by its exact name in Food intake before its first log.
   Gram/volume conversions are not invented for recipe servings.
4. Correct eaten portions with the existing Food intake/dashboard Edit/Delete
   buttons. Correct or delete templates in Gut. Eaten records hold independent
   recipe snapshots: later recipe edits/deletion never rewrite old meals.

Recipe sums use the existing 37-nutrient registry and scaling, including
potassium's stored %DV representation. Partial coverage is retained in
`nutritionSource.incompleteNutrients`, and daily totals label partial known
amounts. Approximate cards are estimates, not measured food analyses. The
template can contain notes for nutrients outside the registry, but those are
not fabricated as tracked omega/mono/polyunsaturated-fat fields.

### Observation timeline

Name a period, select an optional recipe and choose explicit start/end days;
**Set 7 days** and **Set 14 days** set inclusive date ranges, not recommended
treatment schedules. Edit the end date to end a period. Repeat prepares a new
period with today's dates and the old duration, without copying fasting or
intake or saving automatically.

Optional **actual** fasting start/end use the device timezone at input; saved
times are UTC and displayed in the selected health-log timezone. Reversed or
future fasting timestamps are rejected. An omitted end stays incomplete and
does not become a completed duration. Elapsed hours use timestamp differences,
including across DST. No food logs is not evidence that fasting occurred.

Each day uses the same selected timezone/day-start helper as food logs. It
shows recorded recipe servings, other meals, symptoms/stool forms and breath
readings with their original scales/sources. Existing baseline/follow-up
comparisons remain in the tracker below; the timeline does not merge scales
or generate causal/treatment-success scores. After deleting a recipe, its
period retains the historical recipe ID and eaten snapshots; deleting a
period leaves all meals, symptoms and readings intact. Editing/deleting those
canonical records updates the timeline when reopened. Unlogged days remain
explicitly missing observations, including future days, not failures.

### Storage, recovery and reuse

`mealRecipes` is a profile-level recipe list, a reusable foundation for #430
rather than a yogurt-specific recipe store. `gutHealth.observations` is
separate from individual breath-test sessions. Legacy profiles gain empty
recipe defaults; old breath/symptom records retain their meaning. JSON export,
snapshot normalization, recovery and merge preserve recipes, observation
periods and intake snapshots. Local records win conflicts on identical IDs;
distinct IDs are retained. Profile switches/restores clear open editor state.
Nothing automatically logs a real user's meal or publishes their recipe.

Adapted first-party `normalizeGutHealth`, `calculateGutProgress`,
`persistDietIntake`, `scaleNutrition`, `summarizeNutrients`, fitness schema and
recovery flows from BigNuten `1463d12`. Scoped inspection of current open
issues/worktrees and Canopy inventory found no compatible recipe/observation
implementation; this is not a whole-library claim. No new provider, license,
wallet/auth contract or service deployment is introduced. Existing unrelated
worktree changes were not used.

Run `node --test test/gutRecipes.test.js test/gutHealth.test.js
test/nutritionDefaults.test.js test/micronutrients.test.js
test/fitnessRoundTrip.test.js` and `node test/browser-smoke.mjs`. The smoke
uses synthetic records on desktop/mobile and restores its starting profile.

### Evidence boundaries

This feature tracks, rather than recommends, behavior. It makes no claim that
fasting plus yogurt treats SIBO, “eradicates bad bacteria,” or supplies a
complete diet. Probiotic effects depend on the strain, product and context;
not every fermented food has demonstrated health benefits
([NIH ODS](https://ods.od.nih.gov/factsheets/Probiotics-HealthProfessional/)).
Prolonged inadequate intake/refeeding carries risks in susceptible people
([NICE CG32, nutrition support and refeeding risk](https://www.nice.org.uk/guidance/cg32/chapter/Recommendations)).
The UI advises clinical guidance before prolonged fasting and for persistent
or worsening symptoms. It supplies no fasting duration, antimicrobial dose,
fermentation instructions or automatic supplement advice.
