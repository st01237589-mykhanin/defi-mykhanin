import { createRequire } from "node:module";
import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";

const require = createRequire(import.meta.url);
const UniswapV2Factory = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const UniswapV2Router02 = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
const WETH9 = require("@uniswap/v2-periphery/build/WETH9.json");

type Artifact = { abi: any[]; bytecode: string };

export async function deployUniswapV2(ethers: HardhatEthers) {
  const [owner] = await ethers.getSigners();

  async function deploy(artifact: Artifact, ...args: unknown[]) {
    const factory = await ethers.getContractFactory(artifact.abi, artifact.bytecode);
    const contract = await factory.deploy(...args);
    return new ethers.Contract(await contract.getAddress(), artifact.abi, owner);
  }

  const weth = await deploy(WETH9);
  const factory = await deploy(UniswapV2Factory, owner.address);
  const router = await deploy(UniswapV2Router02, await factory.getAddress(), await weth.getAddress());

  return { factory, router };
}
