// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ECDSA} from "solady/utils/ECDSA.sol";
import {EIP712} from "solady/utils/EIP712.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";

interface ITIP20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @title TempoStreamChannel
 * @notice Unidirectional payment channel escrow for streaming payments.
 * @dev Users deposit TIP-20 tokens, sign cumulative vouchers, and servers
 *      can settle at any time before expiry. After expiry, users can withdraw
 *      any remaining funds.
 */
contract TempoStreamChannel is EIP712, ReentrancyGuard {

    // --- Types ---

    struct Channel {
        address payer;           // User who deposited funds
        address payee;           // Server authorized to withdraw
        address token;           // TIP-20 token address
        uint128 deposit;         // Total amount deposited
        uint128 settled;         // Cumulative amount already withdrawn
        uint64 expiry;           // UNIX timestamp after which user can withdraw
        uint64 closeRequestedAt; // Timestamp when close was requested (0 if not)
        bool finalized;          // Prevents double-withdraw
    }

    // --- Constants ---

    bytes32 public constant VOUCHER_TYPEHASH = keccak256(
        "Voucher(bytes32 channelId,uint128 cumulativeAmount,uint64 validUntil)"
    );

    uint64 public constant CLOSE_GRACE_PERIOD = 15 minutes;

    // --- State ---

    mapping(bytes32 => Channel) public channels;

    // --- Events ---

    event ChannelOpened(
        bytes32 indexed channelId,
        address indexed payer,
        address indexed payee,
        address token,
        uint256 deposit,
        uint256 expiry
    );

    event Settled(
        bytes32 indexed channelId,
        uint256 cumulativeAmount,
        uint256 deltaPaid,
        uint256 newSettled
    );

    event CloseRequested(
        bytes32 indexed channelId,
        uint256 closeGraceEnd
    );

    event TopUp(
        bytes32 indexed channelId,
        uint256 additionalDeposit,
        uint256 newDeposit,
        uint256 newExpiry
    );

    event Withdrawn(
        bytes32 indexed channelId,
        uint256 refunded
    );

    // --- Errors ---

    error ChannelAlreadyExists();
    error ChannelNotFound();
    error ChannelExpired();
    error ChannelNotExpired();
    error ChannelFinalized();
    error InvalidSignature();
    error VoucherExpired();
    error AmountExceedsDeposit();
    error AmountNotIncreasing();
    error NotPayer();
    error TransferFailed();
    error CloseNotRequested();

    // --- EIP-712 Domain ---

    function _domainNameAndVersion()
        internal
        pure
        override
        returns (string memory name, string memory version)
    {
        name = "Tempo Stream Channel";
        version = "1";
    }

    // --- External Functions ---

    /**
     * @notice Open a new payment channel with escrowed funds.
     * @param payee Address authorized to withdraw (server)
     * @param token TIP-20 token address
     * @param deposit Amount to deposit
     * @param expiry Channel expiry timestamp
     * @param salt Random salt for channel ID generation
     * @return channelId The unique channel identifier
     */
    function open(
        address payee,
        address token,
        uint128 deposit,
        uint64 expiry,
        bytes32 salt
    ) external nonReentrant returns (bytes32 channelId) {
        channelId = computeChannelId(
            msg.sender,
            payee,
            token,
            deposit,
            expiry,
            salt
        );

        if (channels[channelId].payer != address(0)) {
            revert ChannelAlreadyExists();
        }

        // Transfer tokens to this contract
        bool success = ITIP20(token).transferFrom(msg.sender, address(this), deposit);
        if (!success) {
            revert TransferFailed();
        }

        channels[channelId] = Channel({
            payer: msg.sender,
            payee: payee,
            token: token,
            deposit: deposit,
            settled: 0,
            expiry: expiry,
            closeRequestedAt: 0,
            finalized: false
        });

        emit ChannelOpened(channelId, msg.sender, payee, token, deposit, expiry);
    }

    /**
     * @notice Settle funds using a signed voucher.
     * @param channelId The channel to settle
     * @param cumulativeAmount Total amount authorized by the voucher
     * @param validUntil Voucher expiry timestamp
     * @param signature EIP-712 signature from the payer
     */
    function settle(
        bytes32 channelId,
        uint128 cumulativeAmount,
        uint64 validUntil,
        bytes calldata signature
    ) external nonReentrant {
        Channel storage channel = channels[channelId];

        if (channel.payer == address(0)) {
            revert ChannelNotFound();
        }
        if (channel.finalized) {
            revert ChannelFinalized();
        }
        if (block.timestamp >= channel.expiry) {
            revert ChannelExpired();
        }
        if (block.timestamp > validUntil) {
            revert VoucherExpired();
        }
        if (cumulativeAmount > channel.deposit) {
            revert AmountExceedsDeposit();
        }
        if (cumulativeAmount <= channel.settled) {
            revert AmountNotIncreasing();
        }

        // Verify signature
        bytes32 structHash = keccak256(abi.encode(
            VOUCHER_TYPEHASH,
            channelId,
            cumulativeAmount,
            validUntil
        ));
        bytes32 digest = _hashTypedData(structHash);
        address signer = ECDSA.recoverCalldata(digest, signature);

        if (signer != channel.payer) {
            revert InvalidSignature();
        }

        // Calculate delta and transfer
        uint128 delta = cumulativeAmount - channel.settled;
        channel.settled = cumulativeAmount;

        bool success = ITIP20(channel.token).transfer(channel.payee, delta);
        if (!success) {
            revert TransferFailed();
        }

        emit Settled(channelId, cumulativeAmount, delta, channel.settled);
    }

    /**
     * @notice Add more funds and/or extend expiry.
     * @param channelId The channel to top up
     * @param additionalDeposit Amount to add (0 to skip)
     * @param newExpiry New expiry timestamp (must be > current, or 0 to skip)
     */
    function topUp(
        bytes32 channelId,
        uint128 additionalDeposit,
        uint64 newExpiry
    ) external nonReentrant {
        Channel storage channel = channels[channelId];

        if (channel.payer == address(0)) {
            revert ChannelNotFound();
        }
        if (msg.sender != channel.payer) {
            revert NotPayer();
        }
        if (channel.finalized) {
            revert ChannelFinalized();
        }

        // Add deposit if specified
        if (additionalDeposit > 0) {
            bool success = ITIP20(channel.token).transferFrom(msg.sender, address(this), additionalDeposit);
            if (!success) {
                revert TransferFailed();
            }
            channel.deposit += additionalDeposit;
        }

        // Extend expiry if specified and greater than current
        if (newExpiry > channel.expiry) {
            channel.expiry = newExpiry;
        }

        emit TopUp(channelId, additionalDeposit, channel.deposit, channel.expiry);
    }

    /**
     * @notice Request early channel closure.
     * @dev Starts a grace period after which the payer can withdraw.
     * @param channelId The channel to close
     */
    function requestClose(bytes32 channelId) external {
        Channel storage channel = channels[channelId];

        if (channel.payer == address(0)) {
            revert ChannelNotFound();
        }
        if (msg.sender != channel.payer) {
            revert NotPayer();
        }
        if (channel.finalized) {
            revert ChannelFinalized();
        }

        // Only set if not already requested
        if (channel.closeRequestedAt == 0) {
            channel.closeRequestedAt = uint64(block.timestamp);
            emit CloseRequested(channelId, block.timestamp + CLOSE_GRACE_PERIOD);
        }
    }

    /**
     * @notice Withdraw remaining funds after expiry or close grace period.
     * @param channelId The channel to withdraw from
     */
    function withdraw(bytes32 channelId) external nonReentrant {
        Channel storage channel = channels[channelId];

        if (channel.payer == address(0)) {
            revert ChannelNotFound();
        }
        if (msg.sender != channel.payer) {
            revert NotPayer();
        }
        if (channel.finalized) {
            revert ChannelFinalized();
        }

        // Check if eligible to withdraw
        bool expiredNormally = block.timestamp >= channel.expiry;
        bool closeGracePassed = channel.closeRequestedAt != 0 &&
            block.timestamp >= channel.closeRequestedAt + CLOSE_GRACE_PERIOD;

        if (!expiredNormally && !closeGracePassed) {
            revert ChannelNotExpired();
        }

        uint128 refund = channel.deposit - channel.settled;
        channel.finalized = true;

        if (refund > 0) {
            bool success = ITIP20(channel.token).transfer(channel.payer, refund);
            if (!success) {
                revert TransferFailed();
            }
        }

        emit Withdrawn(channelId, refund);
    }

    // --- View Functions ---

    /**
     * @notice Get channel state.
     */
    function getChannel(bytes32 channelId) external view returns (Channel memory) {
        return channels[channelId];
    }

    /**
     * @notice Compute the channel ID for given parameters.
     */
    function computeChannelId(
        address payer,
        address payee,
        address token,
        uint128 deposit,
        uint64 expiry,
        bytes32 salt
    ) public view returns (bytes32) {
        return keccak256(abi.encode(
            payer,
            payee,
            token,
            deposit,
            expiry,
            salt,
            address(this),
            block.chainid
        ));
    }

    /**
     * @notice Get the EIP-712 domain separator.
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    /**
     * @notice Compute the digest for a voucher (for off-chain signing).
     */
    function getVoucherDigest(
        bytes32 channelId,
        uint128 cumulativeAmount,
        uint64 validUntil
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            VOUCHER_TYPEHASH,
            channelId,
            cumulativeAmount,
            validUntil
        ));
        return _hashTypedData(structHash);
    }
}
