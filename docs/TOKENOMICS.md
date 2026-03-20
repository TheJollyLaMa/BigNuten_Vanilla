# BigNuten Tokenomics — v2.0.0

> **Token:** BigNuten | **Symbol:** $BNUT | **Decimals:** 18 | **Network:** Optimism Mainnet

---

## Table of Contents

1. [Overview](#overview)
2. [Token Details](#token-details)
3. [Supply & Inflation](#supply--inflation)
4. [Subscription Tiers](#subscription-tiers)
5. [Contributor Bounty System](#contributor-bounty-system)
6. [Payroll Queue & Settle Cycles](#payroll-queue--settle-cycles)
7. [Governance](#governance)
8. [Data Sharing Rewards](#data-sharing-rewards)
9. [Admin Mints](#admin-mints)
10. [Smart Contracts](#smart-contracts)
11. [Deployment Steps](#deployment-steps)
12. [Roadmap Status](#roadmap-status)

---

## Overview

$BNUT is the native utility and governance token of the **BigNuten** fitness ecosystem. It aligns the interests of users, contributors, and the platform by rewarding participation, funding development, and enabling community governance.

As of v2.0.0, $BNUT is **live on Optimism Mainnet** and actively used for:

- Contributor bounty payouts via `BigNutenTreasury`
- Discounted subscriptions (vs paying with ETH or fiat) via `DecentEscrow`
- Data-sharing rewards (opt-in fitness data contributions)
- Governance voting on platform decisions
- Admin mints for test distributions and ecosystem seeding

---

## Token Details

| Property | Value |
|---|---|
| Name | BigNuten |
| Symbol | $BNUT |
| Decimals | 18 |
| Standard | ERC-20 |
| Network | Optimism Mainnet (Chain ID: 10) |
| Contract | [`0x733c4d2Aae900E608147dd89Fa93606f89722823`](https://optimistic.etherscan.io/token/0x733c4d2Aae900E608147dd89Fa93606f89722823) |
| Max Supply | 1,000,000,000 BNUT (1 billion) |
| Mintable | Yes — `MINTER_ROLE` only (owner / treasury-authorised wallet) |
| Burnable | Yes — any holder can burn their own tokens |

---

## Supply & Inflation

### Max Supply

The $BNUT token has a **maximum supply of 1,000,000,000 BNUT**. Tokens are minted on-demand by wallets holding `MINTER_ROLE` — there is no fixed initial mint. This approach allows the ecosystem to grow supply in line with actual activity (bounties, rewards, liquidity) rather than front-loading all tokens.

### Planned Allocation

| Category | % of Max | Amount (BNUT) | Purpose |
|---|---|---|---|
| Treasury / Ecosystem Fund | 50% | 500,000,000 | Bounties, contributor rewards, partnerships |
| Data Sharing Rewards | 20% | 200,000,000 | Opt-in health/fitness data sharing incentives |
| Team & Advisors | 15% | 150,000,000 | Vested over 24 months (to be implemented) |
| Community Reserve | 10% | 100,000,000 | Governance-controlled community fund |
| Initial Liquidity | 5% | 50,000,000 | DEX liquidity pool seeding |

> Allocations are guidance only. The community can vote to adjust distribution via governance proposals.

### Inflation Model

- New tokens are **only minted when a `MINTER_ROLE` wallet calls `mint()`** on the ERC-20 contract.
- `MINTER_ROLE` is held by the deployer (`@TheJollyLaMa`) and can be granted to the treasury contract or a multisig.
- Mints are traceable on-chain via `Transfer` events from the zero address.
- The Admin Panel → $BNUT Admin → Quick Mint UI provides a human-readable mint interface for the owner.

---

## Subscription Tiers

BigNuten offers multiple payment methods. Paying with $BNUT provides a discount over ETH or fiat.

### Monthly Subscription

| Plan | Payment Method | Price | Duration |
|---|---|---|---|
| Fiat — PayPal | USD (PayPal) | $9.99 / month | 30 days |
| Fiat — Stripe | USD (Stripe) | $9.99 / month | 30 days |
| Crypto — ETH | ETH via MetaMask | ~0.01 ETH | 30 days |
| Crypto — $BNUT | BNUT via MetaMask | 500 BNUT | 30 days |

### How Subscriptions Work

Subscription management is handled by the **DecentEscrow** contract on Optimism Mainnet:
[`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e)

Plans are pre-created by the owner via Admin Panel → Escrow Admin → Create Plan:

| Plan ID | Payment Token | Plan Name |
|---|---|---|
| 0 | ETH | BigNuten Monthly ETH |
| 1 | $BNUT (ERC-20) | BigNuten Monthly BNUT |

**Flow:**
1. **Fiat (PayPal / Stripe):** User pays via payment SDK; on-chain status is tracked via `BigNutenSubscription` contract.
2. **ETH:** User clicks **Ξ Pay with ETH** in subscription modal → app reads live plan price from DecentEscrow → calls `subscribe(planId=0)` with ETH value via MetaMask.
3. **$BNUT (discounted):** User clicks **Pay with $BNUT** → app reads plan 1 price → checks BNUT balance → requests `approve()` → calls `subscribe(planId=1)` on DecentEscrow.

Active subscription status is checked on-chain via `isSubscribed(planId, address)` on DecentEscrow.

Full guide: [`docs/BNUT_SUBSCRIPTION.md`](BNUT_SUBSCRIPTION.md)

---

## Contributor Bounty System

The bounty system rewards open-source contributors for closing GitHub issues.

### How It Works (v2.0.0)

1. The repo owner runs **Actions → Bounty Label → Run workflow** to add a label like **`bounty: 500 BNUT`** to an issue.
2. When the issue is assigned, the **Bounty Bot** (`.github/workflows/bounty-bot.yml`) posts a reward announcement comment.
3. The contributor opens a PR that closes the issue (`Closes #N` in the PR body).
4. When the PR is merged, the **Bounty Bot** automatically:
   - Appends a correctly-formatted entry to `payroll-queue.json` (in the `pending[]` array).
   - Increments `bnutPending` and records the issue in `issuesClosed` in `contributor-accounts.json`.
   - Posts a confirmation comment on the closed issue.
5. Once queued, payouts are settled via the [BigNuten app](https://thejollylama.github.io/BigNuten_Vanilla/) **Admin Panel → Payroll**.

> ⚠️ **Whitelist required:** Only contributors registered in `contributor-accounts.json` by `@TheJollyLaMa` can receive $BNUT payouts.

### Bounty Tiers

| Complexity | Suggested Bounty |
|---|---|
| Documentation | 100–250 BNUT |
| Bug Fix | 250–500 BNUT |
| Feature (small) | 500–1,000 BNUT |
| Feature (large) | 1,000–5,000 BNUT |
| Audit / Security | 5,000+ BNUT |

### Applying a Bounty Label (Maintainers)

**Option A — GitHub Actions UI (recommended):**
1. Go to **Actions → Bounty Label → Run workflow**.
2. Enter the issue number and BNUT amount.
3. The workflow creates the label (if new) and posts an announcement comment.

**Option B — Manual:**
Create a label following the format `bounty: <amount> BNUT` (e.g. `bounty: 500 BNUT`) and apply it to the issue.

---

## Payroll Queue & Settle Cycles

### The Queue

`payroll-queue.json` is the off-chain ledger that tracks all $BNUT payouts.

```jsonc
{
  "pending": [
    {
      "issueRef": "TheJollyLaMa/BigNuten_Vanilla#45",
      "contributor": "0xABC...",
      "contributorGithub": "octocat",
      "amount": "500",
      "queuedAt": "2026-03-20T12:00:00.000Z",
      "queuedBy": "bounty-bot"
    }
  ],
  "settled": [
    {
      // same fields as pending, plus:
      "settledAt": "2026-03-20T18:00:00.000Z",
      "settledBy": "TheJollyLaMa",
      "txHash": "0x..."
    }
  ]
}
```

### Settle Cycle

A **settle cycle** is the process by which the admin moves entries from `pending[]` → `settled[]` after paying contributors on-chain.

**Steps:**
1. The admin opens the BigNuten app and connects MetaMask as the owner wallet.
2. Admin Panel → Payroll → **Settle All Pending** triggers `batchPayContributors()` on `BigNutenTreasury`.
3. Each pending entry becomes one `payContributor(address, issueRef, amount)` call in the batch.
4. MetaMask signs and broadcasts the transaction on Optimism.
5. `ContributorPaid(contributor, issueRef, amount)` events are emitted on-chain.
6. After confirmation, the admin runs **Actions → Settle Payroll → Run workflow** (`.github/workflows/settle-payroll.yml`), providing:
   - A comma-separated list of `issueRef` values to settle
   - Optionally: the on-chain `txHash` for the payout transaction
7. The workflow moves matched entries from `pending[]` to `settled[]`, adds `settledAt`, `settledBy`, and the optional `txHash`, and commits the updated file.

### Double-Pay Guard

`BigNutenTreasury.sol` includes an `issuePaid` mapping that **prevents the same issue reference from being paid twice**. If a payout for `"TheJollyLaMa/BigNuten_Vanilla#45"` has already been executed on-chain, a second call will revert. This is independent of the off-chain queue state.

View helpers on the contract:
- `getTotalPaid(address)` — cumulative BNUT paid to a contributor
- `isIssuePaid(string)` — whether an issue ref has already been settled on-chain

### Contributor Accounts

All registered contributors are tracked in `contributor-accounts.json` at the root of the repository.

| Field | Description |
|---|---|
| `github` | GitHub username |
| `displayName` | Human-readable name |
| `role` | `owner` or `contributor` |
| `walletAddress` | Optimism Mainnet address for $BNUT payouts |
| `bnutEarned` | Cumulative BNUT received (updated by owner after each settle cycle) |
| `bnutPending` | BNUT queued but not yet settled (incremented by Bounty Bot on PR merge) |
| `issuesClosed` | List of issue references credited to this contributor |

> Wallet addresses are registered by the maintainer — contributors should never open PRs to self-register. See [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## Governance

BigNuten uses simple on-chain governance via the `BigNutenGov` contract on **Optimism Mainnet**.

### Model

- **Voting**: 1 wallet = 1 vote
- **Eligibility**: Must hold ≥ 1 $BNUT token to vote
- **Proposers**: Only wallets with `PROPOSER_ROLE` (DNFT holders granted by the admin) can create proposals
- **Admin veto**: `DEFAULT_ADMIN_ROLE` (`@TheJollyLaMa`) has final say — can `enact` or `veto` any finalised result
- **No auto-execution**: All outcomes are advisory — the admin confirms and acts

### Contract

| Field | Detail |
|---|---|
| Contract | `BigNutenGov.sol` |
| Address (Optimism) | [`0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD`](https://optimistic.etherscan.io/address/0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD) |
| $BNUT Token | `0x733c4d2Aae900E608147dd89Fa93606f89722823` |
| Min BNUT to vote | 1 $BNUT |
| Default voting window | 7 days |

### How It Works

1. **Any $BNUT holder** can view active proposals in the Governance modal (🗳️ in the ⚕️ dropdown).
2. **DNFT holders** with `PROPOSER_ROLE` can create proposals via the in-app form.
3. **$BNUT holders** (≥ 1 token) cast one vote per proposal — YES or NO.
4. After the deadline, **anyone** can call `finalizeProposal()` (or the admin does it via the admin panel).
5. **The admin** reviews the tally and marks the proposal as `Enacted` or `Vetoed` with a public note.

### What Can Be Voted On

- Feature prioritisation and product roadmap
- Prize pool and payout rate changes
- Community data use policies
- Token reward rates for contributors
- Protocol parameter changes (e.g. quorum, voting duration)

---

## Data Sharing Rewards

BigNuten users can opt in to share anonymised fitness and health data with the community. In return, they earn $BNUT from the **BigNutenTreasury** contract.

### Privacy Guarantees

- Data is **aggregated and anonymised** — individual records are never exposed.
- Users can **revoke consent at any time** via the in-app Data Pool tab.
- No personal identifiers (name, email, wallet address) are linked to shared data.
- Opt-in state is stored in browser `localStorage` only.

### Earning $BNUT via Data Sharing

| Action | Reward (BNUT) |
|---|---|
| Initial opt-in | 50 BNUT |
| Weekly data contribution | 25 BNUT |
| 1-month sharing streak bonus | +100 BNUT |
| 3-month sharing streak bonus | +500 BNUT |

### Payout Flow

1. User enables data-sharing toggles in the **Data Pool** tab.
2. The app records the opt-in timestamp locally and calculates earned BNUT based on streak length.
3. The user clicks **"Request $BNUT Reward"** to register their wallet for the next batch payout.
4. The Treasury owner calls `batchRewardDataSharing()` on `BigNutenTreasury` to settle pending requests.
5. Each payout emits a `DataSharingRewarded(user, amount, ref)` event — traceable on Optimism.
6. On-chain reward history is shown in the Data Pool tab when the user's wallet is connected.

---

## Admin Mints

The owner (and any wallet granted `MINTER_ROLE`) can mint $BNUT at any time via:

### Admin Panel → $BNUT Admin → Quick Mint

- **Recipient address** — who receives the minted tokens
- **Amount** — how many $BNUT to mint (whole tokens)
- **Reason** — free-text label for auditability (emitted in the `Mint` transaction notes)
- **Mint-to-Treasury** checkbox — if checked, the tokens are sent directly to the BigNutenTreasury contract instead of the recipient

### CLI (Hardhat)

```bash
npx hardhat run scripts/payContributor.js --network optimism
```

### On-Chain Verification

All mints produce a `Transfer` event from the zero address (`0x000...000`) to the recipient. These are visible on Optimistic Etherscan under the $BNUT token contract's **Events** tab.

---

## Smart Contracts

| Contract | File | Address | Purpose |
|---|---|---|---|
| BigNuten (ERC-20) | `contracts/BigNuten.sol` | [`0x733c…2823`](https://optimistic.etherscan.io/token/0x733c4d2Aae900E608147dd89Fa93606f89722823) | $BNUT token |
| BigNutenTreasury | `contracts/BigNutenTreasury.sol` | [`0x143c…363`](https://optimistic.etherscan.io/address/0x143cC41AC075FFA40be1993827DA6ffB4638A363) | Holds reserves; pays contributors and data-sharing rewards |
| BigNutenSubscription | `contracts/BigNutenSubscription.sol` | — | Auxiliary subscription contract (app uses DecentEscrow instead) |
| DecentEscrow v0.1 | External | [`0x23A4…350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) | Active subscription backend — plan-based ETH + $BNUT subscriptions |
| BigNutenGov | `contracts/BigNutenGov.sol` | [`0x58c2…2cD`](https://optimistic.etherscan.io/address/0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD) | Community proposal voting |

All custom contracts use **Solidity ^0.8.20** and **OpenZeppelin Contracts v5**.

Full addresses: [`docs/DEPLOYMENTS.md`](DEPLOYMENTS.md)

---

## Deployment Steps

### Prerequisites

```bash
cp .env.example .env
# Fill in: PRIVATE_KEY, OPTIMISM_RPC_URL, ETHERSCAN_API_KEY
npm install
```

### 1. Deploy All Contracts

```bash
npx hardhat run scripts/deploy.js --network optimism
```

The deploy script will:
1. Deploy `BigNuten.sol` (ERC-20 $BNUT).
2. Deploy `BigNutenTreasury.sol` — pass `bnutAddress` and `deployer.address` as constructor args.
3. Deploy `BigNutenSubscription.sol`.
4. Deploy `BigNutenGovernance.sol`.
5. Grant `MINTER_ROLE` on the $BNUT token to the deployer.

### 2. Fund the Treasury

```bash
# Mint BNUT to yourself first (via Admin Panel or CLI), then transfer to Treasury:
cast send $BNUT_ADDRESS \
  "transfer(address,uint256)" \
  $TREASURY_ADDRESS \
  <amount_in_wei> \
  --private-key $PRIVATE_KEY \
  --rpc-url https://mainnet.optimism.io
# 1 BNUT = 1000000000000000000 wei (18 decimals)
```

Or use **Admin Panel → $BNUT Admin → Quick Mint** with the Mint-to-Treasury checkbox.

### 3. Update Contract Addresses in the App

After deployment, update `js/contracts.js`:

```js
const TREASURY_CONTRACT_ADDRESS = '<deployed_treasury_address>';
```

### 4. Create Subscription Plans

Open the app → Admin Panel → Escrow Admin → Create Plan:
- Plan 0: ETH, 0.01 ETH/month
- Plan 1: $BNUT, 500 BNUT/month

---

## Roadmap Status

| Phase | Milestone | Status |
|---|---|---|
| 1 | Deploy ERC-20 $BNUT contract | ✅ Live on Optimism |
| 1 | Deploy Treasury contract | ✅ Live on Optimism |
| 2 | Integrate PayPal subscriptions | ✅ Done |
| 2 | Integrate Stripe subscriptions | ✅ Done |
| 2 | Build subscription status UI | ✅ Done |
| 2 | Build crypto subscription payment flow | ✅ Done |
| 2 | Accept $BNUT for discounted subscriptions | ✅ Done |
| 3 | Build GitHub bounty bot | ✅ Done |
| 3 | Add bounty label system | ✅ Done |
| 3 | Payroll queue + settle workflow | ✅ Done |
| 3 | Admin Panel (5 modals) | ✅ Done |
| 3 | Branch protection + CODEOWNERS policy | ✅ Done |
| 4 | Deploy community governance | ✅ Done |
| 4 | Build community data dashboard | ✅ Done |
| 4 | Build opt-in data sharing UI | ✅ Done |
| 5 | DEX liquidity (Uniswap/Velodrome), CEX listing, staking | 🔮 Future |
| 5 | Multisig treasury (Safe/Gnosis) | 🔮 Future |
| 5 | Vested team allocation (24-month cliff) | 🔮 Future |

---

*This document reflects the live v2.0.0 system. Last updated: 2026-03-20.*
