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
 *   - Stripe.js      <script src="https://js.stripe.com/v3/">
 *   - js/contracts.js (sets window.SUBSCRIPTION_CONTRACT_ADDRESS to DecentEscrow,
 *                      and window.BIGNUTEN_ETH_PLAN_ID / BIGNUTEN_BNUT_PLAN_ID)
 *
 * Usage (ES module):
 *   import {
 *     checkSubscriptionStatus,
 *     initPayPalSubscription,
 *     initStripeSubscription,
 *     payCryptoSubscription,
 *     payBNUTSubscription,
 *     initDnftPayPalPurchase,
 *   } from './subscription.js';
 */

// ─── Contract ABIs (minimal — only the functions we call) ─────────────────────

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
  // State-changing function
  "function subscribe(uint256 planId) payable",
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

/**
 * DecentEscrow plan IDs for BigNuten subscriptions.
 * Override by setting window.BIGNUTEN_ETH_PLAN_ID / BIGNUTEN_BNUT_PLAN_ID
 * before this module loads (set in js/contracts.js).
 */
const PLAN_IDS = {
  eth:  window.BIGNUTEN_ETH_PLAN_ID  ?? 0,
  bnut: window.BIGNUTEN_BNUT_PLAN_ID ?? 1,
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
            rpcUrls: ["https://mainnet.optimism.io"],
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

    // Check both ETH plan and BNUT plan simultaneously.
    const [ethActive, bnutActive, ethExpiry, bnutExpiry] = await Promise.all([
      contract.isSubscribed(PLAN_IDS.eth,  walletAddress),
      contract.isSubscribed(PLAN_IDS.bnut, walletAddress),
      contract.subscriptions(walletAddress, PLAN_IDS.eth),
      contract.subscriptions(walletAddress, PLAN_IDS.bnut),
    ]);

    const active = ethActive || bnutActive;
    // Use the later of the two expiry timestamps.
    const expiryTimestamp = ethExpiry > bnutExpiry ? ethExpiry : bnutExpiry;
    const expiry = expiryTimestamp > 0n
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
 * Subscribes to the BigNuten ETH plan on DecentEscrow via MetaMask.
 * Reads the current plan price on-chain and calls `subscribe(planId)`.
 *
 * Related issue: #43 — Build Crypto Subscription Payment Flow.
 *
 * @returns {Promise<string>} The transaction hash.
 *
 * @example
 *   const txHash = await payCryptoSubscription();
 *   console.log('Tx:', txHash);
 */
export async function payCryptoSubscription() {
  await _ensureOptimism();
  try {
    const signer = await _getSigner();
    const contract = new ethers.Contract(
      DECENT_ESCROW_ADDRESS,
      DECENT_ESCROW_SUBSCRIPTION_ABI,
      signer
    );

    // Read the ETH plan price from the contract.
    const plan = await contract.getPlan(PLAN_IDS.eth);
    if (!plan.active) {
      throw new Error(
        `ETH subscription plan (plan ${PLAN_IDS.eth}) is not active on DecentEscrow. ` +
          "Contact support or wait for the plan to be activated."
      );
    }

    const value = plan.pricePerPeriod;
    console.log(
      `[subscription.js] Subscribing via DecentEscrow plan ${PLAN_IDS.eth} ` +
        `with ${ethers.formatEther(value)} ETH…`
    );

    const tx = await contract.subscribe(PLAN_IDS.eth, { value });
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
 * @returns {Promise<string>} The transaction hash of the subscribe call.
 *
 * @example
 *   const txHash = await payBNUTSubscription();
 *   console.log('Tx:', txHash);
 */
export async function payBNUTSubscription() {
  await _ensureOptimism();
  try {
    const signer = await _getSigner();
    const signerAddress = await signer.getAddress();

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
    const plan = await escrowContract.getPlan(PLAN_IDS.bnut);
    if (!plan.active) {
      throw new Error(
        `$BNUT subscription plan (plan ${PLAN_IDS.bnut}) is not active on DecentEscrow. ` +
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
      `[subscription.js] Subscribing via DecentEscrow plan ${PLAN_IDS.bnut} ` +
        `with ${ethers.formatEther(price)} BNUT…`
    );
    const tx = await escrowContract.subscribe(PLAN_IDS.bnut);
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
 * Fetches the current ETH and $BNUT subscription prices from the DecentEscrow
 * plans and updates the price display elements in the subscription modal.
 * Silently no-ops if plans don't exist or MetaMask is unavailable.
 *
 * @returns {Promise<void>}
 *
 * @example
 *   await loadCryptoPrices();
 */
export async function loadCryptoPrices() {
  try {
    const provider = await _getProvider();
    const contract = new ethers.Contract(
      DECENT_ESCROW_ADDRESS,
      DECENT_ESCROW_SUBSCRIPTION_ABI,
      provider
    );

    const [ethPlan, bnutPlan] = await Promise.all([
      contract.getPlan(PLAN_IDS.eth),
      contract.getPlan(PLAN_IDS.bnut),
    ]);

    const ethEl = document.getElementById("sub-eth-price");
    const bnutEl = document.getElementById("sub-bnut-price");

    if (ethEl && ethPlan.active) {
      ethEl.textContent = `${ethers.formatEther(ethPlan.pricePerPeriod)} ETH / month`;
    }
    if (bnutEl && bnutPlan.active) {
      bnutEl.textContent = `${ethers.formatEther(bnutPlan.pricePerPeriod)} $BNUT / month`;
    }
  } catch (err) {
    console.warn("[subscription.js] loadCryptoPrices: could not fetch prices:", err.message);
  }
}
