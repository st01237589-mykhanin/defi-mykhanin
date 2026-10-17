import { writeFile } from "node:fs/promises";
import { network } from "hardhat";

const CHAINLINK_ETH_USD_SEPOLIA = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

const { ethers } = await network.create();
const [owner, liquidator] = await ethers.getSigners();

if ((await ethers.provider.getCode(CHAINLINK_ETH_USD_SEPOLIA)) === "0x") {
  throw new Error("Оракул Chainlink не знайдено: потрібна мережа Sepolia або її форк");
}

const kUsd = await ethers.deployContract("StableCoin", [owner.address]);
const engine = await ethers.deployContract("StableEngine", [await kUsd.getAddress(), CHAINLINK_ETH_USD_SEPOLIA]);
await engine.waitForDeployment();
await (await kUsd.transferOwnership(await engine.getAddress())).wait();

const deployment = {
  chainId: Number((await ethers.provider.getNetwork()).chainId),
  kUsd: await kUsd.getAddress(),
  engine: await engine.getAddress(),
  priceFeed: CHAINLINK_ETH_USD_SEPOLIA,
  borrower: owner.address,
  liquidator: liquidator.address,
};
await writeFile("deployment.json", JSON.stringify(deployment, null, 2) + "\n");

console.log(`Мережа:        chainId ${deployment.chainId}`);
console.log(`KhaninUSD:     ${deployment.kUsd} (власник: StableEngine)`);
console.log(`StableEngine:  ${deployment.engine}`);
console.log(`Chainlink:     ${deployment.priceFeed} (ETH/USD = ${ethers.formatEther(await engine.getUsdValue(ethers.parseEther("1")))} USD)`);
console.log(`Боржник:       ${deployment.borrower}`);
console.log(`Ліквідатор:    ${deployment.liquidator}`);
