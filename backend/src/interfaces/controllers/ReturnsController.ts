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

  // Receive returned stock from Customer or return to Vendor
  public static async receiveReturn(req: AuthenticatedRequest, res: Response) {
    const { type, referenceCode, itemId, batchId, quantity, reason, binId } = req.body;
    const userId = req.user?.userId || 1;

    if (!type || !itemId || !quantity || !binId) {
      return res.status(400).json({ message: 'Type, Item, Quantity and Bin are required.' });
    }

    try {
      const returnCode = `RTN-${Date.now()}`;
      
      // Insert receipt record
      await db.executeCmd(`
        INSERT INTO tblReturns (ReturnCode, Type, ReferenceCode, ItemId, BatchId, Quantity, Reason, BinId, ReturnedBy, InventoryUpdated, Status)
        VALUES (@returnCode, @type, @referenceCode, @itemId, @batchId, @quantity, @reason, @binId, @userId, 0, 'RECEIVED')
      `, {
        returnCode,
        type,
        referenceCode: referenceCode || null,
        itemId,
        batchId: batchId || null,
        quantity,
        reason: reason || null,
        binId,
        userId
      });

      return res.status(201).json({ message: 'Return receipt registered successfully', returnCode });
    } catch (err: any) {
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
        // Restock to inventory
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
        const itemWeight = items.length > 0 && items[0].Weight !== null ? Number(items[0].Weight) : 2.0;
        const itemVolume = items.length > 0 && items[0].Volume !== null ? Number(items[0].Volume) : 1.5;

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
}
