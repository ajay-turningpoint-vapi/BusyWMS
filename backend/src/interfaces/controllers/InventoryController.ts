import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

export class InventoryController {

  // Get current inventory status using the database view
  public static async getInventory(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string || '0', 10);
      const limit = parseInt(req.query.limit as string || '50', 10);
      const q = req.query.q as string || '';
      
      let queryStr = 'SELECT * FROM vw_InventoryStatus';
      const params: any = {};
      
      if (q) {
        queryStr += ' WHERE BinCode = @exactQ OR BinBarcode = @exactQ OR ItemCode = @exactQ OR BinCode LIKE @q OR BinBarcode LIKE @q OR ItemCode LIKE @q OR ItemName LIKE @q';
        params.q = `%${q}%`;
        params.exactQ = q;
      }
      
      queryStr += ' ORDER BY InventoryId DESC';
      
      let rows;
      if (req.query.page && req.query.limit) {
        const offset = page * limit;
        params.limit = limit;
        params.offset = offset;
        queryStr += ' LIMIT @limit OFFSET @offset';
        rows = await db.query(queryStr, params);
      } else {
        rows = await db.query(queryStr, params);
      }
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Get serial number stocks
  public static async getSerialStocks(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT sn.*, i.Name AS ItemName, i.Code AS ItemCode 
        FROM tblSerialNo sn
        INNER JOIN tblItem i ON sn.ItemId = i.ItemId
        WHERE sn.Status = 'IN_STOCK'
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Execute Stock Transfer (Bin to Bin, Warehouse to Warehouse) — wrapped in transaction
  public static async transferStock(req: AuthenticatedRequest, res: Response) {
    const { fromBinId, toBinId, itemId, batchId, quantity } = req.body;
    const userId = req.user?.userId || 1;

    if (!fromBinId || !toBinId || !itemId || !quantity) {
      return res.status(400).json({ message: 'fromBinId, toBinId, itemId and quantity are required' });
    }

    // BUG-030 FIX: Prevent same-bin transfers
    if (Number(fromBinId) === Number(toBinId)) {
      return res.status(400).json({ message: 'Source and destination bins must be different' });
    }

    try {
      // 1. Check if source bin inventory exists with enough stock
      const sourceStock = await db.query(`
        SELECT InventoryId, Quantity, ReservedQty, WarehouseId 
        FROM tblInventory 
        WHERE BinId = @fromBinId AND ItemId = @itemId 
          AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
      `, { fromBinId, itemId, batchId });

      if (sourceStock.length === 0) {
        return res.status(400).json({ message: 'No inventory found in source bin for this item' });
      }

      const available = sourceStock[0].Quantity - sourceStock[0].ReservedQty;
      if (available < quantity) {
        return res.status(400).json({ message: `Insufficient inventory in source bin. Available: ${available}` });
      }

      // 2. Resolve destination warehouse details
      const destBinDetails = await db.query(`
        SELECT z.WarehouseId, z.ZoneId 
        FROM tblBin b
        INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
        INNER JOIN tblRack r ON s.RackId = r.RackId
        INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
        WHERE b.BinId = @toBinId
      `, { toBinId });

      if (destBinDetails.length === 0) {
        return res.status(400).json({ message: 'Destination bin is invalid' });
      }

      const destWhId = destBinDetails[0].WarehouseId;
      const destZoneId = destBinDetails[0].ZoneId;
      const sourceWhId = sourceStock[0].WarehouseId;

      // 2. Fetch Item weight & volume
      const items = await db.query('SELECT Weight, Volume FROM tblItem WHERE ItemId = @itemId', { itemId });
      const itemWeight = items.length > 0 && items[0].Weight !== null && Number(items[0].Weight) > 0 ? Number(items[0].Weight) : 2.0;
      const itemVolume = items.length > 0 && items[0].Volume !== null && Number(items[0].Volume) > 0 ? Number(items[0].Volume) : 1.5;

      const weightDelta = quantity * itemWeight;
      const volumeDelta = quantity * itemVolume;

      // Validate destination bin capacity limits
      const destBinInfo = await db.query('SELECT CapacityWeight, CapacityVolume, OccupiedWeight, OccupiedVolume, Code FROM tblBin WHERE BinId = @toBinId', { toBinId });
      if (destBinInfo.length === 0) {
        return res.status(400).json({ message: 'Destination bin not found' });
      }
      const dbInfo = destBinInfo[0];
      if (dbInfo.OccupiedWeight + weightDelta > dbInfo.CapacityWeight) {
        return res.status(400).json({ message: `Destination bin '${dbInfo.Code}' exceeds weight capacity. Storing this would exceed limit of ${dbInfo.CapacityWeight}kg.` });
      }
      if (dbInfo.OccupiedVolume + volumeDelta > dbInfo.CapacityVolume) {
        return res.status(400).json({ message: `Destination bin '${dbInfo.Code}' exceeds volume capacity. Storing this would exceed limit of ${dbInfo.CapacityVolume}L.` });
      }

      const transferCode = await db.transaction(async (tx) => {
        // 3. Deduct from source bin inventory
        await tx.executeCmd(`
          UPDATE tblInventory 
          SET Quantity = Quantity - @quantity, UpdatedAt = CURRENT_TIMESTAMP
          WHERE InventoryId = @invId
        `, { quantity, invId: sourceStock[0].InventoryId });

        // Clean source inventory if quantity falls to zero
        await tx.executeCmd(`
          DELETE FROM tblInventory WHERE InventoryId = @invId AND Quantity <= 0
        `, { invId: sourceStock[0].InventoryId });

        // 4. Insert or Update Destination inventory
        const existingDest = await tx.query(`
          SELECT InventoryId FROM tblInventory 
          WHERE BinId = @toBinId AND ItemId = @itemId 
            AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
        `, { toBinId, itemId, batchId });

        if (existingDest.length > 0) {
          await tx.executeCmd(`
            UPDATE tblInventory 
            SET Quantity = Quantity + @quantity, UpdatedAt = CURRENT_TIMESTAMP
            WHERE InventoryId = @invId
          `, { quantity, invId: existingDest[0].InventoryId });
        } else {
          await tx.executeCmd(`
            INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, BatchId, Quantity, ReservedQty)
            VALUES (@WarehouseId, @ZoneId, @toBinId, @itemId, @batchId, @quantity, 0.0)
          `, { WarehouseId: destWhId, ZoneId: destZoneId, toBinId, itemId, batchId, quantity });
        }

        // 5. Update Bin capacities (cross-DB safe CASE WHEN)
        await tx.executeCmd(`
          UPDATE tblBin 
          SET OccupiedWeight = CASE WHEN OccupiedWeight - @weightDelta < 0 THEN 0 ELSE OccupiedWeight - @weightDelta END,
              OccupiedVolume = CASE WHEN OccupiedVolume - @volumeDelta < 0 THEN 0 ELSE OccupiedVolume - @volumeDelta END
          WHERE BinId = @fromBinId
        `, { weightDelta, volumeDelta, fromBinId });

        await tx.executeCmd(`
          UPDATE tblBin 
          SET OccupiedWeight = OccupiedWeight + @weightDelta,
              OccupiedVolume = OccupiedVolume + @volumeDelta
          WHERE BinId = @toBinId
        `, { weightDelta, volumeDelta, toBinId });

        // 6. Log transfer transaction
        const code = `ST-${Date.now()}`;
        await tx.executeCmd(`
          INSERT INTO tblStockTransfer (TransferCode, FromWarehouseId, ToWarehouseId, FromBinId, ToBinId, ItemId, BatchId, Quantity, TransferredBy)
          VALUES (@transferCode, @sourceWhId, @destWhId, @fromBinId, @toBinId, @itemId, @batchId, @quantity, @userId)
        `, { transferCode: code, sourceWhId, destWhId, fromBinId, toBinId, itemId, batchId, quantity, userId });

        return code;
      });

      return res.json({ message: 'Stock transfer completed successfully', transferCode });
    } catch (err: any) {
      console.error('Stock transfer failed:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Get transfer list history
  public static async getTransferHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT t.*, i.Name AS ItemName, i.Code AS ItemCode, 
               fb.Code AS FromBinCode, tb.Code AS ToBinCode, 
               u.FullName AS OperatorName
        FROM tblStockTransfer t
        INNER JOIN tblItem i ON t.ItemId = i.ItemId
        LEFT JOIN tblBin fb ON t.FromBinId = fb.BinId
        LEFT JOIN tblBin tb ON t.ToBinId = tb.BinId
        INNER JOIN tblUser u ON t.TransferredBy = u.UserId
        ORDER BY t.TransferId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
  // Get replenishment suggestions based on minStock thresholds in picking bins
  public static async getReplenishmentSuggestions(req: AuthenticatedRequest, res: Response) {
    try {
      // 1. Find items below minStock in forward picking areas
      const lowStockItems = await db.query(`
        SELECT 
          i.ItemId, 
          i.Code AS ItemCode, 
          i.Name AS ItemName, 
          i.UOM,
          i.MinStock, 
          i.MaxStock, 
          COALESCE(SUM(inv.Quantity), 0) AS CurrentPickingStock
        FROM tblItem i
        LEFT JOIN tblInventory inv ON i.ItemId = inv.ItemId AND inv.BinId NOT IN (
          SELECT b.BinId FROM tblBin b
          INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
          INNER JOIN tblRack r ON s.RackId = r.RackId
          INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
          WHERE z.Code LIKE '%BULK%' OR z.Code LIKE '%INB%' OR z.Code LIKE '%OUTB%' OR z.Name LIKE '%Bulk%'
        )
        WHERE i.MinStock > 0
        GROUP BY i.ItemId, i.Code, i.Name, i.UOM, i.MinStock, i.MaxStock
        HAVING COALESCE(SUM(inv.Quantity), 0) < i.MinStock
      `);

      const suggestions = [];

      for (const item of lowStockItems) {
        const itemId = item.ItemId;
        const deficit = item.MinStock - item.CurrentPickingStock;
        const targetReplenishQty = item.MaxStock ? (item.MaxStock - item.CurrentPickingStock) : deficit;

        // Find available stock in BULK storage
        const bulkStock = await db.query(`
          SELECT 
            inv.InventoryId, 
            inv.BinId, 
            inv.BatchId, 
            (inv.Quantity - inv.ReservedQty) AS AvailableBulkQty,
            b.Code AS BulkBinCode,
            bat.BatchNumber
          FROM tblInventory inv
          INNER JOIN tblBin b ON inv.BinId = b.BinId
          INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
          INNER JOIN tblRack r ON s.RackId = r.RackId
          INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
          LEFT JOIN tblBatch bat ON inv.BatchId = bat.BatchId
          WHERE inv.ItemId = @itemId 
            AND (z.Code LIKE '%BULK%' OR z.Name LIKE '%Bulk%')
            AND (inv.Quantity - inv.ReservedQty) > 0
          ORDER BY (inv.Quantity - inv.ReservedQty) DESC
        `, { itemId });

        if (bulkStock.length === 0) continue; // No bulk stock available to replenish from

        // Find target picking bins
        const targetBins = await db.query(`
          SELECT 
            b.BinId, 
            b.Code AS PickBinCode,
            (b.CapacityWeight - b.OccupiedWeight) AS AvailableWeight,
            (b.CapacityVolume - b.OccupiedVolume) AS AvailableVolume
          FROM tblBin b
          INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
          INNER JOIN tblRack r ON s.RackId = r.RackId
          INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
          WHERE b.IsActive = 1
            AND z.Code NOT LIKE '%BULK%' AND z.Name NOT LIKE '%Bulk%'
            AND z.Code NOT LIKE '%INB%' AND z.Code NOT LIKE '%OUTB%'
          ORDER BY IF(EXISTS(
            SELECT 1 FROM tblInventory i2 WHERE i2.BinId = b.BinId AND i2.ItemId = @itemId
          ), 1, 0) DESC, b.BinId ASC
        `, { itemId });

        if (targetBins.length === 0) continue; // No picking bins available to receive stock

        const source = bulkStock[0];
        const dest = targetBins[0];
        const qtyToMove = Math.min(targetReplenishQty, source.AvailableBulkQty);

        if (qtyToMove > 0) {
          suggestions.push({
            itemId: item.ItemId,
            itemCode: item.ItemCode,
            itemName: item.ItemName,
            uom: item.UOM,
            minStock: item.MinStock,
            currentPickingStock: item.CurrentPickingStock,
            fromBinId: source.BinId,
            fromBinCode: source.BulkBinCode,
            toBinId: dest.BinId,
            toBinCode: dest.PickBinCode,
            batchId: source.BatchId,
            batchNumber: source.BatchNumber || 'Standard',
            suggestedQty: qtyToMove
          });
        }
      }

      return res.json(suggestions);
    } catch (err: any) {
      console.error('Failed to get replenishment suggestions:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Execute replenishment (moves stock from Bulk storage to forward picking bin)
  public static async executeReplenishment(req: AuthenticatedRequest, res: Response) {
    const { fromBinId, toBinId, itemId, batchId, quantity } = req.body;
    const userId = req.user?.userId || 1;

    if (!fromBinId || !toBinId || !itemId || !quantity) {
      return res.status(400).json({ message: 'Missing replenishment parameters' });
    }

    try {
      // Re-use stock transfer method directly
      req.body.fromBinId = fromBinId;
      req.body.toBinId = toBinId;
      req.body.itemId = itemId;
      req.body.batchId = batchId;
      req.body.quantity = quantity;

      return await InventoryController.transferStock(req, res);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Get aggregated stock per item with min/max quantities
  public static async getItemStockSummary(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string || '0', 10);
      const limit = parseInt(req.query.limit as string || '50', 10);
      const q = (req.query.q as string || '').trim();
      const inStockOnly = req.query.inStockOnly === 'true';

      let whereClause = 'WHERE i.IsActive = 1';
      const params: any = {};

      if (q) {
        whereClause += ' AND (i.Code LIKE @q OR i.Name LIKE @q OR i.Category LIKE @q OR i.Barcode LIKE @q)';
        params.q = `%${q}%`;
      }

      let countSql = '';
      let dataSql = '';
      const offset = page * limit;
      params.limit = limit;
      params.offset = offset;

      if (!q && !inStockOnly) {
        // Fast count from tblItem index
        const countRes = await db.query('SELECT COUNT(*) AS total FROM tblItem WHERE IsActive = 1');
        const total = countRes[0]?.total || 0;

        // Optimized query joining inventory summary subquery
        dataSql = `
          SELECT 
            i.ItemId,
            COALESCE(NULLIF(i.Alias, ''), i.Code) AS ItemCode,
            i.Code AS ERPCode,
            i.Name AS ItemName,
            i.Category,
            i.UOM,
            COALESCE(i.MinStock, 0) AS MinStock,
            COALESCE(i.MaxStock, 0) AS MaxStock,
            COALESCE(invSum.TotalQuantity, 0) AS TotalQuantity,
            COALESCE(invSum.TotalReserved, 0) AS TotalReserved,
            COALESCE(invSum.TotalQuantity - invSum.TotalReserved, 0) AS TotalAvailable,
            COALESCE(invSum.BinCount, 0) AS BinCount,
            CASE 
              WHEN COALESCE(i.MinStock, 0) > 0 AND COALESCE(invSum.TotalQuantity, 0) < i.MinStock THEN 'Below Min'
              WHEN COALESCE(i.MaxStock, 0) > 0 AND COALESCE(i.MaxStock, 0) < 999990 AND COALESCE(invSum.TotalQuantity, 0) > i.MaxStock THEN 'Exceeds Max'
              ELSE 'Optimal'
            END AS StockStatus
          FROM tblItem i
          LEFT JOIN (
            SELECT 
              ItemId, 
              SUM(Quantity) AS TotalQuantity, 
              SUM(ReservedQty) AS TotalReserved, 
              COUNT(DISTINCT BinId) AS BinCount 
            FROM tblInventory 
            GROUP BY ItemId
          ) invSum ON i.ItemId = invSum.ItemId
          WHERE i.IsActive = 1
          ORDER BY 
            CASE 
              WHEN COALESCE(i.MinStock, 0) > 0 AND COALESCE(invSum.TotalQuantity, 0) < i.MinStock THEN 1
              WHEN COALESCE(i.MaxStock, 0) > 0 AND COALESCE(i.MaxStock, 0) < 999990 AND COALESCE(invSum.TotalQuantity, 0) > i.MaxStock THEN 1
              ELSE 2
            END ASC,
            invSum.TotalQuantity DESC, 
            i.Name ASC
          LIMIT @limit OFFSET @offset
        `;

        const items = await db.query(dataSql, params);
        return res.json({ items, total });
      } else if (inStockOnly && !q) {
        // Only items present in tblInventory
        const countRes = await db.query('SELECT COUNT(DISTINCT ItemId) AS total FROM tblInventory');
        const total = countRes[0]?.total || 0;

        dataSql = `
          SELECT 
            inv.ItemId,
            COALESCE(NULLIF(i.Alias, ''), i.Code) AS ItemCode,
            i.Code AS ERPCode,
            i.Name AS ItemName,
            i.Category,
            i.UOM,
            COALESCE(i.MinStock, 0) AS MinStock,
            COALESCE(i.MaxStock, 0) AS MaxStock,
            SUM(inv.Quantity) AS TotalQuantity,
            SUM(inv.ReservedQty) AS TotalReserved,
            SUM(inv.Quantity - inv.ReservedQty) AS TotalAvailable,
            COUNT(DISTINCT inv.BinId) AS BinCount,
            CASE 
              WHEN COALESCE(i.MinStock, 0) > 0 AND SUM(inv.Quantity) < i.MinStock THEN 'Below Min'
              WHEN COALESCE(i.MaxStock, 0) > 0 AND COALESCE(i.MaxStock, 0) < 999990 AND SUM(inv.Quantity) > i.MaxStock THEN 'Exceeds Max'
              ELSE 'Optimal'
            END AS StockStatus
          FROM tblInventory inv
          INNER JOIN tblItem i ON inv.ItemId = i.ItemId
          WHERE i.IsActive = 1
          GROUP BY inv.ItemId, i.Code, i.Alias, i.Name, i.Category, i.UOM, i.MinStock, i.MaxStock
          ORDER BY 
            CASE 
              WHEN COALESCE(i.MinStock, 0) > 0 AND SUM(inv.Quantity) < i.MinStock THEN 1
              WHEN COALESCE(i.MaxStock, 0) > 0 AND COALESCE(i.MaxStock, 0) < 999990 AND SUM(inv.Quantity) > i.MaxStock THEN 1
              ELSE 2
            END ASC,
            TotalQuantity DESC
          LIMIT @limit OFFSET @offset
        `;

        const items = await db.query(dataSql, params);
        return res.json({ items, total });
      } else {
        // Search query filter applied
        let whereClause = 'WHERE i.IsActive = 1';
        if (q) {
          whereClause += ' AND (i.Code LIKE @q OR i.Alias LIKE @q OR i.Name LIKE @q OR i.Category LIKE @q OR i.Barcode LIKE @q)';
          params.q = `%${q}%`;
        }

        let havingClause = '';
        if (inStockOnly) {
          havingClause = ' HAVING TotalQuantity > 0';
        }

        countSql = `
          SELECT COUNT(*) AS total FROM (
            SELECT i.ItemId, COALESCE(SUM(inv.Quantity), 0) AS TotalQuantity
            FROM tblItem i
            LEFT JOIN tblInventory inv ON i.ItemId = inv.ItemId
            ${whereClause}
            GROUP BY i.ItemId
            ${havingClause}
          ) t
        `;
        const countRes = await db.query(countSql, params);
        const total = countRes[0]?.total || 0;

        dataSql = `
          SELECT 
            i.ItemId,
            COALESCE(NULLIF(i.Alias, ''), i.Code) AS ItemCode,
            i.Code AS ERPCode,
            i.Name AS ItemName,
            i.Category,
            i.UOM,
            COALESCE(i.MinStock, 0) AS MinStock,
            COALESCE(i.MaxStock, 0) AS MaxStock,
            COALESCE(SUM(inv.Quantity), 0) AS TotalQuantity,
            COALESCE(SUM(inv.ReservedQty), 0) AS TotalReserved,
            COALESCE(SUM(inv.Quantity - inv.ReservedQty), 0) AS TotalAvailable,
            COUNT(DISTINCT inv.BinId) AS BinCount,
            CASE 
              WHEN COALESCE(i.MinStock, 0) > 0 AND COALESCE(SUM(inv.Quantity), 0) < i.MinStock THEN 'Below Min'
              WHEN COALESCE(i.MaxStock, 0) > 0 AND COALESCE(i.MaxStock, 0) < 999990 AND COALESCE(SUM(inv.Quantity), 0) > i.MaxStock THEN 'Exceeds Max'
              ELSE 'Optimal'
            END AS StockStatus
          FROM tblItem i
          LEFT JOIN tblInventory inv ON i.ItemId = inv.ItemId
          ${whereClause}
          GROUP BY i.ItemId, i.Code, i.Alias, i.Name, i.Category, i.UOM, i.MinStock, i.MaxStock
          ${havingClause}
          ORDER BY 
            CASE 
              WHEN COALESCE(i.MinStock, 0) > 0 AND COALESCE(SUM(inv.Quantity), 0) < i.MinStock THEN 1
              WHEN COALESCE(i.MaxStock, 0) > 0 AND COALESCE(i.MaxStock, 0) < 999990 AND COALESCE(SUM(inv.Quantity), 0) > i.MaxStock THEN 1
              ELSE 2
            END ASC,
            TotalQuantity DESC, 
            i.Name ASC
          LIMIT @limit OFFSET @offset
        `;

        const items = await db.query(dataSql, params);
        return res.json({ items, total });
      }
    } catch (err: any) {
      console.error('Failed to get item stock summary:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Get count of non-optimal stock items
  public static async getNonOptimalCount(req: AuthenticatedRequest, res: Response) {
    try {
      const sql = `
        SELECT COUNT(*) AS total
        FROM tblItem i
        LEFT JOIN (
          SELECT ItemId, SUM(Quantity) AS TotalQuantity
          FROM tblInventory
          GROUP BY ItemId
        ) invSum ON i.ItemId = invSum.ItemId
        WHERE i.IsActive = 1 AND (
          (COALESCE(i.MinStock, 0) > 0 AND COALESCE(invSum.TotalQuantity, 0) < i.MinStock)
          OR
          (COALESCE(i.MaxStock, 0) > 0 AND COALESCE(i.MaxStock, 0) < 999990 AND COALESCE(invSum.TotalQuantity, 0) > i.MaxStock)
        )
      `;
      const result = await db.query(sql);
      const total = result[0]?.total || 0;
      return res.json({ count: total });
    } catch (err: any) {
      console.error('Failed to get non-optimal count:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Get bin breakdown for a specific item
  public static async getItemBinBreakdown(req: AuthenticatedRequest, res: Response) {
    const { itemId } = req.params;

    if (!itemId) {
      return res.status(400).json({ message: 'ItemId is required' });
    }

    try {
      const itemInfo = await db.query(`
        SELECT ItemId, COALESCE(NULLIF(Alias, ''), Code) AS ItemCode, Code AS ERPCode, Name AS ItemName, UOM, COALESCE(MinStock, 0) AS MinStock, COALESCE(MaxStock, 0) AS MaxStock
        FROM tblItem WHERE ItemId = @itemId
      `, { itemId });

      if (itemInfo.length === 0) {
        return res.status(404).json({ message: 'Item not found' });
      }

      const binRows = await db.query(`
        SELECT 
          inv.InventoryId,
          w.Code AS WarehouseCode,
          w.Name AS WarehouseName,
          z.Code AS ZoneCode,
          b.BinId,
          b.Code AS BinCode,
          inv.Quantity,
          inv.ReservedQty,
          (inv.Quantity - inv.ReservedQty) AS AvailableQty,
          batch.BatchNumber,
          batch.ExpiryDate
        FROM tblInventory inv
        INNER JOIN tblWarehouse w ON inv.WarehouseId = w.WarehouseId
        INNER JOIN tblZone z ON inv.ZoneId = z.ZoneId
        INNER JOIN tblBin b ON inv.BinId = b.BinId
        LEFT JOIN tblBatch batch ON inv.BatchId = batch.BatchId
        WHERE inv.ItemId = @itemId
        ORDER BY inv.Quantity DESC, b.Code ASC
      `, { itemId });

      return res.json({
        item: itemInfo[0],
        bins: binRows
      });
    } catch (err: any) {
      console.error('Failed to get item bin breakdown:', err);
      return res.status(500).json({ message: err.message });
    }
  }
}

