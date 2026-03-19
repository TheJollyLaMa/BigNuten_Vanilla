# 🌰 How to Subscribe with $BNUT

> **Issue #44 — Accept $BNUT Token for Subscriptions (Discounted)**

BigNuten offers a **discounted monthly subscription** when you pay with the native `$BNUT` token instead of ETH or fiat. This page walks you through the full process.

---

## Why Pay with $BNUT?

| Plan            | Price           | Savings |
|-----------------|-----------------|---------|
| Fiat (PayPal/Stripe) | $9.99 / month | —      |
| Crypto — ETH    | ~0.01 ETH / month | —     |
| **Crypto — $BNUT** | **~500 $BNUT / month** | **~50% off ETH equivalent** |

Paying with `$BNUT` rewards long-term token holders and deepens engagement with the BigNuten ecosystem.

---

## Prerequisites

1. **MetaMask** installed in your browser — [metamask.io](https://metamask.io)
2. **Optimism Mainnet** configured in MetaMask (chain ID 10) — the app will prompt you to switch automatically if needed.
3. **$BNUT tokens** in your wallet. To get $BNUT:
   - 🎟️ Buy a Supporter DNFT — DNFT holders earn `$BNUT` rewards.
   - 💻 Contribute code — merged PRs are rewarded with `$BNUT` via the bounty system.
   - 📊 Share health data (opt-in) — earn `$BNUT` for community research contributions.
   - ⚙️ Admin mint — during startup `@TheJollyLaMa` can mint test `$BNUT` to any wallet.

> **Token contract:** [`0x733c4d2Aae900E608147dd89Fa93606f89722823`](https://optimistic.etherscan.io/token/0x733c4d2Aae900E608147dd89Fa93606f89722823) on Optimism Mainnet

---

## Step-by-Step Guide

### 1. Open the Subscription Modal

Click the **🔓 Subscribe** button (or the subscription icon) anywhere in the BigNuten app to open the subscription modal.

### 2. Select the $BNUT Payment Tab

In the **Payment method** row, click the **🌰 $BNUT** tab. You will see the current discounted price (loaded live from the DecentEscrow contract).

### 3. Click "🌰 Pay with $BNUT"

The app will:
1. **Connect your wallet** — MetaMask opens a "connect" prompt if not already connected.
2. **Switch to Optimism** — if your wallet is on a different network, MetaMask will prompt you to switch.
3. **Check your $BNUT balance** — if you don't have enough `$BNUT`, the flow stops with an error message showing how much you need.
4. **Request ERC-20 approval** — MetaMask opens an *Approve* transaction. This allows the DecentEscrow contract to deduct the plan price from your wallet. Confirm it and wait for it to be mined.
5. **Subscribe transaction** — MetaMask opens a second transaction calling `subscribe(planId=1)` on DecentEscrow. Confirm and wait for the block confirmation (~2 seconds on Optimism).

### 4. Confirm Your Subscription

Once the second transaction is confirmed you will see:

```
✅ Subscribed! View Tx ↗
```

Your subscription is now recorded on-chain. You can verify it anytime by checking:

- The **subscription status banner** at the top of the app (shows expiry date once your wallet is connected).
- The [DecentEscrow contract](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) on Optimistic Etherscan — call `isSubscribed(1, <your_address>)`.

---

## Under the Hood

The `$BNUT` subscription flow uses the **DecentEscrow** contract at
[`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e)
on Optimism Mainnet.

Plan configuration:

| Field          | Value                                         |
|----------------|-----------------------------------------------|
| Plan ID        | `1`                                           |
| Payment token  | `$BNUT` (`0x733c4d2Aae900E608147dd89Fa93606f89722823`) |
| Period         | 30 days                                       |
| Price          | Configured by owner via `createPlan()` on DecentEscrow |

The relevant frontend function is `payBNUTSubscription()` in [`js/subscription.js`](../js/subscription.js).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "MetaMask is not installed" | Install MetaMask from [metamask.io](https://metamask.io) |
| "Please switch MetaMask to the Optimism network" | Accept the network-switch prompt in MetaMask, or add Optimism manually (RPC: `https://mainnet.optimism.io`, chain ID `10`) |
| "Insufficient $BNUT balance" | Acquire more $BNUT (see prerequisites above) |
| "$BNUT subscription plan is not active" | The owner must first call `createPlan()` on DecentEscrow to create plan 1 (the $BNUT plan). Contact `@TheJollyLaMa` or use the **Admin Panel → Subscription Plans** section in the app to create it. |
| Approval transaction fails | Make sure you have a small amount of ETH on Optimism for gas (typically < $0.01) |

---

## Related

- [`docs/TOKENOMICS.md`](TOKENOMICS.md) — full $BNUT token economy documentation
- [Issue #44](https://github.com/TheJollyLaMa/BigNuten_Vanilla/issues/44) — feature request
- [DecentEscrow on Optimistic Etherscan](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e)
