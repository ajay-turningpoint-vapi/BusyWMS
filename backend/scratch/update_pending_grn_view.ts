import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function updateView() {
  try {
    await db.connect();
    console.log('Connected to database.');

    console.log('Re-creating vw_PendingGRN view with robust status and QC-pending filters...');
    await db.query(`
      CREATE OR REPLACE VIEW vw_PendingGRN AS
      SELECT 
          po.POId,
          po.POCode,
          po.VendorName,
          po.VendorCode,
          po.OrderDate,
          pod.PODetailId,
          item.ItemId,
          item.Code AS ItemCode,
          item.Name AS ItemName,
          item.UOM AS ItemUOM,
          pod.OrderQty,
          pod.ReceivedQty,
          (pod.OrderQty - pod.ReceivedQty - COALESCE(pending_grn.TotalPendingQty, 0)) AS PendingQty
      FROM tblPurchaseOrder po
      INNER JOIN tblPurchaseOrderDetail pod ON po.POId = pod.POId
      INNER JOIN tblItem item ON pod.ItemId = item.ItemId
      LEFT JOIN (
          SELECT gd.ItemId, g.POId, SUM(gd.ReceivedQty) AS TotalPendingQty
          FROM tblGRNDetail gd
          INNER JOIN tblGRN g ON gd.GRNId = g.GRNId
          WHERE g.Status = 'PENDING'
          GROUP BY gd.ItemId, g.POId
      ) pending_grn ON po.POId = pending_grn.POId AND pod.ItemId = pending_grn.ItemId
      WHERE po.Status IN ('PENDING', 'PARTIAL') 
        AND (pod.OrderQty - pod.ReceivedQty - COALESCE(pending_grn.TotalPendingQty, 0)) > 0
    `);

    console.log('vw_PendingGRN view updated successfully!');

    // Test query for PO 26
    const test = await db.query('SELECT * FROM vw_PendingGRN WHERE POId = 26');
    console.log('Test select on vw_PendingGRN for PO 26:', test);

    process.exit(0);
  } catch (err: any) {
    console.error('Update failed:', err.message || err);
    process.exit(1);
  }
}

updateView();
