# StreakBet journey: rehearse before committing

The Monthly Streak Challenge dialog contains the wallet-free walkthrough and
simulation. Opening it or expanding examples does not approve tokens, sign,
publish health data, or join. **The separate Join button is live**, subject to
wallet approval. Rehearsal does not turn live contracts into a sandbox.

## Rules and policy boundary

Use the selected challenge's public rules, on-chain configuration and
[StreakBetEscrow](../contracts/StreakBetEscrow.sol) as the rules source.
[Deployment notes](DEPLOYMENTS.md#base-deployment-status) describe the current
pilot, not a promise of future policy. The examples describe source contract
math, not a verified live payout quote. Check the deployed contract/version and
challenge terms before staking; if rules are unavailable or unclear, do not join.

The planned hydration pilot is 28 qualifying days in 30 days, four calls and
at least five qualifying logs per call week. These are configuration values,
not universal health targets. Follow your own care guidance; never force an
activity or fluid intake to protect a stake.

## Stake commitment and refunds

Joining commits your stake: **no participant refund withdrawal before
settlement**, even if you remain eligible to finish. Voluntary `forfeit(compId)`
loses the stake; it is not an exit with a refund. No withdrawal, grace period or
appeal feature is added by this policy clarification.

Only captain (contract owner) cancellation refunds **non-forfeited** entrants,
limited to the actual held balance under the current contract. This is a
separate owner action, not an entrant right to cancel or withdraw.

Final settlement happens after challenge end and owner settlement. It is a
ranked payout, not an early refund or a guaranteed full-principal return;
ranked policy can return less than the full stake. Read the payout explainer
and authoritative deployed rules before joining. The live Join confirmation
discloses these consequences before token approval or ETH/token stake transfer.

## The loop

| Step | Participant | Captain (contract owner) | Guest reviewer |
| --- | --- | --- | --- |
| Commit | Read the listed BNUT stake, rules, deadlines, forfeit consequences and payout explainer before approving/joining. Keep Base ETH for gas. | Choose and publish stake, metrics, dates, meetup goals and award IDs; create/configure before entries. | No stake or enrollment is required; wait for an invitation. |
| Practice | Log an ordinary day's actual activity locally. The app evaluates the selected metrics; it does not prove they occurred. | Make the rules and support route understandable; do not collect raw health records by default. | No access to private logs is implied by the role. |
| Gather | During the scheduled call, review the roster, share only necessary progress, enter the captain's code and truthfully attest to the meetup goal. | Schedule each call, confirm roster and reveal the committed code during the call. | Attend if invited and review only the claim/evidence voluntarily shared. |
| Review | A solo entrant is self-trusted. Otherwise a checked-in peer may confirm or dispute. Self-vote plus peer agreement verifies; disputes need a strict majority after at least three votes. | For tied claims invite a non-entrant guest before the review window ends (call close + 24 hours). The captain does not unilaterally declare attendance true. | Use the invited wallet to confirm/dispute once during the review window. No purchase, stake or medical judgment. |
| Settle | After required activity days and approved meetups, completion becomes eligible for ranking. Wait until challenge end and owner settlement. | After end, settle with the leaderboard CID; verify awards/treasury configuration first. | No settlement authority. |

## Branches to rehearse

- **Ordinary day:** participant records actual activity and checks local progress.
  Captain keeps scheduled calls visible; guest has nothing to do until invited.
- **Missed day:** record reality, do not backfill fabricated evidence. A missed day
  is not an immediate contract forfeit: compare remaining possible days with the
  challenge thresholds and weekly minimum. Captain clarifies the published rules;
  guest must not attest to an activity they did not observe. The contract does not
  offer a make-up, grace period or appeal extension through this walkthrough.
- **Disputed meetup:** participant's self-claim and one rejection produce a tie,
  not completion. Captain invites an outside non-entrant; guest votes within the
  review window. Strict rejection majority disqualifies; strict approval majority
  credits attendance. An unresolved tie does not count as an approved meetup;
  there is no automatic deadline extension.
- **Forfeit:** a joined, not-yet-completed participant can call the contract's
  `forfeit(compId)` while active; this walkthrough does not send that transaction.
  It is irreversible in the current contract and returns no stake at settlement.
  Missing completion also yields no settlement payout. Captain cannot promise a
  private refund from the winners' pot. Guest has no refund authority.
- **Cancellation:** only the contract owner can cancel an active challenge.
  Contract cancellation refunds non-forfeited entrants, limited to the actual
  held balance (including any Aave withdrawal rounding); no rank bonus or
  completion award is issued.
  The current app only exposes cancellation for expired empty challenges, not a
  participant withdrawal/cancellation button. Captain must use an appropriate
  reviewed owner workflow for other cancellations; guest cannot cancel.
- **Successful finish:** participant reaches the configured totals and approved
  meetups, then receives the settlement payout and configured achievement awards.
  Captain settles only after end. Ranking is activity days descending, reports
  descending, qualification time ascending, then join index ascending. Guest
  attestation is not a guarantee of rank, payout or improved health.

## Payout explainer

See the [generated exact examples](STREAKBET_PAYOUT_EXAMPLES.md) for 1, 2, 3 and
5 entrants, with forfeits and zero-completer cases. Rebuild with
`npm run docs:streak-payouts`; `npm test` checks reproducibility and actual local
contract transfers. The same integer model supplies the in-app examples.

Full principal is the starting refund for finishers except third place, whose
starting refund is half (rounded down). The remaining pot is shared by weights
3:2:1 for the top three and 1 for every additional finisher. Thus third place
can lose principal **even when everyone finishes**; completion is not a
principal guarantee. Unsuccessful entrants receive zero; if nobody completes,
the entire pot goes to the configured treasury. Integer dust also goes there.
This is deterministic ranking, not a lottery or investment return.

## Privacy and evidence

**Self/peer attestations and hashes are not medical proof or cryptographic proof
that an activity occurred.** On-chain records include wallets, activity counts,
hashes, votes, invitations, stakes and payouts. Raw health details stay local
unless explicitly shared/published, but screen-sharing also discloses them.
Public IPFS publication is optional, wallet-linked and may persist indefinitely;
do not upload diagnoses, identifying records or third-party health data merely
to resolve a dispute. A guest invitation grants no right to those records.
By default, the check-in submits a summary commitment and a `WeeklyReport` event
with an empty CID; the commitment excludes raw activity records. Uploading the
detailed progress JSON requires both the opt-in checkbox and a confirmation
before the public upload. The on-chain aggregate itself is still public and can
reveal information about a participant.

## Asset and acceptance boundaries

The source contract represents native ETH with the zero address and ERC-20
stakes in each token's raw units. Join uses exact `msg.value` for ETH and
`transferFrom` for ERC-20; token `decimals()` is used only for display and input
conversion. Each competition records its own asset and pot. Owner configuration
must pair an ERC-20 with a treasury reporting that same token; native ETH needs
a payable treasury receiver. The browser does not hardcode a USDC address or
USD conversion. Current local tests rehearse ETH, 18-decimal ERC-20 and
6-decimal ERC-20 paths without a live network or real funds.

For issue #161, these existing-source semantics remain a policy boundary:

- The steward-approved interpretation of the withdrawal wording is stake
  commitment, not an early-refund feature: no participant refund withdrawal
  before settlement, voluntary forfeit loses the stake, and owner-only
  cancellation refunds non-forfeited entrants subject to actual held balance.
  Finisher payouts occur only after challenge end and owner settlement and are
  not a guaranteed full-principal return. This clarification changes no
  contract economics and does not close #161: live verification and its other
  acceptance criteria remain open.
- Third place starts with half principal, not a full principal refund. This
  conflicts with issue #161's blanket refund wording. The current source math is
  verified behavior, not an approved replacement policy, so this implementation
  preserves it and leaves that acceptance criterion unresolved for steward
  review rather than changing payout economics.
- The new asset/configuration behavior is source-only. It does not update
  deployed addresses or configure a live treasury; no live BNUT, USDC or ETH
  support is claimed until a separately reviewed deployment/configuration
  exists.
- Join, report, completion, forfeit and settlement state is tracked by the
  contract's view functions and events. Full archive/export and administrative
  result presentation are separate coordinated work and are not claimed by
  this engine change.

## Source versus deployed contract compatibility

The source in this branch reports `competitionEngineVersion() == 2`. The
currently configured Base address is **not assumed to implement that getter**;
an absent/reverting getter means the UI treats version-2-only features as
unavailable. The UI does not probe by sending a transaction. Flexible
`setChallengeAsset` configuration, native-ETH streak enrollment, and adding a
weekly report after an entrant is already `Completed` require verified version
2. They remain unavailable on the current Base deployment unless a read-only
capability query proves otherwise. This PR does not deploy, change a production
address, or enable them through client configuration.

The current BNUT path remains usable against the existing Base interface:
existing challenge token/treasury configuration, BNUT challenge creation and
join, and weekly reports while the entrant is still `Joined` use the existing
methods. Version-2 asset controls are visibly disabled when unsupported and
the handler checks again before requesting a signer. A native-ETH join on a
legacy deployment is stopped before wallet signing.

Check-in and report are separate transactions, not atomic. After every
transaction the participant handler rereads `meetupAttendance` and
`getStreakEntrant`; it reports success only after both check-in and the
week-ordered `reportsSubmitted` count are confirmed. If check-in mined but
report failed, retry sees the confirmed check-in, skips it, and submits only the
missing report with an empty optional proof CID; it does not re-upload or
re-associate any optional public snapshot from the failed attempt. If the report
count already covers that week, retry sends neither transaction. A gap in
earlier report numbers is surfaced rather than
filled with invented reports. On legacy deployments, an already-completed
entrant with a missing report, or a solo check-in that would complete before
its final report, is blocked before signer access with an explicit compatibility
message; a previously mined check-in is never presented as a complete
check-in-and-report success.

The disposable local Hardhat fixture exercises version 2 and its post-completion
report path. This proves source behavior only, not current Base compatibility.

## Live results, archives and publication boundary

The results panels read the configured chain and present live action history as
**not final**; completed archives show only actions and accounting present in
contract events. Event timestamps come from their block headers. The browser
checks the selected chain ID, escrow address/code, event identities, block
hashes/timestamps, and the result document's deterministic SHA-256 content
hash. This is RPC-backed evidence, not independent verification of deployed
bytecode or a promise that an RPC is trustworthy.

The public pre-settlement manifest is deliberately minimal: competition ID/name
and a sanitized rules CID (cycle/source markers are omitted), chain/escrow/token
identifiers and schedule, participant wallets, action type, event
transaction/block/log identity and chain timestamp, and the canonical document
hash. It excludes activity counts, raw health values, progress hashes,
report/proof CIDs, notes, meetup codes and meeting URLs. The exact payload and
field list are shown in the preview and confirmation before an explicit IPFS
upload. A local export is not a publication; upload success without CID
readback and matching content hash is unavailable, not verified. No upload is
automatic.

The captain must separately submit the settlement transaction with the
uploaded manifest CID. The app checks current owner, selected network, escrow
code, active/unpaused status, end time, complete event history and configured
achievement readiness; it then distinguishes pending from confirmed receipts
and verifies the `CompetitionSettled` CID against that manifest. The local
award metadata record is not proof of the contract's private snapshotted token
IDs; those IDs are confirmed only when settlement mint logs match the manifest
and payout recipients. Award templates do not fabricate token URIs; a metadata
CID is included only when the ERC-1155 `uri(tokenId)` read returns a concrete
`ipfs://` CID at the inspected block. Unreadable or unsupported URIs remain
unavailable. The flow does not change contract payout math.

The manifest has to exist before the settlement transaction so its CID can be
included in the existing `CompetitionSettled` event. Therefore it cannot
contain that transaction's own hash, final `StreakPayout` amounts or subsequent
`EditionMinted` logs. After confirmation the app derives a separate local
settlement receipt from chain payout/mint logs, cross-links it to the manifest,
and offers local export plus a separate explicit upload. That second receipt
CID is **not recorded on-chain**; readers verify its hash and each event
reference against the settlement transaction and chain. Missing NFT logs or
metadata are reported unavailable; local award templates are aids, not proof
of the private per-competition contract snapshot. The local rehearsal exercises
the real event collector with disposable contracts, but never uploads or
publishes either document.

### Engine/deployment compatibility and settlement routes

The results readers use the existing competition getters and result events; they
do not require `competitionEngineVersion()` to display or settle an existing
competition. The #379 version gate belongs to engine-owned actions such as
flexible asset setup and the safe check-in/report retry flow. If a selected
deployment lacks a required getter, event, complete history, or matching
contract code, results are shown as unavailable and settlement is blocked. The
Base deployment record identifies the current escrow address and its recorded
configuration, but source/deployment notes are not a live check that the
address has #379's latest engine version.

The mounted monthly-challenge settle button is intercepted in document capture
and routed through the consent, owner, network, history, and prerequisite
checks; a browser smoke test confirms the older delegated settle handler is not
reached. Generic legacy competitions use their own admin settle control but
still pass through the same guarded publication and owner/history flow; they
are not monthly challenges and therefore have no award-mint prerequisite.
Standalone historical scripts are separate developer flows, are not mounted
app controls, and do not inherit these UI guardrails.

For a configured monthly challenge, preflight also requires the local award
record's four token IDs/NFT address to match the currently exposed global
getters, and the competition's stake token to match the current global
challenge asset. A mismatch or missing getter blocks settlement rather than
assuming an old competition uses today's settings. The current treasury's
code and NFT minter role are checked, but there is no public per-competition
treasury/award snapshot getter (and `setStreakAwards` has no change event).
Therefore even matching current values are **not proof** of the private
snapshot; an older competition after global reconfiguration may remain
unverifiable. Do not repair that state by substituting current IDs or treating
the local record as authoritative.

## Unresolved product decisions (not defaults)

The captain still chooses the live entry stake and schedule; examples do not set
them. USD conversion, swaps, yield/borrowing and any future grace/appeal or payout
policy changes require separate review. The current BNUT pilot has no Aave
yield or automatic USD quote. A future policy must be published and reconciled
with deployed contract behavior before enrollment, not inferred from rehearsal
values. No deployment, token transfer or new economic policy is introduced here.
