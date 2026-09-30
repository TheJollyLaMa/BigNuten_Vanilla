// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBigNutenSettlementRouter {
    function PAYROLL_ROLE() external view returns (bytes32);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function approvedAssets(address asset) external view returns (bool);
    function funds(bytes32 fundId) external view returns (string memory metadataUri, bool active, bool exists);
    function isApprovedRecipient(address wallet) external view returns (bool);
    function payout(bytes32 fundId, address asset, address payable recipient, uint256 amount, bytes32 workReference, bytes32 repositoryIdHash, bytes32 contributorIdHash, string calldata metadataUri, bytes32 metadataHash) external;
}

contract BigNutenNetworkRegistry is AccessControl, ReentrancyGuard {
    bytes32 public constant NETWORK_ADMIN_ROLE = keccak256("NETWORK_ADMIN_ROLE");
    bytes32 public constant NODE_CHECKER_ROLE = keccak256("NODE_CHECKER_ROLE");
    uint256 public constant HEARTBEAT_INTERVAL = 12 hours;
    uint256 public constant MIN_MONTHLY_CHECKS = 25;

    struct Node {
        address operator;
        bytes32 nodeDidHash;
        bytes32 peerIdHash;
        string softwareVersion;
        bool approved;
        bool active;
    }

    struct MonthStats {
        uint32 checks;
        uint32 checkerChecks;
        uint64 firstHeartbeat;
        uint64 lastHeartbeat;
        bytes32 lastSampleProofHash;
        bool rewardPaid;
    }

    struct CommunityShare {
        address publisher;
        string cid;
        bytes32 contentHash;
        uint64 publishedAt;
        bool active;
    }

    mapping(uint256 => Node) public nodes;
    mapping(address => uint256[]) private _operatorNodes;
    mapping(uint256 => mapping(uint256 => MonthStats)) public monthStats;
    mapping(uint256 => CommunityShare) public communityShares;
    mapping(uint256 => bytes32) public monthChallenges;
    uint256 public nodeCount;
    uint256 public communityShareCount;
    IBigNutenSettlementRouter public nodeRewardRouter;
    bytes32 public nodeRewardFundId;
    address public nodeRewardAsset;
    uint256 public nodeRewardAmount;

    event NodeRegistered(uint256 indexed nodeId, address indexed operator, bytes32 nodeDidHash, bytes32 peerIdHash, string softwareVersion);
    event NodeApprovalUpdated(uint256 indexed nodeId, bool approved);
    event NodeActiveUpdated(uint256 indexed nodeId, bool active);
    event NodeHeartbeat(uint256 indexed nodeId, uint256 indexed month, bytes32 challengeHash, bytes32 sampleProofHash, uint256 sampleCount, uint256 timestamp);
    event NodeCheckRecorded(uint256 indexed nodeId, uint256 indexed month, address indexed checker, bytes32 challengeHash, bytes32 sampleProofHash, uint256 sampleCount, uint256 timestamp);
    event NodeRewardPayoutConfigured(address indexed router, bytes32 indexed fundId, address indexed asset, uint256 amount);
    event CommunityDataPublished(uint256 indexed shareId, address indexed publisher, string cid, bytes32 contentHash, uint256 publishedAt);
    event MonthlyNodeRewardRecorded(uint256 indexed nodeId, uint256 indexed month, address indexed operator, uint256 amount, bytes32 paymentReference);

    constructor(address defaultAdmin) {
        require(defaultAdmin != address(0), "Admin is required");
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(NETWORK_ADMIN_ROLE, defaultAdmin);
        _grantRole(NODE_CHECKER_ROLE, defaultAdmin);
    }

    function registerNode(bytes32 nodeDidHash, bytes32 peerIdHash, string calldata softwareVersion) external returns (uint256 nodeId) {
        require(nodeDidHash != bytes32(0) && peerIdHash != bytes32(0), "Node identity is required");
        require(bytes(softwareVersion).length > 0, "Software version is required");
        nodeId = ++nodeCount;
        nodes[nodeId] = Node(msg.sender, nodeDidHash, peerIdHash, softwareVersion, false, true);
        _operatorNodes[msg.sender].push(nodeId);
        emit NodeRegistered(nodeId, msg.sender, nodeDidHash, peerIdHash, softwareVersion);
    }

    function operatorNodeIds(address operator) external view returns (uint256[] memory) { return _operatorNodes[operator]; }

    function publishCommunityData(string calldata cid, bytes32 contentHash) external returns (uint256 shareId) {
        require(bytes(cid).length > 7 && bytes(cid)[0] == "i" && bytes(cid)[1] == "p" && bytes(cid)[2] == "f" && bytes(cid)[3] == "s" && bytes(cid)[4] == ":" && bytes(cid)[5] == "/" && bytes(cid)[6] == "/", "IPFS CID is required");
        require(contentHash != bytes32(0), "Content hash is required");
        shareId = ++communityShareCount;
        communityShares[shareId] = CommunityShare(msg.sender, cid, contentHash, uint64(block.timestamp), true);
        emit CommunityDataPublished(shareId, msg.sender, cid, contentHash, block.timestamp);
    }

    function setNodeApproval(uint256 nodeId, bool approved) external onlyRole(NETWORK_ADMIN_ROLE) {
        require(nodes[nodeId].operator != address(0), "Node does not exist");
        nodes[nodeId].approved = approved;
        emit NodeApprovalUpdated(nodeId, approved);
    }

    function setNodeActive(uint256 nodeId, bool active) external {
        require(nodes[nodeId].operator == msg.sender, "Only node operator can change status");
        nodes[nodeId].active = active;
        emit NodeActiveUpdated(nodeId, active);
    }

    function setMonthChallenge(uint256 month, bytes32 challengeHash) external onlyRole(NETWORK_ADMIN_ROLE) {
        require(challengeHash != bytes32(0), "Challenge is required");
        monthChallenges[month] = challengeHash;
    }

    function heartbeat(uint256 nodeId, uint256 month, bytes32 challengeHash, bytes32 sampleProofHash, uint256 sampleCount, string calldata softwareVersion) external {
        require(nodes[nodeId].operator == msg.sender, "Only node operator can heartbeat");
        _recordNodeCheck(nodeId, month, challengeHash, sampleProofHash, sampleCount, false);
        nodes[nodeId].softwareVersion = softwareVersion;
        emit NodeHeartbeat(nodeId, month, challengeHash, sampleProofHash, sampleCount, block.timestamp);
    }

    function recordNodeCheck(uint256 nodeId, uint256 month, bytes32 challengeHash, bytes32 sampleProofHash, uint256 sampleCount) external onlyRole(NODE_CHECKER_ROLE) {
        require(msg.sender != nodes[nodeId].operator, "Node operator cannot check own node");
        _recordNodeCheck(nodeId, month, challengeHash, sampleProofHash, sampleCount, true);
        emit NodeCheckRecorded(nodeId, month, msg.sender, challengeHash, sampleProofHash, sampleCount, block.timestamp);
    }

    function rewardEligible(uint256 nodeId, uint256 month) public view returns (bool) {
        MonthStats storage stats = monthStats[nodeId][month];
        Node storage node = nodes[nodeId];
        return node.approved && node.active && stats.checkerChecks >= MIN_MONTHLY_CHECKS && stats.lastSampleProofHash != bytes32(0) && !stats.rewardPaid;
    }

    function setNodeRewardPayout(address routerAddress, bytes32 fundId, address asset, uint256 amount) external onlyRole(NETWORK_ADMIN_ROLE) {
        require(routerAddress.code.length > 0, "Reward router is not a contract");
        require(fundId != bytes32(0) && amount > 0, "Reward payout is incomplete");
        IBigNutenSettlementRouter router = IBigNutenSettlementRouter(routerAddress);
        require(router.approvedAssets(asset), "Reward asset is not approved on router");
        (, bool active, bool exists) = router.funds(fundId);
        require(exists && active, "Reward fund is not active on router");
        require(router.hasRole(router.PAYROLL_ROLE(), address(this)), "Registry needs PAYROLL_ROLE on router");
        nodeRewardRouter = router;
        nodeRewardFundId = fundId;
        nodeRewardAsset = asset;
        nodeRewardAmount = amount;
        emit NodeRewardPayoutConfigured(routerAddress, fundId, asset, amount);
    }

    function claimMonthlyReward(uint256 nodeId, uint256 month) external nonReentrant {
        require(nodes[nodeId].operator == msg.sender, "Only node operator can claim");
        _payMonthlyReward(nodeId, month);
    }

    function markMonthlyRewardPaid(uint256 nodeId, uint256 month) external onlyRole(NETWORK_ADMIN_ROLE) nonReentrant {
        _payMonthlyReward(nodeId, month);
    }

    function _payMonthlyReward(uint256 nodeId, uint256 month) internal {
        require(rewardEligible(nodeId, month), "Node is not reward eligible");
        require(address(nodeRewardRouter) != address(0), "Reward payout is not configured");
        Node storage node = nodes[nodeId];
        require(nodeRewardRouter.isApprovedRecipient(node.operator), "Node operator is not whitelisted on router");
        bytes32 workReference = keccak256(abi.encode("BIGNUTEN_NODE_REWARD_V1", address(this), nodeId, month, nodeRewardFundId, nodeRewardAsset));
        bytes32 metadataHash = keccak256(abi.encode(nodeId, month, node.operator, nodeRewardAsset, nodeRewardAmount, monthStats[nodeId][month].lastSampleProofHash));
        monthStats[nodeId][month].rewardPaid = true;
        nodeRewardRouter.payout(nodeRewardFundId, nodeRewardAsset, payable(node.operator), nodeRewardAmount, workReference, keccak256(bytes("TheJollyLaMa/BigNuten_Vanilla")), node.nodeDidHash, "", metadataHash);
        emit MonthlyNodeRewardRecorded(nodeId, month, node.operator, nodeRewardAmount, workReference);
    }

    function _recordNodeCheck(uint256 nodeId, uint256 month, bytes32 challengeHash, bytes32 sampleProofHash, uint256 sampleCount, bool independentCheck) internal {
        Node storage node = nodes[nodeId];
        require(node.approved && node.active, "Node is not approved and active");
        require(monthChallenges[month] == challengeHash, "Challenge does not match");
        require(sampleProofHash != bytes32(0) && sampleCount > 0, "Sample proof is required");
        MonthStats storage stats = monthStats[nodeId][month];
        require(stats.lastHeartbeat == 0 || block.timestamp >= stats.lastHeartbeat + HEARTBEAT_INTERVAL, "Heartbeat too soon");
        if (stats.firstHeartbeat == 0) stats.firstHeartbeat = uint64(block.timestamp);
        stats.lastHeartbeat = uint64(block.timestamp);
        stats.lastSampleProofHash = sampleProofHash;
        ++stats.checks;
        if (independentCheck) ++stats.checkerChecks;
    }
}
