using System.Numerics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nethereum.Hex.HexTypes;
using Nethereum.RPC.Eth.DTOs;
using Nethereum.Web3;
using SwapIndexer.Data;
using SwapIndexer.Models;

namespace SwapIndexer.Services;

public class Web3IndexerService(
    IServiceScopeFactory scopeFactory,
    IOptions<BlockchainOptions> options,
    IHostEnvironment environment,
    ILogger<Web3IndexerService> logger) : BackgroundService
{
    private readonly BlockchainOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var web3 = new Web3(_options.RpcUrl);
        logger.LogInformation("Слухаємо події Swap через {RpcUrl}...", _options.RpcUrl);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PollAsync(web3, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning("Помилка опитування RPC: {Message}", ex.Message);
            }

            await Task.Delay(TimeSpan.FromSeconds(_options.PollingIntervalSeconds), stoppingToken);
        }
    }

    private async Task PollAsync(Web3 web3, CancellationToken ct)
    {
        var contract = ResolveContract();
        if (contract is null)
        {
            logger.LogWarning("Адресу контракту не знайдено: розгорніть DexPool (npm run deploy)");
            return;
        }
        var (address, startBlock) = contract.Value;

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var latest = (long)(await web3.Eth.Blocks.GetBlockNumber.SendRequestAsync()).Value;
        var state = await db.SyncStates.SingleOrDefaultAsync(s => s.Id == 1, ct);

        if (state is null
            || !state.ContractAddress.Equals(address, StringComparison.OrdinalIgnoreCase)
            || latest < state.LastBlock)
        {
            await db.Swaps.ExecuteDeleteAsync(ct);
            if (state is null)
            {
                state = new SyncState { Id = 1 };
                db.SyncStates.Add(state);
            }
            state.ContractAddress = address;
            state.LastBlock = startBlock - 1;
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Індексуємо контракт {Address} з блоку {Block}", address, startBlock);
        }

        if (latest <= state.LastBlock) return;

        var fromBlock = state.LastBlock + 1;
        var toBlock = Math.Min(latest, fromBlock + _options.MaxBlockRange - 1);

        var swapEvent = web3.Eth.GetEvent<SwapEventDTO>(address);
        var filter = swapEvent.CreateFilterInput(ToBlockParameter(fromBlock), ToBlockParameter(toBlock));
        var logs = await swapEvent.GetAllChangesAsync(filter);

        foreach (var log in logs)
        {
            db.Swaps.Add(new SwapRecord
            {
                TransactionHash = log.Log.TransactionHash,
                LogIndex = (int)log.Log.LogIndex.Value,
                BlockNumber = (long)log.Log.BlockNumber.Value,
                Trader = log.Event.Trader.ToLowerInvariant(),
                AmountIn = log.Event.AmountIn.ToString(),
                AmountOut = log.Event.AmountOut.ToString(),
                IndexedAt = DateTime.UtcNow,
            });

            logger.LogInformation(
                "Swap | блок {Block} | tx {Hash} | {Trader}: {AmountIn} KHC -> {AmountOut} FIAT",
                log.Log.BlockNumber.Value, log.Log.TransactionHash, log.Event.Trader,
                Web3.Convert.FromWei(log.Event.AmountIn), Web3.Convert.FromWei(log.Event.AmountOut));
        }

        state.LastBlock = toBlock;
        await db.SaveChangesAsync(ct);
    }

    private (string Address, long StartBlock)? ResolveContract()
    {
        if (!string.IsNullOrWhiteSpace(_options.DeploymentFile))
        {
            var path = Path.Combine(environment.ContentRootPath, _options.DeploymentFile);
            if (File.Exists(path))
            {
                using var json = JsonDocument.Parse(File.ReadAllText(path));
                return (json.RootElement.GetProperty("pool").GetString()!,
                    json.RootElement.GetProperty("deployBlock").GetInt64());
            }
        }

        if (!string.IsNullOrWhiteSpace(_options.ContractAddress))
            return (_options.ContractAddress, _options.StartBlock);

        return null;
    }

    private static BlockParameter ToBlockParameter(long block) =>
        new(new HexBigInteger(new BigInteger(block)));
}
