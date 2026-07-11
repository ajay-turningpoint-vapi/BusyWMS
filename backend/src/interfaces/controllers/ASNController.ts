import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

const formatMySQLDateTime = (dtStr: any): string | null => {
  if (!dtStr) return null;
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return null;
  }
};

export class ASNController {

  // 1. Get ASNs list with optional filters
  public static async getASNs(req: AuthenticatedRequest, res: Response) {
    const { startDate, endDate, supplierId, warehouseId, status } = req.query;
    try {
      let sql = `
        SELECT asn.*, s.Name AS SupplierName, w.Name AS WarehouseName, po.POCode
        FROM tblASN asn
        INNER JOIN tblSupplier s ON asn.SupplierId = s.SupplierId
        INNER JOIN tblWarehouse w ON asn.WarehouseId = w.WarehouseId
        LEFT JOIN tblPurchaseOrder po ON asn.POId = po.POId
        WHERE 1=1
      `;
      const params: Record<string, any> = {};

      if (startDate) {
        sql += ` AND asn.ExpectedArrivalDate >= @startDate`;
        params.startDate = `${startDate} 00:00:00`;
      }
      if (endDate) {
        sql += ` AND asn.ExpectedArrivalDate <= @endDate`;
        params.endDate = `${endDate} 23:59:59`;
      }
      if (supplierId) {
        sql += ` AND asn.SupplierId = @supplierId`;
        params.supplierId = parseInt(supplierId as string, 10);
      }
      if (warehouseId) {
        sql += ` AND asn.WarehouseId = @warehouseId`;
        params.warehouseId = parseInt(warehouseId as string, 10);
      }
      if (status) {
        sql += ` AND asn.Status = @status`;
        params.status = status;
      }

      sql += ` ORDER BY asn.ASNId DESC`;

      const rows = await db.query(sql, params);
      return res.json(rows);
    } catch (err: any) {
      console.error('Error fetching ASNs:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // 2. Get Single ASN details (Header + Items)
  public static async getASNDetails(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const headerRows = await db.query(`
        SELECT asn.*, s.Name AS SupplierName, s.Code AS SupplierCode, w.Name AS WarehouseName, w.Code AS WarehouseCode, po.POCode
        FROM tblASN asn
        INNER JOIN tblSupplier s ON asn.SupplierId = s.SupplierId
        INNER JOIN tblWarehouse w ON asn.WarehouseId = w.WarehouseId
        LEFT JOIN tblPurchaseOrder po ON asn.POId = po.POId
        WHERE asn.ASNId = @id OR asn.ASNNumber = @id
      `, { id });

      if (headerRows.length === 0) {
        return res.status(404).json({ message: 'Advanced Shipment Notice not found' });
      }

      const asnId = headerRows[0].ASNId;

      const items = await db.query(`
        SELECT asni.*, item.Code AS ItemCode, item.Name AS ItemName, item.Barcode AS ItemBarcode, item.TrackBatch, item.TrackSerial
        FROM tblASNItem asni
        INNER JOIN tblItem item ON asni.ItemId = item.ItemId
        WHERE asni.ASNId = @asnId
      `, { asnId });

      return res.json({ header: headerRows[0], items });
    } catch (err: any) {
      console.error('Error fetching ASN details:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // 3. Create a new ASN
  public static async createASN(req: AuthenticatedRequest, res: Response) {
    const {
      supplierId, poId, shipmentDate, expectedArrivalDate,
      transporter, vehicleNumber, trackingNumber, warehouseId,
      remarks, items
    } = req.body;
    
    const userId = req.user?.userId || 1;

    if (!supplierId || !shipmentDate || !expectedArrivalDate || !warehouseId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Missing required ASN details or items' });
    }

    try {
      // Generate ASN Number: ASN-YYYYMMDD-XXXX
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;

      const countResult = await db.query(`
        SELECT COUNT(*) as cnt FROM tblASN WHERE DATE(CreatedAt) = CURDATE()
      `);
      const cnt = countResult[0]?.cnt || 0;
      const asnNumber = `ASN-${dateStr}-${String(cnt + 1).padStart(4, '0')}`;

      // Insert Parent ASN Header
      const headerResult = await db.executeCmd(`
        INSERT INTO tblASN (
          ASNNumber, SupplierId, POId, ShipmentDate, ExpectedArrivalDate,
          Transporter, VehicleNumber, TrackingNumber, WarehouseId, Status, Remarks, CreatedBy
        ) VALUES (
          @asnNumber, @supplierId, @poId, @shipmentDate, @expectedArrivalDate,
          @transporter, @vehicleNumber, @trackingNumber, @warehouseId, 'Draft', @remarks, @userId
        )
      `, {
        asnNumber,
        supplierId,
        poId: poId || null,
        shipmentDate: formatMySQLDateTime(shipmentDate),
        expectedArrivalDate: formatMySQLDateTime(expectedArrivalDate),
        transporter: transporter || null,
        vehicleNumber: vehicleNumber || null,
        trackingNumber: trackingNumber || null,
        warehouseId,
        remarks: remarks || null,
        userId
      });

      const asnId = headerResult.lastID!;

      // Insert ASN Items
      for (const item of items) {
        if (!item.itemId || !item.expectedQty || item.expectedQty <= 0) {
          continue;
        }

        await db.executeCmd(`
          INSERT INTO tblASNItem (
            ASNId, ItemId, ExpectedQty, ReceivedQty, UOM, BatchNumber, SerialNumber, ExpiryDate
          ) VALUES (
            @asnId, @itemId, @expectedQty, 0.0000, @uom, @batchNumber, @serialNumber, @expiryDate
          )
        `, {
          asnId,
          itemId: item.itemId,
          expectedQty: item.expectedQty,
          uom: item.uom || 'PCS',
          batchNumber: item.batchNumber || null,
          serialNumber: item.serialNumber || null,
          expiryDate: item.expiryDate ? formatMySQLDateTime(item.expiryDate) : null
        });
      }

      return res.status(201).json({
        message: 'Advanced Shipment Notice created successfully',
        asnId,
        asnNumber
      });
    } catch (err: any) {
      console.error('Error creating ASN:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // 4. Update draft ASN
  public static async updateASN(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const {
      supplierId, poId, shipmentDate, expectedArrivalDate,
      transporter, vehicleNumber, trackingNumber, warehouseId,
      remarks, items
    } = req.body;

    try {
      // Verify draft status
      const existing = await db.query(`SELECT Status FROM tblASN WHERE ASNId = @id`, { id });
      if (existing.length === 0) {
        return res.status(404).json({ message: 'ASN not found' });
      }

      if (existing[0].Status !== 'Draft') {
        return res.status(400).json({ message: 'Only Draft ASNs can be modified.' });
      }

      // Update Header
      await db.executeCmd(`
        UPDATE tblASN SET
          SupplierId = @supplierId,
          POId = @poId,
          ShipmentDate = @shipmentDate,
          ExpectedArrivalDate = @expectedArrivalDate,
          Transporter = @transporter,
          VehicleNumber = @vehicleNumber,
          TrackingNumber = @trackingNumber,
          WarehouseId = @warehouseId,
          Remarks = @remarks
        WHERE ASNId = @id
      `, {
        supplierId,
        poId: poId || null,
        shipmentDate: formatMySQLDateTime(shipmentDate),
        expectedArrivalDate: formatMySQLDateTime(expectedArrivalDate),
        transporter: transporter || null,
        vehicleNumber: vehicleNumber || null,
        trackingNumber: trackingNumber || null,
        warehouseId,
        remarks: remarks || null,
        id
      });

      // Update details: Delete and Re-insert
      await db.executeCmd(`DELETE FROM tblASNItem WHERE ASNId = @id`, { id });

      for (const item of items) {
        if (!item.itemId || !item.expectedQty || item.expectedQty <= 0) {
          continue;
        }

        await db.executeCmd(`
          INSERT INTO tblASNItem (
            ASNId, ItemId, ExpectedQty, ReceivedQty, UOM, BatchNumber, SerialNumber, ExpiryDate
          ) VALUES (
            @id, @itemId, @expectedQty, 0.0000, @uom, @batchNumber, @serialNumber, @expiryDate
          )
        `, {
          id,
          itemId: item.itemId,
          expectedQty: item.expectedQty,
          uom: item.uom || 'PCS',
          batchNumber: item.batchNumber || null,
          serialNumber: item.serialNumber || null,
          expiryDate: item.expiryDate ? formatMySQLDateTime(item.expiryDate) : null
        });
      }

      return res.json({ message: 'ASN updated successfully' });
    } catch (err: any) {
      console.error('Error updating ASN:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // 5. Change ASN Status
  public static async updateStatus(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['Draft', 'Confirmed', 'In Transit', 'Partially Received', 'Fully Received', 'Cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Invalid status: ${status}. Must be one of ${allowed.join(', ')}` });
    }

    try {
      const existing = await db.query(`SELECT Status FROM tblASN WHERE ASNId = @id`, { id });
      if (existing.length === 0) {
        return res.status(404).json({ message: 'ASN not found' });
      }

      await db.executeCmd(`UPDATE tblASN SET Status = @status WHERE ASNId = @id`, { status, id });
      return res.json({ message: `ASN status updated to '${status}' successfully` });
    } catch (err: any) {
      console.error('Error updating ASN status:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // 6. Delete ASN (Draft or Cancelled only)
  public static async deleteASN(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const existing = await db.query(`SELECT Status FROM tblASN WHERE ASNId = @id`, { id });
      if (existing.length === 0) {
        return res.status(404).json({ message: 'ASN not found' });
      }

      if (existing[0].Status !== 'Draft' && existing[0].Status !== 'Cancelled') {
        return res.status(400).json({ message: 'Only Draft or Cancelled ASNs can be deleted.' });
      }

      await db.executeCmd(`DELETE FROM tblASN WHERE ASNId = @id`, { id });
      return res.json({ message: 'ASN deleted successfully' });
    } catch (err: any) {
      console.error('Error deleting ASN:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // 7. Process ASN Scan Receiving (Generates GRN)
  public static async receiveASN(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params; // ASNId
    const { invoiceNo, items } = req.body;
    const userId = req.user?.userId || 1;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items list is required for receiving' });
    }

    try {
      // 1. Verify ASN exists and status is valid
      const asnRows = await db.query(`
        SELECT * FROM tblASN WHERE ASNId = @id OR ASNNumber = @id
      `, { id });

      if (asnRows.length === 0) {
        return res.status(404).json({ message: 'Advanced Shipment Notice not found' });
      }

      const asn = asnRows[0];
      const asnId = asn.ASNId;

      if (['Draft', 'Cancelled', 'Fully Received'].includes(asn.Status)) {
        return res.status(400).json({ message: `Cannot receive goods for ASN in '${asn.Status}' status.` });
      }

      // Check if QA Feature is enabled
      const qaConfig = await db.query('SELECT IsEnabled FROM tblFeatureConfig WHERE FeatureCode = "MODULE_QUALITY_ASSURANCE"');
      const isQaEnabled = qaConfig.length > 0 ? qaConfig[0].IsEnabled === 1 : true;

      // 2. Insert standard GRN Header
      const grnCode = `GRN-ASN-${Date.now()}`;
      const grnStatus = isQaEnabled ? 'PENDING' : 'QC_COMPLETED';
      const grnResult = await db.executeCmd(`
        INSERT INTO tblGRN (GRNCode, POId, ReceivedDate, InvoiceNo, ReceivedBy, Status)
        VALUES (@grnCode, @poId, CURRENT_TIMESTAMP, @invoiceNo, @userId, @grnStatus)
      `, {
        grnCode,
        poId: asn.POId || null,
        invoiceNo: invoiceNo || null,
        userId,
        grnStatus
      });

      const grnId = grnResult.lastID!;

      // 3. Process each scanned item receipt
      for (const item of items) {
        if (!item.itemId || !item.receivedQty || item.receivedQty <= 0) {
          continue;
        }

        // Resolve item configurations directly from DB to prevent client discrepancies
        const itemRows = await db.query('SELECT TrackBatch, TrackSerial FROM tblItem WHERE ItemId = @itemId', { itemId: item.itemId });
        const isBatchTracked = itemRows.length > 0 ? (itemRows[0].TrackBatch === 1) : false;
        const isSerialTracked = itemRows.length > 0 ? (itemRows[0].TrackSerial === 1) : false;

        // Resolve batch if tracked
        let batchId: number | null = null;
        if (isBatchTracked && item.batchNumber) {
          const existingBatch = await db.query(`
            SELECT BatchId FROM tblBatch WHERE ItemId = @itemId AND BatchNumber = @batchNumber
          `, { itemId: item.itemId, batchNumber: item.batchNumber });

          if (existingBatch.length > 0) {
            batchId = existingBatch[0].BatchId;
          } else {
            const batchResult = await db.executeCmd(`
              INSERT INTO tblBatch (ItemId, BatchNumber, ExpiryDate)
              VALUES (@itemId, @batchNumber, @expiryDate)
            `, { itemId: item.itemId, batchNumber: item.batchNumber, expiryDate: item.expiryDate || null });
            
            batchId = batchResult.lastID ?? null;
          }
        }

        // Insert into GRN details
        const acceptedQty = isQaEnabled ? 0.0 : item.receivedQty;
        await db.executeCmd(`
          INSERT INTO tblGRNDetail (GRNId, ItemId, BatchId, ReceivedQty, AcceptedQty, RejectedQty, PutawayQty)
          VALUES (@grnId, @itemId, @batchId, @receivedQty, @acceptedQty, 0.0, 0.0)
        `, {
          grnId,
          itemId: item.itemId,
          batchId,
          receivedQty: item.receivedQty,
          acceptedQty
        });

        // Insert Serial numbers if tracked
        const serials = [];
        if (item.serialNumbers && Array.isArray(item.serialNumbers)) {
          serials.push(...item.serialNumbers);
        } else if (item.serialNumber) {
          serials.push(item.serialNumber);
        }

        if (isSerialTracked && serials.length > 0) {
          const serialStatus = isQaEnabled ? 'QC_HOLD' : 'IN_STOCK';
          for (const sn of serials) {
            await db.executeCmd(`
              INSERT INTO tblSerialNo (ItemId, BatchId, SerialNumber, Status)
              VALUES (@itemId, @batchId, @sn, @serialStatus)
            `, { itemId: item.itemId, batchId, sn, serialStatus });
          }
        }

        // Update ASN item received quantity
        await db.executeCmd(`
          UPDATE tblASNItem
          SET ReceivedQty = ReceivedQty + @receivedQty
          WHERE ASNId = @asnId AND ItemId = @itemId
        `, { receivedQty: item.receivedQty, asnId, itemId: item.itemId });
      }

      // 4. Update ASN status dynamically
      const totalsResult = await db.query(`
        SELECT SUM(ExpectedQty) AS expected, SUM(ReceivedQty) AS received
        FROM tblASNItem
        WHERE ASNId = @asnId
      `, { asnId });

      const totalExpected = parseFloat(totalsResult[0]?.expected || 0);
      const totalReceived = parseFloat(totalsResult[0]?.received || 0);

      let newStatus = 'Partially Received';
      if (totalReceived >= totalExpected) {
        newStatus = 'Fully Received';
      } else if (totalReceived === 0) {
        newStatus = asn.Status; // keep same status if nothing received
      }

      await db.executeCmd(`
        UPDATE tblASN SET Status = @newStatus WHERE ASNId = @asnId
      `, { newStatus, asnId });

      // 5. Adjust PO Quantities if QA is disabled and PO reference exists
      if (!isQaEnabled) {
        await db.executeSp('sp_ProcessGRN', { GRNId: grnId, UserId: userId });
      }

      return res.status(201).json({
        message: isQaEnabled ? 'ASN received and GRN generated successfully' : 'ASN received and GRN auto-approved successfully',
        grnId,
        grnCode,
        asnStatus: newStatus
      });
    } catch (err: any) {
      console.error('Error receiving ASN:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // 8. ASN Dashboard KPIs
  public static async getDashboardStats(req: AuthenticatedRequest, res: Response) {
    const { date, supplierId, warehouseId } = req.query;
    try {
      const params: Record<string, any> = {};
      let filterSql = '';

      if (supplierId) {
        filterSql += ` AND SupplierId = @supplierId`;
        params.supplierId = parseInt(supplierId as string, 10);
      }
      if (warehouseId) {
        filterSql += ` AND WarehouseId = @warehouseId`;
        params.warehouseId = parseInt(warehouseId as string, 10);
      }
      if (date) {
        filterSql += ` AND DATE(ExpectedArrivalDate) = @date`;
        params.date = date;
      }

      // KPIs
      const createdCount = await db.query(`SELECT COUNT(*) as count FROM tblASN WHERE 1=1 ${filterSql}`, params);
      const inTransitCount = await db.query(`SELECT COUNT(*) as count FROM tblASN WHERE Status = 'In Transit' ${filterSql}`, params);
      
      const expectedTodayCount = await db.query(`
        SELECT COUNT(*) as count FROM tblASN 
        WHERE DATE(ExpectedArrivalDate) = CURDATE() ${filterSql}
      `, params);

      const delayedCount = await db.query(`
        SELECT COUNT(*) as count FROM tblASN 
        WHERE ExpectedArrivalDate < CURRENT_TIMESTAMP AND Status NOT IN ('Fully Received', 'Cancelled') ${filterSql}
      `, params);

      const fullyCount = await db.query(`SELECT COUNT(*) as count FROM tblASN WHERE Status = 'Fully Received' ${filterSql}`, params);
      const partiallyCount = await db.query(`SELECT COUNT(*) as count FROM tblASN WHERE Status = 'Partially Received' ${filterSql}`, params);

      // Status breakdown chart data
      const statusBreakdown = await db.query(`
        SELECT Status as status, COUNT(*) as count
        FROM tblASN
        WHERE 1=1 ${filterSql}
        GROUP BY Status
      `, params);

      // Expected Arrivals timeline (next 7 days)
      const arrivalsTimeline = await db.query(`
        SELECT DATE(ExpectedArrivalDate) as date, COUNT(*) as count
        FROM tblASN
        WHERE ExpectedArrivalDate >= CURDATE()
        GROUP BY DATE(ExpectedArrivalDate)
        ORDER BY date ASC
        LIMIT 7
      `);

      return res.json({
        kpi: {
          totalCreated: createdCount[0]?.count || 0,
          inTransit: inTransitCount[0]?.count || 0,
          expectedToday: expectedTodayCount[0]?.count || 0,
          delayed: delayedCount[0]?.count || 0,
          fullyReceived: fullyCount[0]?.count || 0,
          partiallyReceived: partiallyCount[0]?.count || 0
        },
        statusBreakdown,
        arrivalsTimeline
      });
    } catch (err: any) {
      console.error('Error fetching ASN dashboard stats:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // 9. ASN Reports Details
  public static async getReportsData(req: AuthenticatedRequest, res: Response) {
    const { startDate, endDate, supplierId, warehouseId, status, search, warehouseCode } = req.query;
    const page = parseInt(req.query.page as string || '0');
    const limit = parseInt(req.query.limit as string || '25');
    const offset = page * limit;

    try {
      let baseQuery = `
        FROM tblASN asn
        INNER JOIN tblSupplier s ON asn.SupplierId = s.SupplierId
        INNER JOIN tblWarehouse w ON asn.WarehouseId = w.WarehouseId
        LEFT JOIN tblPurchaseOrder po ON asn.POId = po.POId
        INNER JOIN tblASNItem asni ON asn.ASNId = asni.ASNId
        INNER JOIN tblItem item ON asni.ItemId = item.ItemId
        WHERE 1=1
      `;
      const params: Record<string, any> = {};

      if (startDate) {
        baseQuery += ` AND asn.ExpectedArrivalDate >= @startDate`;
        params.startDate = `${startDate} 00:00:00`;
      }
      if (endDate) {
        baseQuery += ` AND asn.ExpectedArrivalDate <= @endDate`;
        params.endDate = `${endDate} 23:59:59`;
      }
      if (supplierId) {
        baseQuery += ` AND asn.SupplierId = @supplierId`;
        params.supplierId = parseInt(supplierId as string, 10);
      }
      if (warehouseId) {
        baseQuery += ` AND asn.WarehouseId = @warehouseId`;
        params.warehouseId = parseInt(warehouseId as string, 10);
      }
      if (warehouseCode) {
        baseQuery += ` AND w.Code = @warehouseCode`;
        params.warehouseCode = warehouseCode;
      }
      if (status) {
        baseQuery += ` AND asn.Status = @status`;
        params.status = status;
      }
      if (search) {
        baseQuery += ` AND (asn.ASNNumber LIKE @search OR s.Name LIKE @search OR item.Code LIKE @search OR item.Name LIKE @search OR po.POCode LIKE @search)`;
        params.search = `%${search}%`;
      }

      const countQuery = `SELECT COUNT(*) AS total ${baseQuery}`;
      const countResult = await db.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        SELECT 
          asn.ASNId,
          asn.ASNNumber,
          asn.ShipmentDate,
          asn.ExpectedArrivalDate,
          asn.Transporter,
          asn.VehicleNumber,
          asn.TrackingNumber,
          asn.Status AS ASNStatus,
          asn.Remarks,
          s.Name AS SupplierName,
          s.Code AS SupplierCode,
          w.Name AS WarehouseName,
          w.Code AS WarehouseCode,
          po.POCode,
          asni.ASNItemId,
          item.Code AS ItemCode,
          item.Name AS ItemName,
          item.Barcode AS ItemBarcode,
          asni.ExpectedQty,
          asni.ReceivedQty,
          (asni.ExpectedQty - asni.ReceivedQty) AS PendingQty,
          asni.UOM,
          asni.BatchNumber,
          asni.SerialNumber,
          asni.ExpiryDate
        ${baseQuery}
        ORDER BY asn.ExpectedArrivalDate DESC, asn.ASNId DESC
        LIMIT @limit OFFSET @offset
      `;
      params.limit = limit;
      params.offset = offset;

      const rows = await db.query(dataQuery, params);
      return res.json({ items: rows, total });
    } catch (err: any) {
      console.error('Error generating ASN reports data:', err);
      return res.status(500).json({ message: err.message });
    }
  }
}
