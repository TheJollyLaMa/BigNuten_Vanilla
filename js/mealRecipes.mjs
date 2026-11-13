import { NUTRIENTS, NUTRIENT_DEFINITIONS, recordedNutrientValues, parseRecordedNutrient, scaleNutrition } from './nutritionDefaults.mjs';

const text = (value, limit = 4000) => {
  if (typeof value !== 'string' || value.length > limit) throw new Error('Recipe text is missing or too long.');
  return value.trim();
};
const positive = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1e-6 || value > 1e6) throw new Error('Enter a positive quantity (0.000001 to 1,000,000).');
  return value;
};
function nutrients(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid recipe nutrients.');
  const result = recordedNutrientValues(value);
  if (Object.keys(value).some(key => !Object.hasOwn(NUTRIENTS, key))) throw new Error('Unsupported recipe nutrient.');
  for (const [key, raw] of Object.entries(result)) {
    const number = parseRecordedNutrient(raw, key);
    if (number === null) throw new Error('Recipe nutrients must be non-negative numbers; leave unknown values blank.');
    result[key] = number;
  }
  return result;
}
export function validateMealRecipe(value) {
  if (!value || !Array.isArray(value.ingredients) || !value.ingredients.length || value.ingredients.length > 100) throw new Error('Add 1–100 ingredients.');
  const result = {
    id: text(value.id, 100), name: text(value.name, 200), yield: positive(value.yield),
    culture: text(value.culture ?? '', 1000), batch: text(value.batch ?? '', 200),
    note: text(value.note ?? ''), mode: value.mode,
    estimatedNutr: nutrients(value.estimatedNutr || {}),
    ingredients: value.ingredients.map(item => ({
      name: text(item.name, 200), amount: item.amount === null ? null : positive(item.amount),
      unit: text(item.unit, 80), detail: text(item.detail ?? '', 1000), nutr: nutrients(item.nutr || {}),
    })),
  };
  if (!result.id || !result.name || !['ingredients', 'estimate'].includes(result.mode) ||
      result.ingredients.some(item => !item.name || !item.unit || (item.amount === null && Object.keys(item.nutr).length))) {
    throw new Error('Name the recipe and ingredients. Unmeasured ingredients cannot have calculated nutrition.');
  }
  return result;
}
export function normalizeMealRecipes(value = []) {
  if (!Array.isArray(value)) throw new Error('Recipes must be a list.');
  const recipes = value.map(validateMealRecipe);
  if (new Set(recipes.map(item => item.id)).size !== recipes.length) throw new Error('Duplicate recipe IDs.');
  return recipes;
}
export function recipeCard(value) {
  const recipe = validateMealRecipe(value), nutr = {}, incompleteNutrients = [];
  for (const key of Object.keys(NUTRIENTS)) {
    const known = recipe.ingredients.filter(item => Object.hasOwn(item.nutr, key));
    if (recipe.mode === 'estimate') {
      if (Object.hasOwn(recipe.estimatedNutr, key)) nutr[key] = recipe.estimatedNutr[key];
      else incompleteNutrients.push(key);
    } else {
      if (known.length) nutr[key] = known.reduce((sum, item) => sum + item.nutr[key], 0);
      if (known.length !== recipe.ingredients.length) incompleteNutrients.push(key);
    }
  }
  const card = { name: recipe.name, amount: recipe.yield, unit: 'serving', nutr };
  return { ...card, amount: 1, nutr: scaleNutrition(card, 1, 'serving'),
    quality: recipe.mode === 'estimate' ? 'estimate' : 'user-entered', sources: [],
    note: `${recipe.mode === 'estimate' ? 'User-entered approximate batch card; not verified.' : 'Sum of recorded ingredient facts; partial nutrients are known subtotals.'} ${recipe.note}`.slice(0, 4000),
    incompleteNutrients, recipeSnapshot: recipe };
}
export const smoothieStarter = () => ({
  id: crypto.randomUUID(), name: 'Gut Vitality Yogurt Smoothie', yield: 1, mode: 'ingredients',
  culture: 'User-reported L. reuteri; inulin added before incubation. Strain/viability/CFU unverified.',
  batch: '', estimatedNutr: {},
  note: 'Unverified supplied per-serving estimates: 380–420 kcal; fat 18 g (saturated 8 g, mono 3 g, poly 5 g); carbs 18 g; fiber 6 g; sugars 8 g; protein 30 g. B12 ~120% DV; B1/B2 >200%; niacin/B6 ~100+%; calcium ~30%; iron ~25%; magnesium/zinc ~30%. Exact brands, quantities and yield need confirmation; no electrolyte ratio or nutrient completeness established. Estimates are notes, not calculated facts.',
  ingredients: [
    { name: 'Whole-milk or goat-milk yogurt', amount: 1, unit: 'cup', detail: 'Confirm milk/product and culture.' },
    { name: 'Inulin', amount: null, unit: 'g', detail: 'Amount added before incubation unspecified.' },
    { name: 'Hemp protein powder', amount: null, unit: 'tbsp', detail: 'Supplied range 2–3 tbsp; enter actual amount.' },
    { name: 'Ghee', amount: 1, unit: 'tbsp', detail: '' },
    { name: 'Nutritional yeast', amount: null, unit: 'tbsp', detail: 'Supplied range 1–2 tbsp; confirm amount/fortification.' },
    { name: "Lion's Mane, Shiitake and Cordyceps blend", amount: null, unit: 'tsp', detail: '1 capsule OR 1/2 tsp; confirm product, amount and unit.' },
    { name: 'Water, coconut water or milk', amount: null, unit: 'ml', detail: 'Choose actual liquid and amount, or remove if omitted.' },
  ].map(item => ({ ...item, nutr: {} })),
});

export function suppliedSmoothieEstimates(servings) {
  positive(servings);
  const perServing = { protein: 30, fat: 18, saturatedFat: 8, carbs: 18, fiber: 6, sugar: 8 };
  for (const [key, percent] of Object.entries({ vitaminB12: 120, calcium: 30, iron: 25, magnesium: 30, zinc: 30 })) {
    perServing[key] = NUTRIENT_DEFINITIONS[key].goal * percent / 100;
  }
  return Object.fromEntries(Object.entries(perServing).map(([key, value]) => [key, value * servings]));
}
