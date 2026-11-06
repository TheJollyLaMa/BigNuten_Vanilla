import { NUTRIENTS, nutrientInputId, validateNutrition, saveNutritionDefault, matchingDefaults, portionBaseAmount,
  needsNutritionEnrichment, enrichNutritionCard, NUTRITION_COVERAGE_VERSION } from './nutritionDefaults.mjs';
import { genieClient, serviceUrl } from './genieService.mjs';
export { serviceUrl } from './genieService.mjs';

export function initNutritionLookup({ load, save, apply, clear = () => {}, cached = () => null, saveCache = () => {} }) {
  const opener = document.getElementById('dietNutritionGenie');
  if (!opener) return;
  const panel = document.createElement('div');
  panel.id = 'nutritionLookupInline';
  panel.innerHTML = `
    <details><summary>Product label (optional)</summary>
      <label>Label facts <textarea id="nutritionLabel" class="diet-input" maxlength="6000" placeholder="e.g. Wegmans smoked oysters: 1 serving (65 g), 160 calories, 10 g protein"></textarea></label>
      <label>Product URL <input id="nutritionUrl" class="diet-input" type="url" placeholder="https://…"></label>
    </details>
    <p id="nutritionLookupStatus" role="status" aria-live="polite"></p>
    <p id="nutritionProvenance"></p><ul id="nutritionSources"></ul>`;
  document.getElementById('dietNutrCard').append(panel);
  const el = id => panel.querySelector(`#nutrition${id}`);
  const form = document.getElementById('dietForm');
  const foodName = document.getElementById('dietFoodName');
  const amount = document.getElementById('dietFoodAmount');
  const unit = document.getElementById('dietFoodUnit');
  const status = text => { el('LookupStatus').textContent = text; };
  let card = null, edited = false, userTyped = false, generation = 0, controller = null, autoTimer;
  const attempted = new Set();
  const inputs = () => Object.keys(NUTRIENTS).map(key => document.getElementById(nutrientInputId(key)));
  function identity() {
    return { name: foodName.value.trim(), kind: card?.kind || 'whole', preparation: card?.preparation || '',
      brand: card?.brand || '', market: card?.market || '', barcode: card?.barcode || '' };
  }
  function cancel() {
    generation++; controller?.abort(); controller = null;
    form.dataset.lookupPending = 'false'; opener.disabled = false;
  }
  function reset() {
    cancel(); clearTimeout(autoTimer); card = null; edited = false;
    form.dataset.portionMissing = 'false';
    unit.querySelector('option[value="serving"]').textContent = 'serving';
    el('Sources').replaceChildren(); el('Provenance').textContent = ''; status('');
  }
  function showPortion() {
    document.querySelector('label[for="dietFoodAmount"]').textContent = unit.value === 'serving' ? 'Number of servings' : 'Amount';
    if (!card) return true;
    const base = portionBaseAmount(card, unit.value);
    const servingBase = portionBaseAmount(card, 'serving');
    unit.querySelector('option[value="serving"]').textContent = `serving (${Number(servingBase.toFixed(4))} ${card.unit})`;
    form.dataset.portionMissing = String(base === null);
    if (base === null) status('No reliable conversion for this portion. Choose grams or ask Genie.');
    else if (unit.value === 'serving' && Number(amount.value) > 10) {
      status(`${amount.value} servings means ${Number((Number(amount.value) * base).toPrecision(8))} ${card.unit}, not ${amount.value} g. For one serving, enter 1.`);
    } else if (el('LookupStatus').textContent.includes('servings means')) status('');
    return base !== null;
  }
  function populate(value, saved = false) {
    const next = validateNutrition(value);
    apply({ ...next, approved: saved }); card = next; edited = false;
    el('Provenance').textContent = `${next.quality} · ${next.note}`;
    el('Sources').replaceChildren();
    for (const source of next.sources) {
      const link = document.createElement('a'), li = document.createElement('li');
      link.href = source.url; link.textContent = source.title || source.url;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; li.append(link); el('Sources').append(li);
    }
    return showPortion();
  }
  async function lookup(ai, refresh = false, autoKey = '') {
    cancel(); const attempt = generation; controller = new AbortController();
    const signal = controller.signal;
    opener.disabled = true; form.dataset.lookupPending = 'true';
    const current = () => { if (attempt !== generation || signal.aborted) throw new Error('Pending nutrition lookup canceled.'); };
    try {
      if (!foodName.value.trim() || !(Number(amount.value) > 0) || !unit.value) throw new Error('Enter a food, positive amount and unit first.');
      const input = { ...identity(), ...(el('Label').value.trim() ? { label: el('Label').value.trim() } : {}),
        ...(el('Url').value.trim() ? { url: el('Url').value.trim() } : {}) };
      const original = !refresh && card && !edited ? card : null;
      status(refresh ? 'Genie is rechecking this food…' : 'Checking food facts…');
      let result;
      if (!refresh) {
        const response = await fetch(`${serviceUrl(localStorage.getItem('bignutenNutritionServiceUrl') || window.BIGNUTEN_NUTRITION_SERVICE_URL)}/foods`, {
          method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }),
        });
        result = await response.json(); current();
        if (!response.ok) throw new Error(result.error || `Food lookup failed (HTTP ${response.status}).`);
      }
      const missingPortion = result?.found && portionBaseAmount(validateNutrition(result.card), unit.value) === null;
      if (ai && (refresh || !result?.found || missingPortion || result.enrichmentNeeded)) {
        const requestPortion = !['g', 'oz', 'ml'].includes(unit.value);
        result = await genieClient.request('/lookup', { input, consent: true, ...(refresh ? { refresh: true } : {}),
          ...(requestPortion ? { portionUnit: unit.value } : {}) }, signal, current);
        current();
      }
      if (!result?.found) {
        status(result?.reason || 'No food facts available. Enter label values manually or use Genie.');
        return;
      }
      if (original) {
        const incoming = result.enrichmentUnavailable ? { ...result.card, nutritionCoverageVersion: NUTRITION_COVERAGE_VERSION } : result.card;
        result.card = enrichNutritionCard(original, incoming);
      }
      if (!populate(result.card)) return;
      if (original || refresh) {
        const data = load();
        if (data.nutritionDefaults?.some(entry => entry.id === result.card.id)) {
          data.nutritionDefaults = saveNutritionDefault(data.nutritionDefaults, result.card); save(data);
        } else saveCache(result.card);
      }
      status(result.enrichmentUnavailable ? 'Previous micronutrient check failed; existing facts retained. Press Genie to retry explicitly.'
        : result.cached ? 'Saved food facts. Review before logging.' : 'Genie filled the card. Review before logging.');
      showPortion();
    } catch (error) {
      if (attempt === generation) status(`${error.message} Existing figures were not changed.`);
      else if (autoKey) attempted.delete(autoKey);
    } finally {
      if (attempt === generation) { controller = null; form.dataset.lookupPending = 'false'; opener.disabled = false; }
    }
  }
  function scheduleAuto() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (controller || userTyped || !foodName.value.trim() || !(Number(amount.value) > 0) || !unit.value) return;
      if (card ? edited || portionBaseAmount(card, unit.value) !== null && !needsNutritionEnrichment(card)
        : inputs().some(input => input.value !== '')) return;
      const ai = genieClient.state().eligible;
      const key = JSON.stringify([identity(), unit.value, ai]);
      if (attempted.has(key)) return;
      attempted.add(key); void lookup(ai, false, key);
    }, 900);
  }
  opener.addEventListener('click', () => { void lookup(true, true); });
  foodName.addEventListener('input', () => {
    reset(); el('Label').value = ''; el('Url').value = '';
    const saved = matchingDefaults(load().nutritionDefaults, foodName.value);
    const previous = cached(foodName.value);
    if (saved.length === 1) populate(saved[0], true);
    else if (!userTyped && previous && !previous.ambiguous) {
      try {
        populate(validateNutrition({ name: foodName.value.trim(), kind: 'whole', quality: 'user-entered',
          retrievedAt: new Date().toISOString(), sources: [], note: 'Previously saved local figures; verify original serving.', ...previous }));
      } catch (error) { userTyped = true; status(`Saved food needs review: ${error.message}`); }
    } else if (!userTyped) clear();
    scheduleAuto();
  });
  amount.addEventListener('input', () => { showPortion(); scheduleAuto(); });
  unit.addEventListener('input', () => { if (controller) { cancel(); status('Unit changed. Lookup canceled.'); } });
  unit.addEventListener('change', () => { showPortion(); scheduleAuto(); });
  for (const input of inputs()) input.addEventListener('input', () => {
    edited = true; userTyped = true; form.dataset.portionMissing = 'false';
    if (controller) cancel();
    el('Provenance').textContent = 'User-entered values.';
    status('');
  });
  for (const input of [el('Label'), el('Url')]) input.addEventListener('input', () => {
    if (controller) cancel();
    userTyped = true; status('Press Genie to use these product details.');
  });
  form.addEventListener('nutrition:edit', () => { reset(); userTyped = true; });
  form.addEventListener('reset', () => {
    reset(); userTyped = false; el('Label').value = ''; el('Url').value = '';
  });
  for (const event of ['bignuten:wallet-changed', 'bignuten:genie-access-changed']) window.addEventListener(event, () => {
    const eligible = genieClient.state().eligible;
    opener.hidden = !eligible; if (!eligible) cancel(); else scheduleAuto();
  });
  document.getElementById('closeDietModal')?.addEventListener('click', cancel);
  const diet = document.getElementById('dietModal');
  new MutationObserver(() => { if (diet.style.display === 'none' && controller) cancel(); })
    .observe(diet, { attributes: true, attributeFilter: ['style'] });
  opener.hidden = !genieClient.state().eligible;
}
