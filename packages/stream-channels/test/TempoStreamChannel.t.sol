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
        vm.prank(payer);
        return channel.open(payee, address(token), DEPOSIT, SALT, address(0));
    }
    
    function _signVoucher(
        bytes32 channelId,
        uint128 amount
    ) internal view returns (bytes memory) {
        bytes32 digest = channel.getVoucherDigest(channelId, amount);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return abi.encodePacked(r, s, v);
    }
    
    // --- Open Tests ---
    
    function test_open_success() public {
        vm.prank(payer);
        bytes32 channelId = channel.open(payee, address(token), DEPOSIT, SALT, address(0));
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        assertEq(ch.payer, payer);
        assertEq(ch.payee, payee);
        assertEq(ch.token, address(token));
        assertEq(ch.deposit, DEPOSIT);
        assertEq(ch.settled, 0);
        assertFalse(ch.finalized);
        
        // Token transferred
        assertEq(token.balanceOf(address(channel)), DEPOSIT);
    }
    
    function test_open_revert_duplicate() public {
        _openChannel();
        
        vm.prank(payer);
        vm.expectRevert(TempoStreamChannel.ChannelAlreadyExists.selector);
        channel.open(payee, address(token), DEPOSIT, SALT, address(0));
    }
    
    // --- Settle Tests ---
    
    function test_settle_success() public {
        bytes32 channelId = _openChannel();
        
        uint128 amount = 500_000;
        bytes memory sig = _signVoucher(channelId, amount);
        
        vm.prank(payee);
        channel.settle(channelId, amount, sig);
        
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        assertEq(ch.settled, amount);
        assertEq(token.balanceOf(payee), amount);
    }
    
    function test_settle_multiple() public {
        bytes32 channelId = _openChannel();
        
        // First settle: 200k
        bytes memory sig1 = _signVoucher(channelId, 200_000);
        channel.settle(channelId, 200_000, sig1);
        
        // Second settle: 500k cumulative (300k delta)
        bytes memory sig2 = _signVoucher(channelId, 500_000);
        channel.settle(channelId, 500_000, sig2);
        
        assertEq(token.balanceOf(payee), 500_000);
        assertEq(channel.getChannel(channelId).settled, 500_000);
    }
    
    function test_settle_revert_notIncreasing() public {
        bytes32 channelId = _openChannel();
        
        // Settle 500k
        bytes memory sig1 = _signVoucher(channelId, 500_000);
        channel.settle(channelId, 500_000, sig1);
        
        // Try to settle 400k (less than current)
        bytes memory sig2 = _signVoucher(channelId, 400_000);
        vm.expectRevert(TempoStreamChannel.AmountNotIncreasing.selector);
        channel.settle(channelId, 400_000, sig2);
    }
    
    function test_settle_revert_exceedsDeposit() public {
        bytes32 channelId = _openChannel();
        
        bytes memory sig = _signVoucher(channelId, DEPOSIT + 1);
        vm.expectRevert(TempoStreamChannel.AmountExceedsDeposit.selector);
        channel.settle(channelId, DEPOSIT + 1, sig);
    }
    
    function test_settle_revert_invalidSignature() public {
        bytes32 channelId = _openChannel();
        
        // Sign with wrong key
        (, uint256 wrongKey) = makeAddrAndKey("wrong");
        bytes32 digest = channel.getVoucherDigest(channelId, 500_000);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        
        vm.expectRevert(TempoStreamChannel.InvalidSignature.selector);
        channel.settle(channelId, 500_000, sig);
    }
    
    // --- TopUp Tests ---
    
    function test_topUp_addDeposit() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payer);
        channel.topUp(channelId, 500_000);
        
        assertEq(channel.getChannel(channelId).deposit, DEPOSIT + 500_000);
        assertEq(token.balanceOf(address(channel)), DEPOSIT + 500_000);
    }
    
    function test_topUp_revert_notPayer() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payee);
        vm.expectRevert(TempoStreamChannel.NotPayer.selector);
        channel.topUp(channelId, 500_000);
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
    
    // --- Close Tests (Server-initiated) ---
    
    function test_close_withVoucher() public {
        bytes32 channelId = _openChannel();
        
        uint128 amount = 600_000;
        bytes memory sig = _signVoucher(channelId, amount);
        
        uint256 payeeBalanceBefore = token.balanceOf(payee);
        uint256 payerBalanceBefore = token.balanceOf(payer);
        
        vm.prank(payee);
        channel.close(channelId, amount, sig);
        
        // Payee gets settled amount
        assertEq(token.balanceOf(payee), payeeBalanceBefore + amount);
        // Payer gets refund
        assertEq(token.balanceOf(payer), payerBalanceBefore + (DEPOSIT - amount));
        // Channel is finalized
        assertTrue(channel.getChannel(channelId).finalized);
    }
    
    function test_close_withoutVoucher() public {
        bytes32 channelId = _openChannel();
        
        uint256 payerBalanceBefore = token.balanceOf(payer);
        
        vm.prank(payee);
        channel.close(channelId, 0, "");
        
        // Payer gets full refund
        assertEq(token.balanceOf(payer), payerBalanceBefore + DEPOSIT);
        // Payee gets nothing
        assertEq(token.balanceOf(payee), 0);
        // Channel is finalized
        assertTrue(channel.getChannel(channelId).finalized);
    }
    
    function test_close_afterPartialSettle() public {
        bytes32 channelId = _openChannel();
        
        // First settle some
        bytes memory sig1 = _signVoucher(channelId, 300_000);
        channel.settle(channelId, 300_000, sig1);
        
        // Now close with higher voucher
        bytes memory sig2 = _signVoucher(channelId, 700_000);
        
        uint256 payeeBalanceBefore = token.balanceOf(payee);
        uint256 payerBalanceBefore = token.balanceOf(payer);
        
        vm.prank(payee);
        channel.close(channelId, 700_000, sig2);
        
        // Payee gets additional 400k (700k - 300k already settled)
        assertEq(token.balanceOf(payee), payeeBalanceBefore + 400_000);
        // Payer gets refund of 300k
        assertEq(token.balanceOf(payer), payerBalanceBefore + 300_000);
    }
    
    function test_close_revert_notPayee() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payer);
        vm.expectRevert(TempoStreamChannel.NotPayee.selector);
        channel.close(channelId, 0, "");
    }
    
    function test_close_revert_invalidSignature() public {
        bytes32 channelId = _openChannel();
        
        // Sign with wrong key
        (, uint256 wrongKey) = makeAddrAndKey("wrong");
        bytes32 digest = channel.getVoucherDigest(channelId, 500_000);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        
        vm.prank(payee);
        vm.expectRevert(TempoStreamChannel.InvalidSignature.selector);
        channel.close(channelId, 500_000, sig);
    }
    
    function test_close_afterRequestClose() public {
        bytes32 channelId = _openChannel();
        
        // Client requests close
        vm.prank(payer);
        channel.requestClose(channelId);
        
        // Server can still close cooperatively
        bytes memory sig = _signVoucher(channelId, 500_000);
        vm.prank(payee);
        channel.close(channelId, 500_000, sig);
        
        assertTrue(channel.getChannel(channelId).finalized);
    }
    
    // --- Withdraw Tests ---
    
    function test_withdraw_afterCloseGrace() public {
        bytes32 channelId = _openChannel();
        
        // Settle half first
        bytes memory sig = _signVoucher(channelId, 500_000);
        channel.settle(channelId, 500_000, sig);
        
        vm.prank(payer);
        channel.requestClose(channelId);
        
        // Warp past grace period
        vm.warp(block.timestamp + channel.CLOSE_GRACE_PERIOD() + 1);
        
        uint256 payerBalanceBefore = token.balanceOf(payer);
        
        vm.prank(payer);
        channel.withdraw(channelId);
        
        // Should get back unsettled amount
        assertEq(token.balanceOf(payer), payerBalanceBefore + 500_000);
        assertTrue(channel.getChannel(channelId).finalized);
    }
    
    function test_withdraw_revert_closeNotReady() public {
        bytes32 channelId = _openChannel();
        
        // No requestClose called
        vm.prank(payer);
        vm.expectRevert(TempoStreamChannel.CloseNotReady.selector);
        channel.withdraw(channelId);
    }
    
    function test_withdraw_revert_graceNotPassed() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payer);
        channel.requestClose(channelId);
        
        // Don't wait for grace period
        vm.prank(payer);
        vm.expectRevert(TempoStreamChannel.CloseNotReady.selector);
        channel.withdraw(channelId);
    }
    
    function test_withdraw_revert_doubleWithdraw() public {
        bytes32 channelId = _openChannel();
        
        vm.prank(payer);
        channel.requestClose(channelId);
        
        vm.warp(block.timestamp + channel.CLOSE_GRACE_PERIOD() + 1);
        
        vm.prank(payer);
        channel.withdraw(channelId);
        
        vm.prank(payer);
        vm.expectRevert(TempoStreamChannel.ChannelFinalized.selector);
        channel.withdraw(channelId);
    }
    
    // --- Batch Read Test ---

    function test_getChannelsBatch_success() public {
        bytes32 channelId1 = _openChannel();
        
        vm.prank(payer);
        bytes32 channelId2 = channel.open(payee, address(token), DEPOSIT, bytes32(uint256(2)), address(0));

        // Settle one channel
        bytes memory sig = _signVoucher(channelId1, 500_000);
        channel.settle(channelId1, 500_000, sig);

        bytes32[] memory channelIds = new bytes32[](2);
        channelIds[0] = channelId1;
        channelIds[1] = channelId2;

        TempoStreamChannel.Channel[] memory states = channel.getChannelsBatch(channelIds);

        assertEq(states.length, 2);
        assertEq(states[0].settled, 500_000);
        assertEq(states[1].settled, 0);
    }

    // --- Fuzz Tests ---
    
    function testFuzz_settle_monotonic(uint128 amount1, uint128 amount2) public {
        vm.assume(amount1 > 0 && amount1 < DEPOSIT);
        vm.assume(amount2 > amount1 && amount2 <= DEPOSIT);
        
        bytes32 channelId = _openChannel();
        
        // First settle
        bytes memory sig1 = _signVoucher(channelId, amount1);
        channel.settle(channelId, amount1, sig1);
        assertEq(channel.getChannel(channelId).settled, amount1);
        
        // Second settle (must be higher)
        bytes memory sig2 = _signVoucher(channelId, amount2);
        channel.settle(channelId, amount2, sig2);
        assertEq(channel.getChannel(channelId).settled, amount2);
    }
    
    function testFuzz_conservation(uint128 depositAmt, uint128 settleAmt) public {
        vm.assume(depositAmt > 0 && depositAmt <= 5_000_000);
        vm.assume(settleAmt > 0 && settleAmt <= depositAmt);
        
        // Mint and approve
        token.mint(payer, depositAmt);
        
        bytes32 salt = bytes32(uint256(block.timestamp));
        
        uint256 totalBefore = token.balanceOf(payer) + token.balanceOf(payee) + token.balanceOf(address(channel));
        
        // Open channel
        vm.prank(payer);
        bytes32 channelId = channel.open(payee, address(token), depositAmt, salt, address(0));
        
        // Close with settle
        bytes memory sig = _signVoucher(channelId, settleAmt);
        vm.prank(payee);
        channel.close(channelId, settleAmt, sig);
        
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
        uint128 amount
    ) internal view returns (bytes memory) {
        bytes32 digest = channel.getVoucherDigest(channelId, amount);
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
        
        // This will "succeed" because NonTransferringToken lies
        bytes32 channelId = channel.open(
            payee,
            address(badToken),
            1_000_000,
            bytes32(uint256(1)),
            address(0)
        );
        vm.stopPrank();
        
        // Check the contract's balance
        assertEq(
            badToken.balanceOf(address(channel)),
            0, // No tokens actually transferred!
            "NonTransferringToken: Contract thinks it has tokens but doesn't"
        );
        
        // The channel state shows deposit but contract has no tokens
        TempoStreamChannel.Channel memory ch = channel.getChannel(channelId);
        assertEq(ch.deposit, 1_000_000, "Channel shows deposit");
    }
    
    /**
     * @notice Test that reentrant token cannot double-withdraw
     */
    function test_reentrantToken_blockedByNonReentrant() public {
        ReentrantToken badToken = new ReentrantToken();
        badToken.mint(payer, 1_000_000);
        
        vm.startPrank(payer);
        badToken.approve(address(channel), 1_000_000);
        
        bytes32 channelId = channel.open(
            payee,
            address(badToken),
            1_000_000,
            bytes32(uint256(1)),
            address(0)
        );
        vm.stopPrank();
        
        // Setup the reentrant attack
        badToken.setTarget(channel, channelId);
        
        // Request close and warp past grace period
        vm.prank(payer);
        channel.requestClose(channelId);
        vm.warp(block.timestamp + channel.CLOSE_GRACE_PERIOD() + 1);
        
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
