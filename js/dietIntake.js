/** Shared by the full Diet logger and raw-food quick log; callers use the app's recovery-aware store. */
export function persistDietIntake({ name, amount, unit, nutr }, load, save) {
  name = String(name || '').trim();
  unit = String(unit || '').trim();
  amount = Number(amount);
  if (!name || !unit || !Number.isFinite(amount) || amount <= 0) return null;
  if (nutr && Object.values(nutr).some(value => !Number.isFinite(value) || value < 0)) return null;
  const intake = { type: 'diet', name, amount, unit, nutr, date: new Date().toISOString() };
  const data = load();
  data.foods ||= [];
  data.foods.push(intake);
  save(data);
  return intake;
}
