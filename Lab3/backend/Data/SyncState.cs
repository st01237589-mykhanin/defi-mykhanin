namespace SwapIndexer.Data;

public class SyncState
{
    public int Id { get; set; }
    public string ContractAddress { get; set; } = "";
    public long LastBlock { get; set; }
}
