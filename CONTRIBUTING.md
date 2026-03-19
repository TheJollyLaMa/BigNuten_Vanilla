# Contributing to BigNuten

Thank you for your interest in contributing to **BigNuten**! This project uses a $BNUT bounty system to reward contributors. Please read this guide carefully before starting work on any bounty issue.

---

## 📋 Table of Contents

1. [Bounty System Overview](#bounty-system-overview)
2. [Whitelist Registration](#whitelist-registration)
3. [How to Claim a Bounty](#how-to-claim-a-bounty)
4. [Code of Conduct](#code-of-conduct)

---

## Bounty System Overview

BigNuten uses a **$BNUT bounty system** to reward contributors for closing GitHub issues. Issues labelled `bounty: N BNUT` carry a reward that is paid out in $BNUT on **Optimism Mainnet** via the BigNutenTreasury smart contract.

Bounty amounts follow these rough tiers:

| Complexity       | Suggested Bounty  |
|------------------|-------------------|
| Documentation    | 100–250 BNUT      |
| Bug Fix          | 250–500 BNUT      |
| Feature (small)  | 500–1000 BNUT     |
| Feature (large)  | 1000–5000 BNUT    |
| Audit / Security | 5000+ BNUT        |

See [`docs/TOKENOMICS.md`](docs/TOKENOMICS.md) for the complete bounty process and token details.

---

## Whitelist Registration

> ⚠️ **Payouts are only sent to wallets registered in the contributor whitelist.**

To protect contributors and the project from impersonation and phishing during the early phase, wallet addresses are **not** self-registered via PR. Instead:

- The maintainer (`@TheJollyLaMa`) personally onboards each contributor.
- Onboarding is done via a **video call or direct contact** to verify identity.
- After onboarding, the maintainer adds the contributor's GitHub username and Optimism Mainnet wallet address to [`contributor-accounts.json`](contributor-accounts.json).
- Whitelist entries are public (standard Web3 transparency), but only the maintainer can add new contributors.

### How to Get Whitelisted

1. **Express interest** — comment on the issue you want to work on, or reach out to `@TheJollyLaMa` directly.
2. **Schedule onboarding** — the maintainer will contact you to arrange a brief video call or direct conversation to verify your identity and collect your wallet address.
3. **Provide your wallet** — during onboarding, share your **Optimism Mainnet** wallet address privately with the maintainer. **Do not post your wallet address publicly in issues or PRs.**
4. **Get added** — the maintainer will add your entry to `contributor-accounts.json` and assign you to the issue.

> 💡 Until you are whitelisted, no $BNUT payout can be processed for your work — even if your PR is merged. Please complete onboarding before you start work on a bounty issue.

---

## How to Claim a Bounty

Once you are whitelisted:

1. **Comment** on a `bounty: N BNUT`-labelled issue to express interest.
2. **Get assigned** by `@TheJollyLaMa`.
3. **Fork the repo** and create a feature branch.
4. **Complete the work** described in the issue.
5. **Open a Pull Request** that references the issue with `Closes #N` in the PR body.
6. **Get your PR merged** — the Bounty Bot will automatically notify `@TheJollyLaMa` to queue your payout.
7. **Payout** — the maintainer looks up your whitelisted address in `contributor-accounts.json` and queues the $BNUT transfer via the [BigNuten app](https://thejollylama.github.io/BigNuten_Vanilla/) Payroll panel.

---

## Code of Conduct

- Be respectful and constructive in all communications.
- Do not attempt to register wallet addresses on behalf of other contributors.
- Do not share wallet addresses publicly in issues, PRs, or comments.
- Impersonation or any attempt to fraudulently claim a bounty will result in permanent removal from the contributor whitelist.
