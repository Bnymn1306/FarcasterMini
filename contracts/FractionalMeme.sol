// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FractionalMeme
 * @notice DN404 / ERC-404 inspired hybrid NFT+token contract for BasedMem Memetic Fractions.
 *         Each collection has a fixed supply of 1,000,000 fungible "fraction" units.
 *         Holding >= 1,000,000 fractions automatically grants a full (non-fractional) NFT.
 *         Partial holdings represent fractional ownership tracked off-chain per tier.
 *
 * Tiers (off-chain display — on-chain balance is always fungible):
 *   Bronze    1 – 999
 *   Silver    1,000 – 9,999
 *   Gold      10,000 – 99,999
 *   Legendary 100,000 – 999,999
 *   Whale     1,000,000 (full NFT — triggers mintNFT)
 *
 * Gamble Mechanic:
 *   Users may call `gamblingReRoll(uint256 amount)` burning `amount` fractions
 *   to emit a `RarityReRolled` event.  Off-chain indexers assign the new rarity
 *   score deterministically from the block hash + sender address.
 *
 * NOTE: This is a REFERENCE implementation. Deploy via the BasedMem deployer
 *       pipeline which sets collection metadata and seeds the initial supply.
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract FractionalMeme is ERC20, ERC721, Ownable, ReentrancyGuard {
    // ── Constants ────────────────────────────────────────────────────────────

    uint256 public constant FRACTIONS_PER_NFT = 1_000_000;
    uint256 public constant GAMBLE_COST        = 100;
    uint256 public constant MAX_SUPPLY         = 1_000_000;

    // ── State ────────────────────────────────────────────────────────────────

    string private _baseTokenURI;
    uint256 private _nextNFTId = 1;

    /// @dev Tracks whether a wallet already holds a full NFT for this collection.
    mapping(address => uint256) public nftIdOf;

    // ── Events ───────────────────────────────────────────────────────────────

    event FractionsMinted(address indexed to, uint256 amount, uint256 ethPaid);
    event NFTGranted(address indexed to, uint256 tokenId);
    event NFTRevoked(address indexed from, uint256 tokenId);
    event RarityReRolled(address indexed by, uint256 fractionsSpent, bytes32 seed);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        address owner_
    )
        ERC20(name_, symbol_)
        ERC721(name_, symbol_)
        Ownable(owner_)
    {
        _baseTokenURI = baseURI_;
    }

    // ── Minting ───────────────────────────────────────────────────────────────

    /**
     * @notice Mint `amount` fractions to `to`. Only callable by owner (BasedMem backend).
     * @dev    Automatically grants a full NFT if `to`'s balance reaches FRACTIONS_PER_NFT.
     */
    function mintFractions(address to, uint256 amount) external onlyOwner nonReentrant {
        require(ERC20.totalSupply() + amount <= MAX_SUPPLY, "FractionalMeme: exceeds max supply");
        _mint(to, amount); // ERC-20 mint
        emit FractionsMinted(to, amount, 0);
        _checkAndGrantNFT(to);
    }

    // ── Gamble re-roll ────────────────────────────────────────────────────────

    /**
     * @notice Burn GAMBLE_COST fractions to request a rarity re-roll.
     *         Emits a `RarityReRolled` event with a verifiable seed.
     *         Off-chain indexers compute newRarity = uint8(seed) % 100 + 1.
     */
    function gamblingReRoll() external nonReentrant {
        require(balanceOf(msg.sender) >= GAMBLE_COST, "FractionalMeme: insufficient fractions");
        _burn(msg.sender, GAMBLE_COST);
        bytes32 seed = keccak256(abi.encodePacked(block.prevrandao, msg.sender, block.timestamp));
        emit RarityReRolled(msg.sender, GAMBLE_COST, seed);
        _checkAndRevokeNFT(msg.sender);
    }

    // ── ERC-20 transfer hook ──────────────────────────────────────────────────

    /**
     * @dev Hook called after every ERC-20 transfer.
     *      Grants or revokes the full NFT based on the updated balance.
     */
    function _update(address from, address to, uint256 value) internal override(ERC20) {
        super._update(from, to, value);
        if (to != address(0)) _checkAndGrantNFT(to);
        if (from != address(0)) _checkAndRevokeNFT(from);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _checkAndGrantNFT(address account) internal {
        if (balanceOf(account) >= FRACTIONS_PER_NFT && nftIdOf[account] == 0) {
            uint256 id = _nextNFTId++;
            nftIdOf[account] = id;
            _safeMint(account, id);
            emit NFTGranted(account, id);
        }
    }

    function _checkAndRevokeNFT(address account) internal {
        uint256 id = nftIdOf[account];
        if (id != 0 && balanceOf(account) < FRACTIONS_PER_NFT) {
            nftIdOf[account] = 0;
            _burn(id);
            emit NFTRevoked(account, id);
        }
    }

    // ── ERC-721 metadata ──────────────────────────────────────────────────────

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        _baseTokenURI = uri;
    }

    // ── Resolve ERC-165 ambiguity between ERC20 + ERC721 ─────────────────────

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
