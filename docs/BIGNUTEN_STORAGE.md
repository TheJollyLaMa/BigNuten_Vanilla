# BigNuten Storage Layer

BigNuten uses a provider-neutral IPFS data layer:

- **IPFS Desktop** is the direct local provider for users who run Kubo locally.
- **Pinata through the Render relay** is the always-awake onboarding path for users who do not run IPFS Desktop yet.
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

## Privacy and ownership

The relay does not make public IPFS content private. Anyone who learns a CID can retrieve its content. Sensitive health or identity data must be encrypted in the browser before upload, with the decryption key shared only with intended participants. Never put Pinata credentials, private keys, email addresses, or plaintext sensitive records in the repository or an IPFS document.

The community-sharing flow must remain separate from private backup. A user can keep a private snapshot in their own provider and explicitly publish a separate sanitized dataset for community aggregation and BNUT rewards. Sharing a record must be an explicit wallet-confirmed action; the relay must not infer consent from a backup upload.

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
```
