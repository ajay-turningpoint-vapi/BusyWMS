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

    console.log('Running syncItems manually...');
    const mockReq: any = { ip: '127.0.0.1', headers: { 'user-agent': 'SYNC_TRIGGER_SCRIPT' } };
    const mockRes: any = {
      status: function() { return this; },
      json: function(data: any) {
        console.log('Sync Response:', JSON.stringify(data, null, 2));
        return data;
      }
    };

    await SyncController.syncItems(mockReq, mockRes);
    process.exit(0);
  } catch (err: any) {
    console.error('Manual sync failed:', err.message || err);
    process.exit(1);
  }
}

run();
