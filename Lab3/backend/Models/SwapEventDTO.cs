using System.Numerics;
using Nethereum.ABI.FunctionEncoding.Attributes;

namespace SwapIndexer.Models;

[Event("Swap")]
public class SwapEventDTO : IEventDTO
{
    [Parameter("address", "trader", 1, true)]
    public string Trader { get; set; } = "";

    [Parameter("uint256", "amountIn", 2, false)]
    public BigInteger AmountIn { get; set; }

    [Parameter("uint256", "amountOut", 3, false)]
    public BigInteger AmountOut { get; set; }
}
