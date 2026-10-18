import { network } from "hardhat";
import { deployUniswapV2 } from "./uniswap.js";

const POOL_ASSET = "10000";
const POOL_REWARD = "20000";
const DEPOSIT = "1000";
const REWARD = "100";
const KEEPER_THRESHOLD = "10";
const SLIPPAGE_BPS = 100n;

const { ethers } = await network.create();
const [owner, investor, keeper] = await ethers.getSigners();
const { parseEther, formatEther: format } = ethers;
const deadline = async () => (await ethers.provider.getBlock("latest"))!.timestamp + 300;

const { router } = await deployUniswapV2(ethers);
const routerAddr = await router.getAddress();
const tokenA = await ethers.deployContract("AssetToken", ["Khanin Coin", "KHC", 100000n]);
const tokenB = await ethers.deployContract("AssetToken", ["Mock Fiat", "FIAT", 100000n]);
const [assetAddr, rewardAddr] = [await tokenA.getAddress(), await tokenB.getAddress()];

await (await tokenA.approve(routerAddr, parseEther(POOL_ASSET))).wait();
await (await tokenB.approve(routerAddr, parseEther(POOL_REWARD))).wait();
await (
  await router.addLiquidity(
    assetAddr,
    rewardAddr,
    parseEther(POOL_ASSET),
    parseEther(POOL_REWARD),
    parseEther(POOL_ASSET),
    parseEther(POOL_REWARD),
    owner.address,
    await deadline(),
  )
).wait();

const vault = await ethers.deployContract("AutoCompoundVault", [
  assetAddr,
  rewardAddr,
  routerAddr,
  "Khanin Vault KHC",
  "vKHC",
]);
const vaultAddr = await vault.getAddress();

console.log(`Uniswap V2 Router: ${routerAddr}`);
console.log(`KHC (актив):       ${assetAddr}`);
console.log(`FIAT (винагорода): ${rewardAddr}`);
console.log(`AutoCompoundVault: ${vaultAddr} (vKHC)`);
console.log(`Пул Uniswap:       ${POOL_ASSET} KHC / ${POOL_REWARD} FIAT`);

async function snapshot(label: string, shares: bigint) {
  console.log(`    ${label}: totalAssets ${format(await vault.totalAssets())} KHC, totalSupply ${format(await vault.totalSupply())} vKHC`);
  console.log(`    ціна акції ${format(await vault.convertToAssets(parseEther("1")))} KHC, акції інвестора коштують ${format(await vault.convertToAssets(shares))} KHC`);
}

console.log(`\n[1] Інвестор вносить ${DEPOSIT} KHC`);
await (await tokenA.transfer(investor.address, parseEther(DEPOSIT))).wait();
await (await tokenA.connect(investor).approve(vaultAddr, parseEther(DEPOSIT))).wait();
await (await vault.connect(investor).deposit(parseEther(DEPOSIT))).wait();
const shares = await vault.balanceOf(investor.address);
console.log(`    Отримано акцій: ${format(shares)} vKHC (${await vault.DEAD_SHARES()} wei акцій заблоковано на 0xdEaD)`);
await snapshot("До компаундингу", shares);

console.log(`\n[2] Протокол нараховує сховищу ${REWARD} FIAT винагороди (прямий переказ)`);
await (await tokenB.transfer(vaultAddr, parseEther(REWARD))).wait();

console.log("\n[3] Keeper перевіряє баланс винагороди та викликає compound()");
const rewardBalance = await tokenB.balanceOf(vaultAddr);
console.log(`    rewardToken.balanceOf(vault) = ${format(rewardBalance)} FIAT, поріг ${KEEPER_THRESHOLD} FIAT`);
if (rewardBalance >= parseEther(KEEPER_THRESHOLD)) {
  const [, expected] = await router.getAmountsOut(rewardBalance, [rewardAddr, assetAddr]);
  const minAssetsOut = (expected * (10000n - SLIPPAGE_BPS)) / 10000n;
  const receipt = (await (await vault.connect(keeper).compound(minAssetsOut, await deadline())).wait())!;
  const event = receipt.logs.map((log) => vault.interface.parseLog(log)).find((e) => e?.name === "Compounded")!;
  console.log(`    Продано ${format(event.args.rewardSold)} FIAT → отримано ${format(event.args.assetsReinvested)} KHC (мінімум ${format(minAssetsOut)})`);
  console.log(`    tx ${receipt.hash} | gas ${receipt.gasUsed}`);
}
await snapshot("Після компаундингу", shares);

console.log("\n[4] Інвестор знімає всі акції");
const balanceBefore = await tokenA.balanceOf(investor.address);
await (await vault.connect(investor).withdraw(shares)).wait();
const withdrawn = (await tokenA.balanceOf(investor.address)) - balanceBefore;
console.log(`    Знято ${format(withdrawn)} KHC при депозиті ${DEPOSIT} KHC, прибуток ${format(withdrawn - parseEther(DEPOSIT))} KHC`);
