# ⚕︎ BigNuten ⚕︎
### Wellness and Wealth — Open Source

> **BigNuten is a privacy-first, Web3-powered wellness platform** that lets you log every dimension of your health — nutrition, workouts, supplements, emotions, breathwork, yoga, and more — while earning $BNUT tokens, participating in on-chain StreakBet competitions with real stakes, and governing the future of the platform as a DAO member. Built with zero backend, zero build steps, and open to every kind of contributor.

![Version](https://img.shields.io/badge/version-v3.1.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Built With](https://img.shields.io/badge/built%20with-Vanilla%20JS-yellow?style=flat-square)
![Solidity](https://img.shields.io/badge/contracts-Solidity%200.8.20-363636?style=flat-square&logo=ethereum)
![Storage](https://img.shields.io/badge/storage-IPFS%20via%20Pinata-blueviolet?style=flat-square)
![Wallet](https://img.shields.io/badge/wallet-MetaMask-orange?style=flat-square)
[![Early Supporter DNFT](https://img.shields.io/badge/Early%20Access-100%20DNFTs-8b00ff?style=flat-square&logo=ethereum)](https://thejollylama.github.io/DecentMarket/)
[![v2.0.0 DNFT Minted](https://img.shields.io/badge/v2.0.0%20DNFT-Minted%20%E2%9C%94-gold?style=flat-square&logo=ethereum)](https://thejollylama.github.io/DecentMarket/)
[![Network](https://img.shields.io/badge/network-Base%20Mainnet-0052ff?style=flat-square&logo=ethereum)](https://basescan.org)

> **Network update:** BigNuten’s application contracts are deployed on **Base Mainnet**. The replacement StreakBet review engine and its first hydration award set are live; the first challenge still needs its stake and meetup schedule. Legacy Optimism contracts remain archival references.

---

## 🗺️ Platform at a Glance

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                        ⚕︎  B I G N U T E N  ⚕︎                              ║
║               "Wellness and Wealth — Open Source"                            ║
╠══════════════════════╦══════════════════════╦═══════════════════════════════╣
║  🏋️ APP LAYER        ║  🤖 AUTOMATION LAYER ║  🏛️ GOVERNANCE / DAO LAYER   ║
║                      ║                      ║                               ║
║  • Nutrition logger  ║  • Bounty Bot        ║  • BigNutenGov on-chain       ║
║  • Workout tracker   ║  • Payroll queue     ║  • $BNUT holder voting        ║
║  • Supplement log    ║  • GitHub Actions    ║  • DNFT proposer role         ║
║  • Emotions / Mood   ║  • settle-payroll    ║  • On-chain enact / veto      ║
║  • Pain tracker      ║  • validate-queue    ║  • Treasury-controlled fund   ║
║  • Breathwork        ║  • DecentEscrow      ║                               ║
║  • Yoga flow         ║  • StreakBetEscrow   ║  🏦 TREASURY LAYER            ║
║  • Chakra tracker    ║  • Aave V3 yield     ║                               ║
║  • StreakBet comps   ║  • Smart contracts   ║  • BigNutenTreasury           ║
║  • Genie AI chat     ║  • IPFS report chain ║  • $BNUT ERC-20 token         ║
║  • Community dash    ║  • DeFi dashboard    ║  • DecentEscrow subs          ║
║  • Sun/Moon tracker  ║  • Streak verifier   ║  • DNFT (ERC-1155)            ║
╠══════════════════════╩══════════════════════╩═══════════════════════════════╣
║                           DATA FLOW                                          ║
║                                                                              ║
║  User logs data ──► localStorage + IPFS snapshot ──► Streak verifier        ║
║         │                                                  │                 ║
║         └────────► StreakBetEscrow (on-chain) ◄────────────┘                ║
║                           │                                                  ║
║                    Aave V3 yield pool                                        ║
║                           │                                                  ║
║             Winners paid out ──► BigNutenTreasury                           ║
║                                          │                                   ║
║              GitHub PR merged ──► Bounty Bot ──► payroll-queue.json         ║
║                                          │                                   ║
║                    Admin settles ──► batchPayContributors() on active network      ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Table of Contents

1. [Project Vision](#-project-vision)
2. [What is BigNuten?](#️-what-is-bignuten)
3. [The App Layer](#-the-app-layer)
4. [Automation / Payroll Layer](#-automation--payroll-layer)
5. [Governance & Treasury Layer](#️-governance--treasury-layer)
6. [StreakBet Competitions](#-streakbet-competitions)
7. [Quickstart — Pick Your Role](#-quickstart--pick-your-role)
8. [What's Shipped (v3.1.0)](#-v310--whats-shipped)
9. [Bounty & Treasury Flow](#-bounty--treasury-flow)
10. [Admin Panel](#️-admin-panel)
11. [Payroll Queue](#-payroll-queue)
12. [Workflow Security & Policy](#-workflow-security--policy)
13. [Early Supporter DNFT](#-become-an-early-supporter)
14. [v2.0.0 Monetization Stack DNFT](#️-v200-monetization-stack-dnft)
15. [$BNUT Token](#-bnut-token)
16. [Contributing](#-contributing)
17. [How to Clone BigNuten](#-how-to-clone-bignuten-for-new-projects)
18. [Tech Stack](#-tech-stack)
19. [Getting Started](#-getting-started)
20. [License](#-license)

---

## 🌟 Project Vision

> *"Wellness and Wealth — Open Source."*

BigNuten exists because tracking your health shouldn't require surrendering your data to a corporation, and building open-source software shouldn't be unpaid labour. We are building a platform that:

- **Gives you ownership** of your wellness data — stored locally, backed up to IPFS, never sold
- **Rewards builders** who improve it — every merged PR earns on-chain $BNUT tokens automatically
- **Lets the community govern** its direction — DAO voting, on-chain proposals, transparent treasury
- **Puts real stakes on your habits** — join reusable StreakBet challenges with peer-verified meetups; Aave yield is a separate optional strategy, not active in the first Base cycle

This isn't a toy. Whether you come to track your macros, contribute a feature, or vote on the roadmap, BigNuten is a fully functioning platform with a live token economy, working smart contracts, and a community that has skin in the game. Come build. Come track. Come earn. 🎉

---

## 🏋️ What is BigNuten?

BigNuten is a **fully client-side, privacy-first wellness platform** built with zero backend and zero build steps. It runs directly in the browser and gives you complete ownership of your health data.

**Who should use it?**
- 🧘 **Health users** — anyone who wants a comprehensive, private, and beautiful tracker for every dimension of their wellness
- 🛠️ **Builders** — open-source developers who want to earn $BNUT bounties while building something real
- 🗳️ **DAO participants** — $BNUT/$DNFT holders who want to shape the roadmap and control the treasury

---

## 🏃 The App Layer

Everything accessible to every user in the browser — no wallet required to start:

### Daily Data Logging

| Module | What it tracks |
|--------|---------------|
| 🥗 **Nutrition** | Food intake, macros, dietary guidance, raw food logger |
| 💊 **Supplements** | Full supplement stack — vitamins, minerals, custom additions |
| 🏋️ **Workouts** | Exercise sessions, sets/reps/weights, activity types |
| ⚖️ **Weight** | Time-series weight chart with trend lines (Chart.js) |
| 😊 **Emotions / Mood** | Feelings wheel with granular emotion selection |
| 🌀 **Chakra** | Chakra energy tracker with visualization |
| 🤕 **Pain** | Body pain location and intensity logging |
| 🌬️ **Breathwork** | Guided breathing exercises and session logging |
| 🧘 **Yoga Flow** | 12 pose library with custom sequences, SVG animations, session log |
| 💧 **Hydration** | Daily water intake tracking (used by StreakBet verifier) |
| 🌙 **Astronomy** | Moon phase, Vedic Tithi, Ekadasi calendar, Sun position |

### Intelligence & Insights

- 🧞 **Genie AI** — on-device or cloud-hosted LLM chat assistant (WebLLM / GitHub Models / OpenAI) with 3-tier memory (session → summaries → pinned insights), context-aware of your logged data across 10 categories
- 📊 **Correlation Graph** — visualize relationships between any two data streams (e.g. sleep vs. mood, water vs. energy)
- 🌐 **Community Dashboard** — opt-in aggregated wellness data, leaderboards, community trends

### Data Ownership

- **IPFS backup & restore** via hosted Pinata relay, personal Pinata, or local IPFS Desktop
- **Private-by-default storage** — Render authorizes uploads while file contents travel directly from the browser to Pinata
- **MetaMask wallet connection** for Base Mainnet Web3 identity
- **No backend** — fully client-side; if the servers go dark, your browser still works

---

## 🤖 Automation / Payroll Layer

This is the "repo side" of BigNuten — the machinery that pays builders and keeps the project funded:

### GitHub Actions Bots

| Bot | Trigger | What it does |
|-----|---------|-------------|
| **Bounty Label** | Manual dispatch | Creates `bounty: N BNUT` label, posts announcement on issue |
| **Bounty Bot** | PR merged | Auto-queues contributor payout in `payroll-queue.json` |
| **Testing Bounty** | Issue comments | `/test-complete` claims QA bounty; `/test-approved` queues tester payout |
| **Bounty Payout** | Manual dispatch | Fallback manual payout queue entry |
| **Settle Payroll** | Manual dispatch | Moves `pending[]` → `settled[]` after on-chain tx |
| **Validate Queue** | Push / PR | Blocks merges with invalid entries |
| **Idea Label** | Manual dispatch | Credits idea originators with 80/20 split on merge |

### Smart Contract Integrations

- **BigNutenTreasury** — `batchPayContributors()` pays multiple contributors in one MetaMask tx
- **StreakBetEscrow** — one reusable engine for water, nutrition, exercise, weight, meetup verification, stakes, awards, and payouts
- **DecentEscrow** — subscription plan management (ETH and $BNUT plans)
- **Aave V3** — optional future yield adapter; Base BNUT is not currently an Aave reserve

### DeFi Dashboard

- Movement history with on-chain event scraping (Aave V3 + Alchemix V2)
- CSV export and clipboard copy
- 10k block range scraping with 10-minute cooldown

---

## 🏛️ Governance & Treasury Layer

### On-Chain Network Status

#### Base Mainnet (default)

| Contract | Role | Address |
|----------|------|---------|
| **$BNUT** (ERC-20) | Governance token, rewards currency, default live BNUT | [`0x25AC…3736`](https://basescan.org/token/0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736) |
| **BigNutenTreasury** | BNUT reserve and contributor payouts | [`0x9aC9…D09E`](https://basescan.org/address/0x9aC977ED07953B97575CdE424C9bb67b53D9D09E) |
| **BigNutenGov** | On-chain proposals and voting | [`0x9c9A…FC5a`](https://basescan.org/address/0x9c9AE39400b9c723Dd395211aB643EAC3dFBFC5a) |
| **BigNutenNetworkRegistry** | Community data registry | [`0x0670…5E75`](https://basescan.org/address/0x0670B43b689D51Fd04741b52507D4f87c24A5E75) |
| **DecentEscrow** | Subscription and DNFT escrow; plans/listings need setup | [`0x31b0…C89d`](https://basescan.org/address/0x31b07b83e99A9bdF379bf40225b8A80d3804C89d) |
| **DecentNFT** | ERC-1155 collection; hydration award IDs `0–3` registered | [`0xe63E…439B`](https://basescan.org/address/0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B) |
| **StreakBetEscrow** | Replacement review engine; BNUT, Treasury, and hydration awards configured | [`0xFfd8…7C95`](https://basescan.org/address/0xFfd8453Ee3b2fF62DC2132Dd59a42F9f50447C95) |
| **Retired StreakBetEscrow** | Old engine, paused; no competitions were created | [`0x53CE…5614`](https://basescan.org/address/0x53CEF3c2511bd648DC104aF8e593b01895A35614) |

New BigNuten collection, competition, or award metadata without an image uses
the BigNuten favicon (`img/BigNuten.png`) automatically when published; explicit
custom artwork is preserved.

The current meetup policy trusts a solo entrant’s self-check-in. With multiple
entrants, a self-claim plus one peer approval verifies attendance. A disagreement
stays pending; the captain can invite an outside, no-stake guest. Three or more
votes resolve only by strict majority, so ties stay open for another invited
reviewer. Each challenge snapshots its own four award IDs when configured.

#### Optimism Mainnet (legacy archive only)

| Contract | Role | Address |
|----------|------|---------|
| **$BNUT** (ERC-20) | Legacy fallback BNUT deployment | [`0x733c…8823`](https://optimistic.etherscan.io/token/0x733c4d2Aae900E608147dd89Fa93606f89722823) |
| **BigNutenTreasury** | Holds $BNUT reserve, pays contributors | [`0x143c…363`](https://optimistic.etherscan.io/address/0x143cC41AC075FFA40be1993827DA6ffB4638A363) |
| **BigNutenGov** | On-chain proposals and voting | [`0x58c2…E2cD`](https://optimistic.etherscan.io/address/0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD) |
| **DecentEscrow** | Subscription plans (ETH + $BNUT) | [`0x23A4…350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) |
| **DecentNFT** | Early Supporter DNFT (ERC-1155) | [`0xe870…958`](https://optimistic.etherscan.io/address/0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958) |
| **StreakBetEscrow** | Competition staking, Aave yield, payouts | [`0x80f6…7215`](https://optimistic.etherscan.io/address/0x80f6492eFD6D27c877B2bd0936451f7AF61c7215) |

### Governance Rules

- **1 $BNUT = 1 vote** (1 wallet = 1 vote; no whale capture)
- **DNFT holders** get `PROPOSER_ROLE` — can create on-chain proposals
- **Admin** can enact or veto proposals via the governance modal
- Full governance module: `js/governance.js`

### Off-Chain (GitHub / IPFS)

- `payroll-queue.json` — authoritative ledger of pending and settled payouts
- `contributor-accounts.json` — whitelisted contributor wallet registry
- IPFS report chain for competition records and settlement history
- All sensitive state changes require a CODEOWNER review before merge

### Treasury Flow

```
DNFT sales / Subscriptions
          │
          ▼
  DecentEscrow (on-chain)
          │
          ▼
  Shared Base Settlements Router ──► Contributor wallets
          │
          ▼
  $BNUT minted / distributed ──► Data sharing rewards ──► Governance staking
```

---

## 🏆 StreakBet Competitions

StreakBet is BigNuten's flagship community feature: put real stakes on your health habits.

### How It Works

1. **Captain creates a competition** — sets name, BNUT stake, challenge dates, and optional `streak-rules.json` CID describing one or more activity metrics and goals
2. **Users enter** — stake their tokens into `StreakBetEscrow` on-chain
3. **Track activity and meet peers** — app rules calculate qualifying days from local hydration, weight, exercise, or nutrition logs; four scheduled meetups use an invite code and adaptive review
4. **Share stats only by choice** — detailed wallet-linked progress can be published to public IPFS only after a participant opts in; the CID is linked by StreakBet's report event
5. **Review and settlement** — solo logs are trusted; agreement verifies with minimal reviewers. Disputes stay pending until a strict majority, with captain-invited guests available to break ties. Uncompleted or majority-rejected entrants forfeit; completers share BNUT by leaderboard rules and receive that competition’s Achievement DNFT IDs
6. **Future strategies** — swaps, Aave yield, and borrowing are separate reviewed work; the current Base pilot does not convert BNUT or promise yield

### StreakBetEscrow Contract

- `createCompetition(CreateParams)` — single-struct competition creation
- `joinCompetition(id)` — stake tokens, enter the competition
- `submitReport(id, proofCID)` — link an optional participant report CID
- `scheduleMeetup()` / `selfCheckInMeetup()` / `reviewMeetupAttendance()` — schedule invite-code sessions and record peer decisions
- `settleCompetition(id, leaderboardCID)` — apply the configured payout policy
- `forfeit(id)` — early exit (stake goes to pot)
- Powered by OpenZeppelin v5 `ReentrancyGuard`, `SafeERC20`, `Pausable`

---

## 🚀 Quickstart — Pick Your Role

### 🧘 I'm a Health User

```bash
# No installation needed — just open the app in your browser
# 1. Clone or download
git clone https://github.com/TheJollyLaMa/BigNuten_Vanilla.git
cd BigNuten_Vanilla

# 2. Open index.html in any modern browser
open index.html   # macOS
# or just drag index.html into your browser
```

- Start logging weight, supplements, food, and exercise — no wallet needed
- Connect **MetaMask** on Base to unlock Base-deployed on-chain features
- Use the left-header IPFS control to choose hosted Pinata, personal Pinata, or local IPFS Desktop
- Join a StreakBet competition and put real money on your health goals 💪

### 🛠️ I'm a Builder

```bash
# 1. Fork & clone
git clone https://github.com/TheJollyLaMa/BigNuten_Vanilla.git
cd BigNuten_Vanilla

# 2. Install Hardhat toolchain (for contract work only)
npm install

# 3. Compile contracts
npx hardhat compile

# 4. Run contract tests
npx hardhat test
```

- Browse **[open issues with `bounty:` labels](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues?q=label%3Abounty)** — each has a $BNUT reward
- Read [`CONTRIBUTING.md`](CONTRIBUTING.md) — all contributors must be personally onboarded before payout
- Open a PR with `Closes #N` in the body — the Bounty Bot queues your $BNUT automatically on merge
- Frontend is Vanilla JS (no framework, no bundler) — `js/` for modules, `css/styles.css`, `index.html`
- Smart contracts are in `contracts/` — Solidity 0.8.20, tested with Hardhat + OZ 5.x

### 🗳️ I'm a DAO / Governance Participant

- **Hold $BNUT** — the app defaults to the live Base token; the older Optimism token remains an archival network option
- **Get a DNFT** — purchase an [Early Supporter DNFT](https://thejollylama.github.io/DecentMarket/) to gain `PROPOSER_ROLE`
- **Create proposals** via the Governance modal in the app (DNFT required)
- **Vote** on proposals — 1 wallet = 1 vote, minimum 1 $BNUT to participate
- **Track treasury** — follow the live Base treasury on [BaseScan](https://basescan.org/address/0x9aC977ED07953B97575CdE424C9bb67b53D9D09E)

---

## ✅ v3.1.0 — What's Shipped

v3.1.0 builds on the full monetization stack of v2.0.0, adding StreakBet competitions, Yoga Flow, Chakra tracking, Genie AI, DeFi dashboard, Community Dashboard, and the complete admin competition layer. BigNuten is now a **fully layered wellness platform** with an on-chain economy.

### 🪙 Token Economy
- ✅ $BNUT ERC-20 token deployed on Base Mainnet as the default live network
- ✅ BigNutenTreasury contract deployed — holds all $BNUT reserves, direct contributor payouts
- ✅ Base DecentEscrow deployed; ETH and BNUT subscription plans still need configuration
- ✅ Data-sharing reward settlement via the dedicated ArtFi `bignuten-health-data-rewards` fund (active, currently unfunded)

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
│     ➜ ContributorPaid event emitted on the active payout network                     │
│     ➜ settle-payroll.yml moves entries: pending → settled           │
│     ➜ txHash + settledAt recorded in payroll-queue.json             │
│                                                                     │
│  5. ON-CHAIN VERIFICATION                                           │
│     Anyone can verify ContributorPaid(contributor, issueRef, amount)        │
│     events on the live Base treasury deployment; verify them at BaseScan.   │
│     Legacy Optimism payout history remains available for archival review.   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

  GitHub Actions         payroll-queue.json        Active Network
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
| $BNUT (ERC-20) | Base Mainnet (default) | [`0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736`](https://basescan.org/token/0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736) |
| BigNutenTreasury | Base Mainnet | [`0x9aC977ED07953B97575CdE424C9bb67b53D9D09E`](https://basescan.org/address/0x9aC977ED07953B97575CdE424C9bb67b53D9D09E) |
| BigNutenGov | Base Mainnet | [`0x9c9AE39400b9c723Dd395211aB643EAC3dFBFC5a`](https://basescan.org/address/0x9c9AE39400b9c723Dd395211aB643EAC3dFBFC5a) |
| BigNutenNetworkRegistry | Base Mainnet | [`0x0670B43b689D51Fd04741b52507D4f87c24A5E75`](https://basescan.org/address/0x0670B43b689D51Fd04741b52507D4f87c24A5E75) |
| DecentEscrow v0.1 | Base Mainnet | [`0x31b07b83e99A9bdF379bf40225b8A80d3804C89d`](https://basescan.org/address/0x31b07b83e99A9bdF379bf40225b8A80d3804C89d) |
| DecentNFT v0.2 | Base Mainnet | [`0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B`](https://basescan.org/address/0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B) |
| StreakBetEscrow | Base Mainnet | [`0xFfd8453Ee3b2fF62DC2132Dd59a42F9f50447C95`](https://basescan.org/address/0xFfd8453Ee3b2fF62DC2132Dd59a42F9f50447C95) |

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
      "contributor": "0xABC...",                         // Selected-network wallet (Base default, Optimism fallback)
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
| **Supply** | 100 editions max on the legacy Optimism collection |
| **Standard** | ERC-1155 on Optimism (legacy collection) |
| **DNFT Contract** | [`0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958`](https://optimistic.etherscan.io/address/0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958) — DecentNFT v0.2 |
| **Escrow Contract** | [`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) — DecentEscrow v0.1 |

### How to Buy

#### 🔗 Option 1 — Crypto (instant & trustless)

1. Visit **[DecentMarket](https://thejollylama.github.io/DecentMarket/)** or use the **🎟️ Buy Now** button inside BigNuten
2. The existing Early Supporter editions are on Optimism. The new Base DecentNFT and escrow are deployed, but their metadata and listing are not configured yet.
3. When a listing is active, connect to its network, approve the listed USDC amount, and confirm — escrow releases the DNFT automatically on-chain.

#### 💳 Option 2 — PayPal (fiat-friendly)

1. Open the **About modal** inside BigNuten and scroll to the Early Supporter section
2. Enter your wallet address (to receive the DNFT)
3. Click **💳 Buy with PayPal — $100** and complete checkout
4. `@TheJollyLaMa` verifies the payment and transfers your DNFT manually

### Community Escrow

New Base DNFT sale proceeds will flow to the **[Base DecentEscrow contract](https://basescan.org/address/0x31b07b83e99A9bdF379bf40225b8A80d3804C89d)** once its metadata and listing are configured. Existing Early Supporter editions remain on the legacy Optimism contracts. Funds are intended for:

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
- 🪙 **$BNUT token** — ERC-20 governance and rewards token now deployed on Base Mainnet by default
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
| Default Network | Base Mainnet |
| Default Contract | [`0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736`](https://basescan.org/token/0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736) |
| Optimism Fallback | [`0x733c4d2Aae900E608147dd89Fa93606f89722823`](https://optimistic.etherscan.io/token/0x733c4d2Aae900E608147dd89Fa93606f89722823) |
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

Subscriptions will use the deployed Base **DecentEscrow** (`0x31b07b83e99A9bdF379bf40225b8A80d3804C89d`). Its ETH and BNUT plans still need to be created before subscription purchases can start. Planned plans:

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
6. **Payout settled** — the maintainer settles pending payouts via the Admin Panel → $BNUT sent to your wallet on the selected payout network; the Base treasury is deployed and must be funded/authorized for payouts

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

### Language Composition

| Language | % | Role |
|----------|---|------|
| JavaScript (ES Modules) | ~62% | All app logic — tracking modules, Web3 integrations, AI chat, admin panel |
| CSS3 | ~25% | Full custom design system, responsive layouts, animations |
| HTML5 | ~10% | Single-page app shell (`index.html`) |
| Solidity | ~3% | Smart contracts — $BNUT, Treasury, Governance, StreakBetEscrow |

### Key Libraries & Tools

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES Modules) — no framework, no bundler |
| **Charts** | Chart.js + chartjs-adapter-date-fns |
| **Storage** | Pinata client (IPFS) |
| **Wallet** | MetaMask / EIP-1193 |
| **Smart Contracts** | Solidity ^0.8.20, OpenZeppelin v5, Hardhat |
| **Contract Testing** | Hardhat + @nomicfoundation/hardhat-network-helpers |
| **Blockchain** | Base Mainnet (Chain ID: 8453); Optimism Mainnet retained as a legacy archive |
| **DeFi** | Aave V3 Pool (yield on competition pots), Alchemix V2 |
| **Subscriptions** | DecentEscrow v0.1 (external) |
| **AI / LLM** | WebLLM (local), GitHub Models (Azure), OpenAI GPT-4o |
| **Fonts** | Bungee (Google Fonts) |
| **Payments** | Stripe, PayPal (fiat on-ramp for DNFTs) |

### Snapshot schema

Snapshots now use the current `fitnessTrackerData` shape plus a lightweight wrapper for metadata. The inner payload remains the normalized data object from `fitnessData.js`, and wrapped snapshots can include `__bignutenSnapshot`, `version`, `createdAt`, `sessionAddress`, `sourceHash`, `previousSnapshot`, and `lineage` fields for recovery and history tracking.

### JS Module Map

```
js/
├── app.js               — Main app bootstrap, Admin Panel wiring, all IIFE init
├── fitnessData.js       — Central data schema, normalize, merge, IPFS snapshot
├── genieChat.js         — Genie AI: 3-backend LLM, 10 context categories, model picker
├── genieMemory.js       — 3-tier AI memory (session / summaries / pinned insights)
├── competitions.js      — StreakBet frontend: create/settle/cancel, IPFS report chain
├── streakVerify.js      — Auto-verifier: checks local logs, submits on-chain reports
├── governance.js        — BigNutenGov proposal + voting UI
├── treasury.js          — BigNutenTreasury balance + transfer UI
├── defi.js              — DeFi dashboard: Aave + Alchemix event scraping, history
├── yoga.js              — Yoga Flow modal: 12 poses, SVG animations, custom sequences
├── chakra.js            — Chakra energy tracker + visualization
├── feelingsWheel.js     — Granular emotion wheel
├── communityDashboard.js— Opt-in aggregated data, leaderboards
├── correlationGraph.js  — Cross-stream correlation visualizer
├── dataSharing.js       — Opt-in data sharing rewards
├── contracts.js         — Contract addresses + ABI imports
├── subscription.js      — DecentEscrow subscription management
├── pinataStorage.js — Pinata snapshot upload helper
└── admin.js             — Admin panel helpers
```

---

## 🚀 Getting Started

> **No build step, no backend, no npm required to run the app.** Just open `index.html`.

```bash
git clone https://github.com/TheJollyLaMa/BigNuten_Vanilla.git
cd BigNuten_Vanilla
```

1. Open `index.html` in your browser — **no build step needed!**
2. Connect your **MetaMask** wallet using the wallet button on Base Mainnet
3. Connect **IPFS** via the IPFS icon (requires a Pinata JWT)
4. Start logging your weight, supplements, food, and exercise!

> Owner wallets automatically see the **Admin Panel** in the top navigation. See [Admin Panel](#️-admin-panel) above.

### For Contract Development

```bash
npm install                              # Install Hardhat + OZ dependencies
npx hardhat compile                      # Compile Solidity contracts
npx hardhat test                         # Run contract test suite
npx hardhat run scripts/deploy.js --network optimism   # Deploy to Optimism
```

### Environment Setup

```bash
cp .env.example .env
# Fill in: PRIVATE_KEY, OPTIMISM_RPC_URL, ETHERSCAN_API_KEY
```

Full deployment guide: [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md)

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Made with 💪 by <a href="https://github.com/TheJollyLaMa">TheJollyLaMa</a><br/>
  <em>"Wellness and Wealth — Open Source" · Another Decent Frankenstein · built in the open, one issue at a time.</em>
</p>
