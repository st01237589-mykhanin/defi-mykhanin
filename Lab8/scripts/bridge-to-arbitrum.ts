import { network } from "hardhat";

const ARBITRUM_SEPOLIA_INBOX = "0xaAe29B0366299461418F5324a79Afc425BE5ae21";
const AMOUNT = "0.005";

const { ethers } = await network.create();
const [sender] = await ethers.getSigners();
const inbox = new ethers.Contract(ARBITRUM_SEPOLIA_INBOX, ["function depositEth() payable returns (uint256)"], sender);

const receipt = (await (await inbox.depositEth({ value: ethers.parseEther(AMOUNT) })).wait())!;
console.log(`Депозит ${AMOUNT} ETH у міст Arbitrum: tx ${receipt.hash}`);
console.log(`ETH з'явиться на ${sender.address} в Arbitrum Sepolia приблизно через 10-15 хвилин`);
