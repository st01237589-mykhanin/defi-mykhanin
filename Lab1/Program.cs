using Nethereum.Signer;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

const string targetPrefix = "0x23"; 
const string rpcUrl = "https://ethereum-sepolia-rpc.publicnode.com";

Console.WriteLine($"Пошук гаманця з префіксом {targetPrefix}...");
EthECKey ecKey;
string address;
var attempts = 0;

// Proof of Work
do
{
    ecKey = EthECKey.GenerateKey();
    address = ecKey.GetPublicAddress();
    attempts++;
} while (!address.StartsWith(targetPrefix, StringComparison.OrdinalIgnoreCase));

var privateKey = ecKey.GetPrivateKey();

Console.WriteLine($"Знайдено за {attempts} спроб!\nАдреса: {address}\nПриватний ключ: {privateKey}");
            
Console.WriteLine("\nПоповніть адресу через Sepolia Faucet та натисніть Enter...");
Console.ReadLine();

var account = new Account(privateKey);
var web3 = new Web3(account, rpcUrl);
var balanceWei = await web3.Eth.GetBalance.SendRequestAsync(address);
var balanceEth = Web3.Convert.FromWei(balanceWei.Value);
Console.WriteLine($"Баланс: {balanceEth} ETH");

if (balanceEth > 0)
{
    Console.WriteLine("Відправка транзакції...");
    const string toAddress = "0x000000000000000000000000000000000000dEaD";
    
    // Використовуємо вбудований сервіс передачі ефіру:
    var receipt = await web3.Eth.GetEtherTransferService()
        .TransferEtherAndWaitForReceiptAsync(toAddress, 0.001m);

    Console.WriteLine($"Транзакція успішна!");
    Console.WriteLine($"Хеш транзакції: {receipt.TransactionHash}");
    Console.WriteLine($"Номер блоку: {receipt.BlockNumber}");
}
else
{
    Console.WriteLine("Недостатньо коштів для відправки.");
}
