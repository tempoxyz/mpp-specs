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
        address authorizedSigner; // Address authorized to sign vouchers (0 = payer)
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
        address authorizedSigner,
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
    error ArrayLengthMismatch();
    error BatchEmpty();
    error BatchTooLarge();
    error InvalidPayee();
    error InvalidToken();

    // --- Constants ---

    uint256 public constant MAX_BATCH_SIZE = 100;

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
     * @param authorizedSigner Address authorized to sign vouchers (0 = use msg.sender)
     * @return channelId The unique channel identifier
     */
    function open(
        address payee,
        address token,
        uint128 deposit,
        uint64 expiry,
        bytes32 salt,
        address authorizedSigner
    ) external nonReentrant returns (bytes32 channelId) {
        channelId = computeChannelId(
            msg.sender,
            payee,
            token,
            deposit,
            expiry,
            salt,
            authorizedSigner
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
            authorizedSigner: authorizedSigner,
            deposit: deposit,
            settled: 0,
            expiry: expiry,
            closeRequestedAt: 0,
            finalized: false
        });

        emit ChannelOpened(channelId, msg.sender, payee, token, authorizedSigner, deposit, expiry);
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

        // Check against authorizedSigner if set, otherwise payer
        address expectedSigner = channel.authorizedSigner != address(0) 
            ? channel.authorizedSigner 
            : channel.payer;

        if (signer != expectedSigner) {
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
     * @param payer Address that deposited funds
     * @param payee Address authorized to withdraw
     * @param token TIP-20 token address
     * @param deposit Amount deposited
     * @param expiry Channel expiry timestamp
     * @param salt Random salt
     * @param authorizedSigner Address authorized to sign vouchers
     */
    function computeChannelId(
        address payer,
        address payee,
        address token,
        uint128 deposit,
        uint64 expiry,
        bytes32 salt,
        address authorizedSigner
    ) public view returns (bytes32) {
        return keccak256(abi.encode(
            payer,
            payee,
            token,
            deposit,
            expiry,
            salt,
            authorizedSigner,
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

    /**
     * @notice Read multiple channel states in a single call.
     * @param channelIds Array of channel IDs to query
     * @return channelStates Array of Channel structs
     */
    function getChannelsBatch(bytes32[] calldata channelIds) external view returns (Channel[] memory channelStates) {
        uint256 length = channelIds.length;
        channelStates = new Channel[](length);

        for (uint256 i = 0; i < length; ++i) {
            channelStates[i] = channels[channelIds[i]];
        }
    }

    // --- Batch Operations ---

    /**
     * @notice Parameters for opening a channel in batch.
     */
    struct OpenParams {
        address payee;
        address token;
        uint128 deposit;
        uint64 expiry;
        bytes32 salt;
        address authorizedSigner;
    }

    /**
     * @notice Open multiple payment channels in a single transaction.
     * @dev Caller must approve total deposit amount for each token beforehand.
     * @param params Array of OpenParams structs
     * @return channelIds Array of created channel IDs
     */
    function openBatch(OpenParams[] calldata params) external nonReentrant returns (bytes32[] memory channelIds) {
        uint256 length = params.length;
        if (length == 0) revert BatchEmpty();
        if (length > MAX_BATCH_SIZE) revert BatchTooLarge();

        channelIds = new bytes32[](length);

        for (uint256 i = 0; i < length; ++i) {
            OpenParams calldata p = params[i];

            if (p.payee == address(0)) revert InvalidPayee();
            if (p.token == address(0)) revert InvalidToken();

            bytes32 channelId = computeChannelId(
                msg.sender,
                p.payee,
                p.token,
                p.deposit,
                p.expiry,
                p.salt,
                p.authorizedSigner
            );

            if (channels[channelId].payer != address(0)) {
                revert ChannelAlreadyExists();
            }

            bool success = ITIP20(p.token).transferFrom(msg.sender, address(this), p.deposit);
            if (!success) {
                revert TransferFailed();
            }

            channels[channelId] = Channel({
                payer: msg.sender,
                payee: p.payee,
                token: p.token,
                authorizedSigner: p.authorizedSigner,
                deposit: p.deposit,
                settled: 0,
                expiry: p.expiry,
                closeRequestedAt: 0,
                finalized: false
            });

            emit ChannelOpened(channelId, msg.sender, p.payee, p.token, p.authorizedSigner, p.deposit, p.expiry);

            channelIds[i] = channelId;
        }
    }

    /**
     * @notice Settle multiple channels in a single transaction.
     * @dev Reverts if any settlement fails (atomic).
     * @param channelIds Array of channel IDs to settle
     * @param cumulativeAmounts Array of cumulative amounts for each channel
     * @param validUntils Array of voucher expiry timestamps
     * @param signatures Array of EIP-712 signatures from each payer/authorizedSigner
     */
    function settleBatch(
        bytes32[] calldata channelIds,
        uint128[] calldata cumulativeAmounts,
        uint64[] calldata validUntils,
        bytes[] calldata signatures
    ) external nonReentrant {
        uint256 length = channelIds.length;
        if (length == 0) revert BatchEmpty();
        if (length > MAX_BATCH_SIZE) revert BatchTooLarge();
        if (
            length != cumulativeAmounts.length ||
            length != validUntils.length ||
            length != signatures.length
        ) {
            revert ArrayLengthMismatch();
        }

        for (uint256 i = 0; i < length; ++i) {
            _settleInternal(
                channelIds[i],
                cumulativeAmounts[i],
                validUntils[i],
                signatures[i]
            );
        }
    }

    // --- Internal Functions ---

    /**
     * @dev Internal settle logic for batch use. Does not use nonReentrant
     *      since the calling function already has it.
     */
    function _settleInternal(
        bytes32 channelId,
        uint128 cumulativeAmount,
        uint64 validUntil,
        bytes calldata signature
    ) internal {
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

        // Check against authorizedSigner if set, otherwise payer
        address expectedSigner = channel.authorizedSigner != address(0) 
            ? channel.authorizedSigner 
            : channel.payer;

        if (signer != expectedSigner) {
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
}
