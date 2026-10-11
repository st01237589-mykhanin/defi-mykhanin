import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { ContractTransactionReceipt } from "ethers";
import { network } from "hardhat";

const require = createRequire(import.meta.url);
const IUniswapV2Router02 = require("@uniswap/v2-periphery/build/IUniswapV2Router02.json");

const FACTORY_ABI = ["function getPair(address, address) view returns (address)"];
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function balanceOf(address) view returns (uint256)",
];
const SLIPPAGE_BPS = 100n;

const { ethers } = await network.create();
const [user] = await ethers.getSigners();
const deployment = JSON.parse(await readFile("deployment.json", "utf8"));

const tokenA = await ethers.getContractAt("AssetToken", deployment.tokenA);
const tokenB = await ethers.getContractAt("AssetToken", deployment.tokenB);
const integrator = await ethers.getContractAt("DefiIntegrator", deployment.integrator);
const router = new ethers.Contract(deployment.router, IUniswapV2Router02.abi, user);
const factory = new ethers.Contract(await router.factory(), FACTORY_ABI, user);

const format = ethers.formatEther;
const withSlippage = (amount: bigint) => (amount * (10000n - SLIPPAGE_BPS)) / 10000n;
const deadline = async () => (await ethers.provider.getBlock("latest"))!.timestamp + 300;

function findEvent(receipt: ContractTransactionReceipt, name: string) {
  for (const log of receipt.logs) {
    const event = integrator.interface.parseLog(log);
    if (event?.name === name) return event;
  }
  throw new Error(`Подію ${name} не знайдено`);
}

async function reserves(pairAddr: string) {
  const pair = new ethers.Contract(pairAddr, PAIR_ABI, user);
  const [reserve0, reserve1] = await pair.getReserves();
  return (await pair.token0()) === deployment.tokenA ? [reserve0, reserve1] : [reserve1, reserve0];
}

const liquidityA = ethers.parseEther("1000");
let liquidityB = ethers.parseEther("2000");
const swapAmount = ethers.parseEther("50");

const existingPair = await factory.getPair(deployment.tokenA, deployment.tokenB);
if (existingPair !== ethers.ZeroAddress) {
  const [reserveA, reserveB] = await reserves(existingPair);
  liquidityB = await router.quote(liquidityA, reserveA, reserveB);
}

console.log("[1] approve для DefiIntegrator");
const approveA = await (await tokenA.approve(deployment.integrator, liquidityA + swapAmount)).wait();
const approveB = await (await tokenB.approve(deployment.integrator, liquidityB)).wait();
console.log(`    KHC:  ${format(liquidityA + swapAmount)} | tx ${approveA!.hash}`);
console.log(`    FIAT: ${format(liquidityB)} | tx ${approveB!.hash}`);

console.log("[2] provideLiquidity → UniswapV2Router02.addLiquidity");
const liquidityReceipt = (await (
  await integrator.provideLiquidity(
    deployment.tokenA,
    deployment.tokenB,
    liquidityA,
    liquidityB,
    withSlippage(liquidityA),
    withSlippage(liquidityB),
    await deadline(),
  )
).wait())!;
const provided = findEvent(liquidityReceipt, "LiquidityProvided");
const pairAddr = await factory.getPair(deployment.tokenA, deployment.tokenB);
const lpToken = new ethers.Contract(pairAddr, PAIR_ABI, user);
console.log(`    Пул KHC/FIAT: ${pairAddr}${existingPair === ethers.ZeroAddress ? " (створено)" : ""}`);
console.log(`    Внесено: ${format(provided.args.amountA)} KHC + ${format(provided.args.amountB)} FIAT`);
console.log(`    LP-токени: ${format(provided.args.liquidity)} (баланс ${format(await lpToken.balanceOf(user.address))})`);
console.log(`    tx ${liquidityReceipt.hash} | gas ${liquidityReceipt.gasUsed}`);

console.log("[3] swapTokens → UniswapV2Router02.swapExactTokensForTokens");
const [, expectedOut] = await router.getAmountsOut(swapAmount, [deployment.tokenA, deployment.tokenB]);
const amountOutMin = withSlippage(expectedOut);
const balanceBefore = await tokenB.balanceOf(user.address);
const swapReceipt = (await (
  await integrator.swapTokens(deployment.tokenA, deployment.tokenB, swapAmount, amountOutMin, await deadline())
).wait())!;
const swapped = findEvent(swapReceipt, "TokensSwapped");
console.log(`    Продано: ${format(swapAmount)} KHC`);
console.log(`    Очікувано: ${format(expectedOut)} FIAT, amountOutMin (1%): ${format(amountOutMin)} FIAT`);
console.log(`    Отримано: ${format(swapped.args.amountOut)} FIAT (баланс +${format((await tokenB.balanceOf(user.address)) - balanceBefore)})`);
console.log(`    tx ${swapReceipt.hash} | gas ${swapReceipt.gasUsed}`);

const [reserveA, reserveB] = await reserves(pairAddr);
console.log(`[✓] Резерви пулу: ${format(reserveA)} KHC / ${format(reserveB)} FIAT`);
