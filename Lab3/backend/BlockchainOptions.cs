namespace SwapIndexer;

public class BlockchainOptions
{
    public string RpcUrl { get; set; } = "http://127.0.0.1:8545";
    public string? DeploymentFile { get; set; }
    public string? ContractAddress { get; set; }
    public long StartBlock { get; set; }
    public int PollingIntervalSeconds { get; set; } = 2;
    public int MaxBlockRange { get; set; } = 2000;
}
