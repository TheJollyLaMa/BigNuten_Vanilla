# Heart hub metric registry

Open the Heart chakra → **Vitals & Body** for registry metrics, or
**Breathwork** for guided gentle practice (the Heart portion of #289).
Resting heart rate (`rhr`) is the reference metric. It accepts 30–220 bpm,
multiple readings per day, an optional note and a local date/time. The trend
supports day/week/month windows. The seven-day summary averages readings, not
daily means; lowest/highest values are descriptive extrema, **not clinical
"best/worst" rankings**. A lower pulse is not always healthier.

## Registered metrics

Input limits are permissive typo guards, **not safe/healthy targets**. All metrics
support multiple same-day readings, notes, a local timestamp, day/week/month
trends, current reading and 7-/30-day reading averages. Extrema are labelled
lowest/highest, never clinical best/worst. Averages weight individual readings,
not daily means. No diagnostic alerts or device integrations are provided.

| ID | Metric | Canonical | Imperial / metric display | Accepted input |
| --- | --- | --- | --- | --- |
| `rhr` | Resting heart rate | bpm | bpm / bpm | 30–220 bpm |
| `temperature` | Body temperature | K | °F / °C | 25–45 °C (77–113 °F) |
| `bp` | Blood pressure | Pa per field | mmHg / mmHg | systolic 40–300; diastolic 20–200 mmHg; systolic > diastolic |
| `spo2` | Blood oxygen | % | % / % | 50–100% |
| `rr` | Resting respiratory rate | breaths/min | breaths/min / breaths/min | 2–80 breaths/min |
| `hrv` | Heart rate variability, RMSSD | ms | ms / ms | 0–500 ms |
| `vo2max` | VO2 max | mL/kg/min | mL/kg/min / mL/kg/min | 1–120 mL/kg/min |
| `bodyFat` | Body fat | % | % / % | 1–75% |

BP uses **mmHg in both unit systems**: the established clinical convention is
more useful than introducing kPa in the metric display. Each paired reading is
still stored in Pa (1 mmHg = 133.322 Pa). Temperature stores K with affine
conversions (98.6 °F = 37 °C = 310.15 K). Milliseconds, bpm, breaths/min, percent
and mL/kg/min retain the named, SI-compatible clinical units; no hidden HRV
method conversion is performed.

### Reference bands and safety

Temperature, BP, SpO2 and RR show shaded **adult resting reference** bands;
orange points and explicit history labels flag values outside them. Bands are
not diagnoses, treatment targets, pediatric ranges or a declaration of safety.
The reference ranges come from [MedlinePlus vital signs](https://medlineplus.gov/ency/article/002341.htm)
(36.5–37.3 °C; BP 90–120 / 60–80 mmHg; RR 12–18 breaths/min) and
[MedlinePlus pulse oximetry](https://medlineplus.gov/lab-tests/pulse-oximetry/)
(95–100%). BP bands are descriptive, not hypertension-category boundaries.
Measurement site, technique, altitude and personal care plans matter.
HRV/VO2 deliberately have no universal healthy band. HRV entry is **RMSSD**,
not SDNN or a readiness score: record device/method in the note, because device,
recording length and posture affect comparability.

Every picker selection exposes non-diagnostic care guidance. Numeric care
thresholds cite their source in `js/metrics.js`; they do not prevent logging an
unusual reading or replace clinical evaluation. Follow individual clinician
advice; severe symptoms warrant urgent care regardless of a reassuring number.
The app does not infer a diagnosis or rank low/high values as healthier.

### VO2 max: manual provenance, no fabricated estimate

The shared form offers `self-reported` (e.g. a lab measurement) and `estimated`
(e.g. a result from a device or established test). Source and protocol belong
in the note; the explicit provenance survives all backup/restore paths.
**Selecting estimated does not calculate anything.**

Inspection of `js/app.js` workout timer `sessionLogEntry` creation and
the `exerciseForm` submit handler at base `2d9969f` found work/rest durations, completed
sets, reps and lifting weights, but no measured bike power, validated staged
protocol, or paired timed-distance/heart-rate cardio test. Those fields cannot
support a defensible VO2-max formula. We do not substitute workout duration or
lifting load for aerobic oxygen uptake. Automatic estimation remains deferred
until the steward chooses a validated protocol and its required data fields;
no automatic integration is claimed by this implementation.

## Adding a metric

Add an entry to `METRIC_REGISTRY` in `js/metrics.js`; the Heart picker, shared
form, history, chart, correlation series and Genie context use that registry.
For example, the existing RHR entry has this shape:

```js
{
  id: 'rhr',
  label: 'Resting heart rate',
  canonicalUnit: 'bpm',
  displayUnits: {
    imperial: displayUnit('bpm'),
    metric: displayUnit('bpm'),
  },
  range: [30, 220], // inclusive, canonical units
  input: { type: 'number', step: 1 }, // step is in display units
  chartType: 'line',
  safetyNotice: 'Not medical advice. …',
  multiplePerDay: true,
}
```

`displayUnit(unit, scale = 1, offset = 0)` describes an affine conversion:
`canonical = display * scale + offset`. Use SI-compatible canonical units for
new quantities (e.g. K for temperature, Pa for pressure, seconds for sleep).
RHR uses the steward-approved bpm canonical unit. Imperial is the default;
Settings → Vitals & Body units persists the display preference under
`metricDisplayUnits`. The preference affects registry metrics in the Heart hub, correlation graph
and unit-tagged tape measurements. Historical weight features retain their
existing units; unitless legacy tape readings remain unchanged (see below).
Changing units never rewrites readings. Genie receives canonical units explicitly.

### Compound values (blood pressure)

The registered `bp` entry uses **one record with named fields**, not unrelated
paired records. This keeps one timestamp, source and note for one cuff reading.
Its `fields.systolic` and `fields.diastolic` each define `label`, `range`,
`referenceRange`, `input` and `displayUnits` (mmHg in both systems).
`greaterThan: { systolic: 'diastolic' }` enforces systolic > diastolic in the
shared validator, including snapshot import. Example canonical record:

```js
{ metric: 'bp', value: { systolic: 15998.64, diastolic: 10665.76 }, unit: 'Pa' }
// 120/80 mmHg; normal ID, date/time, note and source metadata are also required.
```

Scalar entries define `displayUnits`, `range` and `input` directly. Compound
entries define those on each field; all fields share `canonicalUnit`. The
shared UI renders one input and chart series per field. Field names are stable
schema keys. Optional `referenceRange` is canonical, independent from accepted
input `range`; it drives generic shading, orange points and history labels.
`entrySources` optionally exposes a manual provenance picker (currently VO2).
Without it, the shared form creates self-reported records as before.

## Persistent data and privacy

Readings live **only inside** `fitnessTrackerData.metricLogs`:

```js
{
  id: 'stable-uuid', metric: 'rhr', value: 62, unit: 'bpm',
  date: '2026-10-28', time: '10:30', note: '', source: 'self-reported',
}
// Compound: value: { systolic: 15998.64, diastolic: 10665.76 }, unit: 'Pa'
```

Sources: `self-reported`, `estimated`, `imported`. Preserve provenance on
export/import. The logger defaults to self-reported; VO2 also permits estimated provenance. Dates/times are
local wall-clock values (no inferred timezone or device/API integration).
Stable IDs deduplicate snapshot merges; distinct same-day readings survive.
Missing `metricLogs` in legacy data normalizes to `[]`. Malformed or unknown
metric records fail validation explicitly rather than being silently dropped.
Add new definitions before importing their readings into older app versions.

JSON import/export and IPFS snapshots reuse the schema, snapshotRecovery and
mergeSnapshotData paths. `clearLocalHealthData` removes the parent health data
and recovery copies, so no additional metrics storage key needs wiping. Unit
preferences contain no readings and are retained.

Genie's **Vitals & Body** data-category toggle controls inclusion. Hosted
consent lists are derived from the `## Vitals & Body Metrics` section heading
and passed to `geniePrivacy.js`, so consent names the new category before any
hosted request. Existing hosted permission explicitly includes future enabled
categories; users can disable the category or revoke permission in Settings.

## Reuse decision

Need: a shared vital logger, canonical schema and automatic consumers. Reuse
BigNuten's `js/app.js:initPainLogModal` lifecycle and measurements/Chart.js
pattern, `js/fitnessSchema.js`, `js/fitnessData.js:mergeSnapshotData` and
`js/snapshotRecovery.js`. Build the small domain-specific registry and affine
conversion helper here. Read-only inspection of DecentHead and DecentMarket
`origin/main` (DecentHead `426ccb7`, DecentMarket `234d1e2`) filenames and JS/TS searches for registry/unit-conversion helpers
found no compatible donor in that scope. Canopy's curated agency map was
consulted as a lead, not a complete code index. No shared package or new chart
library is introduced.

Validation: Node registry/conversion, compound-value, legacy/schema,
merge/deduplication, real JSON/snapshot round-trip and complete wipe tests;
desktop/mobile smoke logs RHR and verifies history, chart, unit preference,
correlation series and hosted consent/context.


### Vitals expansion reuse decision

Need: six additional vitals with canonical persistence and existing Heart,
correlation and Genie consumers. Donor: this repository at `2d9969f`,
`js/metrics.js:METRIC_REGISTRY`, `displayUnit`, `convertMetricValue`,
`validateMetricLog`, `js/heartMetrics.js:initHeartMetrics`, plus the existing
schema, dataControl and snapshotRecovery paths. Adapt these directly; no
extraction or new dependency. Search scope was this receiving worktree and its
actual workout storage; existing parallel worktrees were inspected via git
metadata only, not edited. Per the worker boundary, no private external Canopy
inventory or other repositories were read or published. The original registry
reuse decision above retains the earlier ecosystem search evidence.

Compatibility decisions: additive registry entries; compound BP adds a generic
ordering constraint; optional canonical reference bands and source choices are
shared-form features. Clinical display units do not rewrite stored readings.
No automatic VO2 estimate is possible from current log fields. Validation:
per-vital Node range/conversion/recovery tests, every new vital through real
JSON export/import and snapshot restore, plus desktop/mobile logging of BP,
temperature, SpO2, RR, HRV and estimated VO2, reference highlights and °F/°C
switching. Nothing in this inventory implies live device synchronization.

## Workout effort, duration and recovery

The existing workout timer writes `sessionLog` (completed and canceled sessions).
The **Workout Set List → Workout sessions & recovery** editor adds optional session
`rpe` (integer 1–10), `durationSeconds`, `workoutTypes`, and
`recovery: { soreness: boolean, tightness: boolean, note: string }`. Review any
session after a workout, including canceled workouts. Optional RPE can be cleared.
Trends use the existing Chart.js library, with a workout-type filter and separate
RPE/minutes axes. Legacy sessions without a known type remain in All workout types.

Duration is elapsed wall-clock time from valid `start`/`end` timestamps (including
preparation, pauses and rest), not just working-set time. It is computed on
normalization and displayed consistently in minutes. Sessions without those
timestamps accept explicit minutes; absent duration displays **duration not
recorded**. Historical work/rest totals are not treated as elapsed duration.
New session IDs are stable for backup merge; reviewing a session updates its
existing row, not another workout store. The shared timer handle remains in
`js/app.js`; cancellation does not re-log sets already saved by the timer.

## Monthly measurements and photo metadata

The existing **Log Measurements** form now stores new tape measurements in
canonical **cm** (`unit: 'cm'`). Display and input use `metricDisplayUnits`
(imperial inches by default, metric cm). Changing units never rewrites readings.
The original form labelled its input “inches/cm” but stored no unit. Those
historical values remain untouched and are explicitly labelled **legacy units
(not specified)** in history and separate chart series. No conversion or guessed
unit is applied. Explicit imported `unit: 'in'` entries are also supported.
Historical weight features still use their existing units.

A gentle dashboard reminder appears when no measurement exists or the last local
measurement date was at least 30 calendar days ago. **Not now** snoozes for 30 days
using `measurementReminderDismissedOn` inside the existing health snapshot. A new
measurement restarts the interval. History is timestamped, chart ranges and custom
types use the existing measurements flow. A form error retains entered data.

Each measurement can carry `progressPhotoTaken` and `progressPhotoNote`. These
are metadata only: no file picker, image upload, image storage or URL fetching.
Do not put private links in a note if you do not want them in your own backup.

Optional body fat is manual-only (leave blank if unknown), 1–75%, with
`self-reported` or `imported` provenance. No formula or calculated estimate is
implemented. No universal adult reference band is assigned: interpretation varies
by age, sex and measurement method, so the input limits are not health targets. The value lives once in `metricLogs` as registry metric `bodyFat`,
canonical unit `%`; the measurement links it via `bodyFatMetricId`. This uses the
Heart hub, chart, correlation and existing Genie Vitals & Body privacy category.
Deleting the metric reading in Heart leaves the tape/photo record, but removes
its linked body-fat display. Historical measurements have no fabricated photo
or body-fat metadata. All additions normalize additively through fitnessSchema
and follow JSON/IPFS export, merge, restore and wipe paths.

Reuse decision: need session effort/recovery and longitudinal body logging.
Adapt this repository's `js/app.js:prepareWorkoutSequence`, `runWorkoutStep`,
`clearWorkoutTimer`, existing measurements modal/chart, `js/metrics.js`,
`js/fitnessSchema.js` and `js/fitnessData.js:mergeSnapshotData` at base `5c431eb`.
The curated Canopy agency map was consulted as a lead; the receiving app already
has the compatible stores, timer and Chart.js dependency, so no external donor,
parallel store or shared-package extraction is needed. Compatibility limitation:
unitless legacy tape readings cannot safely be converted. Validation includes
field/legacy/timing Node tests, the real defaultData JSON/snapshot round trip and
desktop/mobile smoke completing a timed workout then logging photo metadata and
body fat through the existing forms.

## Sleep and daily energy

- `sleep`: canonical **seconds** (`s`), 0–86,400 inclusive. Enter duration as
  **h:mm** (e.g. 7:30 → 27,000 seconds) in either unit preference. History,
  summary and trend tooltip show h:mm; chart/correlation coordinates use hours.
  The explicitly selected **wake date and local wake time** identify the night:
  sleeping Oct 27 → Oct 28 belongs to **Oct 28**. This timestamp is not bedtime;
  never infer a last-meal-to-bed interval from it. One record per wake date.
- Optional `sleepQuality` metadata is an **integer 1–10**, not seconds and not
  a compound duration field. `optionalRating: { key, label, range }` enables the
  shared optional rating control; the registry validator checks it on every
  save/import. Omitted quality stays missing. The existing `note` field is
  prominently labelled for dreams, stress, caffeine and interruptions.
- `energy`: a subjective **integer 1–10**, one record per local date. Its
  canonical unit is `rating`; display is identical in both unit systems.
- Repeated dates are rejected rather than silently appending/replacing. Delete
  the existing reading before correcting it. Snapshot merges preserve the local
  daily reading on a same-metric/date conflict (even with different IDs), so a
  restore cannot create an invalid duplicate day. Missing days remain absent (not
  zero). Sleep summaries include rolling 7/30-day averages, extrema and highest
  reported quality; longest duration is not labelled clinically “best”.

Sleep's `input: { type: 'text', format: 'duration' }` opts into the shared
h:mm duration widget. `parseSleepDuration` validates before storing integer
seconds; affine display conversions remain numeric hours for chart consumers.
`integer: true` opts scalar metrics into whole-number validation (energy).
The correlation graph automatically offers sleep and energy alongside existing
emotion, exercise/performance and nutrition series. Notes and quality accompany
canonical readings in Genie's existing consent-controlled Vitals & Body context.
No automatic correlations or medical conclusions are claimed.

## Heart breathwork

`js/breathwork.js` contains data-driven gentle presets: box, 4-7-8, coherent,
Sama Vritti, extended exhale, and the existing Yoga Flow 4–2–6–2 cue. Yoga and
Heart import the **same pattern/phase definitions**; Yoga's existing independent
pose-session logger remains unchanged. It had a breathing animation but no
standalone breathwork session store. The steward-approved **Wim Hof-style**
adaptation is hidden until explicitly revealed and cannot start without the
caution acknowledgement. Each round is **30 paced breaths** (2 seconds inhale,
2 seconds exhale), then **10 fixed seconds of normal recovery breathing**, with
**no retention or hyperventilation cue**. This is not a full Wim Hof protocol.
The session includes `protocol: 'paced-recovery'`; validation fixes that
protocol's pattern and uses 130 seconds per completed round. Acknowledgement
is not stored: Save, Cancel, close or page exit resets it. There is also an
explicit reset/hide control. Safety text requires sitting/lying down, never
near water/driving/standing, stopping if dizzy/tingling/unwell, and avoiding the
practice during pregnancy or with heart, epilepsy or blood-pressure conditions.
The default remains gentle box breathing.

Custom phases allow inhale/exhale 1–30 seconds, inhale hold 0–7, exhale hold 0–4.
Skip holds by setting zero; never force breathing or practise in water/driving.

Begin → Pause/Resume → End (or target rounds complete) → optional feeling/note
→ **Save session**. Cancel, closing the hub, switching to Vitals, or page exit
clears the single owned timer and discards an unsaved practice. Paused time is
excluded. Partial ended sessions record completed rounds (possibly zero).
Sessions live only in `fitnessTrackerData.breathworkSessions`:

```js
{
  id: 'stable-uuid', method: 'Box Breathing',
  pattern: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 },
  rounds: 2, durationSeconds: 32, notes: '', feeling: 'calm',
  timestamp: '2026-10-28T07:30:00.000Z'
}
```

This additive array defaults to empty in legacy profiles, validates on import,
merges by stable ID, and follows JSON/IPFS/snapshot recovery and health-data
wipe paths. Weekly totals and streaks use local calendar days. Saved practice
today lights Heart; practice within seven days partially lights it, preserving
existing emotion scoring. Saving also celebrates using existing chakra sparks.
Reduced-motion preference suppresses the scaling animation; text cues remain.
Breathwork is not sent to Genie (the separate category remains disabled).

### Reuse decision for sleep / energy / breathwork

Need: daily sleep/energy with correlation and safe guided practice. **Adapt**
BigNuten `js/metrics.js`, `js/heartMetrics.js`, `js/fitnessSchema.js`,
`js/fitnessData.js:mergeSnapshotData` and existing Chart.js consumers at
`2d9969f`. Extract only Yoga's actual shared cue from
`js/yoga.js:startBreathAnimation` into `YOGA_BREATH_PATTERN`/`BREATH_PHASES`;
reuse its phase-class convention and `js/chakra.js:spawnSparks`. The Yoga timer
uses recursive timeouts tied to pose UI, so do not import its lifecycle or write
breathwork into exercise sessions. Build one dedicated, validated session array
and one interval owned by the Heart panel, not another storage key or modal.

Read-only scope: Canopy `data/agency-map.json` BigNuten offers/needs (storage
leads only); local ZenBoost `boost.js`/README (CLI focus tool, no compatible
breathing component); DecentHead `8542720` `js` JS/TS searches (decorative header “breathe”
CSS only, not a phase timer). Existing BigNuten worktrees were checked for
unfinished implementations; coordinate additive schema edits with chanting.
No donor health data, credentials, external package or public Canopy inventory
change is involved. Same-repo extraction preserves the app's license/runtime.
Receiving-app tests: h:mm conversion, wake-date uniqueness, energy range,
optional quality validation, timer lifecycle, session/schema/JSON recovery,
and desktop/mobile sleep + energy + short clock-driven breathing smoke.
