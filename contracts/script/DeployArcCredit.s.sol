// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ArcCreditLine.sol";

contract DeployArcCredit is Script {
    address constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (ArcCreditLine credit) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(privateKey);
        credit = new ArcCreditLine(ARC_TESTNET_USDC);
        vm.stopBroadcast();
    }
}
