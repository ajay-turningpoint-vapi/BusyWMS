import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

export class DamageController {

  // Report damaged stock (deducts stock immediately from available inventory)
  public static async reportDamage(req: AuthenticatedRequest, res: Response) {
    const { itemId, binId, batchId, serialId, quantity, damageReason, damageType } = req.body;
    const userId = req.user?.userId || 1;

    if (!itemId || !binId || !quantity) {
      return res.status(400).json({ message: 'itemId, binId and quantity are required' });
    }

    try {
      // 1. Verify that inventory has enough quantity in the specified bin
      const stock = await db.query(`
        SELECT InventoryId, Quantity, ReservedQty FROM tblInventory 
        WHERE BinId = @binId AND ItemId = @itemId
          AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
      `, { binId, itemId, batchId: batchId || null });

      if (stock.length === 0) {
        return res.status(400).json({ message: 'Stock not found in the specified bin' });
      }

      const inv = stock[0];
      const available = inv.Quantity - inv.ReservedQty;
      if (available < quantity) {
        return res.status(400).json({ message: `Insufficient available stock. Available: ${available}, Requested: ${quantity}` });
      }

      // 2. Insert into tblDamage
      const damageCode = `DMG-${Date.now()}`;
      await db.executeCmd(`
        INSERT INTO tblDamage (DamageCode, ItemId, BinId, BatchId, SerialId, Quantity, DamageReason, DamageType, ReportedBy, Status)
        VALUES (@damageCode, @itemId, @binId, @batchId, @serialId, @quantity, @damageReason, COALESCE(@damageType, 'PHYSICAL'), @userId, 'REPORTED')
      `, { 
        damageCode, 
        itemId, 
        binId, 
        batchId: batchId || null, 
        serialId: serialId || null, 
        quantity, 
        damageReason: damageReason || null, 
        damageType: damageType || 'PHYSICAL', 
        userId 
      });

      // 3. Deduct stock from tblInventory
      await db.executeCmd(`
        UPDATE tblInventory 
        SET Quantity = CASE WHEN Quantity - @qty < 0 THEN 0.0 ELSE Quantity - @qty END,
            UpdatedAt = CURRENT_TIMESTAMP
        WHERE InventoryId = @invId
      `, { qty: quantity, invId: inv.InventoryId });

      // Clean up empty inventory rows
      await db.executeCmd(`
        DELETE FROM tblInventory WHERE Quantity <= 0 AND InventoryId = @invId
      `, { invId: inv.InventoryId });

      // 4. Update Bin Capacity (reduce occupied capacity)
      const items = await db.query('SELECT Weight, Volume FROM tblItem WHERE ItemId = @itemId', { itemId });
      const itemWeight = items.length > 0 && items[0].Weight !== null && Number(items[0].Weight) > 0 ? Number(items[0].Weight) : 2.0;
      const itemVolume = items.length > 0 && items[0].Volume !== null && Number(items[0].Volume) > 0 ? Number(items[0].Volume) : 1.5;

      const weightDelta = quantity * itemWeight;
      const volumeDelta = quantity * itemVolume;

      await db.executeCmd(`
        UPDATE tblBin
        SET OccupiedWeight = CASE WHEN OccupiedWeight - @weightDelta < 0 THEN 0.0 ELSE OccupiedWeight - @weightDelta END,
            OccupiedVolume = CASE WHEN OccupiedVolume - @volumeDelta < 0 THEN 0.0 ELSE OccupiedVolume - @volumeDelta END
        WHERE BinId = @binId
      `, { weightDelta, volumeDelta, binId });

      // 5. Update Serial Status if applicable
      if (serialId) {
        await db.executeCmd(`
          UPDATE tblSerialNo SET Status = 'DAMAGED' WHERE SerialId = @serialId
        `, { serialId });
      }

      // Log Audit action
      await db.executeCmd(`
        INSERT INTO tblAuditLog (UserId, Action, TableName, RecordId, OldValues, NewValues, IPAddress)
        VALUES (@userId, 'REPORT_DAMAGE', 'tblInventory', @binId, @oldVal, NULL, 'SYSTEM')
      `, { 
        userId, 
        binId, 
        oldVal: JSON.stringify({ ItemId: itemId, Quantity: quantity, SerialId: serialId || null })
      });

      return res.status(201).json({ message: 'Damage reported successfully. Stock holds updated.', damageCode });
    } catch (err: any) {
      console.error('Failed to report damage:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Get list of reported damages
  public static async getDamages(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT d.*, i.Name AS ItemName, i.Code AS ItemCode, b.Code AS BinCode, bat.BatchNumber, sn.SerialNumber, u1.FullName AS ReportedByName, u2.FullName AS ReviewedByName
        FROM tblDamage d
        INNER JOIN tblItem i ON d.ItemId = i.ItemId
        LEFT JOIN tblBin b ON d.BinId = b.BinId
        LEFT JOIN tblBatch bat ON d.BatchId = bat.BatchId
        LEFT JOIN tblSerialNo sn ON d.SerialId = sn.SerialId
        LEFT JOIN tblUser u1 ON d.ReportedBy = u1.UserId
        LEFT JOIN tblUser u2 ON d.ReviewedBy = u2.UserId
        ORDER BY d.DamageId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Review a reported damage: Approve (write off/dispose) or Reject (return to stock)
  public static async reviewDamage(req: AuthenticatedRequest, res: Response) {
    const { damageId, action, remarks } = req.body; // action: APPROVED (write off) or REJECTED (return stock)
    const userId = req.user?.userId || 1;

    if (!damageId || !action || !['APPROVED', 'REJECTED'].includes(action)) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    try {
      // 1. Fetch damage record
      const damages = await db.query('SELECT * FROM tblDamage WHERE DamageId = @damageId', { damageId });
      if (damages.length === 0) {
        return res.status(404).json({ message: 'Damage report not found' });
      }

      const dmg = damages[0];
      if (dmg.Status !== 'REPORTED') {
        return res.status(400).json({ message: `Damage record already resolved with status: ${dmg.Status}` });
      }

      if (action === 'REJECTED') {
        // Return stock back to inventory!
        const existing = await db.query(`
          SELECT InventoryId FROM tblInventory 
          WHERE BinId = @binId AND ItemId = @itemId 
            AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
        `, { binId: dmg.BinId, itemId: dmg.ItemId, batchId: dmg.BatchId });

        if (existing.length > 0) {
          await db.executeCmd(`
            UPDATE tblInventory 
            SET Quantity = Quantity + @qty, UpdatedAt = CURRENT_TIMESTAMP
            WHERE InventoryId = @invId
          `, { qty: dmg.Quantity, invId: existing[0].InventoryId });
        } else {
          // Fetch WarehouseId and ZoneId
          const binLocation = await db.query(`
            SELECT z.WarehouseId, z.ZoneId FROM tblBin b
            INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
            INNER JOIN tblRack r ON s.RackId = r.RackId
            INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
            WHERE b.BinId = @binId
          `, { binId: dmg.BinId });

          const warehouseId = binLocation.length > 0 ? binLocation[0].WarehouseId : 1;
          const zoneId = binLocation.length > 0 ? binLocation[0].ZoneId : 1;

          await db.executeCmd(`
            INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, BatchId, Quantity, ReservedQty, UpdatedAt)
            VALUES (@warehouseId, @zoneId, @binId, @itemId, @batchId, @qty, 0.0, CURRENT_TIMESTAMP)
          `, { warehouseId, zoneId, binId: dmg.BinId, itemId: dmg.ItemId, batchId: dmg.BatchId, qty: dmg.Quantity });
        }

        // Restore Bin Capacity
        const items = await db.query('SELECT Weight, Volume FROM tblItem WHERE ItemId = @itemId', { itemId: dmg.ItemId });
        const itemWeight = items.length > 0 && items[0].Weight !== null && Number(items[0].Weight) > 0 ? Number(items[0].Weight) : 2.0;
        const itemVolume = items.length > 0 && items[0].Volume !== null && Number(items[0].Volume) > 0 ? Number(items[0].Volume) : 1.5;

        const weightDelta = dmg.Quantity * itemWeight;
        const volumeDelta = dmg.Quantity * itemVolume;

        await db.executeCmd(`
          UPDATE tblBin
          SET OccupiedWeight = OccupiedWeight + @weightDelta,
              OccupiedVolume = OccupiedVolume + @volumeDelta
          WHERE BinId = @binId
        `, { weightDelta, volumeDelta, binId: dmg.BinId });

        // Restore Serial Status if applicable
        if (dmg.SerialId) {
          await db.executeCmd(`
            UPDATE tblSerialNo SET Status = 'IN_STOCK' WHERE SerialId = @serialId
          `, { serialId: dmg.SerialId });
        }
      } else {
        // APPROVED: written off / disposed
        if (dmg.SerialId) {
          await db.executeCmd(`
            UPDATE tblSerialNo SET Status = 'DISPATCHED' WHERE SerialId = @serialId
          `, { serialId: dmg.SerialId }); // Or keep it in DAMAGED or delete it
        }
      }

      // Update Damage Status
      await db.executeCmd(`
        UPDATE tblDamage 
        SET Status = @action, 
            ReviewedBy = @userId, 
            Remarks = @remarks,
            DamageDate = CURRENT_TIMESTAMP
        WHERE DamageId = @damageId
      `, { damageId, action, userId, remarks: remarks || null });

      return res.json({ message: `Damage report reviewed and status set to ${action}` });
    } catch (err: any) {
      console.error('Failed to review damage:', err);
      return res.status(500).json({ message: err.message });
    }
  }
}
