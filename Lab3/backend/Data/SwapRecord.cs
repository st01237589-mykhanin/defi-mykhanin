namespace SwapIndexer.Data;

public class SwapRecord
{
    public int Id { get; set; }
    public string TransactionHash { get; set; } = "";
    public int LogIndex { get; set; }
    public long BlockNumber { get; set; }

    public string Trader { get; set; } = "";

    public string AmountIn { get; set; } = "0";
    public string AmountOut { get; set; } = "0";

    public DateTime IndexedAt { get; set; }
}
