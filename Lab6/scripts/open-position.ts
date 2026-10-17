import { readFile } from "node:fs/promises";
import { network } from "hardhat";

const BORROWER_DEPOSIT = "0.01";
const LIQUIDATOR_DEPOSIT = "0.02";
const LIQUIDATOR_MIN_BALANCE = "0.025";
const TARGET_HEALTH_FACTOR = 110n;

const { ethers } = await network.create();
const [borrower, liquidator] = await ethers.getSigners();
const deployment = JSON.parse(await readFile("deployment.json", "utf8"));
const engine = await ethers.getContractAt("StableEngine", deployment.engine);
const kUsd = await ethers.getContractAt("StableCoin", deployment.kUsd);
const format = ethers.formatEther;

async function healthFactor(user: string) {
  const hf = await engine.getHealthFactor(user);
  return hf === ethers.MaxUint256 ? "∞" : format(hf);
}

console.log(`Ціна ETH (Chainlink): ${format(await engine.getUsdValue(ethers.parseEther("1")))} USD`);

await (await engine.connect(borrower).depositCollateral({ value: ethers.parseEther(BORROWER_DEPOSIT) })).wait();
const collateralUsd = await engine.getUsdValue(await engine.collateralDeposited(borrower.address));
const debt = (collateralUsd * 100n * 100n) / ((await engine.COLLATERAL_RATIO()) * TARGET_HEALTH_FACTOR);
await (await engine.connect(borrower).mintStablecoin(debt)).wait();
console.log(`[Боржник]    ${borrower.address}`);
console.log(`             застава ${BORROWER_DEPOSIT} ETH (${format(collateralUsd)} USD), борг ${format(debt)} KUSD, HF ${await healthFactor(borrower.address)}`);

if ((await ethers.provider.getBalance(liquidator.address)) < ethers.parseEther(LIQUIDATOR_MIN_BALANCE)) {
  await (await borrower.sendTransaction({ to: liquidator.address, value: ethers.parseEther(LIQUIDATOR_MIN_BALANCE) })).wait();
}
await (await engine.connect(liquidator).depositCollateral({ value: ethers.parseEther(LIQUIDATOR_DEPOSIT) })).wait();
await (await engine.connect(liquidator).mintStablecoin(debt)).wait();
console.log(`[Ліквідатор] ${liquidator.address}`);
console.log(`             баланс ${format(await kUsd.balanceOf(liquidator.address))} KUSD для погашення боргу, HF ${await healthFactor(liquidator.address)}`);
