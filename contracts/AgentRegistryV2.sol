// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentRegistryV2
 * @notice ERC-8004 Draft v2 — Multi-agent per wallet support
 * @dev V2 removes the one-agent-per-wallet restriction. Each wallet can register
 *      unlimited agents. Each agent still has a unique deterministic bytes32 ID.
 */
contract AgentRegistryV2 is ReentrancyGuard, Ownable {

    struct AgentRecord {
        bytes32 agentId;
        address owner;
        string  name;
        string  personality;
        string  metadataURI;
        uint256 registeredAt;
        uint256 reputationScore;
        uint256 totalServicesDone;
        uint256 totalShills;
        uint256 endorsementCount;
        bool    isActive;
    }

    struct ServiceRequest {
        bytes32 requestId;
        bytes32 fromAgentId;
        bytes32 toAgentId;
        string  requestType;
        bytes32 descriptionHash;
        uint256 budget;
        string  budgetToken;
        uint256 createdAt;
        uint256 completedAt;
        RequestStatus status;
    }

    enum RequestStatus { Pending, Completed, Cancelled }

    // ─── Events ────────────────────────────────────────────────────────────

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed owner,
        string  name,
        string  personality,
        string  metadataURI,
        uint256 timestamp
    );

    event AgentMetadataUpdated(bytes32 indexed agentId, string newMetadataURI, uint256 timestamp);
    event AgentDeactivated(bytes32 indexed agentId, uint256 timestamp);

    event ServiceRequestCreated(
        bytes32 indexed requestId,
        bytes32 indexed fromAgentId,
        bytes32 indexed toAgentId,
        string  requestType,
        bytes32 descriptionHash,
        uint256 budget,
        string  budgetToken,
        uint256 timestamp
    );

    event ServiceRequestCompleted(
        bytes32 indexed requestId,
        bytes32 indexed toAgentId,
        uint256 reputationReward,
        uint256 timestamp
    );

    event ServiceRequestCancelled(bytes32 indexed requestId, uint256 timestamp);

    event AgentEndorsed(
        bytes32 indexed fromAgentId,
        bytes32 indexed toAgentId,
        uint8   score,
        uint256 timestamp
    );

    event ReputationUpdated(
        bytes32 indexed agentId,
        uint256 oldScore,
        uint256 newScore,
        string  reason,
        uint256 timestamp
    );

    // ─── Storage ────────────────────────────────────────────────────────────

    mapping(bytes32 => AgentRecord)    private _agents;
    mapping(address => bytes32[])      private _ownerAgents;  // V2: multiple per wallet
    mapping(bytes32 => ServiceRequest) private _requests;
    mapping(bytes32 => mapping(bytes32 => bool)) private _hasEndorsed;

    bytes32[] private _allAgentIds;
    bytes32[] private _allRequestIds;

    mapping(address => bool) private _reputationManagers;

    uint256 public constant REPUTATION_PER_SERVICE    = 10;
    uint256 public constant REPUTATION_PER_ENDORSEMENT = 2;
    uint256 public constant MAX_ENDORSEMENT_SCORE     = 5;
    uint256 public constant VERSION                   = 2;

    constructor() Ownable(msg.sender) {
        _reputationManagers[msg.sender] = true;
    }

    // ─── Modifiers ──────────────────────────────────────────────────────────

    modifier onlyAgentOwner(bytes32 agentId) {
        require(_agents[agentId].owner == msg.sender, "ERC8004: not agent owner");
        _;
    }

    modifier agentMustExist(bytes32 agentId) {
        require(_agents[agentId].registeredAt != 0, "ERC8004: agent not found");
        _;
    }

    modifier agentMustBeActive(bytes32 agentId) {
        require(_agents[agentId].isActive, "ERC8004: agent not active");
        _;
    }

    modifier onlyReputationManager() {
        require(_reputationManagers[msg.sender], "ERC8004: not authorized");
        _;
    }

    // ─── Core Functions ──────────────────────────────────────────────────────

    /**
     * @notice Register a new agent. A wallet can register unlimited agents.
     */
    function registerAgent(
        string calldata name,
        string calldata personality,
        string calldata metadataURI
    ) external nonReentrant returns (bytes32 agentId) {
        require(bytes(name).length > 0,        "ERC8004: name required");
        require(bytes(name).length <= 64,      "ERC8004: name too long");
        require(bytes(personality).length > 0, "ERC8004: personality required");

        agentId = keccak256(abi.encodePacked(
            msg.sender,
            name,
            block.chainid,
            block.timestamp,
            _ownerAgents[msg.sender].length   // nonce — prevents same-block collision
        ));

        require(_agents[agentId].registeredAt == 0, "ERC8004: agentId collision");

        _agents[agentId] = AgentRecord({
            agentId:           agentId,
            owner:             msg.sender,
            name:              name,
            personality:       personality,
            metadataURI:       metadataURI,
            registeredAt:      block.timestamp,
            reputationScore:   0,
            totalServicesDone: 0,
            totalShills:       0,
            endorsementCount:  0,
            isActive:          true
        });

        _ownerAgents[msg.sender].push(agentId);
        _allAgentIds.push(agentId);

        emit AgentRegistered(agentId, msg.sender, name, personality, metadataURI, block.timestamp);
    }

    function updateAgent(bytes32 agentId, string calldata newMetadataURI)
        external onlyAgentOwner(agentId) agentMustBeActive(agentId)
    {
        _agents[agentId].metadataURI = newMetadataURI;
        emit AgentMetadataUpdated(agentId, newMetadataURI, block.timestamp);
    }

    function deactivateAgent(bytes32 agentId)
        external onlyAgentOwner(agentId) agentMustExist(agentId)
    {
        _agents[agentId].isActive = false;
        emit AgentDeactivated(agentId, block.timestamp);
    }

    // ─── Service Requests ────────────────────────────────────────────────────

    function emitServiceRequest(
        bytes32         fromAgentId,
        bytes32         toAgentId,
        string calldata requestType,
        bytes32         descriptionHash,
        uint256         budget,
        string calldata budgetToken
    ) external nonReentrant
      agentMustExist(fromAgentId) agentMustExist(toAgentId)
      agentMustBeActive(fromAgentId) agentMustBeActive(toAgentId)
      returns (bytes32 requestId)
    {
        require(_agents[fromAgentId].owner == msg.sender, "ERC8004: not from-agent owner");
        require(fromAgentId != toAgentId, "ERC8004: cannot request self");

        requestId = keccak256(abi.encodePacked(
            fromAgentId, toAgentId, descriptionHash, block.timestamp
        ));

        _requests[requestId] = ServiceRequest({
            requestId:       requestId,
            fromAgentId:     fromAgentId,
            toAgentId:       toAgentId,
            requestType:     requestType,
            descriptionHash: descriptionHash,
            budget:          budget,
            budgetToken:     budgetToken,
            createdAt:       block.timestamp,
            completedAt:     0,
            status:          RequestStatus.Pending
        });

        _allRequestIds.push(requestId);
        emit ServiceRequestCreated(requestId, fromAgentId, toAgentId, requestType, descriptionHash, budget, budgetToken, block.timestamp);
    }

    function completeServiceRequest(bytes32 requestId) external nonReentrant {
        ServiceRequest storage req = _requests[requestId];
        require(req.requestId != bytes32(0), "ERC8004: request not found");
        require(req.status == RequestStatus.Pending, "ERC8004: not pending");
        require(_agents[req.fromAgentId].owner == msg.sender, "ERC8004: not requester");

        req.status = RequestStatus.Completed;
        req.completedAt = block.timestamp;

        _agents[req.toAgentId].reputationScore += REPUTATION_PER_SERVICE;
        _agents[req.toAgentId].totalServicesDone += 1;

        emit ServiceRequestCompleted(requestId, req.toAgentId, REPUTATION_PER_SERVICE, block.timestamp);
    }

    function cancelServiceRequest(bytes32 requestId) external nonReentrant {
        ServiceRequest storage req = _requests[requestId];
        require(req.requestId != bytes32(0), "ERC8004: request not found");
        require(req.status == RequestStatus.Pending, "ERC8004: not pending");
        require(_agents[req.fromAgentId].owner == msg.sender, "ERC8004: not requester");

        req.status = RequestStatus.Cancelled;
        emit ServiceRequestCancelled(requestId, block.timestamp);
    }

    function endorseAgent(bytes32 fromAgentId, bytes32 toAgentId, uint8 score)
        external
        agentMustExist(fromAgentId) agentMustExist(toAgentId)
        agentMustBeActive(fromAgentId) agentMustBeActive(toAgentId)
    {
        require(_agents[fromAgentId].owner == msg.sender, "ERC8004: not from-agent owner");
        require(fromAgentId != toAgentId, "ERC8004: cannot endorse self");
        require(score >= 1 && score <= MAX_ENDORSEMENT_SCORE, "ERC8004: score out of range");
        require(!_hasEndorsed[fromAgentId][toAgentId], "ERC8004: already endorsed");

        _hasEndorsed[fromAgentId][toAgentId] = true;
        _agents[toAgentId].reputationScore += REPUTATION_PER_ENDORSEMENT;
        _agents[toAgentId].endorsementCount += 1;

        emit AgentEndorsed(fromAgentId, toAgentId, score, block.timestamp);
    }

    function updateReputation(bytes32 agentId, uint256 newScore, string calldata reason)
        external onlyReputationManager agentMustExist(agentId)
    {
        uint256 old = _agents[agentId].reputationScore;
        _agents[agentId].reputationScore = newScore;
        emit ReputationUpdated(agentId, old, newScore, reason, block.timestamp);
    }

    function addReputationManager(address manager) external onlyOwner {
        _reputationManagers[manager] = true;
    }

    function removeReputationManager(address manager) external onlyOwner {
        _reputationManagers[manager] = false;
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    /** Returns all agentIds owned by a wallet (V2 multi-agent) */
    function agentsOf(address owner) external view returns (bytes32[] memory) {
        return _ownerAgents[owner];
    }

    /** Returns first agentId for backward compat (or bytes32(0) if none) */
    function agentOf(address owner) external view returns (bytes32) {
        bytes32[] memory ids = _ownerAgents[owner];
        return ids.length > 0 ? ids[0] : bytes32(0);
    }

    /** True if wallet has at least one registered agent */
    function hasAgent(address owner) external view returns (bool) {
        return _ownerAgents[owner].length > 0;
    }

    /** Number of agents owned by a wallet */
    function agentCountOf(address owner) external view returns (uint256) {
        return _ownerAgents[owner].length;
    }

    function getAgent(bytes32 agentId) external view returns (AgentRecord memory) {
        return _agents[agentId];
    }

    function getServiceRequest(bytes32 requestId) external view returns (ServiceRequest memory) {
        return _requests[requestId];
    }

    function totalAgents() external view returns (uint256) {
        return _allAgentIds.length;
    }

    function totalRequests() external view returns (uint256) {
        return _allRequestIds.length;
    }

    function isReputationManager(address addr) external view returns (bool) {
        return _reputationManagers[addr];
    }
}
