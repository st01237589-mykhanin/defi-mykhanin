using System.Numerics;
using System.Text.Json;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;
using Nethereum.Hex.HexConvertors.Extensions;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

const string MessengerAbi = """
[
  {"inputs":[{"name":"_destinationChainSelector","type":"uint64"},{"name":"_receiver","type":"address"},{"name":"_text","type":"string"}],"name":"sendMessage","outputs":[{"name":"messageId","type":"bytes32"}],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"_destinationChainSelector","type":"uint64"},{"name":"_receiver","type":"address"},{"name":"_text","type":"string"}],"name":"getFee","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"linkToken","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"}
]
""";
const string ReceiverAbi = """
[
  {"inputs":[],"name":"lastMessageId","outputs":[{"name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"lastText","outputs":[{"name":"","type":"string"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"lastSender","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"}
]
""";
const string LinkAbi = """
[
  {"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
]
""";

var sourceRpcUrl = Env("SOURCE_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com");
var destinationRpcUrl = Env("DEST_RPC_URL", "https://arbitrum-sepolia-rpc.publicnode.com");
var privateKey = Environment.GetEnvironmentVariable("PRIVATE_KEY")
    ?? throw new InvalidOperationException("Встановіть змінну середовища PRIVATE_KEY");
var pollInterval = TimeSpan.FromSeconds(int.Parse(Env("POLL_SECONDS", "30")));
var waitLimit = TimeSpan.FromMinutes(int.Parse(Env("WAIT_MINUTES", "40")));
var text = args.Length > 0 ? string.Join(' ', args) : "Hello L2 from L1! (Khanin)";

using var deployment = JsonDocument.Parse(File.ReadAllText(Env("DEPLOYMENT_FILE", "../deployment.json")));
var messengerAddress = deployment.RootElement.GetProperty("messenger").GetString()!;
var receiverAddress = deployment.RootElement.GetProperty("receiver").GetString()!;
var destinationChainSelector = ulong.Parse(deployment.RootElement.GetProperty("destinationChainSelector").GetString()!);

var chainId = await new Web3(sourceRpcUrl).Eth.ChainId.SendRequestAsync();
var account = new Account(privateKey, chainId);
var web3L1 = new Web3(account, sourceRpcUrl);
var web3L2 = new Web3(destinationRpcUrl);

var messenger = web3L1.Eth.GetContract(MessengerAbi, messengerAddress);
var sendMessage = messenger.GetFunction("sendMessage");
var linkAddress = await messenger.GetFunction("linkToken").CallAsync<string>();
var paysInNative = new BigInteger(linkAddress.HexToByteArray()) == 0;
var feeUnit = paysInNative ? "ETH" : "LINK";
var feeBalance = paysInNative
    ? (await web3L1.Eth.GetBalance.SendRequestAsync(messengerAddress)).Value
    : await web3L1.Eth.GetContract(LinkAbi, linkAddress).GetFunction("balanceOf").CallAsync<BigInteger>(messengerAddress);
var fee = await messenger.GetFunction("getFee").CallAsync<BigInteger>(destinationChainSelector, receiverAddress, text);

Log($"[Агент] {account.Address} | вихідна мережа chainId {chainId.Value}");
Log($"CrossChainMessenger {messengerAddress}: {Web3.Convert.FromWei(feeBalance)} {feeUnit}, комісія {Web3.Convert.FromWei(fee)} {feeUnit}");
Log($"Ініціалізація крос-чейн транзакції до {receiverAddress} (selector {destinationChainSelector}): \"{text}\"");

var gas = await sendMessage.EstimateGasAsync(account.Address, null, null, destinationChainSelector, receiverAddress, text);
var receipt = await sendMessage.SendTransactionAndWaitForReceiptAsync(account.Address, gas, null, null, destinationChainSelector, receiverAddress, text);
if (receipt.Status.Value != 1)
{
    Log($"[ПОМИЛКА] Транзакцію {receipt.TransactionHash} скасовано");
    return 1;
}

var sent = receipt.DecodeAllEvents<MessageSentEvent>().Single().Event;
var messageId = sent.MessageId.ToHex(true);
Log($"[УСПІХ] Транзакцію включено у блок L1: {receipt.BlockNumber.Value}");
Log($"Хеш транзакції (TxHash): {receipt.TransactionHash}");
Log($"MessageId: {messageId}, сплачено {Web3.Convert.FromWei(sent.FeePaid)} {feeUnit}");
Log($"CCIP Explorer: https://ccip.chain.link/msg/{messageId}");

var receiver = web3L2.Eth.GetContract(ReceiverAbi, receiverAddress);
Log($"Очікування доставки в цільовій мережі, опитування кожні {pollInterval.TotalSeconds} с...");
var deadline = DateTime.UtcNow + waitLimit;
while (DateTime.UtcNow < deadline)
{
    var lastMessageId = (await receiver.GetFunction("lastMessageId").CallAsync<byte[]>()).ToHex(true);
    if (lastMessageId == messageId)
    {
        var deliveredText = await receiver.GetFunction("lastText").CallAsync<string>();
        var sender = await receiver.GetFunction("lastSender").CallAsync<string>();
        Log($"[ДОСТАВЛЕНО] MessageReceiver {receiverAddress} отримав \"{deliveredText}\" від {sender}");
        return 0;
    }

    Log("Повідомлення ще в дорозі...");
    await Task.Delay(pollInterval);
}

Log("Час очікування вичерпано, перевірте статус у CCIP Explorer");
return 2;

static string Env(string name, string fallback) => Environment.GetEnvironmentVariable(name) ?? fallback;

static void Log(string message) => Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {message}");

[Event("MessageSent")]
class MessageSentEvent : IEventDTO
{
    [Parameter("bytes32", "messageId", 1, true)]
    public byte[] MessageId { get; set; } = [];

    [Parameter("uint64", "destinationChainSelector", 2, true)]
    public ulong DestinationChainSelector { get; set; }

    [Parameter("address", "receiver", 3, false)]
    public string Receiver { get; set; } = "";

    [Parameter("string", "text", 4, false)]
    public string Text { get; set; } = "";

    [Parameter("uint256", "feePaid", 5, false)]
    public BigInteger FeePaid { get; set; }
}
