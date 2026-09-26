import hre from "hardhat";

async function main() {
    // В Hardhat 3 ethers береться зі створеного connection
    const connection = await hre.network.create();
    const { ethers } = connection;
    
    const [, trader] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("AssetToken");
    const tokenA = await Token.deploy("Khanin Coin", "KHC", 100000);
    const tokenB = await Token.deploy("Mock Fiat", "FIAT", 100000);

    const DexPool = await ethers.getContractFactory("DexPool");
    const pool = await DexPool.deploy(await tokenA.getAddress(), await tokenB.getAddress());
    const poolAddr = await pool.getAddress();

    // 1. Надання ліквідності (1000 Токен А, 2000 Токен Б)
    await tokenA.approve(poolAddr, ethers.parseEther("1000"));
    await tokenB.approve(poolAddr, ethers.parseEther("2000"));
    await pool.addLiquidity(ethers.parseEther("1000"), ethers.parseEther("2000"));
    console.log("[Ліквідність] Додано 1000 KHC та 2000 FIAT у пул.");

    // 2. Трейдер виконує обмін 50 Токен А (50 = 5% від резерву, не перевищує поріг — комісія 0.1%)
    const swapAmount = "50";
    await tokenA.transfer(trader.address, ethers.parseEther(swapAmount));
    await tokenA.connect(trader).approve(poolAddr, ethers.parseEther(swapAmount));
    
    console.log(`\n[Трейдинг] Трейдер продає ${swapAmount} KHC...`);
    await pool.connect(trader).swapAforB(ethers.parseEther(swapAmount));

    const traderBalance = await tokenB.balanceOf(trader.address);
    console.log(`[Результат] Трейдер отримав: ${ethers.formatEther(traderBalance)} FIAT`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});