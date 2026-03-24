# Contributing to BigNuten

Thank you for your interest in contributing to **BigNuten**! This project uses a $BNUT bounty system — automated end-to-end via GitHub Actions — to reward contributors on Optimism Mainnet.

---

## 📋 Table of Contents

1. [Bounty System Overview](#bounty-system-overview)
2. [Idea → Bounty Credit Flow](#idea--bounty-credit-flow)
3. [Whitelist Registration](#whitelist-registration)
4. [How to Claim a Bounty](#how-to-claim-a-bounty)
5. [Payout Timeline](#payout-timeline)
6. [Code of Conduct](#code-of-conduct)

---

## Bounty System Overview

BigNuten uses a **$BNUT bounty system** powered by GitHub Actions to reward contributors for closing issues. Issues labelled `bounty: N BNUT` carry a reward paid out in $BNUT on **Optimism Mainnet** via the BigNutenTreasury smart contract.

### Bounty Tiers

| Complexity | Suggested Bounty |
|---|---|
| Documentation | 100–250 BNUT |
| Bug Fix | 250–500 BNUT |
| Feature (small) | 500–1,000 BNUT |
| Feature (large) | 1,000–5,000 BNUT |
| Audit / Security | 5,000+ BNUT |

### How It Works (v2.0.0)

1. Maintainer applies a `bounty: N BNUT` label to an issue via **Actions → Bounty Label**.
2. Maintainer assigns the issue to a whitelisted contributor.
3. **Bounty Bot** posts a reward announcement on the issue.
4. Contributor opens a PR with `Closes #N` in the body and gets it merged.
5. **Bounty Bot** automatically appends an entry to `payroll-queue.json` and increments `bnutPending` in `contributor-accounts.json`.
6. Maintainer settles pending payouts via **Admin Panel → Payroll** → MetaMask → BigNutenTreasury.
7. $BNUT lands in the contributor's wallet on Optimism.

See [`docs/TOKENOMICS.md`](docs/TOKENOMICS.md) for the full payroll queue and settle cycle details.

---

## Idea → Bounty Credit Flow

BigNuten recognises that great ideas often come from community members who may not write the code. If your idea is adopted for implementation, you earn $BNUT too — automatically.

### How It Works

1. **Submit your idea** — open a Discussion or non-code Issue with a clearly described feature or improvement.
2. **Community validates** — upvotes, comments, and discussion help maintainers assess the idea.
3. **Maintainer adopts** — if chosen, the maintainer runs **Actions → Idea Adopted Label** with your GitHub username. This applies:
   - 🟣 `idea-adopted` label — marks the idea as accepted for implementation.
   - 🔵 `idea-credit: @you` label — credits you as the idea originator.
4. **Implementation** — a contributor (possibly you!) implements it and opens a PR closing the issue.
5. **Automatic payout split** — when the PR is merged, the Bounty Bot queues two payroll entries:
   - **20% of the bounty** → you (idea originator, `role: "idea-originator"`) — e.g. `0.2 BNUT` for a 1 BNUT bounty
   - **80% of the bounty** → the implementer (`role: "implementer"`) — e.g. `0.8 BNUT` for a 1 BNUT bounty
6. **Settled** — the maintainer processes payroll as normal. Your $BNUT lands in your whitelisted wallet.
7. **Feature Originator DNFT (major features)** — for significant features, the maintainer may also mint a **Feature Originator DNFT** and send it to your wallet as a permanent on-chain record.

> 💡 **Don't have a wallet yet?** Contact `@TheJollyLaMa` to complete onboarding and register your Optimism Mainnet address before the payout is processed.

### Tips for a Strong Idea Submission

- Be specific: describe the _problem_ and a possible _solution_.
- Include context: why this matters to the BigNuten community.
- Reference related issues or discussions if any exist.
- Add mockups or examples if helpful.

---

## Whitelist Registration

> ⚠️ **Payouts are only sent to wallets registered in the contributor whitelist.**

To protect contributors and the project from impersonation and phishing during the early phase, wallet addresses are **not** self-registered via PR. Instead:

- The maintainer (`@TheJollyLaMa`) personally onboards each contributor.
- Onboarding is done via a **video call or direct contact** to verify identity.
- After onboarding, the maintainer adds the contributor's GitHub username and Optimism Mainnet wallet address to [`contributor-accounts.json`](contributor-accounts.json).
- Whitelist entries are public (standard Web3 transparency), but only the maintainer can add new contributors.

### How to Get Whitelisted

1. **Express interest** — comment on the bounty issue you want to work on, or reach out to `@TheJollyLaMa` directly.
2. **Schedule onboarding** — the maintainer will contact you to arrange a brief video call or direct conversation.
3. **Provide your wallet privately** — share your **Optimism Mainnet** wallet address with the maintainer during onboarding. **Do not post your wallet address publicly in issues or PRs.**
4. **Get added** — the maintainer adds your entry to `contributor-accounts.json` and assigns you to the issue.

> 💡 Until you are whitelisted, no $BNUT payout can be processed for your work — even if your PR is merged. Please complete onboarding **before** you start work on a bounty issue.

---

## How to Claim a Bounty

Once you are whitelisted:

1. **Comment** on a `bounty: N BNUT`-labelled issue to express interest.
2. **Get assigned** by `@TheJollyLaMa`.
3. **Fork the repo** and create a feature branch.
4. **Complete the work** described in the issue.
5. **Open a Pull Request** that references the issue with `Closes #N` in the PR body.
6. **Get your PR merged** — the Bounty Bot automatically appends your payout to the payroll queue and posts a confirmation comment on the issue.
7. **Payout settled** — the maintainer settles all pending payouts via the Admin Panel. $BNUT is sent directly to your whitelisted wallet on Optimism.

---

## Payout Timeline

| Event | Who | When |
|---|---|---|
| PR merged | GitHub Actions (Bounty Bot) | Immediately — entry added to `payroll-queue.json` |
| Queue validated | GitHub Actions (Validate) | Within minutes — format and whitelist check |
| Payroll settled | Maintainer (Admin Panel + MetaMask) | Within days — batch payout to all pending contributors |
| On-chain confirmed | BigNutenTreasury (Optimism) | After MetaMask confirmation — `ContributorPaid` event |
| Ledger committed | Maintainer (settle-payroll.yml) | After on-chain confirmation — `payroll-queue.json` updated |

You can always check your payout status by:
- Looking at `payroll-queue.json` — your entry will be in `pending[]` until settled, then move to `settled[]`
- Looking at your wallet on [Optimistic Etherscan](https://optimistic.etherscan.io) for incoming $BNUT transfers from the treasury

---

## Code of Conduct

- Be respectful and constructive in all communications.
- Do not attempt to register wallet addresses on behalf of other contributors.
- Do not share wallet addresses publicly in issues, PRs, or comments.
- Impersonation or any attempt to fraudulently claim a bounty will result in permanent removal from the contributor whitelist.
