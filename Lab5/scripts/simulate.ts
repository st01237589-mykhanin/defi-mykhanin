import { network } from "hardhat";

const { ethers } = await network.create();
const [deployer, user] = await ethers.getSigners();
const format = ethers.formatEther;

const kUsd = await ethers.deployContract("StableCoin", [deployer.address]);
const engine = await ethers.deployContract("StableEngine", [await kUsd.getAddress()]);
await (await kUsd.transferOwnership(await engine.getAddress())).wait();

console.log(`KhaninUSD (KUSD): ${await kUsd.getAddress()}`);
console.log(`StableEngine:     ${await engine.getAddress()}`);
console.log(`Власник KUSD:     ${await kUsd.owner()} (StableEngine)`);

function revertReason(error: unknown) {
  const { message } = error as Error;
  return message.match(/reason string '(.+)'/)?.[1] ?? message;
}

async function healthFactor() {
  const hf = await engine.getHealthFactor(user.address);
  return hf === ethers.MaxUint256 ? "∞" : format(hf);
}

async function position() {
  const collateral = await engine.collateralDeposited(user.address);
  const debt = await engine.kUsdMinted(user.address);
  return `застава ${format(collateral)} ETH (${format(await engine.getUsdValue(collateral))} USD), борг ${format(debt)} KUSD, HF ${await healthFactor()}`;
}

console.log(`\n[1] Депозит 2 ETH при ціні ${format(await engine.mockEthUsdPrice())} USD`);
await (await engine.connect(user).depositCollateral({ value: ethers.parseEther("2") })).wait();
console.log(`    ${await position()}`);

const collateralUsd = await engine.getUsdValue(await engine.collateralDeposited(user.address));
const maxMintable =
  (collateralUsd * 100n) / (await engine.COLLATERAL_RATIO()) - (await engine.kUsdMinted(user.address));

let limitEnforced = false;
try {
  await engine.connect(user).mintStablecoin.staticCall(maxMintable + 1n);
} catch {
  limitEnforced = true;
}

console.log(`\n[2] Емісія максимальної суми: ${format(maxMintable)} KUSD`);
console.log(`    Перевірка ліміту: ${format(maxMintable + 1n)} KUSD ${limitEnforced ? "відхиляється" : "проходить"}`);
await (await engine.connect(user).mintStablecoin(maxMintable)).wait();
console.log(`    Баланс ${format(await kUsd.balanceOf(user.address))} KUSD, ${await position()}`);

console.log("\n[3] Спроба зняти 1 ETH (withdrawCollateral)");
try {
  await (await engine.connect(user).withdrawCollateral(ethers.parseEther("1"))).wait();
  console.log("    Зняття пройшло: захист НЕ спрацював");
} catch (error) {
  console.log(`    Revert: ${revertReason(error)}`);
  console.log("    Захист спрацював успішно: незабезпечене зняття застави заблоковано");
  console.log(`    ${await position()}`);
}

console.log("\n[4] Погашення 1500 KUSD (burnStablecoin) і повторне зняття 1 ETH");
await (await engine.connect(user).burnStablecoin(ethers.parseEther("1500"))).wait();
await (await engine.connect(user).withdrawCollateral(ethers.parseEther("1"))).wait();
console.log(`    Баланс ${format(await kUsd.balanceOf(user.address))} KUSD, ${await position()}`);

console.log("\n[5] Ціна ETH падає до 1500 USD (setMockOraclePrice)");
await (await engine.setMockOraclePrice(ethers.parseEther("1500"))).wait();
console.log(`    ${await position()}`);
console.log(`    ${(await engine.getHealthFactor(user.address)) < ethers.parseEther("1") ? "HF < 1: позиція недостатньо забезпечена" : "HF ≥ 1: позиція безпечна"}`);
