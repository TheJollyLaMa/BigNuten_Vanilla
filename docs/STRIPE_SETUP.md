# Stripe Subscription Setup Guide

**Issue #41 — Integrate Stripe Credit/Debit Card Subscriptions**

## TL;DR — Works on GitHub Pages & IPFS ✅

BigNuten is a **static app** (no server) hosted on GitHub Pages and potentially IPFS.
Stripe card payments are implemented using **Stripe Payment Links** — the same
concept as the existing PayPal buttons:

| | PayPal | Stripe |
|---|---|---|
| How it works | Form POST to paypal.com | Link to buy.stripe.com |
| Server needed? | ❌ No | ❌ No |
| Keys in the browser? | ❌ No | ❌ No |
| Recurring billing? | ✅ Yes | ✅ Yes |
| Cancel / manage? | paypal.com/autopay | billing.stripe.com/p/login/… |

---

## Setup (3 steps, ~5 minutes)

### Step 1 — Create a free Stripe account

Go to <https://dashboard.stripe.com/register>.
Stay in **Test mode** (toggle in the top-right) — no real money moves until you go live.

---

### Step 2 — Create two Payment Links

**Dashboard → Payment Links → Create link**

Create one link for each plan:

| Plan | Price | Billing |
|---|---|---|
| BigNuten Monthly | $10.00 | Monthly recurring |
| BigNuten Annual | $99.00 | Yearly recurring |

**Critical: set the success redirect URL**
In the "After payment" section of each Payment Link, select
**"Redirect customers to your website"** and enter:

```
https://YOURSITE/?stripe=success
```

Replace `YOURSITE` with your actual deployment URL, for example:
- GitHub Pages: `https://thejolyylama.github.io/BigNuten_Vanilla/?stripe=success`
- Custom domain: `https://bignuten.app/?stripe=success`

After saving, copy the **Payment Link URL** (it looks like `https://buy.stripe.com/test_abc123`).

---

### Step 3 — Paste the URLs into stripe-config.js

Open `js/stripe-config.js` and replace the placeholders:

```js
window.STRIPE_MONTHLY_PAYMENT_LINK = 'https://buy.stripe.com/test_YOUR_MONTHLY_LINK';
window.STRIPE_ANNUAL_PAYMENT_LINK  = 'https://buy.stripe.com/test_YOUR_ANNUAL_LINK';
window.STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/test_YOUR_PORTAL_LINK';
```

To get the **portal link**: Stripe Dashboard → Settings → Billing → Customer portal →
enable it, then click **"View test portal link"** and copy that URL.

**That's it — commit and push. No server needed.**

---

## How the Flow Works

```
User clicks "💳 Pay with Card"
  │
  ▼
window.location.href = 'https://buy.stripe.com/test_…'
  │
  ▼  (Stripe-hosted checkout page)
User enters card: 4242 4242 4242 4242
  │
  ▼  (Stripe redirects back after payment)
https://YOURSITE/?stripe=success
  │
  ▼  (app.js detects ?stripe=success)
Toast: "🎉 Card subscription active!"
Subscription recorded in localStorage
```

For **billing management** (update card, cancel, view invoices):
```
User clicks "💳 Manage Card / Stripe" in the subscription modal footer
  │
  ▼
billing.stripe.com/p/login/test_…
  │
  ▼  (User enters their billing email)
Stripe Customer Portal — manage everything
```

---

## Test Cards

| Scenario | Card number |
|---|---|
| ✅ Success | `4242 4242 4242 4242` |
| 🔐 Requires 3D Secure | `4000 0025 0000 3155` |
| ❌ Payment declined | `4000 0000 0000 9995` |

Use any future expiry date and any 3-digit CVC.

Full list: <https://docs.stripe.com/testing#cards>

---

## Going Live

1. Switch the Stripe Dashboard from **Test** → **Live** mode.
2. Create new Payment Links in Live mode (separate from test links).
3. Get a new portal link from the Live Customer Portal settings.
4. Update `js/stripe-config.js` with the live URLs (they won't have `test_`).
5. Commit and push — done.

---

## Optional: server.js Backend

The `server.js` file in the repo is **not needed** for Payment Links.
It is kept for future self-hosted deployments where you might want:
- Webhook event verification (for premium feature flags in a database)
- Custom checkout metadata (wallet address, referral codes)
- Programmatic Customer Portal sessions

To use it: copy `.env.example` → `.env`, fill in your Stripe secret key and
webhook secret, then run `npm install && npm start`.
See the comments in `server.js` for details.

---

## Security Summary

| What | Where | Safe to commit? |
|---|---|---|
| Payment Link URLs (`buy.stripe.com/…`) | `js/stripe-config.js` | ✅ Yes — public URLs |
| Portal URL (`billing.stripe.com/…`) | `js/stripe-config.js` | ✅ Yes — public URL |
| Secret key (`sk_test_…`) | `.env` → `server.js` only | ❌ Never |
| Webhook secret (`whsec_…`) | `.env` → `server.js` only | ❌ Never |
