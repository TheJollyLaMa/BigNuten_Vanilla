/**
 * js/stripe-config.js
 * BigNuten — Stripe Frontend Configuration
 *
 * Sets the Stripe publishable key and subscription Price IDs as window globals
 * so that js/subscription.js can initialise Stripe.js in the browser.
 *
 * ─── SECURITY NOTES ─────────────────────────────────────────────────────────
 * • The PUBLISHABLE key (pk_test_… / pk_live_…) is intentionally public — it
 *   cannot be used to create charges or read customer data.  It is safe to
 *   include in this file and commit to source control.
 * • NEVER put your SECRET key (sk_…) or WEBHOOK secret (whsec_…) here.
 *   Those belong only in your server's .env file (see .env.example).
 *
 * ─── SETUP ──────────────────────────────────────────────────────────────────
 * 1. Log in to https://dashboard.stripe.com/test/apikeys
 * 2. Copy the "Publishable key" (starts with pk_test_ or pk_live_).
 * 3. Replace STRIPE_PUBLISHABLE_KEY_PLACEHOLDER below with that value.
 * 4. Create two recurring Prices in the Stripe Dashboard (Products → Add product):
 *      Monthly : $10 / month  → copy the Price ID (price_…) → STRIPE_MONTHLY_PRICE_ID_PLACEHOLDER
 *      Annual  : $99 / year   → copy the Price ID (price_…) → STRIPE_ANNUAL_PRICE_ID_PLACEHOLDER
 * 5. See docs/STRIPE_SETUP.md for full walkthrough.
 *
 * Related issue: #41 — Integrate Stripe Credit/Debit Card Subscriptions.
 */

// ── Stripe publishable key (safe to expose) ──────────────────────────────────
// Replace with your real publishable key from https://dashboard.stripe.com/test/apikeys
window.STRIPE_PUBLISHABLE_KEY = 'pk_test_REPLACE_WITH_YOUR_STRIPE_PUBLISHABLE_KEY';

// ── Stripe Price IDs (created in the Stripe Dashboard) ───────────────────────
// Replace with the Price IDs for your BigNuten subscription products.
// Dashboard → Products → BigNuten Premium → Pricing
window.STRIPE_MONTHLY_PRICE_ID = 'price_REPLACE_WITH_YOUR_MONTHLY_PRICE_ID';
window.STRIPE_ANNUAL_PRICE_ID  = 'price_REPLACE_WITH_YOUR_ANNUAL_PRICE_ID';
