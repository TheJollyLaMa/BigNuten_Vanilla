/**
 * js/stripe-config.js
 * BigNuten — Stripe Frontend Configuration
 *
 * ─── HOW STRIPE WORKS ON GITHUB PAGES / IPFS ────────────────────────────────
 * BigNuten is a static app (GitHub Pages, IPFS) — there is no server to run.
 * Instead of Stripe Checkout Sessions (which require a backend), we use
 * **Stripe Payment Links**.
 *
 * A Payment Link is a pre-built checkout URL you create once in the Stripe
 * Dashboard.  The button just opens that URL — exactly the same pattern as
 * the existing PayPal buttons.  No server, no API keys in the browser.
 *
 * ─── SETUP (3 steps, no server required) ────────────────────────────────────
 * 1. Create a Stripe account at https://dashboard.stripe.com (free, test mode).
 * 2. Go to  Payment Links → Create link  and make two links:
 *      Monthly : $10/month recurring subscription
 *      Annual  : $99/year recurring subscription
 *    In each link's "After payment" settings, set the success redirect URL to:
 *      https://YOURSITE/?stripe=success
 *    (e.g. https://thejolyylama.github.io/BigNuten_Vanilla/?stripe=success)
 * 3. Copy the two link URLs (they start with https://buy.stripe.com/…) and
 *    paste them below, replacing the REPLACE_WITH_… placeholders.
 *
 * For billing management (cancel / update card), create a Customer Portal
 * shareable link:  Stripe Dashboard → Settings → Billing → Customer portal
 * → "Share a link to the portal" → copy that URL and paste it below.
 *
 * See docs/STRIPE_SETUP.md for the full illustrated walkthrough.
 *
 * ─── SECURITY ────────────────────────────────────────────────────────────────
 * Payment Link URLs are public URLs — they're safe to commit here.
 * NEVER put your secret key (sk_…) or webhook secret (whsec_…) in this file.
 * Those are only used by the optional server.js backend (see .env.example).
 *
 * Related issue: #41 — Integrate Stripe Credit/Debit Card Subscriptions.
 */

// ── Stripe Payment Link URLs ──────────────────────────────────────────────────
// Create these at https://dashboard.stripe.com/test/payment-links
// Set the "After payment" → Custom redirect URL to:
//   https://YOURSITE/?stripe=success   (replace YOURSITE with your actual URL)
window.STRIPE_MONTHLY_PAYMENT_LINK = 'https://buy.stripe.com/9B69AN7u80x4gBC08B0x200';
window.STRIPE_ANNUAL_PAYMENT_LINK  = 'https://buy.stripe.com/dRmaER7u87Zw99adZr0x201';

// ── Stripe DNFT one-time purchase link ────────────────────────────────────────
// Create a one-time $100 Payment Link in the Stripe Dashboard and paste it here.
// In the link's "After payment" settings set the redirect to:
//   https://YOURSITE/?stripe=dnft-success
// The buyer's wallet address is passed as ?client_reference_id=DNFT-wallet:0x…
window.STRIPE_DNFT_PAYMENT_LINK = 'https://buy.stripe.com/REPLACE_WITH_DNFT_PAYMENT_LINK';

// ── Stripe Customer Portal URL ────────────────────────────────────────────────
// Created at: Stripe Dashboard → Settings → Billing → Customer portal
// Click "View test portal link" or "Share a link to the portal".
// Users enter their billing email to manage their subscription / cancel.
window.STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/9B69AN7u80x4gBC08B0x200';
