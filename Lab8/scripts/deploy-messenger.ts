import { network } from "hardhat";
import { CCIP, LINK_ABI, readDeployment, saveDeployment } from "./ccip.js";

const LINK_FUNDING = "1";
const NATIVE_FUNDING = "0.01";

const { ethers } = await network.create();
const [deployer] = await ethers.getSigners();
const link = new ethers.Contract(CCIP.sepolia.link, LINK_ABI, deployer);
const paysInLink = (await link.balanceOf(deployer.address)) >= ethers.parseEther(LINK_FUNDING);
const feeToken = paysInLink ? CCIP.sepolia.link : ethers.ZeroAddress;
const unit = paysInLink ? "LINK" : "ETH";

const messenger = await ethers.deployContract("CrossChainMessenger", [CCIP.sepolia.router, feeToken]);
await messenger.waitForDeployment();
const messengerAddr = await messenger.getAddress();
await saveDeployment({ messenger: messengerAddr });

console.log(`Мережа:              chainId ${(await ethers.provider.getNetwork()).chainId}`);
console.log(`CrossChainMessenger: ${messengerAddr} (комісія в ${unit})`);
console.log(`Tx розгортання:      ${messenger.deploymentTransaction()!.hash}`);

if (paysInLink) {
  await (await link.transfer(messengerAddr, ethers.parseEther(LINK_FUNDING))).wait();
  console.log(`Баланс контракту:    ${ethers.formatEther(await link.balanceOf(messengerAddr))} LINK`);
} else {
  await (await deployer.sendTransaction({ to: messengerAddr, value: ethers.parseEther(NATIVE_FUNDING) })).wait();
  console.log(`Баланс контракту:    ${ethers.formatEther(await ethers.provider.getBalance(messengerAddr))} ETH`);
}

const { receiver } = await readDeployment();
if (receiver) {
  const fee = await messenger.getFee(CCIP.arbitrumSepolia.chainSelector, receiver, "Hello L2 from L1! (Khanin)");
  console.log(`Комісія CCIP:        ${ethers.formatEther(fee)} ${unit} (Sepolia → Arbitrum Sepolia)`);
}
