# BigNuten Storage Layer

BigNuten uses a provider-neutral IPFS data layer:

- **IPFS Desktop** is the direct local provider for users who run Kubo locally.
- **Pinata through the Render relay** is the hosted onboarding path for users who do not run IPFS Desktop yet. Availability depends on the deployed service; a free Render instance can sleep.
- The browser uploads directly to Pinata using a short-lived signed URL. The Render relay never receives file contents and never stores a central database copy.
- CIDs remain portable `ipfs://` references. Pinata is a pinning provider, not the ownership authority.

## Render relay

The service is defined in `render.yaml` and starts with:

```sh
npm run storage:serve
```

Configure these Render environment variables:

- `PINATA_JWT`: server-only Pinata credential; never expose it to the browser.
- `PINATA_SIGN_URL`: normally `https://uploads.pinata.cloud/v3/files/sign`.
- `BIGNUTEN_STORAGE_ALLOWED_ORIGINS`: exact production and local browser origins, comma-separated. Include `http://127.0.0.1:8010` when developing on the current BigNuten preview server.

The service exposes:

- `GET /health`
- `POST /api/storage/nonce`
- `POST /api/pinata-upload-url`

Each upload authorization is bound to the wallet, browser origin, a five-minute nonce, an expiry, and a wallet signature. Nonces are single-use. The relay authorizes JSON (128 KiB max), JPEG/PNG/GIF/WebP, and MP4/WebM (25 MiB max) by extension and MIME type. File bytes upload directly to Pinata.

Set the deployed Render URL in the browser before enabling the hosted provider:

```js
window.BIGNUTEN_STORAGE_RELAY_URL = 'https://your-service.onrender.com';
```

A relay restart clears its in-memory nonce store; this only invalidates outstanding upload authorizations.

Hosted selection requires a configured relay and an injected wallet. Missing
configuration or wallet access is an explicit error, not a fallback prompt for
personal credentials. **Use my Pinata account** is the separate credential path:
its JWT is kept only in memory for the page session and reused for subsequent
uploads. Clearing it in Settings clears the cached personal session. A page
reload does not restore that credential or authorize new uploads; reconnect
deliberately. The saved storage preference alone does not establish a connection.

## Verified snapshot recovery

Collecting the current profile preserves `fitnessTrackerData` even when there
are no older browser snapshot files. Previously this combination overwrote the
profile with defaults before snapshot collection. CID merges retain an existing
profile timezone, or restore the imported timezone when the current one is empty.

All provider requests have a 75-second timeout. IPFS Desktop uses POST for
Kubo's version, add and cat endpoints. With Desktop selected, verification and
restore retrieve from the local node, not a public gateway that may not yet
know the new CID. Hosted/personal Pinata retrieval uses the Pinata gateway.

After upload, BigNuten retrieves the snapshot, unwraps the supported v1 envelope
(legacy plain JSON objects remain supported), and compares the canonical data
hash. Only a successful match advances the recovery manifest and hourly-success
timestamp. Unavailable bytes, malformed JSON, unsupported wrappers, mismatched
hashes, or manifest write failures reject the backup instead of reporting success.
An uploaded-but-unverified CID is recorded as an error in snapshot metadata;
it is not a replacement for the previous recovery point.

If a new snapshot fails, keep using the existing browser data and export JSON
before further recovery attempts. Reconnect the intended provider and retry.
The snapshot panel retains the previous known-good pointer and history; select
an older successful CID explicitly to merge it, rather than importing a failed
upload. JSON download/import remains available without IPFS or a wallet.
No remote unpinning or automatic destructive restore is added by this repair.

## Local recovery, versions and user exports (#341)

There is **one fitness schema**, `dataVersion: 1`, defined by
`js/fitnessSchema.js`. Legacy unversioned fitness objects and the existing
legacy field aliases/wrappers remain importable; the existing IPFS v1 envelope
and plain JSON exports are unchanged. Import validates shape before normalization
or merging. Unknown/newer `dataVersion` or envelope versions are rejected with
an update-app message, without rewriting the saved object. Export remains
available even when the app cannot interpret that version. This is not a
migration to a second snapshot format.

The browser keeps **three distinct last-known-good local recovery points** under
`bignutenRecoveryPoints.v1`. These health-data copies stay in this browser;
they are never included in provider uploads, community manifests or lineage.
They do not change the existing IPFS hourly/monthly/annual retention policy.
Clearing site storage removes local recovery too: download an external JSON
backup before clearing data or moving browsers.

On load, missing or invalid primary fitness data is restored automatically from
the newest valid local point. Invalid candidates are skipped; legacy
`fitnessTrackerSnapshot-*` files are eligible through the same validated path.
**Valid current data is never automatically replaced or merged with an older
snapshot.** A visible notice names the recovered point's timestamp and provides
**Undo recovery** and **Export saved data**. Undo restores the exact original
primary and water-cache bytes (including originally absent keys). The original
state remains in `bignutenRecoveryUndo.v1`; it is not deleted by undo. Undo refuses
to overwrite subsequent edits. Export those edits before further recovery.
Local writes/quota failures reject rather than report a successful recovery.

The notice has an accessible **Dismiss recovery notice** button. Dismissal is
stored in `bignutenRecoveryDismissed.v1` for that recovery event, not all future
recoveries. Undo also records the exact pre-recovery primary state (including
absence) in `bignutenRecoveryUndone.v1`, so reloading does not auto-restore the
same state again. Different corrupt bytes, or corruption after a successful
save/observed valid primary, allow a new recovery. Exact byte comparisons avoid
changing the synchronous recovery contract to use the asynchronous canonical
hash helper; undo does not normalize or hash away differences in corrupt bytes.

### Delete/reset guardrail (#359)

Any future **delete all local health data** or whole-profile reset must call
`clearLocalHealthData()` from `js/snapshotRecovery.js`, not just remove
`fitnessTrackerData`. This single helper removes the primary, both water caches,
all three recovery points, the exact undo record, dismissal/undo-choice keys,
and every legacy `fitnessTrackerSnapshot-*` copy. It removes recovery sources
before primary data and propagates storage failures; do not report deletion as
successful after an error. Download an external backup first if desired.
Fresh recovery initialization after a successful clear cannot resurrect data.
Unrelated preferences, credentials and remote backups are not removed.

There is currently no whole-profile delete/reset control; none is added here.
The data control panel imports/exports rather than deletes. Settings resets
permissions/preferences, and Genie **Clear all memory** clears only Genie
sessions/insights and session chat caches, preserving the rest of the profile.
These scoped actions must not be routed to a whole-health-data deletion helper.
Remote manifests/unpinning and deleting external JSON exports remain separate.


Recovery procedure:

1. **Missing/corrupt primary:** use the automatic recovery notice; inspect the
   dated data before continuing, or undo. If no valid point exists, preserve the
   original bytes and use **Export saved data** before importing your own backup.
2. **Missing/unavailable/invalid CID:** reconnect the selected provider, retry
   after it is available, or explicitly import an older successful CID. Failed
   fetches do not write an empty profile or advance the remote recovery pointer.
3. **Stale but valid snapshot:** it is not automatically substituted for current
   data. Export current data first, then explicitly import the older JSON/CID to
   merge missing records. Current water counts win overlapping dates; distinct
   array records use a stable record ID, or canonical content when no ID exists,
   so simultaneous records are not dropped just because timestamps match.
4. **Unsupported future version:** update the app; do not normalize it down to
   v1. Export the saved data while waiting. No automatic down-migration occurs.
5. **User export/import:** About → JSON download, or the IPFS snapshot panel's
   JSON controls; mobile local mode offers the JSON data sheet. Download does
   not require a wallet or IPFS. Reimport merges rather than clears current data;
   repeated imports are idempotent. An error is not a successful import.

Round-trip coverage includes water daily history, weights, supplements, foods,
measurements, exercise types/entries, workout sessions, pain, emotions and Genie
sessions/insights. Water-widget caches are synchronized on restore. Settings,
credentials and chain-history caches are not added to the existing health export
format.

### Daily water and restored panels (#257, #265, #204)

The existing water-drop modal is the daily logger: each **Log** adds one glass,
**Remove** corrects one glass, and the total belongs to the user's configured
personal day. Units and the existing eight-glass meter goal are unchanged; the
arc stops at the goal, but intake totals can exceed it. This is a logging UI,
not a medical recommendation. The existing correlation graph offers the water
history series; no second tracker or new trend graph is introduced.

`fitnessTrackerData.waterDailyHistory` is canonical: `{ "YYYY-MM-DD": count }`.
The v1 schema retains daily totals, not individual drink timestamps. Every
successful log updates that map, the derived `waterDailyHistory` and
`waterTrackerData` caches, and the existing local recovery store. Failed writes
show an error rather than displaying an unsaved increment. Startup adapts valid
legacy cache-only days without replacing canonical snapshot totals. Missing or
malformed caches do not hide valid fitness data. A new personal day starts at
zero and retains previous days. JSON and IPFS serialize the same canonical map.

PR #358 already supplied water normalization, validated JSON/CID merge,
local recovery, backup transport and the restored-data event/core renderers.
This follow-up closes the cache migration/failed-write gaps, removes stale
water fallback on restore, and refreshes pain, feelings and an already-open correlation graph too.
Successful JSON and CID imports dispatch `bignuten:fitness-data-restored` after
synchronizing water caches; existing panel listeners read the restored canonical
records without reloading. Historical records remain visible in all-time logs
and charts even when outside a recent-period panel's date range.

Validation uses synthetic records only: `test/waterPersistence.test.js` covers
multiple logs, migration, rollover, cache/primary write failures, future-version
retention, actual JSON export/import and mocked IPFS upload/CID import.
`test/browser-smoke.mjs` verifies both JSON and CID restores populate water,
weight, nutrition/food, supplements, exercises, measurements, pain and feelings
and an already-open water trend in fresh desktop/mobile data profiles without
navigation or reload. No real
health records or remote uploads are used by these tests.

## Durable chain history

`js/chainHistory.js` adapts the Busking checkpoint pattern with browser-injected
storage, not its ledger schema. Streak entrant/check-in queries and reward
payment queries use explicit numeric block windows (10,000 blocks/request,
maximum ten windows per invocation). Checkpoints are scoped by chain, contract,
wallet/filter identity. A restart continues from the saved cursor; a 12-block
overlap is re-read and replaced to handle recent reorgs. Deep historical reorgs
require an explicit full reindex; this is not a finality guarantee.

Each completed window atomically saves events and cursor in one localStorage
value. Events dedupe by transaction hash plus log index, not amount, wallet or
observation time. Malformed RPC events, unavailable block heads, failed queries
and failed checkpoint writes reject. Prior completed windows remain available;
a failure never becomes an empty successful result. Scans begin at block zero
for completeness (no deployment-height assumptions); the first recovery may
require reopening the view several times to catch up. Cached data is not a
claim that the full history has been scanned.

The reward panel and Streak cards distinguish pending, success and failure.
Provider backup status is exposed in a visible live status notice (including
hourly uploads) and the opt-in host adapter maps pending/failure to host
`pending`/`error` rather than reporting connection readiness as backup success.
Incomplete/unavailable reward scans do not display zero as a confirmed total or
calculate a misleading pending payout. A retry/reopen continues recovery. RPC
access is still required; an RPC that refuses the configured window must be
retried with a compatible provider. Chain caches are derived/auditable state,
not the authority for user-owned fitness exports.

## Reuse decision

Need: recover browser-owned snapshots and bounded chain history without new
public health-data sharing. Canopy's `durable-checkpoints` inventory was a lead;
current donor source/tests and unfinished work were inspected read-only.

- **Adapt concepts:** DecentBusking `js/personal-play-recovery.mjs`
  (`023c278`), injected storage/validation/explicit failure; `discord-bot/checkpoint-history.js`
  (`63e4563`), verified retained history and stable identities;
  `discord-bot/checkpoint-mirror.js` (`e60b91d`), bounded verification;
  `discord-bot/ipfs-state.js` (`e60b91d`), `fund-ledger.js` (`b98fb67`),
  `payment-ledger.js` (`a256c8e`) and `weekly-payflow.js` (`d97b93f`), checkpointed recovery.
- **Preserve/adapt:** steward WIP's IPFS host adapter and storage validation
  workflow, checked against DecentHead `js/ipfs-host.js` and
  `.github/workflows/validate-ipfs-host.yml` at `426ccb7` (host v1,
  explicit states, Node 24, read-only workflow permissions).
- **Incompatibilities:** Busking's wallet purchases, server filesystem, Node
  crypto/IPFS importer dependencies, radio/payment schemas and public checkpoint
  retention do not fit private browser health recovery. Existing BigNuten v1
  schema/providers/hash helper remain authoritative. No new dependencies,
  extracted shared package, external service or public inventory update.

Both donor projects use Apache-2.0; credit remains with The Jolly LaMa / A Decent
Agency. This is a conceptual adaptation, not a copied donor application/schema.
Receiving-app tests are the synthetic Node recovery/transport/history tests and
existing Hardhat suite; no live provider integration or encryption claim.

## Opt-in DecentHead adapter (local validation)

`js/ipfsHostAdapter.js` exports `createBigNutenIPFSHost({ returnFocus })` for
the DecentHead v1 host contract. It is not imported by the production app and
does not change the existing IPFS icon behavior. No CDN dependency or
unreviewed `@main` integration is introduced.

The adapter advertises **backup only**. Community replication and rewards
remain unavailable until their own public-manifest and eligibility integrations
are implemented. Local status is `idle`; a connected provider reports `ready`
with an explicit warning that connection is not backup verification. Status
reads do not connect, prompt, restore a session, collect health records or upload.
Provider errors and malformed connection states propagate to the header.

Opening backup controls rechecks the selected provider and delegates to
`openBackupControls()` in the existing data-control module:

- Connected provider: snapshot history/import/export panel, **without** the
  legacy icon's automatic upload.
- Disconnected desktop: existing hosted/personal/Desktop choices and JSON tools.
- Disconnected mobile: existing local JSON sheet.

Missing panels reject explicitly. The opener focuses the close control, handles
Escape, wraps Tab within existing modal panels, and releases its listeners on
close (including automatic close after connection). Supply `returnFocus` to
focus the invoking header control after close: the header temporarily disables
its button during handoff, so the current document focus alone is insufficient.
The snapshot panel remains nonmodal, preserving its existing behavior.

For a **synthetic, isolated test only**, initialize the normal provider registry
and data controls once, create this adapter, then set
`DECENT_CONFIG.ipfsMode = 'host'` and `DECENT_CONFIG.ipfsAdapter = adapter`
before mounting the tested DecentHead element. Load a reviewed, pinned header
revision; do not replace the existing app header or enable real health uploads
as part of this example. The adapter's synthetic label/warning is not a technical
upload restriction: its panels still call the normal storage implementation.

Cross-repository isolated Chrome checks passed for hosted, personal Pinata and
Desktop: inert mount/open, panel handoff without upload, explicit synthetic
save/read-back, CID merge, JSON download, failed-retrieval pointer retention,
modal keyboard wrap, Escape/focus return and 390px local-only controls. Provider
responses and the wallet signer were mocked; no real provider traffic occurred.
These are consumer-boundary checks, not proof of real wallet authentication,
provider availability, full application boot or production rollout.

## Privacy and ownership

The relay does not make public IPFS content private. Anyone who learns a CID can retrieve its content. Sensitive health or identity data must be encrypted in the browser before upload, with the decryption key shared only with intended participants. Never put Pinata credentials, private keys, email addresses, or plaintext sensitive records in the repository or an IPFS document.

The community-sharing flow must remain separate from personal backup. A user can keep a snapshot in their own provider and explicitly publish a separate sanitized dataset for community aggregation and BNUT rewards. Sharing a record must be an explicit wallet-confirmed action; the relay must not infer consent from a backup upload.

**Current implementation is not encrypted private backup.** The transport repair
is validated with synthetic records only. Do not upload real health data through
these snapshot paths until client-side encryption and a recoverable key policy
have been decided and tested. A personal Pinata account, local Kubo pin, wallet
signature or secret CID is not a confidentiality boundary. The relay sees
authorization metadata; Pinata receives the uploaded file bytes.

## IPFS Desktop

Keep Kubo bound to `127.0.0.1:5001` and allow only the exact BigNuten site origin in its CORS settings. Do not expose the Kubo API publicly. A local pin is available only while the user’s node is online, so important public records should be replicated to another provider or node.

## Community pinning rewards

BigNuten mirrors ArtFi’s verifiable node model through
`BigNutenNetworkRegistry.sol`, deployed at
`0x0670B43b689D51Fd04741b52507D4f87c24A5E75` on Base. Its node-replication
rewards are a separate program from participant health-data incentives. The
`bignuten-data-rewards` fund is not yet created or funded, and the Registry still
needs its router `PAYROLL_ROLE` and payout configuration.

The intended lifecycle is:

1. An operator registers a node with a node DID hash, peer ID hash, and software version.
2. An administrator approves the node and grants checker wallets `NODE_CHECKER_ROLE`.
3. The administrator publishes a monthly challenge hash.
4. The keeper pins and retrieves a sample of published community CIDs, hashes the retrieval report, and submits a heartbeat or independent checker proof.
5. After 25 independent checks with the 12-hour spacing rule, the operator sees the eligible amount in the community panel and claims through MetaMask.
6. The registry calls the shared router for the `bignuten-data-rewards` node fund using a unique work reference.

Local commands are ready for the post-deployment phase:

```sh
npm run network:index
BIGNUTEN_NETWORK_REGISTRY_ADDRESS=0x... BIGNUTEN_NODE_ID=1 npm run network:node -- checker
```

Do not treat a browser-only “I pinned this” claim as proof. Reward eligibility
comes from independent checker transactions and the router’s approved recipient
and funded-fund checks.

## Health-data rewards

Opt-in participant rewards use the separate `bignuten-health-data-rewards` fund
on the same Base Settlements Router. The fund record is active but currently has
zero BNUT. Reward rows are explicitly settled by an authorized admin; the UI
checks the fund balance, router roles, and recipient approvals before payout.
Do not use the node-replication fund for participant incentives.

## DecentNFT metadata publishing

Prepare a folder containing `collection.json`, one JSON file per token ID (for
example, `0.json`), and optional image/GIF/MP4/WebM assets. JSON is limited to
128 KiB; each media file is limited to 25 MiB. Use `imageFile` and
`animationFile` filenames inside metadata JSON; the publisher pins media first
and rewrites them to `ipfs://` CIDs. SVG and arbitrary file types are rejected.
The publisher also accepts `streak-rules.json` for multi-metric challenge
definitions. Metadata without an explicit `image`/`imageFile` defaults to
`img/BigNuten.png`. The current Render relay deployment only allows JSON; the
first hydration awards therefore use the public BigNuten favicon URL in their
metadata. Deploy the media-enabled relay source before publishing image files
to Pinata. Example rules file:

```json
{
	"schema": "bignuten-streak-rules/v1",
	"requiredActivityDays": 28,
	"metrics": [
		{ "id": "water", "type": "hydration", "label": "Hydration", "cadence": "daily", "target": 8, "unit": "glasses" },
		{ "id": "weigh-in", "type": "weight", "label": "Scale check-in", "cadence": "weekly", "target": 1, "unit": "entries" },
		{ "id": "situps", "type": "exercise", "label": "Sit-ups", "exerciseType": "Sit-ups", "cadence": "daily", "target": 20, "unit": "reps" }
	]
}
```

All `daily` rules must pass for a qualifying day; `weekly` rules count their
targets independently in each seven-day period. From `BigNuten_Vanilla`, run:

```sh
npm run metadata:publish -- ../DecentMarket/metadata/base
```

For each file, the command obtains a wallet-authorized Pinata upload URL from
the Render relay and uploads directly to Pinata; it also pins the same bytes on
the configured local IPFS Desktop API. The relay never receives file contents.
The command writes per-file Pinata and local CIDs to
`deployments/decent-metadata-cids.json`; use the collection CID with
`setContractURI` and token CIDs with `setTokenURI` or `registerToken`.

After the Base network registry is deployed, set
`BIGNUTEN_NETWORK_REGISTRY_ADDRESS` and add `--publish-to-registry` to publish
the Pinata CIDs as community data. Independent node operators can then pin and
sample those CIDs under the existing reward workflow. Pinata, local IPFS, and
reward-eligible community nodes provide separate replicas; the Render relay
authorizes uploads but is not itself a storage replica.

### Participant progress reports

Participants can optionally check **Publish wallet-linked progress details to
public IPFS** at meetup check-in. The app uploads the selected metric records to
Pinata through the relay, attempts a local IPFS Desktop pin, and submits the
Pinata CID through StreakBet's `WeeklyReport` event. This checkbox is off by
default. Published reports associate the participant wallet with their chosen
health statistics and are public to anyone with the CID; never opt in unless
that disclosure is intended. Without opt-in, the chain receives only a
commitment hash and peer decisions, not the detailed records.

## Testing

Run the relay tests with:

```sh
npm run test:storage-relay
npm run test:metadata-publisher
node --test test/snapshotTransport.test.js test/dataControlStorage.test.js test/ipfsHostAdapter.test.js test/snapshotRecovery.test.js test/chainHistory.test.js test/dataSharingHistory.test.js
```

The recovery/history tests cover legacy/v1 validation, future-version rejection,
three local points, dated recovery notice, exact undo, repeated JSON/CID imports,
failed writes, stable event dedupe and checkpoint restart. The transport tests mock all provider requests and use synthetic
records/credentials. They exercise Desktop save/verification/restore, personal
credential reuse, hosted signed-URL routing, malformed responses, timeouts,
failed writes and last-known-good retention. They are not evidence of a real
Pinata upload, independent pin availability, encryption or reward payment.
The **Validate Snapshot Storage** workflow runs the dependency-free transport
and control tests on Node 24 when related modules change.

Separate isolated Chrome checks use the actual markup/styles and storage
modules with synthetic data and mocked Kubo responses. They cover pointer
activation of the IPFS button, visible connection failure, verified upload,
repeat CID merge, mismatch retention and a 390px local-only sheet. The IPFS
control has its own stacking level so the positioned title cannot intercept it.
These checks do not boot unrelated app scripts or prove full-app startup,
production provider access or complete application layout. They are not part
of the Node CI workflow.
