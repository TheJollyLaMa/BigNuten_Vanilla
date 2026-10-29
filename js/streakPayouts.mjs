// Mirrors StreakBetEscrow._assignStreakPlaces / _distributeStreakPayouts.
// Integer base units only; this is a no-yield rehearsal, not a live quote.
export function simulateStreakPayouts({ entrants, completed, stake }) {
  if (!Number.isSafeInteger(entrants) || entrants < 1 ||
      !Number.isSafeInteger(completed) || completed < 0 || completed > entrants ||
      typeof stake !== 'bigint' || stake <= 0n) {
    throw new Error('Use positive entrants/stake and 0..entrants completed.');
  }
  const pot = BigInt(entrants) * stake;
  const finishers = Array.from({ length: completed }, (_, index) => ({
    rank: index + 1,
    place: index < 3 ? index + 1 : 0,
    principal: index === 2 ? stake / 2n : stake,
    weight: index === 0 ? 3n : index === 1 ? 2n : 1n,
  }));
  const principalTotal = finishers.reduce((sum, row) => sum + row.principal, 0n);
  const totalWeight = finishers.reduce((sum, row) => sum + row.weight, 0n);
  const bonusPool = pot - principalTotal;
  for (const row of finishers) {
    row.bonus = bonusPool * row.weight / totalWeight;
    row.payout = row.principal + row.bonus;
  }
  return {
    pot, bonusPool, finishers,
    treasury: pot - finishers.reduce((sum, row) => sum + row.payout, 0n),
    forfeited: entrants - completed,
  };
}

export function formatBnut(units) {
  const value = units.toString().padStart(19, '0');
  const fraction = value.slice(-18).replace(/0+$/, '');
  return `${value.slice(0, -18)}${fraction ? `.${fraction}` : ''}`;
}

export const EXAMPLE_STAKE = 100n * 10n ** 18n;
export const PAYOUT_SCENARIOS = [
  { entrants: 1, completed: 1 },
  { entrants: 1, completed: 0 },
  { entrants: 2, completed: 2 },
  { entrants: 2, completed: 1 },
  { entrants: 3, completed: 3 },
  { entrants: 3, completed: 2 },
  { entrants: 5, completed: 5 },
  { entrants: 5, completed: 3 },
  { entrants: 5, completed: 0 },
];

export function payoutExampleRows() {
  return PAYOUT_SCENARIOS.map(scenario => {
    const result = simulateStreakPayouts({ ...scenario, stake: EXAMPLE_STAKE });
    return [
      scenario.entrants, scenario.completed, result.forfeited,
      result.finishers.map(row => `#${row.rank}: ${formatBnut(row.payout)}`).join('; ') || 'None',
      formatBnut(result.treasury),
    ];
  });
}
