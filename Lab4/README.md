# Лабораторна робота №4 — інтеграція з Uniswap V2

`DefiIntegrator` викликає офіційний `UniswapV2Router02` (Sepolia: `0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008`)
для додавання ліквідності та обміну токенів.

## Запуск на локальному форку Sepolia

1. Форк (тримати відкритим):
   ```bash
   npm install && npm run node
   ```
2. Емісія KHC/FIAT та розгортання інтегратора:
   ```bash
   npm run deploy
   ```
3. approve → provideLiquidity → swapTokens:
   ```bash
   npm run integrate
   ```

## Тести

```bash
npm test
```

Тести розгортають Uniswap V2 (WETH9, Factory, Router02) з офіційних npm-збірок і не потребують мережі.
