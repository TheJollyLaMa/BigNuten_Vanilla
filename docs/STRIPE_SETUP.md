# Stripe Subscription Setup Guide

**Issue #41 — Integrate Stripe Credit/Debit Card Subscriptions**

This guide walks you through setting up Stripe in **test mode** so you can demo card-payment subscriptions in BigNuten without processing any real charges.

---

## ⚠️ Key Security Rules

| Key type | Where it lives | Safe to commit? |
|---|---|---|
| Publishable key `pk_test_…` | `js/stripe-config.js` (frontend) | ✅ Yes — designed to be public |
| Secret key `sk_test_…` | `.env` (server only) | ❌ **Never** commit or share |
| Webhook secret `whsec_…` | `.env` (server only) | ❌ **Never** commit or share |

The `.env` file is listed in `.gitignore` and will **never** be committed.  
The secret key is only ever read by `server.js` at runtime — it is never sent to the browser.

---

## Step 1 — Create a Stripe Account

1. Go to <https://dashboard.stripe.com/register> and create a free account.
2. Stay in **Test mode** (toggle in the top-right of the Dashboard) — no real money moves.

---

## Step 2 — Get Your API Keys

1. Open **Developers → API keys** in the Stripe Dashboard.
2. Copy the two test keys:
   - **Publishable key**: `pk_test_…` → goes in `js/stripe-config.js`
   - **Secret key**: `sk_test_…` → goes in `.env` as `STRIPE_SECRET_KEY`

---

## Step 3 — Create Subscription Products & Prices

1. Go to **Products → Add product**.
2. Create **BigNuten Premium Monthly**:
   - Name: `BigNuten Premium`
   - Pricing model: **Recurring**
   - Price: `$10.00` / `month`
   - Click **Save product** and copy the **Price ID** (`price_…`)
3. Add a second price on the same product:
   - Price: `$99.00` / `year`
   - Copy that **Price ID** too.

---

## Step 4 — Configure the Frontend

Open `js/stripe-config.js` and replace the placeholders:

```js
window.STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_STRIPE_PUBLISHABLE_KEY';
window.STRIPE_MONTHLY_PRICE_ID = 'price_YOUR_MONTHLY_PRICE_ID';
window.STRIPE_ANNUAL_PRICE_ID  = 'price_YOUR_ANNUAL_PRICE_ID';
```

These values are **safe to commit** — they can only be used to redirect users to the Stripe-hosted checkout page, not to access customer data or create charges.

---

## Step 5 — Configure the Backend (.env)

Copy `.env.example` to `.env` and fill in:

```bash
STRIPE_SECRET_KEY=sk_test_…          # from Dashboard → Developers → API keys
STRIPE_WEBHOOK_SECRET=whsec_…        # from Step 6 below
STRIPE_MONTHLY_PRICE_ID=price_…      # same value as in stripe-config.js
STRIPE_ANNUAL_PRICE_ID=price_…       # same value as in stripe-config.js
PORT=3000                             # optional, default 3000
```

**Never share or commit your `.env` file.**

---

## Step 6 — Set Up a Webhook

Webhooks allow Stripe to notify your server when a subscription is created, renewed, or cancelled.

### Local development (using the Stripe CLI)

1. Install the Stripe CLI: <https://docs.stripe.com/stripe-cli>
2. Log in: `stripe login`
3. Forward events to your local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
4. Copy the **webhook signing secret** (`whsec_…`) that the CLI prints and set it as `STRIPE_WEBHOOK_SECRET` in your `.env`.

### Production (Stripe Dashboard)

1. Go to **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://your-domain.com/api/stripe/webhook`
3. Select these events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. After saving, click the endpoint and copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET`.

---

## Step 7 — Configure the Billing Portal

The "Manage Card / Stripe" link opens the Stripe Customer Portal where users can update their card, switch plans, or cancel.

1. Go to **Settings → Billing → Customer portal** in the Stripe Dashboard.
2. Enable the features you want (cancel subscription, update payment method, etc.).
3. Save the settings.

No code changes are needed — `server.js` creates portal sessions automatically via `/api/stripe/portal-session`.

---

## Step 8 — Install Dependencies and Start the Server

```bash
npm install
npm start
```

Open <http://localhost:3000> — the BigNuten app is served from the same port.

---

## Step 9 — Test the Flow

1. Click **💳 Pay with Card** (About page or Subscription modal → Card tab).
2. You are redirected to the Stripe-hosted Checkout page.
3. Use the test card: **`4242 4242 4242 4242`** · any future expiry · any CVC.
4. After payment, you're redirected back to the app with `?stripe=success`.
5. A toast notification confirms the subscription and a 30-day expiry is saved locally.

**Other test cards:**

| Scenario | Card number |
|---|---|
| Success | `4242 4242 4242 4242` |
| Requires 3D Secure auth | `4000 0025 0000 3155` |
| Payment declined | `4000 0000 0000 9995` |

Full list: <https://docs.stripe.com/testing#cards>

---

## Architecture Overview

```
Browser (index.html + js/)
  │
  │  1. Click "Pay with Card"
  │  2. initStripeSubscription() in subscription.js
  │  3. POST /api/stripe/create-checkout-session
  ▼
server.js (Node/Express)
  │  4. stripe.checkout.sessions.create({ mode:'subscription', ... })
  │  5. Returns { sessionId, url }
  ▼
Stripe Checkout (hosted page)
  │  6. User enters card details
  │  7. Stripe redirects to /?stripe=success&session_id=cs_…
  ▼
Browser
  │  8. app.js detects ?stripe=success
  │  9. GET /api/stripe/session/:sessionId → records subscription locally
  │ 10. Toast notification shown
  ▼
server.js (webhook — async)
  │ 11. POST /api/stripe/webhook  ← Stripe calls this for every event
  │ 12. checkout.session.completed → unlock premium features in DB
  │ 13. invoice.payment_succeeded  → renewal recorded
  │ 14. customer.subscription.deleted → revoke access
```

---

## Going Live

1. Switch the Stripe Dashboard toggle from **Test** to **Live** mode.
2. Replace the test keys in `.env` and `js/stripe-config.js` with your **Live** keys.
3. Create equivalent Live products/prices and update the Price IDs.
4. Set up a Live webhook endpoint pointing at your production server.
5. Deploy `server.js` to your hosting platform (Railway, Render, Fly.io, etc.).
