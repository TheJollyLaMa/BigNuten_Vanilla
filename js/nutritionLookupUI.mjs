import { NUTRIENTS, validateNutrition, saveNutritionDefault, matchingDefaults, scaleNutrition } from './nutritionDefaults.mjs';
import { genieClient, serviceUrl } from './genieService.mjs';
export { serviceUrl } from './genieService.mjs';

export function initNutritionLookup({ load, save, apply }) {
  const opener = document.getElementById('dietNutritionGenie');
  if (!opener) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'nutritionLookupDialog';
  dialog.setAttribute('aria-labelledby', 'nutritionLookupTitle');
  dialog.className = 'genie-consent-dialog nutrition-lookup';
  dialog.innerHTML = `
    <h2 id="nutritionLookupTitle">Nutrition review</h2>
    <p>Find food facts, review the base serving, then return to your food entry. Nothing logs automatically.</p>
    <form id="nutritionLookupForm">
      <label>Food name <input id="nutritionName" maxlength="200" required></label>
      <label>Food type <select id="nutritionKind"><option value="whole">Whole / raw food</option><option value="packaged">Packaged product</option></select></label>
      <label>Preparation / variant <input id="nutritionPreparation" maxlength="300" placeholder="Raw, boiled, unsweetened..."></label>
      <label>Brand (packaged) <input id="nutritionBrand" maxlength="300"></label>
      <label>Country / market (packaged) <input id="nutritionMarket" maxlength="300"></label>
      <label>Barcode (optional) <input id="nutritionBarcode" maxlength="300"></label>
      <label>Official product URL (optional) <input id="nutritionUrl" type="url"></label>
      <label>Label / ingredients (optional, no personal notes) <textarea id="nutritionLabel" maxlength="6000"></textarea></label>
      <details><summary>Nutrition service setup</summary>
        <p>Separate BigNuten service, invited-wallet access, server-held OpenAI key. Never put an OpenAI key here.</p>
        <label>Render nutrition service URL <input id="nutritionServiceUrl" type="url"></label>
        <button type="button" id="nutritionSaveService">Save service URL</button>
      </details>
      <div id="nutritionAI" data-genie-access hidden>
      <label><input type="checkbox" id="nutritionConsent"> I allow this food/product query and supplied label text to be sent to the BigNuten Genie service and OpenAI web search. No health logs, chat history or Genie memory are included. The service retains only per-wallet usage totals, not food queries.</label>
      <button type="button" id="nutritionSignIn">Sign in with invited wallet</button>
      <button type="button" id="nutritionSignOut">Sign out of all Genies</button>
      <button type="submit" id="nutritionSearch">Search nutrition facts</button>
      </div>
    </form>
    <p id="nutritionLookupStatus" role="status" aria-live="polite"></p>
    <p id="nutritionUsage"></p>
    <label>Existing defaults for this food <select id="nutritionSaved"><option value="">Choose a saved default</option></select></label>
    <button type="button" id="nutritionManual">Enter a label manually (no AI)</button>
    <section id="nutritionReview" hidden>
      <h3>Nutrition facts — base serving</h3>
      <p id="nutritionProvenance"></p><ul id="nutritionSources"></ul>
      <label>Base amount <input id="nutritionBaseAmount" type="number" min="0.000001" step="any"></label>
      <label>Base unit <select id="nutritionBaseUnit"></select></label>
      <label>Source-defined serving <input id="nutritionServing" maxlength="300" placeholder="For example, one 30 g serving"></label>
      <div id="nutritionFields" class="diet-nutr-grid"></div>
      <label>Ingredients <textarea id="nutritionIngredients" maxlength="4000"></textarea></label>
      <p>Source-backed does not mean independently verified. Check the exact product and label. Estimates are not medical or allergen-safety advice. Defaults stay in this browser and are included in deliberate health backups; JSON is plaintext.</p>
      <label><input type="checkbox" id="nutritionReviewed"> I reviewed the food identity, source, units and base serving. Saving replaces any default for this exact identity.</label>
      <button type="button" id="nutritionUse" disabled>Use for this entry only</button>
      <button type="button" id="nutritionKeep" disabled>Save as default per serving &amp; use</button>
      <button type="button" id="nutritionDelete">Delete this saved default</button>
    </section>
    <button type="button" id="nutritionCancel">Cancel / back to food entry</button>`;
  document.body.append(dialog);
  const el = id => dialog.querySelector(`#nutrition${id}`);
  let card = null, originalName = '', generation = 0, controller = null;
  let pending = false;
  function invalidate() {
    el('Reviewed').checked = false;
    el('Use').disabled = true; el('Keep').disabled = true;
  }
  function status(text) { el('LookupStatus').textContent = text; }
  function baseUrl() {
    const value = el('ServiceUrl').value.trim();
    if (!value) throw new Error('Configure the dedicated Render nutrition service URL first. Manual entry is still available.');
    return serviceUrl(value);
  }
  async function request(route, body, signal) {
    if (baseUrl() !== serviceUrl(localStorage.getItem('bignutenNutritionServiceUrl') || window.BIGNUTEN_NUTRITION_SERVICE_URL)) {
      throw new Error('Save the changed service URL before signing in or searching.');
    }
    return genieClient.request(route, body, signal);
  }
  function controls() {
    el('Search').disabled = pending; el('SignIn').disabled = pending;
    el('SignOut').disabled = !genieClient.state().authenticated;
    el('Manual').disabled = pending; el('Saved').disabled = pending;
  }
  function resetLookup() {
    generation++; controller?.abort(); controller = null; pending = false;
    controls();
    invalidate();
  }
  function currentWallet() { return String(window._connectedAccount || '').toLowerCase(); }
  function populate(value) {
    card = validateNutrition(value); invalidate();
    el('Review').hidden = false;
    el('BaseAmount').value = card.amount; el('BaseUnit').value = card.unit;
    el('Serving').value = card.serving; el('Ingredients').value = card.ingredients;
    for (const key of Object.keys(NUTRIENTS)) el(`Value-${key}`).value = card.nutr[key] ?? '';
    el('Provenance').textContent = `${card.quality} · retrieved ${card.retrievedAt} · ${card.note}`;
    el('Sources').replaceChildren();
    for (const source of card.sources) {
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = source.url; a.textContent = source.title || source.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      li.append(a); el('Sources').append(li);
    }
  }
  function identity() {
    return Object.fromEntries(['Name', 'Kind', 'Preparation', 'Brand', 'Market', 'Barcode'].map(key => [key.toLowerCase(), el(key).value.trim()]));
  }
  function reviewedCard() {
    if (!card) throw new Error('Review a nutrition card first.');
    return validateNutrition({ ...card, ...identity(), amount: Number(el('BaseAmount').value),
      unit: el('BaseUnit').value, serving: el('Serving').value, ingredients: el('Ingredients').value,
      nutr: Object.fromEntries(Object.keys(NUTRIENTS).map(key => [key, el(`Value-${key}`).value === '' ? null : Number(el(`Value-${key}`).value)])) });
  }
  function close() {
    generation++; controller?.abort(); controller = null; pending = false; card = null;
    dialog.close(); opener.focus(); controls();
  }
  for (const [key, label] of Object.entries(NUTRIENTS)) {
    const wrap = document.createElement('label'), input = document.createElement('input');
    wrap.textContent = label; input.type = 'number'; input.min = '0'; input.step = 'any'; input.id = `nutritionValue-${key}`;
    wrap.append(input); el('Fields').append(wrap);
  }
  for (const option of document.querySelectorAll('#dietFoodUnit option')) {
    if (option.value) el('BaseUnit').add(new Option(option.textContent, option.value));
  }
  opener.addEventListener('click', () => {
    originalName = document.getElementById('dietFoodName').value.trim();
    el('Name').value = originalName; el('Kind').value = 'whole';
    for (const key of ['Preparation', 'Brand', 'Market', 'Barcode', 'Url', 'Label']) el(key).value = '';
    el('Consent').checked = false; el('Review').hidden = true; card = null; invalidate();
    el('ServiceUrl').value = localStorage.getItem('bignutenNutritionServiceUrl') || window.BIGNUTEN_NUTRITION_SERVICE_URL || '';
    el('Saved').replaceChildren(new Option('Choose a saved default', ''));
    const matches = matchingDefaults(load().nutritionDefaults, originalName);
    for (const entry of matches) el('Saved').add(new Option(`${entry.kind}: ${entry.brand || entry.preparation || entry.name} ${entry.market}`, entry.id));
    status(genieClient.state().eligible ? 'Search with explicit consent and invited-wallet sign-in, or enter a label manually.' : 'Manual nutrition review is available. AI access is not enabled for this wallet.');
    controls(); dialog.showModal(); el('Name').focus();
  });
  el('SaveService').addEventListener('click', () => {
    try {
      const url = baseUrl(); resetLookup(); localStorage.setItem('bignutenNutritionServiceUrl', url);
      genieClient.clear('Service URL changed. Check assistant access again.');
      void genieClient.refresh().catch(error => { status(error.message); });
      status('Service URL saved for all Genies. Check access and sign in again.');
    }
    catch (error) { status(error.message); }
  });
  el('ServiceUrl').addEventListener('input', resetLookup);
  el('SignIn').addEventListener('click', async () => {
    if (!el('Consent').checked) { status('Review and check the food-only data notice before signing in.'); return; }
    const address = currentWallet();
    if (!address || !window.ethereum) { status('Connect your wallet with the site header first. Nutrition lookup does not connect automatically.'); return; }
    resetLookup(); const attempt = generation; pending = true; controls(); controller = new AbortController();
    try {
      if (baseUrl() !== serviceUrl(localStorage.getItem('bignutenNutritionServiceUrl') || window.BIGNUTEN_NUTRITION_SERVICE_URL)) throw new Error('Save the changed service URL first.');
      await genieClient.ensureSignedIn();
      if (attempt !== generation || address !== currentWallet()) return;
      status('Signed in to the separate nutrition service. Search sends only the current food query.');
    } catch (error) { if (attempt === generation) status(error.message); }
    finally { if (attempt === generation) { pending = false; controller = null; controls(); } }
  });
  el('SignOut').addEventListener('click', async () => {
    try { await genieClient.signOut(); status('All Genie sessions signed out for this tab.'); }
    catch (error) { status(`Local sign-out completed; server sign-out unavailable: ${error.message}`); }
    finally { resetLookup(); }
  });
  el('LookupForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!el('Consent').checked) { status('Consent is required; nothing sent.'); return; }
    if (!genieClient.state().eligible || !genieClient.state().authenticated) { resetLookup(); status('Sign in with your invited wallet first.'); return; }
    const input = { ...identity(), label: el('Label').value, url: el('Url').value };
    const attempt = ++generation; controller?.abort(); controller = new AbortController(); pending = true; controls();
    invalidate(); card = null; el('Review').hidden = true; status('Searching for source-backed nutrition...');
    try {
      const result = await request('/lookup', { input, consent: true }, controller.signal);
      if (attempt !== generation || !dialog.open) return;
      el('Usage').textContent = `Shared Genie usage: ${result.usage.calls} calls, ${result.usage.inputTokens} input / ${result.usage.outputTokens} output tokens. Failed/canceled calls count; web-search charges are separate.`;
      if (result.found) populate(result.card);
      status(result.reason || (result.found ? 'Review the sources, serving and nutrient figures below.' : 'Exact nutrition unavailable. Refine the food or enter a label manually.'));
    } catch (error) { if (attempt === generation) status(error.message); }
    finally { if (attempt === generation) { pending = false; controller = null; controls(); } }
  });
  el('LookupForm').addEventListener('input', event => {
    if (event.target.id === 'nutritionServiceUrl') return;
    const canceled = pending;
    generation++; controller?.abort(); pending = false; controls(); invalidate();
    if (card) { card = null; el('Review').hidden = true; status('Food query changed. Search or select a saved default again.'); }
    else if (canceled) status('Food query changed; pending lookup/sign-in canceled. Try again with the updated query.');
    if (event.target === el('Consent') && !el('Consent').checked) resetLookup();
  });
  el('Saved').addEventListener('change', () => {
    try {
      const saved = load().nutritionDefaults.find(entry => entry.id === el('Saved').value);
      if (!saved) return;
      for (const key of ['Name', 'Kind', 'Preparation', 'Brand', 'Market', 'Barcode']) el(key).value = saved[key.toLowerCase()];
      populate(saved);
    } catch (error) { status(error.message); }
  });
  el('Manual').addEventListener('click', () => {
    try { populate({ ...identity(), amount: 1, unit: 'g', serving: '', nutr: { calories: 0 },
      sources: [], quality: 'user-entered', note: 'Manually supplied label. Verify all values.', ingredients: '',
      retrievedAt: new Date().toISOString() });
      el('Value-calories').value = ''; status('Enter the label figures and serving basis; blanks mean unknown.');
    } catch (error) { status(error.message); }
  });
  el('Review').addEventListener('input', event => {
    if (event.target === el('Reviewed')) {
      el('Use').disabled = !event.target.checked; el('Keep').disabled = !event.target.checked; return;
    }
    invalidate();
    if (card) { card.quality = 'user-entered'; el('Provenance').textContent = `User-edited card · ${card.retrievedAt}. Check source values again.`; }
  });
  function accept(keep) {
    try {
      if (!el('Reviewed').checked) throw new Error('Review the card before using it.');
      if (document.getElementById('dietFoodName').value.trim() !== originalName ||
          el('Name').value.trim().toLowerCase() !== originalName.toLowerCase()) throw new Error('The food identity changed. Return to the food form, update its name and reopen Genie.');
      const value = reviewedCard();
      scaleNutrition(value, document.getElementById('dietFoodAmount').value, document.getElementById('dietFoodUnit').value);
      if (keep) { const data = load(); data.nutritionDefaults = saveNutritionDefault(data.nutritionDefaults, value); save(data); }
      apply(value); close();
    } catch (error) { status(error.message); }
  }
  el('Use').addEventListener('click', () => accept(false));
  el('Keep').addEventListener('click', () => accept(true));
  el('Delete').addEventListener('click', () => {
    try {
      if (!card || !el('Reviewed').checked) throw new Error('Review and confirm the exact default before deleting it.');
      const data = load(); data.nutritionDefaults = data.nutritionDefaults.filter(entry => entry.id !== card.id); save(data);
      status('Default deleted; old logged meals are unchanged.'); invalidate();
    } catch (error) { status(error.message); }
  });
  el('Cancel').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  function updateAccess() {
    const eligible = genieClient.state().eligible;
    opener.textContent = eligible ? '🧞 Genie' : 'Nutrition label';
    opener.setAttribute('aria-label', eligible ? 'Ask Genie for nutrition facts' : 'Review a nutrition label');
    el('AI').hidden = !eligible; controls();
    if (!eligible && pending) { resetLookup(); status('Assistant access changed. Pending lookup canceled; manual nutrition entry remains available.'); }
  }
  window.addEventListener('bignuten:genie-access-changed', updateAccess);
  window.addEventListener('bignuten:wallet-changed', () => { resetLookup(); if (dialog.open) { card = null; el('Review').hidden = true; status('Wallet changed. Pending lookup and sign-in cleared.'); } });
  updateAccess();
}
