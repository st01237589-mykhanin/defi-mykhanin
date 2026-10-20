import { network } from "hardhat";
import { CCIP, LINK_ABI } from "./ccip.js";

const { ethers } = await network.create();
const [owner] = await ethers.getSigners();
const link = new ethers.Contract(CCIP.sepolia.link, LINK_ABI, owner);

const messenger = await ethers.deployContract("CrossChainMessenger", [CCIP.sepolia.router, CCIP.sepolia.link]);
const messengerAddr = await messenger.getAddress();
const funding = ethers.parseEther("1");

for (let slot = 0n; slot < 20n; slot++) {
  const key = ethers.solidityPackedKeccak256(["uint256", "uint256"], [messengerAddr, slot]);
  await ethers.provider.send("hardhat_setStorageAt", [CCIP.sepolia.link, key, ethers.toBeHex(funding, 32)]);
  if ((await link.balanceOf(messengerAddr)) === funding) break;
}

const receiver = owner.address;
const text = "Hello L2 from L1!";
const fee = await messenger.getFee(CCIP.arbitrumSepolia.chainSelector, receiver, text);
const receipt = (await (await messenger.sendMessage(CCIP.arbitrumSepolia.chainSelector, receiver, text)).wait())!;
const sent = receipt.logs.map((log) => messenger.interface.parseLog(log)).find((e) => e?.name === "MessageSent")!;

console.log(`Форк Sepolia, CCIP Router ${CCIP.sepolia.router}`);
console.log(`Комісія getFee: ${ethers.formatEther(fee)} LINK`);
console.log(`ccipSend: messageId ${sent.args.messageId}, сплачено ${ethers.formatEther(sent.args.feePaid)} LINK`);
console.log(`Залишок LINK: ${ethers.formatEther(await link.balanceOf(messengerAddr))}, подій у транзакції: ${receipt.logs.length}`);

const nativeMessenger = await ethers.deployContract("CrossChainMessenger", [CCIP.sepolia.router, ethers.ZeroAddress]);
await (await owner.sendTransaction({ to: await nativeMessenger.getAddress(), value: ethers.parseEther("0.01") })).wait();
const nativeFee = await nativeMessenger.getFee(CCIP.arbitrumSepolia.chainSelector, receiver, text);
const nativeReceipt = (await (await nativeMessenger.sendMessage(CCIP.arbitrumSepolia.chainSelector, receiver, text)).wait())!;
const nativeSent = nativeReceipt.logs
  .map((log) => nativeMessenger.interface.parseLog(log))
  .find((e) => e?.name === "MessageSent")!;
console.log(`Оплата в ETH: комісія ${ethers.formatEther(nativeFee)} ETH, messageId ${nativeSent.args.messageId}`);
