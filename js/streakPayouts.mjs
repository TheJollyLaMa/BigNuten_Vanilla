// Integer base units only; this is a no-yield rehearsal, not a live quote.
export function simulateStreakPayouts({ entrants, completed, stake, policy = 'legacy', scores = [] }) {
  if (!Number.isSafeInteger(entrants) || entrants < 1 ||
      !Number.isSafeInteger(completed) || completed < 0 || completed > entrants ||
      typeof stake !== 'bigint' || stake <= 0n ||
      !['legacy', 'ranked-ties'].includes(policy) || !Array.isArray(scores)) {
    throw new Error('Use positive entrants/stake, a known policy, and 0..entrants completed.');
  }
  const pot = BigInt(entrants) * stake;
  const finishers = Array.from({ length: completed }, (_, index) => {
    const score = scores[index] || { verifiedActivityDays: completed - index, reportsSubmitted: 0 };
    const verifiedActivityDays = Number(score.verifiedActivityDays);
    const reportsSubmitted = Number(score.reportsSubmitted);
    if (!Number.isSafeInteger(verifiedActivityDays) || verifiedActivityDays < 0 ||
        !Number.isSafeInteger(reportsSubmitted) || reportsSubmitted < 0) {
      throw new Error('Each completed entrant needs non-negative integer activity days and submitted reports.');
    }
    return { entrantIndex: index, verifiedActivityDays, reportsSubmitted };
  });
  if (policy === 'legacy') {
    finishers.forEach((row, index) => {
      row.rank = index + 1;
      row.place = index < 3 ? index + 1 : 0;
    });
  } else {
    for (const row of finishers) {
      row.rank = 1 + finishers.filter(other =>
        other.verifiedActivityDays > row.verifiedActivityDays ||
        (other.verifiedActivityDays === row.verifiedActivityDays &&
          other.reportsSubmitted > row.reportsSubmitted)).length;
      row.place = row.rank;
    }
    finishers.sort((left, right) => left.rank - right.rank || left.entrantIndex - right.entrantIndex);
  }
  const principalTotal = BigInt(completed) * stake - (completed >= 3 ? stake - stake / 2n : 0n);
  const totalWeight = completed === 1 ? 3n : completed === 2 ? 5n : BigInt(completed + 3);
  const bonusPool = pot - principalTotal;
  const slotWeight = slot => slot === 1 ? 3n : slot === 2 ? 2n : 1n;
  const slotPrincipal = slot => slot === 3 ? stake / 2n : stake;
  if (policy === 'legacy') {
    for (const row of finishers) {
      row.principal = slotPrincipal(row.rank);
      row.weight = slotWeight(row.rank);
      row.bonus = bonusPool * row.weight / totalWeight;
      row.payout = row.principal + row.bonus;
    }
  } else {
    for (let start = 0; start < finishers.length;) {
      let end = start + 1;
      while (end < finishers.length && finishers[end].rank === finishers[start].rank) end += 1;
      const size = BigInt(end - start);
      let groupPrincipal = 0n;
      let groupPayout = 0n;
      for (let slot = finishers[start].rank; slot < finishers[start].rank + Number(size); slot += 1) {
        const principal = slotPrincipal(slot);
        groupPrincipal += principal;
        groupPayout += principal + bonusPool * slotWeight(slot) / totalWeight;
      }
      const payout = groupPayout / size;
      const principal = groupPrincipal / size;
      for (let index = start; index < end; index += 1) {
        finishers[index].principal = principal;
        finishers[index].weight = 0n;
        finishers[index].bonus = payout - principal;
        finishers[index].payout = payout;
      }
      start = end;
    }
  }
  return {
    pot, bonusPool, totalWeight, policy, finishers,
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

export const TIED_PAYOUT_SCENARIOS = [
  { entrants: 1, completed: 1, scores: [{ verifiedActivityDays: 2, reportsSubmitted: 1 }] },
  { entrants: 2, completed: 2, scores: [{ verifiedActivityDays: 2, reportsSubmitted: 1 }, { verifiedActivityDays: 2, reportsSubmitted: 1 }] },
  { entrants: 3, completed: 3, scores: [{ verifiedActivityDays: 3, reportsSubmitted: 2 }, { verifiedActivityDays: 3, reportsSubmitted: 2 }, { verifiedActivityDays: 2, reportsSubmitted: 1 }] },
  { entrants: 5, completed: 5, scores: [{ verifiedActivityDays: 5, reportsSubmitted: 3 }, { verifiedActivityDays: 4, reportsSubmitted: 2 }, { verifiedActivityDays: 4, reportsSubmitted: 2 }, { verifiedActivityDays: 2, reportsSubmitted: 1 }, { verifiedActivityDays: 2, reportsSubmitted: 1 }] },
  { entrants: 5, completed: 5, scores: [{ verifiedActivityDays: 5, reportsSubmitted: 3 }, { verifiedActivityDays: 4, reportsSubmitted: 2 }, { verifiedActivityDays: 3, reportsSubmitted: 1 }, { verifiedActivityDays: 3, reportsSubmitted: 1 }, { verifiedActivityDays: 2, reportsSubmitted: 1 }] },
  { entrants: 5, completed: 5, scores: [{ verifiedActivityDays: 5, reportsSubmitted: 3 }, { verifiedActivityDays: 4, reportsSubmitted: 2 }, { verifiedActivityDays: 4, reportsSubmitted: 2 }, { verifiedActivityDays: 4, reportsSubmitted: 2 }, { verifiedActivityDays: 2, reportsSubmitted: 1 }] },
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

export function tiedPayoutExampleRows() {
  return TIED_PAYOUT_SCENARIOS.map(scenario => {
    const result = simulateStreakPayouts({ ...scenario, stake: EXAMPLE_STAKE, policy: 'ranked-ties' });
    const payouts = [];
    for (let index = 0; index < result.finishers.length;) {
      let end = index + 1;
      while (end < result.finishers.length && result.finishers[end].rank === result.finishers[index].rank) end += 1;
      const rows = result.finishers.slice(index, end);
      const label = rows.length > 1
        ? `#${rows[0].rank} (${rows.length} tied): ${formatBnut(rows[0].payout)} each`
        : `#${rows[0].rank}: ${formatBnut(rows[0].payout)}`;
      payouts.push(label);
      index = end;
    }
    return [
      scenario.entrants,
      scenario.scores.map(score => `${score.verifiedActivityDays}d/${score.reportsSubmitted}r`).join(', '),
      payouts.join('; '),
      formatBnut(result.treasury),
    ];
  });
}
