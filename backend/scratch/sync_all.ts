import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';
import { mssqlDb } from '../src/config/mssql';
import { SyncController } from '../src/interfaces/controllers/SyncController';

async function run() {
  try {
    console.log('Connecting to databases...');
    await mssqlDb.connect();
    await db.connect();

    const mockReq: any = { ip: '127.0.0.1', headers: { 'user-agent': 'SYNC_ALL_SCRIPT' } };
    const mockRes: any = {
      status: function() { return this; },
      json: function(data: any) {
        console.log('Response:', data.message || JSON.stringify(data));
        return data;
      }
    };

    console.log('\n--- Syncing Suppliers ---');
    await SyncController.syncSuppliers(mockReq, mockRes);

    console.log('\n--- Syncing Customers ---');
    await SyncController.syncCustomers(mockReq, mockRes);

    console.log('\n--- Syncing Items ---');
    await SyncController.syncItems(mockReq, mockRes);

    console.log('\n--- Syncing Purchase Orders ---');
    await SyncController.syncPurchaseOrders(mockReq, mockRes);

    console.log('\n--- Syncing Sales Orders ---');
    await SyncController.syncSalesOrders(mockReq, mockRes);

    console.log('\nSync completed successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('Sync failed:', err.message || err);
    process.exit(1);
  }
}

run();
