# Heart hub metric registry

Open the Heart chakra → **Vitals & Body**. The second tab is reserved for
Breathwork (#289); this change does not implement or complete that issue.
Resting heart rate (`rhr`) is the reference metric. It accepts 30–220 bpm,
multiple readings per day, an optional note and a local date/time. The trend
supports day/week/month windows. The seven-day summary averages readings, not
daily means; lowest/highest values are descriptive extrema, **not clinical
"best/worst" rankings**. A lower pulse is not always healthier.

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

Use **one record with named fields**, not unrelated paired records. This keeps
one timestamp, source and note for one cuff reading. Add `fields` to the entry:

```js
{
  id: 'bp', label: 'Blood pressure', canonicalUnit: 'Pa',
  fields: {
    systolic: {
      label: 'Systolic', range: [/* canonical min, max */],
      input: { type: 'number', step: 'any' },
      displayUnits: {
        imperial: displayUnit('mmHg', 133.322),
        metric: displayUnit('kPa', 1000),
      },
    },
    diastolic: { /* same field metadata, its own range */ },
  },
  chartType: 'line', safetyNotice: '…', multiplePerDay: true,
}
```

Scalar entries define `displayUnits`, `range` and `input` directly. Compound
entries define those on each field; all fields share `canonicalUnit`. The
shared UI renders one input and chart series per field. Field names are stable
schema keys. This BP illustration is not a registered or medically validated
metric: follow-up work must choose appropriate ranges and safety text.

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
export/import. The logger creates self-reported records only. Dates/times are
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
