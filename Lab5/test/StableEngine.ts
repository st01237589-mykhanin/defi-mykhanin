import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("StableEngine (KhaninUSD)", function () {
  async function deployFixture() {
    const [deployer, user, other] = await ethers.getSigners();
    const kUsd = await ethers.deployContract("StableCoin", [deployer.address]);
    const engine = await ethers.deployContract("StableEngine", [await kUsd.getAddress()]);
    await kUsd.transferOwnership(await engine.getAddress());
    return { deployer, user, other, kUsd, engine };
  }

  async function withMaxDebt() {
    const fixture = await deployFixture();
    const { user, engine } = fixture;
    await engine.connect(user).depositCollateral({ value: ethers.parseEther("2") });
    const maxDebt = (ethers.parseEther("4000") * 100n) / 150n;
    await engine.connect(user).mintStablecoin(maxDebt);
    return { ...fixture, maxDebt };
  }

  it("Токен KhaninUSD належить StableEngine, прямий mint заборонено", async function () {
    const { deployer, kUsd, engine } = await deployFixture();

    expect(await kUsd.name()).to.equal("KhaninUSD");
    expect(await kUsd.owner()).to.equal(await engine.getAddress());
    await expect(kUsd.mint(deployer.address, 1n)).to.be.revertedWithCustomError(
      kUsd,
      "OwnableUnauthorizedAccount",
    );
  });

  it("Дозволяє випустити рівно 66.67% від вартості застави (CR 150%)", async function () {
    const { user, kUsd, engine, maxDebt } = await withMaxDebt();

    expect(await kUsd.balanceOf(user.address)).to.equal(maxDebt);
    expect(await engine.getHealthFactor(user.address)).to.equal(ethers.parseEther("1"));
    await expect(engine.connect(user).mintStablecoin(1n)).to.be.revertedWith(
      "Health factor is broken (under 1.0)",
    );
  });

  it("withdrawCollateral відхиляється, якщо HF падає нижче 1", async function () {
    const { user, engine } = await withMaxDebt();

    await expect(engine.connect(user).withdrawCollateral(ethers.parseEther("1"))).to.be.revertedWith(
      "Health factor is broken (under 1.0)",
    );
    expect(await engine.collateralDeposited(user.address)).to.equal(ethers.parseEther("2"));
  });

  it("burnStablecoin зменшує борг і спалює токени", async function () {
    const { user, kUsd, engine, maxDebt } = await withMaxDebt();
    const amount = ethers.parseEther("1000");

    await expect(engine.connect(user).burnStablecoin(amount))
      .to.emit(engine, "StablecoinBurned")
      .withArgs(user.address, amount);

    expect(await engine.kUsdMinted(user.address)).to.equal(maxDebt - amount);
    expect(await kUsd.totalSupply()).to.equal(maxDebt - amount);
    await expect(engine.connect(user).burnStablecoin(maxDebt)).to.be.revertedWith("Burn amount exceeds debt");
  });

  it("Після погашення боргу withdrawCollateral повертає ETH", async function () {
    const { user, engine, maxDebt } = await withMaxDebt();
    await engine.connect(user).burnStablecoin(maxDebt);

    await expect(engine.connect(user).withdrawCollateral(ethers.parseEther("2"))).to.changeEtherBalances(
      ethers,
      [user, engine],
      [ethers.parseEther("2"), -ethers.parseEther("2")],
    );
    expect(await engine.collateralDeposited(user.address)).to.equal(0n);
  });

  it("Падіння ціни ETH знижує Health Factor нижче 1", async function () {
    const { user, engine } = await withMaxDebt();

    await engine.setMockOraclePrice(ethers.parseEther("1500"));

    expect(await engine.getHealthFactor(user.address)).to.equal(ethers.parseEther("0.75"));
  });

  it("Змінювати ціну оракула може лише власник", async function () {
    const { other, engine } = await deployFixture();

    await expect(engine.connect(other).setMockOraclePrice(1n)).to.be.revertedWithCustomError(
      engine,
      "OwnableUnauthorizedAccount",
    );
  });
});
