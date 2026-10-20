import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("CrossChainMessenger + MessageReceiver (CCIP Local Simulator)", function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();
    const simulator = await ethers.deployContract("CCIPLocalSimulator");
    const { chainSelector_, sourceRouter_, destinationRouter_, linkToken_ } = await simulator.configuration();

    const messenger = await ethers.deployContract("CrossChainMessenger", [sourceRouter_, linkToken_]);
    const receiver = await ethers.deployContract("MessageReceiver", [destinationRouter_]);
    await simulator.requestLinkFromFaucet(await messenger.getAddress(), ethers.parseEther("1"));

    return { owner, other, messenger, receiver, chainSelector: chainSelector_ };
  }

  it("Доставляє текстове повідомлення контракту-отримувачу", async function () {
    const { messenger, receiver, chainSelector } = await deployFixture();
    const text = "Hello L2 from L1!";

    const receipt = (await (await messenger.sendMessage(chainSelector, receiver, text)).wait())!;
    const sent = receipt.logs
      .map((log) => messenger.interface.parseLog(log))
      .find((event) => event?.name === "MessageSent")!;

    expect(await receiver.lastText()).to.equal(text);
    expect(await receiver.lastMessageId()).to.equal(sent.args.messageId);
    expect(await receiver.lastSender()).to.equal(await messenger.getAddress());
    expect(await receiver.lastSourceChainSelector()).to.equal(chainSelector);
    expect(await receiver.messagesReceived()).to.equal(1n);
  });

  it("Емітує MessageSent з адресою отримувача та текстом", async function () {
    const { messenger, receiver, chainSelector } = await deployFixture();

    await expect(messenger.sendMessage(chainSelector, receiver, "ping"))
      .to.emit(messenger, "MessageSent")
      .withArgs((id: string) => id !== ethers.ZeroHash, chainSelector, await receiver.getAddress(), "ping", 0n);
  });

  it("Надсилати повідомлення може лише власник", async function () {
    const { other, messenger, receiver, chainSelector } = await deployFixture();

    await expect(
      messenger.connect(other).sendMessage(chainSelector, receiver, "spam"),
    ).to.be.revertedWithCustomError(messenger, "OwnableUnauthorizedAccount");
  });

  it("Отримувач приймає повідомлення лише від маршрутизатора CCIP", async function () {
    const { other, receiver } = await deployFixture();
    const message = {
      messageId: ethers.ZeroHash,
      sourceChainSelector: 1n,
      sender: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [other.address]),
      data: ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["fake"]),
      destTokenAmounts: [],
    };

    await expect(receiver.connect(other).ccipReceive(message)).to.be.revertedWithCustomError(receiver, "InvalidRouter");
  });

  it("Оплачує комісію нативним ETH, якщо адреса LINK нульова", async function () {
    const simulator = await ethers.deployContract("CCIPLocalSimulator");
    const { chainSelector_, sourceRouter_, destinationRouter_ } = await simulator.configuration();
    const messenger = await ethers.deployContract("CrossChainMessenger", [sourceRouter_, ethers.ZeroAddress]);
    const receiver = await ethers.deployContract("MessageReceiver", [destinationRouter_]);
    const [owner] = await ethers.getSigners();
    await owner.sendTransaction({ to: await messenger.getAddress(), value: ethers.parseEther("0.01") });

    await messenger.sendMessage(chainSelector_, receiver, "native fee");

    expect(await receiver.lastText()).to.equal("native fee");
  });

  it("Власник може повернути невикористаний LINK", async function () {
    const { owner, messenger } = await deployFixture();
    const link = new ethers.Contract(
      await messenger.linkToken(),
      ["function balanceOf(address) view returns (uint256)"],
      owner,
    );

    await messenger.withdraw(owner.address);

    expect(await link.balanceOf(await messenger.getAddress())).to.equal(0n);
    expect(await link.balanceOf(owner.address)).to.equal(ethers.parseEther("1"));
  });
});
