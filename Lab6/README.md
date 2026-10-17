# Лабораторна робота №6 — оракул Chainlink і бот-ліквідатор

`StableEngine` бере ціну ETH/USD з Chainlink (Sepolia: `0x694AA1769357215DE4FAC081bf1f309aDC325306`)
і дозволяє ліквідувати позиції з HF < 1 з бонусом 10%. `bot/` — бот-ліквідатор на C# (Nethereum).

## Sepolia

Потрібні два гаманці: основний (розгортання і позиція боржника, ~0.04 Sepolia ETH) та ліквідатора
(ETH йому надішле `open-position`).

```bash
npm install
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat keystore set LIQUIDATOR_PRIVATE_KEY
npm run deploy:sepolia
npm run open-position:sepolia
```

Бот (окрема вкладка):
```bash
cd bot
read -s LIQUIDATOR_PRIVATE_KEY && export LIQUIDATOR_PRIVATE_KEY
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com dotnet run
```

Обвал позиції:
```bash
npm run crash:sepolia
```

## Локальний форк Sepolia

```bash
npm run node
npm run deploy && npm run open-position
cd bot && LIQUIDATOR_PRIVATE_KEY=<Private Key акаунта #1 з виводу npm run node> POLL_SECONDS=3 dotnet run
npm run crash
```

## Тести

```bash
npm test
```
