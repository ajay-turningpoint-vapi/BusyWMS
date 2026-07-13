import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

export class PutawayController {

  // Get items waiting to be slotted into bins
  public static async getPendingPutaway(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query('SELECT * FROM vw_PendingPutaway');
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
        PreferredWarehouseId: warehouseId || req.user?.warehouseId || 1
      });
      return res.json(bins);
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
