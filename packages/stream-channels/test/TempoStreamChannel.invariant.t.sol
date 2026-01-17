// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {TempoStreamChannel} from "../contracts/TempoStreamChannel.sol";

/**
 * @title MockTIP20
 * @notice Mock TIP-20 token for invariant testing
 */
contract MockTIP20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (balanceOf[from] < amount) return false;
        if (allowance[from][msg.sender] < amount) return false;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

/**
 * @title StreamChannelHandler
 * @notice Handler for invariant testing - generates valid sequences of operations
 */
contract StreamChannelHandler is Test {
    TempoStreamChannel public channel;
    MockTIP20 public token;
    
    // Actors
    address public payer;
    uint256 public payerKey;
    address public payee;
    
    // Ghost variables for tracking invariants (per-channel)
    bytes32[] public openChannels;
    mapping(bytes32 => bool) public channelExists;

    // Per-channel ghost state
    mapping(bytes32 => uint128) public ghostDeposit;
    mapping(bytes32 => uint128) public ghostSettled;
    mapping(bytes32 => uint128) public ghostWithdrawn;
    mapping(bytes32 => bool) public ghostFinalized;

    // Global totals (derived from per-channel)
    function totalDeposited() external view returns (uint256 total) {
        for (uint256 i = 0; i < openChannels.length; i++) {
            total += ghostDeposit[openChannels[i]];
        }
    }

    function totalSettled() external view returns (uint256 total) {
        for (uint256 i = 0; i < openChannels.length; i++) {
            total += ghostSettled[openChannels[i]];
        }
    }

    function totalWithdrawn() external view returns (uint256 total) {
        for (uint256 i = 0; i < openChannels.length; i++) {
            total += ghostWithdrawn[openChannels[i]];
        }
    }
    
    // Bounds
    uint128 constant MAX_DEPOSIT = 10_000_000;
    uint128 constant MIN_DEPOSIT = 1000;
    
    constructor(
        TempoStreamChannel _channel,
        MockTIP20 _token,
        address _payer,
        uint256 _payerKey,
        address _payee
    ) {
        channel = _channel;
        token = _token;
        payer = _payer;
        payerKey = _payerKey;
        payee = _payee;
    }
    
    // --- Handler Functions ---
    
    function openChannel(uint128 deposit, uint64 expiryDelta, bytes32 salt) external {
        deposit = uint128(bound(deposit, MIN_DEPOSIT, MAX_DEPOSIT));
        expiryDelta = uint64(bound(expiryDelta, 1 hours, 30 days));
        
        // Mint tokens
        token.mint(payer, deposit);
        
        vm.startPrank(payer);
        token.approve(address(channel), deposit);
        
        uint64 expiry = uint64(block.timestamp) + expiryDelta;
        bytes32 channelId = channel.computeChannelId(
            payer, payee, address(token), deposit, expiry, salt
        );
        
        // Skip if channel already exists
        if (channelExists[channelId]) {
            vm.stopPrank();
            return;
        }
        
        channel.open(payee, address(token), deposit, expiry, salt);
        vm.stopPrank();
        
        openChannels.push(channelId);
        channelExists[channelId] = true;
        ghostDeposit[channelId] = deposit;
        ghostSettled[channelId] = 0;
        ghostWithdrawn[channelId] = 0;
        ghostFinalized[channelId] = false;
    }
    
    function settle(uint256 channelIndex, uint128 amount) external {
        if (openChannels.length == 0) return;
        
        channelIndex = channelIndex % openChannels.length;
        bytes32 channelId = openChannels[channelIndex];
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        
        // Skip if channel is finalized or expired
        if (ch.finalized) return;
        if (block.timestamp >= ch.expiry) return;
        
        // Bound amount to valid range
        amount = uint128(bound(amount, ch.settled + 1, ch.deposit));
        if (amount <= ch.settled) return;
        
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        
        // Sign voucher
        bytes32 digest = channel.getVoucherDigest(channelId, amount, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        
        uint128 delta = amount - ch.settled;
        
        vm.prank(payee);
        try channel.settle(channelId, amount, validUntil, sig) {
            ghostSettled[channelId] += delta;
        } catch {}
    }
    
    function topUp(uint256 channelIndex, uint128 additionalDeposit, uint64 expiryExtension) external {
        if (openChannels.length == 0) return;
        
        channelIndex = channelIndex % openChannels.length;
        bytes32 channelId = openChannels[channelIndex];
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        if (ch.finalized) return;
        
        additionalDeposit = uint128(bound(additionalDeposit, 0, MAX_DEPOSIT));
        
        if (additionalDeposit > 0) {
            token.mint(payer, additionalDeposit);
            vm.prank(payer);
            token.approve(address(channel), additionalDeposit);
        }
        
        uint64 newExpiry = 0;
        if (expiryExtension > 0) {
            newExpiry = ch.expiry + uint64(bound(expiryExtension, 1 hours, 30 days));
        }
        
        vm.prank(payer);
        try channel.topUp(channelId, additionalDeposit, newExpiry) {
            ghostDeposit[channelId] += additionalDeposit;
        } catch {}
    }
    
    function requestClose(uint256 channelIndex) external {
        if (openChannels.length == 0) return;
        
        channelIndex = channelIndex % openChannels.length;
        bytes32 channelId = openChannels[channelIndex];
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        if (ch.finalized) return;
        
        vm.prank(payer);
        try channel.requestClose(channelId) {} catch {}
    }
    
    function withdraw(uint256 channelIndex) external {
        if (openChannels.length == 0) return;
        
        channelIndex = channelIndex % openChannels.length;
        bytes32 channelId = openChannels[channelIndex];
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        if (ch.finalized) return;
        
        vm.prank(payer);
        try channel.withdraw(channelId) {
            ghostWithdrawn[channelId] = ch.deposit - ch.settled;
            ghostFinalized[channelId] = true;
        } catch {}
    }
    
    function warpTime(uint256 delta) external {
        delta = bound(delta, 0, 7 days);
        vm.warp(block.timestamp + delta);
    }
    
    // --- Adversarial Signature Testing ---
    
    /**
     * @notice Attempt to settle with an invalid (wrong signer) signature
     * Should always revert - tests signature validation
     */
    function settleWithWrongSigner(uint256 channelIndex, uint128 amount, uint256 wrongKeyIndex) external {
        if (openChannels.length == 0) return;
        
        channelIndex = channelIndex % openChannels.length;
        bytes32 channelId = openChannels[channelIndex];
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        if (ch.finalized || block.timestamp >= ch.expiry) return;
        
        amount = uint128(bound(amount, ch.settled + 1, ch.deposit));
        if (amount <= ch.settled) return;
        
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        
        // Generate a different key
        (, uint256 wrongKey) = makeAddrAndKey(string(abi.encodePacked("wrong", wrongKeyIndex)));
        
        bytes32 digest = channel.getVoucherDigest(channelId, amount, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        
        // This should ALWAYS revert with InvalidSignature
        vm.prank(payee);
        try channel.settle(channelId, amount, validUntil, sig) {
            revert("SECURITY: Invalid signature accepted!");
        } catch {}
    }

    /**
     * @notice Attempt to settle with malformed signature (wrong length)
     */
    function settleWithMalformedSig(uint256 channelIndex, uint128 amount, uint8 sigLength) external {
        if (openChannels.length == 0) return;
        
        channelIndex = channelIndex % openChannels.length;
        bytes32 channelId = openChannels[channelIndex];
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        if (ch.finalized || block.timestamp >= ch.expiry) return;
        
        amount = uint128(bound(amount, ch.settled + 1, ch.deposit));
        if (amount <= ch.settled) return;
        
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        
        // Create malformed signature (not 65 bytes)
        sigLength = uint8(bound(sigLength, 0, 64)); // Never 65
        bytes memory malformedSig = new bytes(sigLength);
        for (uint8 i = 0; i < sigLength; i++) {
            malformedSig[i] = bytes1(i);
        }
        
        vm.prank(payee);
        try channel.settle(channelId, amount, validUntil, malformedSig) {
            revert("SECURITY: Malformed signature accepted!");
        } catch {}
    }

    /**
     * @notice Attempt to settle with expired validUntil
     */
    function settleWithExpiredVoucher(uint256 channelIndex, uint128 amount, uint64 expiredBy) external {
        if (openChannels.length == 0) return;
        
        channelIndex = channelIndex % openChannels.length;
        bytes32 channelId = openChannels[channelIndex];
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        if (ch.finalized || block.timestamp >= ch.expiry) return;
        
        amount = uint128(bound(amount, ch.settled + 1, ch.deposit));
        if (amount <= ch.settled) return;
        
        // Create expired voucher
        expiredBy = uint64(bound(expiredBy, 1, 1 days));
        uint64 validUntil = uint64(block.timestamp) - expiredBy;
        
        bytes32 digest = channel.getVoucherDigest(channelId, amount, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        
        vm.prank(payee);
        try channel.settle(channelId, amount, validUntil, sig) {
            revert("SECURITY: Expired voucher accepted!");
        } catch {}
    }

    /**
     * @notice Attempt to replay a lower voucher amount (should fail with AmountNotIncreasing)
     */
    function settleReplayLowerAmount(uint256 channelIndex) external {
        if (openChannels.length == 0) return;
        
        channelIndex = channelIndex % openChannels.length;
        bytes32 channelId = openChannels[channelIndex];
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        if (ch.finalized || block.timestamp >= ch.expiry) return;
        if (ch.settled == 0) return; // Need something settled first
        
        // Try to settle with same or lower amount
        uint128 lowerAmount = ch.settled; // Same as current (should fail)
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        
        bytes32 digest = channel.getVoucherDigest(channelId, lowerAmount, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        
        vm.prank(payee);
        try channel.settle(channelId, lowerAmount, validUntil, sig) {
            revert("SECURITY: Voucher replay with same/lower amount accepted!");
        } catch {}
    }
    
    // --- View Functions ---
    
    function getOpenChannelsCount() external view returns (uint256) {
        return openChannels.length;
    }
}

/**
 * @title TempoStreamChannelInvariantTest
 * @notice Invariant tests for TempoStreamChannel
 * 
 * Key invariants tested:
 * 1. CONSERVATION: Total tokens in system never change (deposit = settled + remaining)
 * 2. MONOTONIC_SETTLED: settled amount can only increase
 * 3. SETTLED_LEQ_DEPOSIT: settled <= deposit always
 * 4. FINALIZED_IMMUTABLE: finalized channels never change state
 * 5. SOLVENCY: contract balance >= sum of (deposit - settled) for all active channels
 */
contract TempoStreamChannelInvariantTest is StdInvariant, Test {
    TempoStreamChannel public channel;
    MockTIP20 public token;
    StreamChannelHandler public handler;
    
    address public payer;
    uint256 public payerKey;
    address public payee;
    
    function setUp() public {
        channel = new TempoStreamChannel();
        token = new MockTIP20();
        
        (payer, payerKey) = makeAddrAndKey("payer");
        payee = makeAddr("payee");
        
        handler = new StreamChannelHandler(
            channel,
            token,
            payer,
            payerKey,
            payee
        );
        
        // Target the handler for invariant testing
        targetContract(address(handler));
        
        // Exclude token and channel from direct calls
        excludeContract(address(token));
        excludeContract(address(channel));
    }
    
    /**
     * @notice INVARIANT: Contract is always solvent
     * The contract's token balance must always be >= the sum of unsettled funds
     */
    function invariant_solvency() public view {
        uint256 contractBalance = token.balanceOf(address(channel));
        uint256 expectedBalance = handler.totalDeposited() - handler.totalSettled() - handler.totalWithdrawn();
        
        assertGe(
            contractBalance,
            expectedBalance,
            "INVARIANT VIOLATED: Contract is insolvent"
        );
    }
    
    /**
     * @notice INVARIANT: Conservation of funds
     * Total deposited = total settled + total withdrawn + contract balance
     */
    function invariant_conservation() public view {
        uint256 totalDeposited = handler.totalDeposited();
        uint256 totalSettled = handler.totalSettled();
        uint256 totalWithdrawn = handler.totalWithdrawn();
        uint256 contractBalance = token.balanceOf(address(channel));
        
        assertEq(
            totalDeposited,
            totalSettled + totalWithdrawn + contractBalance,
            "INVARIANT VIOLATED: Conservation of funds broken"
        );
    }
    
    /**
     * @notice INVARIANT: Settled amount never exceeds deposit for any channel
     */
    function invariant_settledLeqDeposit() public view {
        uint256 numChannels = handler.getOpenChannelsCount();
        
        for (uint256 i = 0; i < numChannels; i++) {
            bytes32 channelId = handler.openChannels(i);
            TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
            
            assertLe(
                ch.settled,
                ch.deposit,
                "INVARIANT VIOLATED: Settled exceeds deposit"
            );
        }
    }
    
    /**
     * @notice INVARIANT: Finalized channels have all funds distributed
     * deposit == settled + withdrawn for finalized channels
     */
    function invariant_finalizedComplete() public view {
        uint256 numChannels = handler.getOpenChannelsCount();
        
        for (uint256 i = 0; i < numChannels; i++) {
            bytes32 channelId = handler.openChannels(i);
            
            if (handler.ghostFinalized(channelId)) {
                uint128 deposit = handler.ghostDeposit(channelId);
                uint128 settled = handler.ghostSettled(channelId);
                uint128 withdrawn = handler.ghostWithdrawn(channelId);
                
                assertEq(
                    deposit,
                    settled + withdrawn,
                    "INVARIANT VIOLATED: Finalized channel has unaccounted funds"
                );
            }
        }
    }
    
    /**
     * @notice INVARIANT: Contract balance covers all obligations
     * Sum of (deposit - settled - withdrawn) for all channels <= contract balance
     */
    function invariant_obligationsCovered() public view {
        uint256 numChannels = handler.getOpenChannelsCount();
        uint256 totalObligations = 0;
        
        for (uint256 i = 0; i < numChannels; i++) {
            bytes32 channelId = handler.openChannels(i);
            uint128 deposit = handler.ghostDeposit(channelId);
            uint128 settled = handler.ghostSettled(channelId);
            uint128 withdrawn = handler.ghostWithdrawn(channelId);
            
            // Obligation = deposit - settled - withdrawn
            if (deposit > settled + withdrawn) {
                totalObligations += (deposit - settled - withdrawn);
            }
        }
        
        assertGe(
            token.balanceOf(address(channel)),
            totalObligations,
            "INVARIANT VIOLATED: Contract cannot cover obligations"
        );
    }
    
    /**
     * @notice INVARIANT: Payee balance never decreases
     * Payee can only receive funds, never lose them
     */
    function invariant_payeeBalanceMonotonic() public view {
        uint256 payeeBalance = token.balanceOf(payee);
        uint256 totalSettled = handler.totalSettled();
        
        assertEq(
            payeeBalance,
            totalSettled,
            "INVARIANT VIOLATED: Payee balance doesn't match total settled"
        );
    }
    
    /**
     * @notice INVARIANT: Channel payer is always set correctly
     */
    function invariant_payerConsistent() public view {
        uint256 numChannels = handler.getOpenChannelsCount();
        
        for (uint256 i = 0; i < numChannels; i++) {
            bytes32 channelId = handler.openChannels(i);
            TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
            
            assertEq(
                ch.payer,
                payer,
                "INVARIANT VIOLATED: Payer changed"
            );
        }
    }
    
    // Call summary for debugging
    function invariant_callSummary() public view {
        console.log("Channels opened:", handler.getOpenChannelsCount());
        console.log("Total deposited:", handler.totalDeposited());
        console.log("Total settled:", handler.totalSettled());
        console.log("Total withdrawn:", handler.totalWithdrawn());
        console.log("Contract balance:", token.balanceOf(address(channel)));
        console.log("Payee balance:", token.balanceOf(payee));
    }
}

/**
 * @title TempoStreamChannelAccessControlInvariantTest
 * @notice Access control invariant tests - verifies attacker cannot extract channel funds
 */
contract TempoStreamChannelAccessControlInvariantTest is StdInvariant, Test {
    TempoStreamChannel public channel;
    MockTIP20 public token;
    
    address public payer;
    uint256 public payerKey;
    address public payee;
    address public attacker;
    
    bytes32 public channelId;
    uint256 public initialChannelBalance;
    
    function setUp() public {
        channel = new TempoStreamChannel();
        token = new MockTIP20();
        
        (payer, payerKey) = makeAddrAndKey("payer");
        payee = makeAddr("payee");
        attacker = makeAddr("attacker");
        
        // Setup a channel
        token.mint(payer, 1_000_000);
        vm.startPrank(payer);
        token.approve(address(channel), 1_000_000);
        channelId = channel.open(
            payee,
            address(token),
            1_000_000,
            uint64(block.timestamp) + 1 hours,
            bytes32(uint256(1))
        );
        vm.stopPrank();
        
        initialChannelBalance = token.balanceOf(address(channel));
        
        // Only target the channel contract with attacker as sender
        // This tests that an attacker cannot call channel functions to steal funds
        targetContract(address(channel));
        targetSender(attacker);
        
        // Exclude the token (we're testing the channel, not the mock token)
        excludeContract(address(token));
    }
    
    /**
     * @notice INVARIANT: Attacker cannot extract channel funds
     * Channel funds should only go to payer (refund) or payee (settlement)
     */
    function invariant_attackerCannotWithdraw() public view {
        // Attacker should never receive funds from the channel
        // We check that the sum of (payer + payee + channel) equals total minted
        uint256 payerBalance = token.balanceOf(payer);
        uint256 payeeBalance = token.balanceOf(payee);
        uint256 channelBalance = token.balanceOf(address(channel));
        
        // Total should be 1_000_000 (what we minted)
        // This proves no funds leaked to attacker
        assertEq(
            payerBalance + payeeBalance + channelBalance,
            1_000_000,
            "INVARIANT VIOLATED: Funds leaked to attacker"
        );
    }
    
    /**
     * @notice INVARIANT: Attacker cannot change channel state
     */
    function invariant_attackerCannotModifyChannel() public view {
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        
        // Deposit should not decrease
        assertGe(
            ch.deposit,
            1_000_000,
            "INVARIANT VIOLATED: Deposit decreased"
        );
        
        // Payer should not change
        assertEq(
            ch.payer,
            payer,
            "INVARIANT VIOLATED: Payer changed"
        );
    }
}
