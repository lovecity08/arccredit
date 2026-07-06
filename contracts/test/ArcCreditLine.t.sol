// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ArcCreditLine.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { require(balanceOf[msg.sender] >= amount, "balance"); balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) { require(allowance[from][msg.sender] >= amount, "allowance"); require(balanceOf[from] >= amount, "balance"); allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true; }
}

contract ArcCreditLineTest is Test {
    MockUSDC usdc;
    ArcCreditLine credit;
    address issuer = address(0x1111);
    address borrower = address(0x2222);
    uint256 constant UNIT = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        credit = new ArcCreditLine(address(usdc));
        usdc.mint(issuer, 1_000 * UNIT);
        usdc.mint(borrower, 1_000 * UNIT);
    }

    function testOpenDrawRepayAndClose() public {
        vm.startPrank(issuer);
        usdc.approve(address(credit), 100 * UNIT);
        uint256 id = credit.openFacility(borrower, 100 * UNIT, uint64(block.timestamp + 31 days), 100);
        vm.stopPrank();

        vm.prank(borrower);
        credit.draw(id, 20 * UNIT);
        (, , , uint256 availableAfterDraw, uint256 outstandingAfterDraw, , , , ) = credit.facility(id);
        assertEq(availableAfterDraw, 80 * UNIT);
        assertEq(outstandingAfterDraw, 20 * UNIT);

        vm.startPrank(borrower);
        usdc.approve(address(credit), 20 * UNIT);
        credit.repay(id, 20 * UNIT);
        vm.stopPrank();

        vm.prank(issuer);
        credit.closeFacility(id);
        (, , , uint256 availableAfterClose, uint256 outstandingAfterClose, , , , bool closedAfterClose) = credit.facility(id);
        assertEq(availableAfterClose, 0);
        assertEq(outstandingAfterClose, 0);
        assertTrue(closedAfterClose);
    }
}
