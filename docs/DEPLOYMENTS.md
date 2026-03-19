# BigNuten Contract Deployments

All deployed contracts on **Optimism Mainnet** (Chain ID: 10).

---

## BigNutenTreasury.sol

| Field            | Value                                                                                                      |
|------------------|------------------------------------------------------------------------------------------------------------|
| **Address**      | [`0x143cC41AC075FFA40be1993827DA6ffB4638A363`](https://optimistic.etherscan.io/address/0x143cC41AC075FFA40be1993827DA6ffB4638A363) |
| **Network**      | Optimism Mainnet                                                                                           |
| **Deployed by**  | `@TheJollyLaMa`                                                                                            |
| **Deploy date**  | 2026-03-19                                                                                                 |
| **Constructor**  | `_token = 0x733c4d2Aae900E608147dd89Fa93606f89722823` (BNUT), `initialOwner = deployer wallet`            |
| **Etherscan**    | https://optimistic.etherscan.io/address/0x143cC41AC075FFA40be1993827DA6ffB4638A363                        |

### Funding / Mint Steps

1. **Mint $BNUT to yourself** — In the Admin Panel → Treasury → ⚡ Quick Mint (Admin), enter your wallet address, amount, and reason. Caller must hold `MINTER_ROLE` on the $BNUT contract.
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
3. **Settle Payroll** — Open Admin Panel → Payroll, connect MetaMask as owner, click "Settle All Pending". Entries move from `pending[]` to `settled[]` in `payroll-queue.json` and `totalPaid[wallet]` increments on-chain.

---

## $BNUT ERC-20 Token

| Field       | Value                                                                                                             |
|-------------|-------------------------------------------------------------------------------------------------------------------|
| **Address** | [`0x733c4d2Aae900E608147dd89Fa93606f89722823`](https://optimistic.etherscan.io/address/0x733c4d2Aae900E608147dd89Fa93606f89722823) |
| **Symbol**  | BNUT                                                                                                              |
| **Decimals**| 18                                                                                                                |
| **Max supply** | 1,000,000,000 BNUT                                                                                             |
| **Network** | Optimism Mainnet                                                                                                  |

---

## BigNutenGovernance

| Field       | Value                                                                                                             |
|-------------|-------------------------------------------------------------------------------------------------------------------|
| **Address** | [`0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD`](https://optimistic.etherscan.io/address/0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD) |
| **Network** | Optimism Mainnet                                                                                                  |

---

## DecentEscrow (BigNutenEscrow)

| Field       | Value                                                                                                             |
|-------------|-------------------------------------------------------------------------------------------------------------------|
| **Address** | [`0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e`](https://optimistic.etherscan.io/address/0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e) |
| **Version** | v0.1                                                                                                              |
| **Network** | Optimism Mainnet                                                                                                  |
| **Plans**   | Plan 0 = ETH monthly, Plan 1 = $BNUT discounted monthly                                                          |
