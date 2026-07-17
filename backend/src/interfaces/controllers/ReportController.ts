import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

export class ReportController {

  // Get Dashboard KPI cards and charts data
  public static async getDashboardStats(req: AuthenticatedRequest, res: Response) {
    try {
      // 1. Pending GRN Count
      const grnPending = await db.query("SELECT COUNT(*) as count FROM tblGRN WHERE Status = 'PENDING'");
      // 2. Pending QC Count — GRNs that have no QC record yet (awaiting inspection)
      const qcPending = await db.query(`
        SELECT COUNT(*) as count FROM tblGRN
        WHERE Status = 'PENDING'
          AND GRNId NOT IN (SELECT GRNId FROM tblQC)
      `);
      // 3. Pending Putaway
      const putawayPending = await db.query("SELECT COUNT(*) as count FROM vw_PendingPutaway");
      // 4. Pending Reservations (Sales orders not fully reserved)
      const reservePending = await db.query("SELECT COUNT(*) as count FROM tblSalesOrder WHERE Status = 'PENDING'");
      // 5. Pending Picking
      const pickPending = await db.query("SELECT COUNT(*) as count FROM tblPickList WHERE Status IN ('PENDING', 'PICKING')");
      // 6. Pending Packing
      const packPending = await db.query("SELECT COUNT(*) as count FROM tblSalesOrder WHERE Status = 'PICKED'");
      // 7. Pending Dispatch
      const dispatchPending = await db.query("SELECT COUNT(*) as count FROM tblSalesOrder WHERE Status = 'PACKED'");

      // 8. Pending Sales Order summary
      const pendingSOSummary = await db.query(`
        SELECT 
          COUNT(DISTINCT so.SOId) as pendingOrdersCount,
          COALESCE(SUM(sod.OrderQty - sod.ShippedQty), 0) as pendingQtySum
        FROM tblSalesOrder so
        INNER JOIN tblSalesOrderDetail sod ON so.SOId = sod.SOId
        WHERE sod.OrderQty > sod.ShippedQty
      `);

      // 9. Pending Purchase Order summary
      const pendingPOSummary = await db.query(`
        SELECT 
          COUNT(DISTINCT po.POId) as pendingOrdersCount,
          COALESCE(SUM(pod.OrderQty - pod.ReceivedQty), 0) as pendingQtySum
        FROM tblPurchaseOrder po
        INNER JOIN tblPurchaseOrderDetail pod ON po.POId = pod.POId
        WHERE pod.OrderQty > pod.ReceivedQty
      `);

      // 10. Partially Dispatched Sales Orders count
      const partiallyDispatched = await db.query(`
        SELECT COUNT(*) as count FROM (
          SELECT SOId
          FROM tblSalesOrderDetail
          GROUP BY SOId
          HAVING SUM(ShippedQty) > 0 AND SUM(OrderQty) > SUM(ShippedQty)
        ) t
      `);

      // 11. Partially Received Purchase Orders count
      const partiallyReceived = await db.query(`
        SELECT COUNT(*) as count FROM (
          SELECT POId
          FROM tblPurchaseOrderDetail
          GROUP BY POId
          HAVING SUM(ReceivedQty) > 0 AND SUM(OrderQty) > SUM(ReceivedQty)
        ) t
      `);

      // Today's movements
      const todayInward = await db.query(`
        SELECT COALESCE(SUM(ReceivedQty), 0) as total 
        FROM tblGRNDetail gd
        INNER JOIN tblGRN g ON gd.GRNId = g.GRNId
        WHERE DATE(g.ReceivedDate) = CURDATE() OR g.ReceivedDate LIKE CONCAT('%', CURDATE(), '%')
      `);
      
      const todayOutward = await db.query(`
        SELECT COALESCE(SUM(ShippedQty), 0) as total 
        FROM tblSalesOrderDetail sod
        INNER JOIN tblSalesOrder so ON sod.SOId = so.SOId
        WHERE DATE(so.UpdatedAt) = CURDATE() AND so.Status = 'DISPATCHED'
      `);

      // Inventory Valuation — use per-item last received unit price (max to avoid Cartesian product)
      const val = await db.query(`
        SELECT COALESCE(SUM(i.Quantity * COALESCE(lp.UnitPrice, 0)), 0) as totalValue
        FROM tblInventory i
        LEFT JOIN (
          SELECT ItemId, MAX(UnitPrice) AS UnitPrice
          FROM tblPurchaseOrderDetail
          GROUP BY ItemId
        ) lp ON i.ItemId = lp.ItemId
      `);

      // Warehouse Occupancy (Delhi Main vs Mumbai Port)
      const occupancy = await db.query(`
        SELECT 
          w.Code, 
          COALESCE(SUM(b.OccupiedWeight), 0) as occWeight,
          COALESCE(SUM(b.CapacityWeight), 1) as capWeight
        FROM tblWarehouse w
        INNER JOIN tblZone z ON w.WarehouseId = z.WarehouseId
        INNER JOIN tblRack r ON z.ZoneId = r.ZoneId
        INNER JOIN tblShelf s ON r.RackId = s.RackId
        INNER JOIN tblBin b ON s.ShelfId = b.ShelfId
        GROUP BY w.Code
      `);

      // 12. Items below Min Stock count
      const belowMinCount = await db.query(`
        SELECT COUNT(*) AS count FROM (
          SELECT item.ItemId
          FROM tblItem item
          LEFT JOIN tblInventory inv ON item.ItemId = inv.ItemId
          GROUP BY item.ItemId, item.MinStock
          HAVING COALESCE(SUM(inv.Quantity), 0) < item.MinStock
        ) t
      `);

      const warehouseUtil = occupancy.map((o: any) => ({
        name: o.Code,
        utilization: Math.round((o.occWeight / o.capWeight) * 100)
      }));

      // Live 7-day inbound trend from tblGRN + tblGRNDetail
      const inboundRaw = await db.query(`
        SELECT 
          DATE(g.ReceivedDate) AS day,
          COALESCE(SUM(gd.ReceivedQty), 0) AS quantity
        FROM tblGRN g
        INNER JOIN tblGRNDetail gd ON g.GRNId = gd.GRNId
        WHERE g.ReceivedDate >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(g.ReceivedDate)
        ORDER BY day ASC
      `);

      // Live 7-day outbound trend from tblDispatch + tblSalesOrderDetail
      const outboundRaw = await db.query(`
        SELECT 
          DATE(d.DispatchDate) AS day,
          COALESCE(SUM(sod.ShippedQty), 0) AS quantity
        FROM tblDispatch d
        INNER JOIN tblSalesOrderDetail sod ON d.SOId = sod.SOId
        WHERE d.DispatchDate >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(d.DispatchDate)
        ORDER BY day ASC
      `);

      // Build last 7 days scaffold so missing dates show 0
      const last7Days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(d.toISOString().slice(0, 10));
      }
      const inboundMap = Object.fromEntries(inboundRaw.map((r: any) => [r.day, r.quantity]));
      const outboundMap = Object.fromEntries(outboundRaw.map((r: any) => [r.day, r.quantity]));
      const inboundTrend = last7Days.map(d => ({ date: d.slice(5), quantity: inboundMap[d] || 0 }));
      const outboundTrend = last7Days.map(d => ({ date: d.slice(5), quantity: outboundMap[d] || 0 }));

      // Expiry items
      const nearExpiry = await db.query(`
        SELECT b.BatchNumber, i.Name AS ItemName, b.ExpiryDate
        FROM tblBatch b
        INNER JOIN tblItem i ON b.ItemId = i.ItemId
        ORDER BY b.ExpiryDate ASC LIMIT 5
      `);

      return res.json({
        kpi: {
          pendingGRN: grnPending[0]?.count || 0,
          pendingQC: qcPending[0]?.count || 0,
          pendingPutaway: putawayPending[0]?.count || 0,
          pendingReservations: reservePending[0]?.count || 0,
          pendingPicking: pickPending[0]?.count || 0,
          pendingPacking: packPending[0]?.count || 0,
          pendingDispatch: dispatchPending[0]?.count || 0,
          todayInward: todayInward[0]?.total || 0,
          todayOutward: todayOutward[0]?.total || 0,
          inventoryValue: Math.round(val[0]?.totalValue || 0),
          damagedStock: 3, // Mock stat
          occupancy: warehouseUtil[0]?.utilization || 0,
          
          // New Report KPI Widgets
          totalPendingSO: pendingSOSummary[0]?.pendingOrdersCount || 0,
          totalPendingSOQty: Math.round(pendingSOSummary[0]?.pendingQtySum || 0),
          totalPendingPO: pendingPOSummary[0]?.pendingOrdersCount || 0,
          totalPendingPOQty: Math.round(pendingPOSummary[0]?.pendingQtySum || 0),
          partiallyDispatchedOrders: partiallyDispatched[0]?.count || 0,
          partiallyReceivedPOs: partiallyReceived[0]?.count || 0,
          belowMinStock: belowMinCount[0]?.count || 0
        },
        trends: {
          inbound: inboundTrend,
          outbound: outboundTrend,
          warehouseUtil
        },
        nearExpiry
      });
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Reports compilation
  public static async getStockReport(req: AuthenticatedRequest, res: Response) {
    const search = req.query.search as string;
    const warehouseCode = req.query.warehouseCode as string;
    const page = parseInt(req.query.page as string || '0');
    const limit = parseInt(req.query.limit as string || '25');
    const offset = page * limit;

    try {
      let query = `
        FROM tblInventory i
        INNER JOIN tblWarehouse w ON i.WarehouseId = w.WarehouseId
        INNER JOIN tblZone z ON i.ZoneId = z.ZoneId
        INNER JOIN tblBin b ON i.BinId = b.BinId
        INNER JOIN tblItem item ON i.ItemId = item.ItemId
        LEFT JOIN tblBatch batch ON i.BatchId = batch.BatchId
        WHERE 1=1
      `;
      const params: any = {};

      if (warehouseCode) {
        query += ` AND w.Code = @warehouseCode`;
        params.warehouseCode = warehouseCode;
      }

      if (search) {
        query += ` AND (item.Code LIKE @search OR item.Name LIKE @search OR b.Code LIKE @search OR batch.BatchNumber LIKE @search)`;
        params.search = `%${search}%`;
      }

      const countQuery = `SELECT COUNT(*) AS total ${query}`;
      const countResult = await db.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        SELECT i.InventoryId, w.Code AS WarehouseCode, z.Code AS ZoneCode, b.Code AS BinCode, 
               item.Code AS ItemCode, item.Name AS ItemName, item.Category, item.UOM,
               batch.BatchNumber, i.Quantity, i.ReservedQty, (i.Quantity - i.ReservedQty) AS AvailableQty
        ${query}
        ORDER BY i.InventoryId DESC
        LIMIT @limit OFFSET @offset
      `;
      params.limit = limit;
      params.offset = offset;

      const rows = await db.query(dataQuery, params);
      return res.json({ items: rows, total });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getAuditLogs(req: AuthenticatedRequest, res: Response) {
    const search = req.query.search as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    
    const page = parseInt(req.query.page as string || '0');
    const limit = parseInt(req.query.limit as string || '25');
    const offset = page * limit;

    try {
      let baseQuery = `
        FROM tblAuditLog a
        LEFT JOIN tblUser u ON a.UserId = u.UserId
        WHERE 1=1
      `;
      const params: any = {};

      if (startDate) {
        baseQuery += ` AND a.Timestamp >= @startDate`;
        params.startDate = startDate;
      }

      if (endDate) {
        baseQuery += ` AND a.Timestamp <= @endDate`;
        params.endDate = `${endDate} 23:59:59`;
      }

      if (search) {
        baseQuery += ` AND (u.Username LIKE @search OR a.Action LIKE @search OR a.TableName LIKE @search OR a.IPAddress LIKE @search)`;
        params.search = `%${search}%`;
      }

      const countQuery = `SELECT COUNT(*) AS total ${baseQuery}`;
      const countResult = await db.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        SELECT a.AuditId, a.UserId, a.Action, a.TableName, a.RecordId, 
               a.OldValues, a.NewValues, a.IPAddress, a.Timestamp,
               COALESCE(u.Username, 'SYSTEM') AS Username
        ${baseQuery}
        ORDER BY a.AuditId DESC
        LIMIT @limit OFFSET @offset
      `;
      params.limit = limit;
      params.offset = offset;

      const rows = await db.query(dataQuery, params);
      return res.json({ items: rows, total });
    } catch (err: any) {
      console.error('Audit logs fetch error:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getTransactionDetails(req: AuthenticatedRequest, res: Response) {
    const { type, id } = req.params;
    try {
      if (type === 'PO') {
        const header = await db.query(`SELECT * FROM tblPurchaseOrder WHERE POId = @id OR POCode = @id`, { id });
        if (header.length === 0) return res.status(404).json({ message: 'Purchase Order not found' });
        const poId = header[0].POId;
        const items = await db.query(`
          SELECT pod.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM 
          FROM tblPurchaseOrderDetail pod 
          INNER JOIN tblItem item ON pod.ItemId = item.ItemId 
          WHERE pod.POId = @poId
        `, { poId });
        return res.json({ header: header[0], items });
      }
      else if (type === 'GRN') {
        const header = await db.query(`
          SELECT g.*, po.POCode, u.FullName AS OperatorName 
          FROM tblGRN g 
          LEFT JOIN tblPurchaseOrder po ON g.POId = po.POId 
          INNER JOIN tblUser u ON g.ReceivedBy = u.UserId 
          WHERE g.GRNId = @id OR g.GRNCode = @id
        `, { id });
        if (header.length === 0) return res.status(404).json({ message: 'GRN not found' });
        const grnId = header[0].GRNId;
        const items = await db.query(`
          SELECT gd.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM, b.BatchNumber 
          FROM tblGRNDetail gd 
          INNER JOIN tblItem item ON gd.ItemId = item.ItemId 
          LEFT JOIN tblBatch b ON gd.BatchId = b.BatchId 
          WHERE gd.GRNId = @grnId
        `, { grnId });
        return res.json({ header: header[0], items });
      }
      else if (type === 'QC') {
        const header = await db.query(`
          SELECT q.*, g.GRNCode, u.FullName AS InspectorName 
          FROM tblQC q 
          INNER JOIN tblGRN g ON q.GRNId = g.GRNId 
          INNER JOIN tblUser u ON q.CheckedBy = u.UserId 
          WHERE q.QCId = @id OR g.GRNCode = @id OR q.GRNId = @id
        `, { id });
        if (header.length === 0) {
          // If no formal QC record exists yet, try loading from GRN since QC is done per GRN
          const grnHeader = await db.query(`
            SELECT g.*, po.POCode, u.FullName AS OperatorName 
            FROM tblGRN g 
            LEFT JOIN tblPurchaseOrder po ON g.POId = po.POId 
            INNER JOIN tblUser u ON g.ReceivedBy = u.UserId 
            WHERE g.GRNId = @id OR g.GRNCode = @id
          `, { id });
          if (grnHeader.length > 0) {
            const grnId = grnHeader[0].GRNId;
            const items = await db.query(`
              SELECT gd.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM, b.BatchNumber 
              FROM tblGRNDetail gd 
              INNER JOIN tblItem item ON gd.ItemId = item.ItemId 
              LEFT JOIN tblBatch b ON gd.BatchId = b.BatchId 
              WHERE gd.GRNId = @grnId
            `, { grnId });
            return res.json({ 
              header: { 
                QCId: 'PENDING', 
                GRNCode: grnHeader[0].GRNCode, 
                InspectorName: 'Pending Inspection', 
                CheckedDate: grnHeader[0].ReceivedDate, 
                Status: 'AWAITING_QC',
                Remarks: 'QC record not completed yet.'
              }, 
              items 
            });
          }
          return res.status(404).json({ message: 'Quality Check record not found' });
        }
        const grnId = header[0].GRNId;
        const items = await db.query(`
          SELECT gd.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM, b.BatchNumber 
          FROM tblGRNDetail gd 
          INNER JOIN tblItem item ON gd.ItemId = item.ItemId 
          LEFT JOIN tblBatch b ON gd.BatchId = b.BatchId 
          WHERE gd.GRNId = @grnId
        `, { grnId });
        return res.json({ header: header[0], items });
      }
      else if (type === 'Putaway') {
        let query = `
          SELECT p.*, gd.GRNId, g.GRNCode, item.Code AS ItemCode, item.Name AS ItemName, bin.Code AS BinCode, b.BatchNumber, u.FullName AS OperatorName 
          FROM tblPutaway p 
          INNER JOIN tblGRNDetail gd ON p.GRNDetailId = gd.GRNDetailId 
          INNER JOIN tblGRN g ON gd.GRNId = g.GRNId 
          INNER JOIN tblItem item ON p.ItemId = item.ItemId 
          INNER JOIN tblBin bin ON p.BinId = bin.BinId 
          LEFT JOIN tblBatch b ON p.BatchId = b.BatchId 
          INNER JOIN tblUser u ON p.PutawayBy = u.UserId
          WHERE p.PutawayId = @id OR g.GRNCode = @id OR g.GRNId = @id
        `;
        const items = await db.query(query, { id });
        if (items.length === 0) return res.status(404).json({ message: 'Putaway records not found' });
        return res.json({ 
          header: { 
            code: items[0].GRNCode, 
            date: items[0].PutawayDate, 
            status: items[0].Status,
            operator: items[0].OperatorName
          }, 
          items: items.map((it: any) => ({
            code: it.ItemCode,
            name: it.ItemName,
            qty: it.Quantity,
            bin: it.BinCode,
            batch: it.BatchNumber || 'N/A'
          })) 
        });
      }
      else if (type === 'Transfer') {
        const header = await db.query(`
          SELECT t.*, item.Code AS ItemCode, item.Name AS ItemName, w1.Name AS FromWarehouseName, w2.Name AS ToWarehouseName, b1.Code AS FromBinCode, b2.Code AS ToBinCode, u.FullName AS OperatorName 
          FROM tblStockTransfer t 
          INNER JOIN tblItem item ON t.ItemId = item.ItemId 
          INNER JOIN tblWarehouse w1 ON t.FromWarehouseId = w1.WarehouseId 
          INNER JOIN tblWarehouse w2 ON t.ToWarehouseId = w2.WarehouseId 
          LEFT JOIN tblBin b1 ON t.FromBinId = b1.BinId 
          LEFT JOIN tblBin b2 ON t.ToBinId = b2.BinId 
          INNER JOIN tblUser u ON t.TransferredBy = u.UserId 
          WHERE t.TransferId = @id OR t.TransferCode = @id
        `, { id });
        if (header.length === 0) return res.status(404).json({ message: 'Stock Transfer not found' });
        return res.json({ header: header[0], items: [{ code: header[0].ItemCode, name: header[0].ItemName, qty: header[0].Quantity, fromBin: header[0].FromBinCode, toBin: header[0].ToBinCode }] });
      }
      else if (type === 'SO') {
        const header = await db.query(`SELECT * FROM tblSalesOrder WHERE SOId = @id OR SOCode = @id`, { id });
        if (header.length === 0) return res.status(404).json({ message: 'Sales Order not found' });
        const soId = header[0].SOId;
        const items = await db.query(`
          SELECT sod.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM 
          FROM tblSalesOrderDetail sod 
          INNER JOIN tblItem item ON sod.ItemId = item.ItemId 
          WHERE sod.SOId = @soId
        `, { soId });
        return res.json({ header: header[0], items });
      }
      else if (type === 'Reservation') {
        const header = await db.query(`
          SELECT r.*, so.SOCode 
          FROM tblReservation r 
          INNER JOIN tblSalesOrder so ON r.SOId = so.SOId 
          WHERE r.ReservationId = @id OR so.SOCode = @id OR r.SOId = @id
          LIMIT 1
        `, { id });
        if (header.length === 0) return res.status(404).json({ message: 'Reservation records not found' });
        
        const items = await db.query(`
          SELECT r.*, item.Code AS ItemCode, item.Name AS ItemName, bin.Code AS BinCode, b.BatchNumber 
          FROM tblReservation r 
          INNER JOIN tblItem item ON r.ItemId = item.ItemId 
          INNER JOIN tblBin bin ON r.BinId = bin.BinId 
          LEFT JOIN tblBatch b ON r.BatchId = b.BatchId 
          WHERE r.SOId = @soId
        `, { soId: header[0].SOId });
        return res.json({ 
          header: {
            code: header[0].SOCode,
            status: header[0].Status,
            date: header[0].CreatedAt
          }, 
          items: items.map((it: any) => ({
            code: it.ItemCode,
            name: it.ItemName,
            qty: it.Quantity,
            bin: it.BinCode,
            batch: it.BatchNumber || 'N/A'
          }))
        });
      }
      else if (type === 'Pick') {
        const header = await db.query(`
          SELECT p.*, so.SOCode, u.FullName AS CreatorName, u2.FullName AS AssigneeName 
          FROM tblPickList p 
          INNER JOIN tblSalesOrder so ON p.SOId = so.SOId 
          INNER JOIN tblUser u ON p.CreatedBy = u.UserId 
          LEFT JOIN tblUser u2 ON p.AssignedTo = u2.UserId 
          WHERE p.PickListId = @id OR p.PickCode = @id
        `, { id });
        if (header.length === 0) return res.status(404).json({ message: 'Pick list not found' });
        const pickListId = header[0].PickListId;
        const items = await db.query(`
          SELECT pd.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM, bin.Code AS BinCode, b.BatchNumber 
          FROM tblPickListDetail pd 
          INNER JOIN tblItem item ON pd.ItemId = item.ItemId 
          INNER JOIN tblBin bin ON pd.BinId = bin.BinId 
          LEFT JOIN tblBatch b ON pd.BatchId = b.BatchId 
          WHERE pd.PickListId = @pickListId
        `, { pickListId });
        return res.json({ header: header[0], items });
      }
      else if (type === 'Pack') {
        const header = await db.query(`
          SELECT p.*, pl.PickCode, so.SOCode, u.FullName AS OperatorName 
          FROM tblPacking p 
          INNER JOIN tblPickList pl ON p.PickListId = pl.PickListId 
          INNER JOIN tblSalesOrder so ON pl.SOId = so.SOId 
          INNER JOIN tblUser u ON p.PackedBy = u.UserId 
          WHERE p.PackingId = @id OR p.PackCode = @id OR pl.PickCode = @id
        `, { id });
        if (header.length === 0) return res.status(404).json({ message: 'Packing record not found' });
        const pickListId = header[0].PickListId;
        const items = await db.query(`
          SELECT pd.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM, bin.Code AS BinCode, b.BatchNumber 
          FROM tblPickListDetail pd 
          INNER JOIN tblItem item ON pd.ItemId = item.ItemId 
          INNER JOIN tblBin bin ON pd.BinId = bin.BinId 
          LEFT JOIN tblBatch b ON pd.BatchId = b.BatchId 
          WHERE pd.PickListId = @pickListId
        `, { pickListId });
        return res.json({ 
          header: {
            code: header[0].PackCode,
            pickCode: header[0].PickCode,
            soCode: header[0].SOCode,
            operator: header[0].OperatorName,
            status: header[0].Status,
            date: header[0].PackedDate,
            cartonNo: header[0].CartonNo,
            palletNo: header[0].PalletNo,
            shippingLabel: header[0].ShippingLabel
          }, 
          items: items.map((it: any) => ({
            code: it.ItemCode,
            name: it.ItemName,
            qty: it.Quantity,
            picked: it.PickedQty,
            batch: it.BatchNumber || 'N/A'
          }))
        });
      }
      else if (type === 'Dispatch') {
        const header = await db.query(`
          SELECT d.*, so.SOCode, u.FullName AS OperatorName 
          FROM tblDispatch d 
          INNER JOIN tblSalesOrder so ON d.SOId = so.SOId 
          INNER JOIN tblUser u ON d.DispatchedBy = u.UserId 
          WHERE d.DispatchId = @id OR d.DispatchCode = @id OR so.SOCode = @id
        `, { id });
        if (header.length === 0) return res.status(404).json({ message: 'Dispatch record not found' });
        const soId = header[0].SOId;
        const items = await db.query(`
          SELECT sod.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM 
          FROM tblSalesOrderDetail sod 
          INNER JOIN tblItem item ON sod.ItemId = item.ItemId 
          WHERE sod.SOId = @soId
        `, { soId });
        return res.json({ header: header[0], items });
      }
      else if (type === 'SalesReturn' || type === 'PurchaseReturn') {
        const returns = await db.query(`
          SELECT r.*, item.Code AS ItemCode, item.Name AS ItemName, b.BatchNumber 
          FROM tblReturns r 
          INNER JOIN tblItem item ON r.ItemId = item.ItemId 
          LEFT JOIN tblBatch b ON r.BatchId = b.BatchId 
          WHERE (r.ReturnId = @id OR r.ReturnCode = @id) AND r.Type = @type
        `, { id, type });
        if (returns.length === 0) return res.status(404).json({ message: 'Return record not found' });
        return res.json({ header: { code: returns[0].ReturnCode, date: returns[0].ReturnDate, status: returns[0].Status, referenceCode: returns[0].ReferenceCode }, items: returns.map((r: any) => ({ code: r.ItemCode, name: r.ItemName, qty: r.Quantity, reason: r.Reason, batch: r.BatchNumber })) });
      }
      else if (type === 'Adjustment') {
        const logs = await db.query(`
          SELECT a.*, u.Username 
          FROM tblAuditLog a 
          LEFT JOIN tblUser u ON a.UserId = u.UserId 
          WHERE (a.AuditId = @id OR a.RecordId = @id) AND a.TableName = 'tblInventory'
        `, { id });
        if (logs.length === 0) return res.status(404).json({ message: 'Adjustment log not found' });
        return res.json({ header: { code: `ADJ-${logs[0].AuditId}`, date: logs[0].Timestamp, status: 'COMPLETED', user: logs[0].Username }, items: [{ action: logs[0].Action, old: logs[0].OldValues, new: logs[0].NewValues }] });
      }
      else if (type === 'ASN') {
        const header = await db.query(`
          SELECT asn.*, s.Name AS SupplierName, w.Name AS WarehouseName, po.POCode
          FROM tblASN asn
          INNER JOIN tblSupplier s ON asn.SupplierId = s.SupplierId
          INNER JOIN tblWarehouse w ON asn.WarehouseId = w.WarehouseId
          LEFT JOIN tblPurchaseOrder po ON asn.POId = po.POId
          WHERE asn.ASNId = @id OR asn.ASNNumber = @id
        `, { id });
        if (header.length === 0) return res.status(404).json({ message: 'ASN not found' });
        const asnId = header[0].ASNId;
        const items = await db.query(`
          SELECT asni.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM
          FROM tblASNItem asni
          INNER JOIN tblItem item ON asni.ItemId = item.ItemId
          WHERE asni.ASNId = @asnId
        `, { asnId });
        return res.json({ header: header[0], items });
      }
      else {
        return res.status(400).json({ message: 'Unsupported transaction type: ' + type });
      }
    } catch (err: any) {
      console.error('Error fetching transaction details:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  public static async updateTransaction(req: AuthenticatedRequest, res: Response) {
    const { type, id } = req.params;
    const fields = req.body;
    try {
      // Resolve resource name by transaction type for permission check
      let resource = 'Inbound';
      if (type === 'PO' || type === 'GRN' || type === 'QC' || type === 'Putaway' || type === 'ASN') {
        resource = 'Inbound';
      } else if (type === 'SO' || type === 'Pick' || type === 'Pack' || type === 'Dispatch') {
        resource = 'Outbound';
      } else if (type === 'Transfer') {
        resource = 'Inventory';
      }

      // Check Update Permission
      const roleId = req.user?.roleId;
      if (req.user?.role !== 'Admin') {
        const perms = await db.query(`
          SELECT CanUpdate FROM tblPermissionMatrix 
          WHERE RoleId = @roleId AND ResourceName = @resource
        `, { roleId, resource });
        
        if (perms.length === 0 || perms[0].CanUpdate === 0) {
          return res.status(403).json({ message: `Access Denied: You do not have permission to modify ${type} vouchers.` });
        }
      }

      if (type === 'GRN') {
        await db.executeCmd(`
          UPDATE tblGRN
          SET InvoiceNo = @invoiceNo
          WHERE GRNId = @id OR GRNCode = @id
        `, { invoiceNo: fields.invoiceNo, id });
      }
      else if (type === 'Pick') {
        let assigneeId = fields.assigneeId;
        if (fields.assignee && !assigneeId) {
          const users = await db.query('SELECT UserId FROM tblUser WHERE FullName = @assignee', { assignee: fields.assignee });
          if (users.length > 0) assigneeId = users[0].UserId;
        }
        await db.executeCmd(`
          UPDATE tblPickList
          SET AssignedTo = @assigneeId
          WHERE PickListId = @id OR PickCode = @id
        `, { assigneeId: assigneeId || null, id });
      }
      else if (type === 'Dispatch') {
        await db.executeCmd(`
          UPDATE tblDispatch
          SET VehicleNo = @vehicleNo, TransporterName = @transporterName, LRNumber = @lrNumber
          WHERE DispatchId = @id OR DispatchCode = @id
        `, { vehicleNo: fields.vehicleNo, transporterName: fields.transporterName, lrNumber: fields.lrNumber, id });
      }
      else if (type === 'Pack') {
        await db.executeCmd(`
          UPDATE tblPacking
          SET CartonNo = @cartonNo, PalletNo = @palletNo, ShippingLabel = @shippingLabel
          WHERE PackingId = @id OR PackCode = @id
        `, { cartonNo: fields.cartonNo, palletNo: fields.palletNo, shippingLabel: fields.shippingLabel, id });
      }
      return res.json({ message: 'Transaction updated successfully' });
    } catch (err: any) {
      console.error('Error updating transaction:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteTransaction(req: AuthenticatedRequest, res: Response) {
    const { type, id } = req.params;
    try {
      // Resolve resource name by transaction type for permission check
      let resource = 'Inbound';
      if (type === 'PO' || type === 'GRN' || type === 'QC' || type === 'Putaway' || type === 'ASN') {
        resource = 'Inbound';
      } else if (type === 'SO' || type === 'Pick' || type === 'Pack' || type === 'Dispatch') {
        resource = 'Outbound';
      } else if (type === 'Transfer') {
        resource = 'Inventory';
      }

      // Check Delete Permission
      const roleId = req.user?.roleId;
      if (req.user?.role !== 'Admin') {
        const perms = await db.query(`
          SELECT CanDelete FROM tblPermissionMatrix 
          WHERE RoleId = @roleId AND ResourceName = @resource
        `, { roleId, resource });
        
        if (perms.length === 0 || perms[0].CanDelete === 0) {
          return res.status(403).json({ message: `Access Denied: You do not have permission to delete ${type} vouchers.` });
        }
      }

      if (type === 'GRN') {
        const grns = await db.query('SELECT GRNId, POId FROM tblGRN WHERE GRNId = @id OR GRNCode = @id', { id });
        if (grns.length === 0) return res.status(404).json({ message: 'GRN not found' });
        const grnId = grns[0].GRNId;
        const poId = grns[0].POId;

        // Reset PO received levels if linked
        if (poId) {
          const details = await db.query('SELECT ItemId, ReceivedQty FROM tblGRNDetail WHERE GRNId = @grnId', { grnId });
          for (const line of details) {
            await db.executeCmd(`
              UPDATE tblPurchaseOrderDetail 
              SET ReceivedQty = CASE WHEN ReceivedQty - @qty < 0 THEN 0.0 ELSE ReceivedQty - @qty END
              WHERE POId = @poId AND ItemId = @itemId
            `, { qty: line.ReceivedQty, poId, itemId: line.ItemId });
          }
          await db.executeCmd(`
            UPDATE tblPurchaseOrder 
            SET Status = CASE 
              WHEN EXISTS(SELECT 1 FROM tblPurchaseOrderDetail WHERE POId = @poId AND ReceivedQty > 0) THEN 'PARTIAL' 
              ELSE 'PENDING' 
            END
            WHERE POId = @poId
          `, { poId });
        }

        await db.executeCmd('DELETE FROM tblGRNDetail WHERE GRNId = @grnId', { grnId });
        await db.executeCmd('DELETE FROM tblQC WHERE GRNId = @grnId', { grnId });
        await db.executeCmd('DELETE FROM tblGRN WHERE GRNId = @grnId', { grnId });
      }
      else if (type === 'Pick') {
        const picks = await db.query('SELECT PickListId FROM tblPickList WHERE PickListId = @id OR PickCode = @id', { id });
        if (picks.length === 0) return res.status(404).json({ message: 'Pick List not found' });
        const pickId = picks[0].PickListId;

        await db.executeCmd('DELETE FROM tblPickListDetail WHERE PickListId = @pickId', { pickId });
        await db.executeCmd('DELETE FROM tblPickList WHERE PickListId = @pickId', { pickId });
      }
      else if (type === 'Pack') {
        await db.executeCmd('DELETE FROM tblPacking WHERE PackingId = @id OR PackCode = @id', { id });
      }
      else if (type === 'Dispatch') {
        await db.executeCmd('DELETE FROM tblDispatch WHERE DispatchId = @id OR DispatchCode = @id', { id });
      }
      else if (type === 'Transfer') {
        await db.executeCmd('DELETE FROM tblStockTransfer WHERE TransferId = @id OR TransferCode = @id', { id });
      }
      else if (type === 'QC') {
        await db.executeCmd('DELETE FROM tblQC WHERE QCId = @id', { id });
      }
      else if (type === 'PO') {
        const pos = await db.query('SELECT POId FROM tblPurchaseOrder WHERE POId = @id OR POCode = @id', { id });
        if (pos.length === 0) return res.status(404).json({ message: 'PO not found' });
        const poId = pos[0].POId;

        await db.executeCmd('DELETE FROM tblPurchaseOrderDetail WHERE POId = @poId', { poId });
        await db.executeCmd('DELETE FROM tblPurchaseOrder WHERE POId = @poId', { poId });
      }
      else if (type === 'SO') {
        const sos = await db.query('SELECT SOId FROM tblSalesOrder WHERE SOId = @id OR SOCode = @id', { id });
        if (sos.length === 0) return res.status(404).json({ message: 'SO not found' });
        const soId = sos[0].SOId;

        await db.executeCmd('DELETE FROM tblSalesOrderDetail WHERE SOId = @soId', { soId });
        await db.executeCmd('DELETE FROM tblSalesOrder WHERE SOId = @soId', { soId });
      }
      else if (type === 'ASN') {
        const asns = await db.query('SELECT ASNId, Status FROM tblASN WHERE ASNId = @id OR ASNNumber = @id', { id });
        if (asns.length === 0) return res.status(404).json({ message: 'ASN not found' });
        const asnId = asns[0].ASNId;
        if (asns[0].Status !== 'Draft' && asns[0].Status !== 'Cancelled') {
          return res.status(400).json({ message: 'Only Draft or Cancelled ASNs can be deleted.' });
        }
        await db.executeCmd('DELETE FROM tblASN WHERE ASNId = @asnId', { asnId });
      }
      else {
        return res.status(400).json({ message: 'Unsupported transaction type for deletion: ' + type });
      }

      return res.json({ message: 'Transaction voucher deleted successfully' });
    } catch (err: any) {
      console.error('Error deleting transaction:', err);
      return res.status(500).json({ message: 'Failed to delete transaction', error: err.message });
    }
  }


  public static async searchTransactions(req: AuthenticatedRequest, res: Response) {
    const q = (req.query.q as string || '').trim();
    if (!q) return res.json([]);
    try {
      const results: any[] = [];

      const likeQ = `%${q}%`;

      // 1. Search POs
      const pos = await db.query(
        `SELECT POId AS id, POCode AS code, 'PO' AS type, CONCAT('Purchase Order (', Status, ')') AS label
         FROM tblPurchaseOrder WHERE POCode LIKE @likeQ OR VendorName LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...pos);

      // 2. Search SOs
      const sos = await db.query(
        `SELECT SOId AS id, SOCode AS code, 'SO' AS type, CONCAT('Sales Order (', Status, ')') AS label
         FROM tblSalesOrder WHERE SOCode LIKE @likeQ OR CustomerName LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...sos);

      // 3. Search GRNs
      const grns = await db.query(
        `SELECT GRNId AS id, GRNCode AS code, 'GRN' AS type, CONCAT('Goods Receipt Note (', Status, ')') AS label
         FROM tblGRN WHERE GRNCode LIKE @likeQ OR InvoiceNo LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...grns);

      // 4. Search Pick Lists
      const picks = await db.query(
        `SELECT PickListId AS id, PickCode AS code, 'Pick' AS type, CONCAT('Pick List Wave (', Status, ')') AS label
         FROM tblPickList WHERE PickCode LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...picks);

      // 5. Search Transfers
      const transfers = await db.query(
        `SELECT TransferId AS id, TransferCode AS code, 'Transfer' AS type, CONCAT('Stock Transfer (', Status, ')') AS label
         FROM tblStockTransfer WHERE TransferCode LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...transfers);

      // 6. Search Packing
      const packs = await db.query(
        `SELECT PackingId AS id, PackCode AS code, 'Pack' AS type, CONCAT('Packing Carton (', Status, ')') AS label
         FROM tblPacking WHERE PackCode LIKE @likeQ OR CartonNo LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...packs);

      // 7. Search Dispatches
      const dispatches = await db.query(
        `SELECT DispatchId AS id, DispatchCode AS code, 'Dispatch' AS type, CONCAT('Dispatch Challan (', Status, ')') AS label
         FROM tblDispatch WHERE DispatchCode LIKE @likeQ OR DeliveryChallanNo LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...dispatches);

      // 8. Search QCs
      const qcs = await db.query(
        `SELECT q.QCId AS id, g.GRNCode AS code, 'QC' AS type, CONCAT('QC Check (', q.Status, ')') AS label
         FROM tblQC q INNER JOIN tblGRN g ON q.GRNId = g.GRNId
         WHERE g.GRNCode LIKE @likeQ OR q.Remarks LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...qcs);

      // 9. Search Putaways
      const putaways = await db.query(
        `SELECT DISTINCT gd.GRNId AS id, g.GRNCode AS code, 'Putaway' AS type, CONCAT('Putaway Action (', g.Status, ')') AS label
         FROM tblPutaway p
         INNER JOIN tblGRNDetail gd ON p.GRNDetailId = gd.GRNDetailId
         INNER JOIN tblGRN g ON gd.GRNId = g.GRNId
         WHERE g.GRNCode LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...putaways);

      // 10. Search Reservations
      const reservations = await db.query(
        `SELECT DISTINCT r.SOId AS id, so.SOCode AS code, 'Reservation' AS type, CONCAT('Inventory Reservation (', so.Status, ')') AS label
         FROM tblReservation r INNER JOIN tblSalesOrder so ON r.SOId = so.SOId
         WHERE so.SOCode LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...reservations);

      // 11. Search ASNs
      const asns = await db.query(
        `SELECT ASNId AS id, ASNNumber AS code, 'ASN' AS type, CONCAT('ASN Notice (', Status, ')') AS label
         FROM tblASN WHERE ASNNumber LIKE @likeQ LIMIT 5`,
        { likeQ }
      );
      results.push(...asns);

      return res.json(results);
    } catch (err: any) {
      console.error('Error searching transactions:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getPendingSOReport(req: AuthenticatedRequest, res: Response) {
    const search = req.query.search as string;
    const warehouseCode = req.query.warehouseCode as string;
    const status = req.query.status as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const excludeCompleted = req.query.excludeCompleted === 'true';
    
    const page = parseInt(req.query.page as string || '0');
    const limit = parseInt(req.query.limit as string || '25');
    const offset = page * limit;

    try {
      let baseQuery = `
        FROM tblSalesOrder so
        INNER JOIN tblSalesOrderDetail sod ON so.SOId = sod.SOId
        INNER JOIN tblItem item ON sod.ItemId = item.ItemId
        LEFT JOIN (
            SELECT DISTINCT r.SOId, wh.Code
            FROM tblReservation r
            INNER JOIN tblBin b ON r.BinId = b.BinId
            INNER JOIN tblShelf sh ON b.ShelfId = sh.ShelfId
            INNER JOIN tblRack rk ON sh.RackId = rk.RackId
            INNER JOIN tblZone z ON rk.ZoneId = z.ZoneId
            INNER JOIN tblWarehouse wh ON z.WarehouseId = wh.WarehouseId
        ) w ON so.SOId = w.SOId
        WHERE so.Status != 'CANCELLED'
      `;
      const params: any = {};

      if (warehouseCode) {
        baseQuery += ` AND w.Code = @warehouseCode`;
        params.warehouseCode = warehouseCode;
      }

      if (startDate) {
        baseQuery += ` AND so.OrderDate >= @startDate`;
        params.startDate = startDate;
      }

      if (endDate) {
        baseQuery += ` AND so.OrderDate <= @endDate`;
        params.endDate = `${endDate} 23:59:59`;
      }

      if (search) {
        baseQuery += ` AND (so.SOCode LIKE @search OR so.CustomerName LIKE @search OR item.Code LIKE @search OR item.Name LIKE @search)`;
        params.search = `%${search}%`;
      }

      if (status) {
        if (status === 'Pending') {
          baseQuery += ` AND sod.ShippedQty = 0`;
        } else if (status === 'Partially Dispatched') {
          baseQuery += ` AND sod.ShippedQty > 0 AND sod.OrderQty > sod.ShippedQty`;
        } else if (status === 'Fully Dispatched') {
          baseQuery += ` AND sod.OrderQty <= sod.ShippedQty`;
        }
      }

      if (excludeCompleted && !status) {
        baseQuery += ` AND sod.OrderQty > sod.ShippedQty`;
      }

      const countQuery = `SELECT COUNT(*) AS total ${baseQuery}`;
      const countResult = await db.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        SELECT so.SOId, so.SOCode, so.OrderDate, so.CustomerName, so.CustomerCode,
               sod.SODetailId, sod.ItemId, sod.OrderQty, sod.ShippedQty, sod.UOM,
               item.Code AS ItemCode, item.Name AS ItemName,
               COALESCE(w.Code, 'WH-DEL') AS WarehouseCode
        ${baseQuery}
        ORDER BY so.OrderDate DESC, so.SOId DESC
        LIMIT @limit OFFSET @offset
      `;
      params.limit = limit;
      params.offset = offset;

      const rows = await db.query(dataQuery, params);
      const processed = rows.map((row: any) => {
        const orderDate = new Date(row.OrderDate);
        orderDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - orderDate.getTime();
        const ageingDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        const pendingQty = Math.max(0, row.OrderQty - row.ShippedQty);
        
        let rowStatus = 'Pending';
        if (row.ShippedQty > 0) {
          rowStatus = pendingQty === 0 ? 'Fully Dispatched' : 'Partially Dispatched';
        }
        
        return {
          ...row,
          PendingQty: pendingQty,
          AgeingDays: ageingDays,
          Status: rowStatus
        };
      });

      return res.json({ items: processed, total });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getPendingPOReport(req: AuthenticatedRequest, res: Response) {
    const search = req.query.search as string;
    const warehouseCode = req.query.warehouseCode as string;
    const status = req.query.status as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const excludeCompleted = req.query.excludeCompleted === 'true';
    
    const page = parseInt(req.query.page as string || '0');
    const limit = parseInt(req.query.limit as string || '25');
    const offset = page * limit;

    try {
      let baseQuery = `
        FROM tblPurchaseOrder po
        INNER JOIN tblPurchaseOrderDetail pod ON po.POId = pod.POId
        INNER JOIN tblItem item ON pod.ItemId = item.ItemId
        LEFT JOIN (
            SELECT DISTINCT g.POId, wh.Code
            FROM tblGRN g
            INNER JOIN tblGRNDetail gd ON g.GRNId = gd.GRNId
            INNER JOIN tblPutaway p ON gd.GRNDetailId = p.GRNDetailId
            INNER JOIN tblBin b ON p.BinId = b.BinId
            INNER JOIN tblShelf sh ON b.ShelfId = sh.ShelfId
            INNER JOIN tblRack rk ON sh.RackId = rk.RackId
            INNER JOIN tblZone z ON rk.ZoneId = z.ZoneId
            INNER JOIN tblWarehouse wh ON z.WarehouseId = wh.WarehouseId
        ) w ON po.POId = w.POId
        WHERE po.Status != 'CANCELLED'
      `;
      const params: any = {};

      if (warehouseCode) {
        baseQuery += ` AND w.Code = @warehouseCode`;
        params.warehouseCode = warehouseCode;
      }

      if (startDate) {
        baseQuery += ` AND po.OrderDate >= @startDate`;
        params.startDate = startDate;
      }

      if (endDate) {
        baseQuery += ` AND po.OrderDate <= @endDate`;
        params.endDate = `${endDate} 23:59:59`;
      }

      if (search) {
        baseQuery += ` AND (po.POCode LIKE @search OR po.VendorName LIKE @search OR item.Code LIKE @search OR item.Name LIKE @search)`;
        params.search = `%${search}%`;
      }

      if (status) {
        if (status === 'Pending') {
          baseQuery += ` AND pod.ReceivedQty = 0`;
        } else if (status === 'Partially Received') {
          baseQuery += ` AND pod.ReceivedQty > 0 AND pod.OrderQty > pod.ReceivedQty`;
        } else if (status === 'Fully Received') {
          baseQuery += ` AND pod.OrderQty <= pod.ReceivedQty`;
        }
      }

      if (excludeCompleted && !status) {
        baseQuery += ` AND pod.OrderQty > pod.ReceivedQty`;
      }

      const countQuery = `SELECT COUNT(*) AS total ${baseQuery}`;
      const countResult = await db.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        SELECT po.POId, po.POCode, po.OrderDate, po.VendorName, po.VendorCode,
               pod.PODetailId, pod.ItemId, pod.OrderQty, pod.ReceivedQty, pod.UOM,
               item.Code AS ItemCode, item.Name AS ItemName,
               COALESCE(w.Code, 'WH-DEL') AS WarehouseCode
        ${baseQuery}
        ORDER BY po.OrderDate DESC, po.POId DESC
        LIMIT @limit OFFSET @offset
      `;
      params.limit = limit;
      params.offset = offset;

      const rows = await db.query(dataQuery, params);
      const processed = rows.map((row: any) => {
        const orderDate = new Date(row.OrderDate);
        orderDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - orderDate.getTime();
        const ageingDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        const pendingQty = Math.max(0, row.OrderQty - row.ReceivedQty);
        
        let rowStatus = 'Pending';
        if (row.ReceivedQty > 0) {
          rowStatus = pendingQty === 0 ? 'Fully Received' : 'Partially Received';
        }
        
        return {
          ...row,
          PendingQty: pendingQty,
          AgeingDays: ageingDays,
          Status: rowStatus
        };
      });

      return res.json({ items: processed, total });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getCreatedGRNsReport(req: AuthenticatedRequest, res: Response) {
    const search = req.query.search as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const status = req.query.status as string;
    
    const page = parseInt(req.query.page as string || '0');
    const limit = parseInt(req.query.limit as string || '25');
    const offset = page * limit;

    try {
      let baseQuery = `
        FROM tblGRN g
        LEFT JOIN tblPurchaseOrder po ON g.POId = po.POId
        INNER JOIN tblUser u ON g.ReceivedBy = u.UserId
        WHERE 1=1
      `;
      const params: any = {};

      if (startDate) {
        baseQuery += ` AND g.ReceivedDate >= @startDate`;
        params.startDate = startDate;
      }

      if (endDate) {
        baseQuery += ` AND g.ReceivedDate <= @endDate`;
        params.endDate = `${endDate} 23:59:59`;
      }

      if (search) {
        baseQuery += ` AND (g.GRNCode LIKE @search OR po.POCode LIKE @search OR g.InvoiceNo LIKE @search OR u.FullName LIKE @search)`;
        params.search = `%${search}%`;
      }

      if (status) {
        baseQuery += ` AND g.Status = @status`;
        params.status = status;
      }

      const countQuery = `SELECT COUNT(*) AS total ${baseQuery}`;
      const countResult = await db.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        SELECT g.GRNId, g.GRNCode, g.ReceivedDate, g.InvoiceNo, g.Status, g.IsSynced,
               po.POCode, u.FullName AS OperatorName
        ${baseQuery}
        ORDER BY g.GRNId DESC
        LIMIT @limit OFFSET @offset
      `;
      params.limit = limit;
      params.offset = offset;

      const rows = await db.query(dataQuery, params);
      return res.json({ items: rows, total });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getPOGrnHistory(req: AuthenticatedRequest, res: Response) {
    const { poId } = req.params;
    try {
      const rows = await db.query(`
        SELECT g.*, u.FullName AS OperatorName 
        FROM tblGRN g 
        INNER JOIN tblUser u ON g.ReceivedBy = u.UserId 
        WHERE g.POId = @poId
        ORDER BY g.GRNId DESC
      `, { poId });
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getSODispatchHistory(req: AuthenticatedRequest, res: Response) {
    const { soId } = req.params;
    try {
      const rows = await db.query(`
        SELECT d.*, u.FullName AS OperatorName 
        FROM tblDispatch d 
        INNER JOIN tblUser u ON d.DispatchedBy = u.UserId 
        WHERE d.SOId = @soId
        ORDER BY d.DispatchId DESC
      `, { soId });
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getBinCapacities(req: AuthenticatedRequest, res: Response) {
    const search = req.query.search as string;
    const warehouseCode = req.query.warehouseCode as string;
    const zone = req.query.zone as string;
    const binCode = req.query.binCode as string;
    const itemGroup = req.query.itemGroup as string;
    const minCapacity = parseFloat(req.query.minCapacity as string || '0');
    const emptyBinsOnly = req.query.emptyBinsOnly === 'true';

    const page = parseInt(req.query.page as string || '0');
    const limit = parseInt(req.query.limit as string || '25');
    const offset = page * limit;

    try {
      let baseQuery = `
        FROM tblBin b
        INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
        INNER JOIN tblRack r ON s.RackId = r.RackId
        INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
        INNER JOIN tblWarehouse w ON z.WarehouseId = w.WarehouseId
        WHERE 1=1
      `;
      const params: any = {};

      if (warehouseCode) {
        baseQuery += ` AND w.Code = @warehouseCode`;
        params.warehouseCode = warehouseCode;
      }

      if (zone) {
        baseQuery += ` AND (z.Code = @zone OR z.Name = @zone)`;
        params.zone = zone;
      }

      if (binCode) {
        baseQuery += ` AND b.Code LIKE @binCode`;
        params.binCode = `%${binCode}%`;
      }

      if (emptyBinsOnly) {
        baseQuery += ` AND b.OccupiedVolume = 0 AND b.OccupiedWeight = 0`;
      }

      if (minCapacity > 0) {
        baseQuery += ` AND (b.CapacityWeight - b.OccupiedWeight >= @minCapacity OR b.CapacityVolume - b.OccupiedVolume >= @minCapacity)`;
        params.minCapacity = minCapacity;
      }

      if (search) {
        baseQuery += ` AND (b.Code LIKE @search OR b.Barcode LIKE @search)`;
        params.search = `%${search}%`;
      }

      if (itemGroup) {
        baseQuery += ` AND EXISTS (
          SELECT 1 FROM tblInventory i
          INNER JOIN tblItem itm ON i.ItemId = itm.ItemId
          WHERE i.BinId = b.BinId AND i.Quantity > 0 AND itm.Category LIKE @itemGroup
        )`;
        params.itemGroup = `%${itemGroup}%`;
      }

      const countQuery = `SELECT COUNT(*) AS total ${baseQuery}`;
      const countResult = await db.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        SELECT 
          b.BinId,
          b.Code AS BinCode,
          b.Barcode AS BinBarcode,
          b.CapacityWeight,
          b.OccupiedWeight,
          (b.CapacityWeight - b.OccupiedWeight) AS AvailableWeight,
          b.CapacityVolume,
          b.OccupiedVolume,
          (b.CapacityVolume - b.OccupiedVolume) AS AvailableVolume,
          w.Name AS WarehouseName,
          w.Code AS WarehouseCode,
          z.Name AS ZoneName,
          z.Code AS ZoneCode,
          CASE 
            WHEN b.OccupiedVolume = 0 AND b.OccupiedWeight = 0 THEN 'Empty'
            WHEN b.OccupiedVolume >= b.CapacityVolume OR b.OccupiedWeight >= b.CapacityWeight THEN 'Full'
            ELSE 'Partially Occupied'
          END AS BinStatus,
          CASE 
            WHEN b.CapacityVolume > 0 THEN ROUND((b.OccupiedVolume / b.CapacityVolume) * 100, 2)
            ELSE 0.00
          END AS VolumeOccupancyPercent,
          CASE 
            WHEN b.CapacityWeight > 0 THEN ROUND((b.OccupiedWeight / b.CapacityWeight) * 100, 2)
            ELSE 0.00
          END AS WeightOccupancyPercent,
          (
            SELECT GROUP_CONCAT(DISTINCT CONCAT(itm.Name, ' (', itm.Code, ')') SEPARATOR ', ')
            FROM tblInventory i
            INNER JOIN tblItem itm ON i.ItemId = itm.ItemId
            WHERE i.BinId = b.BinId AND i.Quantity > 0
          ) AS CurrentItems,
          (
            SELECT GROUP_CONCAT(DISTINCT itm.Category SEPARATOR ', ')
            FROM tblInventory i
            INNER JOIN tblItem itm ON i.ItemId = itm.ItemId
            WHERE i.BinId = b.BinId AND i.Quantity > 0
          ) AS CurrentCategories
        ${baseQuery}
        ORDER BY b.Code ASC
        LIMIT @limit OFFSET @offset
      `;
      params.limit = limit;
      params.offset = offset;

      const rows = await db.query(dataQuery, params);
      return res.json({ items: rows, total });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getReplenishmentReport(req: AuthenticatedRequest, res: Response) {
    const search = req.query.search as string;
    const status = req.query.status as string; // 'ALL_ALERTS', 'BELOW_MIN', 'ABOVE_MAX', 'ALL'
    const page = parseInt(req.query.page as string || '0');
    const limit = parseInt(req.query.limit as string || '25');
    const offset = page * limit;

    try {
      let baseQuery = `
        FROM tblItem item
        LEFT JOIN (
            SELECT ItemId, SUM(Quantity) AS TotalStock, SUM(ReservedQty) AS TotalReserved, SUM(Quantity - ReservedQty) AS TotalAvailable
            FROM tblInventory
            GROUP BY ItemId
        ) inv_sum ON item.ItemId = inv_sum.ItemId
        WHERE 1=1
      `;
      const params: any = {};

      if (search) {
        baseQuery += ` AND (item.Code LIKE @search OR item.Name LIKE @search OR item.Category LIKE @search)`;
        params.search = `%${search}%`;
      }

      if (status === 'BELOW_MIN') {
        baseQuery += ` AND COALESCE(inv_sum.TotalStock, 0) < item.MinStock`;
      } else if (status === 'ABOVE_MAX') {
        baseQuery += ` AND COALESCE(inv_sum.TotalStock, 0) > item.MaxStock`;
      } else if (status === 'ALL_ALERTS' || !status) {
        baseQuery += ` AND (COALESCE(inv_sum.TotalStock, 0) < item.MinStock OR COALESCE(inv_sum.TotalStock, 0) > item.MaxStock)`;
      }

      const countQuery = `SELECT COUNT(*) AS total ${baseQuery}`;
      const countResult = await db.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        SELECT 
            item.ItemId,
            item.Code AS ItemCode,
            item.Name AS ItemName,
            item.Category,
            item.UOM,
            item.MinStock,
            item.MaxStock,
            item.Weight,
            item.Volume,
            COALESCE(inv_sum.TotalStock, 0) AS TotalStock,
            COALESCE(inv_sum.TotalReserved, 0) AS TotalReserved,
            COALESCE(inv_sum.TotalAvailable, 0) AS TotalAvailable,
            CASE 
                WHEN COALESCE(inv_sum.TotalStock, 0) < item.MinStock THEN 'BELOW_MIN'
                WHEN COALESCE(inv_sum.TotalStock, 0) > item.MaxStock THEN 'ABOVE_MAX'
                ELSE 'NORMAL'
            END AS StockStatus
        ${baseQuery}
        ORDER BY (item.MinStock - COALESCE(inv_sum.TotalStock, 0)) DESC, item.ItemId DESC
        LIMIT @limit OFFSET @offset
      `;
      params.limit = limit;
      params.offset = offset;

      const rows = await db.query(dataQuery, params);

      if (rows.length > 0) {
        const itemIds = rows.map((r: any) => r.ItemId);
        
        const spaceRows = await db.query(`
          SELECT 
              item_choice.ItemId,
              COALESCE(SUM(
                  FLOOR(LEAST(
                      (b.CapacityWeight - b.OccupiedWeight) / CASE WHEN COALESCE(item_choice.Weight, 0) > 0 THEN item_choice.Weight ELSE 2.0 END,
                      (b.CapacityVolume - b.OccupiedVolume) / CASE WHEN COALESCE(item_choice.Volume, 0) > 0 THEN item_choice.Volume ELSE 1.5 END
                  ))
              ), 0) AS AvailableStorageSpace
          FROM tblBin b
          CROSS JOIN tblItem item_choice
          WHERE item_choice.ItemId IN (${itemIds.join(',')})
            AND b.IsActive = 1
            AND NOT EXISTS (
                SELECT 1 
                FROM tblInventory i2 
                WHERE i2.BinId = b.BinId 
                  AND i2.ItemId != item_choice.ItemId 
                  AND i2.Quantity > 0
            )
          GROUP BY item_choice.ItemId
        `);

        const spaceMap = Object.fromEntries(spaceRows.map((s: any) => [s.ItemId, s.AvailableStorageSpace]));

        for (const row of rows) {
          const space = spaceMap[row.ItemId] || 0;
          row.AvailableStorageSpace = Math.max(0, space);
          
          if (row.StockStatus === 'BELOW_MIN') {
            const targetQty = Math.max(0, row.MaxStock - row.TotalStock);
            row.ReorderQty = targetQty;
            row.FeasibleQty = Math.min(targetQty, row.AvailableStorageSpace);
          } else {
            row.ReorderQty = 0;
            row.FeasibleQty = 0;
          }
        }
      }

      return res.json({ items: rows, total });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Get persistent Stock Alert Audit Logs
  public static async getReplenishmentLogs(req: AuthenticatedRequest, res: Response) {
    const search = req.query.search as string;
    const status = req.query.status as string; // 'ALL', 'ACTIVE', 'RESOLVED'
    const alertType = req.query.alertType as string; // 'ALL', 'BELOW_MIN', 'ABOVE_MAX'
    const page = parseInt(req.query.page as string || '0');
    const limit = parseInt(req.query.limit as string || '25');
    const offset = page * limit;

    try {
      let baseQuery = `
        FROM tblStockAlertLog log
        INNER JOIN tblItem item ON log.ItemId = item.ItemId
        WHERE 1=1
      `;
      const params: any = {};

      if (search) {
        baseQuery += ` AND (item.Code LIKE @search OR item.Name LIKE @search OR log.ReferenceDoc LIKE @search)`;
        params.search = `%${search}%`;
      }

      if (status && status !== 'ALL' && status !== '') {
        baseQuery += ` AND log.Status = @status`;
        params.status = status;
      }

      if (alertType && alertType !== 'ALL' && alertType !== '') {
        baseQuery += ` AND log.AlertType = @alertType`;
        params.alertType = alertType;
      }

      const countQuery = `SELECT COUNT(*) AS total ${baseQuery}`;
      const countResult = await db.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        SELECT 
            log.AlertLogId,
            log.ItemId,
            item.Code AS ItemCode,
            item.Name AS ItemName,
            item.Category,
            item.UOM,
            log.AlertType,
            log.CurrentStock,
            log.ThresholdValue,
            log.ReferenceDoc,
            log.Status,
            log.CreatedAt,
            log.ResolvedAt
        ${baseQuery}
        ORDER BY log.AlertLogId DESC
        LIMIT @limit OFFSET @offset
      `;
      params.limit = limit;
      params.offset = offset;

      const rows = await db.query(dataQuery, params);
      return res.json({ items: rows, total });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
}

