# StreakBet rehearsal — NO REAL FUNDS

Before any real stakes, run the escrow lifecycle with synthetic progress and
**fake TEST-BNUT tokens with no value**. This is a separate, clearly labelled
rehearsal surface; it never loads the production app or its wallet adapter.

```sh
npm ci
npm run test:rehearsal          # Hardhat lifecycle and deployment guard
npm run test:rehearsal:browser  # actual local-fork browser transactions + guard checks
npm run rehearsal:serve        # interactive captain / participant / reviewer walkthrough
```

Open the loopback URL printed by `rehearsal:serve`. Click each labelled action;
the captain console and reviewer queue change with the current role.
Pending and confirmed transaction hashes are visible. A failed transaction
blocks the walkthrough: stop and restart rather than retrying a partially
applied action. Stop with Ctrl-C to discard the disposable chain.

The browser runner starts a loopback-only Hardhat source node and forks it into
an isolated in-process Hardhat chain (31337), then deploys fresh mocks and the
real `StreakBetEscrow` implementation. It does **not** fork a public mainnet
or require RPC credentials, faucet funds, a mnemonic, or an injected wallet.
Public testnets are also deliberately blocked: this first rehearsal is local only.

The 14 actions cover create → configure → fake-token approvals/join →
submitReport → schedule four meetups → selfCheckInMeetup →
reviewMeetupAttendance (agreement, dispute, captain guest invitation and
tie-break) → 28 days / four verified meetups → settle → completion and placement
achievement mint. Separate competitions verify cancellation/refund and voluntary
forfeit/no extra achievement. The final action runs the production result
collector against disposable escrow logs and renders a deterministic,
health-minimized local draft with wallet/action events, raw-token payout splits,
chain block timestamps and a content hash. It never uploads or publishes the
draft. It now also creates the pre-settlement manifest in memory, builds the
confirmed final receipt and runs the real `anchorFinalReceipt` transaction,
getter/event/receipt verification using disposable owner authority. Its CIDv1
raw identifiers hash the in-memory canonical document bytes; no storage upload
or public publication occurs. The rehearsal server permits event reads and the
anchor write only on fixture contracts (41 local transactions total).
The shared contract rehearsal verifies tied first-place payouts/mints in the
final receipt, both independent capabilities (payout policy v2, receipt anchor
v1), and rejection of an attempted second anchor. `StreakBetCodeSize.test.js`
reads the existing Hardhat artifact and enforces the EIP-170 deployed-runtime
limit of 24,576 bytes on every `npm test`; the combined source is 24,399 bytes.

## Hard guardrails

- Every action and transaction rechecks chain 31337, independently of ethers'
  network cache. Deployment refuses non-Hardhat networks.
- Fresh fixture contracts and bytecode fingerprints only; addresses from
  `js/contracts.js` and `deployments/base.json` form a **denylist**, never RPC
  connections. No address or network input is offered in the UI.
- No injected wallet requests; only disposable, unlocked local Hardhat accounts.
- Browser RPC proxy binds to loopback, rejects cross-origin requests and unknown
  RPC methods, raw signed transactions, deployments, unknown senders/targets and
  all native value. Token approvals are exactly 10 fake tokens to the fixture
  escrow. Production targets are blocked server-side as well as client-side.
- No Aave pool is configured, yield is disabled, Aave calls are not allowlisted,
  and there are no external scripts, storage uploads or health records.
- Result preview excludes health counts, progress hashes, report CIDs, notes,
  meetup codes and meeting URLs. Its in-memory final receipt CID is not an IPFS
  publication; a separate forfeit scenario retains a synthetic `rehearsal:` CID.
- Never fund these accounts or import their publicly known keys into a wallet.
  This is a developer rehearsal harness, not a production wallet sandbox.

`npm test` includes the shared Hardhat scenario and unit guards.
`npm run test:smoke` includes both the existing dashboard smoke and the real
local-fork browser rehearsal. CI runs both commands; screenshots and the
transaction audit summary are uploaded with the smoke artifacts. A green
rehearsal proves the tested local lifecycle, **not** readiness for real funds or
truth of self-reported attendance.

## Reuse decision

Need: rehearse #352 without a real-funds path. Inspected Canopy's curated
BigNuten offers/needs (storage-oriented; no escrow harness donor), current
issues/PRs, worktrees, and existing repo source. The separate #351 journey
worktree is left untouched.

Adapted this repository's `test/hardhat/StreakBetMeetups.test.js` meetup setup,
`test/hardhat/StreakBetEscrow.scenarios.test.js` cancellation/forfeit assertions,
`contracts/mocks/MockERC20.sol`, `contracts/mocks/MockStreakAwardNFT.sol`, and
`contracts/StreakBetEscrow.sol` at base commit `1a9f37e`. The repo's MIT licence
applies. Reused the existing Playwright dependency, smoke CI and local HTTP
pattern, rather than adding a second toolchain or shared ecosystem package.
The live `scripts/streakbot-live.js` and Base-only UI wallet paths are
intentionally incompatible with a no-real-funds rehearsal and are not called.
Receiving-app validation: the Hardhat and local-fork browser scenarios assert
the same 14 lifecycle/results-preview actions, fake-token accounting, achievement mints, zero
native escrow balance, and rejected production/native/raw-transaction paths.
