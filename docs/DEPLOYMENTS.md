# BigNuten Contract Deployments

BigNuten defaults to **Base Mainnet** (Chain ID `8453`). The BNUT token and six application contracts are deployed on Base. Optimism deployments remain documented as legacy records; new app flows use Base.

---

## Base Mainnet (default)

### $BNUT ERC-20 Token

| Field | Value |
|---|---|
| **Address** | [`0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736`](https://basescan.org/token/0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736) |
| **Symbol** | BNUT |
| **Decimals** | 18 |
| **Max supply** | 1,000,000,000 BNUT |
| **Network** | Base Mainnet |
| **Explorer** | https://basescan.org/token/0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736 |

### Base deployment status

| Contract | Address | Current configuration |
|---|---|---|
| BigNuten ($BNUT) | [`0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736`](https://basescan.org/token/0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736) | Existing token, reused |
| BigNutenTreasury | [`0x9aC977ED07953B97575CdE424C9bb67b53D9D09E`](https://basescan.org/address/0x9aC977ED07953B97575CdE424C9bb67b53D9D09E) | Deployed with Base BNUT |
| BigNutenGov | [`0x9c9AE39400b9c723Dd395211aB643EAC3dFBFC5a`](https://basescan.org/address/0x9c9AE39400b9c723Dd395211aB643EAC3dFBFC5a) | Deployed with Base BNUT |
| BigNutenNetworkRegistry | [`0x0670B43b689D51Fd04741b52507D4f87c24A5E75`](https://basescan.org/address/0x0670B43b689D51Fd04741b52507D4f87c24A5E75) | Deployed; node reward router/fund roles remain separate setup |
| StreakBetEscrow (current) | [`0xFfd8453Ee3b2fF62DC2132Dd59a42F9f50447C95`](https://basescan.org/address/0xFfd8453Ee3b2fF62DC2132Dd59a42F9f50447C95) | Adaptive review v2; BNUT/Treasury wired; IDs 0–3 configured; Aave disabled |
| StreakBetEscrow (retired) | [`0x53CEF3c2511bd648DC104aF8e593b01895A35614`](https://basescan.org/address/0x53CEF3c2511bd648DC104aF8e593b01895A35614) | Paused, no competitions created, MINTER_ROLE revoked |
| DecentNFT | [`0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B`](https://basescan.org/address/0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B) | Collection URI and hydration award IDs 0–3 configured |
| DecentEscrow | [`0x31b07b83e99A9bdF379bf40225b8A80d3804C89d`](https://basescan.org/address/0x31b07b83e99A9bdF379bf40225b8A80d3804C89d) | Deployed; subscription plans and DNFT listings not configured |

The deployment table is a repository record, not a live RPC verification of
current bytecode or configuration. The mounted competition results and
settlement UI reads the existing escrow ABI and does not require the new
`competitionEngineVersion()` gate to show or settle existing competitions.
Engine-owned asset configuration and participant check-in/report actions do
use that gate. Result history or settlement prerequisites that cannot be read
are explicitly unavailable and block the app flow.

Ranked payout ties use a separate read-only `streakPayoutPolicyVersion()`
capability. This source reports policy version 2; an absent or reverting getter
is treated as legacy strict ranking, including on the currently configured
Base deployment unless independently verified otherwise. The new source does
not make the tie policy live, change `competitionEngineVersion()`, or update
deployment configuration.

Challenge settlement preflight compares the local four-ID award record and
competition stake asset with the escrow's current public award/asset getters,
and checks the current treasury code and NFT minter role. The per-competition
treasury and award-ID snapshot is private; matching current settings do not
prove that an older competition captured those same values. A detectable
configuration mismatch blocks settlement; an unverifiable historical snapshot
must remain unavailable rather than be inferred from today's globals. See the
[results and publication boundary](STREAKBET_JOURNEY.md#engine-deployment-compatibility-and-settlement-routes).

StreakBetEscrow is the single reusable engine for hydration, nutrition,
exercise, weight, and future meetup challenges. The replacement contract
includes solo self-verification, peer agreement, majority resolution after
disputes, and captain-approved no-stake guest reviewers. The deployment manifest
is `deployments/base.json`; BigNuten’s Base app config points to the replacement.

The original Base deployment command (already run) is:

```sh
npm run deploy:base
```

It preflights chain ID `8453`, reuses the existing Base BNUT token, deploys the
contracts listed above, and writes `deployments/base.json`. The replacement
StreakBet-only deployment command is `npm run redeploy:base:streak`; it preserves
the other five deployed application contracts, pauses the retired engine, moves
the minter role, and updates the Base address in the manifest and app config.
Aave remains disabled.

The planned first monthly activity challenge uses this shared contract: 28 qualifying
app-tracked days in a 30-day period plus four weekly meetups. The captain
schedules each one-hour call and reveals its committed invite code during the
call. Attendees self-check in and attest to the shared meetup goal. A solo
entrant’s logs are trusted; with multiple entrants, self-claims and peer votes
are recorded. Disputes require a strict majority after at least three votes; the
captain can invite outside, no-stake guests to break ties. Logs remain local and
peer-reviewed, not cryptographically proven. A majority rejection disqualifies
that entrant. At owner-called settlement, every completed participant receives
a completion Achievement DNFT; completed participants sharing competition
places one through three receive the award for their common place. The mint
happens at settlement, not at competition start. Forfeited or still-incomplete
entrants receive no awards; cancellation refunds non-forfeited entrants and
mints no awards. If no one completes, the configured treasury receives the pot
and no awards are minted. A mint failure reverts the entire settlement
transaction, including payouts and status changes.

Completed participants receive ranked payouts. The source-only version-2
policy ties equal verified qualifying activity-day and submitted-report counts;
qualification time and join order do not break ties. Each tie group pools the
existing base refunds and bonus shares of its occupied slots, then receives an
equal integer split. It retains half principal at the occupied third slot,
the original 3:2:1 weights and weight 1 thereafter, forfeit contributions, and
the treasury dust route. Legacy contracts without the policy capability keep
strict ordering; the current deployment has not been changed. This is
deterministic leaderboard settlement, not a random lottery. The stake is an
exact BNUT amount because no liquid BNUT/USD market exists for an automatic $5
quote.

Before enrollment, use the [participant/captain/guest journey](STREAKBET_JOURNEY.md)
and [generated payout simulations](STREAKBET_PAYOUT_EXAMPLES.md). These explain
source contract behavior (including third-place principal risk and treasury
rounding dust), not a live quote or a newly selected stake.

Hydration award metadata is published to Pinata and local IPFS. DecentNFT IDs
`0–3` are registered with unlimited supply and assigned to the current
StreakBet. They are reserved for the first hydration challenge. Every later
competition needs a fresh consecutive group of four IDs so its completion and
placement metadata are unique. Awardees in the same competition share each
ERC-1155 ID. The award JSON uses the BigNuten favicon at its verified GitHub
Pages URL because the currently deployed Render relay still allows JSON only;
the local relay source supports image MIME types, but its Render deployment must
be updated before media can also be pinned to Pinata. The captain still needs to
choose the entry stake and schedule challenge/meetup times before creating the
first competition.

`js/competitionAwards.mjs` provides an allowlisted, local-only metadata preview
and device-local competition templates; details are in
[`competition-achievement-awards.md`](competition-achievement-awards.md).
Previewing does not upload metadata or reserve IDs. The administrator must
publish each four-file metadata batch and register it in the existing DecentNFT
before configuring that competition. Reuse the current DecentNFT deployment;
no new ERC-721 is needed. The awards/template helper does not perform those
privileged operations.

For a future competition, publish and register its four metadata records with
token IDs starting at the actual next unused DecentNFT ID before creating the
competition or opening enrollment. Set the minter role and select that unique
range before challenge creation:

```sh
STREAK_AWARD_FIRST_ID=4 npm run metadata:publish -- metadata/next-competition-awards
STREAK_AWARD_FIRST_ID=4 npm run configure:base:streak-awards
```

`4` is only an example for the case where IDs `0–3` are the only registered
tokens. Before each later batch, use the actual DecentNFT `nextTokenId`; do not
assume the next range is four IDs beyond the last award if other tokens were
registered in the shared collection.

The publisher writes `deployments/decent-metadata-cids.json`. The Base-only
setup script checks that file, registers the selected four IDs as unlimited
Achievement tokens, grants the current StreakBet `MINTER_ROLE`, and configures
the completion/placement IDs. Run the existing owner configuration for each
competition before `configureStreakChallenge`; the escrow snapshots those IDs
for that challenge. It refuses to proceed if the signer or existing IDs do not
match. Registration prepares token metadata; it does not mint participant
awards. No deployment, publication, or wallet transaction is part of the
metadata/template feature or its local tests.

Base Aave supports USDC but not BNUT, and no BNUT/USDC pool was found during
preparation. Therefore the pilot does not swap or earn Aave yield; conversion,
yield, and borrowing need a separately reviewed strategy after a liquid pool
exists. The deployment script does not fund router allocations or configure
community registry roles automatically.

The shared Settlements Router is already deployed on Base at
`0x8ecca903e2a6Daa8CCbB933700e4F2C58C44A4B5`. The deployed
`BigNutenNetworkRegistry` uses the separate `bignuten-data-rewards` fund for
community-node replication rewards; that fund and the Registry payroll role
remain unconfigured. User health-data incentives use a separate
`bignuten-health-data-rewards` fund. Its router record is active but currently
has no BNUT allocation, so health-data payouts stop safely until it is funded.

The app now uses the replacement Base StreakBet address. Hydration award
metadata, IDs, and minter permissions are configured. The first challenge still
needs its stake and meetup schedule; DecentEscrow plans/listings and registry
node-reward roles also remain to be configured. The Optimism addresses below are
legacy records, not the default user flow.

---

## Optimism Mainnet (fallback / legacy)

### BigNutenTreasury.sol

| Field | Value |
|---|---|
| **Address** | [`0x143cC41AC075FFA40be1993827DA6ffB4638A363`](https://optimistic.etherscan.io/address/0x143cC41AC075FFA40be1993827DA6ffB4638A363) |
| **Network** | Optimism Mainnet |
| **Deployed by** | `@TheJollyLaMa` |
| **Deploy date** | 2026-03-19 |
| **Constructor** | `_token = 0x733c4d2Aae900E608147dd89Fa93606f89722823` (Optimism BNUT), `initialOwner = deployer wallet` |
| **Explorer** | https://optimistic.etherscan.io/address/0x143cC41AC075FFA40be1993827DA6ffB4638A363 |

#### Funding / Mint Steps

1. **Mint $BNUT to yourself** — In the Admin Panel → Treasury → ⚡ Quick Mint (Admin), enter your wallet address, amount, and reason. Caller must hold `MINTER_ROLE` on the Optimism BNUT contract.
2. **Transfer $BNUT into the Treasury** — After minting, send the tokens to the treasury address:
   ```bash
   cast send $BNUT_ADDRESS \
     "transfer(address,uint256)" \
     0x143cC41AC075FFA40be1993827DA6ffB4638A363 \
     <amount_in_wei> \
     --private-key $PRIVATE_KEY \
     --rpc-url https://mainnet.optimism.io
   # 1 BNUT = 1000000000000000000 wei  (18 decimals)
   ```
3. **Settle Payroll** — Open Admin Panel → Payroll, switch the app network dropdown to Optimism, connect MetaMask as owner, and click **Settle All Pending**.

### $BNUT ERC-20 Token

| Field | Value |
|---|---|
| **Address** | [`0x733c4d2Aae900E608147dd89Fa93606f89722823`](https://optimistic.etherscan.io/token/0x733c4d2Aae900E608147dd89Fa93606f89722823) |
| **Symbol** | BNUT |
| **Decimals** | 18 |
| **Max supply** | 1,000,000,000 BNUT |
| **Network** | Optimism Mainnet |

### BigNutenGovernance

| Field | Value |
|---|---|
| **Address** | [`0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD`](https://optimistic.etherscan.io/address/0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD) |
| **Network** | Optimism Mainnet |

### DecentEscrow (BigNutenEscrow)

| Field | Value |
|---|---|
| **Address** | [`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) |
| **Version** | v0.1 |
| **Network** | Optimism Mainnet |
| **Plans** | Plan 0 = ETH monthly, Plan 1 = $BNUT discounted monthly |

### StreakBetEscrow

| Field | Value |
|---|---|
| **Address** | [`0x80f6492eFD6D27c877B2bd0936451f7AF61c7215`](https://optimistic.etherscan.io/address/0x80f6492eFD6D27c877B2bd0936451f7AF61c7215) |
| **Network** | Optimism Mainnet |
