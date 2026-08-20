import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

export class PutawayController {

  public static async getPendingPutaway(req: AuthenticatedRequest, res: Response) {
    try {
      const q = (req.query.q || req.query.search || '') as string;
      let sql = 'SELECT * FROM vw_PendingPutaway';
      const params: any = {};
      if (q.trim()) {
        sql += ' WHERE (ItemCode LIKE @search OR ItemName LIKE @search OR GRNCode LIKE @search OR BatchNumber LIKE @search)';
        params.search = `%${q.trim()}%`;
      }
      const rows = await db.query(sql, params);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Suggest optimal bins for a putaway item and quantity
  public static async suggestBins(req: AuthenticatedRequest, res: Response) {
    const { itemId, quantity, warehouseId } = req.body;
    
    if (!itemId || !quantity) {
      return res.status(400).json({ message: 'ItemId and Quantity are required' });
    }

    try {
      // Call Stored Procedure to check volume, weight, and layout suitability
      // Defaulting warehouseId to user's warehouseId or 1 if not specified
      const bins = await db.executeSp('sp_AllocateBinForPutaway', {
        ItemId: itemId,
        Qty: quantity,
        PreferredWarehouseId: warehouseId || req.user?.warehouseId || 6
      });
      
      const enrichedBins = [];
      for (const bin of bins) {
        const pathRows = await db.query(`
          SELECT s.Name AS ShelfName, r.Name AS RackName
          FROM tblBin b
          INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
          INNER JOIN tblRack r ON s.RackId = r.RackId
          WHERE b.BinId = @binId
        `, { binId: bin.BinId || bin.binId });
        
        if (pathRows.length > 0) {
          bin.ShelfName = pathRows[0].ShelfName;
          bin.RackName = pathRows[0].RackName;
        } else {
          bin.ShelfName = '';
          bin.RackName = '';
        }
        enrichedBins.push(bin);
      }
      return res.json(enrichedBins);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Execute putaway (manually slotted or suggested)
  public static async executePutaway(req: AuthenticatedRequest, res: Response) {
    const { grnDetailId, binId, quantity } = req.body;
    const userId = req.user?.userId || 1;

    if (!grnDetailId || !binId || !quantity) {
      return res.status(400).json({ message: 'grnDetailId, binId and quantity are required' });
    }

    try {
      // Check if target bin already contains any other item with active quantity
      const itemRows = await db.query('SELECT ItemId FROM tblGRNDetail WHERE GRNDetailId = @grnDetailId', { grnDetailId });
      if (itemRows.length > 0) {
        const itemId = itemRows[0].ItemId;
        const conflictingInventory = await db.query(`
          SELECT i.ItemId, it.Name AS ItemName 
          FROM tblInventory i
          INNER JOIN tblItem it ON i.ItemId = it.ItemId
          WHERE i.BinId = @binId AND i.ItemId != @itemId AND i.Quantity > 0
        `, { binId, itemId });

        if (conflictingInventory.length > 0) {
          const confName = conflictingInventory[0].ItemName || conflictingInventory[0].ItemId;
          return res.status(400).json({ 
            message: `Putaway failed: Target bin already contains a different item ("${confName}"). Mixing items in the same bin is not allowed.` 
          });
        }
      }

      // Execute the process putaway transaction stored procedure
      const result = await db.executeSp('sp_ProcessPutaway', {
        GRNDetailId: grnDetailId,
        BinId: binId,
        Quantity: quantity,
        UserId: userId
      });

      if (result.length > 0 && result[0].Success === 0) {
        return res.status(400).json({ message: result[0].Message });
      }

      // Check if this putaway resolves any active stock alerts (BELOW_MIN or ABOVE_MAX)
      try {
        const detailRows = await db.query('SELECT ItemId FROM tblGRNDetail WHERE GRNDetailId = @grnDetailId', { grnDetailId });
        if (detailRows.length > 0) {
          const itemId = detailRows[0].ItemId;
          const itemDef = await db.query('SELECT MinStock, MaxStock FROM tblItem WHERE ItemId = @itemId', { itemId });
          if (itemDef.length > 0) {
            const minStock = parseFloat(itemDef[0].MinStock || '0');
            const maxStock = parseFloat(itemDef[0].MaxStock || '999999');
            
            const stockSum = await db.query('SELECT COALESCE(SUM(Quantity), 0) AS total FROM tblInventory WHERE ItemId = @itemId', { itemId });
            const totalStock = parseFloat(stockSum[0].total || '0');

            if (totalStock >= minStock) {
              await db.executeCmd(`
                UPDATE tblStockAlertLog 
                SET Status = 'RESOLVED', ResolvedAt = CURRENT_TIMESTAMP 
                WHERE ItemId = @itemId AND AlertType = 'BELOW_MIN' AND Status = 'ACTIVE'
              `, { itemId });
            }

            if (totalStock <= maxStock) {
              await db.executeCmd(`
                UPDATE tblStockAlertLog 
                SET Status = 'RESOLVED', ResolvedAt = CURRENT_TIMESTAMP 
                WHERE ItemId = @itemId AND AlertType = 'ABOVE_MAX' AND Status = 'ACTIVE'
              `, { itemId });
            }
          }
        }
      } catch (alertErr) {
        console.error('Failed to automatically resolve stock alerts:', alertErr);
      }

      // Auto-reserve any pending or partial Sales Orders waiting for this item
      try {
        const detailRows = await db.query('SELECT ItemId FROM tblGRNDetail WHERE GRNDetailId = @grnDetailId', { grnDetailId });
        if (detailRows.length > 0) {
          const itemId = detailRows[0].ItemId;
          const pendingSOs = await db.query(`
            SELECT DISTINCT so.SOId 
            FROM tblSalesOrder so
            JOIN tblSalesOrderDetail sod ON so.SOId = sod.SOId
            WHERE sod.ItemId = @itemId AND so.Status IN ('PENDING', 'PARTIAL_RESERVED')
          `, { itemId });

          for (const pendingSo of pendingSOs) {
            try {
              await db.executeSp('sp_ReserveInventory', { SOId: pendingSo.SOId, UserId: userId });
            } catch (resErr) {
              console.error(`Auto-reservation failed for SO ${pendingSo.SOId}:`, resErr);
            }
          }
        }
      } catch (reserveErr) {
        console.error('Failed auto-reservation check after putaway:', reserveErr);
      }

      return res.json({ message: 'Putaway completed successfully' });
    } catch (err: any) {
      if (err.sqlState === '45000') {
        return res.status(400).json({ message: err.message });
      }
      console.error('Putaway execution failed:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Get putaway history
  public static async getPutawayHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT p.*, i.Name AS ItemName, i.Code AS ItemCode, b.Code AS BinCode, u.FullName AS OperatorName
        FROM tblPutaway p
        INNER JOIN tblItem i ON p.ItemId = i.ItemId
        INNER JOIN tblBin b ON p.BinId = b.BinId
        INNER JOIN tblUser u ON p.PutawayBy = u.UserId
        ORDER BY p.PutawayId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
}
