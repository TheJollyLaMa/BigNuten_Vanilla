import { payoutExampleRows } from './streakPayouts.mjs';

function formatAmount(value, decimals) {
  const raw = BigInt(value);
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > 36) throw new RangeError('Unsupported token decimals.');
  const scale = 10n ** BigInt(places);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(places, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function publicCheckinCommitment({ competitionId, meetupWeek, wallet, qualifyingDays, weeklyMetricTotals }) {
  return {
    schema: 'bignuten-streak-checkin/v1',
    competitionId,
    meetupWeek,
    wallet: String(wallet).toLowerCase(),
    qualifyingDays,
    weeklyMetricTotals,
  };
}

export function joinDisclosure(competition, config, asset = { symbol: 'BNUT', decimals: 18 }) {
  const native = String(competition.stakeToken || '').toLowerCase() === '0x0000000000000000000000000000000000000000';
  const tokenAddress = native ? 'ETH (native asset)' : `${asset.symbol} (${competition.stakeToken})`;
  return `Stake: ${formatAmount(competition.stakeAmount, asset.decimals)} ${asset.symbol}${native ? '' : ` · ${tokenAddress}`} (plus network gas).
Rules: ${config.requiredActivityDays} qualifying days, ${config.requiredMeetups} meetups, minimum ${config.minimumWeeklyLogs} qualifying logs per call week; goal: ${config.meetupGoal}.
Rules reference: ${competition.metadataCID || 'No public rules reference; ask the captain before joining.'}
Joining commits your stake: no participant refund withdrawal before settlement. Voluntary forfeit loses your stake. Only captain (contract owner) cancellation refunds non-forfeited entrants, limited to the actual held balance under the current contract. Final settlement is a ranked payout, not an early refund or a guaranteed full-principal return.
Forfeit or failure to complete: no settlement payout. Completion does not guarantee full principal: third place starts with half principal. Remaining pot bonus weights are 3:2:1, plus weight 1 per additional finisher. Integer dust and the entire pot if nobody completes go to treasury.
Self/peer attestations are not medical proof or cryptographic proof of activity. On-chain counts, hashes, wallets and votes are public. Raw activity records stay local unless you separately opt into a wallet-linked public IPFS upload; public copies may persist indefinitely.
Examples in the walkthrough are simulation, not live quotes or final future policy. Check the rules source and deployed contract before joining. Joining below is LIVE, not rehearsal.
Continue to wallet approval and stake?`;
}

export function renderPayoutExamples() {
  return `<table><caption>Simulation only · 100 example BNUT per entrant · no yield or gas included</caption><thead><tr><th scope="col">Entrants</th><th scope="col">Completed</th><th scope="col">Forfeits</th><th scope="col">Exact BNUT payouts by rank</th><th scope="col">Treasury BNUT</th></tr></thead><tbody>${payoutExampleRows().map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
