using Microsoft.EntityFrameworkCore;

namespace SwapIndexer.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<SwapRecord> Swaps => Set<SwapRecord>();
    public DbSet<SyncState> SyncStates => Set<SyncState>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SwapRecord>().HasIndex(s => new { s.TransactionHash, s.LogIndex }).IsUnique();
        modelBuilder.Entity<SwapRecord>().HasIndex(s => s.Trader);
    }
}
