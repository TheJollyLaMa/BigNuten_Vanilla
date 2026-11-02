import { NUTRIENTS, validateNutrition, saveNutritionDefault, matchingDefaults, scaleNutrition } from './nutritionDefaults.mjs';
import { genieClient, serviceUrl } from './genieService.mjs';
export { serviceUrl } from './genieService.mjs';

export function initNutritionLookup({ load, save, apply }) {
  const opener = document.getElementById('dietNutritionGenie');
  if (!opener) return;
  const panel = document.createElement('div');
  panel.id = 'nutritionLookupInline';
  panel.innerHTML = `
    <p>Genie fills this card directly. It shares only food facts and source links with the community library, never your meals or health history. Clicking Genie sends the food query to our service and, on a library miss, OpenAI. Up to two provider calls; saved community facts use none. Check the serving and sources before logging.</p>
    <button type="button" id="nutritionCommunity">Use community food facts (no AI)</button>
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
  let clarification = null, clarificationResolve = null;
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
    clarificationResolve?.(null); clarificationResolve = null;
    clarification?.remove(); clarification = null;
    opener.disabled = false; el('Community').disabled = false;
  }
  function reset() {
    const pending = Boolean(controller || clarification);
    cancel(); card = null; edited = false;
    el('Sources').replaceChildren(); el('Provenance').textContent = '';
    if (pending) status('Food/access changed. Pending lookup canceled; no new facts applied.');
  }
  function defaults() {
    el('Saved').replaceChildren(new Option('Choose a saved default', ''));
    for (const entry of matchingDefaults(load().nutritionDefaults, foodName.value)) {
      el('Saved').add(new Option(`${entry.brand || entry.name}: ${entry.preparation || entry.serving} ${entry.market}`, entry.id));
    }
  }
  function populate(value, saved = false) {
    const next = validateNutrition(value);
    scaleNutrition(next, amount.value, unit.value);
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
  }
  async function ask(question) {
    clarification = document.createElement('dialog');
    clarification.id = 'nutritionClarification';
    clarification.setAttribute('aria-label', question.question);
    const title = document.createElement('h2');
    title.textContent = question.question; clarification.append(title);
    const choice = new Promise(resolve => { clarificationResolve = resolve; });
    for (const option of question.options) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = option;
      button.addEventListener('click', () => clarificationResolve?.(option));
      clarification.append(button);
    }
    const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Cancel';
    back.addEventListener('click', () => clarificationResolve?.(null)); clarification.append(back);
    clarification.addEventListener('cancel', event => { event.preventDefault(); clarificationResolve?.(null); });
    document.body.append(clarification); clarification.showModal();
    const answer = await choice;
    clarification?.remove(); clarification = null; clarificationResolve = null;
    return answer;
  }
  async function shared(input, signal) {
    const response = await fetch(`${serviceUrl(localStorage.getItem('bignutenNutritionServiceUrl') || window.BIGNUTEN_NUTRITION_SERVICE_URL)}/foods`, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Community food library failed (HTTP ${response.status}).`);
    return result;
  }
  async function lookup(ai) {
    cancel(); const attempt = generation; controller = new AbortController();
    const signal = controller.signal;
    opener.disabled = true; el('Community').disabled = true;
    const current = () => { if (attempt !== generation || signal.aborted) throw new Error('Pending nutrition lookup canceled.'); };
    try {
      if (!foodName.value.trim()) throw new Error('Enter a food name first.');
      if (!Number.isFinite(Number(amount.value)) || Number(amount.value) <= 0 || !unit.value) throw new Error('Enter your amount and unit before fetching nutrition.');
      let input = identity();
      status('Checking community food facts...');
      let result = await shared(input, signal); current();
      if (!result.found && result.clarification) {
        const answer = await ask(result.clarification); current();
        if (!answer) { status('Lookup canceled. Your nutrition fields are unchanged.'); return; }
        el('Preparation').value = answer; input = identity();
        result = await shared(input, signal); current();
      }
      if (!result.found && ai) {
        status('Fetching food facts...');
        result = await genieClient.request('/lookup', { input, consent: true }, signal, current);
        current(); showUsage(result.usage);
        if (result.clarification) {
          const answer = await ask(result.clarification); current();
          if (!answer) { status('Lookup canceled. Your nutrition fields are unchanged.'); return; }
          el('Preparation').value = answer; input = identity();
          status('Checking facts for that preparation...');
          result = await shared(input, signal); current();
          if (!result.found) result = await genieClient.request('/lookup', { input, consent: true }, signal, current);
          current(); showUsage(result.usage);
        }
      }
      if (!result.found) { status(result.reason || 'No shared facts for this exact food/preparation yet. Use Genie or enter the figures manually.'); return; }
      populate(result.card);
      status(result.cached ? 'Filled from the community food library. No provider call. Check serving and sources; nothing logged.'
        : result.card.quality === 'source-backed' ? 'Nutrition filled. Source-backed food facts are reusable by the community. Check serving and sources; nothing logged.'
          : 'Nutrition filled as an estimate, not added to the shared library. Check serving and sources; nothing logged.');
    } catch (error) {
      if (attempt === generation) { showUsage(error.usage); status(error.message); }
    } finally {
      if (attempt === generation) { controller = null; opener.disabled = false; el('Community').disabled = false; }
    }
  }
  opener.addEventListener('click', () => { void lookup(true); });
  el('Community').addEventListener('click', () => { void lookup(false); });
  for (const input of [foodName, ...['Kind', 'Preparation', 'Brand', 'Market', 'Barcode'].map(el)]) {
    input.addEventListener('input', () => {
      reset();
      if (input === foodName) {
        for (const key of ['Preparation', 'Brand', 'Market', 'Barcode', 'Serving']) el(key).value = '';
        el('Kind').value = 'whole'; defaults();
      }
    });
  }
  for (const input of [amount, unit]) input.addEventListener('input', () => {
    if (controller) { cancel(); status('Amount/unit changed. Pending lookup canceled; fetch again for the new entry.'); }
  });
  for (const key of Object.keys(NUTRIENTS)) {
    document.getElementById(`dietNutr${key[0].toUpperCase()}${key.slice(1)}`).addEventListener('input', () => {
      edited = true;
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
      populate(entry, true); status('Filled from your local default. Nothing logged.');
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
    if (!eligible) reset();
  });
  document.getElementById('closeDietModal')?.addEventListener('click', reset);
  const diet = document.getElementById('dietModal');
  new MutationObserver(() => {
    if (diet.style.display === 'none' && (controller || clarification)) reset();
  }).observe(diet, { attributes: true, attributeFilter: ['style'] });
  document.getElementById('dietForm').addEventListener('reset', () => {
    reset();
    queueMicrotask(defaults);
  });
  opener.hidden = !genieClient.state().eligible; opener.textContent = 'Genie';
  defaults();
}
