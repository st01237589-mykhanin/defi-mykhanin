import { expect } from "chai";
import { network } from "hardhat";
import { deployUniswapV2 } from "../scripts/uniswap.js";

const { ethers } = await network.create();
const { parseEther } = ethers;

describe("AutoCompoundVault", function () {
  async function deployFixture() {
    const [owner, alice, bob, keeper] = await ethers.getSigners();
    const { router } = await deployUniswapV2(ethers);
    const routerAddr = await router.getAddress();

    const asset = await ethers.deployContract("AssetToken", ["Khanin Coin", "KHC", 1000000n]);
    const reward = await ethers.deployContract("AssetToken", ["Mock Fiat", "FIAT", 1000000n]);
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await asset.approve(routerAddr, parseEther("10000"));
    await reward.approve(routerAddr, parseEther("20000"));
    await router.addLiquidity(asset, reward, parseEther("10000"), parseEther("20000"), 0n, 0n, owner.address, deadline);

    const vault = await ethers.deployContract("AutoCompoundVault", [asset, reward, routerAddr, "Khanin Vault KHC", "vKHC"]);
    const vaultAddr = await vault.getAddress();

    for (const user of [alice, bob]) {
      await asset.transfer(user.address, parseEther("100000"));
      await asset.connect(user).approve(vaultAddr, ethers.MaxUint256);
    }

    return { alice, bob, keeper, router, asset, reward, vault, vaultAddr, deadline };
  }

  async function withRewardCompounded() {
    const fixture = await deployFixture();
    const { alice, keeper, reward, vault, vaultAddr, deadline } = fixture;
    await vault.connect(alice).deposit(parseEther("1000"));
    await reward.transfer(vaultAddr, parseEther("100"));
    await vault.connect(keeper).compound(0n, deadline);
    return fixture;
  }

  it("Перший депозит випускає акції 1:1 і блокує DEAD_SHARES на 0xdEaD", async function () {
    const { alice, vault } = await deployFixture();

    await vault.connect(alice).deposit(parseEther("1000"));

    expect(await vault.balanceOf(alice.address)).to.equal(parseEther("1000") - 1000n);
    expect(await vault.balanceOf("0x000000000000000000000000000000000000dEaD")).to.equal(1000n);
    expect(await vault.totalSupply()).to.equal(parseEther("1000"));
  });

  it("compound() обмінює винагороду на актив без випуску нових акцій", async function () {
    const { alice, keeper, router, asset, reward, vault, vaultAddr, deadline } = await deployFixture();
    await vault.connect(alice).deposit(parseEther("1000"));
    await reward.transfer(vaultAddr, parseEther("100"));
    const [, expectedOut] = await router.getAmountsOut(parseEther("100"), [reward, asset]);

    await expect(vault.connect(keeper).compound(expectedOut, deadline))
      .to.emit(vault, "Compounded")
      .withArgs(keeper.address, parseEther("100"), expectedOut);

    expect(await vault.totalAssets()).to.equal(parseEther("1000") + expectedOut);
    expect(await vault.totalSupply()).to.equal(parseEther("1000"));
    expect(await reward.balanceOf(vaultAddr)).to.equal(0n);
  });

  it("Після компаундингу інвестор знімає більше, ніж вніс", async function () {
    const { alice, asset, vault } = await withRewardCompounded();
    const shares = await vault.balanceOf(alice.address);
    const before = await asset.balanceOf(alice.address);

    await vault.connect(alice).withdraw(shares);

    expect((await asset.balanceOf(alice.address)) - before).to.be.greaterThan(parseEther("1049"));
  });

  it("Новий інвестор після компаундингу отримує менше акцій за ту саму суму", async function () {
    const { bob, vault } = await withRewardCompounded();

    await vault.connect(bob).deposit(parseEther("1000"));

    expect(await vault.balanceOf(bob.address)).to.be.lessThan(parseEther("953"));
  });

  it("compound() відхиляється без винагороди або при занадто високому мінімумі", async function () {
    const { alice, keeper, router, asset, reward, vault, vaultAddr, deadline } = await deployFixture();
    await vault.connect(alice).deposit(parseEther("1000"));

    await expect(vault.connect(keeper).compound(0n, deadline)).to.be.revertedWith("No rewards to compound");

    await reward.transfer(vaultAddr, parseEther("100"));
    const [, expectedOut] = await router.getAmountsOut(parseEther("100"), [reward, asset]);
    await expect(vault.connect(keeper).compound(expectedOut + 1n, deadline)).to.be.revertedWith(
      "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT",
    );
  });

  it("DEAD_SHARES роблять атаку першого депозиту збитковою для атакувальника", async function () {
    const { alice: attacker, bob: victim, asset, vault, vaultAddr } = await deployFixture();
    const donation = parseEther("10000");

    await vault.connect(attacker).deposit(1001n);
    await asset.connect(attacker).transfer(vaultAddr, donation);
    await vault.connect(victim).deposit(parseEther("10000"));

    const attackerValue = await vault.convertToAssets(await vault.balanceOf(attacker.address));
    const victimValue = await vault.convertToAssets(await vault.balanceOf(victim.address));

    expect(attackerValue).to.be.lessThan(donation / 100n);
    expect(victimValue).to.be.greaterThan((parseEther("10000") * 99n) / 100n);
  });
});
