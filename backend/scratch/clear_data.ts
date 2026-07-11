import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function clearData() {
  const tablesToTruncate = [
    'tblAuditLog',
    'tblApiLog',
    'tblCycleCountDetail',
    'tblCycleCount',
    'tblDamage',
    'tblReturns',
    'tblStockTransfer',
    'tblDispatch',
    'tblPacking',
    'tblPickListDetail',
    'tblPickList',
    'tblPickListWave',
    'tblReservation',
    'tblSalesOrderDetail',
    'tblSalesOrder',
    'tblInventory',
    'tblPutaway',
    'tblQC',
    'tblGRNDetail',
    'tblGRN',
    'tblPurchaseOrderDetail',
    'tblPurchaseOrder',
    'tblSerialNo',
    'tblBatch',
    'tblItem',
    'tblCustomer',
    'tblSupplier',
    'tblDeletedItem',
    'tblDeletedCustomer',
    'tblDeletedSupplier',
    'tblDeletedPurchaseOrder',
    'tblDeletedSalesOrder'
  ];

  try {
    console.log('Connecting to database...');
    await db.connect();
    
    console.log('Disabling foreign key checks...');
    await db.executeCmd('SET FOREIGN_KEY_CHECKS = 0');
    
    for (const table of tablesToTruncate) {
      try {
        console.log(`Truncating table ${table}...`);
        await db.executeCmd(`TRUNCATE TABLE ${table}`);
      } catch (err: any) {
        console.warn(`Could not truncate ${table} (it might not exist yet):`, err.message);
      }
    }
    
    console.log('Re-enabling foreign key checks...');
    await db.executeCmd('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('Database cleanup completed successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('Cleanup failed:', err.message || err);
    process.exit(1);
  }
}

clearData();
