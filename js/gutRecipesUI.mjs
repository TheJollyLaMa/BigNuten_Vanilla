import { NUTRIENTS, NUTRIENT_DEFINITIONS, recordedNutrientValues, parseRecordedNutrient, scaleNutrition } from './nutritionDefaults.mjs';
import { validateMealRecipe, recipeCard, smoothieStarter, suppliedSmoothieEstimates } from './mealRecipes.mjs';
import { validateObservedFast, observationTimeline } from './gutObservations.mjs';
import { getTodayInUserTz, formatInUserTz } from './timezone.js';

const node = (tag, text = '') => { const element = document.createElement(tag); element.textContent = text; return element; };
const id = () => crypto.randomUUID();
const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const clockInput = value => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const iso = value => value ? new Date(value).toISOString() : '';

export function initGutRecipes({ load, save, hideModal }) {
  const modal = document.getElementById('gut-health-modal');
  if (!modal) return;
  const section = node('section');
  section.id = 'gut-recipes';
  section.innerHTML = `
    <h3>Smoothies, recipes &amp; observation periods</h3>
    <p>Save a personal recipe, then review its card in Food intake before logging. These records are part of your health profile; they are not published to the community food library.</p>
    <p>Fasting and yogurt are not established SIBO treatment. Prolonged fasting/refeeding can be risky; seek clinical advice before trying it. Inulin/probiotics may worsen symptoms in some people. Seek care for persistent or worsening symptoms. No fasting targets or treatment score are provided.</p>
    <button id="gut-smoothie-starter" type="button">Start Gut Vitality Yogurt Smoothie recipe</button>
    <button id="gut-recipe-new" type="button">New blank recipe</button>
    <ul id="gut-recipe-list"></ul>
    <details id="gut-recipe-editor">
      <summary>Recipe ingredients &amp; nutrition</summary>
      <form id="gut-recipe-form">
        <label>Recipe name <input name="recipeName" maxlength="200" required></label>
        <label>Batch yield (servings) <input name="yield" type="number" step="any" min="0.000001" max="1000000" required></label>
        <label>Culture / product (optional, user reported) <textarea name="culture" maxlength="1000"></textarea></label>
        <label>Batch identifier (optional) <input name="batch" maxlength="200"></label>
        <label>Recipe / source notes <textarea name="note" rows="4" maxlength="4000"></textarea></label>
        <p>Ingredient nutrition applies to the exact quantity entered in its row, not per 100 g. Unknown quantity/nutrients may remain blank. No guessed density, cooking losses, CFU or vitamin fortification.</p>
        <label>Copy a food already logged <select id="gut-recipe-food"></select></label>
        <button id="gut-recipe-copy-food" type="button">Add selected food as ingredient</button>
        <button id="gut-recipe-add" type="button">Add ingredient</button>
        <div id="gut-recipe-ingredients"></div>
        <label>Nutrition basis <select name="mode"><option value="ingredients">Sum ingredient facts (partial where unknown)</option><option value="estimate">My approximate card for the whole batch</option></select></label>
        <details><summary>Approximate batch card (used only with approximate basis)</summary>
          <p>Enter your own chosen values in the stated units; supplied ranges and %DV are notes, not automatic amounts. This is not verified nutrition.</p>
          <button id="gut-smoothie-estimates" type="button">Copy supplied smoothie point estimates (not verified)</button>
          <div id="gut-recipe-estimates" class="gut-nutrient-grid"></div>
        </details>
        <button type="submit">Save recipe (not eaten yet)</button>
        <button id="gut-recipe-cancel" type="button">Cancel recipe editing</button>
      </form>
    </details>
    <hr>
    <form id="gut-observation-form">
      <h4>Observation period (not a treatment plan)</h4>
      <label>Period name <input name="periodName" maxlength="200" required></label>
      <label>Recipe <select name="recipeId"></select></label>
      <label>Start day <input name="start" type="date" required></label>
      <label>End day <input name="end" type="date" required></label>
      <button id="gut-period-seven" type="button">Set 7 days</button>
      <button id="gut-period-fourteen" type="button">Set 14 days</button>
      <p>Days follow your health-log timezone/day start. Fasting inputs below use your device timezone; recorded UTC times are shown in your selected health timezone after saving.</p>
      <label>Actual fasting start (optional) <input name="fastStart" type="datetime-local"></label>
      <label>Actual fasting end (optional; blank means incomplete) <input name="fastEnd" type="datetime-local"></label>
      <label>Context notes (optional) <textarea name="note" maxlength="2000"></textarea></label>
      <button type="submit">Save observation period</button>
      <button id="gut-period-new" type="button">New period / cancel editing</button>
    </form>
    <p id="gut-recipe-status" role="status" aria-live="polite"></p>
    <div id="gut-observation-list"></div>`;
  modal.querySelector('.gut-health-notice').after(section);
  const find = selector => section.querySelector(selector);
  const recipeForm = find('#gut-recipe-form'), periodForm = find('#gut-observation-form');
  const field = (form, name) => form.elements.namedItem(name);
  const status = message => { find('#gut-recipe-status').textContent = message; };
  let recipeId = '', recipeOriginal = null, periodId = '', periodOriginal = null;
  const nutrientFields = (container, values = {}) => {
    for (const [key, label] of Object.entries(NUTRIENTS)) {
      const wrapper = node('label', label), input = node('input');
      input.type = 'number'; input.min = '0'; input.max = '1000000000'; input.step = 'any';
      input.dataset.nutrient = key; input.value = values[key] ?? '';
      wrapper.append(input); container.append(wrapper);
    }
  };
  const readNutrients = container => Object.fromEntries([...container.querySelectorAll('[data-nutrient]')]
    .filter(input => input.value !== '').map(input => [input.dataset.nutrient, Number(input.value)]));
  nutrientFields(find('#gut-recipe-estimates'));
  function ingredientRow(value = { name: '', amount: null, unit: 'g', detail: '', nutr: {} }) {
    const row = node('fieldset'); row.className = 'gut-recipe-ingredient';
    row.innerHTML = `<legend>Ingredient</legend>
      <label>Name <input data-field="name" maxlength="200" required></label>
      <label>Quantity (blank if unknown) <input data-field="amount" type="number" min="0.000001" max="1000000" step="any"></label>
      <label>Unit <input data-field="unit" maxlength="80" required></label>
      <label>Product/source/quantity notes <textarea data-field="detail" maxlength="1000"></textarea></label>
      <details><summary>Nutrition for this ingredient quantity</summary><div class="gut-nutrient-grid"></div></details>
      <button type="button">Remove ingredient</button>`;
    for (const key of ['name', 'amount', 'unit', 'detail']) row.querySelector(`[data-field="${key}"]`).value = value[key] ?? '';
    nutrientFields(row.querySelector('.gut-nutrient-grid'), value.nutr);
    let base = { amount: value.amount, unit: value.unit, nutr: structuredClone(value.nutr) };
    const readQuantity = () => ({
      amount: Number(row.querySelector('[data-field=amount]').value),
      unit: row.querySelector('[data-field=unit]').value.trim(),
    });
    const updateQuantity = () => {
      if (!Object.keys(base.nutr).length) return;
      try {
        const quantity = readQuantity();
        const scaled = scaleNutrition(base, quantity.amount, quantity.unit);
        for (const input of row.querySelectorAll('[data-nutrient]')) input.value = scaled[input.dataset.nutrient] ?? '';
        row.dataset.portionError = '';
      } catch (error) {
        row.dataset.portionError = error.message;
        status(`Ingredient portion not converted: ${error.message} Restore its original unit or enter facts for the new amount.`);
      }
    };
    for (const key of ['amount', 'unit']) row.querySelector(`[data-field="${key}"]`).addEventListener('input', updateQuantity);
    row.querySelector('.gut-nutrient-grid').addEventListener('input', () => {
      base = { ...readQuantity(), nutr: readNutrients(row) };
      row.dataset.portionError = '';
    });
    row.querySelector('button').onclick = () => row.remove();
    find('#gut-recipe-ingredients').append(row);
  }
  function editRecipe(value, existing = false) {
    recipeId = value.id; recipeOriginal = existing ? JSON.stringify(value) : null;
    for (const name of ['yield', 'culture', 'batch', 'note', 'mode']) field(recipeForm, name).value = value[name];
    field(recipeForm, 'recipeName').value = value.name;
    find('#gut-recipe-ingredients').replaceChildren();
    value.ingredients.forEach(ingredientRow);
    for (const input of find('#gut-recipe-estimates').querySelectorAll('input')) input.value = value.estimatedNutr[input.dataset.nutrient] ?? '';
    find('#gut-recipe-editor').open = true;
  }
  function newRecipe() {
    editRecipe({ id: id(), name: '', yield: 1, culture: '', batch: '', note: '', mode: 'ingredients',
      estimatedNutr: {}, ingredients: [{ name: '', amount: null, unit: 'g', detail: '', nutr: {} }] });
  }
  function resetPeriod() {
    periodId = ''; periodOriginal = null; periodForm.reset();
    field(periodForm, 'start').value = getTodayInUserTz();
    field(periodForm, 'end').value = addDays(getTodayInUserTz(), 6);
  }
  function guard(existing, original) {
    if (original !== null && JSON.stringify(existing) !== original) throw new Error('This record changed. Reopen it before saving.');
  }
  function action(label, callback) {
    const button = node('button', label); button.type = 'button';
    button.onclick = () => { try { callback(); } catch (error) { status(error.message); } };
    return button;
  }
  function previewRecipe(recipe) {
    const card = recipeCard(recipe);
    const details = node('details'); details.append(node('summary', 'Per-serving nutrition & ingredients'));
    details.append(node('p', `${card.quality} · ${card.note}`));
    for (const ingredient of recipe.ingredients) details.append(node('p', `${ingredient.name}: ${ingredient.amount ?? 'unknown quantity'} ${ingredient.unit} · ${ingredient.detail}`));
    const list = node('ul');
    for (const [key, definition] of Object.entries(NUTRIENT_DEFINITIONS)) {
      const value = card.nutr[key];
      list.append(node('li', `${definition.label}: ${value === undefined ? 'unknown' : `${Number(value.toPrecision(8))} ${definition.unit}${card.incompleteNutrients.includes(key) ? ' (partial subtotal)' : ''}`}`));
    }
    details.append(list); return details;
  }
  function render() {
    const openPeriods = new Set([...find('#gut-observation-list').querySelectorAll('details[open]')].map(item => item.dataset.periodId));
    const data = load(), recipes = data.mealRecipes || [], periods = data.gutHealth?.observations || [];
    const selected = field(periodForm, 'recipeId').value;
    field(periodForm, 'recipeId').replaceChildren(new Option('No recipe / all meals', ''));
    for (const recipe of recipes) field(periodForm, 'recipeId').add(new Option(recipe.name, recipe.id));
    if (periodId && !recipes.some(recipe => recipe.id === selected) && selected) {
      field(periodForm, 'recipeId').add(new Option('Deleted recipe (historical link)', selected));
    }
    field(periodForm, 'recipeId').value = selected;
    find('#gut-recipe-food').replaceChildren(new Option('Choose logged food', ''));
    (data.foods || []).forEach((food, index) => find('#gut-recipe-food').add(new Option(`${food.name} · ${food.amount} ${food.unit}`, String(index))));
    find('#gut-recipe-list').replaceChildren();
    for (const recipe of recipes) {
      const row = node('li'); row.append(node('strong', recipe.name), previewRecipe(recipe));
      row.append(action('Review & log portion', () => {
        hideModal('gut-health-modal');
        document.getElementById('dietBtn').click();
        document.getElementById('dietCancelEdit').click();
        document.getElementById('dietFoodAmount').value = '1';
        document.getElementById('dietFoodUnit').value = 'serving';
        const name = document.getElementById('dietFoodName');
        name.value = recipe.name; name.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { recipeId: recipe.id } }));
        document.getElementById('dietEntryStatus').textContent = 'Review this personal recipe and portion, then Log Entry. Unknown nutrition stays blank.';
        name.scrollIntoView({ block: 'center' });
      }), action('Edit recipe', () => editRecipe(recipe, true)), action('Delete recipe', () => {
        if (!confirm(`Delete template "${recipe.name}"? Eaten entries and observation history remain.`)) return;
        const next = load(); guard(next.mealRecipes.find(item => item.id === recipe.id), JSON.stringify(recipe));
        next.mealRecipes = next.mealRecipes.filter(item => item.id !== recipe.id); save(next); render();
        status('Recipe template deleted. Existing intake snapshots are unchanged.');
      }));
      find('#gut-recipe-list').append(row);
    }
    find('#gut-observation-list').replaceChildren();
    for (const period of periods.slice().reverse()) {
      const card = node('details'); card.className = 'gut-observation';
      card.dataset.periodId = period.id; card.open = openPeriods.has(period.id);
      card.append(node('summary', `${period.name} · ${period.start} → ${period.end}`));
      const timeline = observationTimeline(period, data);
      card.append(node('p', `${period.note} · ${period.recipeId ? `Recipe: ${recipes.find(recipe => recipe.id === period.recipeId)?.name || 'deleted template; recorded portions retained'}` : 'All meals'} · Observations only, not a treatment-success measure.`));
      card.append(node('p', period.fastStart
        ? `Fasting start: ${formatInUserTz(period.fastStart)} · ${period.fastEnd ? `end: ${formatInUserTz(period.fastEnd)} · ${Number(timeline.fastingHours.toFixed(2))} hours recorded` : 'end not recorded; duration incomplete'}`
        : 'No fasting interval recorded. Missing food logs do not establish fasting.'));
      card.append(action('Edit period', () => {
        periodId = period.id; periodOriginal = JSON.stringify(period);
        for (const name of ['recipeId', 'start', 'end', 'note']) field(periodForm, name).value = period[name];
        if (period.recipeId && !recipes.some(recipe => recipe.id === period.recipeId)) {
          field(periodForm, 'recipeId').add(new Option('Deleted recipe', period.recipeId));
          field(periodForm, 'recipeId').value = period.recipeId;
        }
        field(periodForm, 'periodName').value = period.name;
        for (const name of ['fastStart', 'fastEnd']) field(periodForm, name).value = clockInput(period[name]);
        periodForm.scrollIntoView({ block: 'start' });
      }), action('Repeat as new period', () => {
        resetPeriod(); field(periodForm, 'periodName').value = period.name;
        field(periodForm, 'recipeId').value = recipes.some(recipe => recipe.id === period.recipeId) ? period.recipeId : '';
        field(periodForm, 'end').value = addDays(getTodayInUserTz(), Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86400000));
        status('New dates prepared. No fasting or intake copied; review and save explicitly.');
        periodForm.scrollIntoView({ block: 'start' });
      }), action('Delete period', () => {
        if (!confirm('Delete this observation period only? Foods, symptoms and breath readings remain.')) return;
        const next = load(); next.gutHealth.observations = next.gutHealth.observations.filter(item => item.id !== period.id);
        save(next); resetPeriod(); render(); status('Observation period deleted; health records retained.');
      }));
      const list = node('ul');
      for (const row of timeline.rows) {
        const item = node('li'); item.append(node('strong', row.date));
        item.append(node('p', `${row.foods.length} food log(s) · ${period.recipeId ? `${row.servings} linked recipe serving(s) · ` : ''}${row.symptoms.length} symptom(s) · ${row.readings.length} breath reading(s). ${!row.foods.length && !row.symptoms.length && !row.readings.length ? 'No observations logged; not proof of adherence or fasting.' : ''}`));
        for (const food of row.foods) item.append(node('p', `${food.name} · ${food.amount} ${food.unit}${food.recipeSnapshot ? ' · recipe snapshot' : ''}`));
        for (const symptom of row.symptoms) item.append(node('p', `${symptom.type}: ${symptom.intensity}/10${symptom.stoolForm ? ` · stool ${symptom.stoolForm}/7` : ''}`));
        for (const reading of row.readings) item.append(node('p', `${reading.challenge} · ${reading.phase} · ${['hydrogen', 'methane'].filter(gas => reading[gas]).map(gas => `${gas}: ${reading[gas].value} ${reading[gas].scale}`).join(' · ')} · ${reading.source}`));
        for (const fast of row.fasting) item.append(node('p', `${fast.kind === 'fastStart' ? 'Fasting start' : 'Fasting end'}: ${formatInUserTz(fast.timestamp)}`));
        list.append(item);
      }
      card.append(list); find('#gut-observation-list').append(card);
    }
  }
  find('#gut-smoothie-starter').onclick = () => { editRecipe(smoothieStarter()); status('Starter opened, not saved or eaten. Resolve actual quantities or explicitly use your own approximate card.'); };
  find('#gut-smoothie-estimates').onclick = () => {
    try {
      if (!confirm('Use the supplied smoothie estimates, not verified ingredient analysis? This replaces the approximate batch card, not ingredient facts. Calories and lower-bound vitamin claims remain blank for your review.')) return;
      const values = suppliedSmoothieEstimates(Number(field(recipeForm, 'yield').value));
      for (const input of find('#gut-recipe-estimates').querySelectorAll('input')) input.value = values[input.dataset.nutrient] ?? '';
      field(recipeForm, 'mode').value = 'estimate';
      status('Supplied point estimates copied for this batch yield; %DV converted using generic FDA values. Choose calories yourself (supplied range 380–420 per serving). Other unknowns remain blank. Review before saving.');
    } catch (error) { status(`Estimates not copied: ${error.message}`); }
  };
  find('#gut-recipe-new').onclick = newRecipe;
  find('#gut-recipe-add').onclick = () => ingredientRow();
  find('#gut-recipe-cancel').onclick = () => { recipeId = ''; recipeOriginal = null; recipeForm.reset(); find('#gut-recipe-editor').open = false; };
  find('#gut-recipe-copy-food').onclick = () => {
    const index = find('#gut-recipe-food').value;
    const food = index === '' ? null : load().foods?.[Number(index)];
    if (!food) { status('Choose an existing food entry.'); return; }
    if (food.recipeSnapshot) { status('Nested recipes are not supported; add their whole-food ingredients instead.'); return; }
    const nutr = Object.fromEntries(Object.entries(recordedNutrientValues(food.nutr))
      .filter(([key, value]) => parseRecordedNutrient(value, key) !== null && !food.nutritionSource?.incompleteNutrients?.includes(key))
      .map(([key, value]) => [key, parseRecordedNutrient(value, key)]));
    ingredientRow({ name: food.name, amount: food.amount, unit: food.unit, nutr,
      detail: `${food.nutritionSource?.quality || 'Unverified logged food'} · ${food.nutritionSource?.note || ''}${food.nutritionSource?.incompleteNutrients?.length ? ' · Partial nutrient subtotals omitted from this ingredient copy.' : ''}`.slice(0, 1000) });
  };
  recipeForm.onsubmit = event => {
    event.preventDefault();
    try {
      const recipe = validateMealRecipe({ id: recipeId || id(), name: field(recipeForm, 'recipeName').value,
        yield: Number(field(recipeForm, 'yield').value), culture: field(recipeForm, 'culture').value,
        batch: field(recipeForm, 'batch').value, note: field(recipeForm, 'note').value,
        mode: field(recipeForm, 'mode').value, estimatedNutr: readNutrients(find('#gut-recipe-estimates')),
        ingredients: [...find('#gut-recipe-ingredients').children].map(row => {
          if (row.dataset.portionError) throw new Error(row.dataset.portionError);
          const value = key => row.querySelector(`[data-field="${key}"]`).value;
          return { name: value('name'), amount: value('amount') === '' ? null : Number(value('amount')),
            unit: value('unit'), detail: value('detail'), nutr: readNutrients(row) };
        }) });
      const next = load(); next.mealRecipes ||= [];
      guard(next.mealRecipes.find(item => item.id === recipe.id), recipeOriginal);
      if (next.mealRecipes.some(item => item.id !== recipe.id && item.name.toLowerCase() === recipe.name.toLowerCase())) throw new Error('Choose a distinct recipe name.');
      recipeCard(recipe);
      next.mealRecipes = next.mealRecipes.filter(item => item.id !== recipe.id).concat(recipe);
      save(next); recipeId = ''; recipeOriginal = null; find('#gut-recipe-editor').open = false; render();
      status('Recipe saved, not logged as eaten. Choose Review & log portion when ready.');
    } catch (error) { status(`Recipe not saved: ${error.message}`); }
  };
  for (const [selector, days] of [['#gut-period-seven', 7], ['#gut-period-fourteen', 14]]) find(selector).onclick = () => {
    try { field(periodForm, 'end').value = addDays(field(periodForm, 'start').value, days - 1); }
    catch (error) { status(`Choose a valid start day: ${error.message}`); }
  };
  find('#gut-period-new').onclick = resetPeriod;
  periodForm.onsubmit = event => {
    event.preventDefault();
    try {
      const value = { id: periodId || id(), name: field(periodForm, 'periodName').value };
      for (const name of ['recipeId', 'start', 'end', 'note']) value[name] = field(periodForm, name).value;
      for (const name of ['fastStart', 'fastEnd']) value[name] = iso(field(periodForm, name).value);
      const period = validateObservedFast(value), next = load();
      next.gutHealth ||= { sessions: [], symptoms: [] };
      guard(next.gutHealth.observations?.find(item => item.id === period.id), periodOriginal);
      next.gutHealth.observations = (next.gutHealth.observations || []).filter(item => item.id !== period.id).concat(period);
      save(next); resetPeriod(); render(); status('Observation period saved. No food or fasting behavior was inferred.');
    } catch (error) { status(`Period not saved: ${error.message}`); }
  };
  const refresh = () => { try { render(); } catch (error) { status(`Recipe/observation data unavailable: ${error.message}`); } };
  new MutationObserver(() => { if (!modal.classList.contains('modal-hidden')) refresh(); }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  for (const event of ['bignuten:wallet-changed', 'bignuten:fitness-data-restored']) window.addEventListener(event, () => {
    recipeId = ''; recipeOriginal = null; recipeForm.reset(); find('#gut-recipe-ingredients').replaceChildren();
    find('#gut-recipe-editor').open = false; resetPeriod(); status(''); refresh();
  });
  for (const event of ['timezonechange', 'daycyclechange']) window.addEventListener(event, refresh);
  for (const form of ['gut-reading-form', 'gut-symptom-form']) document.getElementById(form).addEventListener('submit', refresh);
  modal.addEventListener('click', event => {
    if (event.target.closest('#gut-symptom-history, #gut-session-history')) queueMicrotask(refresh);
  });
  resetPeriod(); refresh();
}
