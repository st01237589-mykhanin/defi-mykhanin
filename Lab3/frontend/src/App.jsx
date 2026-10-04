import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const REFRESH_MS = 5000;

function App() {
  const [account, setAccount] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("Будь ласка, встановіть розширення MetaMask!");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setError("");
    } catch (err) {
      setError(`Підключення відхилено: ${err.message}`);
    }
  };

  const fetchHistory = useCallback(async (walletAddress) => {
    try {
      const response = await fetch(`${API_URL}/api/swaps?trader=${walletAddress}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setHistory(await response.json());
      setError("");
    } catch (err) {
      setError(`Помилка завантаження історії: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    if (!account) return;
    fetchHistory(account);
    const timer = setInterval(() => fetchHistory(account), REFRESH_MS);
    return () => clearInterval(timer);
  }, [account, fetchHistory]);

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccountsChanged = (accounts) => setAccount(accounts[0] ?? null);
    window.ethereum.on("accountsChanged", onAccountsChanged);
    return () => window.ethereum.removeListener("accountsChanged", onAccountsChanged);
  }, []);

  return (
    <main className="app">
      <h1>DeFi Пул (React SPA)</h1>

      {!account ? (
        <button onClick={connectWallet}>Підключити MetaMask</button>
      ) : (
        <p>
          <strong>Підключено:</strong> {account}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <h2>Історія обмінів (з БД)</h2>
      <table>
        <thead>
          <tr>
            <th>Блок</th>
            <th>Хеш транзакції</th>
            <th>Віддав (KHC)</th>
            <th>Отримав (FIAT)</th>
          </tr>
        </thead>
        <tbody>
          {history.length > 0 ? (
            history.map((swap) => (
              <tr key={`${swap.transactionHash}-${swap.logIndex}`}>
                <td>{swap.blockNumber}</td>
                <td className="hash">{swap.transactionHash}</td>
                <td>{ethers.formatEther(swap.amountIn)}</td>
                <td>{ethers.formatEther(swap.amountOut)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4">Історія порожня</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

export default App;
