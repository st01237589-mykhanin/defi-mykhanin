import { readFile } from "node:fs/promises";
import { network } from "hardhat";

const TARGET_HEALTH_FACTOR = 95n;

const { ethers } = await network.create();
const deployment = JSON.parse(await readFile("deployment.json", "utf8"));
const engine = await ethers.getContractAt("StableEngine", deployment.engine);
const format = ethers.formatEther;

const borrower = deployment.borrower;
const collateral = await engine.collateralDeposited(borrower);
const debt = await engine.kUsdMinted(borrower);
const requiredUsd = (debt * (await engine.COLLATERAL_RATIO()) * TARGET_HEALTH_FACTOR) / (100n * 100n);
const targetCollateral = (requiredUsd * ethers.parseEther("1")) / (await engine.getUsdValue(ethers.parseEther("1")));
const reduction = collateral - targetCollateral;

console.log(`Боржник ${borrower}: застава ${format(collateral)} ETH, HF ${format(await engine.getHealthFactor(borrower))}`);
const receipt = (await (await engine.reduceCollateralForTesting(borrower, reduction)).wait())!;
console.log(`reduceCollateralForTesting(${format(reduction)} ETH) | tx ${receipt.hash}`);
console.log(`Застава ${format(await engine.collateralDeposited(borrower))} ETH, HF ${format(await engine.getHealthFactor(borrower))}`);
