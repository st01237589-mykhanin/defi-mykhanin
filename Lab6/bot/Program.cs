using System.Numerics;
using System.Text.Json;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

const string EngineAbi = """
[
  {"inputs":[{"name":"user","type":"address"}],"name":"getHealthFactor","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"user","type":"address"}],"name":"kUsdMinted","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"user","type":"address"}],"name":"collateralDeposited","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"user","type":"address"}],"name":"liquidate","outputs":[],"stateMutability":"nonpayable","type":"function"}
]
""";
const string TokenAbi = """
[
  {"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
]
""";

var minHealthFactor = BigInteger.Pow(10, 18);
var noDebt = BigInteger.Pow(2, 256) - 1;

var rpcUrl = Environment.GetEnvironmentVariable("RPC_URL") ?? "http://127.0.0.1:8545";
var privateKey = Environment.GetEnvironmentVariable("LIQUIDATOR_PRIVATE_KEY")
    ?? throw new InvalidOperationException("Встановіть змінну середовища LIQUIDATOR_PRIVATE_KEY");
var pollInterval = TimeSpan.FromSeconds(int.Parse(Environment.GetEnvironmentVariable("POLL_SECONDS") ?? "12"));
var deploymentFile = Environment.GetEnvironmentVariable("DEPLOYMENT_FILE") ?? "../deployment.json";

using var deployment = JsonDocument.Parse(File.ReadAllText(deploymentFile));
var engineAddress = deployment.RootElement.GetProperty("engine").GetString()!;
var kUsdAddress = deployment.RootElement.GetProperty("kUsd").GetString()!;
var borrowers = args.Length > 0 ? args : [deployment.RootElement.GetProperty("borrower").GetString()!];

var chainId = await new Web3(rpcUrl).Eth.ChainId.SendRequestAsync();
var account = new Account(privateKey, chainId);
var web3 = new Web3(account, rpcUrl);

var engine = web3.Eth.GetContract(EngineAbi, engineAddress);
var getHealthFactor = engine.GetFunction("getHealthFactor");
var kUsdMinted = engine.GetFunction("kUsdMinted");
var collateralDeposited = engine.GetFunction("collateralDeposited");
var liquidate = engine.GetFunction("liquidate");
var balanceOf = web3.Eth.GetContract(TokenAbi, kUsdAddress).GetFunction("balanceOf");

Log($"Бот-ліквідатор {account.Address} | chainId {chainId.Value} | StableEngine {engineAddress}");
Log($"Моніторинг: {string.Join(", ", borrowers)} | інтервал {pollInterval.TotalSeconds} с");

while (true)
{
    foreach (var user in borrowers)
    {
        try
        {
            var healthFactor = await getHealthFactor.CallAsync<BigInteger>(user);
            if (healthFactor == noDebt)
            {
                Log($"{user} | боргу немає");
                continue;
            }
            if (healthFactor >= minHealthFactor)
            {
                Log($"{user} | HF {Web3.Convert.FromWei(healthFactor)}");
                continue;
            }

            var debt = await kUsdMinted.CallAsync<BigInteger>(user);
            Log($"[УВАГА] {user} | HF {Web3.Convert.FromWei(healthFactor)} < 1, борг {Web3.Convert.FromWei(debt)} KUSD. Ліквідація...");

            var balance = await balanceOf.CallAsync<BigInteger>(account.Address);
            if (balance < debt)
            {
                Log($"Недостатньо KUSD для погашення: {Web3.Convert.FromWei(balance)} < {Web3.Convert.FromWei(debt)}");
                continue;
            }

            var collateralBefore = await collateralDeposited.CallAsync<BigInteger>(user);
            var gas = await liquidate.EstimateGasAsync(account.Address, null, null, user);
            var receipt = await liquidate.SendTransactionAndWaitForReceiptAsync(account.Address, gas, null, null, user);
            if (receipt.Status.Value != 1)
            {
                Log($"[ПОМИЛКА] Транзакцію {receipt.TransactionHash} скасовано");
                continue;
            }

            var seized = collateralBefore - await collateralDeposited.CallAsync<BigInteger>(user);
            Log($"[УСПІХ] Позицію ліквідовано у блоці {receipt.BlockNumber.Value}. Tx: {receipt.TransactionHash}");
            Log($"Погашено {Web3.Convert.FromWei(debt)} KUSD, отримано {Web3.Convert.FromWei(seized)} ETH застави (з бонусом 10%), газ {receipt.GasUsed.Value}");
        }
        catch (Exception ex)
        {
            Log($"Помилка перевірки {user}: {ex.Message}");
        }
    }

    await Task.Delay(pollInterval);
}

static void Log(string message) => Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {message}");
