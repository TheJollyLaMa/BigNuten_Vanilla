import { formatBnut, payoutExampleRows } from './streakPayouts.mjs';

export function joinDisclosure(competition, config) {
  return `Stake: ${formatBnut(competition.stakeAmount)} BNUT (plus Base ETH gas).
Rules: ${config.requiredActivityDays} qualifying days, ${config.requiredMeetups} meetups, minimum ${config.minimumWeeklyLogs} qualifying logs per call week; goal: ${config.meetupGoal}.
Rules reference: ${competition.metadataCID || 'No public rules reference; ask the captain before joining.'}
Forfeit or failure to complete: no settlement payout. Completion does not guarantee full principal: third place starts with half principal. Remaining pot bonus weights are 3:2:1, plus weight 1 per additional finisher. Integer dust and the entire pot if nobody completes go to treasury.
Self/peer attestations are not medical proof or cryptographic proof of activity. On-chain counts, hashes, wallets and votes are public. Publishing detailed health stats to public IPFS is optional and may persist indefinitely.
Examples in the walkthrough are simulation, not live quotes or final future policy. Check the rules source and deployed contract before joining. Joining below is LIVE, not rehearsal.
Continue to wallet approval and stake?`;
}

export function renderPayoutExamples() {
  return `<table><caption>Simulation only · 100 example BNUT per entrant · no yield or gas included</caption><thead><tr><th scope="col">Entrants</th><th scope="col">Completed</th><th scope="col">Forfeits</th><th scope="col">Exact BNUT payouts by rank</th><th scope="col">Treasury BNUT</th></tr></thead><tbody>${payoutExampleRows().map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
