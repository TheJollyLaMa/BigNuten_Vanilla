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
9. [Roadmap](#roadmap)

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

1. **Fiat (PayPal / Stripe):** User pays via the payment SDK. The backend verifies payment, then calls `subscribe(user, durationDays)` on the `BigNutenSubscription` contract — granting on-chain access.
2. **ETH:** User calls `subscribeWithEth()` via MetaMask. The contract validates payment and sets the expiry directly.
3. **$BNUT:** User approves the subscription contract to spend BNUT, then calls `subscribeWithBnut()`. BNUT is transferred to the contract; expiry is set.

Active subscription status is always readable on-chain via `isSubscribed(address)`.

---

## Contributor Bounty System

The bounty system rewards open-source contributors for closing GitHub issues.

### How It Works

1. The repo owner adds a label like **`bounty: 500 BNUT`** to an issue.
2. When the issue is assigned, the **Bounty Bot** (`.github/workflows/bounty-bot.yml`) posts a comment announcing the reward.
3. The contributor opens a PR that closes the issue (`Closes #N` in the PR body).
4. When the PR is merged, the bot posts a payout request tagging `@TheJollyLaMa`.
5. The owner runs the **Bounty Payout** workflow (`.github/workflows/bounty-payout.yml`) with:
   - Contributor wallet address
   - BNUT amount
   - Issue number
6. The workflow calls `payContributor()` on the `BigNutenTreasury` contract, sending BNUT to the contributor's wallet.

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

## Governance

BigNuten uses simple on-chain token-weighted governance via the `BigNutenGovernance` contract.

### How It Works

1. **Any $BNUT holder** can view active proposals on the Community Dashboard.
2. **The owner** creates proposals with a description and voting duration.
3. **$BNUT holders** (any non-zero balance) cast one vote per proposal — FOR or AGAINST.
4. After the deadline, **the owner** executes the proposal. The outcome (passed/failed) is recorded on-chain.
5. The community and owner are expected to honour the outcome of governance votes.

### Future Improvements

- Move from owner-executed to fully autonomous proposal execution
- Weighted voting proportional to BNUT balance
- Delegation (vote with someone else's BNUT)
- Integration with OpenZeppelin Governor / Tally

---

## Data Sharing Rewards

BigNuten users can opt in to share anonymised fitness and health data with the community. In return, they earn $BNUT.

### Privacy Guarantees

- Data is **aggregated and anonymised** — individual records are never exposed.
- Users can **revoke consent at any time** via the in-app settings.
- No personal identifiers (name, email, etc.) are linked to shared data.
- Full data usage policy is published in the app and in-repo documentation.

### Earning $BNUT via Data Sharing

| Action                          | Reward (BNUT) |
|---------------------------------|---------------|
| Initial opt-in                  | 50 BNUT       |
| Weekly data contribution        | 25 BNUT       |
| 1-month sharing streak bonus    | 100 BNUT      |
| 3-month sharing streak bonus    | 500 BNUT      |

> Payouts are batch-processed by the owner via the Treasury contract.
> See issue #49 for the opt-in UI implementation.

---

## Smart Contracts

| Contract                     | File                                    | Purpose                              |
|------------------------------|-----------------------------------------|--------------------------------------|
| BigNuten (ERC-20)            | `contracts/BigNuten.sol`                | $BNUT token                          |
| BigNutenTreasury             | `contracts/BigNutenTreasury.sol`        | Holds reserves, pays contributors    |
| BigNutenSubscription         | `contracts/BigNutenSubscription.sol`    | Subscription management on-chain     |
| BigNutenGovernance           | `contracts/BigNutenGovernance.sol`      | Community proposal voting            |

All contracts use **Solidity ^0.8.20** and **OpenZeppelin Contracts v5**.

Deployed addresses are set in `.env` after running `npm run deploy:<network>`.

---

## Roadmap

| Phase | Milestone                                                          | Status      |
|-------|--------------------------------------------------------------------|-------------|
| 1     | Deploy ERC-20 $BNUT contract (Issue #38) — *scaffolded in this PR*    | 🟡 Needs deployment |
| 1     | Deploy Treasury contract (Issue #39) — *scaffolded in this PR*        | 🟡 Needs deployment |
| 2     | Integrate PayPal subscriptions (Issue #40)                        | 🔵 Planned  |
| 2     | Integrate Stripe subscriptions (Issue #41)                        | 🔵 Planned  |
| 2     | Build subscription status UI (Issue #42)                          | 🔵 Planned  |
| 2     | Build crypto subscription payment flow (Issue #43)                | 🔵 Planned  |
| 2     | Accept $BNUT for discounted subscriptions (Issue #44)             | 🔵 Planned  |
| 3     | Build GitHub bounty bot (Issue #45)                               | 🔵 Planned  |
| 3     | Add bounty label system to issues (Issue #46)                     | 🔵 Planned  |
| 3     | Deploy community governance (Issue #47)                           | 🔵 Planned  |
| 4     | Build community data dashboard (Issue #48)                        | 🔵 Planned  |
| 4     | Build opt-in data sharing UI (Issue #49)                          | 🔵 Planned  |
| 5     | DEX liquidity (Uniswap/QuickSwap), CEX listing, staking           | 🔮 Future   |

---

*This document will be updated as contracts are deployed and features are shipped.*
