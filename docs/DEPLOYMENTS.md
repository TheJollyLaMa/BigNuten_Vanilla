# BigNuten Contract Deployments

BigNuten now defaults to **Base Mainnet** (Chain ID `8453`) for the live BNUT token. Existing non-token production deployments remain on **Optimism Mainnet** (Chain ID `10`) as the current fallback network until Base replacements are deployed.

---

## Base Mainnet (default)

### $BNUT ERC-20 Token

| Field | Value |
|---|---|
| **Address** | [`0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736`](https://basescan.org/token/0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736) |
| **Symbol** | BNUT |
| **Decimals** | 18 |
| **Max supply** | 1,000,000,000 BNUT |
| **Network** | Base Mainnet |
| **Explorer** | https://basescan.org/token/0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736 |

### Base deployment status

The Base BNUT token is already deployed. BigNutenTreasury, BigNutenGov,
BigNutenNetworkRegistry, StreakBetEscrow, DecentNFT, and DecentEscrow are
prepared but not yet deployed; their app addresses remain unset. StreakBetEscrow
is the single reusable engine for water, nutrition, exercise, weight, and future
meetup challenges. Aave is optional and can be configured later.

The production deployment command is Base-only:

```sh
npm run deploy:base
```

It preflights chain ID `8453`, reuses the existing Base BNUT token, deploys the
contracts listed above, and writes `deployments/base.json`. Aave is intentionally
left blank in `.env` for this cycle, but StreakBetEscrow deploys with Aave
disabled; a later issue can configure the pool and yield strategy.

The first monthly activity challenge uses this shared contract: 28 qualifying
app-tracked days in a 30-day period plus four peer-approved weekly meetups. The
captain schedules each one-hour call and reveals its committed invite code
during the call. Attendees self-check in, attest to the shared meetup goal, and
peers approve or reject attendance. Logs are local and peer-reviewed, not
cryptographically verified. Rejection disqualifies that entrant. Completed
participants receive reusable achievement DNFTs and BNUT payouts: forfeits are
shared by leaderboard weights 3:2:1; third place starts with half principal.
This is deterministic leaderboard settlement, not a random lottery. The stake
is an exact BNUT amount because no liquid BNUT/USD market exists for an
automatic $5 quote.

Before creating a challenge, publish metadata, register four unlimited-supply
Achievement IDs, grant `MINTER_ROLE` to StreakBetEscrow, and call
`setStreakAwards`. The captain then creates a generic competition and configures
its habit type, activity threshold, peer meetup count, and meetup goal. DecentNFT
may deploy with a blank base URI; its award IDs cannot be registered until
metadata URIs are set. Pinata/local-IPFS/community-node publishing is documented
in `docs/BIGNUTEN_STORAGE.md`.

Base Aave supports USDC but not BNUT, and no BNUT/USDC pool was found during
preparation. Therefore the pilot does not swap or earn Aave yield; conversion,
yield, and borrowing need a separately reviewed strategy after a liquid pool
exists. The deployment script does not fund router allocations or configure
community registry roles automatically.

The shared Settlements Router is already deployed on Base at
`0x8ecca903e2a6Daa8CCbB933700e4F2C58C44A4B5`. The planned
`BigNutenNetworkRegistry` will use the `bignuten-data-rewards` fund for
verifiable community pinning rewards. Its address remains unset until the Base
migration deployment is performed.

Until those deployments exist, the app keeps the corresponding UI flows disabled
or read-only on Base. The legacy Optimism addresses below remain for historical
reference and recovery planning; they are not part of the new-user flow.

---

## Optimism Mainnet (fallback / legacy)

### BigNutenTreasury.sol

| Field | Value |
|---|---|
| **Address** | [`0x143cC41AC075FFA40be1993827DA6ffB4638A363`](https://optimistic.etherscan.io/address/0x143cC41AC075FFA40be1993827DA6ffB4638A363) |
| **Network** | Optimism Mainnet |
| **Deployed by** | `@TheJollyLaMa` |
| **Deploy date** | 2026-03-19 |
| **Constructor** | `_token = 0x733c4d2Aae900E608147dd89Fa93606f89722823` (Optimism BNUT), `initialOwner = deployer wallet` |
| **Explorer** | https://optimistic.etherscan.io/address/0x143cC41AC075FFA40be1993827DA6ffB4638A363 |

#### Funding / Mint Steps

1. **Mint $BNUT to yourself** — In the Admin Panel → Treasury → ⚡ Quick Mint (Admin), enter your wallet address, amount, and reason. Caller must hold `MINTER_ROLE` on the Optimism BNUT contract.
2. **Transfer $BNUT into the Treasury** — After minting, send the tokens to the treasury address:
   ```bash
   cast send $BNUT_ADDRESS \
     "transfer(address,uint256)" \
     0x143cC41AC075FFA40be1993827DA6ffB4638A363 \
     <amount_in_wei> \
     --private-key $PRIVATE_KEY \
     --rpc-url https://mainnet.optimism.io
   # 1 BNUT = 1000000000000000000 wei  (18 decimals)
   ```
3. **Settle Payroll** — Open Admin Panel → Payroll, switch the app network dropdown to Optimism, connect MetaMask as owner, and click **Settle All Pending**.

### $BNUT ERC-20 Token

| Field | Value |
|---|---|
| **Address** | [`0x733c4d2Aae900E608147dd89Fa93606f89722823`](https://optimistic.etherscan.io/token/0x733c4d2Aae900E608147dd89Fa93606f89722823) |
| **Symbol** | BNUT |
| **Decimals** | 18 |
| **Max supply** | 1,000,000,000 BNUT |
| **Network** | Optimism Mainnet |

### BigNutenGovernance

| Field | Value |
|---|---|
| **Address** | [`0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD`](https://optimistic.etherscan.io/address/0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD) |
| **Network** | Optimism Mainnet |

### DecentEscrow (BigNutenEscrow)

| Field | Value |
|---|---|
| **Address** | [`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) |
| **Version** | v0.1 |
| **Network** | Optimism Mainnet |
| **Plans** | Plan 0 = ETH monthly, Plan 1 = $BNUT discounted monthly |

### StreakBetEscrow

| Field | Value |
|---|---|
| **Address** | [`0x80f6492eFD6D27c877B2bd0936451f7AF61c7215`](https://optimistic.etherscan.io/address/0x80f6492eFD6D27c877B2bd0936451f7AF61c7215) |
| **Network** | Optimism Mainnet |
