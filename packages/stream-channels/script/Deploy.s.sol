// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {TempoStreamChannel} from "../contracts/TempoStreamChannel.sol";

contract DeployScript is Script {
    function run() external returns (address) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        TempoStreamChannel escrow = new TempoStreamChannel();
        
        console.log("TempoStreamChannel deployed at:", address(escrow));
        console.log("Domain separator:", vm.toString(escrow.domainSeparator()));
        
        vm.stopBroadcast();
        
        return address(escrow);
    }
}
