import { writeFile } from "node:fs/promises";
import { network } from "hardhat";

const UNISWAP_V2_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";

const { ethers } = await network.create();
const [deployer] = await ethers.getSigners();

if ((await ethers.provider.getCode(UNISWAP_V2_ROUTER)) === "0x") {
  throw new Error(`Router ${UNISWAP_V2_ROUTER} не знайдено: запустіть форк Sepolia (npm run node)`);
}

const tokenA = await ethers.deployContract("AssetToken", ["Khanin Coin", "KHC", 100000n]);
const tokenB = await ethers.deployContract("AssetToken", ["Mock Fiat", "FIAT", 100000n]);
const integrator = await ethers.deployContract("DefiIntegrator", [UNISWAP_V2_ROUTER]);
await integrator.waitForDeployment();

const deployment = {
  router: UNISWAP_V2_ROUTER,
  tokenA: await tokenA.getAddress(),
  tokenB: await tokenB.getAddress(),
  integrator: await integrator.getAddress(),
};
await writeFile("deployment.json", JSON.stringify(deployment, null, 2) + "\n");

const { chainId } = await ethers.provider.getNetwork();
console.log(`Мережа:          chainId ${chainId}, блок ${await ethers.provider.getBlockNumber()}`);
console.log(`Власник:         ${deployer.address}`);
console.log(`KHC:             ${deployment.tokenA} (100000 KHC)`);
console.log(`FIAT:            ${deployment.tokenB} (100000 FIAT)`);
console.log(`Uniswap Router:  ${deployment.router}`);
console.log(`DefiIntegrator:  ${deployment.integrator}`);
