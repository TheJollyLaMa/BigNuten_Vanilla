import { NUTRIENTS, validateNutrition, saveNutritionDefault, matchingDefaults, portionBaseAmount, nutritionUnitRatio } from './nutritionDefaults.mjs';
import { genieClient, serviceUrl } from './genieService.mjs';
export { serviceUrl } from './genieService.mjs';

export function initNutritionLookup({ load, save, apply, clear = () => {} }) {
  const opener = document.getElementById('dietNutritionGenie');
  if (!opener) return;
  const panel = document.createElement('div');
  panel.id = 'nutritionLookupInline';
  panel.innerHTML = `
    <p>Enter a food, amount and unit: a blank card fills itself from the community food library, or from Genie for invited wallets (one provider call per new food). Genie picks the most likely match and labels estimates. Only food facts are shared with the community library, never your meals or health history. Your typed figures are never overwritten. Check before logging.</p>
    <button type="button" id="nutritionCommunity">Use community food facts (no AI)</button>
    <div id="nutritionPortion" hidden>
      <p id="nutritionPortionSummary"></p>
      <button type="button" id="nutritionAdjustPortion">Define / adjust this portion</button>
      <div id="nutritionPortionEditor" hidden>
        <p>Override this portion with your label or kitchen scale. This override stays on this device and is not shared.</p>
        <label id="nutritionPortionLabel" for="nutritionPortionAmount"></label>
        <input id="nutritionPortionAmount" type="number" min="0.000001" max="1000000" step="any">
        <button type="button" id="nutritionApplyPortion">Use this portion size</button>
      </div>
    </div>
    <details><summary>Food details / saved defaults</summary>
      <label>Food type <select id="nutritionKind"><option value="whole">Generic food</option><option value="packaged">Exact packaged product</option></select></label>
      <label>Preparation / variant <input id="nutritionPreparation" maxlength="300" placeholder="Cooked, dry, plain, nonfat..."></label>
      <label>Brand (packaged) <input id="nutritionBrand" maxlength="300"></label>
      <label>Country / market (packaged) <input id="nutritionMarket" maxlength="300"></label>
      <label>Barcode (optional) <input id="nutritionBarcode" maxlength="300"></label>
      <label>Source-defined serving (manual labels) <input id="nutritionServing" maxlength="300"></label>
      <label>Saved defaults <select id="nutritionSaved"><option value="">Choose a saved default</option></select></label>
      <button type="button" id="nutritionKeep">Save these figures as my default</button>
      <button type="button" id="nutritionDelete">Delete selected default</button>
      <details><summary>Nutrition service setup</summary>
        <label>Render Genie service URL <input id="nutritionServiceUrl" type="url"></label>
        <button type="button" id="nutritionSaveService">Save service URL</button>
      </details>
    </details>
    <p id="nutritionLookupStatus" role="status" aria-live="polite"></p>
    <p id="nutritionProvenance"></p><ul id="nutritionSources"></ul>
    <p id="nutritionUsage"></p>`;
  document.getElementById('dietNutrCard').append(panel);
  const el = id => panel.querySelector(`#nutrition${id}`);
  const foodName = document.getElementById('dietFoodName');
  const amount = document.getElementById('dietFoodAmount');
  const unit = document.getElementById('dietFoodUnit');
  let card = null, edited = false, generation = 0, controller = null;
  let userTyped = false, autoTimer = null;
  const attempted = new Set();
  const nutrientInputs = () => Object.keys(NUTRIENTS).map(key => document.getElementById(`dietNutr${key[0].toUpperCase()}${key.slice(1)}`));
  const status = text => { el('LookupStatus').textContent = text; };
  function identity() {
    return { name: foodName.value.trim(), ...Object.fromEntries(
      ['Kind', 'Preparation', 'Brand', 'Market', 'Barcode'].map(key => [key.toLowerCase(), el(key).value.trim()])) };
  }
  function showUsage(usage) {
    if (usage && ['calls', 'inputTokens', 'outputTokens'].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)) {
      el('Usage').textContent = `${usage.calls} shared provider calls; ${usage.inputTokens} input / ${usage.outputTokens} output tokens reported. Failed/canceled calls count; unavailable token usage and separate search charges are not included.`;
    }
  }
  function cancel() {
    generation++; controller?.abort(); controller = null;
    opener.disabled = false; el('Community').disabled = false;
  }
  function reset() {
    const pending = Boolean(controller);
    cancel(); card = null; edited = false;
    el('Portion').hidden = true; el('PortionEditor').hidden = true;
    unit.querySelector('option[value="serving"]').textContent = 'serving';
    el('Sources').replaceChildren(); el('Provenance').textContent = '';
    if (pending) status('Food/access changed. Pending lookup canceled; no new facts applied.');
  }
  function defaults() {
    el('Saved').replaceChildren(new Option('Choose a saved default', ''));
    for (const entry of matchingDefaults(load().nutritionDefaults, foodName.value)) {
      el('Saved').add(new Option(`${entry.brand || entry.name}: ${entry.preparation || entry.serving} ${entry.market}`, entry.id));
    }
  }
  function showPortion() {
    el('Portion').hidden = !card;
    if (!card) return true;
    const base = portionBaseAmount(card, unit.value);
    const servingBase = portionBaseAmount(card, 'serving');
    unit.querySelector('option[value="serving"]').textContent = `serving (${Number(servingBase.toFixed(4))} ${card.unit})`;
    el('PortionSummary').textContent = base === null
      ? `Define one ${unit.value} of this ${card.name} in ${card.unit} to fill nutrition.`
      : `1 ${unit.value} = ${Number(base.toFixed(4))} ${card.unit}. Amount changes scale all available nutrients from the original base. Cups/spoons use US nutrition-label volumes.`;
    el('AdjustPortion').hidden = !unit.value || ['g', 'oz'].includes(unit.value) && ['g', 'oz'].includes(card.unit) || unit.value === card.unit;
    el('PortionEditor').hidden = base !== null;
    el('PortionAmount').value = base === null ? '' : String(base);
    el('PortionLabel').textContent = `One ${unit.value || 'portion'} equals how many ${card.unit}?`;
    return base !== null;
  }
  function populate(value, saved = false) {
    const next = validateNutrition(value);
    apply({ ...next, approved: saved });
    card = next; edited = false;
    el('Serving').value = next.serving;
    el('Provenance').textContent = `${next.quality} · ${next.amount} ${next.unit} ${next.serving} · ${next.note} · ${next.retrievedAt}`;
    el('Sources').replaceChildren();
    for (const source of next.sources) {
      const link = document.createElement('a'), li = document.createElement('li');
      link.href = source.url; link.textContent = source.title || source.url;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; li.append(link); el('Sources').append(li);
    }
    return showPortion();
  }
  async function shared(input, signal) {
    const response = await fetch(`${serviceUrl(localStorage.getItem('bignutenNutritionServiceUrl') || window.BIGNUTEN_NUTRITION_SERVICE_URL)}/foods`, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Community food library failed (HTTP ${response.status}).`);
    return result;
  }
  async function lookup(ai, autoKey = '') {
    cancel(); const attempt = generation; controller = new AbortController();
    const signal = controller.signal;
    opener.disabled = true; el('Community').disabled = true;
    const current = () => { if (attempt !== generation || signal.aborted) throw new Error('Pending nutrition lookup canceled.'); };
    try {
      if (!foodName.value.trim()) throw new Error('Enter a food name first.');
      if (!Number.isFinite(Number(amount.value)) || Number(amount.value) <= 0 || !unit.value) throw new Error('Enter your amount and unit before fetching nutrition.');
      const input = identity();
      status('Checking community food facts...');
      let result = await shared(input, signal); current();
      const missingPortion = result.found && portionBaseAmount(validateNutrition(result.card), unit.value) === null;
      if ((!result.found || missingPortion) && ai) {
        if (missingPortion) populate(result.card);
        status(missingPortion ? `Genie is estimating one ${unit.value} of ${input.name}...` : `Genie is filling ${input.name}...`);
        const requestPortion = !['g', 'oz', 'ml'].includes(unit.value);
        result = await genieClient.request('/lookup', { input, consent: true, ...(requestPortion ? { portionUnit: unit.value } : {}) }, signal, current);
        current(); showUsage(result.usage);
      }
      if (!result.found) {
        status(result.reason || (ai ? 'Genie could not fill this food. Enter the figures manually.'
          : 'No community facts for this food yet. Use Genie (invited wallets) or enter the figures manually.'));
        return;
      }
      if (!populate(result.card)) {
        status('Food facts found. Define the portion size below once; then amounts scale without another lookup.');
        return;
      }
      const kind = result.card.quality === 'estimate' ? 'Genie estimate' : result.card.quality;
      status(result.cached
        ? `Filled from the community food library (${kind}). No AI call. Check before logging; nothing logged.`
        : `Filled by Genie (${kind})${result.reason ? `: ${result.reason}` : '.'} Shared as food facts only; nothing logged.`);
    } catch (error) {
      if (attempt === generation) { showUsage(error.usage); status(error.message); }
      else if (autoKey) attempted.delete(autoKey);
    } finally {
      if (attempt === generation) { controller = null; opener.disabled = false; el('Community').disabled = false; }
    }
  }
  function scheduleAuto() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (controller || !foodName.value.trim() || !(Number(amount.value) > 0) || !unit.value) return;
      if (card ? edited || portionBaseAmount(card, unit.value) !== null
        : nutrientInputs().some(input => input.value !== '')) return;
      const ai = genieClient.state().eligible;
      const key = JSON.stringify([identity(), unit.value, ai]);
      if (attempted.has(key)) return;
      attempted.add(key);
      void lookup(ai, key);
    }, 900);
  }
  opener.addEventListener('click', () => { void lookup(true); });
  el('Community').addEventListener('click', () => { void lookup(false); });
  for (const input of [foodName, ...['Kind', 'Preparation', 'Brand', 'Market', 'Barcode'].map(el)]) {
    input.addEventListener('input', () => {
      reset();
      if (input === foodName) {
        for (const key of ['Preparation', 'Brand', 'Market', 'Barcode', 'Serving']) el(key).value = '';
        el('Kind').value = 'whole'; defaults();
        if (!userTyped) clear();
        const saved = matchingDefaults(load().nutritionDefaults, foodName.value);
        if (saved.length === 1) populate(saved[0], true);
      }
      scheduleAuto();
    });
  }
  unit.addEventListener('input', () => {
    if (controller) { cancel(); status('Unit changed. Pending lookup canceled.'); }
  });
  amount.addEventListener('input', scheduleAuto);
  unit.addEventListener('change', () => {
    if (card && !showPortion()) status(genieClient.state().eligible ? `Genie will estimate one ${unit.value} of this food...`
      : 'Define this portion below to calculate nutrition.');
    scheduleAuto();
  });
  el('AdjustPortion').addEventListener('click', () => {
    el('PortionEditor').hidden = false; el('PortionAmount').focus();
  });
  el('ApplyPortion').addEventListener('click', () => {
    try {
      if (!card) throw new Error('Fetch food facts or select a default first.');
      if (controller) throw new Error('Wait for the lookup to finish before changing the portion.');
      if (edited) throw new Error('Save your edited figures as a default before changing the portion definition.');
      const baseAmount = Number(el('PortionAmount').value);
      const next = validateNutrition({ ...card, quality: 'user-entered',
        note: 'Local portion override. Original sources do not verify your portion definition.',
        measures: [...card.measures.filter(measure => nutritionUnitRatio(measure.unit, unit.value) === null), {
          amount: 1, unit: unit.value, baseAmount, sourceUrl: '',
        }] });
      populate(next);
      status('Portion defined locally. Change the amount to scale nutrition. Save as your default to keep this definition; nothing logged or shared.');
    } catch (error) { status(error.message); }
  });
  for (const key of Object.keys(NUTRIENTS)) {
    document.getElementById(`dietNutr${key[0].toUpperCase()}${key.slice(1)}`).addEventListener('input', () => {
      edited = true; userTyped = true;
      if (card) el('Provenance').textContent = 'User-edited nutrition. Original source links below are references, not verification of your edits. Personal edits stay local.';
      if (controller) { cancel(); status('You edited the card. Pending lookup canceled; your figures were preserved.'); }
    });
  }
  el('Saved').addEventListener('change', () => {
    try {
      const entry = load().nutritionDefaults.find(value => value.id === el('Saved').value);
      if (!entry) return;
      cancel();
      for (const key of ['Kind', 'Preparation', 'Brand', 'Market', 'Barcode']) el(key).value = entry[key.toLowerCase()];
      status(populate(entry, true) ? 'Filled from your local default. Nothing logged.'
        : 'Local default found. Define this portion below to calculate nutrition.');
    } catch (error) { status(error.message); }
  });
  el('Keep').addEventListener('click', () => {
    try {
      if (controller) throw new Error('Wait for the lookup or cancel it before saving a default.');
      const value = card && !edited ? card : validateNutrition({ ...identity(), amount: Number(amount.value), unit: unit.value,
        serving: el('Serving').value, ingredients: card?.ingredients || '', note: 'User-entered or edited nutrition. Verify serving and values.',
        quality: 'user-entered', retrievedAt: new Date().toISOString(), sources: card?.sources || [],
        nutr: Object.fromEntries(Object.keys(NUTRIENTS).map(key => {
          const value = document.getElementById(`dietNutr${key[0].toUpperCase()}${key.slice(1)}`).value;
          return [key, value === '' ? null : Number(value)];
        })) });
      const data = load(); data.nutritionDefaults = saveNutritionDefault(data.nutritionDefaults, value); save(data);
      populate(value, true); defaults(); status('Default saved in this browser. Personal edits are not shared; nothing logged.');
    } catch (error) { status(error.message); }
  });
  el('Delete').addEventListener('click', () => {
    try {
      if (!el('Saved').value) throw new Error('Select the exact local default to delete.');
      const data = load(); data.nutritionDefaults = data.nutritionDefaults.filter(value => value.id !== el('Saved').value); save(data);
      defaults(); status('Local default deleted. Logged meals and community facts are unchanged.');
    } catch (error) { status(error.message); }
  });
  el('ServiceUrl').value = localStorage.getItem('bignutenNutritionServiceUrl') || window.BIGNUTEN_NUTRITION_SERVICE_URL || '';
  el('ServiceUrl').defaultValue = el('ServiceUrl').value;
  document.getElementById('dietBtn')?.addEventListener('click', () => {
    el('ServiceUrl').value = localStorage.getItem('bignutenNutritionServiceUrl') || window.BIGNUTEN_NUTRITION_SERVICE_URL || '';
    defaults();
  });
  el('SaveService').addEventListener('click', () => {
    try {
      const url = serviceUrl(el('ServiceUrl').value); reset();
      el('ServiceUrl').defaultValue = url;
      localStorage.setItem('bignutenNutritionServiceUrl', url); genieClient.clear('Service URL changed.');
      void genieClient.refresh().catch(error => status(error.message));
      status('Genie service URL saved.');
    } catch (error) { status(error.message); }
  });
  for (const event of ['bignuten:wallet-changed', 'bignuten:genie-access-changed']) window.addEventListener(event, () => {
    const eligible = genieClient.state().eligible;
    opener.hidden = !eligible; opener.textContent = 'Genie'; opener.setAttribute('aria-label', 'Fill nutrition facts with Genie');
    if (!eligible) reset(); else scheduleAuto();
  });
  document.getElementById('closeDietModal')?.addEventListener('click', reset);
  const diet = document.getElementById('dietModal');
  new MutationObserver(() => {
    if (diet.style.display === 'none' && controller) reset();
  }).observe(diet, { attributes: true, attributeFilter: ['style'] });
  document.getElementById('dietForm').addEventListener('reset', () => {
    reset(); userTyped = false; clearTimeout(autoTimer);
    queueMicrotask(defaults);
  });
  opener.hidden = !genieClient.state().eligible; opener.textContent = 'Genie';
  defaults();
}
