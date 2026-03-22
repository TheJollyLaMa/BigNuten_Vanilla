/**
 * server.js
 * BigNuten — Stripe Subscription Backend
 *
 * Provides API endpoints used by the BigNuten frontend for Stripe payments:
 *   POST /api/stripe/create-checkout-session  — creates a hosted Checkout Session
 *   POST /api/stripe/webhook                  — handles Stripe event webhooks
 *   POST /api/stripe/portal-session           — creates a Customer Portal session
 *   GET  /api/stripe/session/:id              — retrieves a completed session
 *
 * Also serves all static frontend files from the project root so the whole app
 * can be started with a single `node server.js` command in development.
 *
 * Related issue: #41 — Integrate Stripe Credit/Debit Card Subscriptions.
 *
 * ─── Required environment variables ─────────────────────────────────────────
 * Copy .env.example → .env and fill in:
 *   STRIPE_SECRET_KEY        — sk_test_… from dashboard.stripe.com/apikeys
 *   STRIPE_WEBHOOK_SECRET    — whsec_…  from dashboard.stripe.com/webhooks
 *   STRIPE_MONTHLY_PRICE_ID  — price_…  for the $10/month plan
 *   STRIPE_ANNUAL_PRICE_ID   — price_…  for the $99/year plan
 *   PORT                     — (optional) HTTP port, default 3000
 *
 * ─── SECURITY NOTES ─────────────────────────────────────────────────────────
 * • The secret key (sk_…) and webhook secret (whsec_…) are read from .env and
 *   NEVER appear in client-side code or HTTP responses.
 * • The publishable key (pk_…) is set in js/stripe-config.js — that key is
 *   safe to expose; it cannot create charges or access customer data.
 * • Validate the Stripe-Signature header on every webhook to prevent spoofed
 *   events from being processed.
 *
 * Usage:
 *   npm install          # installs express + stripe
 *   node server.js       # starts the server
 */

'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');

// ── Initialise Stripe with the secret key from env ───────────────────────────
// The secret key MUST stay server-side only — it is never sent to the browser.
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.error(
    '[server.js] STRIPE_SECRET_KEY is not set.\n' +
    '  Copy .env.example → .env and fill in your Stripe keys.\n' +
    '  See docs/STRIPE_SETUP.md for a step-by-step guide.'
  );
  process.exit(1);
}

const stripe = require('stripe')(stripeSecretKey);

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── Static frontend files ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Webhook
// The raw request body MUST be read BEFORE express.json() is applied so that
// stripe.webhooks.constructEvent() can verify the HMAC signature.
// ─────────────────────────────────────────────────────────────────────────────
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig    = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret) {
      console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set — cannot verify events.');
      return res.status(500).json({ error: 'Webhook secret not configured.' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      // Invalid signature — reject the request.
      console.error('[stripe/webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[stripe/webhook] ✓ Received: ${event.type}`);

    switch (event.type) {
      // ── Subscription successfully started ───────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        // TODO: link session.customer to your user profile (database lookup by
        //       session.customer_email or session.metadata.userId) and unlock
        //       premium features.
        console.log('[stripe/webhook] Checkout completed —',
          'customer:', session.customer,
          '| subscription:', session.subscription,
          '| email:', session.customer_details?.email);
        break;
      }

      // ── Recurring renewal succeeded ─────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        console.log('[stripe/webhook] Payment succeeded — invoice:', invoice.id,
          '| subscription:', invoice.subscription);
        break;
      }

      // ── Payment failed (dunning) ────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        // TODO: notify the customer and/or suspend access after grace period.
        console.warn('[stripe/webhook] ⚠ Payment failed — invoice:', invoice.id,
          '| subscription:', invoice.subscription,
          '| customer email:', invoice.customer_email);
        break;
      }

      // ── Plan changed or trial ended ─────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        console.log('[stripe/webhook] Subscription updated —', sub.id, '| status:', sub.status);
        break;
      }

      // ── Subscription cancelled ──────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        // TODO: revoke premium features for sub.customer in your database.
        console.log('[stripe/webhook] Subscription cancelled —', sub.id, '| customer:', sub.customer);
        break;
      }

      default:
        // Acknowledge all other events without acting on them.
        console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);

// ── JSON body parsing for all remaining routes ────────────────────────────────
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stripe/create-checkout-session
//
// Creates a hosted Stripe Checkout Session for a subscription Price ID.
// The browser is then redirected to session.url (Stripe-hosted checkout page).
//
// Request body:
//   { priceId, successUrl?, cancelUrl?, customerEmail? }
// Response:
//   { sessionId, url }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  const { priceId, successUrl, cancelUrl, customerEmail } = req.body;

  if (!priceId) {
    return res.status(400).json({ error: 'priceId is required.' });
  }

  const origin = req.headers.origin || `http://localhost:${PORT}`;

  try {
    const sessionParams = {
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // {CHECKOUT_SESSION_ID} is a Stripe template variable — Stripe fills it in.
      success_url: successUrl || `${origin}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  cancelUrl  || `${origin}/?stripe=cancel`,
      allow_promotion_codes: true,
    };

    if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('[stripe/create-checkout-session] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stripe/portal-session
//
// Creates a Stripe Billing Portal session so a customer can manage their
// subscription, update payment methods, or cancel.
//
// The Billing Portal must be configured in the Stripe Dashboard first:
//   https://dashboard.stripe.com/test/settings/billing/portal
//
// Request body:
//   { customerId, returnUrl? }
// Response:
//   { url }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/stripe/portal-session', async (req, res) => {
  const { customerId, returnUrl } = req.body;

  if (!customerId) {
    return res.status(400).json({ error: 'customerId is required.' });
  }

  const origin = req.headers.origin || `http://localhost:${PORT}`;

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: returnUrl || `${origin}/`,
    });
    res.json({ url: portalSession.url });
  } catch (err) {
    console.error('[stripe/portal-session] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/stripe/session/:sessionId
//
// Retrieves a completed Checkout Session.  Called by the frontend after Stripe
// redirects back to /?stripe=success&session_id=cs_… so the app can read the
// customer / subscription IDs and record the subscription locally.
//
// Response:
//   { status, customerEmail, customerId, subscriptionId }
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/stripe/session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      req.params.sessionId,
      { expand: ['subscription', 'customer'] }
    );
    res.json({
      status:         session.status,
      customerEmail:  session.customer_details?.email,
      customerId:     typeof session.customer     === 'string' ? session.customer     : session.customer?.id,
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
    });
  } catch (err) {
    console.error('[stripe/session] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start listening ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const mode = stripeSecretKey.startsWith('sk_live_') ? '🟢 LIVE' : '🧪 TEST';
  console.log(`\n  ⚕︎  BigNuten server running at http://localhost:${PORT}`);
  console.log(`       Stripe mode: ${mode}`);
  console.log(`       Webhook endpoint: POST http://localhost:${PORT}/api/stripe/webhook\n`);
});
