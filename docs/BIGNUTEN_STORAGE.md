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
- `BIGNUTEN_STORAGE_ALLOWED_ORIGINS`: exact production and local browser origins, comma-separated.

The service exposes:

- `GET /health`
- `POST /api/storage/nonce`
- `POST /api/pinata-upload-url`

Each upload authorization is bound to the wallet, browser origin, a five-minute nonce, an expiry, and a wallet signature. Nonces are single-use. The relay accepts JSON metadata only and enforces a 128 KiB limit.

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
`BigNutenNetworkRegistry.sol`. The registry is configured to use the shared
Settlements Router and the `bignuten-data-rewards` fund, but its address remains
blank in `network-registry.json` until the Base migration deployment.

The intended lifecycle is:

1. An operator registers a node with a node DID hash, peer ID hash, and software version.
2. An administrator approves the node and grants checker wallets `NODE_CHECKER_ROLE`.
3. The administrator publishes a monthly challenge hash.
4. The keeper pins and retrieves a sample of published community CIDs, hashes the retrieval report, and submits a heartbeat or independent checker proof.
5. After 25 independent checks with the 12-hour spacing rule, the operator sees the eligible amount in the community panel and claims through MetaMask.
6. The registry calls the shared router for the `bignuten-data-rewards` fund using a unique work reference.

Local commands are ready for the post-deployment phase:

```sh
npm run network:index
BIGNUTEN_NETWORK_REGISTRY_ADDRESS=0x... BIGNUTEN_NODE_ID=1 npm run network:node -- checker
```

Do not treat a browser-only “I pinned this” claim as proof. Reward eligibility
comes from independent checker transactions and the router’s approved recipient
and funded-fund checks.

## Testing

Run the relay tests with:

```sh
npm run test:storage-relay
```
