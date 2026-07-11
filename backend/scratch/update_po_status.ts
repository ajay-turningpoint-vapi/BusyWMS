import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function updatePO() {
  try {
    await db.connect();
    console.log('Connected to database.');

    const poCode = 'TVPO/3844/26-27';
    const rows = await db.query('SELECT POId, POCode, Status FROM tblPurchaseOrder WHERE POCode = @poCode', { poCode });
    console.log('Before update:', JSON.stringify(rows, null, 2));

    if (rows.length > 0) {
      await db.executeCmd("UPDATE tblPurchaseOrder SET Status = 'PARTIAL' WHERE POCode = @poCode", { poCode });
      console.log('Update executed successfully!');
      
      const updatedRows = await db.query('SELECT POId, POCode, Status FROM tblPurchaseOrder WHERE POCode = @poCode', { poCode });
      console.log('After update:', JSON.stringify(updatedRows, null, 2));
    } else {
      console.log(`Purchase order with code "${poCode}" not found.`);
    }

    process.exit(0);
  } catch (err: any) {
    console.error('Update failed:', err.message || err);
    process.exit(1);
  }
}

updatePO();
