# Competition achievement awards

BigNuten uses the already configured DecentNFT ERC-1155 Achievement lane. This
feature does not deploy another NFT contract or change the competition's stake,
placement, or payout policy.

## Metadata and token IDs

Each competition uses a fresh group of four DecentNFT token IDs:

| Role | Meaning |
|---|---|
| `completion` | One token for each entrant that completed the challenge |
| `first` | Additional token for the first-place completer |
| `second` | Additional token for the second-place completer |
| `third` | Additional token for the third-place completer |

`js/competitionAwards.mjs` exports `buildCompetitionAwardMetadata(input)`. It
returns four ERC-1155 JSON metadata records named `<tokenId>.json`. Each record
includes the competition ID and name, group, creator, stake token and amount,
duration and dates, structured public rules, the DecentNFT and escrow addresses,
and an IPFS rules URI when provided. The fixed payout description mirrors
`StreakBetEscrow`; it is not editable through a template. The configured
competition token must be a nonzero ERC-20 address matching the stake token
configured for the local deployment input; native-token competitions are not
supported by this award path.

The helper only accepts an allowlisted, structured input. Participant records,
progress reports, daily health values, notes, and arbitrary extra fields are
rejected rather than copied into metadata. `rulesCID` must be an `ipfs://` URI.
The competition group is descriptive metadata, and the rules URI should match
the public rules CID referenced by the competition. Participant report and
leaderboard CIDs are intentionally not included.
The metadata builder and optional panel are local-only: they do not call
`fetch`, upload files, or send transactions. The preview panel is mounted with
`mountCompetitionAwardsPanel(root, { storage })`; it can be attached to a
separate awards/template region by the host app.

`createCompetitionAwardTokenIdRange(firstTokenId, reservedTokenIds)` creates
the four consecutive IDs after an administrator has obtained the actual
DecentNFT `nextTokenId`. Pass previously registered IDs as `reservedTokenIds`
to catch accidental reuse. The helper does not query the chain or reserve IDs.
Input timestamps are Unix seconds and `stakeAmount` is an exact decimal string.
The following example is synthetic and for local preview only:

```json
{
  "competition": {
    "id": 7,
    "name": "Monthly Hydration",
    "groupName": "Local Group",
    "creator": "0x1111111111111111111111111111111111111111",
    "stakeToken": {
      "address": "0x4444444444444444444444444444444444444444",
      "symbol": "BNUT",
      "decimals": 18
    },
    "stakeAmount": "10",
    "startTime": 1798000000,
    "endTime": 1800600000,
    "rules": {
      "schema": "bignuten-streak-rules/v1",
      "metrics": [
        { "id": "water", "type": "hydration", "cadence": "daily", "target": 5 }
      ],
      "requiredActivityDays": 24
    },
    "rulesCID": "ipfs://bafylocalrules"
  },
  "deployment": {
    "chainId": 31337,
    "nftAddress": "0x3333333333333333333333333333333333333333",
    "escrowAddress": "0x2222222222222222222222222222222222222222",
    "stakeTokenAddress": "0x4444444444444444444444444444444444444444"
  },
  "awardTokenIds": {
    "completion": "40",
    "first": "41",
    "second": "42",
    "third": "43"
  },
  "reservedTokenIds": ["0", "1", "2", "3"]
}
```

Replace the sample values with confirmed competition/deployment configuration
before previewing. `rulesCID` must refer to a reviewed, public rules document;
the helper does not fetch or verify a CID.

## Templates and repeat competitions

Templates use the browser's local storage key
`bignuten.competition-award-templates.v1`. They retain only the reusable public
configuration (title, group, duration, stake token and amount, structured
rules, and optional rules CID). A template does not store a competition ID,
creator, dates, contract addresses, or award token IDs. Applying a template
requires fresh competition identity, dates, deployment addresses, and a fresh,
unused four-token range. Duplicate template names are rejected; malformed
stored JSON is reported as an error rather than silently replaced.

Templates are device-local and are not synchronized. Do not put personal
records, health data, or private notes in competition titles, group names, or
public rules.

The optional local per-competition lookup uses
`bignuten.competition-award-metadata.v1`. Call
`saveCompetitionAwardMetadata(storage, input)` after preparing the batch to
persist a validated record in that browser. `getCompetitionAwardMetadata`
accepts `{ competitionId, chainId, escrowAddress }` and returns `null` or:

```js
{
  schema: 'bignuten-competition-award-record/v1',
  competitionId: '7',
  chainId: 8453,
  escrowAddress: '0x…',
  achievementContractAddress: '0x…',
  awardTokenIds: {
    completion: '40',
    first: '41',
    second: '42',
    third: '43'
  },
  records: [
    { role: 'completion', tokenId: '40', fileName: '40.json', metadata: {} }
  ]
}
```

In the full result, `records` contains all four entries. Re-saving identical
metadata is idempotent; changed metadata for an existing competition or token
IDs already assigned to a locally saved competition are rejected. The helper
validates saved data when reading it and regenerates the JSON from the
allowlisted input. This lookup survives a browser restart while that browser's
local storage remains intact, but it is not synchronized or an on-chain source
of truth. Results should prefer confirmed mint logs and the registered
DecentNFT URI.

## Registration and actual award behavior

Before creating a competition (which opens its enrollment window), prepare,
review, publish, and register all four public Achievement metadata definitions
and IDs in the existing DecentNFT. Grant the StreakBet escrow `MINTER_ROLE` and
call `setStreakAwards` with that unique registered range before creating the
competition; then configure the challenge before entrants join. The contract
does not issue an enrollment token. `StreakBetEscrow` copies the configured NFT
address and IDs into that challenge's private configuration; changing the
global selection later does not replace the earlier challenge's award set. The
current contract exposes no public getter for that private snapshot.

The DecentNFT collection URI is global to the existing collection. Keep its
current shared `collection.json`; put competition-specific content in the four
numbered token metadata files, not a per-competition collection document.

Registration makes the definitions and token IDs available; it does **not**
mint an award to an entrant. Creation and joining issue no awards, and neither
does a voluntary forfeit or cancellation. Only successful owner-called
settlement mints awards: every completed entrant receives one completion token,
and eligible completed entrants receive the place award associated with their
settlement rank. Entrants still incomplete at settlement receive no awards;
cancellation refunds non-forfeited entrants and mints no awards. If no one
completes, the pot goes to the configured treasury and no awards are minted. A
mint failure reverts the entire settlement transaction, including its payouts
and status changes, so an administrator can correct the configuration and
retry.

The source-only payout-policy version 2 gives the first, second, and third
competition-place awards to every completed entrant sharing those places.
Equal verified activity-day and submitted-report counts tie; qualification time
and join index never break those ties. Shared competition ranks skip occupied
places, so two tied seconds both receive the second-place award, not the
third-place award. Other completed entrants receive no place award, but all
completed entrants receive the completion award.

Each tied group pools the starting principal refunds and bonus shares of its
occupied slots, then receives an equal integer split. The existing economic
model remains: full principal except the occupied third-place slot starts with
half principal; bonus weights are 3:2:1 for the first three slots and 1 for
each later slot. Forfeits stay in the global bonus pool; each occupied-slot
bonus is floored using the original global denominator; split remainder and
other dust go to treasury. This source behavior applies only where the
read-only payout-policy capability reports version 2. Deployed contracts
without that capability preserve strict legacy ranking.

Public metadata still needs to be deliberately published and the IDs registered
through the existing, separately authorized deployment workflow. This feature
does not upload metadata, deploy contracts, sign wallet requests, or perform
mainnet/testnet configuration.
