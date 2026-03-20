# BigNuten Payroll System

This document describes the complete payroll queue system introduced in v2.0.0 — how contributors get whitelisted, how bounties flow from issue to on-chain payout, and which scripts and workflows maintain the system.

---

## Table of Contents

1. [Overview](#overview)
2. [Contributor Registration](#contributor-registration)
3. [Payroll Queue Structure](#payroll-queue-structure)
4. [Workflow Reference](#workflow-reference)
5. [Scripts Reference](#scripts-reference)
6. [Settle Cycle Step-by-Step](#settle-cycle-step-by-step)
7. [Audit & Verification](#audit--verification)

---

## Overview

The payroll system is the end-to-end pipeline for rewarding contributors with $BNUT:

```
Issue labelled           PR merged            Admin settles
"bounty: N BNUT"    ─►  payout queued    ─►  on-chain payout
     │                       │                     │
bounty-label.yml        bounty-bot.yml        Admin Panel
                       payroll-queue.json    BigNutenTreasury
                       contributor-accounts.json  ContractPaid event
```

**Key design principle:** No private keys in CI. All on-chain actions go through the admin's MetaMask wallet in the BigNuten app. GitHub Actions only handles off-chain bookkeeping (JSON files).

---

## Contributor Registration

Before any $BNUT payout can be processed, the contributor must be registered in the whitelist.

### Whitelist File

[`contributor-accounts.json`](../contributor-accounts.json) — the authoritative list of registered contributors.

```jsonc
{
  "_comment": "Whitelist of registered contributors. Wallet addresses added by maintainer only.",
  "contributors": [
    {
      "github": "octocat",                              // GitHub username
      "displayName": "Octocat",                         // Human-readable name
      "role": "contributor",                            // "owner" or "contributor"
      "walletAddress": "0xABC...",                      // Optimism Mainnet address
      "bnutEarned": 0,                                  // Cumulative settled payouts
      "bnutPending": 0,                                 // Queued but not yet settled
      "issuesClosed": [],                               // Issue refs credited
      "registeredAt": "2026-03-20T00:00:00.000Z"       // Onboarding timestamp
    }
  ]
}
```

### Registration Process

1. Contributor expresses interest on a bounty issue or contacts `@TheJollyLaMa` directly.
2. Maintainer arranges a brief video call or direct conversation to verify identity and collect the Optimism Mainnet wallet address.
3. Maintainer opens **Admin Panel → Contributors Admin** in the BigNuten app:
   - Loads the current `contributor-accounts.json` from GitHub
   - Adds a new entry with the contributor's GitHub username, display name, and wallet address
   - Downloads the updated JSON
4. Maintainer commits the updated `contributor-accounts.json` to `main` (requires CODEOWNER review).
5. Contributor is assigned to the bounty issue — work can begin.

> ⚠️ Only the maintainer can add entries to `contributor-accounts.json`. Contributors must not open PRs to self-register.

---

## Payroll Queue Structure

[`payroll-queue.json`](../payroll-queue.json) — the off-chain payout ledger.

### Schema

```jsonc
{
  "pending": [
    {
      "issueRef": "TheJollyLaMa/BigNuten_Vanilla#45",  // org/repo#issue_number
      "contributor": "0xABC...",                         // Optimism Mainnet address
      "contributorGithub": "octocat",                    // GitHub username
      "amount": "500",                                   // BNUT (whole tokens, not wei)
      "queuedAt": "2026-03-20T12:00:00.000Z",           // ISO 8601 timestamp
      "queuedBy": "bounty-bot"                          // "bounty-bot" or maintainer username
    }
  ],
  "settled": [
    {
      "issueRef": "TheJollyLaMa/BigNuten_Vanilla#44",
      "contributor": "0xABC...",
      "contributorGithub": "octocat",
      "amount": "500",
      "queuedAt": "2026-03-19T12:00:00.000Z",
      "queuedBy": "bounty-bot",
      "settledAt": "2026-03-19T18:00:00.000Z",          // When settled on-chain
      "settledBy": "TheJollyLaMa",                       // Who ran settle-payroll.yml
      "txHash": "0x..."                                  // Optional: on-chain tx hash
    }
  ]
}
```

### Validation Rules

Every push or PR touching `payroll-queue.json` triggers `validate-payroll-queue.yml`, which runs `scripts/validatePayrollQueue.js`. Entries are rejected if:

| Rule | Check |
|---|---|
| Required fields | `issueRef`, `contributor`, `contributorGithub`, `amount`, `queuedAt` must be present |
| `issueRef` format | Must match `org/repo#N` (e.g. `TheJollyLaMa/BigNuten_Vanilla#45`) |
| `contributor` format | Must be a valid Ethereum address (`0x` + 40 hex chars) |
| `amount` value | Must be a positive number |
| Duplicate prevention | No two entries may share the same `issueRef` + `contributor` combination |
| Whitelist membership | `contributorGithub` must match an entry in `contributor-accounts.json` |

---

## Workflow Reference

### [`bounty-label.yml`](../.github/workflows/bounty-label.yml)

**Trigger:** `workflow_dispatch` (manual)  
**Inputs:** `issue_number`, `amount_bnut`  
**Actions:**
1. Create label `bounty: <amount> BNUT` in the repo (gold, `#f0c040`) if it doesn't exist
2. Apply the label to the specified issue
3. Post an announcement comment: "🪙 This issue carries a bounty of N $BNUT!"

---

### [`bounty-bot.yml`](../.github/workflows/bounty-bot.yml)

**Trigger:** Issue assigned (`issues: [assigned]`) + PR merged (`pull_request: [closed]` where `merged == true`)  
**On issue assigned:**
1. Find the bounty label on the issue
2. Post a bounty announcement comment tagging the assignee

**On PR merged:**
1. Parse the `Closes #N` reference in the PR body to find the issue
2. Look up the bounty label amount on that issue
3. Look up the assignee's wallet in `contributor-accounts.json`
4. Append a new entry to `payroll-queue.json` (`pending[]`)
5. Increment `bnutPending` in `contributor-accounts.json`
6. Commit both files
7. Post a confirmation comment on the issue

---

### [`bounty-payout.yml`](../.github/workflows/bounty-payout.yml)

**Trigger:** `workflow_dispatch` (manual — fallback)  
**Inputs:** `issue_number`, `contributor_github`, `amount_bnut`  
**Actions:**
1. Log payout details
2. Append a manually-specified entry to `payroll-queue.json` (`pending[]`)
3. Deduplicate pending entries
4. Commit the file
5. Post a comment on the issue

> Use this when the Bounty Bot did not auto-queue (e.g. assignee was not yet whitelisted at the time of merge).

---

### [`settle-payroll.yml`](../.github/workflows/settle-payroll.yml)

**Trigger:** `workflow_dispatch` (manual)  
**Inputs:** `issue_refs` (comma-separated), `tx_hash` (optional), `settled_by`  
**Actions:**
1. Parse the list of `issueRef` values to settle
2. Move matching entries from `pending[]` to `settled[]`
3. Add `settledAt`, `settledBy`, and optionally `txHash` to each settled entry
4. Commit the updated `payroll-queue.json`
5. Post a settlement comment on each settled issue

---

### [`validate-payroll-queue.yml`](../.github/workflows/validate-payroll-queue.yml)

**Trigger:** Push or PR touching `payroll-queue.json` or `contributor-accounts.json`  
**Actions:**
1. Run `node scripts/validatePayrollQueue.js`
2. Fail the check if any validation rule is violated
3. Block the merge if run on a PR

---

### [`setup-branch-protection.yml`](../.github/workflows/setup-branch-protection.yml)

**Trigger:** `workflow_dispatch` (manual)  
**Actions:**
1. Apply branch protection rules to `main`:
   - 1 approving review required from CODEOWNER
   - Stale reviews dismissed on new commits
   - Force pushes blocked
   - `validate-payroll-queue` check must pass

---

## Scripts Reference

### [`scripts/validatePayrollQueue.js`](../scripts/validatePayrollQueue.js)

Node.js script that validates `payroll-queue.json` structure and entries. Called by `validate-payroll-queue.yml`.

**Exit codes:**
- `0` — all entries valid
- `1` — one or more validation errors (details printed to stdout)

**Usage:**
```bash
node scripts/validatePayrollQueue.js
```

---

### [`scripts/payContributor.js`](../scripts/payContributor.js)

Hardhat script to pay a single contributor via the BigNutenTreasury contract directly from the CLI. Intended as a fallback / emergency tool.

**Usage:**
```bash
CONTRIBUTOR_ADDRESS=0x... ISSUE_REF=TheJollyLaMa/BigNuten_Vanilla#45 AMOUNT=500 \
  npx hardhat run scripts/payContributor.js --network optimism
```

---

### [`scripts/deploy.js`](../scripts/deploy.js)

Hardhat deployment script for all BigNuten contracts. See [`docs/DEPLOYMENTS.md`](DEPLOYMENTS.md) for deployed addresses.

---

## Settle Cycle Step-by-Step

A complete walk-through of settling a batch of payouts:

### Prerequisites
- Pending entries exist in `payroll-queue.json`
- Treasury has sufficient $BNUT balance (check Admin Panel → Treasury Admin)
- Owner wallet connected to MetaMask on Optimism Mainnet

### Steps

**1. Open the BigNuten app**
```
https://thejollylama.github.io/BigNuten_Vanilla/
```

**2. Connect MetaMask**
- Click the wallet button (top right)
- Select the owner wallet on Optimism Mainnet
- The Admin Panel appears in the ⚕︎ staff dropdown

**3. Check Treasury Balance**
- Admin Panel → Treasury Admin → view current BNUT balance
- If low: Admin Panel → $BNUT Admin → Quick Mint (with Mint-to-Treasury checked)

**4. Settle Payroll**
- Admin Panel → Payroll → load pending entries
- Review the list of pending payouts
- Click **Settle All Pending**
- MetaMask prompts: confirm the `batchPayContributors()` transaction
- Wait for Optimism confirmation (~2 seconds)
- Copy the transaction hash

**5. Commit the Settlement**
- Go to GitHub → Actions → Settle Payroll → Run workflow
- Enter the `issueRef` values settled (comma-separated)
- Paste the transaction hash (optional but recommended)
- Click **Run workflow**
- The workflow moves entries from `pending[]` to `settled[]` in `payroll-queue.json`

**6. Verify On-Chain**
- Visit the BigNutenTreasury contract on Optimistic Etherscan
- Check **Events** tab for `ContributorPaid(contributor, issueRef, amount)` events
- Verify each contributor received the correct amount

---

## Audit & Verification

### Off-Chain Audit

`payroll-queue.json` is a complete, append-only ledger. The `settled[]` array is the permanent record of every payout ever processed. Each entry includes:
- Who was paid (`contributor` + `contributorGithub`)
- For what work (`issueRef`)
- How much (`amount`)
- When it was queued and settled
- Who settled it
- Optional on-chain proof (`txHash`)

### On-Chain Audit

Every payout through `batchPayContributors()` emits:

```
ContributorPaid(address contributor, string issueRef, uint256 amount)
```

Query these events on Optimistic Etherscan:
```
https://optimistic.etherscan.io/address/0x143cC41AC075FFA40be1993827DA6ffB4638A363#events
```

Or use the view helpers on the contract:
- `getTotalPaid(address)` — cumulative BNUT paid to a contributor
- `isIssuePaid(string)` — whether an issue ref has already been settled (double-pay guard)

### Double-Pay Guard

`BigNutenTreasury.sol` maintains an `issuePaid[issueRef]` mapping. Once an issue ref has been paid, any subsequent call for the same ref will **revert**. This is enforced at the contract level and is independent of the off-chain queue state.

---

*Last updated: 2026-03-20 — reflects v2.0.0.*
