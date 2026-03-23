// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CompetitionEngine
 * @dev Streak/Competition engine for BigNuten Vanilla
 * 
 * Features:
 * - Escrow contracts for BNUT/USDC/ETH
 * - Joiners deposit to escrow
 * - Weekly self-report check-in
 * - Forfeit mechanism for failed streaks
 * - Pot split among finishers
 * - Transparent stats tracking
 * 
 * 版权声明：MIT License | Copyright (c) 2026 思捷娅科技 (SJYKJ)
 */
contract CompetitionEngine {
    // Structs
    struct Competition {
        uint256 id;
        address creator;
        address token; // Address 0 for ETH
        uint256 entryAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 checkInInterval; // Weekly in seconds
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
        string ipfsHash; // IPFS hash of proof
    }
    
    // State variables
    uint256 public competitionCount;
    mapping(uint256 => Competition) public competitions;
    mapping(uint256 => mapping(address => Participant)) public participants;
    mapping(uint256 => CheckIn[]) public checkIns;
    mapping(uint256 => address[]) public competitionParticipants;
    
    // Events
    event CompetitionCreated(uint256 indexed competitionId, address indexed creator, uint256 entryAmount);
    event ParticipantJoined(uint256 indexed competitionId, address indexed participant, uint256 amount);
    event CheckInPosted(uint256 indexed competitionId, address indexed participant, string ipfsHash);
    event ParticipantForfeited(uint256 indexed competitionId, address indexed participant);
    event CompetitionCompleted(uint256 indexed competitionId, uint256 finishers, uint256 potPerFinisher);
    event PotClaimed(uint256 indexed competitionId, address indexed participant, uint256 amount);
    event DepositWithdrawn(uint256 indexed competitionId, address indexed participant, uint256 amount);
    
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
     * @param entryAmount Entry deposit amount
     * @param duration Competition duration in seconds
     * @param checkInInterval Check-in interval (e.g., 1 week)
     */
    function createCompetition(
        address token,
        uint256 entryAmount,
        uint256 duration,
        uint256 checkInInterval
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
            completed: false
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
        require(participants[compId][msg.sender].depositAmount == 0, "Already participated");
        
        participants[compId][msg.sender] = Participant({
            participant: msg.sender,
            depositAmount: msg.value,
            joinTime: block.timestamp,
            checkedIn: false,
            lastCheckIn: 0,
            forfeited: false,
            claimed: false
        });
        
        competitionParticipants[compId].push(msg.sender);
        comp.totalPot += msg.value;
        
        emit ParticipantJoined(compId, msg.sender, msg.value);
    }
    
    /**
     * @dev Join a competition with ERC20 token
     * @param compId Competition ID
     * @param amount Amount to deposit
     */
    function joinCompetitionToken(uint256 compId, uint256 amount) external {
        Competition storage comp = competitions[compId];
        
        require(comp.active, "Competition not active");
        require(!comp.completed, "Competition already completed");
        require(amount == comp.entryAmount, "Invalid entry amount");
        require(participants[compId][msg.sender].depositAmount == 0, "Already participated");
        require(comp.token != address(0), "Competition uses ETH, not tokens");
        
        // Transfer tokens from participant
        IERC20(comp.token).transferFrom(msg.sender, address(this), amount);
        
        participants[compId][msg.sender] = Participant({
            participant: msg.sender,
            depositAmount: amount,
            joinTime: block.timestamp,
            checkedIn: false,
            lastCheckIn: 0,
            forfeited: false,
            claimed: false
        });
        
        competitionParticipants[compId].push(msg.sender);
        comp.totalPot += amount;
        
        emit ParticipantJoined(compId, msg.sender, amount);
    }
    
    /**
     * @dev Weekly self-report check-in
     * @param compId Competition ID
     * @param ipfsHash IPFS hash of proof (streak screenshot, etc.)
     */
    function checkIn(uint256 compId, string calldata ipfsHash) external {
        Competition storage comp = competitions[compId];
        Participant storage participant = participants[compId][msg.sender];
        
        require(comp.active, "Competition not active");
        require(participant.depositAmount > 0, "Not a participant");
        require(!participant.forfeited, "Already forfeited");
        require(block.timestamp >= participant.lastCheckIn + comp.checkInInterval, "Check-in not due");
        require(!participant.checkedIn || block.timestamp >= participant.lastCheckIn + comp.checkInInterval, "Already checked in");
        
        // Update participant status
        participant.checkedIn = true;
        participant.lastCheckIn = block.timestamp;
        
        // Record check-in
        checkIns[compId].push(CheckIn({
            participant: msg.sender,
            timestamp: block.timestamp,
            ipfsHash: ipfsHash
        }));
        
        emit CheckInPosted(compId, msg.sender, ipfsHash);
    }
    
    /**
     * @dev Mark participant as forfeited (can be called by self or admin)
     */
    function forfeit(uint256 compId, address participantAddr) external {
        Competition storage comp = competitions[compId];
        Participant storage participant = participants[compId][participantAddr];
        
        require(participant.depositAmount > 0, "Not a participant");
        require(!participant.forfeited, "Already forfeited");
        
        // Check if check-in deadline passed
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
        address[] storage compParticipants = competitionParticipants[compId];
        for (uint256 i = 0; i < compParticipants.length; i++) {
            Participant storage participant = participants[compId][compParticipants[i]];
            if (!participant.forfeited) {
                finisherCount++;
            }
        }
        
        require(finisherCount > 0, "No finishers");
        
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
        uint256 amountToClaim = participant.depositAmount + potPerFinisher;
        
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
     * @dev Withdraw deposit if streak survives (alternative to claiming prize)
     */
    function withdrawDeposit(uint256 compId) external {
        Competition storage comp = competitions[compId];
        Participant storage participant = participants[compId][msg.sender];
        
        require(comp.completed, "Competition not completed");
        require(!participant.forfeited, "You forfeited");
        require(!participant.claimed, "Already claimed prize");
        
        uint256 amount = participant.depositAmount;
        participant.claimed = true;
        
        // Transfer deposit back
        if (comp.token == address(0)) {
            (bool success, ) = msg.sender.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(comp.token).transfer(msg.sender, amount);
        }
        
        emit DepositWithdrawn(compId, msg.sender, amount);
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
        address[] storage compParticipants = competitionParticipants[compId];
        totalParticipants = compParticipants.length;
        
        for (uint256 i = 0; i < compParticipants.length; i++) {
            Participant storage participant = participants[compId][compParticipants[i]];
            if (participant.forfeited) {
                forfeitedCount++;
            } else {
                activeParticipants++;
            }
        }
        
        totalPot = competitions[compId].totalPot;
        finishers = competitions[compId].finishers;
    }
    
    /**
     * @dev Get participant info
     */
    function getParticipantInfo(uint256 compId, address participantAddr) external view returns (
        uint256 depositAmount,
        uint256 joinTime,
        bool checkedIn,
        uint256 lastCheckIn,
        bool forfeited,
        bool claimed
    ) {
        Participant storage participant = participants[compId][participantAddr];
        return (
            participant.depositAmount,
            participant.joinTime,
            participant.checkedIn,
            participant.lastCheckIn,
            participant.forfeited,
            participant.claimed
        );
    }
    
    /**
     * @dev Get check-in history for a competition
     */
    function getCheckInHistory(uint256 compId) external view returns (CheckIn[] memory) {
        return checkIns[compId];
    }
}

// ERC20 Interface
interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
