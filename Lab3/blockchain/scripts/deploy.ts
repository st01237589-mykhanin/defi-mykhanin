import { writeFile } from "node:fs/promises";
import { network } from "hardhat";

const { ethers } = await network.create();
const [owner, trader1, trader2] = await ethers.getSigners();

const tokenA = await ethers.deployContract("AssetToken", ["Khanin Coin", "KHC", 100000n]);
const tokenB = await ethers.deployContract("AssetToken", ["Mock Fiat", "FIAT", 100000n]);
const pool = await ethers.deployContract("DexPool", [
  await tokenA.getAddress(),
  await tokenB.getAddress(),
]);
const poolAddr = await pool.getAddress();
const deployBlock = (await pool.deploymentTransaction()!.wait())!.blockNumber;

await (await tokenA.approve(poolAddr, ethers.parseEther("1000"))).wait();
await (await tokenB.approve(poolAddr, ethers.parseEther("2000"))).wait();
await (await pool.addLiquidity(ethers.parseEther("1000"), ethers.parseEther("2000"))).wait();

for (const trader of [trader1, trader2]) {
  await (await tokenA.transfer(trader.address, ethers.parseEther("1000"))).wait();
}

const deployment = {
  pool: poolAddr,
  tokenA: await tokenA.getAddress(),
  tokenB: await tokenB.getAddress(),
  deployBlock,
};
await writeFile("deployment.json", JSON.stringify(deployment, null, 2) + "\n");

console.log(`Власник:  ${owner.address}`);
console.log(`KHC:      ${deployment.tokenA}`);
console.log(`FIAT:     ${deployment.tokenB}`);
console.log(`DexPool:  ${deployment.pool} (блок ${deployBlock})`);
console.log("[Ліквідність] Додано 1000 KHC та 2000 FIAT у пул.");
console.log(`Трейдери: ${trader1.address}, ${trader2.address} (по 1000 KHC)`);
