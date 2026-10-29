# Heart hub metric registry

Open the Heart chakra → **Vitals & Body**. The second tab is reserved for
Breathwork (#289); this change does not implement or complete that issue.
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
`metricDisplayUnits`. The preference affects registry metrics in the Heart hub
and correlation graph, not historical weight/measurement features. Changing
units never rewrites readings. Genie receives canonical units explicitly.

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
