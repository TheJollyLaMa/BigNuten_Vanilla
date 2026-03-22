/**
 * js/subscription.js
 * BigNuten Subscription Frontend Module
 *
 * Handles all subscription-related interactions for the BigNuten app:
 *   - On-chain status checks via the DecentEscrow contract (Issue #43)
 *   - PayPal JS SDK subscription button initialisation  (Issue #40)
 *   - Stripe.js payment flow initialisation             (Issue #41)
 *   - ETH payment via MetaMask using DecentEscrow Plans (Issue #43)
 *   - $BNUT discounted payment via MetaMask             (Issue #44)
 *   - PayPal one-time DNFT purchase flow                (Issue #62)
 *
 * Subscription backend: DecentEscrow v0.1 at
 *   0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e (Optimism Mainnet)
 *
 * The owner must first call createPlan() on the escrow to create:
 *   Plan 0 — ETH monthly  (paymentToken = address(0))
 *   Plan 1 — $BNUT monthly (paymentToken = BNUT address, discounted)
 * Plan IDs are configurable via window.BIGNUTEN_ETH_PLAN_ID / BNUT_PLAN_ID.
 *
 * Prerequisites (loaded in index.html before this module):
 *   - ethers.js v6 (via CDN)
 *   - PayPal JS SDK  <script src="https://www.paypal.com/sdk/js?client-id=...">
 *   - js/stripe-config.js (sets window.STRIPE_MONTHLY_PAYMENT_LINK, etc.)
 *   - js/contracts.js (sets window.SUBSCRIPTION_CONTRACT_ADDRESS to DecentEscrow,
 *                      and window.BIGNUTEN_ETH_PLAN_ID / BIGNUTEN_BNUT_PLAN_ID)
 *
 * Usage (ES module):
 *   import {
 *     checkSubscriptionStatus,
 *     initPayPalSubscription,
 *     initStripeSubscription,
 *     openStripePortal,
 *     payCryptoSubscription,
 *     payBNUTSubscription,
 *     initDnftPayPalPurchase,
 *     initDnftStripePurchase,
 *   } from './subscription.js';
 */

// ─── Contract ABIs (minimal — only the functions we call) ─────────────────────

/**
 * Sentinel string used in stripe-config.js placeholder values.
 * Any URL containing this string is treated as "not yet configured".
 */
const STRIPE_PLACEHOLDER_SENTINEL = 'REPLACE_WITH';

/**
 * Minimal ABI for the DecentEscrow contract — subscription functions only.
 * Full ABI lives in abis/DecentEscrow_v001.json.
 */
const DECENT_ESCROW_SUBSCRIPTION_ABI = [
  // View functions
  "function isSubscribed(uint256 planId, address account) view returns (bool)",
  "function getPlan(uint256 planId) view returns (tuple(string name, address paymentToken, uint256 pricePerPeriod, uint256 periodSeconds, bool active))",
  "function subscriptions(address subscriber, uint256 planId) view returns (uint256)",
  "function nextPlanId() view returns (uint256)",
  // User function
  "function subscribe(uint256 planId) payable",
  // Owner-only admin functions
  "function createPlan(string name, address paymentToken, uint256 pricePerPeriod, uint256 periodSeconds) returns (uint256 planId)",
  "function deactivatePlan(uint256 planId)",
];

/** Minimal ABI for the BigNuten ERC-20 token contract. */
const BNUT_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * DecentEscrow contract address — deployed on Optimism Mainnet.
 * Used as the subscription backend via its Plan-based subscription system.
 */
const DECENT_ESCROW_ADDRESS =
  window.SUBSCRIPTION_CONTRACT_ADDRESS ||
  "0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e";

/** $BNUT ERC-20 token address on Optimism Mainnet. */
const BNUT_ADDRESS =
  window.BNUT_CONTRACT_ADDRESS ||
  "0x733c4d2Aae900E608147dd89Fa93606f89722823";

/** USDC ERC-20 token address on Optimism Mainnet. */
const USDC_ADDRESS = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";

/** Public read-only RPC for Optimism Mainnet (used for view-only calls). */
const OPTIMISM_RPC_URL = "https://mainnet.optimism.io";

/**
 * DecentEscrow plan IDs for BigNuten subscriptions.
 * Override by setting window.BIGNUTEN_ETH_PLAN_ID / BIGNUTEN_BNUT_PLAN_ID
 * before this module loads (set in js/contracts.js).
 *
 * Plan 0 — ETH monthly
 * Plan 1 — BNUT monthly (~50% discount)
 * Plan 2 — ETH annual   ($99 equiv, 365-day period)
 * Plan 3 — BNUT annual  (~50% of $99 in BNUT)
 * Plan 4 — USDC monthly ($10 USDC)
 * Plan 5 — USDC annual  ($99 USDC)
 *
 * Plans 2–5 must be created on-chain by the owner before they go live.
 * The UI gates on plan.active from the contract.
 */
const PLAN_IDS = {
  eth:        window.BIGNUTEN_ETH_PLAN_ID   ?? 0,
  bnut:       window.BIGNUTEN_BNUT_PLAN_ID  ?? 1,
  ethAnnual:  window.BIGNUTEN_ETH_ANNUAL_PLAN_ID  ?? 2,
  bnutAnnual: window.BIGNUTEN_BNUT_ANNUAL_PLAN_ID ?? 3,
  usdc:       window.BIGNUTEN_USDC_PLAN_ID        ?? 4,
  usdcAnnual: window.BIGNUTEN_USDC_ANNUAL_PLAN_ID ?? 5,
};

/** Optimism Mainnet chain ID (10) and Optimism Sepolia chain ID (11155420). */
const SUPPORTED_CHAIN_IDS = [10, 11155420];

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Returns an ethers.js BrowserProvider connected to MetaMask.
 * Throws if MetaMask (or another EIP-1193 provider) is not available.
 *
 * @returns {Promise<import('ethers').BrowserProvider>}
 */
async function _getProvider() {
  if (!window.ethereum) {
    throw new Error(
      "MetaMask is not installed. Please install it from https://metamask.io"
    );
  }
  return new ethers.BrowserProvider(window.ethereum);
}

/**
 * Returns an ethers.js Signer for the currently connected MetaMask account.
 * Prompts the user to connect if not yet connected.
 *
 * @returns {Promise<import('ethers').Signer>}
 */
async function _getSigner() {
  const provider = await _getProvider();
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
}

/**
 * Ensures MetaMask is on Optimism (Mainnet or Sepolia).
 * If not, prompts the user to switch.
 * Throws if the user refuses to switch.
 *
 * @returns {Promise<void>}
 */
async function _ensureOptimism() {
  const provider = await _getProvider();
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  if (SUPPORTED_CHAIN_IDS.includes(chainId)) return;

  // Ask MetaMask to switch to Optimism Mainnet.
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xa" }], // 0xa = 10 (Optimism Mainnet)
    });
  } catch (switchErr) {
    // EIP-1193 error 4902: chain not added — prompt to add it.
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0xa",
            chainName: "Optimism",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [OPTIMISM_RPC_URL],
            blockExplorerUrls: ["https://optimistic.etherscan.io"],
          },
        ],
      });
    } else {
      throw new Error(
        "Please switch MetaMask to the Optimism network to pay with crypto."
      );
    }
  }
}

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Checks whether a wallet address has an active BigNuten subscription
 * by querying the DecentEscrow contract on-chain.
 * Checks both the ETH plan and the $BNUT plan and returns the active one
 * with the latest expiry.
 *
 * @param {string} walletAddress - Ethereum address to check (0x…).
 * @returns {Promise<{ isSubscribed: boolean, expiry: Date | null }>}
 *   An object with a boolean and the expiry date (null if never subscribed).
 *
 * @example
 *   const { isSubscribed, expiry } = await checkSubscriptionStatus('0xAbc…');
 *   if (isSubscribed) console.log('Active until', expiry.toLocaleDateString());
 */
export async function checkSubscriptionStatus(walletAddress) {
  try {
    const provider = await _getProvider();
    const contract = new ethers.Contract(
      DECENT_ESCROW_ADDRESS,
      DECENT_ESCROW_SUBSCRIPTION_ABI,
      provider
    );

    // Check all crypto plans simultaneously (ETH, BNUT, ETH annual, BNUT annual, USDC, USDC annual).
    const planIds = [
      PLAN_IDS.eth, PLAN_IDS.bnut,
      PLAN_IDS.ethAnnual, PLAN_IDS.bnutAnnual,
      PLAN_IDS.usdc, PLAN_IDS.usdcAnnual,
    ];
    const checks = await Promise.all(
      planIds.map(id => Promise.all([
        contract.isSubscribed(id, walletAddress).catch(() => false),
        contract.subscriptions(walletAddress, id).catch(() => 0n),
      ]))
    );

    let active = false;
    let maxExpiry = 0n;
    for (const [isActive, expiry] of checks) {
      if (isActive) active = true;
      if (expiry > maxExpiry) maxExpiry = expiry;
    }

    const expiry = maxExpiry > 0n
      ? new Date(Number(maxExpiry) * 1000)
      : null;

    return { isSubscribed: active, expiry };
  } catch (err) {
    console.error("[subscription.js] checkSubscriptionStatus error:", err);
    throw err;
  }
}

/**
 * Initialises a PayPal subscription button in the specified DOM container.
 * Requires the PayPal JS SDK to be loaded in the page with your Client ID.
 * The Plan ID should be created in the PayPal developer dashboard.
 *
 * Related issue: #40 — Integrate PayPal Subscription Payments.
 *
 * @param {string} planId      - PayPal Billing Plan ID (e.g. "P-XXXXXXXXXX").
 * @param {string} containerId - ID of the DOM element to render the button in.
 * @returns {void}
 *
 * @example
 *   initPayPalSubscription('P-1234567890', 'paypal-button-container');
 */
export function initPayPalSubscription(planId, containerId = "paypal-button-container") {
  if (typeof paypal === "undefined") {
    console.error(
      "[subscription.js] PayPal JS SDK not loaded. " +
        "Add <script src='https://www.paypal.com/sdk/js?client-id=YOUR_ID&vault=true&intent=subscription'> to index.html"
    );
    return;
  }

  paypal
    .Buttons({
      style: {
        shape: "pill",
        color: "gold",
        layout: "vertical",
        label: "subscribe",
      },
      createSubscription(data, actions) {
        // Creates the subscription using the provided plan ID.
        return actions.subscription.create({ plan_id: planId });
      },
      onApprove(data) {
        // TODO (#40): Call your backend to verify the subscription and
        //             then call `subscribe()` on the smart contract.
        console.log(
          "[subscription.js] PayPal subscription approved. ID:",
          data.subscriptionID
        );
        alert(
          `🎉 PayPal subscription active! ID: ${data.subscriptionID}\n` +
            "Your access will be activated shortly."
        );
      },
      onError(err) {
        console.error("[subscription.js] PayPal error:", err);
        alert("PayPal subscription failed. Please try again.");
      },
    })
    .render(`#${containerId}`);
}

/**
 * Opens a Stripe-hosted subscription checkout via a pre-created Payment Link.
 *
 * This is the **serverless** approach — no backend required.  It works on
 * GitHub Pages, IPFS, or any static host.  The Payment Link URL is created
 * once in the Stripe Dashboard and stored in js/stripe-config.js.
 *
 * The flow is identical to the PayPal buttons:
 *   1. User clicks "Pay with Card"
 *   2. Browser navigates to the Stripe Payment Link URL
 *   3. User completes payment on Stripe's hosted page
 *   4. Stripe redirects back to ?stripe=success (configured in the Dashboard)
 *
 * ── How to create a Payment Link ────────────────────────────────────────────
 *   Stripe Dashboard → Payment Links → Create link
 *   Set "After payment" → Custom redirect URL to:
 *     https://YOURSITE/?stripe=success
 *   Copy the https://buy.stripe.com/… URL into js/stripe-config.js.
 *
 * Related issue: #41 — Integrate Stripe Credit/Debit Card Subscriptions.
 *
 * @param {string} paymentLink - Stripe Payment Link URL (https://buy.stripe.com/…).
 * @returns {void}
 *
 * @example
 *   initStripeSubscription(window.STRIPE_MONTHLY_PAYMENT_LINK);
 */
export function initStripeSubscription(paymentLink) {
  if (!paymentLink || paymentLink.includes(STRIPE_PLACEHOLDER_SENTINEL)) {
    throw new Error(
      "[subscription.js] Stripe Payment Link is not configured. " +
        "Open js/stripe-config.js and replace STRIPE_MONTHLY_PAYMENT_LINK / " +
        "STRIPE_ANNUAL_PAYMENT_LINK with your Payment Link URLs from " +
        "https://dashboard.stripe.com/test/payment-links — " +
        "see docs/STRIPE_SETUP.md for step-by-step instructions."
    );
  }

  // Navigate to the Stripe-hosted checkout page.
  // Stripe will redirect back to ?stripe=success on completion,
  // or ?stripe=cancel if the user closes the checkout page.
  window.location.href = paymentLink;
}

/**
 * Opens the Stripe Customer Portal so a subscriber can manage their
 * subscription (update card, change plan, cancel).
 *
 * Uses the static portal link configured in js/stripe-config.js.
 * The user is asked for their billing email and Stripe authenticates them.
 *
 * Related issue: #41 — Integrate Stripe Credit/Debit Card Subscriptions.
 *
 * @param {string} [returnUrl] - URL to return to after the portal session.
 *                               Falls back to window.STRIPE_PORTAL_URL.
 * @returns {void}
 */
export function openStripePortal(returnUrl) {
  const portalUrl = returnUrl || window.STRIPE_PORTAL_URL;
  if (!portalUrl || portalUrl.includes(STRIPE_PLACEHOLDER_SENTINEL)) {
    // Fall back to Stripe's generic billing portal login page.
    window.open('https://billing.stripe.com', '_blank', 'noopener,noreferrer');
    return;
  }
  window.open(portalUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Initialises the DNFT PayPal one-time purchase flow.
 * Attaches a submit handler to the DNFT PayPal form that validates the wallet
 * address input before allowing the form to POST to PayPal's standard checkout.
 *
 * Related issue: #62 — Add PayPal Purchase Flow for Supporter DNFT.
 *
 * @param {string} [formId]        - ID of the DNFT PayPal form element.
 * @param {string} [walletInputId] - ID of the wallet address <input>.
 * @param {string} [errElId]       - ID of the error message element.
 * @param {string} [confirmElId]   - ID of the post-submit confirmation element.
 * @returns {void}
 *
 * @example
 *   initDnftPayPalPurchase(); // uses default IDs set in index.html
 */
export function initDnftPayPalPurchase(
  formId        = "dnft-paypal-form",
  walletInputId = "dnft-paypal-wallet",
  errElId       = "dnft-paypal-wallet-err",
  confirmElId   = "dnft-paypal-confirm"
) {
  const form        = document.getElementById(formId);
  const walletInput = document.getElementById(walletInputId);
  const errEl       = document.getElementById(errElId);
  const confirmEl   = document.getElementById(confirmElId);
  const customInput = document.getElementById("dnft-paypal-custom");

  if (!form || !walletInput) {
    console.warn(
      "[subscription.js] initDnftPayPalPurchase: form or wallet input not found."
    );
    return;
  }

  form.addEventListener("submit", function (event) {
    const wallet    = walletInput.value.trim();
    const isAddress = /^0x[0-9a-fA-F]{40}$/.test(wallet);
    const isEns     = /^[^\s]+\.eth$/i.test(wallet);

    if (!wallet) {
      if (errEl) errEl.textContent = "⚠️ Please enter your wallet address before paying.";
      event.preventDefault();
      walletInput.focus();
      return;
    }
    if (!isAddress && !isEns) {
      if (errEl) errEl.textContent =
        "⚠️ Enter a valid 0x… address or ENS name (e.g. yourname.eth).";
      event.preventDefault();
      walletInput.focus();
      return;
    }

    if (errEl) errEl.textContent = "";

    // Embed wallet in PayPal "custom" field — admin sees it in the payment notification.
    if (customInput) customInput.value = "DNFT-wallet:" + wallet;

    // Show in-page confirmation after PayPal tab opens.
    setTimeout(function () {
      if (confirmEl) {
        const truncated =
          wallet.length > 14
            ? wallet.slice(0, 8) + "…" + wallet.slice(-6)
            : wallet;
        confirmEl.style.display = "block";
        confirmEl.innerHTML =
          "✅ PayPal checkout opened! Complete your $100 payment there.<br>" +
          "Your wallet <code>" + truncated + "</code> was submitted — " +
          "admin will send your DNFT after verifying payment.";
      }
    }, 800);
  });
}

/**
 * Wires up the Stripe one-time DNFT purchase button.
 *
 * Flow:
 *   1. User enters their wallet address in the shared input.
 *   2. Button click validates the address.
 *   3. Navigates to STRIPE_DNFT_PAYMENT_LINK with the wallet embedded as
 *      `?client_reference_id=DNFT-wallet:<address>` so the admin can see it
 *      in the Stripe Dashboard payment detail.
 *
 * @param {string} [btnId="dnft-stripe-btn"]            - The trigger button ID.
 * @param {string} [walletInputId="dnft-stripe-wallet"] - Wallet address input ID.
 * @param {string} [errElId="dnft-stripe-wallet-err"]   - Validation error element ID.
 * @param {string} [confirmElId="dnft-stripe-confirm"]  - Confirmation message element ID.
 * @returns {void}
 *
 * @example
 *   initDnftStripePurchase(); // uses default IDs set in index.html
 */
export function initDnftStripePurchase(
  btnId         = "dnft-stripe-btn",
  walletInputId = "dnft-stripe-wallet",
  errElId       = "dnft-stripe-wallet-err",
  confirmElId   = "dnft-stripe-confirm"
) {
  const btn         = document.getElementById(btnId);
  const walletInput = document.getElementById(walletInputId);
  const errEl       = document.getElementById(errElId);
  const confirmEl   = document.getElementById(confirmElId);

  if (!btn || !walletInput) {
    console.warn(
      "[subscription.js] initDnftStripePurchase: button or wallet input not found."
    );
    return;
  }

  btn.addEventListener("click", function () {
    const wallet    = walletInput.value.trim();
    const isAddress = /^0x[0-9a-fA-F]{40}$/.test(wallet);
    const isEns     = /^[^\s]+\.eth$/i.test(wallet);

    if (!wallet) {
      if (errEl) errEl.textContent = "⚠️ Please enter your wallet address before paying.";
      walletInput.focus();
      return;
    }
    if (!isAddress && !isEns) {
      if (errEl) errEl.textContent =
        "⚠️ Enter a valid 0x… address or ENS name (e.g. yourname.eth).";
      walletInput.focus();
      return;
    }

    if (errEl) errEl.textContent = "";

    const paymentLink = window.STRIPE_DNFT_PAYMENT_LINK || '';
    if (!paymentLink || paymentLink.includes(STRIPE_PLACEHOLDER_SENTINEL)) {
      alert(
        "Stripe DNFT checkout is not configured yet.\n\n" +
        "Open js/stripe-config.js and set STRIPE_DNFT_PAYMENT_LINK to your " +
        "$100 one-time Stripe Payment Link URL."
      );
      return;
    }

    // Append wallet as client_reference_id so it appears in the Stripe dashboard.
    const separator = paymentLink.includes('?') ? '&' : '?';
    const url = paymentLink + separator +
      'client_reference_id=' + encodeURIComponent('DNFT-wallet:' + wallet);

    // Show confirmation before navigating away.
    if (confirmEl) {
      const truncated =
        wallet.length > 14
          ? wallet.slice(0, 8) + "…" + wallet.slice(-6)
          : wallet;
      confirmEl.style.display = "block";
      confirmEl.innerHTML =
        "✅ Redirecting to Stripe checkout for $100…<br>" +
        "Your wallet <code>" + truncated + "</code> was noted — " +
        "admin will send your DNFT after verifying payment.";
    }

    setTimeout(function () { window.location.href = url; }, 400);
  });
}

/**
 * Subscribes to the BigNuten ETH plan on DecentEscrow via MetaMask.
 * Reads the current plan price on-chain and calls `subscribe(planId)`.
 *
 * Related issue: #43 — Build Crypto Subscription Payment Flow.
 *
 * @param {'monthly'|'annual'} [period='monthly'] - Which plan period to subscribe to.
 * @returns {Promise<string>} The transaction hash.
 *
 * @example
 *   const txHash = await payCryptoSubscription('annual');
 *   console.log('Tx:', txHash);
 */
export async function payCryptoSubscription(period = 'monthly') {
  await _ensureOptimism();
  try {
    const signer = await _getSigner();
    const contract = new ethers.Contract(
      DECENT_ESCROW_ADDRESS,
      DECENT_ESCROW_SUBSCRIPTION_ABI,
      signer
    );

    const planId = period === 'annual' ? PLAN_IDS.ethAnnual : PLAN_IDS.eth;

    // Read the ETH plan price from the contract.
    const plan = await contract.getPlan(planId);
    if (!plan.active) {
      // Fall back to monthly if annual plan not yet active
      if (period === 'annual') {
        throw new Error(
          `ETH annual plan (plan ${planId}) is not yet active on DecentEscrow. ` +
            "Contact support or wait for the plan to be activated."
        );
      }
      throw new Error(
        `ETH subscription plan (plan ${planId}) is not active on DecentEscrow. ` +
          "Contact support or wait for the plan to be activated."
      );
    }

    const value = plan.pricePerPeriod;
    console.log(
      `[subscription.js] Subscribing via DecentEscrow plan ${planId} ` +
        `with ${ethers.formatEther(value)} ETH…`
    );

    const tx = await contract.subscribe(planId, { value });
    console.log("[subscription.js] Tx submitted:", tx.hash);
    await tx.wait();
    console.log("[subscription.js] ETH subscription confirmed on DecentEscrow!");
    return tx.hash;
  } catch (err) {
    console.error("[subscription.js] payCryptoSubscription error:", err);
    throw err;
  }
}

/**
 * Subscribes to the BigNuten $BNUT plan on DecentEscrow via MetaMask.
 * Reads the plan price on-chain, requests ERC-20 approval if needed,
 * then calls `subscribe(planId)` on the DecentEscrow contract.
 *
 * Related issue: #44 — Accept $BNUT Token for Subscriptions (Discounted).
 *
 * @param {'monthly'|'annual'} [period='monthly'] - Which plan period to subscribe to.
 * @returns {Promise<string>} The transaction hash of the subscribe call.
 *
 * @example
 *   const txHash = await payBNUTSubscription('annual');
 *   console.log('Tx:', txHash);
 */
export async function payBNUTSubscription(period = 'monthly') {
  await _ensureOptimism();
  try {
    const signer = await _getSigner();
    const signerAddress = await signer.getAddress();

    const planId = period === 'annual' ? PLAN_IDS.bnutAnnual : PLAN_IDS.bnut;

    const escrowContract = new ethers.Contract(
      DECENT_ESCROW_ADDRESS,
      DECENT_ESCROW_SUBSCRIPTION_ABI,
      signer
    );

    const bnutContract = new ethers.Contract(
      BNUT_ADDRESS,
      BNUT_ABI,
      signer
    );

    // Read the $BNUT plan price from the contract.
    const plan = await escrowContract.getPlan(planId);
    if (!plan.active) {
      throw new Error(
        `$BNUT subscription plan (plan ${planId}) is not active on DecentEscrow. ` +
          "Contact support or wait for the plan to be activated."
      );
    }

    const price = plan.pricePerPeriod;

    // Check BNUT balance.
    const balance = await bnutContract.balanceOf(signerAddress);
    if (balance < price) {
      throw new Error(
        `Insufficient $BNUT balance. ` +
          `You have ${ethers.formatEther(balance)} BNUT but need ${ethers.formatEther(price)} BNUT.`
      );
    }

    // Approve DecentEscrow to spend BNUT if needed.
    const allowance = await bnutContract.allowance(signerAddress, DECENT_ESCROW_ADDRESS);
    if (allowance < price) {
      console.log("[subscription.js] Requesting $BNUT approval for DecentEscrow…");
      const approveTx = await bnutContract.approve(DECENT_ESCROW_ADDRESS, price);
      await approveTx.wait();
      console.log("[subscription.js] $BNUT approval confirmed.");
    }

    // Subscribe via DecentEscrow (ERC-20 plan — send no ETH).
    console.log(
      `[subscription.js] Subscribing via DecentEscrow plan ${planId} ` +
        `with ${ethers.formatEther(price)} BNUT…`
    );
    const tx = await escrowContract.subscribe(planId);
    console.log("[subscription.js] Tx submitted:", tx.hash);
    await tx.wait();
    console.log("[subscription.js] $BNUT subscription confirmed on DecentEscrow!");
    return tx.hash;
  } catch (err) {
    console.error("[subscription.js] payBNUTSubscription error:", err);
    throw err;
  }
}

/**
 * Subscribes to a BigNuten USDC plan on DecentEscrow via MetaMask.
 * Reads the plan price on-chain, requests USDC ERC-20 approval if needed,
 * then calls `subscribe(planId)` on the DecentEscrow contract.
 *
 * USDC on Optimism uses 6 decimals; price is read directly from the plan.
 *
 * @param {'monthly'|'annual'} [period='monthly'] - Which plan period to use.
 * @returns {Promise<string>} The transaction hash of the subscribe call.
 *
 * @example
 *   const txHash = await payUSDCSubscription('monthly');
 *   console.log('Tx:', txHash);
 */
export async function payUSDCSubscription(period = 'monthly') {
  await _ensureOptimism();
  try {
    const signer = await _getSigner();
    const signerAddress = await signer.getAddress();

    const planId = period === 'annual' ? PLAN_IDS.usdcAnnual : PLAN_IDS.usdc;

    const escrowContract = new ethers.Contract(
      DECENT_ESCROW_ADDRESS,
      DECENT_ESCROW_SUBSCRIPTION_ABI,
      signer
    );

    const usdcContract = new ethers.Contract(
      USDC_ADDRESS,
      BNUT_ABI, // USDC implements the standard ERC-20 interface (balanceOf, allowance, approve)
      signer
    );

    // Read the USDC plan price from the contract.
    const plan = await escrowContract.getPlan(planId);
    if (!plan.active) {
      throw new Error(
        `USDC subscription plan (plan ${planId}) is not yet active on DecentEscrow. ` +
          "Contact support or wait for the plan to be activated."
      );
    }

    const price = plan.pricePerPeriod;

    // USDC has 6 decimals — format for logging.
    const priceFormatted = (Number(price) / 1e6).toFixed(2);
    console.log(
      `[subscription.js] Subscribing via DecentEscrow plan ${planId} ` +
        `with ${priceFormatted} USDC…`
    );

    // Approve DecentEscrow to spend USDC if needed.
    const allowance = await usdcContract.allowance(signerAddress, DECENT_ESCROW_ADDRESS);
    if (allowance < price) {
      console.log("[subscription.js] Requesting USDC approval for DecentEscrow…");
      const approveTx = await usdcContract.approve(DECENT_ESCROW_ADDRESS, price);
      await approveTx.wait();
      console.log("[subscription.js] USDC approval confirmed.");
    }

    // Subscribe via DecentEscrow (ERC-20 plan — send no ETH).
    const tx = await escrowContract.subscribe(planId);
    console.log("[subscription.js] Tx submitted:", tx.hash);
    await tx.wait();
    console.log("[subscription.js] USDC subscription confirmed on DecentEscrow!");
    return tx.hash;
  } catch (err) {
    console.error("[subscription.js] payUSDCSubscription error:", err);
    throw err;
  }
}

/**
 * Fetches the current ETH, $BNUT, and USDC subscription prices from the DecentEscrow
 * plans and updates the price display elements in the subscription modal.
 * Also loads annual plan prices if those plans are active.
 * Silently no-ops if plans don't exist or MetaMask is unavailable.
 *
 * @param {'monthly'|'annual'} [period='monthly'] - Which plan period prices to display.
 * @returns {Promise<void>}
 *
 * @example
 *   await loadCryptoPrices('monthly');
 */
export async function loadCryptoPrices(period = 'monthly') {
  try {
    const provider = await _getProvider();
    const contract = new ethers.Contract(
      DECENT_ESCROW_ADDRESS,
      DECENT_ESCROW_SUBSCRIPTION_ABI,
      provider
    );

    // Fetch all plans; annual ones may not exist yet (will be silently skipped).
    const planFetches = [
      contract.getPlan(PLAN_IDS.eth).catch(() => null),
      contract.getPlan(PLAN_IDS.bnut).catch(() => null),
      contract.getPlan(PLAN_IDS.ethAnnual).catch(() => null),
      contract.getPlan(PLAN_IDS.bnutAnnual).catch(() => null),
      contract.getPlan(PLAN_IDS.usdc).catch(() => null),
      contract.getPlan(PLAN_IDS.usdcAnnual).catch(() => null),
    ];
    const [ethPlan, bnutPlan, ethAnnualPlan, bnutAnnualPlan, usdcPlan, usdcAnnualPlan] =
      await Promise.all(planFetches);

    const isAnnual = period === 'annual';

    const ethEl   = document.getElementById("sub-eth-price");
    const bnutEl  = document.getElementById("sub-bnut-price");
    const usdcEl  = document.getElementById("sub-usdc-price");

    // ETH price
    if (ethEl) {
      const plan = isAnnual ? ethAnnualPlan : ethPlan;
      if (plan?.active) {
        const label = isAnnual ? 'ETH / year' : 'ETH / month';
        ethEl.textContent = `${ethers.formatEther(plan.pricePerPeriod)} ${label}`;
      } else if (!isAnnual && ethPlan?.active) {
        ethEl.textContent = `${ethers.formatEther(ethPlan.pricePerPeriod)} ETH / month`;
      }
    }

    // BNUT price
    if (bnutEl) {
      const plan = isAnnual ? bnutAnnualPlan : bnutPlan;
      if (plan?.active) {
        const label = isAnnual ? '$BNUT / year' : '$BNUT / month';
        bnutEl.textContent = `${ethers.formatEther(plan.pricePerPeriod)} ${label}`;
      } else if (!isAnnual && bnutPlan?.active) {
        bnutEl.textContent = `${ethers.formatEther(bnutPlan.pricePerPeriod)} $BNUT / month`;
      }
    }

    // USDC price (6 decimals)
    if (usdcEl) {
      const plan = isAnnual ? usdcAnnualPlan : usdcPlan;
      if (plan?.active) {
        const amt   = (Number(plan.pricePerPeriod) / 1e6).toFixed(2);
        const label = isAnnual ? 'USDC / year' : 'USDC / month';
        usdcEl.textContent = `${amt} ${label}`;
      } else if (!isAnnual && usdcPlan?.active) {
        const amt = (Number(usdcPlan.pricePerPeriod) / 1e6).toFixed(2);
        usdcEl.textContent = `${amt} USDC / month`;
      }
    }
  } catch (err) {
    console.warn("[subscription.js] loadCryptoPrices: could not fetch prices:", err.message);
  }
}

// ─── Admin Functions (DecentEscrow owner only) ────────────────────────────────

/**
 * Fetches all plans from DecentEscrow and returns them as an array of objects.
 * Uses a read-only public RPC so this works without MetaMask.
 *
 * @returns {Promise<Array<{id: number, name: string, paymentToken: string,
 *   pricePerPeriod: bigint, periodSeconds: bigint, active: boolean}>>}
 */
export async function listDecentEscrowPlans() {
  const ethers = window.ethers;
  if (!ethers) throw new Error("ethers.js not loaded");

  const provider = new ethers.JsonRpcProvider(OPTIMISM_RPC_URL);
  const contract = new ethers.Contract(
    DECENT_ESCROW_ADDRESS,
    DECENT_ESCROW_SUBSCRIPTION_ABI,
    provider
  );

  const count = Number(await contract.nextPlanId());
  if (count === 0) return [];

  const plans = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      contract.getPlan(i).then(p => ({
        id:             i,
        name:           p.name,
        paymentToken:   p.paymentToken,
        pricePerPeriod: p.pricePerPeriod,
        periodSeconds:  p.periodSeconds,
        active:         p.active,
      }))
    )
  );
  return plans;
}

/**
 * Creates a new subscription plan on DecentEscrow. Owner-only on-chain call.
 *
 * @param {string}  name           - Human-readable plan name (e.g. "BigNuten Monthly ETH").
 * @param {string}  paymentToken   - ERC-20 address, or "0x0000000000000000000000000000000000000000" for ETH.
 * @param {string}  pricePerPeriod - Price in the payment token's smallest unit (wei for ETH).
 * @param {number}  periodSeconds  - Duration of one subscription period in seconds.
 * @returns {Promise<{txHash: string, planId: number}>}
 */
export async function createDecentEscrowPlan(name, paymentToken, pricePerPeriod, periodSeconds) {
  await _ensureOptimism();
  const signer = await _getSigner();
  const contract = new ethers.Contract(
    DECENT_ESCROW_ADDRESS,
    DECENT_ESCROW_SUBSCRIPTION_ABI,
    signer
  );

  console.log("[subscription.js] Creating plan:", { name, paymentToken, pricePerPeriod, periodSeconds });
  const tx = await contract.createPlan(name, paymentToken, pricePerPeriod, periodSeconds);
  const receipt = await tx.wait();

  // Parse planId from the PlanCreated event (topic 1 = indexed planId)
  const planCreatedTopic = ethers.id("PlanCreated(uint256,string,address,uint256,uint256)");
  const log = receipt.logs.find(l => l.topics[0] === planCreatedTopic);
  const planId = log ? Number(BigInt(log.topics[1])) : -1;

  console.log(`[subscription.js] Plan created: planId=${planId} tx=${tx.hash}`);
  return { txHash: tx.hash, planId };
}

/**
 * Deactivates an existing plan on DecentEscrow. Owner-only on-chain call.
 * Deactivated plans cannot receive new subscriptions, but existing ones remain valid.
 *
 * @param {number} planId - The plan ID to deactivate.
 * @returns {Promise<string>} The transaction hash.
 */
export async function deactivateDecentEscrowPlan(planId) {
  await _ensureOptimism();
  const signer = await _getSigner();
  const contract = new ethers.Contract(
    DECENT_ESCROW_ADDRESS,
    DECENT_ESCROW_SUBSCRIPTION_ABI,
    signer
  );

  console.log(`[subscription.js] Deactivating plan ${planId}…`);
  const tx = await contract.deactivatePlan(planId);
  await tx.wait();
  console.log(`[subscription.js] Plan ${planId} deactivated. Tx: ${tx.hash}`);
  return tx.hash;
}

/**
 * Returns the list of unique subscribers for a given plan, together with their
 * live subscription status.
 *
 * Implementation: queries the `Subscribed(planId, subscriber, expiresAt)` event
 * log on DecentEscrow, deduplicates addresses, then batch-fetches the current
 * `isSubscribed` flag and expiry timestamp for each address.
 *
 * @param {number} planId
 * @returns {Promise<Array<{address: string, active: boolean, expiresAt: number}>>}
 */
export async function getDecentEscrowSubscribers(planId) {
  const ethers = window.ethers;
  if (!ethers) throw new Error("ethers.js not loaded");

  const provider = new ethers.JsonRpcProvider(OPTIMISM_RPC_URL);
  const contract = new ethers.Contract(
    DECENT_ESCROW_ADDRESS,
    [
      ...DECENT_ESCROW_SUBSCRIPTION_ABI,
      "event Subscribed(uint256 indexed planId, address indexed subscriber, uint256 expiresAt)",
    ],
    provider
  );

  // Query event logs — planId is the first indexed topic so we can filter cheaply.
  // Optimism's public RPC accepts large block ranges for sparse events.
  let logs;
  try {
    const filter = contract.filters.Subscribed(planId);
    logs = await contract.queryFilter(filter, 0, "latest");
  } catch (err) {
    // Some RPC providers impose block-range limits; re-throw with a helpful message.
    throw new Error(
      `Could not query subscriber events: ${err.message}. ` +
      `You can view all events on ` +
      `https://optimistic.etherscan.io/address/${DECENT_ESCROW_ADDRESS}#events`
    );
  }

  // Deduplicate — keep each address once (most recent log wins for the initial view).
  // Use the original checksum address from ethers.js for both dedup tracking and storage.
  const seen = new Set();
  const unique = [];
  for (let i = logs.length - 1; i >= 0; i--) {
    const addr = logs[i].args.subscriber; // checksum address from ethers.js
    const addrKey = addr.toLowerCase();   // case-insensitive dedup key
    if (!seen.has(addrKey)) {
      seen.add(addrKey);
      unique.push(addr);
    }
  }

  if (unique.length === 0) return [];

  // Batch-fetch live status for every unique subscriber.
  const results = await Promise.all(
    unique.map(async addr => {
      const [active, expiresAtBn] = await Promise.all([
        contract.isSubscribed(planId, addr),
        contract.subscriptions(addr, planId),
      ]);
      return {
        address:   addr,
        active,
        expiresAt: Number(expiresAtBn),
      };
    })
  );

  // Sort: active first, then by expiry descending.
  results.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return b.expiresAt - a.expiresAt;
  });

  return results;
}
