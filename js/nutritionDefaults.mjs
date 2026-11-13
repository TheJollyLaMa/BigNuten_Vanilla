export const NUTRIENT_REFERENCE_URL = 'https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels';
// Food units preserve existing potassium %DV and vitamin D IU records.
export const NUTRIENT_DEFINITIONS = Object.freeze(Object.fromEntries(Object.entries({
  calories: { label: 'Calories', unit: 'kcal', goal: 2000 },
  protein: { label: 'Protein', unit: 'g', goal: 50 },
  carbs: { label: 'Carbs', unit: 'g', goal: 275 },
  fat: { label: 'Fat', unit: 'g', goal: 78 },
  fiber: { label: 'Fiber', unit: 'g', goal: 28 },
  sugar: { label: 'Total sugar', unit: 'g', goal: null },
  sodium: { label: 'Sodium', unit: 'mg', goal: 2300 },
  potassium: { label: 'Potassium', unit: '%DV', displayUnit: 'mg', factor: 47, goal: 4700 },
  calcium: { label: 'Calcium', unit: 'mg', goal: 1300 },
  magnesium: { label: 'Magnesium', unit: 'mg', goal: 420 },
  iodine: { label: 'Iodine', unit: 'mcg', goal: 150 },
  copper: { label: 'Copper', unit: 'mg', goal: 0.9 },
  iron: { label: 'Iron', unit: 'mg', goal: 18 },
  zinc: { label: 'Zinc', unit: 'mg', goal: 11 },
  selenium: { label: 'Selenium', unit: 'mcg', goal: 55 },
  phosphorus: { label: 'Phosphorus', unit: 'mg', goal: 1250 },
  manganese: { label: 'Manganese', unit: 'mg', goal: 2.3 },
  chromium: { label: 'Chromium', unit: 'mcg', goal: 35 },
  molybdenum: { label: 'Molybdenum', unit: 'mcg', goal: 45 },
  chloride: { label: 'Chloride', unit: 'mg', goal: 2300 },
  vitaminA: { label: 'Vitamin A', unit: 'mcg RAE', goal: 900 },
  vitaminC: { label: 'Vitamin C', unit: 'mg', goal: 90 },
  vitaminD: { label: 'Vitamin D', unit: 'IU', goal: 800 },
  vitaminE: { label: 'Vitamin E', unit: 'mg alpha-tocopherol', goal: 15 },
  vitaminK: { label: 'Vitamin K', unit: 'mcg', goal: 120 },
  thiamin: { label: 'Thiamin (B1)', unit: 'mg', goal: 1.2 },
  riboflavin: { label: 'Riboflavin (B2)', unit: 'mg', goal: 1.3 },
  niacin: { label: 'Niacin (B3)', unit: 'mg NE', goal: 16 },
  vitaminB6: { label: 'Vitamin B6', unit: 'mg', goal: 1.7 },
  folate: { label: 'Folate', unit: 'mcg DFE', goal: 400 },
  vitaminB12: { label: 'Vitamin B12', unit: 'mcg', goal: 2.4 },
  biotin: { label: 'Biotin', unit: 'mcg', goal: 30 },
  pantothenicAcid: { label: 'Pantothenic acid (B5)', unit: 'mg', goal: 5 },
  choline: { label: 'Choline', unit: 'mg', goal: 550 },
  addedSugar: { label: 'Added sugar', unit: 'g', goal: 50 },
  saturatedFat: { label: 'Saturated fat', unit: 'g', goal: 20 },
  cholesterol: { label: 'Cholesterol', unit: 'mg', goal: 300 },
}).map(([key, value]) => [key, Object.freeze(value)])));
export const NUTRIENTS = Object.freeze(Object.fromEntries(Object.entries(NUTRIENT_DEFINITIONS)
  .map(([key, value]) => [key, `${value.label} (${value.unit})`])));
export const nutrientInputId = key => `dietNutr${key[0].toUpperCase()}${key.slice(1)}`;
export const NUTRITION_COVERAGE_VERSION = 1;
export function needsNutritionEnrichment(card) {
  return card.nutritionCoverageVersion !== NUTRITION_COVERAGE_VERSION &&
    Object.keys(NUTRIENTS).some(key => card.nutr[key] == null);
}

export function enrichNutritionCard(original, incoming) {
  const base = validateNutrition(original), next = validateNutrition(incoming);
  if (base.id !== next.id) throw new Error('Cannot enrich a different food identity.');
  const scaled = scaleNutrition(next, base.amount, base.unit);
  const additions = Object.fromEntries(Object.entries(scaled).filter(([key]) => !Object.hasOwn(base.nutr, key)));
  const sources = [...new Map([...base.sources, ...next.sources].map(source => [source.url, source])).values()].slice(0, 10);
  const ratio = portionBaseAmount(next, base.unit);
  const measures = base.quality === 'source-backed' && next.quality !== 'source-backed' ? base.measures
    : [...base.measures, ...next.measures.filter(measure => !base.measures.some(old => old.unit === measure.unit))
      .map(measure => ({ ...measure, baseAmount: measure.baseAmount / ratio }))];
  return validateNutrition({ ...base,
    nutr: { ...base.nutr, ...additions },
    measures,
    nutritionCoverageVersion: next.nutritionCoverageVersion,
    quality: Object.keys(additions).length && base.quality !== 'user-entered' ? 'estimate' : base.quality,
    sources,
    note: Object.keys(additions).length
      ? `${base.note.slice(0, 1800)} Missing nutrients added from a ${next.quality} card; existing figures retained. ${next.note.slice(0, 1800)}`
      : base.note,
  });
}

export function recordedNutrientKey(key) {
  const compact = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  return Object.keys(NUTRIENTS).find(known => known.toLowerCase() === compact) || null;
}

export function recordedNutrientValues(nutr) {
  const values = {};
  for (const [key, value] of Object.entries(nutr || {})) {
    const known = recordedNutrientKey(key);
    if (known && !Object.hasOwn(values, known)) values[known] = value;
  }
  // Exact canonical fields win over legacy spellings, without double counting.
  for (const key of Object.keys(NUTRIENTS)) if (Object.hasOwn(nutr || {}, key)) values[key] = nutr[key];
  return values;
}

export function parseRecordedNutrient(raw, key) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const match = raw.trim().match(/^(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?\s*(.*)$/);
  if (!match) return null;
  const value = Number(match[1] + (match[2] ? `e${match[2]}` : ''));
  const unit = match[3].trim().toLowerCase();
  const expected = NUTRIENT_DEFINITIONS[key]?.unit.toLowerCase();
  if (unit && unit !== expected && !(key === 'potassium' && unit === '%')) return null;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function summarizeNutrients(entries) {
  const foods = Array.isArray(entries) ? entries : [];
  const records = foods.map(food => recordedNutrientValues(food?.nutr));
  return Object.fromEntries(Object.entries(NUTRIENT_DEFINITIONS).map(([key, definition]) => {
    let total = 0, knownEntries = 0, reportedEntries = 0;
    for (const [index, nutr] of records.entries()) {
      const raw = nutr[key];
      const value = parseRecordedNutrient(raw, key);
      if (value === null) continue;
      total += value * (definition.factor || 1);
      reportedEntries++;
      if (!foods[index]?.nutritionSource?.incompleteNutrients?.includes(key)) knownEntries++;
    }
    return [key, { total: reportedEntries ? total : null, knownEntries, totalEntries: foods.length }];
  }));
}

export function validateNutritionSource(value) {
  if (!value || !['source-backed', 'estimate', 'user-entered'].includes(value.quality)
    || !Array.isArray(value.sources) || value.sources.length > 10) throw new Error('Invalid nutrition provenance.');
  const sources = value.sources.map(source => {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2000) throw new Error('Sources require safe HTTPS URLs.');
    return { url: url.href, title: String(source.title || '').slice(0, 300) };
  });
  if (value.quality === 'source-backed' && !sources.length) throw new Error('Source-backed nutrition needs a source.');
  const retrievedAt = String(value.retrievedAt || '');
  if (retrievedAt && !Number.isFinite(Date.parse(retrievedAt))) throw new Error('Invalid nutrition source date.');
  if (value.incompleteNutrients !== undefined && (!Array.isArray(value.incompleteNutrients) ||
      value.incompleteNutrients.some(key => !Object.hasOwn(NUTRIENTS, key)))) throw new Error('Invalid nutrient coverage.');
  return { quality: value.quality, sources, retrievedAt, note: String(value.note || '').slice(0, 4000),
    ...(value.incompleteNutrients ? { incompleteNutrients: [...new Set(value.incompleteNutrients)] } : {}) };
}
const clean = value => String(value || '').trim();
export const NUTRITION_UNITS = ['g', 'oz', 'ml', 'serving', 'piece', 'cup', 'tbsp', 'tsp', 'fl oz', 'slice', 'handful', 'scoop'];
const factors = { g: ['mass', 1], oz: ['mass', 28.349523125],
  ml: ['volume', 1], cup: ['volume', 240], tbsp: ['volume', 15], tsp: ['volume', 5], 'fl oz': ['volume', 30] };
export function nutritionUnitRatio(from, to) {
  if (from === to) return 1;
  return factors[from] && factors[to] && factors[from][0] === factors[to][0]
    ? factors[from][1] / factors[to][1] : null;
}
export function validateNutrition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a nutrition card.');
  const card = {
    name: clean(value.name), kind: value.kind, preparation: clean(value.preparation),
    brand: clean(value.brand), market: clean(value.market), barcode: clean(value.barcode),
    amount: Number(value.amount), unit: clean(value.unit), serving: clean(value.serving),
    ingredients: clean(value.ingredients), note: clean(value.note), quality: value.quality,
    retrievedAt: clean(value.retrievedAt), sources: value.sources, nutr: value.nutr,
  };
  if (value.nutritionCoverageVersion !== undefined) {
    if (value.nutritionCoverageVersion !== NUTRITION_COVERAGE_VERSION) throw new Error('Unsupported nutrition coverage version.');
    card.nutritionCoverageVersion = value.nutritionCoverageVersion;
  }
  if (!card.name || card.name.length > 200 || !['whole', 'packaged'].includes(card.kind)) throw new Error('Enter a food name and food type.');
  if (card.kind === 'packaged' && (!card.brand || !card.market)) throw new Error('Packaged foods need a brand and country/market.');
  if (!Number.isFinite(card.amount) || card.amount < 1e-6 || card.amount > 1e6 ||
      !NUTRITION_UNITS.includes(card.unit)) {
    throw new Error('Enter a positive base serving amount and supported unit.');
  }
  if (['serving', 'piece', 'cup', 'tbsp', 'tsp', 'fl oz', 'slice', 'handful', 'scoop'].includes(card.unit) && !card.serving) {
    throw new Error('Describe the source-defined serving (for example, one 30 g scoop).');
  }
  for (const key of ['preparation', 'brand', 'market', 'barcode', 'serving', 'ingredients', 'note']) {
    if (card[key].length > (key === 'ingredients' || key === 'note' ? 4000 : 300)) throw new Error(`${key} is too long.`);
  }
  if (!['source-backed', 'estimate', 'user-entered'].includes(card.quality)) throw new Error('Choose a source-backed, estimated or user-entered card.');
  if (!card.retrievedAt || !Number.isFinite(Date.parse(card.retrievedAt))) throw new Error('The card needs a valid retrieval date.');
  if (!Array.isArray(card.sources) || card.sources.length > 10) throw new Error('Invalid nutrition sources.');
  card.sources = card.sources.map(source => {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2000) throw new Error('Sources require safe HTTPS URLs.');
    return { url: url.href, title: clean(source.title).slice(0, 300) };
  });
  const measures = value.measures ?? [];
  if (!Array.isArray(measures) || measures.length > NUTRITION_UNITS.length) throw new Error('Invalid food portion measures.');
  const seen = new Set();
  card.measures = measures.map(measure => {
    if (!measure || !NUTRITION_UNITS.includes(measure.unit) || seen.has(measure.unit) ||
        nutritionUnitRatio(measure.unit, card.unit) !== null ||
        ![measure.amount, measure.baseAmount].every(number => typeof number === 'number' && Number.isFinite(number) && number >= 1e-6 && number <= 1e6)) {
      throw new Error('Food measures need a unique unit and positive equivalent in the card base unit.');
    }
    seen.add(measure.unit);
    const sourceUrl = clean(measure.sourceUrl);
    let url = '';
    if (sourceUrl) {
      url = new URL(sourceUrl).href;
      if (!card.sources.some(source => source.url === url)) throw new Error('Portion source must match a nutrition source.');
    }
    if (card.quality === 'source-backed' && !url) throw new Error('Source-backed portions need a matching source URL.');
    return { unit: measure.unit, amount: measure.amount, baseAmount: measure.baseAmount, sourceUrl: url };
  });
  if (card.quality === 'source-backed' && !card.sources.length) throw new Error('Source-backed nutrition needs a source.');
  if (!card.nutr || typeof card.nutr !== 'object' || Array.isArray(card.nutr)) throw new Error('Expected nutrient values.');
  const nutr = {};
  for (const [key, number] of Object.entries(card.nutr)) {
    if (!Object.hasOwn(NUTRIENTS, key)) throw new Error(`Unsupported nutrient: ${key}`);
    if (number === null || number === undefined || number === '') continue;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1e7) throw new Error(`Invalid ${key} value.`);
    nutr[key] = number;
  }
  if (!Object.keys(nutr).length) throw new Error('Enter at least one nutrient; unknown values should be blank.');
  card.nutr = nutr;
  card.id = JSON.stringify([card.name, card.kind, card.preparation, card.brand, card.market, card.barcode].map(v => clean(v).toLowerCase()));
  return card;
}

export function portionBaseAmount(card, unit) {
  const direct = nutritionUnitRatio(unit, card.unit);
  if (direct !== null) return direct;
  const exact = card.measures?.find(measure => measure.unit === unit);
  if (exact) return exact.baseAmount / exact.amount;
  for (const measure of card.measures || []) {
    const ratio = nutritionUnitRatio(unit, measure.unit);
    if (ratio !== null) return ratio * measure.baseAmount / measure.amount;
  }
  // Without a source-defined serving, one serving explicitly means this card's base.
  return unit === 'serving' ? card.amount : null;
}

export function scaleNutrition(card, amount, unit) {
  const quantity = Number(amount);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) throw new Error('Enter a positive amount no greater than 1000000 before applying nutrition.');
  const baseAmount = portionBaseAmount(card, unit);
  if (baseAmount === null) throw new Error(`Cannot scale ${card.unit} to ${unit || 'an unspecified unit'} until this food's portion size is defined below.`);
  const scale = quantity * baseAmount / card.amount;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid serving scale.');
  return Object.fromEntries(Object.entries(card.nutr).map(([key, value]) => {
    const scaled = value * scale;
    if (!Number.isFinite(scaled)) throw new Error('Scaled nutrition exceeds the supported range.');
    return [key, scaled];
  }));
}

export function matchingDefaults(cards, name) {
  return (cards || []).filter(card => card.name.toLowerCase() === clean(name).toLowerCase());
}

export function saveNutritionDefault(cards, value) {
  const card = validateNutrition(value);
  return [...(cards || []).filter(entry => entry.id !== card.id), card];
}
