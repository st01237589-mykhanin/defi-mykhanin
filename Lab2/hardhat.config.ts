import { defineConfig } from "hardhat/config";
// Тулбокс включає hardhat-ethers, mocha та chai matchers
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: "0.8.20",
});
