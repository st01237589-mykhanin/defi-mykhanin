# Лабораторна робота №8 — крос-чейн повідомлення через Chainlink CCIP

`CrossChainMessenger` (Ethereum Sepolia) надсилає текст через CCIP Router, оплачуючи комісію в LINK.
`MessageReceiver` (Arbitrum Sepolia) зберігає отримане повідомлення. `agent/` — бекенд-агент на C# (Nethereum).

## Testnet: Sepolia → Arbitrum Sepolia

Потрібно близько 0.02 Sepolia ETH. Якщо на гаманці є 1 LINK, комісія сплачується в LINK, інакше в ETH.
ETH для Arbitrum Sepolia переказує `npm run bridge` через міст Arbitrum (10-15 хвилин).

```bash
npm install
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npm run bridge
npm run deploy:messenger
npm run deploy:receiver
cd agent
read -s PRIVATE_KEY && export PRIVATE_KEY
dotnet run
```

Агент виводить TxHash, MessageId і посилання на CCIP Explorer та чекає доставки в Arbitrum Sepolia (зазвичай 10–20 хвилин).

## Локально (CCIP Local Simulator)

```bash
npm run node
npm run deploy:local
cd agent && PRIVATE_KEY=<Private Key акаунта #0 з виводу npm run node> SOURCE_RPC_URL=http://127.0.0.1:8545 DEST_RPC_URL=http://127.0.0.1:8545 POLL_SECONDS=2 dotnet run
```

## Перевірка з реальним CCIP Router на форку Sepolia

```bash
npm run node:fork
npm run fork-check
```

## Тести

```bash
npm test
```
