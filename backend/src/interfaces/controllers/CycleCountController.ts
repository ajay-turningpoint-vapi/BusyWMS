import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

export class CycleCountController {

  // Create a cycle count request and generate detail lines based on current system stock
  public static async createCycleCount(req: AuthenticatedRequest, res: Response) {
    const { warehouseId, zoneId, countType, notes, binIds } = req.body;
    const userId = req.user?.userId || 1;

    if (!warehouseId) {
      return res.status(400).json({ message: 'warehouseId is required' });
    }

    try {
      const countCode = `CC-${Date.now()}`;
      
      // 1. Insert header
      const headerResult = await db.executeCmd(`
        INSERT INTO tblCycleCount (CountCode, WarehouseId, ZoneId, CountType, CountedBy, Status, Notes)
        VALUES (@countCode, @warehouseId, @zoneId, @countType, @userId, 'PENDING', @notes)
      `, { countCode, warehouseId, zoneId: zoneId || null, countType: countType || 'FULL', userId, notes: notes || null });

      const cycleCountId = headerResult.lastID;

      // 2. Fetch inventory items to be counted
      let stockItems: any[] = [];
      if (binIds && Array.isArray(binIds) && binIds.length > 0) {
        const cleanBinIds = binIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id));
        if (cleanBinIds.length > 0) {
          stockItems = await db.query(`
            SELECT BinId, ItemId, BatchId, Quantity FROM tblInventory 
            WHERE BinId IN (${cleanBinIds.join(',')})
          `);
        }
      } else if (zoneId) {
        stockItems = await db.query(`
          SELECT i.BinId, i.ItemId, i.BatchId, i.Quantity 
          FROM tblInventory i
          INNER JOIN tblBin b ON i.BinId = b.BinId
          INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
          INNER JOIN tblRack r ON s.RackId = r.RackId
          WHERE r.ZoneId = @zoneId
        `, { zoneId });
      } else {
        stockItems = await db.query(`
          SELECT BinId, ItemId, BatchId, Quantity FROM tblInventory 
          WHERE WarehouseId = @warehouseId
        `, { warehouseId });
      }

      // 3. Populate details
      for (const item of stockItems) {
        await db.executeCmd(`
          INSERT INTO tblCycleCountDetail (CycleCountId, BinId, ItemId, BatchId, SystemQty, Status)
          VALUES (@cycleCountId, @binId, @itemId, @batchId, @qty, 'PENDING')
        `, { 
          cycleCountId, 
          binId: item.BinId, 
          itemId: item.ItemId, 
          batchId: item.BatchId || null, 
          qty: item.Quantity 
        });
      }

      return res.status(201).json({ message: 'Cycle count created', cycleCountId, countCode, itemCount: stockItems.length });
    } catch (err: any) {
      console.error('Failed to create cycle count:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Get list of cycle count runs
  public static async getCycleCounts(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT cc.*, w.Name AS WarehouseName, z.Name AS ZoneName, u1.FullName AS CountedByName, u2.FullName AS ReviewedByName
        FROM tblCycleCount cc
        INNER JOIN tblWarehouse w ON cc.WarehouseId = w.WarehouseId
        LEFT JOIN tblZone z ON cc.ZoneId = z.ZoneId
        INNER JOIN tblUser u1 ON cc.CountedBy = u1.UserId
        LEFT JOIN tblUser u2 ON cc.ReviewedBy = u2.UserId
        ORDER BY cc.CycleCountId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Get detail lines for a cycle count run
  public static async getCycleCountDetails(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const rows = await db.query(`
        SELECT ccd.*, i.Name AS ItemName, i.Code AS ItemCode, b.Code AS BinCode, bat.BatchNumber
        FROM tblCycleCountDetail ccd
        INNER JOIN tblItem i ON ccd.ItemId = i.ItemId
        INNER JOIN tblBin b ON ccd.BinId = b.BinId
        LEFT JOIN tblBatch bat ON ccd.BatchId = bat.BatchId
        WHERE ccd.CycleCountId = @id
      `, { id });
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Record actual counted quantities by operator
  public static async recordCountQty(req: AuthenticatedRequest, res: Response) {
    const { cycleCountId, items } = req.body; // items: array of { countDetailId, countedQty, notes }
    if (!cycleCountId || !items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    try {
      for (const item of items) {
        await db.executeCmd(`
          UPDATE tblCycleCountDetail 
          SET CountedQty = @countedQty, 
              Status = 'COMPLETED',
              Notes = @notes
          WHERE CountDetailId = @id AND CycleCountId = @cycleCountId
        `, { countedQty: item.countedQty, notes: item.notes || null, id: item.countDetailId, cycleCountId });
      }

      // Check if all lines are completed
      const pendingCount = await db.query(`
        SELECT COUNT(*) AS pending FROM tblCycleCountDetail 
        WHERE CycleCountId = @cycleCountId AND Status = 'PENDING'
      `, { cycleCountId });

      if (pendingCount.length > 0 && pendingCount[0].pending === 0) {
        await db.executeCmd(`
          UPDATE tblCycleCount 
          SET Status = 'COMPLETED', CountDate = CURRENT_TIMESTAMP 
          WHERE CycleCountId = @cycleCountId
        `, { cycleCountId });
      }

      return res.json({ message: 'Counting records saved successfully' });
    } catch (err: any) {
      console.error('Failed to record counting values:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Approve cycle count run (reconcile inventory levels based on variances)
  public static async approveCycleCount(req: AuthenticatedRequest, res: Response) {
    const { cycleCountId, remarks } = req.body;
    const userId = req.user?.userId || 1;

    if (!cycleCountId) {
      return res.status(400).json({ message: 'cycleCountId is required' });
    }

    try {
      // 1. Fetch cycle count header
      const headers = await db.query('SELECT * FROM tblCycleCount WHERE CycleCountId = @cycleCountId', { cycleCountId });
      if (headers.length === 0) {
        return res.status(404).json({ message: 'Cycle count request not found' });
      }
      
      const header = headers[0];
      if (header.Status === 'APPROVED') {
        return res.status(400).json({ message: 'Cycle count already approved and reconciled' });
      }

      // 2. Retrieve details
      const details = await db.query('SELECT * FROM tblCycleCountDetail WHERE CycleCountId = @cycleCountId', { cycleCountId });

      for (const line of details) {
        if (line.CountedQty === null) continue; // Skip lines not counted

        const systemQty = Number(line.SystemQty);
        const countedQty = Number(line.CountedQty);
        const variance = countedQty - systemQty;

        if (variance !== 0) {
          // Fetch Item weight/volume details
          const items = await db.query('SELECT Weight, Volume FROM tblItem WHERE ItemId = @itemId', { itemId: line.ItemId });
          const itemWeight = items.length > 0 && items[0].Weight !== null ? Number(items[0].Weight) : 2.0;
          const itemVolume = items.length > 0 && items[0].Volume !== null ? Number(items[0].Volume) : 1.5;

          const weightDelta = variance * itemWeight;
          const volumeDelta = variance * itemVolume;

          if (countedQty === 0) {
            // Remove stock completely
            await db.executeCmd(`
              DELETE FROM tblInventory 
              WHERE BinId = @binId AND ItemId = @itemId 
                AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
            `, { binId: line.BinId, itemId: line.ItemId, batchId: line.BatchId });
          } else {
            // Update or Insert stock
            const existing = await db.query(`
              SELECT InventoryId FROM tblInventory 
              WHERE BinId = @binId AND ItemId = @itemId 
                AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
            `, { binId: line.BinId, itemId: line.ItemId, batchId: line.BatchId });

            if (existing.length > 0) {
              await db.executeCmd(`
                UPDATE tblInventory 
                SET Quantity = @countedQty, UpdatedAt = CURRENT_TIMESTAMP
                WHERE InventoryId = @invId
              `, { countedQty, invId: existing[0].InventoryId });
            } else {
              // Resolve WarehouseId and ZoneId from BinId
              const binLocation = await db.query(`
                SELECT z.WarehouseId, z.ZoneId FROM tblBin b
                INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
                INNER JOIN tblRack r ON s.RackId = r.RackId
                INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
                WHERE b.BinId = @binId
              `, { binId: line.BinId });

              const warehouseId = binLocation.length > 0 ? binLocation[0].WarehouseId : header.WarehouseId;
              const zoneId = binLocation.length > 0 ? binLocation[0].ZoneId : (header.ZoneId || 1);

              await db.executeCmd(`
                INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, BatchId, Quantity, ReservedQty, UpdatedAt)
                VALUES (@warehouseId, @zoneId, @binId, @itemId, @batchId, @countedQty, 0.0, CURRENT_TIMESTAMP)
              `, { warehouseId, zoneId, binId: line.BinId, itemId: line.ItemId, batchId: line.BatchId, countedQty });
            }
          }

          // Update Bin Occupied Capacity
          await db.executeCmd(`
            UPDATE tblBin
            SET OccupiedWeight = CASE WHEN OccupiedWeight + @weightDelta < 0 THEN 0.0 ELSE OccupiedWeight + @weightDelta END,
                OccupiedVolume = CASE WHEN OccupiedVolume + @volumeDelta < 0 THEN 0.0 ELSE OccupiedVolume + @volumeDelta END
            WHERE BinId = @binId
          `, { weightDelta, volumeDelta, binId: line.BinId });

          // Audit log the reconciliation
          await db.executeCmd(`
            INSERT INTO tblAuditLog (UserId, Action, TableName, RecordId, OldValues, NewValues, IPAddress)
            VALUES (@userId, 'RECONCILE', 'tblInventory', @binId, @oldVal, @newVal, 'SYSTEM')
          `, { 
            userId, 
            binId: line.BinId, 
            oldVal: JSON.stringify({ ItemId: line.ItemId, Quantity: systemQty }), 
            newVal: JSON.stringify({ ItemId: line.ItemId, Quantity: countedQty }) 
          });
        }

        // Set detail status as APPROVED
        await db.executeCmd(`
          UPDATE tblCycleCountDetail SET Status = 'APPROVED' WHERE CountDetailId = @id
        `, { id: line.CountDetailId });
      }

      // Update cycle count status
      await db.executeCmd(`
        UPDATE tblCycleCount 
        SET Status = 'APPROVED', 
            ReviewedBy = @userId, 
            Notes = CASE WHEN @remarks IS NOT NULL THEN @remarks ELSE Notes END,
            UpdatedAt = CURRENT_TIMESTAMP
        WHERE CycleCountId = @cycleCountId
      `, { cycleCountId, userId, remarks: remarks || null });

      return res.json({ message: 'Cycle count approved and stock levels successfully reconciled.' });
    } catch (err: any) {
      console.error('Failed to approve cycle count:', err);
      return res.status(500).json({ message: err.message });
    }
  }
}
