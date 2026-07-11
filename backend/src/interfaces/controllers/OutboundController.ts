import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';
import { OrderValidator } from '../../services/OrderValidator';

export class OutboundController {

  // ==========================================
  // SALES ORDER / RESERVATION
  // ==========================================
  public static async getSalesOrders(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string || '0', 10);
      const limit = parseInt(req.query.limit as string || '25', 10);
      const search = (req.query.search as string || '').trim();
      const status = (req.query.status as string || '').trim();
      const startDate = (req.query.startDate as string || '').trim();
      const endDate = (req.query.endDate as string || '').trim();

      let whereClause = 'WHERE 1=1';
      const params: Record<string, any> = {};

      if (search) {
        whereClause += ' AND (SOCode LIKE @searchPattern OR CustomerName LIKE @searchPattern OR CustomerCode LIKE @searchPattern OR Salesman LIKE @searchPattern)';
        params.searchPattern = `%${search}%`;
      }

      if (status) {
        whereClause += ' AND Status = @status';
        params.status = status;
      }

      if (startDate) {
        whereClause += ' AND OrderDate >= @startDate';
        params.startDate = startDate;
      }

      if (endDate) {
        whereClause += ' AND OrderDate <= @endDate';
        params.endDate = endDate + ' 23:59:59';
      }

      const isPaginated = req.query.page !== undefined;

      if (isPaginated) {
        const offset = page * limit;
        params.limit = limit;
        params.offset = offset;

        // Query total
        const countQuery = `SELECT COUNT(*) AS total FROM tblSalesOrder ${whereClause}`;
        const countRows = await db.query(countQuery, params);
        const total = countRows.length > 0 ? countRows[0].total : 0;

        // Query paginated
        const selectQuery = `
          SELECT * FROM tblSalesOrder 
          ${whereClause} 
          ORDER BY OrderDate DESC, SOId DESC 
          LIMIT @limit OFFSET @offset
        `;
        const items = await db.query(selectQuery, params);

        return res.json({ items, total });
      } else {
        const selectQuery = `
          SELECT * FROM tblSalesOrder 
          ${whereClause} 
          ORDER BY OrderDate DESC, SOId DESC
        `;
        const items = await db.query(selectQuery, params);
        return res.json(items);
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getSODetails(req: AuthenticatedRequest, res: Response) {
    const { soId } = req.params;
    try {
      const rows = await db.query(`
        SELECT sod.*, i.Name AS ItemName, i.Code AS ItemCode 
        FROM tblSalesOrderDetail sod
        INNER JOIN tblItem i ON sod.ItemId = i.ItemId
        WHERE sod.SOId = @soId
      `, { soId });
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Auto Reserve Inventory for SO (runs Stored Procedure)
  public static async reserveSO(req: AuthenticatedRequest, res: Response) {
    const { soId } = req.body;
    const userId = req.user?.userId || 1;

    if (!soId) return res.status(400).json({ message: 'soId is required' });

    try {
      const result = await db.executeSp('sp_ReserveInventory', { SOId: soId, UserId: userId });
      if (result.length > 0 && result[0].Success === 0) {
        return res.status(400).json({ message: result[0].Message });
      }
      return res.json({ message: 'Auto reservation completed successfully' });
    } catch (err: any) {
      console.error('Reservation failed:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Release reservation manually
  public static async releaseSO(req: AuthenticatedRequest, res: Response) {
    const { soId } = req.body;
    if (!soId) return res.status(400).json({ message: 'soId is required' });

    try {
      // Find all active reservations
      const reservations = await db.query(`SELECT * FROM tblReservation WHERE SOId = @soId AND Status = 'ACTIVE'`, { soId });
      
      for (const resv of reservations) {
        // Decrease reserved qty from inventory (cross-DB safe CASE WHEN instead of MAX)
        await db.executeCmd(`
          UPDATE tblInventory 
          SET ReservedQty = CASE WHEN ReservedQty - @qty < 0 THEN 0 ELSE ReservedQty - @qty END,
              UpdatedAt = CURRENT_TIMESTAMP
          WHERE BinId = @binId AND ItemId = @itemId 
            AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
        `, { qty: resv.Quantity, binId: resv.BinId, itemId: resv.ItemId, batchId: resv.BatchId });

        // Update reservation record status
        await db.executeCmd(`UPDATE tblReservation SET Status = 'RELEASED' WHERE ReservationId = @resId`, { resId: resv.ReservationId });
      }

      // Reset SO Detail reserved levels
      await db.executeCmd(`UPDATE tblSalesOrderDetail SET ReservedQty = 0.0 WHERE SOId = @soId`, { soId });
      await db.executeCmd(`UPDATE tblSalesOrder SET Status = 'PENDING', UpdatedAt = CURRENT_TIMESTAMP WHERE SOId = @soId`, { soId });

      return res.json({ message: 'Reservations released successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // PICKING
  // ==========================================
  public static async createPickList(req: AuthenticatedRequest, res: Response) {
    const { soId, assignedTo } = req.body;
    const userId = req.user?.userId || 1;

    if (!soId) return res.status(400).json({ message: 'soId is required' });

    try {
      const pickCode = `PICK-${Date.now()}`;
      
      // 1. Create Pick List Header
      const pickResult = await db.executeCmd(`
        INSERT INTO tblPickList (PickCode, SOId, CreatedBy, AssignedTo, Status)
        VALUES (@pickCode, @soId, @userId, @assignedTo, 'PENDING')
      `, { pickCode, soId, userId, assignedTo: assignedTo || null });

      const pickListId = pickResult.lastID!;

      // 2. Fetch reservation details to form Picking details
      const reservations = await db.query(`
        SELECT ItemId, BinId, BatchId, Quantity FROM tblReservation 
        WHERE SOId = @soId AND Status = 'ACTIVE'
      `, { soId });

      for (const resv of reservations) {
        await db.executeCmd(`
          INSERT INTO tblPickListDetail (PickListId, ItemId, BinId, BatchId, Quantity, PickedQty, Status)
          VALUES (@pickListId, @itemId, @binId, @batchId, @qty, 0.0, 'PENDING')
        `, { pickListId, itemId: resv.ItemId, binId: resv.BinId, batchId: resv.BatchId, qty: resv.Quantity });
      }

      // Update SO Status
      await db.executeCmd(`UPDATE tblSalesOrder SET Status = 'PICKING', UpdatedAt = CURRENT_TIMESTAMP WHERE SOId = @soId`, { soId });

      return res.status(201).json({ message: 'Pick list generated', pickListId, pickCode });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getPickLists(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT p.*, so.SOCode, u1.FullName AS CreatorName, u2.FullName AS AssigneeName
        FROM tblPickList p
        INNER JOIN tblSalesOrder so ON p.SOId = so.SOId
        INNER JOIN tblUser u1 ON p.CreatedBy = u1.UserId
        LEFT JOIN tblUser u2 ON p.AssignedTo = u2.UserId
        WHERE so.Status NOT IN ('DISPATCHED', 'CANCELLED')
        ORDER BY p.PickListId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getPickListDetails(req: AuthenticatedRequest, res: Response) {
    const { pickListId } = req.params;
    try {
      const rows = await db.query(`
        SELECT pd.*, i.Name AS ItemName, i.Code AS ItemCode, b.Code AS BinCode, b.Barcode AS BinBarcode, bat.BatchNumber,
               z.Code AS ZoneCode, z.Name AS ZoneName, r.Code AS RackCode, r.Name AS RackName, s.Code AS ShelfCode, s.Name AS ShelfName
        FROM tblPickListDetail pd
        INNER JOIN tblItem i ON pd.ItemId = i.ItemId
        INNER JOIN tblBin b ON pd.BinId = b.BinId
        INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
        INNER JOIN tblRack r ON s.RackId = r.RackId
        INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
        LEFT JOIN tblBatch bat ON pd.BatchId = bat.BatchId
        WHERE pd.PickListId = @pickListId
      `, { pickListId });
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Confirm Picking scan (deduct inventory stock)
  public static async confirmPick(req: AuthenticatedRequest, res: Response) {
    const { pickListId, items } = req.body; // items: array of { pickDetailId, pickedQty }
    const userId = req.user?.userId || 1;

    if (!pickListId || !items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    try {
      for (const item of items) {
        // Fetch picking detail
        const details = await db.query(`
          SELECT ItemId, BinId, BatchId, Quantity, PickedQty 
          FROM tblPickListDetail WHERE PickDetailId = @id
        `, { id: item.pickDetailId });

        if (details.length === 0) continue;

        const pd = details[0];
        const addedQty = item.pickedQty;

        // 1. Update pick list detail line
        await db.executeCmd(`
          UPDATE tblPickListDetail 
          SET PickedQty = PickedQty + @qty,
              Status = CASE WHEN PickedQty + @qty >= Quantity THEN 'COMPLETED' ELSE 'PENDING' END
          WHERE PickDetailId = @id
        `, { qty: addedQty, id: item.pickDetailId });

        // 2. Verify that inventory actually has enough stock to pick
        const stockRows = await db.query(`
          SELECT Quantity, ReservedQty FROM tblInventory
          WHERE BinId = @binId AND ItemId = @itemId
            AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
        `, { binId: pd.BinId, itemId: pd.ItemId, batchId: pd.BatchId });

        const currentQty = stockRows.length > 0 ? Number(stockRows[0].Quantity) : 0;
        if (currentQty < addedQty) {
          throw new Error(`Insufficient inventory in Bin to pick requested qty. Available: ${currentQty}, Requested: ${addedQty}`);
        }

        // Reduce stock from tblInventory (both physically and reserved levels)
        // Use CASE WHEN for cross-DB compatibility (MSSQL does not support MAX() in UPDATE SET)
        await db.executeCmd(`
          UPDATE tblInventory
          SET Quantity = CASE WHEN Quantity - @qty < 0 THEN 0 ELSE Quantity - @qty END,
              ReservedQty = CASE WHEN ReservedQty - @qty < 0 THEN 0 ELSE ReservedQty - @qty END,
              UpdatedAt = CURRENT_TIMESTAMP
          WHERE BinId = @binId AND ItemId = @itemId
            AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
        `, { qty: addedQty, binId: pd.BinId, itemId: pd.ItemId, batchId: pd.BatchId });

        // Remove inventory record if empty
        await db.executeCmd(`
          DELETE FROM tblInventory 
          WHERE Quantity <= 0 AND BinId = @binId AND ItemId = @itemId
            AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
        `, { binId: pd.BinId, itemId: pd.ItemId, batchId: pd.BatchId });

        // Check for Low Stock Notification
        const stockSum = await db.query(`
          SELECT SUM(Quantity) AS total FROM tblInventory WHERE ItemId = @itemId
        `, { itemId: pd.ItemId });
        const remainingQty = stockSum.length > 0 && stockSum[0].total !== null ? Number(stockSum[0].total) : 0.0;

        const itemDef = await db.query('SELECT Name, MinStock FROM tblItem WHERE ItemId = @itemId', { itemId: pd.ItemId });
        if (itemDef.length > 0 && itemDef[0].MinStock !== null && remainingQty < Number(itemDef[0].MinStock)) {
          const minStock = Number(itemDef[0].MinStock);
          const itemName = itemDef[0].Name;
          await db.executeCmd(`
            INSERT INTO tblNotification (Type, Title, Message, IsRead, CreatedAt)
            VALUES ('LOW_STOCK', 'Low Stock Alert', @msg, 0, CURRENT_TIMESTAMP)
          `, { msg: `Inventory level for '${itemName}' has fallen to ${remainingQty} UOM, which is below the defined MinStock threshold of ${minStock} UOM.` });
        }

        // 3. Update bin occupied capacity (deduct weight)
        // Use item-specific weight/volume if available, fallback to defaults
        const itemInfo = await db.query('SELECT Weight, Volume FROM tblItem WHERE ItemId = @itemId', { itemId: pd.ItemId });
        const itemWeight = itemInfo.length > 0 && itemInfo[0].Weight !== null && Number(itemInfo[0].Weight) > 0 ? Number(itemInfo[0].Weight) : 2.0;
        const itemVolume = itemInfo.length > 0 && itemInfo[0].Volume !== null && Number(itemInfo[0].Volume) > 0 ? Number(itemInfo[0].Volume) : 1.5;
        const weightDelta = addedQty * itemWeight;
        const volumeDelta = addedQty * itemVolume;
        await db.executeCmd(`
          UPDATE tblBin
          SET OccupiedWeight = CASE WHEN OccupiedWeight - @weightDelta < 0 THEN 0 ELSE OccupiedWeight - @weightDelta END,
              OccupiedVolume = CASE WHEN OccupiedVolume - @volumeDelta < 0 THEN 0 ELSE OccupiedVolume - @volumeDelta END
          WHERE BinId = @binId
        `, { weightDelta, volumeDelta, binId: pd.BinId });

        // 4. Update tblSalesOrderDetail picked quantity
        const pickHeader = await db.query('SELECT SOId FROM tblPickList WHERE PickListId = @pickListId', { pickListId });
        if (pickHeader.length > 0) {
          const soId = pickHeader[0].SOId;
          await db.executeCmd(`
            UPDATE tblSalesOrderDetail 
            SET PickedQty = PickedQty + @qty
            WHERE SOId = @soId AND ItemId = @itemId
          `, { qty: addedQty, soId, itemId: pd.ItemId });
        }
      }

      // Mark Pick List status as COMPLETED if all lines done
      const lines = await db.query(`
        SELECT COUNT(*) as pendingLines FROM tblPickListDetail 
        WHERE PickListId = @pickListId AND Status = 'PENDING'
      `, { pickListId });

      if (lines[0].pendingLines === 0) {
        await db.executeCmd(`UPDATE tblPickList SET Status = 'COMPLETED', UpdatedAt = CURRENT_TIMESTAMP WHERE PickListId = @pickListId`, { pickListId });
        
        // Update Sales Order status
        const pickHeader = await db.query('SELECT SOId FROM tblPickList WHERE PickListId = @pickListId', { pickListId });
        if (pickHeader.length > 0) {
          await db.executeCmd(`UPDATE tblSalesOrder SET Status = 'PICKED', UpdatedAt = CURRENT_TIMESTAMP WHERE SOId = @soId`, { soId: pickHeader[0].SOId });
        }
      }

      return res.json({ message: 'Picking confirmed successfully' });
    } catch (err: any) {
      console.error('Picking confirmation failed:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // SALES ORDER CRUD (MANUAL)
  // ==========================================
  
  public static async createSalesOrder(req: AuthenticatedRequest, res: Response) {
    const { SOCode, CustomerName, CustomerCode, OrderDate, Items } = req.body;
    const userId = req.user?.userId || 1;
    try {
      const validation = await OrderValidator.validate({
        OrderCode: SOCode,
        PartnerName: CustomerName,
        PartnerCode: CustomerCode,
        OrderDate,
        Items
      }, 'SO');

      if (!validation.isValid) {
        return res.status(400).json({ message: 'Validation failed', errors: validation.errors });
      }

      const orderCode = SOCode ? SOCode.trim() : `SO-${Date.now()}`;

      const soId = await db.transaction(async (tx) => {
        const result = await tx.executeCmd(`
          INSERT INTO tblSalesOrder (SOCode, CustomerName, CustomerCode, OrderDate, Status)
          VALUES (@orderCode, @CustomerName, @CustomerCode, @OrderDate, 'PENDING')
        `, {
          orderCode,
          CustomerName: CustomerName.trim(),
          CustomerCode: CustomerCode.trim(),
          OrderDate
        });

        const newSoId = result.lastID!;

        for (const item of validation.cleanedItems!) {
          await tx.executeCmd(`
            INSERT INTO tblSalesOrderDetail (SOId, ItemId, OrderQty, ReservedQty, PickedQty, ShippedQty, UOM, UnitPrice)
            VALUES (@soId, @ItemId, @OrderQty, 0.0, 0.0, 0.0, @UOM, @UnitPrice)
          `, {
            soId: newSoId,
            ItemId: item.ItemId,
            OrderQty: item.OrderQty,
            UOM: item.UOM,
            UnitPrice: item.UnitPrice
          });
        }
        return newSoId;
      });

      // Automatically reserve inventory for this manually created Sales Order
      if (soId) {
        try {
          await db.executeSp('sp_ReserveInventory', { SOId: soId, UserId: userId });
        } catch (resvErr: any) {
          console.error(`Auto-reservation failed on creation for SO ${orderCode}:`, resvErr.message);
        }
      }

      return res.status(201).json({ message: 'Sales Order created successfully', soId, SOCode: orderCode });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async updateSalesOrder(req: AuthenticatedRequest, res: Response) {
    const { soId } = req.params;
    const { SOCode, CustomerName, CustomerCode, OrderDate, Items } = req.body;
    const userId = req.user?.userId || 1;

    try {
      const existing = await db.query('SELECT Status FROM tblSalesOrder WHERE SOId = @soId', { soId });
      if (existing.length === 0) {
        return res.status(404).json({ message: 'Sales Order not found' });
      }
      if (existing[0].Status !== 'PENDING' && existing[0].Status !== 'RESERVED' && existing[0].Status !== 'PARTIAL_RESERVED') {
        return res.status(400).json({ message: 'Only PENDING or RESERVED/PARTIAL_RESERVED Sales Orders can be modified.' });
      }

      const validation = await OrderValidator.validate({
        OrderCode: SOCode,
        PartnerName: CustomerName,
        PartnerCode: CustomerCode,
        OrderDate,
        Items
      }, 'SO', Number(soId));

      if (!validation.isValid) {
        return res.status(400).json({ message: 'Validation failed', errors: validation.errors });
      }

      await db.transaction(async (tx) => {
        // Release existing active reservations inside transaction to prevent inventory leak
        const reservations = await tx.query(`SELECT * FROM tblReservation WHERE SOId = @soId AND Status = 'ACTIVE'`, { soId });
        for (const resv of reservations) {
          await tx.executeCmd(`
            UPDATE tblInventory 
            SET ReservedQty = CASE WHEN ReservedQty - @qty < 0 THEN 0 ELSE ReservedQty - @qty END,
                UpdatedAt = CURRENT_TIMESTAMP
            WHERE BinId = @binId AND ItemId = @itemId 
              AND (BatchId = @batchId OR (BatchId IS NULL AND @batchId IS NULL))
          `, { qty: resv.Quantity, binId: resv.BinId, itemId: resv.ItemId, batchId: resv.BatchId });
        }
        await tx.executeCmd(`UPDATE tblReservation SET Status = 'RELEASED' WHERE SOId = @soId`, { soId });

        await tx.executeCmd(`
          UPDATE tblSalesOrder
          SET SOCode = @SOCode, CustomerName = @CustomerName, CustomerCode = @CustomerCode, OrderDate = @OrderDate, Status = 'PENDING', UpdatedAt = CURRENT_TIMESTAMP
          WHERE SOId = @soId
        `, {
          SOCode: SOCode.trim(),
          CustomerName: CustomerName.trim(),
          CustomerCode: CustomerCode.trim(),
          OrderDate,
          soId
        });

        await tx.executeCmd('DELETE FROM tblSalesOrderDetail WHERE SOId = @soId', { soId });

        for (const item of validation.cleanedItems!) {
          await tx.executeCmd(`
            INSERT INTO tblSalesOrderDetail (SOId, ItemId, OrderQty, ReservedQty, PickedQty, ShippedQty, UOM, UnitPrice)
            VALUES (@soId, @ItemId, @OrderQty, 0.0, 0.0, 0.0, @UOM, @UnitPrice)
          `, {
            soId,
            ItemId: item.ItemId,
            OrderQty: item.OrderQty,
            UOM: item.UOM,
            UnitPrice: item.UnitPrice
          });
        }
      });

      // Automatically reserve inventory for this updated Sales Order
      if (soId) {
        try {
          await db.executeSp('sp_ReserveInventory', { SOId: Number(soId), UserId: userId });
        } catch (resvErr: any) {
          console.error(`Auto-reservation failed on update for SO ${SOCode}:`, resvErr.message);
        }
      }

      return res.json({ message: 'Sales Order updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteSalesOrder(req: AuthenticatedRequest, res: Response) {
    const { soId } = req.params;
    try {
      const existing = await db.query('SELECT SOCode, Status FROM tblSalesOrder WHERE SOId = @soId', { soId });
      if (existing.length === 0) {
        return res.status(404).json({ message: 'Sales Order not found' });
      }
      if (existing[0].Status !== 'PENDING') {
        return res.status(400).json({ message: 'Only PENDING Sales Orders can be deleted.' });
      }

      const soCode = existing[0].SOCode;

      await db.transaction(async (tx) => {
        // Track deleted SO code to prevent sync from re-importing it
        if (soCode) {
          await tx.executeCmd('CREATE TABLE IF NOT EXISTS tblDeletedSalesOrder (SOCode VARCHAR(100) PRIMARY KEY, DeletedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
          await tx.executeCmd('INSERT IGNORE INTO tblDeletedSalesOrder (SOCode) VALUES (@soCode)', { soCode });
        }
        await tx.executeCmd('DELETE FROM tblSalesOrderDetail WHERE SOId = @soId', { soId });
        await tx.executeCmd('DELETE FROM tblSalesOrder WHERE SOId = @soId', { soId });
      });
      return res.json({ message: 'Sales Order deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // PACKING
  // ==========================================
  public static async executePacking(req: AuthenticatedRequest, res: Response) {
    const { 
      pickListId, 
      cartonNo, 
      palletNo, 
      shippingLabel,
      grossWeight,
      lengthCm,
      widthCm,
      heightCm,
      itemCount,
      notes
    } = req.body;
    const userId = req.user?.userId || 1;

    if (!pickListId) return res.status(400).json({ message: 'pickListId is required' });

    try {
      const packCode = `PACK-${Date.now()}`;
      await db.executeCmd(`
        INSERT INTO tblPacking (
          PackCode, PickListId, PackedBy, PackedDate, CartonNo, PalletNo, ShippingLabel, 
          GrossWeight, LengthCm, WidthCm, HeightCm, ItemCount, Notes, Status
        )
        VALUES (
          @packCode, @pickListId, @userId, CURRENT_TIMESTAMP, @cartonNo, @palletNo, @shippingLabel,
          @grossWeight, @lengthCm, @widthCm, @heightCm, @itemCount, @notes, 'PACKED'
        )
      `, { 
        packCode, 
        pickListId, 
        userId, 
        cartonNo: cartonNo || null, 
        palletNo: palletNo || null, 
        shippingLabel: shippingLabel || null,
        grossWeight: grossWeight || null,
        lengthCm: lengthCm || null,
        widthCm: widthCm || null,
        heightCm: heightCm || null,
        itemCount: itemCount || 0,
        notes: notes || null
      });

      // Update Pick List status to PACKED
      await db.executeCmd(`
        UPDATE tblPickList SET Status = 'PACKED', UpdatedAt = CURRENT_TIMESTAMP WHERE PickListId = @pickListId
      `, { pickListId });

      // Update SO status to PACKED
      const pickHeader = await db.query('SELECT SOId FROM tblPickList WHERE PickListId = @pickListId', { pickListId });
      if (pickHeader.length > 0) {
        await db.executeCmd(`
          UPDATE tblSalesOrder SET Status = 'PACKED', UpdatedAt = CURRENT_TIMESTAMP WHERE SOId = @soId
        `, { soId: pickHeader[0].SOId });
      }

      return res.status(201).json({ message: 'Packing list recorded successfully', packCode });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // DISPATCH
  // ==========================================
  public static async confirmDispatch(req: AuthenticatedRequest, res: Response) {
    const { soId, deliveryChallanNo, vehicleNo, transporterName, lrNumber } = req.body;
    const userId = req.user?.userId || 1;

    if (!soId || !deliveryChallanNo) {
      return res.status(400).json({ message: 'soId and deliveryChallanNo are required' });
    }

    try {
      const dispatchCode = `DSP-${Date.now()}`;
      await db.executeCmd(`
        INSERT INTO tblDispatch (DispatchCode, SOId, DeliveryChallanNo, VehicleNo, TransporterName, LRNumber, DispatchDate, DispatchedBy, Status)
        VALUES (@dispatchCode, @soId, @deliveryChallanNo, @vehicleNo, @transporterName, @lrNumber, CURRENT_TIMESTAMP, @userId, 'DISPATCHED')
      `, { dispatchCode, soId, deliveryChallanNo, vehicleNo: vehicleNo || null, transporterName: transporterName || null, lrNumber: lrNumber || null, userId });

      // Update Sales Order Status to DISPATCHED
      await db.executeCmd(`UPDATE tblSalesOrder SET Status = 'DISPATCHED', UpdatedAt = CURRENT_TIMESTAMP WHERE SOId = @soId`, { soId });

      // BUG-006 FIX: Accumulate ShippedQty rather than overwrite it (supports partial dispatch)
      await db.executeCmd(`
        UPDATE tblSalesOrderDetail 
        SET ShippedQty = ShippedQty + PickedQty
        WHERE SOId = @soId AND ShippedQty < OrderQty
      `, { soId });

      // Create API log syncing back to ERP
      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('DISPATCH_SYNC', 'OUTBOUND', '/erp/sync/dispatch', @req, @res, 'SUCCESS')
      `, { 
        req: JSON.stringify({ soId, dispatchCode, deliveryChallanNo, lrNumber }), 
        res: '{"status": "SYNCED_TO_BUSY_ERP"}' 
      });

      return res.status(201).json({ message: 'Dispatch completed and status synced back to BUSY ERP', dispatchCode });
    } catch (err: any) {
      console.error('Dispatch confirmation failed:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // WAVE / BATCH PICKING
  // ==========================================
  public static async getWaves(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT pw.*, w.Name AS WarehouseName, u1.FullName AS CreatorName, u2.FullName AS AssigneeName
        FROM tblPickListWave pw
        INNER JOIN tblWarehouse w ON pw.WarehouseId = w.WarehouseId
        INNER JOIN tblUser u1 ON pw.CreatedBy = u1.UserId
        LEFT JOIN tblUser u2 ON pw.AssignedTo = u2.UserId
        ORDER BY pw.WaveId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async createWave(req: AuthenticatedRequest, res: Response) {
    const { warehouseId, assignedTo, notes, soIds } = req.body;
    const userId = req.user?.userId || 1;

    if (!warehouseId || !soIds || !Array.isArray(soIds) || soIds.length === 0) {
      return res.status(400).json({ message: 'warehouseId and soIds array are required' });
    }

    try {
      const waveCode = `WAVE-${Date.now()}`;
      const waveResult = await db.executeCmd(`
        INSERT INTO tblPickListWave (WaveCode, WarehouseId, CreatedBy, AssignedTo, Status, Notes)
        VALUES (@waveCode, @warehouseId, @userId, @assignedTo, 'PENDING', @notes)
      `, { waveCode, warehouseId, userId, assignedTo: assignedTo || null, notes: notes || null });

      const waveId = waveResult.lastID!;

      const createdPickLists = [];

      for (const soId of soIds) {
        // Create Pick List for this Sales Order linked to the wave
        const pickCode = `PICK-SO${soId}-${Date.now()}`;
        const pickResult = await db.executeCmd(`
          INSERT INTO tblPickList (PickCode, SOId, WaveId, CreatedBy, AssignedTo, Status)
          VALUES (@pickCode, @soId, @waveId, @userId, @assignedTo, 'PENDING')
        `, { pickCode, soId, waveId, userId, assignedTo: assignedTo || null });

        const pickListId = pickResult.lastID!;

        // Fetch reservation details to form Picking details
        const reservations = await db.query(`
          SELECT ItemId, BinId, BatchId, Quantity FROM tblReservation 
          WHERE SOId = @soId AND Status = 'ACTIVE'
        `, { soId });

        for (const resv of reservations) {
          await db.executeCmd(`
            INSERT INTO tblPickListDetail (PickListId, ItemId, BinId, BatchId, Quantity, PickedQty, Status)
            VALUES (@pickListId, @itemId, @binId, @batchId, @qty, 0.0, 'PENDING')
          `, { pickListId, itemId: resv.ItemId, binId: resv.BinId, batchId: resv.BatchId, qty: resv.Quantity });
        }

        // Update SO Status
        await db.executeCmd(`UPDATE tblSalesOrder SET Status = 'PICKING', UpdatedAt = CURRENT_TIMESTAMP WHERE SOId = @soId`, { soId });

        createdPickLists.push({ pickListId, pickCode, soId });
      }

      return res.status(201).json({ message: 'Wave picking generated successfully', waveId, waveCode, pickLists: createdPickLists });
    } catch (err: any) {
      console.error('Wave creation failed:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getBatchPickSummary(req: AuthenticatedRequest, res: Response) {
    let soIds: any = req.query.soIds || req.body.soIds;
    const waveId = req.query.waveId || req.body.waveId;

    try {
      if (waveId) {
        const sos = await db.query('SELECT SOId FROM tblPickList WHERE WaveId = @waveId', { waveId });
        soIds = sos.map((s: any) => s.SOId);
      }

      if (typeof soIds === 'string') {
        soIds = soIds.split(',').map((id: string) => parseInt(id.trim())).filter(Boolean);
      }

      if (!soIds || !Array.isArray(soIds) || soIds.length === 0) {
        return res.json([]);
      }

      const cleanSoIds = soIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id));
      if (cleanSoIds.length === 0) {
        return res.json([]);
      }

      const sql = `
        SELECT 
          r.BinId, b.Code AS BinCode, b.Barcode AS BinBarcode,
          r.ItemId, i.Code AS ItemCode, i.Name AS ItemName, i.UOM,
          r.BatchId, bat.BatchNumber, bat.ExpiryDate,
          SUM(r.Quantity) AS TotalQuantity,
          COUNT(DISTINCT r.SOId) AS OrderCount
        FROM tblReservation r
        INNER JOIN tblBin b ON r.BinId = b.BinId
        INNER JOIN tblItem i ON r.ItemId = i.ItemId
        LEFT JOIN tblBatch bat ON r.BatchId = bat.BatchId
        WHERE r.SOId IN (${cleanSoIds.join(',')}) AND r.Status = 'ACTIVE'
        GROUP BY r.BinId, b.Code, b.Barcode, r.ItemId, i.Code, i.Name, i.UOM, r.BatchId, bat.BatchNumber, bat.ExpiryDate
        ORDER BY b.Code, i.Code
      `;
      const summary = await db.query(sql);
      return res.json(summary);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
}
