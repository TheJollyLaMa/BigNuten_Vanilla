// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockStreakAwardNFT {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    mapping(bytes32 => mapping(address => bool)) private _roles;
    mapping(uint256 => address) public creatorOf;
    mapping(uint256 => uint8) public kindOf;
    mapping(uint256 => uint256) public maxSupply;
    mapping(address => mapping(uint256 => uint256)) public balanceOf;
    bool public mintFailure;
    bool public failAfterMints;
    uint256 public mintsBeforeFailure;

    event EditionMinted(uint256 indexed tokenId, address indexed to, uint256 amount, address indexed minter);

    constructor(address admin) {
        _roles[bytes32(0)][admin] = true;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function grantMinter(address account) external {
        require(_roles[bytes32(0)][msg.sender], "MockNFT: not admin");
        _roles[MINTER_ROLE][account] = true;
    }

    function setMintFailure(bool enabled) external {
        require(_roles[bytes32(0)][msg.sender], "MockNFT: not admin");
        mintFailure = enabled;
        failAfterMints = false;
        mintsBeforeFailure = 0;
    }

    function setMintFailureAfter(uint256 successfulMints) external {
        require(_roles[bytes32(0)][msg.sender], "MockNFT: not admin");
        mintFailure = false;
        failAfterMints = true;
        mintsBeforeFailure = successfulMints;
    }

    function registerAchievement(uint256 tokenId) external {
        require(_roles[bytes32(0)][msg.sender], "MockNFT: not admin");
        creatorOf[tokenId] = msg.sender;
        kindOf[tokenId] = 1;
    }

    function mintAchievement(address to, uint256 tokenId, uint256 amount) external {
        require(_roles[MINTER_ROLE][msg.sender], "MockNFT: not minter");
        require(!mintFailure, "MockNFT: mint failure");
        if (failAfterMints) {
            require(mintsBeforeFailure > 0, "MockNFT: mint failure");
            mintsBeforeFailure--;
        }
        require(creatorOf[tokenId] != address(0) && kindOf[tokenId] == 1, "MockNFT: invalid achievement");
        require(maxSupply[tokenId] == 0 || balanceOf[to][tokenId] + amount <= maxSupply[tokenId], "MockNFT: supply cap");
        balanceOf[to][tokenId] += amount;
        emit EditionMinted(tokenId, to, amount, msg.sender);
    }
}
