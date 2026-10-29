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
  Contract cancellation refunds each entrant's stake (subject to held balance if
  Aave withdrawal rounding occurs); no rank bonus or completion award is issued.
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

- Finisher payouts are made only when the owner settles after the competition
  ends; there is no participant withdrawal before settlement. Cancellation is
  owner-only and refunds entrants.
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

## Unresolved product decisions (not defaults)

The captain still chooses the live entry stake and schedule; examples do not set
them. USD conversion, swaps, yield/borrowing and any future grace/appeal or payout
policy changes require separate review. The current BNUT pilot has no Aave
yield or automatic USD quote. A future policy must be published and reconciled
with deployed contract behavior before enrollment, not inferred from rehearsal
values. No deployment, token transfer or new economic policy is introduced here.
