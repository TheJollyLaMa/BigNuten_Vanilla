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
  the tracker never creates or changes a meal log. FODMAP content is not
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
