// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentRegistry
 * @notice ERC-8004 Draft — On-chain Meme Agent Identity & Reputation Registry
 * @dev Implements the ERC-8004 proposed standard for autonomous agent registration,
 *      service request lifecycle, and reputation scoring on Base.
 *
 * Standard Interface:
 *   - registerAgent(name, personality, metadataURI) → agentId
 *   - updateAgent(agentId, metadataURI)
 *   - deactivateAgent(agentId)
 *   - emitServiceRequest(fromAgentId, toAgentId, requestType, descriptionHash, budget)
 *   - completeServiceRequest(requestId)
 *   - cancelServiceRequest(requestId)
 *   - endorseAgent(fromAgentId, toAgentId, score)
 *   - getAgent(agentId) → AgentRecord
 *   - agentOf(owner) → agentId
 */
contract AgentRegistry is ReentrancyGuard, Ownable {

    // ─── ERC-8004 Structs ───────────────────────────────────────────────────

    struct AgentRecord {
        bytes32 agentId;
        address owner;
        string  name;
        string  personality;   // "analyst" | "shiller" | "degen" | "whale" | "sniper"
        string  metadataURI;   // IPFS / HTTPS pointing to extended JSON metadata
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
        string  requestType;    // "shill" | "analysis" | "trading" | "custom"
        bytes32 descriptionHash; // keccak256 of description text (privacy-preserving)
        uint256 budget;         // in wei (informational, no actual transfer here)
        string  budgetToken;    // "USDC" | "ETH" | "BMEM"
        uint256 createdAt;
        uint256 completedAt;
        RequestStatus status;
    }

    enum RequestStatus { Pending, Completed, Cancelled }

    // ─── ERC-8004 Events ────────────────────────────────────────────────────

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed owner,
        string  name,
        string  personality,
        string  metadataURI,
        uint256 timestamp
    );

    event AgentMetadataUpdated(
        bytes32 indexed agentId,
        string  newMetadataURI,
        uint256 timestamp
    );

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

    event ServiceRequestCancelled(
        bytes32 indexed requestId,
        uint256 timestamp
    );

    event EndorsementGiven(
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

    mapping(bytes32 => AgentRecord) private _agents;
    mapping(address => bytes32)     private _ownerToAgent;   // 1 wallet = 1 agent
    mapping(bytes32 => ServiceRequest) private _requests;
    mapping(bytes32 => mapping(bytes32 => bool)) private _hasEndorsed; // fromAgent → toAgent → bool

    bytes32[] private _allAgentIds;
    bytes32[] private _allRequestIds;

    // Addresses authorized to update reputation (backend executor)
    mapping(address => bool) private _reputationManagers;

    uint256 public constant REPUTATION_PER_SERVICE   = 10;
    uint256 public constant REPUTATION_PER_ENDORSEMENT = 2;
    uint256 public constant MAX_ENDORSEMENT_SCORE    = 5;
    uint256 public constant VERSION                  = 1; // ERC-8004 v1

    // ─── Constructor ────────────────────────────────────────────────────────

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

    // ─── ERC-8004 Core Functions ─────────────────────────────────────────────

    /**
     * @notice Register a new agent identity on-chain (ERC-8004 §3.1)
     * @param name        Human-readable agent name
     * @param personality One of: analyst | shiller | degen | whale | sniper
     * @param metadataURI IPFS/HTTPS URI to extended agent metadata JSON
     * @return agentId    Deterministic bytes32 agent identifier
     */
    function registerAgent(
        string calldata name,
        string calldata personality,
        string calldata metadataURI
    ) external nonReentrant returns (bytes32 agentId) {
        require(bytes(name).length > 0,        "ERC8004: name required");
        require(bytes(name).length <= 64,      "ERC8004: name too long");
        require(bytes(personality).length > 0, "ERC8004: personality required");
        require(_ownerToAgent[msg.sender] == bytes32(0), "ERC8004: wallet already has agent");

        // Deterministic agentId: keccak256(owner + name + chainId + block.timestamp)
        agentId = keccak256(abi.encodePacked(
            msg.sender,
            name,
            block.chainid,
            block.timestamp
        ));

        require(_agents[agentId].registeredAt == 0, "ERC8004: agentId collision");

        _agents[agentId] = AgentRecord({
            agentId:          agentId,
            owner:            msg.sender,
            name:             name,
            personality:      personality,
            metadataURI:      metadataURI,
            registeredAt:     block.timestamp,
            reputationScore:  0,
            totalServicesDone: 0,
            totalShills:      0,
            endorsementCount: 0,
            isActive:         true
        });

        _ownerToAgent[msg.sender] = agentId;
        _allAgentIds.push(agentId);

        emit AgentRegistered(agentId, msg.sender, name, personality, metadataURI, block.timestamp);
    }

    /**
     * @notice Update agent metadata URI (ERC-8004 §3.2)
     */
    function updateAgent(
        bytes32 agentId,
        string calldata newMetadataURI
    ) external onlyAgentOwner(agentId) agentMustBeActive(agentId) {
        _agents[agentId].metadataURI = newMetadataURI;
        emit AgentMetadataUpdated(agentId, newMetadataURI, block.timestamp);
    }

    /**
     * @notice Deactivate an agent (ERC-8004 §3.3) — irreversible
     */
    function deactivateAgent(bytes32 agentId)
        external
        onlyAgentOwner(agentId)
        agentMustExist(agentId)
    {
        _agents[agentId].isActive = false;
        emit AgentDeactivated(agentId, block.timestamp);
    }

    // ─── ERC-8004 Service Request Functions ──────────────────────────────────

    /**
     * @notice Emit a service request from one agent to another (ERC-8004 §4.1)
     * @param fromAgentId    Requesting agent
     * @param toAgentId      Target agent
     * @param requestType    "shill" | "analysis" | "trading" | "custom"
     * @param descriptionHash keccak256 hash of description text
     * @param budget         Budget in smallest unit (informational)
     * @param budgetToken    Token symbol
     * @return requestId     Unique request identifier
     */
    function emitServiceRequest(
        bytes32        fromAgentId,
        bytes32        toAgentId,
        string calldata requestType,
        bytes32        descriptionHash,
        uint256        budget,
        string calldata budgetToken
    ) external
      nonReentrant
      agentMustExist(fromAgentId)
      agentMustExist(toAgentId)
      agentMustBeActive(fromAgentId)
      agentMustBeActive(toAgentId)
      returns (bytes32 requestId)
    {
        require(_agents[fromAgentId].owner == msg.sender, "ERC8004: not from-agent owner");
        require(fromAgentId != toAgentId, "ERC8004: cannot request self");

        requestId = keccak256(abi.encodePacked(
            fromAgentId,
            toAgentId,
            descriptionHash,
            block.timestamp
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

        // Increment reputation of target agent (+2 for receiving request)
        _addReputation(toAgentId, REPUTATION_PER_ENDORSEMENT, "service_request_received");

        emit ServiceRequestCreated(
            requestId,
            fromAgentId,
            toAgentId,
            requestType,
            descriptionHash,
            budget,
            budgetToken,
            block.timestamp
        );
    }

    /**
     * @notice Mark a service request as completed (ERC-8004 §4.2)
     * @dev Only callable by the to-agent owner
     */
    function completeServiceRequest(bytes32 requestId)
        external
        nonReentrant
    {
        ServiceRequest storage req = _requests[requestId];
        require(req.createdAt != 0,                   "ERC8004: request not found");
        require(req.status == RequestStatus.Pending,  "ERC8004: not pending");
        require(_agents[req.toAgentId].owner == msg.sender, "ERC8004: not to-agent owner");

        req.status      = RequestStatus.Completed;
        req.completedAt = block.timestamp;

        // +10 reputation for completing a job
        _addReputation(req.toAgentId, REPUTATION_PER_SERVICE, "service_completed");
        _agents[req.toAgentId].totalServicesDone += 1;

        emit ServiceRequestCompleted(requestId, req.toAgentId, REPUTATION_PER_SERVICE, block.timestamp);
    }

    /**
     * @notice Cancel a pending service request (ERC-8004 §4.3)
     * @dev Callable by either the from-agent or to-agent owner
     */
    function cancelServiceRequest(bytes32 requestId) external {
        ServiceRequest storage req = _requests[requestId];
        require(req.createdAt != 0,                   "ERC8004: request not found");
        require(req.status == RequestStatus.Pending,  "ERC8004: not pending");

        address fromOwner = _agents[req.fromAgentId].owner;
        address toOwner   = _agents[req.toAgentId].owner;
        require(msg.sender == fromOwner || msg.sender == toOwner, "ERC8004: not authorized");

        req.status = RequestStatus.Cancelled;
        emit ServiceRequestCancelled(requestId, block.timestamp);
    }

    // ─── ERC-8004 Endorsement System ─────────────────────────────────────────

    /**
     * @notice Endorse another agent with a score 1-5 (ERC-8004 §5.1)
     * @dev Each agent can endorse another only once
     */
    function endorseAgent(
        bytes32 fromAgentId,
        bytes32 toAgentId,
        uint8   score
    ) external
      agentMustExist(fromAgentId)
      agentMustExist(toAgentId)
      agentMustBeActive(fromAgentId)
    {
        require(_agents[fromAgentId].owner == msg.sender, "ERC8004: not from-agent owner");
        require(fromAgentId != toAgentId,                 "ERC8004: cannot endorse self");
        require(score >= 1 && score <= MAX_ENDORSEMENT_SCORE, "ERC8004: score out of range");
        require(!_hasEndorsed[fromAgentId][toAgentId],    "ERC8004: already endorsed");

        _hasEndorsed[fromAgentId][toAgentId] = true;
        _agents[toAgentId].endorsementCount += 1;

        // Reputation reward proportional to score
        uint256 reward = uint256(score) * REPUTATION_PER_ENDORSEMENT;
        _addReputation(toAgentId, reward, "endorsement");

        emit EndorsementGiven(fromAgentId, toAgentId, score, block.timestamp);
    }

    // ─── Reputation Management (admin / backend) ──────────────────────────────

    /**
     * @notice Manually update reputation — only authorized reputation managers
     * @dev Used by backend executor to sync off-chain events (shills, etc.)
     */
    function updateReputation(
        bytes32        agentId,
        uint256        delta,
        bool           increase,
        string calldata reason
    ) external onlyReputationManager agentMustExist(agentId) {
        uint256 old = _agents[agentId].reputationScore;
        if (increase) {
            _agents[agentId].reputationScore = old + delta;
        } else {
            _agents[agentId].reputationScore = old > delta ? old - delta : 0;
        }
        emit ReputationUpdated(agentId, old, _agents[agentId].reputationScore, reason, block.timestamp);
    }

    function addReputationManager(address manager) external onlyOwner {
        _reputationManagers[manager] = true;
    }

    function removeReputationManager(address manager) external onlyOwner {
        _reputationManagers[manager] = false;
    }

    // ─── ERC-8004 View Functions ─────────────────────────────────────────────

    /**
     * @notice Get full agent record by agentId (ERC-8004 §6.1)
     */
    function getAgent(bytes32 agentId) external view returns (AgentRecord memory) {
        return _agents[agentId];
    }

    /**
     * @notice Get agentId for a wallet address (ERC-8004 §6.2)
     */
    function agentOf(address owner) external view returns (bytes32) {
        return _ownerToAgent[owner];
    }

    /**
     * @notice Check if a wallet already has an agent
     */
    function hasAgent(address owner) external view returns (bool) {
        return _ownerToAgent[owner] != bytes32(0);
    }

    /**
     * @notice Get a service request by ID
     */
    function getServiceRequest(bytes32 requestId) external view returns (ServiceRequest memory) {
        return _requests[requestId];
    }

    /**
     * @notice Total number of registered agents
     */
    function totalAgents() external view returns (uint256) {
        return _allAgentIds.length;
    }

    /**
     * @notice Total number of service requests
     */
    function totalRequests() external view returns (uint256) {
        return _allRequestIds.length;
    }

    /**
     * @notice Get all agent IDs (paginated)
     */
    function getAgentIds(uint256 offset, uint256 limit) external view returns (bytes32[] memory) {
        uint256 total = _allAgentIds.length;
        if (offset >= total) return new bytes32[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        bytes32[] memory result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = _allAgentIds[i];
        }
        return result;
    }

    /**
     * @notice Check if an endorsement has been given
     */
    function hasEndorsed(bytes32 fromAgent, bytes32 toAgent) external view returns (bool) {
        return _hasEndorsed[fromAgent][toAgent];
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _addReputation(bytes32 agentId, uint256 delta, string memory reason) internal {
        uint256 old = _agents[agentId].reputationScore;
        _agents[agentId].reputationScore = old + delta;
        emit ReputationUpdated(agentId, old, _agents[agentId].reputationScore, reason, block.timestamp);
    }
}
