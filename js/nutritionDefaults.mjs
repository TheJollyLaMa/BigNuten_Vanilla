export const NUTRIENTS = {
  calories: 'Calories (kcal)', protein: 'Protein (g)', carbs: 'Carbs (g)',
  fat: 'Fat (g)', fiber: 'Fiber (g)', sugar: 'Sugar (g)',
  sodium: 'Sodium (mg)', potassium: 'Potassium (%DV)',
};
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
