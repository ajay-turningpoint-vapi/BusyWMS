import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

export class ReturnsController {

  // Fetch returns log
  public static async getReturns(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT r.*, i.Name AS ItemName, i.Code AS ItemCode, 
               b.Code AS BinCode, bat.BatchNumber, u.FullName AS OperatorName
        FROM tblReturns r
        INNER JOIN tblItem i ON r.ItemId = i.ItemId
        LEFT JOIN tblBin b ON r.BinId = b.BinId
        LEFT JOIN tblBatch bat ON r.BatchId = bat.BatchId
        LEFT JOIN tblUser u ON r.ReturnedBy = u.UserId
        ORDER BY r.ReturnId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Receive returned stock from Customer or return to Vendor (supports batch insertion)
  public static async receiveReturn(req: AuthenticatedRequest, res: Response) {
    const { type, referenceCode, reason, items } = req.body;
    const userId = req.user?.userId || 1;

    if (!type || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Type and at least one item are required.' });
    }

    try {
      const returnCode = `RTN-${Date.now()}`;
      
      // Perform atomic database transaction using start/commit commands
      await db.executeCmd('START TRANSACTION');

      for (const item of items) {
        if (!item.itemId || !item.quantity || !item.binId) {
          await db.executeCmd('ROLLBACK');
          return res.status(400).json({ message: 'Item, Quantity and Bin are required for all return lines.' });
        }

        let inventoryUpdated = 0;

        if (type === 'VENDOR') {
          // Verify we have enough stock in that bin for vendor return
          const stock = await db.query(`
            SELECT InventoryId, Quantity, ReservedQty FROM tblInventory 
            WHERE BinId = @binId AND ItemId = @itemId
              AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
          `, { binId: item.binId, itemId: item.itemId, batchId: item.batchId || null });

          if (stock.length === 0) {
            await db.executeCmd('ROLLBACK');
            return res.status(400).json({ message: `Stock not found in the specified bin for item ID ${item.itemId}` });
          }

          const inv = stock[0];
          const available = inv.Quantity - inv.ReservedQty;
          if (available < item.quantity) {
            await db.executeCmd('ROLLBACK');
            return res.status(400).json({ message: `Insufficient available stock in bin for item ID ${item.itemId}. Available: ${available}, Requested: ${item.quantity}` });
          }

          // Deduct from inventory
          await db.executeCmd(`
            UPDATE tblInventory 
            SET Quantity = CASE WHEN Quantity - @qty < 0 THEN 0.0 ELSE Quantity - @qty END,
                UpdatedAt = CURRENT_TIMESTAMP
            WHERE InventoryId = @invId
          `, { qty: item.quantity, invId: inv.InventoryId });

          // Delete row if Quantity <= 0
          await db.executeCmd(`
            DELETE FROM tblInventory WHERE Quantity <= 0 AND InventoryId = @invId
          `, { invId: inv.InventoryId });

          // Decrease bin occupancy weight and volume
          const itemRows = await db.query('SELECT Weight, Volume FROM tblItem WHERE ItemId = @itemId', { itemId: item.itemId });
          const itemWeight = itemRows.length > 0 && itemRows[0].Weight !== null && Number(itemRows[0].Weight) > 0 ? Number(itemRows[0].Weight) : 2.0;
          const itemVolume = itemRows.length > 0 && itemRows[0].Volume !== null && Number(itemRows[0].Volume) > 0 ? Number(itemRows[0].Volume) : 1.5;

          const weightDelta = item.quantity * itemWeight;
          const volumeDelta = item.quantity * itemVolume;

          await db.executeCmd(`
            UPDATE tblBin
            SET OccupiedWeight = CASE WHEN OccupiedWeight - @weightDelta < 0 THEN 0.0 ELSE OccupiedWeight - @weightDelta END,
                OccupiedVolume = CASE WHEN OccupiedVolume - @volumeDelta < 0 THEN 0.0 ELSE OccupiedVolume - @volumeDelta END
            WHERE BinId = @binId
          `, { weightDelta, volumeDelta, binId: item.binId });

          inventoryUpdated = 1;
        }

        await db.executeCmd(`
          INSERT INTO tblReturns (ReturnCode, Type, ReferenceCode, ItemId, BatchId, Quantity, Reason, BinId, ReturnedBy, InventoryUpdated, Status)
          VALUES (@returnCode, @type, @referenceCode, @itemId, @batchId, @quantity, @reason, @binId, @userId, @inventoryUpdated, 'RECEIVED')
        `, {
          returnCode,
          type,
          referenceCode: referenceCode || null,
          itemId: item.itemId,
          batchId: item.batchId || null,
          quantity: item.quantity,
          reason: item.reason || reason || null,
          binId: item.binId,
          userId,
          inventoryUpdated
        });
      }

      await db.executeCmd('COMMIT');
      return res.status(201).json({ message: 'Return receipt registered successfully', returnCode });
    } catch (err: any) {
      await db.executeCmd('ROLLBACK');
      console.error('Failed to receive return:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Process return QC (Restock if passed, Quarantine as damage if failed)
  public static async processReturnQC(req: AuthenticatedRequest, res: Response) {
    const { returnId, qcPassed, qcBinId, remarks } = req.body;
    const userId = req.user?.userId || 1;

    if (!returnId || qcPassed === undefined) {
      return res.status(400).json({ message: 'returnId and qcPassed status are required.' });
    }

    try {
      // 1. Fetch return record
      const returnRows = await db.query('SELECT * FROM tblReturns WHERE ReturnId = @returnId', { returnId });
      if (returnRows.length === 0) {
        return res.status(404).json({ message: 'Return record not found' });
      }

      const ret = returnRows[0];
      if (ret.Status !== 'RECEIVED') {
        return res.status(400).json({ message: `Return already processed with status: ${ret.Status}` });
      }

      const finalBinId = qcBinId || ret.BinId;

      if (qcPassed) {
        if (ret.Type === 'VENDOR') {
          // If Vendor Return is successfully processed, since it was already deducted on receipt,
          // we do not need to restock it or modify bin occupancy.
          await db.executeCmd(`
            UPDATE tblReturns SET Status = 'RESTOCKED', InventoryUpdated = 1 WHERE ReturnId = @returnId
          `, { returnId });
        } else {
          // CUSTOMER return: restock to inventory
          const existing = await db.query(`
            SELECT InventoryId FROM tblInventory 
            WHERE BinId = @binId AND ItemId = @itemId 
              AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
          `, { binId: finalBinId, itemId: ret.ItemId, batchId: ret.BatchId });

          if (existing.length > 0) {
            await db.executeCmd(`
              UPDATE tblInventory SET Quantity = Quantity + @qty, UpdatedAt = CURRENT_TIMESTAMP
              WHERE InventoryId = @invId
            `, { qty: ret.Quantity, invId: existing[0].InventoryId });
          } else {
            // Get Warehouse/Zone details for destination bin
            const binLocation = await db.query(`
              SELECT z.WarehouseId, z.ZoneId FROM tblBin b
              INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
              INNER JOIN tblRack r ON s.RackId = r.RackId
              INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
              WHERE b.BinId = @binId
            `, { binId: finalBinId });

            const warehouseId = binLocation.length > 0 ? binLocation[0].WarehouseId : 1;
            const zoneId = binLocation.length > 0 ? binLocation[0].ZoneId : 1;

            await db.executeCmd(`
              INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, BatchId, Quantity, ReservedQty, UpdatedAt)
              VALUES (@warehouseId, @zoneId, @binId, @itemId, @batchId, @qty, 0.0, CURRENT_TIMESTAMP)
            `, { warehouseId, zoneId, binId: finalBinId, itemId: ret.ItemId, batchId: ret.BatchId, qty: ret.Quantity });
          }

          // Update Bin capacity weight/volume
          const items = await db.query('SELECT Weight, Volume FROM tblItem WHERE ItemId = @itemId', { itemId: ret.ItemId });
          const itemWeight = items.length > 0 && items[0].Weight !== null && Number(items[0].Weight) > 0 ? Number(items[0].Weight) : 2.0;
          const itemVolume = items.length > 0 && items[0].Volume !== null && Number(items[0].Volume) > 0 ? Number(items[0].Volume) : 1.5;

          const weightDelta = ret.Quantity * itemWeight;
          const volumeDelta = ret.Quantity * itemVolume;

          await db.executeCmd(`
            UPDATE tblBin
            SET OccupiedWeight = OccupiedWeight + @weightDelta,
                OccupiedVolume = OccupiedVolume + @volumeDelta
            WHERE BinId = @binId
          `, { weightDelta, volumeDelta, binId: finalBinId });

          // Update Return row status
          await db.executeCmd(`
            UPDATE tblReturns SET Status = 'RESTOCKED', InventoryUpdated = 1 WHERE ReturnId = @returnId
          `, { returnId });
        }

      } else {
        // QC Rejected: Move directly to Damaged Stock
        const damageCode = `DMG-RTN-${Date.now()}`;
        await db.executeCmd(`
          INSERT INTO tblDamage (DamageCode, ItemId, BinId, BatchId, Quantity, DamageReason, DamageType, ReportedBy, Status)
          VALUES (@damageCode, @itemId, @binId, @batchId, @quantity, @reason, 'QC_FAILED', @userId, 'REPORTED')
        `, { 
          damageCode, 
          itemId: ret.ItemId, 
          binId: finalBinId, 
          batchId: ret.BatchId || null, 
          quantity: ret.Quantity, 
          reason: remarks || ret.Reason || 'QC Rejection on Return', 
          userId 
        });

        // Update Return row status
        await db.executeCmd(`
          UPDATE tblReturns SET Status = 'REJECTED' WHERE ReturnId = @returnId
        `, { returnId });
      }

      return res.json({ message: 'Return QC processing completed successfully' });
    } catch (err: any) {
      console.error('Failed to process return QC:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Fetch details of a Sales Order or Purchase Order by code
  public static async getOrderDetailsByCode(req: AuthenticatedRequest, res: Response) {
    const { type, code } = req.query as { type: string, code: string };

    if (!type || !code) {
      return res.status(400).json({ message: 'Type and code are required.' });
    }

    try {
      if (type === 'CUSTOMER') {
        // Sales Order (Customer Return)
        const rows = await db.query(`
          SELECT DISTINCT
              sod.ItemId,
              item.Code AS ItemCode,
              item.Name AS ItemName,
              sod.UOM,
              pld.BatchId,
              bat.BatchNumber,
              pld.BinId,
              b.Code AS BinCode,
              COALESCE(pld.Quantity, sod.ShippedQty) AS Quantity
          FROM tblSalesOrder so
          INNER JOIN tblSalesOrderDetail sod ON so.SOId = sod.SOId
          INNER JOIN tblItem item ON sod.ItemId = item.ItemId
          LEFT JOIN tblPickList pl ON so.SOId = pl.SOId
          LEFT JOIN tblPickListDetail pld ON pl.PickListId = pld.PickListId AND sod.ItemId = pld.ItemId
          LEFT JOIN tblBin b ON pld.BinId = b.BinId
          LEFT JOIN tblBatch bat ON pld.BatchId = bat.BatchId
          WHERE so.SOCode = @code AND so.Status != 'CANCELLED'
        `, { code });
        return res.json(rows);
      } else {
        // Purchase Order (Vendor Return)
        const rows = await db.query(`
          SELECT DISTINCT
              pod.ItemId,
              item.Code AS ItemCode,
              item.Name AS ItemName,
              pod.UOM,
              p.BatchId,
              bat.BatchNumber,
              p.BinId,
              b.Code AS BinCode,
              COALESCE(p.Quantity, pod.ReceivedQty) AS Quantity
          FROM tblPurchaseOrder po
          INNER JOIN tblPurchaseOrderDetail pod ON po.POId = pod.POId
          INNER JOIN tblItem item ON pod.ItemId = item.ItemId
          LEFT JOIN tblGRN g ON po.POId = g.POId
          LEFT JOIN tblGRNDetail gd ON g.GRNId = gd.GRNId AND pod.ItemId = gd.ItemId
          LEFT JOIN tblPutaway p ON gd.GRNDetailId = p.GRNDetailId
          LEFT JOIN tblBin b ON p.BinId = b.BinId
          LEFT JOIN tblBatch bat ON p.BatchId = bat.BatchId
          WHERE po.POCode = @code AND po.Status != 'CANCELLED'
        `, { code });
        return res.json(rows);
      }
    } catch (err: any) {
      console.error('Failed to get order details for return:', err);
      return res.status(500).json({ message: err.message });
    }
  }
}
