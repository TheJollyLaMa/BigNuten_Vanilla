Now I need to see the About modal section and subscription modal in index.html:

Let me get the About modal section directly:

Now let me see the subscription modal (around line 2100+):

Now I have full context. Let me also check the `app.js` for the subscription modal opening logic:

Now I have complete understanding of the codebase. Let me produce the complete code changes:

## 1. `index.html` changes

### Change 1: Un-disable the "Pay with Crypto" button (line ~1154)

```html
          <!-- Crypto — opens subscription modal on the ETH tab -->
          <button class="about-pay-btn crypto-btn" title="Pay with ETH, USDC, or $BNUT via MetaMask"
                  onclick="if(window.openSubscriptionModal){window.openSubscriptionModal('crypto');}else{alert('Loading wallet connection…');}">
            🔗 Pay with Crypto
          </button>
```

### Change 2: Add USDC tab in subscription modal payment method tabs (line ~2164-2169)

```html
        <!-- Payment method tabs -->
        <div class="sub-method-tabs" role="tablist" aria-label="Payment method">
          <button class="sub-method-tab sub-tab-active" role="tab" data-method="paypal">🅿️ PayPal</button>
          <button class="sub-method-tab" role="tab" data-method="stripe">💳 Card</button>
          <button class="sub-method-tab" role="tab" data-method="eth">Ξ ETH</button>
          <button class="sub-method-tab" role="tab" data-method="usdc">💱 USDC</button>
          <button class="sub-method-tab" role="tab" data-method="bnut"><img src="img/BigNuten.png" alt="$BNUT" style="height:1em;vertical-align:middle;margin-right:3px;"> $BNUT <span class="sub-save-badge">~50% off</span></button>
        </div>
```

### Change 3: Add USDC panel after BNUT panel (line ~2245)

```html
        <!-- USDC panel -->
        <div id="sub-panel-usdc" class="sub-method-panel" style="display:none;">
          <p class="sub-method-desc">Pay with USDC (ERC-20) via MetaMask. Subscription recorded on-chain on Optimism.</p>
          <div class="sub-crypto-price-row">
            <span class="sub-crypto-label">Price:</span>
            <span id="sub-usdc-price" class="sub-crypto-price">~10 USDC / month</span>
          </div>
          <button id="sub-usdc-btn" class="sub-pay-btn sub-eth-btn-style">
            💱 Pay with USDC
          </button>
          <p id="sub-usdc-status" class="sub-method-status"></p>
          <p class="sub-sandbox-note">⛓️ Optimism Mainnet — MetaMask will prompt to switch network if needed</p>
        </div>
```

### Change 4: Add crypto cancel link in footer links (line ~2257-2261)

```html
      <div class="sub-footer-links">
        <a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noopener noreferrer" class="sub-footer-link">🅿️ Manage PayPal Autopay</a>
        <a href="https://billing.stripe.com/p/login/test_00000" target="_blank" rel="noopener noreferrer" class="sub-footer-link">💳 Manage Card / Stripe</a>
        <a id="sub-cancel-crypto-link" href="#" class="sub-footer-link" style="display:none;">⛓️ Cancel Crypto Subscription (On-Chain)</a>
        <a href="mailto:jrlamanna@gmail.com?subject=BigNuten%20Subscription%20Help" class="sub-footer-link">📧 Contact Support</a>
      </div>
```

## 2. `css/styles.css` changes

```css
/* ── Crypto button — bright enabled state ──────────────────── */
.crypto-btn {
  background: rgba(0, 60, 90, 0.35);
  border: 2px solid rgba(0, 229, 255, 0.6);
  color: #00e5ff;
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);
  text-shadow: 0 0 6px rgba(0, 229, 255, 0.5);
  transition: box-shadow 0.2s, background 0.2s, transform 0.1s;
}

.crypto-btn:hover {
  background: rgba(0, 229, 255, 0.15);
  box-shadow: 0 0 18px rgba(0, 229, 255, 0.6);
  border-color: #00e5ff;
  transform: translateY(-1px);
}

.crypto-btn[aria-disabled="true"],
.crypto-btn.disabled {
  cursor: default;
  opacity: 0.65;
  box-shadow: none;
}
```

## 3. `js/subscription.js` additions

```js
// ─── USDC Configuration ─────────────────────────────────────────────────────

/** USDC ERC-20 token address on Optimism Mainnet. */
const USDC_ADDRESS =
  "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";

/** Minimal ABI for the USDC ERC-20 token contract. */
const USDC_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

/** Extended plan IDs including annual plans. */
const ANNUAL_PLAN_IDS = {
  eth:  2, // Plan 2 — ETH annual
  bnut: 3, // Plan 3 — $BNUT annual
};

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Subscribes to the BigNuten USDC plan on DecentEscrow via MetaMask.
 * Reads the plan price on-chain, requests ERC-20 approval if needed,
 * then calls `subscribe(planId)` on the DecentEscrow contract.
 *
 * @param {number} [planId] - The USDC plan ID (default: from window.BIGNUTEN_USDC_PLAN_ID or 2).
 * @returns {Promise<string>} The transaction hash of the subscribe call.
 *
 * @example
 *   const txHash = await payUSDCSubscription();
 *   console.log('Tx:', txHash);
 */
export async function payUSDCSubscription(planId) {
  await _ensureOptimism();
  try {
    const signer = await _getSigner();
    const signerAddress = await signer.getAddress();

    const escrowContract = new ethers.Contract(
      DECENT_ESCROW_ADDRESS,
      DECENT_ESCROW_SUBSCRIPTION_ABI,
      signer
    );

    const usdcContract = new ethers.Contract(
      USDC_ADDRESS,
      USDC_ABI,
      signer
    );

    // Use provided planId or default
    const usdcPlanId = planId ?? window.BIGNUTEN_USDC_PLAN_ID ?? 2;

    // Read the USDC plan price from the contract.
    const plan = await escrowContract.getPlan(usdcPlanId);
    if (!plan.active) {
      throw new Error(
        `USDC subscription plan (plan ${usdcPlanId}) is not active on DecentEscrow. ` +
          "Contact support or wait for the plan to be activated."
      );
    }

    const price = plan.pricePerPeriod;

    // Check USDC balance (USDC has 6 decimals).
    const balance = await usdcContract.balanceOf(signerAddress);
    if (balance < price) {
      const decimals = 6n;
      const divisor = 10n ** decimals;
      throw new Error(
        `Insufficient USDC balance. ` +
          `You have ${Number(balance) / Number(divisor)} USDC but need ${Number(price) / Number(divisor)} USDC.`
      );
    }

    // Approve DecentEscrow to spend USDC if needed.
    const allowance = await usdcContract.allowance(signerAddress, DECENT_ESCROW_ADDRESS);
    if (allowance < price) {
      console.log("[subscription.js] Requesting USDC approval for DecentEscrow…");
      const approveTx = await usdcContract.approve(DECENT_ESCROW_ADDRESS, price);
      await approveTx.wait();
      console.log("[subscription.js] USDC approval confirmed.");
    }

    // Subscribe via DecentEscrow (ERC-20 plan — send no ETH).
    console.log(
      `[subscription.js] Subscribing via DecentEscrow plan ${usdcPlanId} ` +
        `with ${price} USDC…`
    );
    const tx = await escrowContract.subscribe(usdcPlanId);
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
 * Subscribes to an annual plan on DecentEscrow via MetaMask.
 * Supports both ETH annual (plan 2) and BNUT annual (plan 3).
 *
 * @param {'eth'|'bnut'} token - The token to pay with.
 * @param {number} [planId] - Override plan ID (default: auto-detect from token).
 * @returns {Promise<string>} The transaction hash.
 *
 * @example
 *   const txHash = await payAnnualSubscription('eth');
 */
export async function payAnnualSubscription(token, planId) {
  await _ensureOptimism();
  try {
    const signer = await _getSigner();
    const signerAddress = await signer.getAddress();

    const escrowContract = new ethers.Contract(
      DECENT_ESCROW_ADDRESS,
      DECENT_ESCROW_SUBSCRIPTION_ABI,
      signer
    );

    // Determine plan ID
    const annualPlanId = planId ?? ANNUAL_PLAN_IDS[token];
    if (annualPlanId === undefined) {
      throw new Error(`Unknown annual token: ${token}. Use 'eth' or 'bnut'.`);
    }

    // Read the plan price from the contract.
    const plan = await escrowContract.getPlan(annualPlanId);
    if (!plan.active) {
      throw new Error(
        `Annual ${token.toUpperCase()} subscription plan (plan ${annualPlanId}) is not active on DecentEscrow. ` +
          "Contact support or wait for the plan to be activated."
      );
    }

    const price = plan.pricePerPeriod;

    if (token === 'eth') {
      // ETH annual — send ETH
      console.log(
        `[subscription.js] Subscribing to ETH annual via DecentEscrow plan ${annualPlanId} ` +
          `with ${ethers.formatEther(price)} ETH…`
      );
      const tx = await escrowContract.subscribe(annualPlanId, { value: price });
      console.log("[subscription.js] Tx submitted:", tx.hash);
      await tx.wait();
      console.log("[subscription.js] ETH annual subscription confirmed on DecentEscrow!");
      return tx.hash;
    }

    if (token === 'bnut') {
      // BNUT annual — approve + subscribe
      const bnutContract = new ethers.Contract(
        BNUT_ADDRESS,
        BNUT_ABI,
        signer
      );

      const balance = await bnutContract.balanceOf(signerAddress);
      if (balance < price) {
        throw new Error(
          `Insufficient $BNUT balance. ` +
            `You have ${ethers.formatEther(balance)} BNUT but need ${ethers.formatEther(price)} BNUT.`
        );
      }

      const allowance = await bnutContract.allowance(signerAddress, DECENT_ESCROW_ADDRESS);
      if (allowance < price) {
        console.log("[subscription.js] Requesting $BNUT approval for DecentEscrow (annual)…");
        const approveTx = await bnutContract.approve(DECENT_ESCROW_ADDRESS, price);
        await approveTx.wait();
        console.log("[subscription.js] $BNUT approval confirmed.");
      }

      console.log(
        `[subscription.js] Subscribing to BNUT annual via DecentEscrow plan ${annualPlanId} ` +
          `with ${ethers.formatEther(price)} BNUT…`
      );
      const tx = await escrowContract.subscribe(annualPlanId);
      console.log("[subscription.js] Tx submitted:", tx.hash);
      await tx.wait();
      console.log("[subscription.js] BNUT annual subscription confirmed on DecentEscrow!");
      return tx.hash;
    }
  } catch (err) {
    console.error("[subscription.js] payAnnualSubscription error:", err);
    throw err;
  }
}

/**
 * Cancel an on-chain crypto subscription by clearing the local subscription record.
 * On-chain subscriptions on DecentEscrow simply expire at the end of their period;
 * there is no explicit cancel function. This clears the local UI state.
 *
 * @returns {void}
 */
export function cancelCryptoSubscription() {
  localStorage.removeItem('bignuten_subscription');
  console.log("[subscription.js] Crypto subscription cancelled locally. On-chain subscription will expire at the end of its current period.");
}
```

## 4. `js/app.js` — updated `openSubscriptionModal` and wiring

Add the following changes to the subscription modal initialization in `js/app.js`:

```js
    // ── Modified openSubModal to handle 'crypto' method (hide PayPal & Stripe) ──

    function openSubModal(method) {
      subModal.classList.remove('modal-hidden');
      document.body.classList.add('modal-active');
      loadSubscriptionStatus();
      renderPaymentHistory();

      // Load live ETH / BNUT prices from the on-chain contract.
      import('./subscription.js').then(({ loadCryptoPrices }) => loadCryptoPrices()).catch((err) => {
        console.warn('[subscription] could not load crypto prices:', err.message);
      });

      // If opened from "Pay with Crypto" button, hide non-crypto tabs
      const paypalTab  = subModal.querySelector('.sub-method-tab[data-method="paypal"]');
      const stripeTab  = subModal.querySelector('.sub-method-tab[data-method="stripe"]');
      const ethTab     = subModal.querySelector('.sub-method-tab[data-method="eth"]');
      const usdcTab    = subModal.querySelector('.sub-method-tab[data-method="usdc"]');
      const bnutTab    = subModal.querySelector('.sub-method-tab[data-method="bnut"]');

      if (method === 'crypto') {
        // Hide PayPal and Stripe tabs — crypto-only view
        if (paypalTab) paypalTab.style.display = 'none';
        if (stripeTab) stripeTab.style.display = 'none';
        // Default to ETH tab for crypto view
        if (ethTab) {
          ethTab.classList.add('sub-tab-active');
          ethTab.setAttribute('aria-selected', 'true');
          ethTab.click();
        }
      } else {
        // Restore all tabs for normal view
        if (paypalTab) paypalTab.style.display = '';
        if (stripeTab) stripeTab.style.display = '';
      }

      // Optionally switch to a specific payment tab (e.g. 'eth', 'bnut', 'usdc')
      if (method && method !== 'crypto') {
        const targetTab = subModal.querySelector(`.sub-method-tab[data-method="${method}"]`);
        if (targetTab) targetTab.click();
      }
    }
```

Then add the USDC button wiring and crypto cancel link wiring right after the existing ETH/BNUT button event listeners:

```js
    // ── USDC pay button ──
    const usdcBtn = document.getElementById('sub-usdc-btn');
    if (usdcBtn) {
      usdcBtn.addEventListener('click', async () => {
        const statusEl = document.getElementById('sub-usdc-status');
        const planToggle = document.getElementById('sub-plan-toggle');
        const isAnnual = planToggle?.querySelector('.sub-plan-active')?.dataset?.plan === 'annual';
        const usdcPlanId = isAnnual ? (window.BIGNUTEN_USDC_ANNUAL_PLAN_ID ?? 5) : (window.BIGNUTEN_USDC_PLAN_ID ?? 2);

        try {
          if (statusEl) statusEl.textContent = '⏳ Prompting MetaMask…';
          const { payUSDCSubscription } = await import('./subscription.js');
          const txHash = await payUSDCSubscription(usdcPlanId);
          // Persist subscription state
          localStorage.setItem('bignuten_subscription', JSON.stringify({
            status: 'active',
            method: 'USDC (On-Chain)',
            plan: isAnnual ? 'Annual' : 'Monthly',
            expiry: new Date(Date.now() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
            txHash,
          }));
          if (statusEl) statusEl.textContent = `✅ Subscribed! Tx: ${txHash.slice(0, 10)}…`;
          loadSubscriptionStatus();
        } catch (err) {
          console.error('[subscription] USDC pay error:', err);
          if (statusEl) statusEl.textContent = `❌ ${err.message || 'Payment failed'}`;
        }
      });
    }

    // ── Annual plan support for ETH and BNUT buttons ──
    // Update the existing ETH button handler to respect annual toggle
    const ethBtnUpdated = document.getElementById('sub-eth-btn');
    if (ethBtnUpdated) {
      // Clone to remove existing listeners, then re-attach
      const newEthBtn = ethBtnUpdated.cloneNode(true);
      ethBtnUpdated.parentNode.replaceChild(newEthBtn, ethBtnUpdated);
      newEthBtn.addEventListener('click', async () => {
        const statusEl = document.getElementById('sub-eth-status');
        const planToggle = document.getElementById('sub-plan-toggle');
        const isAnnual = planToggle?.querySelector('.sub-plan-active')?.dataset?.plan === 'annual';

        try {
          if (statusEl) statusEl.textContent = '⏳ Prompting MetaMask…';
          const { payCryptoSubscription, payAnnualSubscription } = await import('./subscription.js');
          const txHash = isAnnual
            ? await payAnnualSubscription('eth')
            : await payCryptoSubscription();

          localStorage.setItem('bignuten_subscription', JSON.stringify({
            status: 'active',
            method: 'ETH (On-Chain)',
            plan: isAnnual ? 'Annual' : 'Monthly',
            expiry: new Date(Date.now() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
            txHash,
          }));
          if (statusEl) statusEl.textContent = `✅ Subscribed! Tx: ${txHash.slice(0, 10)}…`;
          loadSubscriptionStatus();
        } catch (err) {
          console.error('[subscription] ETH pay error:', err);
          if (statusEl) statusEl.textContent = `❌ ${err.message || 'Payment failed'}`;
        }
      });
    }

    // ── Crypto cancel link in footer ──
    const cryptoCancelLink = document.getElementById('sub-cancel-crypto-link');
    if (cryptoCancelLink) {
      cryptoCancelLink.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('Cancel your crypto subscription?\n\nYour subscription will remain active until the end of the current billing period. No further charges will occur.')) {
          return;
        }
        const { cancelCryptoSubscription } = await import('./subscription.js');
        cancelCryptoSubscription();
        loadSubscriptionStatus();
        alert('✅ Crypto subscription cancelled. Your access will remain active until the end of the current period.');
      });
    }

    // ── Show/hide crypto cancel link based on subscription method ──
    // Called after loadSubscriptionStatus
    const origLoadStatus = loadSubscriptionStatus;
    // Patch: after status loads, toggle crypto cancel link visibility
    const _origLoad = loadSubscriptionStatus;
    // We hook into it via the manage row display
    const subManageRow = document.getElementById('sub-manage-row');
    if (subManageRow) {
      // Use MutationObserver or check after status loads
      const checkCryptoCancel = () => {
        const stored = (() => {
          try { return JSON.parse(localStorage.getItem('bignuten_subscription') || 'null'); }
          catch { return null; }
        })();
        const method = (stored?.method || '').toLowerCase();
        if (cryptoCancelLink) {
          const isCrypto = method.includes('eth') || method.includes('bnut') || method.includes('usdc');
          cryptoCancelLink.style.display = isCrypto ? '' : 'none';
        }
      };
      // Run check whenever manage row becomes visible
      const observer = new MutationObserver(checkCryptoCancel);
      observer.observe(subManageRow, { attributes: true, attributeFilter: ['style'] });
      checkCryptoCancel();
    }
```

Also update the cancel button handler to show crypto cancel info clearly:

```js
    // ── Cancel button (updated for crypto clarity) ──

    const cancelBtn = document.getElementById('sub-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        const stored = (() => {
          try { return JSON.parse(localStorage.getItem('bignuten_subscription') || 'null'); }
          catch { return null; }
        })();

        const methodLower = (stored?.method || '').toLowerCase();
        const isCrypto = methodLower.includes('eth') || methodLower.includes('bnut') || methodLower.includes('usdc');

        if (isCrypto) {
          if (confirm('Cancel your crypto subscription?\n\nYour subscription will remain active until the end of the current billing period. No further charges will occur.')) {
            import('./subscription.js').then(({ cancelCryptoSubscription }) => {
              cancelCryptoSubscription();
              loadSubscriptionStatus();
              alert('✅ Crypto subscription cancelled. Your access remains until the end of the current period.');
            });
          }
          return;
        }

        let cancelUrl = 'https://www.paypal.com/myaccount/autopay/';
        if (methodLower.includes('stripe') || methodLower.includes('card')) {
          cancelUrl = 'https://billing.stripe.com/p/login/test_00000';
        }
        window.open(cancelUrl, '_blank', 'noopener,noreferrer');
      });
    }
```

Now let me also add the USDC price loading to `loadCryptoPrices`:

```js
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
    const usdcEl = document.getElementById("sub-usdc-price");

    if (ethEl && ethPlan.active) {
      ethEl.textContent = `${ethers.formatEther(ethPlan.pricePerPeriod)} ETH / month`;
    }
    if (bnutEl && bnutPlan.active) {
      bnutEl.textContent = `${ethers.formatEther(bnutPlan.pricePerPeriod)} $BNUT / month`;
    }

    // Try to load USDC plan price (plan ID 2 by default)
    const usdcPlanId = window.BIGNUTEN_USDC_PLAN_ID ?? 2;
    try {
      const usdcPlan = await contract.getPlan(usdcPlanId);
      if (usdcEl && usdcPlan.active) {
        // USDC has 6 decimals
        const usdcAmount = Number(usdcPlan.pricePerPeriod) / 1e6;
        usdcEl.textContent = `~${usdcAmount} USDC / month`;
      }
    } catch (err) {
      // USDC plan may not exist yet — silently skip
      console.warn("[subscription.js] USDC plan not found:", err.message);
    }
  } catch (err) {
    console.warn("[subscription.js] loadCryptoPrices: could not fetch prices:", err.message);
  }
}
```

Here's a summary of all changes across the 4 files:

**File 1: `index.html`**
- Line ~1154: Removed disabled state from crypto button, changed onclick to pass `'crypto'` method
- Line ~2164-2169: Added USDC tab to payment method tabs
- After line ~2245: Added USDC payment panel with price display and pay button
- Line ~2257-2261: Added crypto cancel link in footer

**File 2: `css/styles.css`**
- Replaced `.crypto-btn` block: bright cyan color, glow border, hover effect; disabled state preserved via modifier selectors

**File 3: `js/subscription.js`**
- Added `USDC_ADDRESS` and `USDC_ABI` constants
- Added `ANNUAL_PLAN_IDS` config
- Added `payUSDCSubscription(planId)` — USDC ERC-20 pay flow with approval
- Added `payAnnualSubscription(token, planId)` — annual plan for ETH/BNUT
- Added `cancelCryptoSubscription()` — clears local subscription state with clarity
- Updated `loadCryptoPrices()` to also fetch and display USDC plan price

**File 4: `js/app.js`**
- Updated `openSubModal()` to accept `'crypto'` method which hides PayPal/Stripe tabs
- Added USDC button click handler with annual plan support
- Updated ETH button to respect annual toggle via `payAnnualSubscription`
- Added crypto cancel link handler with clear expiry-period messaging
- Updated cancel button to handle crypto subscriptions with a confirmation dialog explaining the subscription remains active until period end
- Added MutationObserver to show/hide crypto cancel footer link based on subscription method