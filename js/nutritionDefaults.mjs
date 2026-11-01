export const NUTRIENTS = {
  calories: 'Calories (kcal)', protein: 'Protein (g)', carbs: 'Carbs (g)',
  fat: 'Fat (g)', fiber: 'Fiber (g)', sugar: 'Sugar (g)',
  sodium: 'Sodium (mg)', potassium: 'Potassium (%DV)',
};
const clean = value => String(value || '').trim();
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
      !['g', 'oz', 'ml', 'serving', 'piece', 'cup', 'tbsp', 'tsp', 'fl oz', 'slice', 'handful', 'scoop'].includes(card.unit)) {
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

export function scaleNutrition(card, amount, unit) {
  const quantity = Number(amount);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) throw new Error('Enter a positive amount no greater than 1000000 before applying nutrition.');
  const factors = { g: ['mass', 1], oz: ['mass', 28.349523125], ml: ['volume', 1] };
  let scale;
  if (unit === card.unit) scale = quantity / card.amount;
  else if (factors[unit] && factors[card.unit] && factors[unit][0] === factors[card.unit][0]) {
    scale = quantity * factors[unit][1] / (card.amount * factors[card.unit][1]);
  } else throw new Error(`Cannot scale ${card.unit} to ${unit || 'an unspecified unit'}. Use the card's base unit or enter a matching serving explicitly.`);
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
