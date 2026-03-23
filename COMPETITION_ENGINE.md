# Competition Engine - BigNuten Vanilla

## 版权声明
MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)

---

## Overview

Competition Engine implements streak/competition logic for BigNuten Vanilla with:

- ✅ Escrow contracts for BNUT/USDC/ETH
- ✅ Joiners deposit to escrow
- ✅ Weekly self-report check-in UI
- ✅ Forfeit mechanism for failed streaks
- ✅ Pot split among finishers
- ✅ Transparent stats tracking

---

## Features

### 1. Escrow System

- **Multi-token Support**: ETH, BNUT, USDC
- **One Pot Per Competition**: Isolated funds
- **Secure Deposits**: Held in contract until completion

### 2. Participation

- **Join Competition**: Deposit entry amount
- **Track Participation**: All deposits recorded
- **Transparent**: All data on-chain

### 3. Check-in System

- **Weekly Check-ins**: Self-report with IPFS proof
- **On-chain + IPFS**: Data posted to chain and IPFS
- **Deadline Enforcement**: Automatic forfeit on miss

### 4. Forfeit Mechanism

- **Automatic Forfeit**: Miss check-in deadline
- **Self-report**: Participants can forfeit
- **Pot Redistribution**: Forfeited funds to winners

### 5. Pot Distribution

- **Split Among Finishers**: Equal distribution
- **Refund Principal**: Surviving entrants get deposit back
- **Claim System**: Manual claim after completion

---

## Contract Architecture

### CompetitionEngine

**Key Functions:**

#### Create Competition
```solidity
function createCompetition(
    address token,
    uint256 entryAmount,
    uint256 duration,
    uint256 checkInInterval
) external returns (uint256)
```

#### Join Competition
```solidity
// For ETH
function joinCompetitionETH(uint256 compId) external payable

// For ERC20
function joinCompetitionToken(uint256 compId, uint256 amount) external
```

#### Check-in
```solidity
function checkIn(uint256 compId, string calldata ipfsHash) external
```

#### Forfeit
```solidity
function forfeit(uint256 compId, address participantAddr) external
```

#### Complete & Claim
```solidity
function completeCompetition(uint256 compId) external
function claimPrize(uint256 compId) external
function withdrawDeposit(uint256 compId) external
```

---

## Usage Guide

### Create Competition

```javascript
// Create ETH competition: 0.1 ETH entry, 4 weeks duration, weekly check-in
await engine.createCompetition(
    address(0), // ETH
    ethers.utils.parseEther("0.1"),
    4 * 7 * 24 * 60 * 60, // 4 weeks
    7 * 24 * 60 * 60 // 1 week check-in interval
);
```

### Join Competition

```javascript
// Join with ETH
await engine.joinCompetitionETH(compId, {
    value: ethers.utils.parseEther("0.1")
});

// Join with ERC20 (e.g., BNUT)
await token.approve(engine.address, entryAmount);
await engine.joinCompetitionToken(compId, entryAmount);
```

### Weekly Check-in

```javascript
// Upload proof to IPFS, get hash
const ipfsHash = await uploadToIPFS(screenshot);

// Check in
await engine.checkIn(compId, ipfsHash);
```

### Complete & Claim

```javascript
// After competition ends
await engine.completeCompetition(compId);

// Claim prize (deposit + share of forfeited pot)
await engine.claimPrize(compId);

// Or just withdraw deposit (if you survived)
await engine.withdrawDeposit(compId);
```

---

## State Variables

```solidity
struct Competition {
    uint256 id;
    address creator;
    address token; // 0 for ETH
    uint256 entryAmount;
    uint256 startTime;
    uint256 endTime;
    uint256 checkInInterval;
    uint256 totalPot;
    uint256 finishers;
    bool active;
    bool completed;
}

struct Participant {
    address participant;
    uint256 depositAmount;
    uint256 joinTime;
    bool checkedIn;
    uint256 lastCheckIn;
    bool forfeited;
    bool claimed;
}

struct CheckIn {
    address participant;
    uint256 timestamp;
    string ipfsHash;
}
```

---

## Events

```solidity
event CompetitionCreated(uint256 indexed compId, address creator, uint256 entryAmount);
event ParticipantJoined(uint256 indexed compId, address participant, uint256 amount);
event CheckInPosted(uint256 indexed compId, address participant, string ipfsHash);
event ParticipantForfeited(uint256 indexed compId, address participant);
event CompetitionCompleted(uint256 indexed compId, uint256 finishers, uint256 potPerFinisher);
event PotClaimed(uint256 indexed compId, address participant, uint256 amount);
event DepositWithdrawn(uint256 indexed compId, address participant, uint256 amount);
```

---

## Example Flow

### Week 1: Create & Join

1. Creator creates competition (0.1 ETH, 4 weeks)
2. 10 participants join (1 ETH total pot)
3. Everyone deposits 0.1 ETH to escrow

### Week 2-4: Check-ins

1. Weekly check-in deadline
2. Participants upload proof to IPFS
3. Post IPFS hash to contract
4. Miss deadline → forfeit

### Week 5: Completion

1. Competition ends
2. 7 participants survived (3 forfeited)
3. Total pot: 1 ETH
4. Each finisher gets: 1 ETH / 7 = 0.1428 ETH
5. Principal refund: 0.1 ETH
6. Total per finisher: 0.2428 ETH

---

## Gas Optimization

### Current Implementation

- Create: ~150k gas
- Join: ~100k gas
- Check-in: ~50k gas
- Complete: ~200k gas (depends on participants)
- Claim: ~50k gas

### Optimization Opportunities

1. **Merkle Proofs**: For participant verification
2. **Batch Operations**: Multiple check-ins in one tx
3. **Layer 2**: Deploy on L2 for lower fees

---

## Security Considerations

### Fund Safety

- ✅ Funds held in contract
- ✅ Only finishers can claim
- ✅ No admin access to funds
- ✅ Transparent distribution

### Check-in Integrity

- ✅ IPFS hash for proof
- ✅ On-chain timestamp
- ✅ Deadline enforcement
- ✅ Automatic forfeit

### Reentrancy

- ✅ Checks-Effects-Interactions pattern
- ✅ Non-reentrant claim functions
- ✅ State updates before transfers

---

## Testing

### Run Tests

```bash
# Install dependencies
npm install

# Run tests
npx hardhat test test/CompetitionEngine.test.js
```

### Test Coverage

- ✅ Create competition
- ✅ Join with ETH
- ✅ Join with ERC20
- ✅ Check-in functionality
- ✅ Forfeit mechanism
- ✅ Competition completion
- ✅ Prize claim
- ✅ Deposit withdrawal
- ✅ Stats queries

---

## Deployment

### Network Configuration

Update `hardhat.config.js` with your networks.

### Deploy

```bash
# Mainnet
npx hardhat run scripts/deploy.js --network mainnet

# Polygon
npx hardhat run scripts/deploy.js --network polygon
```

---

## Future Enhancements

- [ ] Multi-tier competitions (bronze/silver/gold)
- [ ] Automated check-in reminders
- [ ] Social sharing integration
- [ ] Leaderboard system
- [ ] NFT badges for finishers
- [ ] Partial forfeit (percentage based)
- [ ] Team competitions

---

## Acceptance Criteria

- [x] Escrow contracts for BNUT/USDC/ETH
- [x] Joiners deposit to escrow
- [x] Weekly self-report check-in UI pattern
- [x] Data posted to chain and IPFS
- [x] Forfeit mechanism for failed streaks
- [x] Pot split among finishers
- [x] Refund principal to surviving entrants
- [x] Complete stats tracking
- [x] Transparent joins/failures tracking

---

## References

- [BigNuten Vanilla](https://github.com/TheJollyLaMa/BigNuten_Vanilla)
- [IPFS Documentation](https://docs.ipfs.io/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)

---

**Author**: 小米辣 (PM + Dev) 🌶️  
**Date**: 2026-03-23  
**Version**: 1.0.0  
**License**: MIT

---

*🌰 Long live the chestnut overlords! 🌰*
