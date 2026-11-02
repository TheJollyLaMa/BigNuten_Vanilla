# Research → Protocol → Experiment (#405)

BigNuten's research workflow is **Learn → Plan → Track → Check**. Open it from
the **Research** button in the left toolbar.

## Learn: private research library

- Save a supported YouTube URL, category, optional tags and a transcript pasted
  by the user. The app canonicalizes the URL and derives a YouTube thumbnail
  URL from the validated video ID.
- **Load details** and **Try YouTube captions** are separate, explicit actions.
  They send only a video ID to the invited Genie service; neither calls an AI
  model. The service uses YouTube's public oEmbed endpoint or best-effort public
  captions. A failed request leaves the manual title/transcript path available.
- Pasting and saving a transcript performs no network request. No user API key,
  client-side Whisper call or public CORS proxy is used.
- Search matches title, transcript, summary and tags; category filtering, local
  transcript edits and delete are available. Deleting a research entry also
  removes protocols and experiments linked to that entry.
- Entries can be opted into Genie chat context individually. When the complete
  transcript will not fit the remaining token budget, the chat receives its
  saved summary/tags (if present) and the video title instead. A short summary can be pasted locally or saved from a protocol draft. The prompt marks
  research as untrusted reference material and asks Genie to cite saved titles.

## Plan: consented editable protocol

The user selects BigNuten scalar metrics, checks the explicit consent box and
clicks **Turn into a protocol**. That sends the selected item's title and
transcript plus selected metric names to `POST /research/protocol` for one
structured-output draft. The response is a draft only; it is not saved or
applied automatically. The user can edit the title, summary, rationale, action,
dose/amount, timing, duration, baseline window, metric direction and clinician
review note before explicitly saving it.

Protocol requests are treated as sensitive, non-public Genie actions. The
service wraps transcript content in explicit untrusted-data delimiters and
instructs the model to ignore embedded instructions. Delimiter-shaped text in
the transcript is neutralized before wrapping. The model response is schema-
validated, restricted to supplied BigNuten metrics and never stored on the
service.

## Track and Check

Starting a saved protocol creates a local experiment with an editable start
date, duration (1–180 days) and baseline window (1–90 days). Users can record a
daily **done** or **skip** check-in. The comparison uses scalar `metricLogs`
for the selected targets:

- baseline: the configured number of calendar days immediately before start;
- during: start date through the earlier of today or the planned end date;
- metric comparison: mean logged value for each window, with sample counts;
- adherence: days marked **done** divided by elapsed planned experiment days;
  skipped and unlogged days are shown separately.

The result is labeled a **personal observation, not proof**. It calls out the
measurement windows, sample counts, skipped/missing check-ins and missing
metric data. Short windows, confounding changes and incomplete logs limit
interpretation. This feature is not medical advice. Supplement, fasting,
medication or other clinically relevant drafts should be reviewed with a
qualified clinician; the model is instructed not to recommend starting/stopping
medication or unsafe practices.

## Data and privacy boundary

The records live in localStorage under `fitnessTrackerData`:

- `latestResearch`: video metadata, private transcript, optional summary/tags and
  the explicit `includeInGenie` chat-context flag;
- `researchProtocols`: user-reviewed, user-saved protocol drafts;
- `researchExperiments`: start/duration/baseline dates and done/skip check-ins.

These fields participate in the existing JSON export/import and encrypted
snapshot flows. JSON exports remain plaintext user-held files; encrypted remote
snapshots retain the existing CID/decryption caveats. Research records are
never uploaded to the shared nutrition/food library or stored by the research
endpoints. A transcript reaches the hosted service only when the user explicitly
requests a Genie protocol draft. A caption/metadata action sends only the video
ID and does not send the transcript or invoke a model. Genie chat inclusion is
opt-in per entry and follows the existing chat consent flow; hosted chat context
is sent only when the user submits a Genie message with the applicable
permission.

## Hosted service routes

The routes are added to the existing `services/nutritionService.mjs` service and
inherit its exact allowed-origin check, invited-wallet authentication, per-wallet
6/minute rate limit, shared durable lifetime call cap, request cancellation and
no-store response headers. Every successful route action reserves one call from
the existing shared cap (including metadata/captions, which use no model tokens).
There are no new environment variables or dependencies.

| Route | Request / result | Provider behavior |
|---|---|---|
| `POST /research/oembed` | `{ videoId, consent: true }` → title and derived thumbnail URL | YouTube oEmbed; 8-second timeout; no AI call |
| `POST /research/captions` | `{ videoId, consent: true }` → transcript, language and source | Best-effort YouTube captions; 12-second timeout; no AI call |
| `POST /research/protocol` | `{ title, transcript, metrics, consent: true }` → validated protocol | One structured-output model call; 60-second timeout |

Caption extraction fetches a fixed YouTube watch URL, validates that the
caption track remains on a YouTube host, and never accepts arbitrary remote
URLs. Captions may be disabled or absent; users can always paste a transcript
without calling any endpoint.

**Deployment note:** the GitHub Pages app's already-configured Genie URL does
not yet expose these route handlers until the existing Render Genie service is
deployed from this branch. No service deployment or environment-variable change
was made as part of this issue. Until deployment, local saving and pasted
transcripts still work; metadata/caption/protocol actions show an unavailable
state.

## Validation

- Node tests cover local persistence/merge, URL validation, date-window
  comparisons, adherence, chat token budgeting, safe oEmbed/caption fetching,
  endpoint auth/caps and structured protocol injection hardening with a mocked
  model.
- `npm test` runs Node and Hardhat suites.
- `npm run test:smoke` covers desktop and mobile, including the full local
  workflow and mocked hosted routes.
