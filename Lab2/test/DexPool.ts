import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("DexPool (динамічна комісія)", function () {
  async function deployPool() {
    const [owner, trader] = await ethers.getSigners();

    const tokenA = await ethers.deployContract("AssetToken", ["Khanin Coin", "KHC", 100000n]);
    const tokenB = await ethers.deployContract("AssetToken", ["Mock Fiat", "FIAT", 100000n]);
    const pool = await ethers.deployContract("DexPool", [
      await tokenA.getAddress(),
      await tokenB.getAddress(),
    ]);
    const poolAddr = await pool.getAddress();

    // Ліквідність у пропорції 1:2
    await tokenA.approve(poolAddr, ethers.parseEther("1000"));
    await tokenB.approve(poolAddr, ethers.parseEther("2000"));
    await pool.addLiquidity(ethers.parseEther("1000"), ethers.parseEther("2000"));

    await tokenA.transfer(trader.address, ethers.parseEther("1000"));
    await tokenA.connect(trader).approve(poolAddr, ethers.MaxUint256);

    return { owner, trader, tokenA, tokenB, pool };
  }

  // Формула (2.2) у цілочисельній арифметиці, як у контракті
  function expectedOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, fee: bigint) {
    const amountInWithFee = amountIn * fee;
    return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
  }

  it("Застосовує комісію 0.1% для угоди до 5% резерву (50 KHC)", async function () {
    const { trader, tokenB, pool } = await deployPool();
    const amountIn = ethers.parseEther("50");

    await pool.connect(trader).swapAforB(amountIn);

    const expected = expectedOut(amountIn, ethers.parseEther("1000"), ethers.parseEther("2000"), 999n);
    expect(await tokenB.balanceOf(trader.address)).to.equal(expected);
  });

  it("Застосовує комісію 5% для угоди понад 5% резерву (100 KHC)", async function () {
    const { trader, tokenB, pool } = await deployPool();
    const amountIn = ethers.parseEther("100");

    await pool.connect(trader).swapAforB(amountIn);

    const expected = expectedOut(amountIn, ethers.parseEther("1000"), ethers.parseEther("2000"), 950n);
    expect(await tokenB.balanceOf(trader.address)).to.equal(expected);
  });

  it("Константа k зростає після обміну", async function () {
    const { trader, pool } = await deployPool();
    const kBefore = (await pool.reserveA()) * (await pool.reserveB());

    await pool.connect(trader).swapAforB(ethers.parseEther("50"));

    const kAfter = (await pool.reserveA()) * (await pool.reserveB());
    expect(kAfter > kBefore).to.equal(true);
  });

  it("Відхиляє обмін нульової суми", async function () {
    const { trader, pool } = await deployPool();
    await expect(pool.connect(trader).swapAforB(0n)).to.be.revertedWith(
      "Amount must be greater than zero",
    );
  });
});
