import { network } from "hardhat";
import { saveDeployment } from "./ccip.js";

const { ethers } = await network.create();

const simulator = await ethers.deployContract("CCIPLocalSimulator");
const { chainSelector_, sourceRouter_, destinationRouter_, linkToken_ } = await simulator.configuration();

const messenger = await ethers.deployContract("CrossChainMessenger", [sourceRouter_, linkToken_]);
const receiver = await ethers.deployContract("MessageReceiver", [destinationRouter_]);
await (await simulator.requestLinkFromFaucet(await messenger.getAddress(), ethers.parseEther("1"))).wait();

const deployment = await saveDeployment({
  messenger: await messenger.getAddress(),
  receiver: await receiver.getAddress(),
  destinationChainSelector: chainSelector_.toString(),
});

console.log(`CCIPLocalSimulator:  ${await simulator.getAddress()} (Router ${sourceRouter_})`);
console.log(`CrossChainMessenger: ${deployment.messenger} (1 LINK)`);
console.log(`MessageReceiver:     ${deployment.receiver}`);
