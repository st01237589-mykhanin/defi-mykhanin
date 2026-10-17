import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.20",
    npmFilesToBuild: ["@chainlink/contracts/src/v0.8/shared/mocks/MockV3Aggregator.sol"],
  },
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      url: "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY"), configVariable("LIQUIDATOR_PRIVATE_KEY")],
    },
  },
});
