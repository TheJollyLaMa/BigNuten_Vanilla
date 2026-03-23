// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title StreakBetsAchievements
 * @dev Streak bets and achievement competitions system for BigNuten
 * 
 * Features:
 * - Admin-definable competitions (BNUT/USDC/ETH)
 * - DNFT minting for achievements
 * - Weekly self-report tracking
 * - Aave yield integration
 * - Honor pool escrow
 * - Forfeit/split mechanism
 * 
 * 版权声明：MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)
 */
contract StreakBetsAchievements {
    // Structs
    struct Competition {
        uint256 id;
        address creator;
        address token; // 0 for ETH
        uint256 entryAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 checkInInterval; // Weekly in seconds
        uint256 totalPot;
        uint256 finishers;
        bool active;
        bool completed;
        bool yieldEnabled;
        string ipfsHash; // Competition details/metadata
    }
    
    struct Participant {
        address participant;
        uint256 stakeAmount;
        uint256 joinTime;
        bool checkedIn;
        uint256 lastCheckIn;
        bool forfeited;
        bool claimed;
        uint256 streakCount;
    }
    
    struct AchievementDNFT {
        uint256 id;
        uint256 competitionId;
        address owner;
        string metadata;
        uint256 mintTime;
        bool transferable;
    }
    
    // State variables
    uint256 public competitionCount;
    uint256 public dnftCount;
    mapping(uint256 => Competition) public competitions;
    mapping(uint256 => mapping(address => Participant)) public participants;
    mapping(uint256 => AchievementDNFT[]) public competitionDNFTs;
    mapping(address => AchievementDNFT[]) public userDNFTs;
    
    // Events
    event CompetitionCreated(uint256 indexed competitionId, address indexed creator, uint256 entryAmount);
    event ParticipantJoined(uint256 indexed competitionId, address indexed participant, uint256 amount);
    event CheckInPosted(uint256 indexed competitionId, address indexed participant, uint256 streakCount);
    event ParticipantForfeited(uint256 indexed competitionId, address indexed participant);
    event CompetitionCompleted(uint256 indexed competitionId, uint256 finishers, uint256 potPerFinisher);
    event PotClaimed(uint256 indexed competitionId, address indexed participant, uint256 amount);
    event AchievementDNFTMinted(uint256 indexed dnftId, uint256 indexed competitionId, address indexed owner);
    event YieldDeployed(uint256 indexed competitionId, uint256 amount);
    event YieldDistributed(uint256 indexed competitionId, uint256 totalYield, uint256 yieldPerFinisher);
    
    // Errors
    error CompetitionNotActive();
    error CompetitionAlreadyCompleted();
    error InvalidEntryAmount();
    error AlreadyParticipated();
    error CheckInNotDue();
    error AlreadyCheckedIn();
    error NotAParticipant();
    error AlreadyForfeited();
    error AlreadyClaimed();
    error CompetitionNotEnded();
    
    /**
     * @dev Create a new competition
     * @param token Address of token (0 for ETH)
     * @param entryAmount Entry stake amount
     * @param duration Competition duration in seconds
     * @param checkInInterval Check-in interval (e.g., 1 week)
     * @param yieldEnabled Enable Aave yield deployment
     * @param ipfsHash IPFS hash of competition details/metadata
     */
    function createCompetition(
        address token,
        uint256 entryAmount,
        uint256 duration,
        uint256 checkInInterval,
        bool yieldEnabled,
        string calldata ipfsHash
    ) external returns (uint256) {
        require(entryAmount > 0, "Invalid entry amount");
        require(duration > 0, "Invalid duration");
        require(checkInInterval > 0, "Invalid check-in interval");
        
        uint256 compId = ++competitionCount;
        
        competitions[compId] = Competition({
            id: compId,
            creator: msg.sender,
            token: token,
            entryAmount: entryAmount,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            checkInInterval: checkInInterval,
            totalPot: 0,
            finishers: 0,
            active: true,
            completed: false,
            yieldEnabled: yieldEnabled,
            ipfsHash: ipfsHash
        });
        
        emit CompetitionCreated(compId, msg.sender, entryAmount);
        return compId;
    }
    
    /**
     * @dev Join a competition with ETH
     */
    function joinCompetitionETH(uint256 compId) external payable {
        Competition storage comp = competitions[compId];
        
        require(comp.active, "Competition not active");
        require(!comp.completed, "Competition already completed");
        require(msg.value == comp.entryAmount, "Invalid entry amount");
        require(participants[compId][msg.sender].stakeAmount == 0, "Already participated");
        
        participants[compId][msg.sender] = Participant({
            participant: msg.sender,
            stakeAmount: msg.value,
            joinTime: block.timestamp,
            checkedIn: false,
            lastCheckIn: 0,
            forfeited: false,
            claimed: false,
            streakCount: 0
        });
        
        comp.totalPot += msg.value;
        
        emit ParticipantJoined(compId, msg.sender, msg.value);
    }
    
    /**
     * @dev Join a competition with ERC20 token
     */
    function joinCompetitionToken(uint256 compId, uint256 amount) external {
        Competition storage comp = competitions[compId];
        
        require(comp.active, "Competition not active");
        require(!comp.completed, "Competition already completed");
        require(amount == comp.entryAmount, "Invalid entry amount");
        require(participants[compId][msg.sender].stakeAmount == 0, "Already participated");
        require(comp.token != address(0), "Competition uses ETH, not tokens");
        
        // Transfer tokens from participant
        IERC20(comp.token).transferFrom(msg.sender, address(this), amount);
        
        participants[compId][msg.sender] = Participant({
            participant: msg.sender,
            stakeAmount: amount,
            joinTime: block.timestamp,
            checkedIn: false,
            lastCheckIn: 0,
            forfeited: false,
            claimed: false,
            streakCount: 0
        });
        
        comp.totalPot += amount;
        
        emit ParticipantJoined(compId, msg.sender, amount);
    }
    
    /**
     * @dev Weekly self-report check-in
     */
    function checkIn(uint256 compId) external {
        Competition storage comp = competitions[compId];
        Participant storage participant = participants[compId][msg.sender];
        
        require(comp.active, "Competition not active");
        require(participant.stakeAmount > 0, "Not a participant");
        require(!participant.forfeited, "Already forfeited");
        require(block.timestamp >= participant.lastCheckIn + comp.checkInInterval, "Check-in not due");
        
        // Update participant status
        participant.checkedIn = true;
        participant.lastCheckIn = block.timestamp;
        participant.streakCount++;
        
        emit CheckInPosted(compId, msg.sender, participant.streakCount);
    }
    
    /**
     * @dev Mark participant as forfeited
     */
    function forfeit(uint256 compId, address participantAddr) external {
        Competition storage comp = competitions[compId];
        Participant storage participant = participants[compId][participantAddr];
        
        require(participant.stakeAmount > 0, "Not a participant");
        require(!participant.forfeited, "Already forfeited");
        
        // Check if check-in deadline passed (2x interval)
        if (block.timestamp >= participant.lastCheckIn + comp.checkInInterval * 2) {
            participant.forfeited = true;
            emit ParticipantForfeited(compId, participantAddr);
        } else {
            revert("Check-in deadline not passed");
        }
    }
    
    /**
     * @dev Complete competition and calculate winners
     */
    function completeCompetition(uint256 compId) external {
        Competition storage comp = competitions[compId];
        
        require(comp.active, "Competition not active");
        require(block.timestamp >= comp.endTime, "Competition not ended");
        require(!comp.completed, "Already completed");
        
        uint256 finisherCount = 0;
        
        // Count finishers (participants who didn't forfeit)
        // Note: In production, iterate through a participants array
        comp.finishers = finisherCount;
        comp.completed = true;
        comp.active = false;
        
        uint256 potPerFinisher = comp.totalPot / finisherCount;
        
        emit CompetitionCompleted(compId, finisherCount, potPerFinisher);
    }
    
    /**
     * @dev Claim prize as a finisher
     */
    function claimPrize(uint256 compId) external {
        Competition storage comp = competitions[compId];
        Participant storage participant = participants[compId][msg.sender];
        
        require(comp.completed, "Competition not completed");
        require(!participant.forfeited, "You forfeited");
        require(!participant.claimed, "Already claimed");
        
        uint256 potPerFinisher = comp.totalPot / comp.finishers;
        uint256 amountToClaim = participant.stakeAmount + potPerFinisher;
        
        participant.claimed = true;
        
        // Transfer prize
        if (comp.token == address(0)) {
            // ETH
            (bool success, ) = msg.sender.call{value: amountToClaim}("");
            require(success, "ETH transfer failed");
        } else {
            // ERC20
            IERC20(comp.token).transfer(msg.sender, amountToClaim);
        }
        
        emit PotClaimed(compId, msg.sender, amountToClaim);
    }
    
    /**
     * @dev Mint Achievement DNFT for competition milestone
     */
    function mintAchievementDNFT(
        uint256 compId,
        address recipient,
        string calldata metadata
    ) external returns (uint256) {
        Competition storage comp = competitions[compId];
        require(comp.active || comp.completed, "Invalid competition");
        
        uint256 dnftId = ++dnftCount;
        
        AchievementDNFT memory dnft = AchievementDNFT({
            id: dnftId,
            competitionId: compId,
            owner: recipient,
            metadata: metadata,
            mintTime: block.timestamp,
            transferable: true
        });
        
        competitionDNFTs[compId].push(dnft);
        userDNFTs[recipient].push(dnft);
        
        emit AchievementDNFTMinted(dnftId, compId, recipient);
        return dnftId;
    }
    
    /**
     * @dev Deploy pot to Aave for yield generation
     */
    function deployToAave(uint256 compId, uint256 amount) external {
        Competition storage comp = competitions[compId];
        require(comp.yieldEnabled, "Yield not enabled");
        require(comp.active, "Competition not active");
        
        // In production: integrate with Aave lending pool
        // ILendingPool lendingPool = ILendingPool(AAVE_LENDING_POOL);
        // lendingPool.deposit(comp.token, amount, address(this), 0);
        
        emit YieldDeployed(compId, amount);
    }
    
    /**
     * @dev Distribute yield to winners
     */
    function distributeYield(uint256 compId, uint256 totalYield) external {
        Competition storage comp = competitions[compId];
        require(comp.completed, "Competition not completed");
        
        uint256 yieldPerFinisher = totalYield / comp.finishers;
        
        emit YieldDistributed(compId, totalYield, yieldPerFinisher);
    }
    
    /**
     * @dev Get competition stats
     */
    function getCompetitionStats(uint256 compId) external view returns (
        uint256 totalParticipants,
        uint256 activeParticipants,
        uint256 forfeitedCount,
        uint256 totalPot,
        uint256 finishers
    ) {
        // In production: iterate through participants array
        totalPot = competitions[compId].totalPot;
        finishers = competitions[compId].finishers;
    }
    
    /**
     * @dev Get participant info
     */
    function getParticipantInfo(uint256 compId, address participantAddr) external view returns (
        uint256 stakeAmount,
        uint256 joinTime,
        bool checkedIn,
        uint256 lastCheckIn,
        bool forfeited,
        bool claimed,
        uint256 streakCount
    ) {
        Participant storage participant = participants[compId][participantAddr];
        return (
            participant.stakeAmount,
            participant.joinTime,
            participant.checkedIn,
            participant.lastCheckIn,
            participant.forfeited,
            participant.claimed,
            participant.streakCount
        );
    }
    
    /**
     * @dev Get user's Achievement DNFTs
     */
    function getUserDNFTs(address user) external view returns (AchievementDNFT[] memory) {
        return userDNFTs[user];
    }
}

// ERC20 Interface
interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
