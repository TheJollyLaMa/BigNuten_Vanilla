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

### Base deployment status for other app contracts

The following Base Mainnet addresses are **not yet known** and are intentionally left unset in `js/contracts.js`:

- `BigNutenTreasury`
- `BigNutenGovernance`
- `DecentEscrow`
- `DecentNFT`
- `StreakBetEscrow`
- `USDC`
- `Aave V3 Pool`
- `Alchemix V2`

Until those deployments exist, the app keeps the corresponding UI flows disabled or read-only on Base and exposes the legacy Optimism deployment through the network dropdown.

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
