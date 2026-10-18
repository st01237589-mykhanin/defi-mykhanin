# Лабораторна робота №7 — сховище з автоматичним реінвестуванням

`AutoCompoundVault` приймає KHC, випускає акції vKHC і через `compound()` продає винагороду FIAT
за KHC на Uniswap V2, через що кожна акція дорожчає.

```bash
npm install
npm run simulate
npm test
```

`simulate` у вбудованій мережі Hardhat розгортає Uniswap V2 (WETH9, Factory, Router02) з офіційних
npm-збірок, створює пул KHC/FIAT і відтворює цикл інвестора: депозит 1000 KHC, винагорода 100 FIAT,
`compound()` від імені keeper-а та зняття.
