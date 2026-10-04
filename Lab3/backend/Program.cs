using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SwapIndexer;
using SwapIndexer.Data;
using SwapIndexer.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<BlockchainOptions>(builder.Configuration.GetSection("Blockchain"));
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddHostedService<Web3IndexerService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
}

app.UseCors();

app.MapGet("/api/swaps", async (string? trader, AppDbContext db, CancellationToken ct) =>
{
    if (trader is null || !AddressRegex().IsMatch(trader))
        return Results.BadRequest("Вкажіть коректну адресу трейдера: ?trader=0x...");

    var address = trader.ToLowerInvariant();
    var swaps = await db.Swaps
        .Where(s => s.Trader == address)
        .OrderByDescending(s => s.BlockNumber)
        .ThenByDescending(s => s.LogIndex)
        .ToListAsync(ct);

    return Results.Ok(swaps);
});

app.Run();

partial class Program
{
    [GeneratedRegex("^0x[0-9a-fA-F]{40}$")]
    private static partial Regex AddressRegex();
}
