import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function updateView() {
  try {
    await db.connect();
    console.log('Connected to database.');

    console.log('Redefining vw_PendingGRN...');
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
          COALESCE(grn_sum.TotalGrnQty, 0) AS ReceivedQty,
          (pod.OrderQty - COALESCE(grn_sum.TotalGrnQty, 0)) AS PendingQty
      FROM tblPurchaseOrder po
      INNER JOIN tblPurchaseOrderDetail pod ON po.POId = pod.POId
      INNER JOIN tblItem item ON pod.ItemId = item.ItemId
      LEFT JOIN (
          SELECT gd.ItemId, g.POId, SUM(gd.ReceivedQty) AS TotalGrnQty
          FROM tblGRNDetail gd
          INNER JOIN tblGRN g ON gd.GRNId = g.GRNId
          WHERE g.Status != 'CANCELLED'
          GROUP BY gd.ItemId, g.POId
      ) grn_sum ON po.POId = grn_sum.POId AND pod.ItemId = grn_sum.ItemId
      WHERE po.Status IN ('PENDING', 'PARTIAL') AND (pod.OrderQty - COALESCE(grn_sum.TotalGrnQty, 0)) > 0;
    `);

    console.log('vw_PendingGRN updated successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('Update failed:', err.message || err);
    process.exit(1);
  }
}

updateView();
