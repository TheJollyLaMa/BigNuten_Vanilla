import { payoutExampleRows, tiedPayoutExampleRows } from './streakPayouts.mjs';
import { usesRankedTiePayouts } from './streakPayoutPolicy.mjs';

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

export function joinDisclosure(competition, config, asset = { symbol: 'BNUT', decimals: 18 }, payoutPolicyVersion = 1) {
  const native = String(competition.stakeToken || '').toLowerCase() === '0x0000000000000000000000000000000000000000';
  const tokenAddress = native ? 'ETH (native asset)' : `${asset.symbol} (${competition.stakeToken})`;
  const payoutDisclosure = usesRankedTiePayouts(payoutPolicyVersion)
    ? 'Ranked-tie policy version 2: equal verified qualifying activity days and submitted-report counts share competition rank and split the occupied-place payout pool equally. Qualification time and join order do not break ties; later ranks skip tied places. This policy applies only when the selected contract reports payout-policy version 2.'
    : 'Legacy strict-ranking policy: verified activity days rank first, then submitted reports, qualification time and join order break remaining ties. The selected contract does not report ranked-tie payout-policy version 2.';
  return `Stake: ${formatAmount(competition.stakeAmount, asset.decimals)} ${asset.symbol}${native ? '' : ` · ${tokenAddress}`} (plus network gas).
Rules: ${config.requiredActivityDays} qualifying days, ${config.requiredMeetups} meetups, minimum ${config.minimumWeeklyLogs} qualifying logs per call week; goal: ${config.meetupGoal}.
Rules reference: ${competition.metadataCID || 'No public rules reference; ask the captain before joining.'}
Joining commits your stake: no participant refund withdrawal before settlement. Voluntary forfeit loses your stake. Only captain (contract owner) cancellation refunds non-forfeited entrants, limited to the actual held balance under the current contract. Final settlement is a ranked payout, not an early refund or a guaranteed full-principal return.
Forfeit or failure to complete: no settlement payout. Completion does not guarantee full principal: the occupied third-place slot starts with half principal. Remaining pot bonus weights are 3:2:1, plus weight 1 per additional finisher. ${payoutDisclosure} Integer dust and the entire pot if nobody completes go to treasury.
Self/peer attestations are not medical proof or cryptographic proof of activity. On-chain counts, hashes, wallets and votes are public. Raw activity records stay local unless you separately opt into a wallet-linked public IPFS upload; public copies may persist indefinitely.
Examples in the walkthrough are simulation, not live quotes or final future policy. Check the rules source and deployed contract before joining. Joining below is LIVE, not rehearsal.
Continue to wallet approval and stake?`;
}

export function renderPayoutExamples() {
  const table = (caption, headers, rows) =>
    `<table><caption>${caption}</caption><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `${table(
    'Legacy strict-ranking simulation only · 100 example BNUT per entrant · no yield or gas included',
    ['Entrants', 'Completed', 'Forfeits', 'Exact BNUT payouts by rank', 'Treasury BNUT'],
    payoutExampleRows(),
  )}<p>Source-only ranked-tie policy version 2 examples. These do not describe the currently configured legacy contract; tied members share occupied-place payouts equally when the selected contract reports payout-policy version 2.</p>${table(
    'Source-only ranked-tie simulation · 100 example BNUT per entrant · no yield or gas included',
    ['Entrants', 'Verified days / reports by entrant', 'Payout by shared place', 'Treasury BNUT'],
    tiedPayoutExampleRows(),
  )}`;
}
