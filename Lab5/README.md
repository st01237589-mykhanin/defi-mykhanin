# Лабораторна робота №5 — стейблкоїн KhaninUSD

`StableCoin` (KhaninUSD, KUSD) випускає та спалює лише `StableEngine`, який приймає ETH у заставу
з коефіцієнтом забезпечення 150% і перевіряє Health Factor.

```bash
npm install
npm run simulate
npm test
```

`simulate` виконує сценарій у вбудованій мережі Hardhat: депозит 2 ETH, емісія максимальної суми KUSD,
спроба зняти 1 ETH (revert), погашення частини боргу, зняття та падіння ціни ETH.
