import { network } from "hardhat";
import { CCIP, saveDeployment } from "./ccip.js";

const { ethers } = await network.create();
const [deployer] = await ethers.getSigners();

const receiver = await ethers.deployContract("MessageReceiver", [CCIP.arbitrumSepolia.router]);
await receiver.waitForDeployment();

await saveDeployment({
  receiver: await receiver.getAddress(),
  destinationChainSelector: CCIP.arbitrumSepolia.chainSelector.toString(),
});

console.log(`Мережа:          chainId ${(await ethers.provider.getNetwork()).chainId}`);
console.log(`Власник:         ${deployer.address}`);
console.log(`MessageReceiver: ${await receiver.getAddress()} (CCIP Router ${CCIP.arbitrumSepolia.router})`);
