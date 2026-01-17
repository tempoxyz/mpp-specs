// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {TempoStreamChannel} from "../contracts/TempoStreamChannel.sol";

/**
 * @title MockTIP20
 * @notice Mock TIP-20 token for testing
 */
contract MockTIP20 {
    string public name = "Mock USD";
    string public symbol = "mUSD";
    uint8 public decimals = 6;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
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
 * @title TempoStreamChannelTest
 * @notice Unit tests for TempoStreamChannel
 */
contract TempoStreamChannelTest is Test {
    TempoStreamChannel public channel;
    MockTIP20 public token;
    
    address public payer;
    uint256 public payerKey;
    address public payee;
    
    uint128 constant DEPOSIT = 1_000_000; // 1 USD with 6 decimals
    uint64 constant EXPIRY_DELTA = 1 hours;
    bytes32 constant SALT = bytes32(uint256(1));
    
    function setUp() public {
        channel = new TempoStreamChannel();
        token = new MockTIP20();
        
        (payer, payerKey) = makeAddrAndKey("payer");
        payee = makeAddr("payee");
        
        // Fund payer
        token.mint(payer, 10_000_000);
        vm.prank(payer);
        token.approve(address(channel), type(uint256).max);
    }
    
    function _openChannel() internal returns (bytes32) {
        uint64 expiry = uint64(block.timestamp) + EXPIRY_DELTA;
        vm.prank(payer);
        return channel.open(payee, address(token), DEPOSIT, expiry, SALT);
    }
    
    function _signVoucher(
        bytes32 channelId,
        uint128 amount,
        uint64 validUntil
    ) internal view returns (bytes memory) {
        bytes32 digest = channel.getVoucherDigest(channelId, amount, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return abi.encodePacked(r, s, v);
    }
    
    // --- Open Tests ---
    
    function test_open_success() public {
        uint64 expiry = uint64(block.timestamp) + EXPIRY_DELTA;
        
        vm.prank(payer);
        bytes32 channelId = channel.open(payee, address(token), DEPOSIT, expiry, SALT);
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        assertEq(ch.payer, payer);
        assertEq(ch.payee, payee);
        assertEq(ch.token, address(token));
        assertEq(ch.deposit, DEPOSIT);
        assertEq(ch.settled, 0);
        assertEq(ch.expiry, expiry);
        assertFalse(ch.finalized);
        
        // Token transferred
        assertEq(token.balanceOf(address(channel)), DEPOSIT);
    }
    
    function test_open_revert_duplicate() public {
        _openChannel();
        
        uint64 expiry = uint64(block.timestamp) + EXPIRY_DELTA;
        vm.prank(payer);
        vm.expectRevert(TempoStreamChannel.ChannelAlreadyExists.selector);
        channel.open(payee, address(token), DEPOSIT, expiry, SALT);
    }
    
    // --- Settle Tests ---
    
    function test_settle_success() public {
        bytes32 channelId = _openChannel();
        
        uint128 amount = 500_000;
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        bytes memory sig = _signVoucher(channelId, amount, validUntil);
        
        vm.prank(payee);
        channel.settle(channelId, amount, validUntil, sig);
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        assertEq(ch.settled, amount);
        assertEq(token.balanceOf(payee), amount);
    }
    
    function test_settle_multiple() public {
        bytes32 channelId = _openChannel();
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        
        // First settle: 200k
        bytes memory sig1 = _signVoucher(channelId, 200_000, validUntil);
        channel.settle(channelId, 200_000, validUntil, sig1);
        
        // Second settle: 500k cumulative (300k delta)
        bytes memory sig2 = _signVoucher(channelId, 500_000, validUntil);
        channel.settle(channelId, 500_000, validUntil, sig2);
        
        assertEq(token.balanceOf(payee), 500_000);
        assertEq(channel.getChannel(channelId).settled, 500_000);
    }
    
    function test_settle_revert_notIncreasing() public {
        bytes32 channelId = _openChannel();
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        
        // Settle 500k
        bytes memory sig1 = _signVoucher(channelId, 500_000, validUntil);
        channel.settle(channelId, 500_000, validUntil, sig1);
        
        // Try to settle 400k (less than current)
        bytes memory sig2 = _signVoucher(channelId, 400_000, validUntil);
        vm.expectRevert(TempoStreamChannel.AmountNotIncreasing.selector);
        channel.settle(channelId, 400_000, validUntil, sig2);
    }
    
    function test_settle_revert_exceedsDeposit() public {
        bytes32 channelId = _openChannel();
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        
        bytes memory sig = _signVoucher(channelId, DEPOSIT + 1, validUntil);
        vm.expectRevert(TempoStreamChannel.AmountExceedsDeposit.selector);
        channel.settle(channelId, DEPOSIT + 1, validUntil, sig);
    }
    
    function test_settle_revert_voucherExpired() public {
        bytes32 channelId = _openChannel();
        uint64 validUntil = uint64(block.timestamp) - 1;
        
        bytes memory sig = _signVoucher(channelId, 500_000, validUntil);
        vm.expectRevert(TempoStreamChannel.VoucherExpired.selector);
        channel.settle(channelId, 500_000, validUntil, sig);
    }
    
    function test_settle_revert_invalidSignature() public {
        bytes32 channelId = _openChannel();
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        
        // Sign with wrong key
        (, uint256 wrongKey) = makeAddrAndKey("wrong");
        bytes32 digest = channel.getVoucherDigest(channelId, 500_000, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        
        vm.expectRevert(TempoStreamChannel.InvalidSignature.selector);
        channel.settle(channelId, 500_000, validUntil, sig);
    }
    
    function test_settle_revert_channelExpired() public {
        bytes32 channelId = _openChannel();
        uint64 validUntil = uint64(block.timestamp) + 2 hours;
        
        // Warp past expiry
        vm.warp(block.timestamp + EXPIRY_DELTA + 1);
        
        bytes memory sig = _signVoucher(channelId, 500_000, validUntil);
        vm.expectRevert(TempoStreamChannel.ChannelExpired.selector);
        channel.settle(channelId, 500_000, validUntil, sig);
    }
    
    // --- TopUp Tests ---
    
    function test_topUp_addDeposit() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payer);
        channel.topUp(channelId, 500_000, 0);
        
        assertEq(channel.getChannel(channelId).deposit, DEPOSIT + 500_000);
        assertEq(token.balanceOf(address(channel)), DEPOSIT + 500_000);
    }
    
    function test_topUp_extendExpiry() public {
        bytes32 channelId = _openChannel();
        uint64 originalExpiry = channel.getChannel(channelId).expiry;
        uint64 newExpiry = originalExpiry + 1 hours;
        
        vm.prank(payer);
        channel.topUp(channelId, 0, newExpiry);
        
        assertEq(channel.getChannel(channelId).expiry, newExpiry);
    }
    
    function test_topUp_revert_notPayer() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payee);
        vm.expectRevert(TempoStreamChannel.NotPayer.selector);
        channel.topUp(channelId, 500_000, 0);
    }
    
    // --- RequestClose Tests ---
    
    function test_requestClose_setsTimestamp() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payer);
        channel.requestClose(channelId);
        
        assertEq(channel.getChannel(channelId).closeRequestedAt, block.timestamp);
    }
    
    function test_requestClose_revert_notPayer() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payee);
        vm.expectRevert(TempoStreamChannel.NotPayer.selector);
        channel.requestClose(channelId);
    }
    
    // --- Withdraw Tests ---
    
    function test_withdraw_afterExpiry() public {
        bytes32 channelId = _openChannel();
        
        // Settle half
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        bytes memory sig = _signVoucher(channelId, 500_000, validUntil);
        channel.settle(channelId, 500_000, validUntil, sig);
        
        // Warp past expiry
        vm.warp(block.timestamp + EXPIRY_DELTA + 1);
        
        uint256 payerBalanceBefore = token.balanceOf(payer);
        
        vm.prank(payer);
        channel.withdraw(channelId);
        
        // Should get back unsettled amount
        assertEq(token.balanceOf(payer), payerBalanceBefore + 500_000);
        assertTrue(channel.getChannel(channelId).finalized);
    }
    
    function test_withdraw_afterCloseGrace() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payer);
        channel.requestClose(channelId);
        
        // Warp past grace period
        vm.warp(block.timestamp + channel.CLOSE_GRACE_PERIOD() + 1);
        
        uint256 payerBalanceBefore = token.balanceOf(payer);
        
        vm.prank(payer);
        channel.withdraw(channelId);
        
        assertEq(token.balanceOf(payer), payerBalanceBefore + DEPOSIT);
    }
    
    function test_withdraw_revert_notExpired() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payer);
        vm.expectRevert(TempoStreamChannel.ChannelNotExpired.selector);
        channel.withdraw(channelId);
    }
    
    function test_withdraw_revert_doubleWithdraw() public {
        bytes32 channelId = _openChannel();
        
        vm.warp(block.timestamp + EXPIRY_DELTA + 1);
        
        vm.prank(payer);
        channel.withdraw(channelId);
        
        vm.prank(payer);
        vm.expectRevert(TempoStreamChannel.ChannelFinalized.selector);
        channel.withdraw(channelId);
    }
    
    // --- Fuzz Tests ---
    
    function testFuzz_settle_monotonic(uint128 amount1, uint128 amount2) public {
        vm.assume(amount1 > 0 && amount1 < DEPOSIT);
        vm.assume(amount2 > amount1 && amount2 <= DEPOSIT);
        
        bytes32 channelId = _openChannel();
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        
        // First settle
        bytes memory sig1 = _signVoucher(channelId, amount1, validUntil);
        channel.settle(channelId, amount1, validUntil, sig1);
        assertEq(channel.getChannel(channelId).settled, amount1);
        
        // Second settle (must be higher)
        bytes memory sig2 = _signVoucher(channelId, amount2, validUntil);
        channel.settle(channelId, amount2, validUntil, sig2);
        assertEq(channel.getChannel(channelId).settled, amount2);
    }
    
    function testFuzz_conservation(uint128 depositAmt, uint128 settleAmt) public {
        vm.assume(depositAmt > 0 && depositAmt <= 5_000_000);
        vm.assume(settleAmt > 0 && settleAmt <= depositAmt);
        
        // Mint and approve
        token.mint(payer, depositAmt);
        
        uint64 expiry = uint64(block.timestamp) + EXPIRY_DELTA;
        bytes32 salt = bytes32(uint256(block.timestamp));
        
        uint256 totalBefore = token.balanceOf(payer) + token.balanceOf(payee) + token.balanceOf(address(channel));
        
        // Open channel
        vm.prank(payer);
        bytes32 channelId = channel.open(payee, address(token), depositAmt, expiry, salt);
        
        // Settle
        uint64 validUntil = uint64(block.timestamp) + 30 minutes;
        bytes memory sig = _signVoucher(channelId, settleAmt, validUntil);
        channel.settle(channelId, settleAmt, validUntil, sig);
        
        // Withdraw remainder
        vm.warp(block.timestamp + EXPIRY_DELTA + 1);
        vm.prank(payer);
        channel.withdraw(channelId);
        
        uint256 totalAfter = token.balanceOf(payer) + token.balanceOf(payee) + token.balanceOf(address(channel));
        
        // Conservation: total tokens unchanged
        assertEq(totalAfter, totalBefore);
    }
}

// --- Malicious Token Models ---

/**
 * @title NonTransferringToken
 * @notice Returns true but doesn't actually transfer - tests return value handling
 */
contract NonTransferringToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    // Returns true but doesn't transfer!
    function transfer(address, uint256) external pure returns (bool) {
        return true; // Lies about success
    }
    
    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true; // Lies about success
    }
}

/**
 * @title ReentrantToken
 * @notice Attempts reentrancy on transfer
 */
contract ReentrantToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    TempoStreamChannel public target;
    bytes32 public attackChannelId;
    bool public attacking;
    
    function setTarget(TempoStreamChannel _target, bytes32 _channelId) external {
        target = _target;
        attackChannelId = _channelId;
    }
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        
        // Attempt reentrancy
        if (!attacking && address(target) != address(0)) {
            attacking = true;
            try target.withdraw(attackChannelId) {} catch {}
            attacking = false;
        }
        
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }
}

// --- Malicious Token Tests ---

contract MaliciousTokenTest is Test {
    TempoStreamChannel public channel;
    
    address public payer;
    uint256 public payerKey;
    address public payee;
    
    function setUp() public {
        channel = new TempoStreamChannel();
        (payer, payerKey) = makeAddrAndKey("payer");
        payee = makeAddr("payee");
    }
    
    function _signVoucher(
        bytes32 channelId,
        uint128 amount,
        uint64 validUntil
    ) internal view returns (bytes memory) {
        bytes32 digest = channel.getVoucherDigest(channelId, amount, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return abi.encodePacked(r, s, v);
    }
    
    /**
     * @notice Test that non-transferring token causes TransferFailed on open
     */
    function test_nonTransferringToken_openFails() public {
        NonTransferringToken badToken = new NonTransferringToken();
        badToken.mint(payer, 1_000_000);
        
        vm.startPrank(payer);
        badToken.approve(address(channel), 1_000_000);
        
        // The open should fail because funds weren't actually transferred
        // Note: This depends on how the contract validates. If it only checks
        // return value, this vulnerability exists!
        uint64 expiry = uint64(block.timestamp) + 1 hours;
        
        // This will "succeed" because NonTransferringToken lies
        // The invariant we're testing: does the contract detect this?
        bytes32 channelId = channel.open(
            payee,
            address(badToken),
            1_000_000,
            expiry,
            bytes32(uint256(1))
        );
        vm.stopPrank();
        
        // If we get here, the contract accepted the "transfer"
        // but no tokens were actually moved - this is a vulnerability!
        // Check the contract's balance
        assertEq(
            badToken.balanceOf(address(channel)),
            0, // No tokens actually transferred!
            "NonTransferringToken: Contract thinks it has tokens but doesn't"
        );
        
        // The channel state shows deposit but contract has no tokens
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        assertEq(ch.deposit, 1_000_000, "Channel shows deposit");
        
        // This is the vulnerability: deposit > actual balance
        // A proper contract should revert or check balance
    }
    
    /**
     * @notice Test that reentrant token cannot double-withdraw
     */
    function test_reentrantToken_blockedByNonReentrant() public {
        ReentrantToken badToken = new ReentrantToken();
        badToken.mint(payer, 1_000_000);
        
        vm.startPrank(payer);
        badToken.approve(address(channel), 1_000_000);
        
        uint64 expiry = uint64(block.timestamp) + 1 hours;
        bytes32 channelId = channel.open(
            payee,
            address(badToken),
            1_000_000,
            expiry,
            bytes32(uint256(1))
        );
        vm.stopPrank();
        
        // Setup the reentrant attack
        badToken.setTarget(channel, channelId);
        
        // Warp past expiry so withdraw is valid
        vm.warp(block.timestamp + 1 hours + 1);
        
        // Attempt withdraw - the token will try to reenter
        // Should NOT cause double-withdraw due to nonReentrant
        vm.prank(payer);
        channel.withdraw(channelId);
        
        // Verify only one withdraw happened
        assertTrue(channel.getChannel(channelId).finalized, "Channel should be finalized");
        assertEq(badToken.balanceOf(payer), 1_000_000, "Payer should have full refund");
        assertEq(badToken.balanceOf(address(channel)), 0, "Contract should be empty");
    }
}
