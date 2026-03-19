# ⚕︎ BigNuten ⚕︎
### (Another Decent Frankenstein)

> A privacy-first, open-source fitness tracker that logs weight, supplements, raw food intake, and exercise — with IPFS-backed data persistence and Web3 wallet integration.

![Version](https://img.shields.io/badge/version-v1.0.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Built With](https://img.shields.io/badge/built%20with-Vanilla%20JS-yellow?style=flat-square)
![Storage](https://img.shields.io/badge/storage-IPFS%20via%20web3.storage%20w3up-blueviolet?style=flat-square)
![Wallet](https://img.shields.io/badge/wallet-MetaMask-orange?style=flat-square)
[![Early Supporter DNFT](https://img.shields.io/badge/Early%20Access-100%20DNFTs-8b00ff?style=flat-square&logo=ethereum)](https://thejollylama.github.io/DecentMarket/)

---

## 🎟️ Become an Early Supporter

> **100 genesis BigNuten DNFTs — limited, on-chain, and yours forever.**

BigNuten v1.0.0 is minting **100 Early Supporter DNFTs** on Optimism as ERC-1155 tokens via the DecentNFT contract. These are not just collectibles — they are founding artifacts of the project.

### What You Get

- 🏅 **Permanent on-chain proof** of founding support — your name in history
- 🔓 **Lifetime access** to all premium BigNuten features, current and future
- 🗳️ **Governance voting rights** on product roadmap, features, and integrations
- 🎨 **Exclusive DNFT holder UI skin & badge** in the app
- 📣 **Optional hall-of-fame listing** in the contributors section
- 🤝 **Direct line to the dev team** for feedback and collaboration
- 🪙 **Stake in the $BNUT ecosystem** from day one

### DNFT Details

| Field | Detail |
|---|---|
| **Price** | $100 USDC (exact) |
| **Supply** | 100 editions max — 10 of 100 listed at launch · once they're gone, they're gone |
| **Standard** | ERC-1155 on Optimism |
| **DNFT Contract** | [`0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958`](https://optimistic.etherscan.io/address/0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958) — DecentNFT v0.2 on Optimism |
| **Token ID** | Visible in the live [DecentMarket listing](https://thejollylama.github.io/DecentMarket/) or via [`TokenRegistered` events](https://optimistic.etherscan.io/address/0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958#events) on the DNFT contract |
| **Escrow Contract** | [`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) — DecentEscrow v0.1 on Optimism |

> v2 DNFTs will have their own run when the monetization feature branch ships.

### How to Buy

#### 🔗 Option 1 — Crypto (instant & trustless)

1. Visit **[DecentMarket](https://thejollylama.github.io/DecentMarket/)** or use the **🎟️ Buy Now** button inside BigNuten's About modal
2. Connect your MetaMask wallet (Optimism network)
3. Approve $100 USDC and confirm the purchase — the escrow releases your DNFT automatically on-chain

> Powered by [DecentEscrow `0x23A4…350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) on Optimism — no middleman, instant settlement.

#### 💳 Option 2 — PayPal (fiat-friendly, no crypto required)

1. Open the **About modal** inside BigNuten and scroll to the Early Supporter section
2. Enter your wallet address (to receive the DNFT)
3. Click **💳 Buy with PayPal — $100** and complete checkout
4. **[@TheJollyLaMa](https://github.com/TheJollyLaMa)** verifies the payment and transfers your DNFT manually

### Links

- 🛒 **[View in DecentMarket](https://thejollylama.github.io/DecentMarket/)** — browse the full DNFT gallery and buy with crypto
- 🔎 **[DecentNFT contract on Optimistic Etherscan](https://optimistic.etherscan.io/address/0xe870f7b1D10C41dbc6b75598a5308B9a2Bb52958)** — DecentNFT v0.2
- 🏦 **[DecentEscrow contract on Optimistic Etherscan](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e)** — DecentEscrow v0.1

### Community Escrow

Proceeds from DNFT sales flow to the **[DecentEscrow contract](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e)** (`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`) on Optimism — a transparent, on-chain community treasury viewable by anyone on Optimistic Etherscan. Funds are reserved for:

- $BNUT bounties for contributors
- Feature development and infrastructure
- Community rewards and governance

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

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Modules) |
| Charts | Chart.js + chartjs-adapter-date-fns |
| Storage | web3.storage w3up client (IPFS) |
| Wallet | MetaMask / EIP-1193 |
| Fonts | Bungee (Google Fonts) |

---

## 🚀 Getting Started

```bash
git clone https://github.com/TheJollyLaMa/BigNuten_Vanilla.git
cd BigNuten_Vanilla
```

1. Open `index.html` in your browser — **no build step needed!**
2. Connect your **MetaMask** wallet using the wallet button
3. Connect **IPFS** via the IPFS icon (requires a [web3.storage](https://web3.storage) account)
4. Start logging your weight, supplements, food, and exercise!

---

## ✅ v1.0.0 — Current Features

- ✅ Weight logging with time-series chart
- ✅ Supplement tracking
- ✅ Raw food / dietary intake logging
- ✅ Exercise session logging
- ✅ Workout set list
- ✅ IPFS snapshot backup & restore (via web3.storage w3up)
- ✅ MetaMask wallet connection
- ✅ Moon & Sun tracker (Vedic Tithi + Ekadasi calendar)
- ✅ Fully client-side — no backend required
- ✅ Minted as a DecentNFT on DecentMarket to mark v1.0.0 on-chain

---

## 🗺 v2.0.0 Roadmap

### 🪙 $BNUT Token Economy
- [#38](../../issues/38) — Deploy BigNuten ERC-20 Token Contract ($BNUT) on Polygon/Base/Optimism
- [#39](../../issues/39) — Deploy BigNuten Treasury/Payout Smart Contract

### 💳 Subscription & Payments
- [#40](../../issues/40) — Integrate PayPal Subscription Payments
- [#41](../../issues/41) — Integrate Stripe Credit/Debit Card Subscriptions
- [#42](../../issues/42) — Build Subscription Status UI
- [#43](../../issues/43) — Build Crypto Subscription Payment Flow (ETH/USDC/$BNUT)
- [#44](../../issues/44) — Accept $BNUT Token for Subscriptions (Discounted rate)

### 🤖 Bounty Bot & Contributor Rewards
- [#45](../../issues/45) — Build GitHub Issue Bounty Bot for Automated $BNUT Payouts
- [#46](../../issues/46) — Add Bounty Label and Amount System to Issues

### 🗳️ Governance
- [#47](../../issues/47) — Deploy $BNUT-Based Community Governance System

### 📊 Community & Data
- [#48](../../issues/48) — Build Community Data Dashboard
- [#49](../../issues/49) — Build Opt-In Data Sharing UI for $BNUT Rewards

---

## 🪙 $BNUT Token

| Field | Detail |
|---|---|
| Token Name | BigNuten |
| Symbol | $BNUT |
| Network | Polygon / Base / Optimism (TBD) |
| Purpose | Subscription payments (discounted), contributor bounty rewards, data sharing rewards, governance voting |

$BNUT holders can vote on platform decisions via the on-chain governance system. Earning $BNUT is as simple as contributing code, sharing data (opt-in), or being an early subscriber.

---

## 🤝 Contributing

BigNuten uses a **bounty system** powered by $BNUT to reward contributors.

### Claiming a Bounty

- Issues labeled `bounty: N BNUT` are open for community contributors
- To claim a bounty:
  1. Comment on the issue expressing interest
  2. Get assigned by a maintainer
  3. Open a PR referencing the issue (`Closes #N` in the PR body)
  4. Get merged → get paid in $BNUT 🪙
- **All contributors must have a MetaMask wallet address** (Optimism Mainnet) to receive $BNUT payouts

### Applying a Bounty Label (maintainers)

Use the **Bounty Label** workflow: **Actions → Bounty Label → Run workflow**, then enter the issue number and BNUT amount. The workflow creates the standardised label and posts an announcement comment automatically.

Label format: `bounty: <amount> BNUT` (e.g. `bounty: 500 BNUT`)

### Contributor Accounts

Registered contributors are tracked in [`contributor-accounts.json`](contributor-accounts.json). The initial accounts are `@TheJollyLaMa` and `@copilot` (the AI RoboSoul). Once a test payout cycle is verified, additional contributors will be invited.

See [`docs/TOKENOMICS.md`](docs/TOKENOMICS.md) for the full bounty process.

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Made with 💪 by <a href="https://github.com/TheJollyLaMa">TheJollyLaMa</a><br/>
  <em>"Another Decent Frankenstein" — built in the open, one issue at a time.</em>
</p>

