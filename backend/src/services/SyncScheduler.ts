import { db } from '../config/db';
import { SyncController } from '../interfaces/controllers/SyncController';

class SyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  public start() {
    console.log('Initializing WMS Auto-Sync Background Scheduler...');
    // Run the scheduler check every 60 seconds
    this.timer = setInterval(() => this.checkAndSync(), 60000);
    // Also run an immediate check on startup (after a short delay to let database connect)
    setTimeout(() => this.checkAndSync(), 10000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('WMS Auto-Sync Background Scheduler stopped.');
  }

  private async checkAndSync() {
    if (this.isSyncing) return; // Prevent concurrent sync runs

    try {
      // 1. Verify if Busy Integration is enabled in Feature Config
      const features = await db.query("SELECT IsEnabled FROM tblFeatureConfig WHERE FeatureCode = 'MODULE_BUSY_INTEGRATION'");
      const isFeatureEnabled = features.length > 0 && features[0].IsEnabled === 1;

      if (!isFeatureEnabled) {
        return; // Auto-sync is disabled globally
      }

      // 2. Load ERP Configuration
      const configs = await db.query("SELECT * FROM tblERPConfig WHERE IsActive = 1 LIMIT 1");
      if (configs.length === 0) {
        return; // No active ERP sync profile configured
      }

      const config = configs[0];
      const intervalMinutes = config.SyncInterval || 30;
      const lastSyncAt = config.LastSyncAt ? new Date(config.LastSyncAt) : null;
      const now = new Date();

      // Check if time has elapsed
      let shouldSync = false;
      if (!lastSyncAt) {
        shouldSync = true;
      } else {
        const diffMs = now.getTime() - lastSyncAt.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);
        if (diffMinutes >= intervalMinutes) {
          shouldSync = true;
        }
      }

      if (shouldSync) {
        this.isSyncing = true;
        console.log(`[AutoSync] Starting scheduled ERP sync (Interval: ${intervalMinutes}m)...`);

        // Create a dummy express request/response mock to call controller actions programmatically
        const mockReq: any = { ip: '127.0.0.1', headers: { 'user-agent': 'SYSTEM_DAEMON' } };
        const mockRes: any = {
          status: function() { return this; },
          json: function(data: any) { return data; }
        };

        // Execute sequential imports
        await SyncController.syncSuppliers(mockReq, mockRes);
        await SyncController.syncCustomers(mockReq, mockRes);
        await SyncController.syncItems(mockReq, mockRes);
        await SyncController.syncPurchaseOrders(mockReq, mockRes);
        await SyncController.syncSalesOrders(mockReq, mockRes);
        await SyncController.syncPurchaseInvoices(mockReq, mockRes);
        await SyncController.syncSalesInvoices(mockReq, mockRes);

        // Update last sync time
        await db.executeCmd("UPDATE tblERPConfig SET LastSyncAt = NOW() WHERE ConfigId = @id", { id: config.ConfigId });
        console.log(`[AutoSync] Scheduled sync completed successfully at ${new Date().toISOString()}`);
      }
    } catch (err: any) {
      console.error('[AutoSync] Scheduled background sync failed:', err.message);
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncScheduler = new SyncScheduler();
export default syncScheduler;
