import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function diagnose() {
  try {
    await db.connect();
    
    console.log('=== PO Details ===');
    const po = await db.query("SELECT * FROM tblPurchaseOrder WHERE POCode = 'TVPO/3864/26-27'");
    console.log(JSON.stringify(po, null, 2));

    if (po.length > 0) {
      const poId = po[0].POId;
      console.log('\n=== GRN Details ===');
      const grn = await db.query("SELECT * FROM tblGRN WHERE POId = @poId", { poId });
      console.log(JSON.stringify(grn, null, 2));
    }

    console.log('\n=== Returns Log ===');
    const returns = await db.query("SELECT * FROM tblReturns WHERE ReferenceCode = 'TVPO/3864/26-27'");
    console.log(JSON.stringify(returns, null, 2));

    console.log('\n=== Inventory Table ===');
    const inv = await db.query(`
      SELECT i.*, b.Code AS BinCode, it.Name AS ItemName
      FROM tblInventory i
      INNER JOIN tblBin b ON i.BinId = b.BinId
      INNER JOIN tblItem it ON i.ItemId = it.ItemId
      WHERE it.ItemId IN (
        SELECT ItemId FROM tblPurchaseOrderDetail WHERE POId IN (
          SELECT POId FROM tblPurchaseOrder WHERE POCode = 'TVPO/3864/26-27'
        )
      )
    `);
    console.log(JSON.stringify(inv, null, 2));

    process.exit(0);
  } catch (err: any) {
    console.error('Diagnosis failed:', err.message || err);
    process.exit(1);
  }
}

diagnose();
