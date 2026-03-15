/**
 * js/subscription.js
 * BigNuten Subscription Frontend Module
 *
 * Handles all subscription-related interactions for the BigNuten app:
 *   - On-chain status checks via the BigNutenSubscription contract
 *   - PayPal JS SDK subscription button initialisation  (Issue #40)
 *   - Stripe.js payment flow initialisation             (Issue #41)
 *   - ETH payment via MetaMask                          (Issue #43)
 *   - $BNUT discounted payment via MetaMask             (Issue #44)
 *
 * Prerequisites (loaded in index.html before this module):
 *   - ethers.js v6 (via CDN)
 *   - PayPal JS SDK  <script src="https://www.paypal.com/sdk/js?client-id=...">
 *   - Stripe.js      <script src="https://js.stripe.com/v3/">
 *
 * Usage (ES module):
 *   import {
 *     checkSubscriptionStatus,
 *     initPayPalSubscription,
 *     initStripeSubscription,
 *     payCryptoSubscription,
 *     payBNUTSubscription,
 *   } from './subscription.js';
 */

// ─── Contract ABIs (minimal — only the functions we call) ─────────────────────

/** Minimal ABI for the BigNutenSubscription contract. */
const SUBSCRIPTION_ABI = [
  // View functions
  "function isSubscribed(address user) view returns (bool)",
  "function getExpiry(address user) view returns (uint256)",
  "function ethPricePerMonth() view returns (uint256)",
  "function bnutPricePerMonth() view returns (uint256)",
  // State-changing functions
  "function subscribeWithEth() payable",
  "function subscribeWithBnut()",
];

/** Minimal ABI for the BigNuten ERC-20 token contract. */
const BNUT_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Contract addresses — update these after deploying your contracts.
 * In production, read from a config file or inject via your backend.
 */
const CONTRACT_ADDRESSES = {
  subscription:
    window.SUBSCRIPTION_CONTRACT_ADDRESS ||
    "0x0000000000000000000000000000000000000000",
  bnut:
    window.BNUT_CONTRACT_ADDRESS ||
    "0x0000000000000000000000000000000000000000",
};

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

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Checks whether a wallet address has an active BigNuten subscription
 * by querying the BigNutenSubscription contract on-chain.
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
      CONTRACT_ADDRESSES.subscription,
      SUBSCRIPTION_ABI,
      provider
    );

    const [active, expiryTimestamp] = await Promise.all([
      contract.isSubscribed(walletAddress),
      contract.getExpiry(walletAddress),
    ]);

    const expiry =
      expiryTimestamp > 0n
        ? new Date(Number(expiryTimestamp) * 1000)
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
 * Initialises a Stripe.js payment flow for a subscription price.
 * Redirects to Stripe Checkout (hosted page) using a pre-created Price ID.
 * Requires the Stripe publishable key to be set in `window.STRIPE_PUBLISHABLE_KEY`.
 *
 * Related issue: #41 — Integrate Stripe Credit/Debit Card Subscriptions.
 *
 * @param {string} priceId - Stripe Price ID (e.g. "price_XXXXXXXXXX").
 * @param {string} successUrl - URL to redirect to on successful payment.
 * @param {string} cancelUrl  - URL to redirect to if the user cancels.
 * @returns {Promise<void>}
 *
 * @example
 *   await initStripeSubscription(
 *     'price_123',
 *     'https://bignuten.app/success',
 *     'https://bignuten.app/cancel'
 *   );
 */
export async function initStripeSubscription(
  priceId,
  successUrl = window.location.origin + "?stripe=success",
  cancelUrl = window.location.origin + "?stripe=cancel"
) {
  const stripeKey = window.STRIPE_PUBLISHABLE_KEY;
  if (!stripeKey) {
    throw new Error(
      "[subscription.js] window.STRIPE_PUBLISHABLE_KEY is not set. " +
        "Add it to your page before calling initStripeSubscription()."
    );
  }
  if (typeof Stripe === "undefined") {
    throw new Error(
      "[subscription.js] Stripe.js not loaded. " +
        "Add <script src='https://js.stripe.com/v3/'> to index.html."
    );
  }

  const stripe = Stripe(stripeKey);

  // TODO (#41): Replace with a call to your backend to create a Checkout Session.
  //             The backend should return the session ID.
  //             Example: POST /api/create-checkout-session { priceId }
  console.warn(
    "[subscription.js] initStripeSubscription: You must implement a backend " +
      "endpoint to create a Stripe Checkout Session. See Stripe docs: " +
      "https://stripe.com/docs/billing/subscriptions/build-subscriptions"
  );

  // Placeholder redirect — replace `sessionId` with your backend response.
  // const { sessionId } = await fetch('/api/create-checkout-session', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ priceId, successUrl, cancelUrl }),
  // }).then(r => r.json());
  // await stripe.redirectToCheckout({ sessionId });
}

/**
 * Sends ETH directly to the BigNutenSubscription contract via MetaMask
 * to purchase a 30-day subscription at the current ETH price.
 *
 * Related issue: #43 — Build Crypto Subscription Payment Flow.
 *
 * @param {string} [amountEth] - Override ETH amount (e.g. "0.01").
 *   If omitted, reads the current price from the contract.
 * @returns {Promise<string>} The transaction hash.
 *
 * @example
 *   const txHash = await payCryptoSubscription();
 *   console.log('Tx:', txHash);
 */
export async function payCryptoSubscription(amountEth) {
  try {
    const signer = await _getSigner();
    const contract = new ethers.Contract(
      CONTRACT_ADDRESSES.subscription,
      SUBSCRIPTION_ABI,
      signer
    );

    let value;
    if (amountEth) {
      value = ethers.parseEther(amountEth);
    } else {
      // Read the current price from the contract.
      value = await contract.ethPricePerMonth();
    }

    console.log(
      `[subscription.js] Sending ${ethers.formatEther(value)} ETH for subscription…`
    );

    const tx = await contract.subscribeWithEth({ value });
    console.log("[subscription.js] Tx submitted:", tx.hash);
    await tx.wait();
    console.log("[subscription.js] Subscription confirmed on-chain!");
    return tx.hash;
  } catch (err) {
    console.error("[subscription.js] payCryptoSubscription error:", err);
    throw err;
  }
}

/**
 * Pays for a 30-day BigNuten subscription using $BNUT tokens at the
 * discounted BNUT rate. Requests an ERC-20 approval first if needed,
 * then calls `subscribeWithBnut()` on the subscription contract.
 *
 * Related issue: #44 — Accept $BNUT Token for Subscriptions (Discounted).
 *
 * @param {string} [amountBnut] - Override BNUT amount (e.g. "500").
 *   If omitted, reads the current price from the contract.
 * @returns {Promise<string>} The transaction hash of the subscribe call.
 *
 * @example
 *   const txHash = await payBNUTSubscription();
 *   console.log('Tx:', txHash);
 */
export async function payBNUTSubscription(amountBnut) {
  try {
    const signer = await _getSigner();
    const signerAddress = await signer.getAddress();

    const subscriptionContract = new ethers.Contract(
      CONTRACT_ADDRESSES.subscription,
      SUBSCRIPTION_ABI,
      signer
    );

    const bnutContract = new ethers.Contract(
      CONTRACT_ADDRESSES.bnut,
      BNUT_ABI,
      signer
    );

    // Determine price.
    let price;
    if (amountBnut) {
      price = ethers.parseEther(amountBnut);
    } else {
      price = await subscriptionContract.bnutPricePerMonth();
    }

    // Check BNUT balance.
    const balance = await bnutContract.balanceOf(signerAddress);
    if (balance < price) {
      throw new Error(
        `Insufficient $BNUT balance. ` +
          `You have ${ethers.formatEther(balance)} BNUT but need ${ethers.formatEther(price)} BNUT.`
      );
    }

    // Approve the subscription contract to spend BNUT if needed.
    const allowance = await bnutContract.allowance(
      signerAddress,
      CONTRACT_ADDRESSES.subscription
    );

    if (allowance < price) {
      console.log("[subscription.js] Requesting $BNUT approval…");
      const approveTx = await bnutContract.approve(
        CONTRACT_ADDRESSES.subscription,
        price
      );
      await approveTx.wait();
      console.log("[subscription.js] $BNUT approval confirmed.");
    }

    // Subscribe with BNUT.
    console.log(
      `[subscription.js] Subscribing with ${ethers.formatEther(price)} BNUT…`
    );
    const tx = await subscriptionContract.subscribeWithBnut();
    console.log("[subscription.js] Tx submitted:", tx.hash);
    await tx.wait();
    console.log("[subscription.js] $BNUT subscription confirmed on-chain!");
    return tx.hash;
  } catch (err) {
    console.error("[subscription.js] payBNUTSubscription error:", err);
    throw err;
  }
}
