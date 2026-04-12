# ⚕︎ BigNuten ⚕︎
### (Another Decent Frankenstein)

> An open-source, privacy-first fitness tracker with IPFS-backed data, Web3 wallet integration, on-chain $BNUT bounties, and a fully automated contributor payroll system.

![Version](https://img.shields.io/badge/version-v2.0.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Built With](https://img.shields.io/badge/built%20with-Vanilla%20JS-yellow?style=flat-square)
![Storage](https://img.shields.io/badge/storage-IPFS%20via%20web3.storage%20w3up-blueviolet?style=flat-square)
![Wallet](https://img.shields.io/badge/wallet-MetaMask-orange?style=flat-square)
[![Early Supporter DNFT](https://img.shields.io/badge/Early%20Access-100%20DNFTs-8b00ff?style=flat-square&logo=ethereum)](https://thejollylama.github.io/DecentMarket/)
[![v2.0.0 DNFT Minted](https://img.shields.io/badge/v2.0.0%20DNFT-Minted%20%E2%9C%94-gold?style=flat-square&logo=ethereum)](https://thejollylama.github.io/DecentMarket/)
[![Network](https://img.shields.io/badge/network-Optimism%20Mainnet-ff0420?style=flat-square&logo=ethereum)](https://optimistic.etherscan.io)

---

## Table of Contents

1. [What is BigNuten?](#-what-is-bignuten)
2. [v2.0.0 — What's Shipped](#-v200--whats-shipped)
3. [Bounty & Treasury Flow](#-bounty--treasury-flow)
4. [Admin Panel](#-admin-panel)
5. [Payroll Queue](#-payroll-queue)
6. [Workflow Security & Policy](#-workflow-security--policy)
7. [Early Supporter DNFT](#-become-an-early-supporter)
8. [v2.0.0 Monetization Stack DNFT](#️-v200-monetization-stack-dnft)
9. [$BNUT Token](#-bnut-token)
10. [Contributing](#-contributing)
11. [How to Clone BigNuten](#-how-to-clone-bignuten-for-new-projects)
12. [Tech Stack](#-tech-stack)
13. [Getting Started](#-getting-started)
14. [License](#-license)

---

## 🏋️ What is BigNuten?

BigNuten is a **fully client-side, privacy-first fitness tracker** built with zero backend and zero build steps. It runs directly in the browser and gives you ownership of your health data — stored locally and backed up to IPFS via web3.storage.

- 📈 **Weight tracking** over time with a beautiful time-series chart (Chart.js)
- 💊 **Supplement logging** — track your vitamins, minerals, and stack
- 🥗 **Raw food intake logging** — with a dietary guidance modal
- 🏃 **Exercise session & workout set logging**
- 🌐 **IPFS backup & restore** via web3.storage w3up client — your data, your nodes
- 🦊 **MetaMask wallet connection** for Web3 identity
- 🌙 **Moon & Sun tracker** with Vedic Tithi and Ekadasi calendar
- 🚫 **No backend** — fully client-side, runs in any modern browser

---

## ✅ v2.0.0 — What's Shipped

v2.0.0 is a major upgrade that turns BigNuten from a personal tracker into a **community-funded, contributor-rewarded open-source project** with an on-chain economy.

### 🪙 Token Economy
- ✅ $BNUT ERC-20 token deployed on Optimism Mainnet
- ✅ BigNutenTreasury contract deployed — holds all $BNUT reserves, direct contributor payouts
- ✅ Subscription payments via DecentEscrow (ETH plan + $BNUT discounted plan)
- ✅ Data-sharing rewards via `rewardDataSharing()` / `batchRewardDataSharing()`

### 🤖 Bounty Bot & Payroll
- ✅ Automated bounty label workflow (`bounty-label.yml`)
- ✅ Bounty bot — auto-queues payout on PR merge (`bounty-bot.yml`)
- ✅ Testing bounty bot — comment-driven QA payout workflow (`testing-bounty.yml`)
- ✅ Payroll queue (`payroll-queue.json`) with `pending` / `settled` ledger
- ✅ Admin-settled payroll via MetaMask → BigNutenTreasury (`settle-payroll.yml`)
- ✅ Payroll queue validation on every push (`validate-payroll-queue.yml`)
- ✅ Contributor accounts whitelist (`contributor-accounts.json`)

### 🖥️ Admin Panel (6 modals)
- ✅ **$BNUT Admin** — Quick Mint (with mint-to-treasury option), view token stats
- ✅ **Treasury Admin** — Check treasury BNUT balance, transfer tokens
- ✅ **Escrow Admin** — Create/deactivate DecentEscrow subscription plans, view subscribers
- ✅ **Contributors Admin** — Load/edit contributor wallets, download updated JSON
- ✅ **Payroll** — Settle pending payouts via `batchPayContributors()` MetaMask call
- 🆕 **Competitions** — Create/settle/cancel streak bet competitions (v3.1.0)

### 🗳️ Governance
- ✅ On-chain governance via `BigNutenGov` contract
- ✅ 1 wallet = 1 vote; $BNUT holders (≥ 1 BNUT) can vote
- ✅ DNFT holders get `PROPOSER_ROLE` to create proposals
- ✅ Admin enact/veto via governance modal

### 🔒 Security & Branch Protection
- ✅ `CODEOWNERS` — all files owned by `@TheJollyLaMa`; critical ledger files explicitly listed
- ✅ Branch protection on `main` — 1 CODEOWNER review required, stale reviews dismissed
- ✅ `validate-payroll-queue.yml` — blocks merges with invalid queue entries
- ✅ `setup-branch-protection.yml` — reproducible policy setup via GitHub Actions

---

## 🔄 Bounty & Treasury Flow

The entire contributor reward cycle is automated end-to-end — no private keys ever touch CI.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BOUNTY & TREASURY FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. ISSUE LABELLED                                                  │
│     Maintainer runs Actions → Bounty Label → Run workflow           │
│     ➜ Label "bounty: N BNUT" created & applied to issue             │
│     ➜ Announcement comment posted automatically                     │
│                                                                     │
│  2. CONTRIBUTOR ASSIGNED                                            │
│     Maintainer assigns issue to a whitelisted contributor           │
│     ➜ Bounty Bot posts reward announcement on the issue             │
│                                                                     │
│  3. PR MERGED                                                       │
│     Contributor opens PR with "Closes #N" in the body              │
│     ➜ PR merged by maintainer                                       │
│     ➜ Bounty Bot automatically:                                     │
│        • Appends entry to payroll-queue.json  [pending]             │
│        • Increments bnutPending in contributor-accounts.json        │
│        • Posts queue confirmation comment on issue                  │
│                                                                     │
│  4. ADMIN SETTLES PAYROLL                                           │
│     Maintainer opens BigNuten app → Admin Panel → Payroll           │
│     ➜ Clicks "Settle All Pending"                                   │
│     ➜ MetaMask prompts batchPayContributors() on BigNutenTreasury   │
│     ➜ $BNUT sent directly to contributor wallet on-chain            │
│     ➜ ContributorPaid event emitted on Optimism                     │
│     ➜ settle-payroll.yml moves entries: pending → settled           │
│     ➜ txHash + settledAt recorded in payroll-queue.json             │
│                                                                     │
│  5. ON-CHAIN VERIFICATION                                           │
│     Anyone can verify on Optimistic Etherscan:                      │
│     ContributorPaid(contributor, issueRef, amount) events           │
│     https://optimistic.etherscan.io/address/0x143c...363#events     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

  GitHub Actions         payroll-queue.json        Optimism Mainnet
  ─────────────          ──────────────────        ────────────────
  bounty-label.yml  ──►  pending[] entry  ──────►  BigNutenTreasury
  bounty-bot.yml         settled[] entry  ◄──────  batchPayContributors()
  settle-payroll.yml          │                    ContributorPaid event
  validate-payroll.yml        │
                              ▼
                    contributor-accounts.json
                    bnutPending / bnutEarned
```

### Key Contracts

| Contract | Network | Address |
|----------|---------|---------|
| $BNUT (ERC-20) | Optimism Mainnet | [`0x733c4d2Aae900E608147dd89Fa93606f89722823`](https://optimistic.etherscan.io/token/0x733c4d2Aae900E608147dd89Fa93606f89722823) |
| BigNutenTreasury | Optimism Mainnet | [`0x143cC41AC075FFA40be1993827DA6ffB4638A363`](https://optimistic.etherscan.io/address/0x143cC41AC075FFA40be1993827DA6ffB4638A363) |
| BigNutenGov | Optimism Mainnet | [`0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD`](https://optimistic.etherscan.io/address/0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD) |
| DecentEscrow v0.1 | Optimism Mainnet | [`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) |
| StreakBetEscrow (v3.1.0) | Optimism Mainnet | _Not yet deployed — set `STREAK_BET_ESCROW_ADDRESS` in `contracts.js` after deployment_ |

Full deployment details: [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md)

---

## 🖥️ Admin Panel

The Admin Panel is accessible to the owner wallet (`DEFAULT_ADMIN_ROLE`) via the **⚕︎ staff dropdown** in the top navigation. It opens 6 dedicated modals:

### 1. 🪙 $BNUT Admin (`bnut-admin-modal`)
- View total supply, current balance, and contract address
- **Quick Mint** — mint $BNUT to any address (requires `MINTER_ROLE`)
  - ✅ **Mint-to-Treasury** checkbox sends tokens directly to the treasury contract

### 2. 🏦 Treasury Admin (`treasury-admin-modal`)
- View the treasury's current $BNUT balance
- **Transfer to Treasury** — move tokens from the admin wallet into the treasury reserve

### 3. 📋 Escrow Admin (`escrow-admin-modal`)
- View all DecentEscrow subscription plans and their current status
- **Create Plan** — add a new subscription plan (ETH or ERC-20 token, price, duration)
- **Deactivate Plan** — disable an existing plan (non-destructive)
- **Subscriber List** — query `Subscribed` events to see all current subscribers

### 4. 👥 Contributors Admin (`contributors-admin-modal`)
- Load all contributors from `contributor-accounts.json` (served via GitHub raw URL)
- Edit wallet addresses inline in the browser
- **Download** the updated JSON for committing to the repo

### 5. 💸 Payroll (`payroll-modal`)
- Load the live `payroll-queue.json` and display all `pending` entries
- **Settle All Pending** — calls `batchPayContributors()` on BigNutenTreasury via MetaMask
  - Each pending entry maps to one `payContributor(address, issueRef, amount)` call
  - After MetaMask confirmation, the admin runs `settle-payroll.yml` to commit the settled state

### 6. 🏆 Competitions (`comp-admin-modal`) — v3.1.0
- **Summary Stats** — at-a-glance counters for total, active, settled, cancelled competitions, total entrants, and total winners
- **All Competitions** — lists all on-chain competitions with status filter tabs (All / Active / Settled / Cancelled), showing data source, pot balance, self-report cycle, dates, and admin actions
- **Create New Competition** — admin defines name, stake token (ETH/USDC/BNUT), stake amount, week count, self-report cycle (weekly/daily), **data source** (water/weight/exercise/nutrition/supplements), dates, Aave yield toggle, and optional IPFS metadata CID
- **Streak Bot** — auto-verifies user data on app load; checks local logs (e.g. water intake) against competition requirements and auto-submits on-chain reports — no double-logging needed
- **Daily Reports (IPFS Chain)** — admin compiles daily reports listing all entrants, verification status, pot balance, and publishes to IPFS; each report links to the previous day's CID forming an immutable chain of competition records
- **Settle** — auto-forfeits incomplete entrants, distributes pot + yield to winners, publishes leaderboard CID
- **Cancel** — refunds all non-forfeited entrants
- **Aave Deploy** — deploys pot to Aave V3 for yield during the comp period (ERC-20 only)

> 🔐 The Admin Panel is only visible when the connected wallet matches the treasury owner address. No private keys are stored in GitHub — all on-chain actions go through MetaMask.

---

## 💸 Payroll Queue

The payroll queue is the authoritative off-chain ledger tracking all contributor payouts.

**File:** [`payroll-queue.json`](payroll-queue.json)

### Structure

```jsonc
{
  "pending": [
    {
      "issueRef": "TheJollyLaMa/BigNuten_Vanilla#45",  // GitHub issue reference
      "contributor": "0xABC...",                         // Optimism Mainnet wallet
      "contributorGithub": "octocat",                    // GitHub username
      "amount": "500",                                   // BNUT amount (whole tokens)
      "queuedAt": "2026-03-20T12:00:00.000Z",
      "queuedBy": "bounty-bot"
    }
  ],
  "settled": [
    {
      // same fields as pending, plus:
      "settledAt": "2026-03-20T18:00:00.000Z",
      "settledBy": "TheJollyLaMa",
      "txHash": "0x..."  // optional — on-chain tx hash
    }
  ]
}
```

### Lifecycle

| Stage | Action | Who |
|-------|--------|-----|
| **Queued** | PR merged → Bounty Bot appends to `pending[]` | GitHub Actions (bounty-bot.yml) |
| **Validated** | Push triggers queue format check | GitHub Actions (validate-payroll-queue.yml) |
| **Settled** | Admin calls `batchPayContributors()`, then runs workflow | Owner via Admin Panel + settle-payroll.yml |
| **Verified** | `ContributorPaid` event visible on Optimistic Etherscan | Anyone |

### Validation Rules

Every entry in `payroll-queue.json` is validated by `scripts/validatePayrollQueue.js` on every push or PR that touches the file:

- `issueRef` must match `org/repo#N` format
- `contributor` must be a valid Ethereum address (`0x` + 40 hex chars)
- `amount` must be a positive number
- No duplicate `issueRef` + `contributor` combinations
- `contributorGithub` must match an entry in `contributor-accounts.json`

See [`docs/TOKENOMICS.md`](docs/TOKENOMICS.md) for full bounty and payout economics.

---

## 🔒 Workflow Security & Policy

### GitHub Actions Workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| Bounty Label | [`.github/workflows/bounty-label.yml`](.github/workflows/bounty-label.yml) | Manual (`workflow_dispatch`) | Create bounty label + apply to issue + post announcement |
| Idea Adopted Label | [`.github/workflows/idea-label.yml`](.github/workflows/idea-label.yml) | Manual (`workflow_dispatch`) | Mark idea as adopted, credit originator with `idea-credit` label; enables 80/20 payout split on merge |
| Bounty Bot | [`.github/workflows/bounty-bot.yml`](.github/workflows/bounty-bot.yml) | Issue assigned + PR merged | Auto-announce reward; auto-queue payout on merge (with 80/20 split when `idea-credit` label present) |
| Testing Bounty Bot | [`.github/workflows/testing-bounty.yml`](.github/workflows/testing-bounty.yml) | Issue assigned + issue comments | Comment-driven QA bounty: `/test-complete` → tester claims; `/test-approved` (admin only) → queues payout with `role: tester` |
| Bounty Payout | [`.github/workflows/bounty-payout.yml`](.github/workflows/bounty-payout.yml) | Manual (`workflow_dispatch`) | Fallback: manually queue a payout entry |
| Settle Payroll | [`.github/workflows/settle-payroll.yml`](.github/workflows/settle-payroll.yml) | Manual (`workflow_dispatch`) | Move entries from `pending[]` → `settled[]` after on-chain tx |
| Validate Queue | [`.github/workflows/validate-payroll-queue.yml`](.github/workflows/validate-payroll-queue.yml) | Push / PR to queue files | Block merges with invalid or duplicate queue entries |
| Branch Protection | [`.github/workflows/setup-branch-protection.yml`](.github/workflows/setup-branch-protection.yml) | Manual (`workflow_dispatch`) | Reproducibly apply branch protection rules to `main` |

### Branch Protection (main)

- **1 approving review required** — reviewer must be a CODEOWNER (`@TheJollyLaMa`)
- **Stale reviews dismissed** on new commits
- **Force pushes blocked**
- **Validate Payroll Queue** check must pass before merge
- Re-run `Actions → Setup Branch Protection` after changes to reproduce the policy

### CODEOWNERS

`.github/CODEOWNERS` assigns `@TheJollyLaMa` as reviewer for all files, with explicit ownership of critical ledger files:

```
* @TheJollyLaMa
/contributor-accounts.json @TheJollyLaMa
/payroll-queue.json @TheJollyLaMa
```

> This means any PR touching the contributor whitelist or payroll ledger triggers a mandatory CODEOWNER review before merge.

### No CI Secrets

All on-chain actions (minting, paying contributors, settling payroll) go through the **owner's MetaMask wallet** in the BigNuten app — no private keys are stored in GitHub Secrets or passed to workflows.

---

## 🎟️ Become an Early Supporter

> **100 genesis BigNuten DNFTs — limited, on-chain, and yours forever.**

BigNuten is minting **100 Early Supporter DNFTs** on Optimism as ERC-1155 tokens via the DecentNFT contract. These are not just collectibles — they are founding artifacts of the project.

### What You Get

- 🏅 **Permanent on-chain proof** of founding support — your name in history
- 🗳️ **Governance voting rights** on product roadmap, features, and integrations
- 🤝 **Direct line to the dev team** for feedback and collaboration
- 🪙 **Stake in the $BNUT ecosystem** from day one

### DNFT Details

| Field | Detail |
|---|---|
| **Price** | $100 USDC (exact) |
| **Supply** | 100 editions max |
| **Standard** | ERC-1155 on Optimism |
| **DNFT Contract** | [`0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958`](https://optimistic.etherscan.io/address/0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958) — DecentNFT v0.2 |
| **Escrow Contract** | [`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) — DecentEscrow v0.1 |

### How to Buy

#### 🔗 Option 1 — Crypto (instant & trustless)

1. Visit **[DecentMarket](https://thejollylama.github.io/DecentMarket/)** or use the **🎟️ Buy Now** button inside BigNuten
2. Connect your MetaMask wallet (Optimism network)
3. Approve $100 USDC and confirm — the escrow releases your DNFT automatically on-chain

#### 💳 Option 2 — PayPal (fiat-friendly)

1. Open the **About modal** inside BigNuten and scroll to the Early Supporter section
2. Enter your wallet address (to receive the DNFT)
3. Click **💳 Buy with PayPal — $100** and complete checkout
4. `@TheJollyLaMa` verifies the payment and transfers your DNFT manually

### Community Escrow

Proceeds from DNFT sales flow to the **[DecentEscrow contract](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e)** on Optimism — a transparent, on-chain community treasury. Funds are reserved for:

- $BNUT bounties for contributors
- Feature development and infrastructure
- Community rewards and governance

---

## 🖼️ v2.0.0 Monetization Stack DNFT

> **The BigNuten v2.0.0 Supporter DNFT has been minted in [DecentMarket](https://thejollylama.github.io/DecentMarket/).**

<div align="center">
  <img src="https://github.com/user-attachments/assets/190ec435-9e57-4186-b9c5-0eba30b8c24d" alt="BigNuten v2.0.0 Supporter DNFT" width="320" />
</div>

This commemorative DNFT documents the launch of the **BigNuten Monetization Stack** — the on-chain economy layer that transforms BigNuten from a personal fitness tracker into a community-funded, contributor-rewarded Web3 project.

### What's Captured in the v2.0.0 DNFT

> *"BigNuten Monetization Stack — v2.0.0 Supporter DNFT (Eth). BigNuten v2.0.0 marks the addition of a monetization layer."*

The DNFT metadata includes a full summary of everything shipped:

- 💳 **Payment stack** — Stripe, PayPal, and on-chain crypto (ETH, $BNUT, USDC) subscription flows via DecentEscrow
- 🪙 **$BNUT token** — ERC-20 governance and rewards token deployed on Optimism Mainnet
- 🏛️ **BigNutenGov** — on-chain proposal and voting contract, gated by $BNUT balance
- 🏦 **BigNutenTreasury** — holds the $BNUT reserve; owner settles contributor payroll directly via MetaMask
- 🤖 **GitHub Bounty Bot** — automated issue-to-payroll pipeline with contributor whitelist; merging a bounty issue queues an addition to payroll

### DNFT Metadata

| Field | Detail |
|---|---|
| **Title** | BigNuten v2.0.0 Supporter DNFT (Eth) |
| **Artifact** | `ipfs://bafybeih34ka25qsnj4wx4jq7tebo4…` *(full CID visible on [DecentMarket](https://thejollylama.github.io/DecentMarket/))* |
| **Repo** | [github.com/TheJollyLaMa/BigNuten_Vanilla](https://github.com/TheJollyLaMa/BigNuten_Vanilla) |
| **Gallery** | [DecentMarket](https://thejollylama.github.io/DecentMarket/) |
| **Standard** | ERC-1155 on Ethereum / Optimism |
| **DNFT Contract** | [`0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958`](https://optimistic.etherscan.io/address/0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958) — DecentNFT v0.2 |

> Holding this DNFT means you've supported the building of BigNuten v2.0.0 — a health tracking app that pays its builders and invites everyone to build. **And get fit!**

---

## 🪙 $BNUT Token

| Field | Detail |
|---|---|
| Token Name | BigNuten |
| Symbol | $BNUT |
| Network | Optimism Mainnet |
| Contract | [`0x733c4d2Aae900E608147dd89Fa93606f89722823`](https://optimistic.etherscan.io/token/0x733c4d2Aae900E608147dd89Fa93606f89722823) |
| Max Supply | 1,000,000,000 BNUT |
| Mintable | Yes — `MINTER_ROLE` only (owner/Treasury) |
| Burnable | Yes — any holder can burn their own tokens |
| Purpose | Subscriptions (discounted), contributor bounties, data-sharing rewards, governance |

### Supply Allocation

| Category | % | Amount (BNUT) | Purpose |
|---|---|---|---|
| Treasury / Ecosystem Fund | 50% | 500,000,000 | Bounties, contributor rewards, partnerships |
| Data Sharing Rewards | 20% | 200,000,000 | Opt-in health/fitness data sharing incentives |
| Team & Advisors | 15% | 150,000,000 | Vested over 24 months |
| Community Reserve | 10% | 100,000,000 | Governance-controlled community fund |
| Initial Liquidity | 5% | 50,000,000 | DEX liquidity pool seeding |

> Supply is managed by `MINTER_ROLE` wallets. The Treasury owner can mint additional $BNUT via the Admin Panel → $BNUT Admin → Quick Mint. All mints are traceable on-chain.

### Subscribing with $BNUT (Discounted Rate)

BigNuten accepts `$BNUT` for subscriptions at a **~50% discount** vs ETH:

| Method | Price |
|--------|-------|
| ETH | ~0.01 ETH / month |
| **$BNUT** | **~500 $BNUT / month** |

Subscriptions are managed by **DecentEscrow** (`0x23A4…350e`) on Optimism. Plans:

| Plan ID | Token | Name |
|---------|-------|------|
| 0 | ETH | BigNuten Monthly ETH |
| 1 | $BNUT | BigNuten Monthly BNUT |

📖 Full guide: [`docs/BNUT_SUBSCRIPTION.md`](docs/BNUT_SUBSCRIPTION.md)
📖 Tokenomics deep-dive: [`docs/TOKENOMICS.md`](docs/TOKENOMICS.md)

---

## 🤝 Contributing

BigNuten uses a **$BNUT bounty system** powered by GitHub Actions to reward contributors.

### How It Works (v2.0.0)

1. **Find a bounty issue** — issues labelled `bounty: N BNUT` are open for community contributors
2. **Register first** — all contributors must be personally onboarded by `@TheJollyLaMa` (video call or direct contact) before a payout can be queued — see [`CONTRIBUTING.md`](CONTRIBUTING.md)
3. **Comment and get assigned** — express interest on the issue, get assigned by a maintainer
4. **Do the work and open a PR** — include `Closes #N` in the PR body
5. **Get merged → get paid** — the Bounty Bot automatically queues your $BNUT payout
6. **Payout settled** — the maintainer settles pending payouts via the Admin Panel → $BNUT sent to your wallet on Optimism

### Bounty Tiers

| Complexity | Suggested Bounty |
|---|---|
| Documentation | 100–250 BNUT |
| Bug Fix | 250–500 BNUT |
| Feature (small) | 500–1,000 BNUT |
| Feature (large) | 1,000–5,000 BNUT |
| Audit / Security | 5,000+ BNUT |

### Applying a Bounty Label (Maintainers)

Run **Actions → Bounty Label → Run workflow**, enter the issue number and BNUT amount. Label format: `bounty: <amount> BNUT`.

### Contributor Accounts

Registered contributors are tracked in [`contributor-accounts.json`](contributor-accounts.json). Wallet addresses are added by the maintainer after personal onboarding — contributors should **not** open PRs to self-register.

Full guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## 🔁 How to Clone BigNuten for New Projects

BigNuten is designed to be forkable. You can use it as a starting point for your own open-source project with on-chain bounties and a contributor payroll.

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/TheJollyLaMa/BigNuten_Vanilla.git my-project
cd my-project

# 2. Install Hardhat toolchain (for contract deployment)
npm install

# 3. Configure environment variables
cp .env.example .env
# Fill in: PRIVATE_KEY, OPTIMISM_RPC_URL, ETHERSCAN_API_KEY

# 4. Deploy your own contracts
npx hardhat run scripts/deploy.js --network optimism

# 5. Update contract addresses in the app
# Edit js/contracts.js with your deployed addresses
```

### Customise for Your Project

| File | What to Change |
|------|---------------|
| `js/contracts.js` | Replace contract addresses with your deployments |
| `contributor-accounts.json` | Replace with your initial contributor list |
| `payroll-queue.json` | Reset to `{ "pending": [], "settled": [] }` |
| `.github/CODEOWNERS` | Replace `@TheJollyLaMa` with your GitHub username |
| `.github/workflows/*.yml` | Update `GITHUB_REPOSITORY` references if needed |
| `index.html` | Customise branding, colors, and modals |
| `css/styles.css` | Update theme |

### What You Get Out of the Box

- ✅ Automated bounty labelling, announcement, and queue system
- ✅ Payroll queue with validation and audit trail
- ✅ Admin Panel for treasury, contributors, and payroll management
- ✅ On-chain payout via BigNutenTreasury (deploy your own instance)
- ✅ Branch protection and CODEOWNERS policy
- ✅ IPFS backup, MetaMask wallet, governance, data-sharing

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Modules) |
| Charts | Chart.js + chartjs-adapter-date-fns |
| Storage | web3.storage w3up client (IPFS) |
| Wallet | MetaMask / EIP-1193 |
| Smart Contracts | Solidity ^0.8.20, OpenZeppelin v5, Hardhat |
| Blockchain | Optimism Mainnet (Chain ID: 10) |
| Subscriptions | DecentEscrow v0.1 (external) |
| Fonts | Bungee (Google Fonts) |

---

## 🚀 Getting Started

```bash
git clone https://github.com/TheJollyLaMa/BigNuten_Vanilla.git
cd BigNuten_Vanilla
```

1. Open `index.html` in your browser — **no build step needed!**
2. Connect your **MetaMask** wallet using the wallet button (Optimism Mainnet)
3. Connect **IPFS** via the IPFS icon (requires a [web3.storage](https://web3.storage) account)
4. Start logging your weight, supplements, food, and exercise!

> Owner wallets automatically see the **Admin Panel** in the top navigation. See [Admin Panel](#-admin-panel) above.

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Made with 💪 by <a href="https://github.com/TheJollyLaMa">TheJollyLaMa</a><br/>
  <em>"Another Decent Frankenstein" — built in the open, one issue at a time.</em>
</p>
