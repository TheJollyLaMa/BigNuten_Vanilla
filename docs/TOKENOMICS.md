# BigNuten Tokenomics

> **Token:** BigNuten | **Symbol:** $BNUT | **Decimals:** 18

---

## Table of Contents

1. [Overview](#overview)
2. [Token Details](#token-details)
3. [Supply Allocation](#supply-allocation)
4. [Subscription Tiers](#subscription-tiers)
5. [Contributor Bounty System](#contributor-bounty-system)
6. [Governance](#governance)
7. [Data Sharing Rewards](#data-sharing-rewards)
8. [Smart Contracts](#smart-contracts)
9. [Deployment Steps](#deployment-steps)
10. [Roadmap](#roadmap)

---

## Overview

$BNUT is the native utility and governance token of the **BigNuten** fitness ecosystem. It aligns the interests of users, contributors, and the platform by rewarding participation, funding development, and enabling community governance.

Users can earn $BNUT by:
- Completing GitHub bounty issues
- Opting in to share anonymised fitness/health data
- Participating in the community dashboard

$BNUT can be used for:
- Discounted subscriptions (vs paying with ETH or fiat)
- Voting on governance proposals
- Future in-app purchases and premium features

---

## Token Details

| Property       | Value                                   |
|----------------|-----------------------------------------|
| Name           | BigNuten                                |
| Symbol         | $BNUT                                   |
| Decimals       | 18                                      |
| Standard       | ERC-20                                  |
| Networks       | Polygon, Base, Optimism (configurable)  |
| Initial Supply | 100,000,000 BNUT (100 million)          |
| Contract       | `contracts/BigNuten.sol`                |
| Mintable       | Yes — owner only (Treasury/multisig)    |
| Burnable       | Yes — any holder can burn their tokens  |

---

## Supply Allocation

The initial supply of **100,000,000 BNUT** is minted to the deployer address and immediately transferred to the BigNutenTreasury contract. Allocation is as follows:

| Category                    | % of Supply | Amount (BNUT)  | Purpose                                        |
|-----------------------------|-------------|----------------|------------------------------------------------|
| Treasury / Ecosystem Fund   | 50%         | 50,000,000     | Bounties, contributor rewards, partnerships    |
| Data Sharing Rewards        | 20%         | 20,000,000     | Opt-in health/fitness data sharing incentives  |
| Team & Advisors             | 15%         | 15,000,000     | Vested over 24 months (to be implemented)      |
| Community Reserve           | 10%         | 10,000,000     | Governance-controlled community fund           |
| Initial Liquidity           | 5%          | 5,000,000      | DEX liquidity pool seeding                     |

> 💡 All allocations are subject to community governance votes after the governance system is deployed.

---

## Subscription Tiers

BigNuten offers three payment methods for subscriptions. Paying with $BNUT provides a discount over ETH or fiat.

### Monthly Subscription

| Plan           | Payment Method | Price          | Duration |
|----------------|----------------|----------------|----------|
| Fiat — PayPal  | USD (PayPal)   | $9.99 / month  | 30 days  |
| Fiat — Stripe  | USD (Stripe)   | $9.99 / month  | 30 days  |
| Crypto — ETH   | ETH via MetaMask | ~0.01 ETH   | 30 days  |
| Crypto — $BNUT | BNUT via MetaMask | 500 BNUT   | 30 days  |

> Prices are approximate and may change based on market conditions. The BNUT discount (~50% off ETH equivalent) incentivises token adoption and rewards long-term holders.

### How Subscriptions Work

Subscription management is handled by the **DecentEscrow** contract deployed on Optimism Mainnet at
[`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e).

Plans are pre-created by the owner via `createPlan()` on DecentEscrow:

| Plan ID | Payment Token | Plan Name                   |
|---------|---------------|-----------------------------|
| 0       | ETH           | BigNuten Monthly ETH        |
| 1       | $BNUT (ERC-20)| BigNuten Monthly BNUT       |

1. **Fiat (PayPal / Stripe):** User pays via the payment SDK. The backend verifies payment, then calls `subscribe(user, durationDays)` on the `BigNutenSubscription` contract — granting on-chain access.
2. **ETH:** User clicks **Ξ Pay with ETH** in the subscription modal. The app reads the live plan price from DecentEscrow, then calls `subscribe(planId=0)` with that ETH value via MetaMask.
3. **$BNUT (discounted):** User clicks **Pay with $BNUT** (coin icon) in the subscription modal. The app:
   1. Reads the live plan price from DecentEscrow plan 1.
   2. Checks the user's $BNUT balance (must be ≥ plan price).
   3. Requests an ERC-20 `approve()` for DecentEscrow to spend the $BNUT (if current allowance is insufficient).
   4. Calls `subscribe(planId=1)` on DecentEscrow — BNUT is transferred and the subscription is activated on-chain.

Active subscription status is always readable on-chain via `isSubscribed(planId, address)` on the DecentEscrow contract, and both the ETH plan and the $BNUT plan are checked simultaneously by the app.

---

## Contributor Bounty System

The bounty system rewards open-source contributors for closing GitHub issues.

### How It Works

1. The repo owner runs the **Bounty Label** workflow (`.github/workflows/bounty-label.yml`) to add a label like **`bounty: 500 BNUT`** to an issue.
2. When the issue is assigned, the **Bounty Bot** (`.github/workflows/bounty-bot.yml`) posts a comment announcing the reward.
3. The contributor opens a PR that closes the issue (`Closes #N` in the PR body).
4. When the PR is merged, the **Bounty Bot** automatically:
   - Appends a correctly-formatted entry to `payroll-queue.json`.
   - Increments `bnutPending` and records the issue in `issuesClosed` in `contributor-accounts.json`.
   - Posts a confirmation comment on the closed issue.
5. If the contributor is not yet registered (no wallet address), the bot posts a warning and @TheJollyLaMa can run the manual **Bounty Payout** workflow (`.github/workflows/bounty-payout.yml`) as a fallback.
6. Once queued, payouts are settled via the [BigNuten app](https://thejollylama.github.io/BigNuten_Vanilla/) Payroll panel.

> ⚠️ **Whitelist required:** Only contributors registered in `contributor-accounts.json` by `@TheJollyLaMa` can receive $BNUT payouts. See [Whitelist Onboarding](#whitelist-onboarding) below.

### Applying a Bounty Label

Maintainers can label any open issue with a bounty amount in two ways:

**Option A — GitHub Actions UI (recommended):**
1. Go to **Actions → Bounty Label → Run workflow**.
2. Enter the issue number and BNUT amount.
3. The workflow creates the label (if new) and posts an announcement comment.

**Option B — Manual:**
1. Create a label in the repo following the exact format (see [Label Format](#label-format)).
2. Apply it to the issue from the issue sidebar.

### Label Format

Labels must follow the exact format (case-insensitive):

```
bounty: <amount> BNUT
```

Examples:
- `bounty: 100 BNUT`
- `bounty: 500 BNUT`
- `bounty: 2000 BNUT`

### Bounty Tiers (Suggested)

| Complexity     | Suggested Bounty |
|----------------|-----------------|
| Documentation  | 100–250 BNUT    |
| Bug Fix        | 250–500 BNUT    |
| Feature (small)| 500–1000 BNUT   |
| Feature (large)| 1000–5000 BNUT  |
| Audit / Security| 5000+ BNUT     |

---

## Contributor Accounts

All registered contributors are tracked in `contributor-accounts.json` at the root of the repository.

### What is tracked

| Field            | Description                                              |
|------------------|----------------------------------------------------------|
| `github`         | GitHub username                                          |
| `displayName`    | Human-readable name                                      |
| `role`           | `owner` or `contributor`                                 |
| `walletAddress`  | Optimism Mainnet address for $BNUT payouts               |
| `bnutEarned`     | Cumulative BNUT received (updated manually by owner)     |
| `bnutPending`    | BNUT queued but not yet settled                          |
| `issuesClosed`   | List of issue references credited to this contributor    |

### Initial Accounts

The system starts with two accounts for early testing:

| GitHub         | Role        | Purpose                              |
|----------------|-------------|--------------------------------------|
| `@TheJollyLaMa`| owner       | Repo maintainer — test payroll flow  |
| `@copilot`     | contributor | GitHub Copilot RoboSoul — AI contributions |

> 💡 **Wallet addresses are required** before any payout can be queued. Wallet addresses are registered by the maintainer — see [Whitelist Onboarding](#whitelist-onboarding) below.

### Whitelist Onboarding

> ⚠️ Wallet addresses are **not** self-registered by contributors via PR. Only the maintainer (`@TheJollyLaMa`) can add new entries to `contributor-accounts.json`.

New contributors are onboarded through a personal, whitelist-based process to prevent impersonation and phishing:

1. The contributor expresses interest on a bounty issue or contacts `@TheJollyLaMa` directly.
2. The maintainer arranges a brief **video call or direct conversation** to verify the contributor's identity and collect their wallet address.
3. The maintainer adds the contributor's GitHub username and **Optimism Mainnet** wallet address to `contributor-accounts.json`.
4. The contributor is assigned to the bounty issue and work begins.

Contributors should **never share their wallet address publicly** in issues or PRs — always provide it privately to the maintainer during onboarding.

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full onboarding guide.

---

## Governance

BigNuten uses simple on-chain governance via the `BigNutenGov` contract deployed on **Optimism Mainnet**.

### Model

- **Voting**: 1 wallet = 1 vote (sybil-resistant for the early community)
- **Eligibility**: Must hold ≥ 1 $BNUT token to vote
- **Proposers**: Only wallets with `PROPOSER_ROLE` (DNFT holders granted by the admin) can create proposals
- **Admin veto**: `DEFAULT_ADMIN_ROLE` (TheJollyLaMa) has final say — can `enact` or `veto` any finalized result
- **No auto-execution**: All outcomes are advisory — the admin confirms and acts

### Contract

| Field | Detail |
|---|---|
| Contract | `BigNutenGov.sol` |
| Address (Optimism) | `0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD` |
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

Community governance proposals may cover:

- Feature prioritisation and product roadmap
- Prize pool and payout rate changes
- Community data use policies
- Token reward rates for contributors
- Protocol parameter changes (e.g. quorum, voting duration)

### What Cannot Be Voted On

- Core security and access control (admin-only)
- Smart contract upgrades (require deployment)
- Individual user data

### How to Get $BNUT

- 🎟️ **Buy a Supporter DNFT** — earns $BNUT rewards and grants `PROPOSER_ROLE`
- 💻 **Contribute code** — merged PRs rewarded by the admin via `mintReward()`
- 📊 **Share health data** (opt-in) — earn $BNUT for community research contributions
- ⚙️ **Admin mint** — during startup, TheJollyLaMa can mint test $BNUT to any wallet via the Governance modal Admin Panel



## Data Sharing Rewards

BigNuten users can opt in to share anonymised fitness and health data with the community. In return, they earn $BNUT, paid out from the **BigNutenTreasury** contract.

### Privacy Guarantees

- Data is **aggregated and anonymised** — individual records are never exposed.
- Users can **revoke consent at any time** via the in-app Data Pool tab (prominent "Revoke All Consent" button).
- No personal identifiers (name, email, wallet address, timestamps) are linked to shared data.
- Opt-in state is stored in browser `localStorage` only — nothing is sent to a server.
- Only aggregate counts and category trends are previewed or shared.
- Full data usage policy: this document, section "Privacy Guarantees" above.

### Earning $BNUT via Data Sharing

| Action                          | Reward (BNUT) |
|---------------------------------|---------------|
| Initial opt-in                  | 50 BNUT       |
| Weekly data contribution        | 25 BNUT       |
| 1-month sharing streak bonus    | +100 BNUT     |
| 3-month sharing streak bonus    | +500 BNUT     |

### Payout Flow

1. User enables one or more data-sharing toggles in the **Data Pool** tab.
2. The app records the opt-in timestamp locally and calculates earned BNUT based on streak length.
3. The user clicks **"Request $BNUT Reward"** to register their wallet for the next batch payout.
4. The Treasury owner calls `batchRewardDataSharing()` on `BigNutenTreasury` to settle pending requests.
5. Each payout emits a `DataSharingRewarded` event — fully traceable on Optimism via [Optimistic Etherscan](https://optimistic.etherscan.io).
6. The **on-chain reward history** is displayed in the Data Pool tab when the user's wallet is connected.

> Payouts are batch-processed by the owner via the BigNutenTreasury contract.
> Contract ABI: `abis/BigNutenTreasury.json`
> Related issue: #49 (opt-in UI implementation).

---

## Smart Contracts

| Contract                     | File                                    | Purpose                              |
|------------------------------|-----------------------------------------|--------------------------------------|
| BigNuten (ERC-20)            | `contracts/BigNuten.sol`                | $BNUT token                          |
| BigNutenTreasury             | `contracts/BigNutenTreasury.sol`        | Holds reserves, pays contributors and data-sharing rewards (`rewardDataSharing`, `batchRewardDataSharing`) |
| BigNutenSubscription         | `contracts/BigNutenSubscription.sol`    | Auxiliary subscription contract (ETH & $BNUT self-service). The live app uses **DecentEscrow** below. |
| DecentEscrow v0.1            | External — [`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) | **Active subscription backend** — plan-based subscriptions for ETH (plan 0) and $BNUT (plan 1) |
| BigNutenGovernance           | `contracts/BigNutenGovernance.sol`      | Community proposal voting            |

All custom contracts use **Solidity ^0.8.20** and **OpenZeppelin Contracts v5**.

Deployed addresses are set in `.env` after running `npm run deploy:<network>`.

---

## Deployment Steps

### Prerequisites

```bash
cp .env.example .env
# Fill in PRIVATE_KEY, OPTIMISM_RPC_URL, ETHERSCAN_API_KEY
npm install
```

### 1. Deploy All Contracts

```bash
npx hardhat run scripts/deploy.js --network optimism
```

The deploy script will:
1. Deploy `BigNuten.sol` (ERC-20 $BNUT) — mints `INITIAL_SUPPLY` to the deployer.
2. Deploy `BigNutenTreasury.sol` — pass `bnutAddress` and `deployer.address` as constructor args.
3. Deploy `BigNutenSubscription.sol`.
4. Deploy `BigNutenGovernance.sol`.
5. Transfer the entire initial BNUT supply to the Treasury contract.
6. Grant `MINTER_ROLE` on the $BNUT token to the deployer (and optionally a CI bot wallet).

### 2. Constructor Arguments

| Contract | Arg 1 | Arg 2 |
|---|---|---|
| `BigNuten` | `initialOwner` (address) | — |
| `BigNutenTreasury` | `_bnutToken` (address of deployed BigNuten) | `initialOwner` (address) |
| `BigNutenSubscription` | `_bnutToken` | `_treasury` |
| `BigNutenGovernance` | `_bnutToken` | `initialAdmin` |

### 3. Fund the Treasury After Deploy

```bash
# Transfer BNUT from deployer to treasury (already done by deploy script)
# Or top up later:
cast send $BNUT_ADDRESS "transfer(address,uint256)" $TREASURY_ADDRESS 1000000000000000000 --private-key $PRIVATE_KEY --rpc-url $OPTIMISM_RPC_URL
# Note: amounts are in wei (18 decimals). 1000000000000000000 = 1 BNUT; 1000000000000000000000 = 1000 BNUT
```

### 4. Update Contract Addresses in the App

After deployment, update `js/contracts.js`:

```js
const TREASURY_CONTRACT_ADDRESS = '<deployed_treasury_address>';
```

### 5. BigNutenTreasury — Double-Pay Guard

`BigNutenTreasury.sol` includes an `issuePaid` mapping that prevents the same GitHub
issue reference (e.g. `"TheJollyLaMa/BigNuten_Vanilla#45"`) from being paid twice.
Each payout also increments `totalPaid[contributor]` for canonical on-chain tracking.

View helpers:
- `getTotalPaid(address)` — cumulative BNUT paid to a contributor.
- `isIssuePaid(string)` — whether an issue ref has already been settled.

---

## Roadmap

| Phase | Milestone                                                          | Status      |
|-------|--------------------------------------------------------------------|-------------|
| 1     | Deploy ERC-20 $BNUT contract (Issue #38) — *scaffolded in this PR*    | 🟡 Needs deployment |
| 1     | Deploy Treasury contract (Issue #39) — *scaffolded in this PR*        | 🟡 Needs deployment |
| 2     | Integrate PayPal subscriptions (Issue #40)                        | ✅ Done     |
| 2     | Integrate Stripe subscriptions (Issue #41)                        | ✅ Done     |
| 2     | Build subscription status UI (Issue #42)                          | ✅ Done     |
| 2     | Build crypto subscription payment flow (Issue #43)                | ✅ Done     |
| 2     | Accept $BNUT for discounted subscriptions (Issue #44)             | ✅ Done     |
| 3     | Build GitHub bounty bot (Issue #45)                               | ✅ Done     |
| 3     | Add bounty label system to issues (Issue #46)                     | ✅ Done     |
| 3     | Deploy community governance (Issue #47)                           | 🔵 Planned  |
| 4     | Build community data dashboard (Issue #48)                        | 🔵 Planned  |
| 4     | Build opt-in data sharing UI (Issue #49)                          | 🔵 Planned  |
| 5     | DEX liquidity (Uniswap/QuickSwap), CEX listing, staking           | 🔮 Future   |

---

*This document will be updated as contracts are deployed and features are shipped.*
