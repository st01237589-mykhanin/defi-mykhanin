import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("StableEngine (Chainlink + ліквідація)", function () {
  async function deployFixture() {
    const [owner, borrower, liquidator] = await ethers.getSigners();
    const priceFeed = await ethers.deployContract("MockV3Aggregator", [8, 2000_00000000n]);
    const kUsd = await ethers.deployContract("StableCoin", [owner.address]);
    const engine = await ethers.deployContract("StableEngine", [
      await kUsd.getAddress(),
      await priceFeed.getAddress(),
    ]);
    await kUsd.transferOwnership(await engine.getAddress());
    return { owner, borrower, liquidator, priceFeed, kUsd, engine };
  }

  async function withPositions() {
    const fixture = await deployFixture();
    const { borrower, liquidator, engine } = fixture;
    const debt = ethers.parseEther("1000");

    await engine.connect(borrower).depositCollateral({ value: ethers.parseEther("1") });
    await engine.connect(borrower).mintStablecoin(debt);
    await engine.connect(liquidator).depositCollateral({ value: ethers.parseEther("2") });
    await engine.connect(liquidator).mintStablecoin(debt);

    return { ...fixture, debt };
  }

  it("Масштабує ціну Chainlink з 8 до 18 десяткових знаків", async function () {
    const { engine } = await deployFixture();

    expect(await engine.getUsdValue(ethers.parseEther("1"))).to.equal(ethers.parseEther("2000"));
  });

  it("Не дозволяє ліквідувати позицію з HF ≥ 1", async function () {
    const { borrower, liquidator, engine } = await withPositions();

    await expect(engine.connect(liquidator).liquidate(borrower.address)).to.be.revertedWith("Health factor is ok");
  });

  it("Тестову функцію зменшення застави може викликати лише власник", async function () {
    const { borrower, liquidator, engine } = await withPositions();

    await expect(
      engine.connect(liquidator).reduceCollateralForTesting(borrower.address, 1n),
    ).to.be.revertedWithCustomError(engine, "OwnableUnauthorizedAccount");
  });

  it("Ліквідатор погашає борг і отримує заставу з бонусом 10%", async function () {
    const { borrower, liquidator, kUsd, engine, debt } = await withPositions();
    await engine.reduceCollateralForTesting(borrower.address, ethers.parseEther("0.3"));
    expect(await engine.getHealthFactor(borrower.address)).to.be.lessThan(ethers.parseEther("1"));

    const reward = (ethers.parseEther("0.5") * 110n) / 100n;

    const tx = engine.connect(liquidator).liquidate(borrower.address);
    await expect(tx).to.emit(engine, "Liquidated").withArgs(borrower.address, liquidator.address, debt, reward);
    await expect(tx).to.changeEtherBalances(ethers, [liquidator, engine], [reward, -reward]);

    expect(await engine.kUsdMinted(borrower.address)).to.equal(0n);
    expect(await kUsd.balanceOf(liquidator.address)).to.equal(0n);
    expect(await engine.collateralDeposited(borrower.address)).to.equal(ethers.parseEther("0.7") - reward);
  });

  it("Падіння ціни в оракулі робить позицію доступною для ліквідації", async function () {
    const { borrower, liquidator, priceFeed, engine } = await withPositions();

    await priceFeed.updateAnswer(1400_00000000n);

    expect(await engine.getHealthFactor(borrower.address)).to.be.lessThan(ethers.parseEther("1"));
    await expect(engine.connect(liquidator).liquidate(borrower.address)).to.emit(engine, "Liquidated");
  });

  it("Відхиляє розрахунки із застарілою ціною оракула", async function () {
    const { borrower, engine } = await withPositions();

    await networkHelpers.time.increase(3 * 60 * 60 + 1);

    await expect(engine.getHealthFactor(borrower.address)).to.be.revertedWith("Stale oracle price");
  });

  it("withdrawCollateral відхиляється, якщо HF падає нижче 1", async function () {
    const { borrower, engine } = await withPositions();

    await expect(engine.connect(borrower).withdrawCollateral(ethers.parseEther("0.5"))).to.be.revertedWith(
      "Health factor is broken (under 1.0)",
    );
  });
});
