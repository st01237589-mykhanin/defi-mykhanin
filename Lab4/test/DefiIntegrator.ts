import { expect } from "chai";
import { createRequire } from "node:module";
import { network } from "hardhat";

const require = createRequire(import.meta.url);
const UniswapV2Factory = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const UniswapV2Pair = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const UniswapV2Router02 = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
const WETH9 = require("@uniswap/v2-periphery/build/WETH9.json");

const { ethers } = await network.create();

const MINIMUM_LIQUIDITY = 1000n;

function sqrt(value: bigint) {
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

describe("DefiIntegrator (Uniswap V2)", function () {
  async function deployFixture() {
    const [owner, user] = await ethers.getSigners();

    async function deployArtifact(artifact: { abi: any[]; bytecode: string }, ...args: unknown[]) {
      const factory = await ethers.getContractFactory(artifact.abi, artifact.bytecode);
      const contract = await factory.deploy(...args);
      return new ethers.Contract(await contract.getAddress(), artifact.abi, owner);
    }

    const weth = await deployArtifact(WETH9);
    const factory = await deployArtifact(UniswapV2Factory, owner.address);
    const router = await deployArtifact(
      UniswapV2Router02,
      await factory.getAddress(),
      await weth.getAddress(),
    );

    const tokenA = await ethers.deployContract("AssetToken", ["Khanin Coin", "KHC", 100000n]);
    const tokenB = await ethers.deployContract("AssetToken", ["Mock Fiat", "FIAT", 100000n]);
    const integrator = await ethers.deployContract("DefiIntegrator", [await router.getAddress()]);
    const integratorAddr = await integrator.getAddress();

    for (const token of [tokenA, tokenB]) {
      await token.transfer(user.address, ethers.parseEther("10000"));
      await token.connect(user).approve(integratorAddr, ethers.MaxUint256);
    }

    return { user, factory, router, tokenA, tokenB, integrator, integratorAddr };
  }

  async function deadline() {
    return (await ethers.provider.getBlock("latest"))!.timestamp + 300;
  }

  async function withLiquidity() {
    const fixture = await deployFixture();
    const { user, tokenA, tokenB, integrator } = fixture;
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("2000");

    await integrator
      .connect(user)
      .provideLiquidity(tokenA, tokenB, amountA, amountB, amountA, amountB, await deadline());

    return fixture;
  }

  it("provideLiquidity створює пул і відправляє LP-токени користувачу", async function () {
    const { user, factory, tokenA, tokenB, integrator, integratorAddr } = await deployFixture();
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("2000");
    const expectedLiquidity = sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;

    await expect(
      integrator
        .connect(user)
        .provideLiquidity(tokenA, tokenB, amountA, amountB, amountA, amountB, await deadline()),
    )
      .to.emit(integrator, "LiquidityProvided")
      .withArgs(user.address, await tokenA.getAddress(), await tokenB.getAddress(), amountA, amountB, expectedLiquidity);

    const pairAddr = await factory.getPair(tokenA, tokenB);
    const pair = new ethers.Contract(pairAddr, UniswapV2Pair.abi, user);

    expect(pairAddr).to.not.equal(ethers.ZeroAddress);
    expect(await pair.balanceOf(user.address)).to.equal(expectedLiquidity);
    expect(await pair.balanceOf(integratorAddr)).to.equal(0n);
    expect(await tokenA.balanceOf(integratorAddr)).to.equal(0n);
    expect(await tokenB.balanceOf(integratorAddr)).to.equal(0n);
  });

  it("Повертає користувачу надлишок токенів при додаванні в існуючий пул", async function () {
    const { user, tokenB, tokenA, integrator, integratorAddr } = await withLiquidity();
    const balanceBefore = await tokenB.balanceOf(user.address);

    await integrator
      .connect(user)
      .provideLiquidity(
        tokenA,
        tokenB,
        ethers.parseEther("100"),
        ethers.parseEther("500"),
        ethers.parseEther("100"),
        0n,
        await deadline(),
      );

    expect(balanceBefore - (await tokenB.balanceOf(user.address))).to.equal(ethers.parseEther("200"));
    expect(await tokenB.balanceOf(integratorAddr)).to.equal(0n);
  });

  it("swapTokens обмінює Токен А на Токен Б через пул Uniswap", async function () {
    const { user, router, tokenA, tokenB, integrator, integratorAddr } = await withLiquidity();
    const amountIn = ethers.parseEther("50");
    const [, expectedOut] = await router.getAmountsOut(amountIn, [tokenA, tokenB]);
    const balanceBefore = await tokenB.balanceOf(user.address);

    await expect(
      integrator.connect(user).swapTokens(tokenA, tokenB, amountIn, expectedOut, await deadline()),
    )
      .to.emit(integrator, "TokensSwapped")
      .withArgs(user.address, await tokenA.getAddress(), await tokenB.getAddress(), amountIn, expectedOut);

    const reserveIn = ethers.parseEther("1000");
    const reserveOut = ethers.parseEther("2000");
    expect(expectedOut).to.equal((amountIn * 997n * reserveOut) / (reserveIn * 1000n + amountIn * 997n));
    expect((await tokenB.balanceOf(user.address)) - balanceBefore).to.equal(expectedOut);
    expect(await tokenA.balanceOf(integratorAddr)).to.equal(0n);
  });

  it("Відхиляє обмін, якщо результат менший за amountOutMin", async function () {
    const { user, router, tokenA, tokenB, integrator } = await withLiquidity();
    const amountIn = ethers.parseEther("50");
    const [, expectedOut] = await router.getAmountsOut(amountIn, [tokenA, tokenB]);

    await expect(
      integrator.connect(user).swapTokens(tokenA, tokenB, amountIn, expectedOut + 1n, await deadline()),
    ).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
  });

  it("Відхиляє обмін після дедлайну", async function () {
    const { user, tokenA, tokenB, integrator } = await withLiquidity();
    const expired = (await ethers.provider.getBlock("latest"))!.timestamp - 1;

    await expect(
      integrator.connect(user).swapTokens(tokenA, tokenB, ethers.parseEther("50"), 0n, expired),
    ).to.be.revertedWith("UniswapV2Router: EXPIRED");
  });
});
