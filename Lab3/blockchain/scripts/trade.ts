import { readFile } from "node:fs/promises";
import { network } from "hardhat";

const { ethers } = await network.create();
const [, trader1, trader2] = await ethers.getSigners();

const deployment = JSON.parse(await readFile("deployment.json", "utf8"));
const tokenA = await ethers.getContractAt("AssetToken", deployment.tokenA);
const pool = await ethers.getContractAt("DexPool", deployment.pool);

const trades = [
  { trader: trader1, amount: "50" },
  { trader: trader1, amount: "20" },
  { trader: trader2, amount: "100" },
];

for (const { trader, amount } of trades) {
  const amountIn = ethers.parseEther(amount);
  await (await tokenA.connect(trader).approve(deployment.pool, amountIn)).wait();
  const receipt = (await (await pool.connect(trader).swapAforB(amountIn)).wait())!;

  const swap = receipt.logs
    .map((log) => pool.interface.parseLog(log))
    .find((event) => event?.name === "Swap")!;

  console.log(`[Swap] блок ${receipt.blockNumber} | tx ${receipt.hash}`);
  console.log(
    `       ${trader.address}: ${amount} KHC -> ${ethers.formatEther(swap.args.amountOut)} FIAT`,
  );
}
