export const STREAK_RULES_SCHEMA = 'bignuten-streak-rules/v1';
const SUPPORTED_TYPES = new Set(['hydration', 'weight', 'exercise', 'nutrition']);
const SUPPORTED_CADENCES = new Set(['daily', 'weekly']);

export function validateStreakRules(rules) {
  if (!rules || rules.schema !== STREAK_RULES_SCHEMA || !Array.isArray(rules.metrics) || rules.metrics.length < 1 || rules.metrics.length > 8) {
    throw new Error('Streak rules must define 1-8 metrics using the supported schema.');
  }
  const ids = new Set();
  for (const metric of rules.metrics) {
    if (!metric || !SUPPORTED_TYPES.has(metric.type)) throw new Error('Unsupported streak metric type.');
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(String(metric.id || '')) || ids.has(metric.id)) throw new Error('Metric IDs must be unique short slugs.');
    if (!SUPPORTED_CADENCES.has(metric.cadence)) throw new Error(`Metric ${metric.id} needs daily or weekly cadence.`);
    if (!Number.isFinite(Number(metric.target)) || Number(metric.target) <= 0) throw new Error(`Metric ${metric.id} needs a positive target.`);
    if (metric.type === 'exercise' && !String(metric.exerciseType || '').trim()) throw new Error(`Exercise metric ${metric.id} needs exerciseType.`);
    ids.add(metric.id);
  }
  if (!rules.metrics.some(metric => metric.cadence === 'daily')) throw new Error('At least one daily metric is required to calculate qualifying days.');
  if (rules.requiredActivityDays != null && (!Number.isInteger(rules.requiredActivityDays) || rules.requiredActivityDays < 1 || rules.requiredActivityDays > 30)) {
    throw new Error('requiredActivityDays must be between 1 and 30.');
  }
  return rules;
}

function metricValue(metric, day) {
  if (metric.type === 'hydration') {
    const glasses = Number(day.waterGlasses || 0);
    return { value: glasses, details: { glasses } };
  }
  if (metric.type === 'weight') {
    const values = Array.isArray(day.weightLogs) ? day.weightLogs : [];
    return { value: values.length, details: values.map(entry => ({ weight: entry.weight, unit: entry.unit || 'lbs' })) };
  }
  if (metric.type === 'exercise') {
    const entries = (Array.isArray(day.exerciseEntries) ? day.exerciseEntries : [])
      .filter(entry => !metric.exerciseType || entry.type === metric.exerciseType);
    const total = entries.reduce((sum, entry) => sum + (Number(entry.reps) || 0) * Math.max(1, Number(entry.sets) || 1), 0);
    return { value: total, details: entries.map(entry => ({ type: entry.type, reps: entry.reps, sets: entry.sets, weight: entry.weight || 0 })) };
  }
  const foods = Array.isArray(day.foodEntries) ? day.foodEntries : [];
  return { value: foods.length, details: foods.map(entry => ({ name: entry.name, amount: entry.amount, unit: entry.unit })) };
}

export function evaluateStreakRules(rulesInput, dailyRows, meetupIndex) {
  const rules = validateStreakRules(rulesInput);
  const metrics = rules.metrics;
  const dailyMetrics = metrics.filter(metric => metric.cadence === 'daily');
  const weeklyMetrics = metrics.filter(metric => metric.cadence === 'weekly');
  const weeklyTotals = Object.fromEntries(weeklyMetrics.map(metric => [metric.id, 0]));
  let totalActivityDays = 0;
  let weeklyActivityDays = 0;
  const records = dailyRows.map((day, index) => {
    const values = Object.fromEntries(metrics.map(metric => [metric.id, metricValue(metric, day)]));
    const dailyChecks = Object.fromEntries(dailyMetrics.map(metric => [metric.id, values[metric.id].value >= Number(metric.target)]));
    const qualifies = dailyMetrics.every(metric => dailyChecks[metric.id]);
    if (qualifies) {
      totalActivityDays += 1;
      if (Math.floor(index / 7) === meetupIndex) weeklyActivityDays += 1;
    }
    if (Math.floor(index / 7) === meetupIndex) {
      for (const metric of weeklyMetrics) weeklyTotals[metric.id] += values[metric.id].value;
    }
    return { date: day.date, qualifies, dailyChecks, metrics: values };
  });
  const weeklyRequirementsMet = weeklyMetrics.every(metric => weeklyTotals[metric.id] >= Number(metric.target));
  return { totalActivityDays, weeklyActivityDays, weeklyTotals, weeklyRequirementsMet, records };
}
