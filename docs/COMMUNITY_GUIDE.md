# Genie Community Guide

Genie keeps **Health companion** as its default mode. **Community guide** is a
separate mode for challenge guidance, joining, captaining, reviews, disputes,
issue reports, bounties, and data/privacy questions.

## Deterministic tour and challenge coach

The **Offline guide tour** uses the same shared content as the Community Guide
prompt and works without loading a model. It does not connect a wallet, read
health logs, or perform actions.

The read-only challenge coach answers status and meetup questions from public
challenge, entrant, and meetup contract reads. It only uses an already
available `eth_accounts` account; it never requests wallet access. Unavailable
RPC or contract reads are shown as unavailable rather than guessed. Local
health/activity logs are not read by the coach. Links navigate to the Monthly
Challenge button, challenge card, or configured HTTPS call; they never click a
button or submit a transaction.

## Privacy and consent

Community Guide mode excludes health logs, Health companion chat history, and
Genie memory by default. Hosted AI uses a separate permission from Health
companion. That permission covers only the user's message and shared guide
text, and is remembered separately for each hosted provider. Cancel sends
nothing. WebLLM processes guide prompts locally after its model is available;
the first model download requires a network connection. The deterministic tour
and challenge coach require no model.

The coach reads public challenge state, which can include a connected account's
public entrant status. These reads do not inspect local health records. Counts,
wallet addresses, hashes, and review votes already written on-chain are public.
Raw local activity remains local unless the user separately chooses a
wallet-linked public upload in the challenge UI; this guide does not upload or
publish it.

## Challenge policy and capability boundaries

- Each competition captures its own stake terms. Joining locks the captured
  stake until settlement; there is no participant refund withdrawal before
  settlement. Captain cancellation refunds non-forfeited entrants only up to
  the held balance. A payout is not a guaranteed full-principal return.
- Awards are earned only through a successful owner-called settlement.
  Joining, forfeit, and cancellation do not mint awards; incomplete or forfeited
  entrants receive no settlement payout or award.
- Legacy strict ranking breaks ties by verified days, reports, qualification
  time, then join order. Source-only payout-policy version 2 ties equal
  verified-day and report counts; time and join order do not break ties. Treat
  version 2 as active only when the selected contract reports that capability.
- Final receipt anchoring is independently gated by
  `finalReceiptAnchorVersion() == 1`. Source changes do not upgrade Base;
  missing or unreadable capability is unavailable. A receipt hash proves
  document integrity, not the truth of attendance or health claims.
- The planned hydration pilot's 28 qualifying days, four calls, and five weekly
  logs are configuration values, not universal health targets. Follow personal
  care guidance and do not force activity or fluid intake to protect a stake.

See [StreakBet journey and policy boundaries](STREAKBET_JOURNEY.md) and
[deployment evidence](DEPLOYMENTS.md) before relying on any live capability.
Repository source and deployment notes are not live verification.

## Verification

`npm test` includes deterministic content, prompt/privacy separation, and
mock-contract coach tests. `npm run test:smoke` exercises the desktop and mobile
Genie interfaces with local RPC/provider fixtures; it does not connect a real
wallet or send transactions.
