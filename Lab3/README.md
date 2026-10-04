# Лабораторна робота №3 — Full-stack Web3

```
blockchain/  Hardhat: DexPool з подією Swap, скрипти deploy/trade, тести
backend/     ASP.NET Core: індексатор подій (Nethereum, HTTP Polling) + SQLite + REST API
frontend/    React (Vite): підключення MetaMask та таблиця історії з бекенду
```

## Запуск (4 термінали)

1. Локальна мережа:
   ```bash
   cd blockchain && npm install && npx hardhat node
   ```
2. Розгортання пулу та тестові обміни:
   ```bash
   cd blockchain && npm run deploy && npm run trade
   ```
3. Бекенд (http://localhost:5000):
   ```bash
   cd backend && dotnet run
   ```
4. Фронтенд (http://localhost:5173):
   ```bash
   cd frontend && npm install && npm run dev
   ```

У MetaMask імпортуйте приватний ключ **Account #1** з виводу `npx hardhat node`
(тестовий ключ Hardhat, лише для локальної мережі) — саме цей акаунт виконує обміни в `trade.ts`.

REST API: `GET http://localhost:5000/api/swaps?trader=0x...`

Тести контракту: `cd blockchain && npm test`
