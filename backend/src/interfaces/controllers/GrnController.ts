import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';
import { OrderValidator } from '../../services/OrderValidator';
import http from 'http';

export class GrnController {

  public static async getPendingPOs(req: AuthenticatedRequest, res: Response) {
    try {
      const search = (req.query.search as string || '').trim();
      let query = `
        SELECT DISTINCT POId, POCode, VendorName, VendorCode, OrderDate 
        FROM vw_PendingGRN
      `;
      const params: Record<string, any> = {};

      if (search) {
        query += ` WHERE (POCode LIKE @search OR VendorName LIKE @search OR VendorCode LIKE @search)`;
        params.search = `%${search}%`;
      }

      query += ` ORDER BY OrderDate DESC, POId DESC`;
      const rows = await db.query(query, params);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getPODetails(req: AuthenticatedRequest, res: Response) {
    const { poId } = req.params;
    try {
      const rows = await db.query(`
        SELECT * FROM vw_PendingGRN WHERE POId = @poId
      `, { poId });
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Create Goods Receipt Note
  public static async createGRN(req: AuthenticatedRequest, res: Response) {
    const { poId, invoiceNo, items } = req.body;
    const userId = req.user?.userId || 1;

    if (!invoiceNo || invoiceNo.trim() === '') {
      return res.status(400).json({ message: 'Supplier Invoice Reference is mandatory' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items list is required' });
    }

    try {
      // 1. Skip items with zero received quantity (BUG-010) and validate
      const validItems = items.filter((item: any) => item.receivedQty > 0);
      if (validItems.length === 0) {
        return res.status(400).json({ message: 'At least one item must have a received quantity greater than zero' });
      }

      // Max stock validation check (enforce BLOCK_GRN_ON_MAX_STOCK setting)
      const maxStockSetting = await db.query("SELECT SettingValue FROM tblUserSetting WHERE SettingKey = 'BLOCK_GRN_ON_MAX_STOCK'");
      const blockOnMaxStock = maxStockSetting.length > 0 ? maxStockSetting[0].SettingValue === '1' : true;

      for (const item of validItems) {
        const itemRows = await db.query('SELECT Code, Name, MaxStock FROM tblItem WHERE ItemId = @itemId', { itemId: item.itemId });
        if (itemRows.length > 0) {
          const itemCode = itemRows[0].Code;
          const maxStock = parseFloat(itemRows[0].MaxStock || '999999');
          
          const invRows = await db.query('SELECT COALESCE(SUM(Quantity), 0) AS CurrentStock FROM tblInventory WHERE ItemId = @itemId', { itemId: item.itemId });
          const currentStock = parseFloat(invRows[0].CurrentStock || '0');
          const newStock = currentStock + parseFloat(item.receivedQty);

          if (newStock > maxStock && blockOnMaxStock) {
            return res.status(400).json({
              message: `Validation Blocked: Receiving ${item.receivedQty} units of item ${itemCode} would cause total stock (${newStock}) to exceed the maximum capacity limit of ${maxStock}.`
            });
          }
        }
      }

      // 2. Fetch PO & Item details to construct XML payload
      let poCode = '';
      let vendorName = '';
      let supplierDetails: any = null;
      if (poId) {
        const poRows = await db.query('SELECT POCode, VendorName, VendorCode, Status FROM tblPurchaseOrder WHERE POId = @poId', { poId });
        if (poRows.length > 0) {
          poCode = poRows[0].POCode || '';
          vendorName = poRows[0].VendorName || '';
          const vendorCode = poRows[0].VendorCode || '';
          
          if (vendorCode) {
            const suppRows = await db.query('SELECT * FROM tblSupplier WHERE Code = @vendorCode', { vendorCode });
            if (suppRows.length > 0) {
              supplierDetails = suppRows[0];
            }
          }
          
          if (poRows[0].Status === 'PARTIAL') {
            const syncedCount = await db.query('SELECT COUNT(*) as count FROM tblGRN WHERE POId = @poId AND IsSynced = 1', { poId });
            const count = syncedCount[0].count;
            if (count > 0) {
              poCode = `${poCode}-${count}`;
            }
          }
        }
      }

      const itemsWithDetails: any[] = [];
      for (const item of validItems) {
        const itemRows = await db.query('SELECT Name, UOM, HSNCode, MRP, AltUnit, PurchPrice, MainUnit FROM tblItem WHERE ItemId = @itemId', { itemId: item.itemId });
        const podRows = poId ? await db.query('SELECT UnitPrice FROM tblPurchaseOrderDetail WHERE POId = @poId AND ItemId = @itemId', { poId, itemId: item.itemId }) : [];
        const itemName = itemRows.length > 0 ? itemRows[0].Name : '';
        const itemUom = itemRows.length > 0 ? itemRows[0].UOM : 'SQFT';
        const unitPrice = podRows.length > 0 ? podRows[0].UnitPrice : 0;
        itemsWithDetails.push({
          ...item,
          itemName,
          itemUom,
          unitPrice,
          hsnCode: itemRows.length > 0 ? (itemRows[0].HSNCode || '') : '',
          mrp: itemRows.length > 0 ? (itemRows[0].MRP || 0) : 0,
          mainUnit: itemRows.length > 0 ? (itemRows[0].MainUnit || '') : '',
          altUnit: itemRows.length > 0 ? (itemRows[0].AltUnit || '') : ''
        });
      }

      const getFormattedDate = (date: Date = new Date()): string => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      };

      const dateStr = getFormattedDate();

      let itemDetailsXml = '';
      itemsWithDetails.forEach((item, index) => {
        const amt = (parseFloat(item.receivedQty) * parseFloat(item.unitPrice || 0)).toFixed(2);
        itemDetailsXml += `<ItemDetail>` +
          `<SrNo>${index + 1}</SrNo>` +
          `<ItemName>${item.itemName}</ItemName>` +
          `<UnitName>${item.mainUnit || item.itemUom || 'SQFT'}</UnitName>` +
          `<AltUnitName>${item.altUnit || ''}</AltUnitName>` +
          `<Qty>${item.receivedQty}</Qty>` +
          `<QtyMainUnit>${item.receivedQty}</QtyMainUnit>` +
          `<QtyAltUnit>${item.receivedQty}</QtyAltUnit>` +
          `<ItemHSNCode>${item.hsnCode || ''}</ItemHSNCode>` +
          `<Price>${item.unitPrice || 0}</Price>` +
          `<PriceAltUnit>${item.unitPrice || 0}</PriceAltUnit>` +
          `<ListPrice>${item.unitPrice || 0}</ListPrice>` +
          `<Amt>${amt}</Amt>` +
          `<ItemMRP>${item.mrp || 0}</ItemMRP>` +
          `</ItemDetail>`;
      });

      let billingDetailsXml = '';
      if (supplierDetails) {
        let itpan = '';
        if (supplierDetails.GSTIN && supplierDetails.GSTIN.length >= 12) {
          itpan = supplierDetails.GSTIN.substring(2, 12);
        }
        billingDetailsXml = `<BillingDetails>` +
          `<PartyName>${supplierDetails.Name || ''}</PartyName>` +
          `<Address1>${supplierDetails.Add1 || ''}</Address1>` +
          `<Address2>${supplierDetails.Add2 || ''}</Address2>` +
          `<Address3>${supplierDetails.Add3 || ''}</Address3>` +
          `<Address4>${supplierDetails.Add4 || ''}</Address4>` +
          `<MobileNo>${supplierDetails.Mobile || ''}</MobileNo>` +
          `<Email>${supplierDetails.Email || ''}</Email>` +
          `<ITPAN>${itpan}</ITPAN>` +
          `<GSTNo>${supplierDetails.GSTIN || ''}</GSTNo>` +
          `</BillingDetails>`;
      }

      const xmlStr = `<Purchase>` +
        `<VchSeriesName>TP_TAX</VchSeriesName>` +
        `<Date>${dateStr}</Date>` +
        `<VchType>2</VchType>` +
        `<VchNo>${invoiceNo}</VchNo>` +
        `<STPTName>L/GST-MultiRate</STPTName>` +
        `<MasterName1>${vendorName}</MasterName1>` +
        `<MasterName2>TURNING POINT</MasterName2>` +
        billingDetailsXml +
        `<VchOtherInfoDetails>` +
        `<Narration1>${poCode}</Narration1>` +
        `</VchOtherInfoDetails>` +
        `<ItemEntries>${itemDetailsXml}</ItemEntries>` +
        `</Purchase>`;

      // 3. Post to Busy ERP HTTP API
      const erpResult = await new Promise<{ success: boolean; message: string }>((resolve) => {
        const options = {
          hostname: process.env.BUSY_ERP_HOST || '192.168.1.11',
          port: parseInt(process.env.BUSY_ERP_PORT || '999'),
          path: '/',
          method: 'POST',
          headers: {
            'SC': '2',
            'Date': dateStr,
            'VchType': '2',
            'UserName': process.env.BUSY_ERP_USERNAME || 'Nilesh',
            'Pwd': process.env.BUSY_ERP_PASSWORD || 'tppl@12_34',
            'Content-Type': 'application/xml',
            'VchXml': xmlStr
          }
        };

        const reqHttp = http.request(options, (resHttp) => {
          let responseData = '';
          resHttp.on('data', (chunk) => {
            responseData += chunk;
          });
          resHttp.on('end', () => {
            const result = resHttp.headers['result'];
            const description = resHttp.headers['description'] as string;
            if (result === 'T') {
              resolve({ success: true, message: responseData });
            } else {
              resolve({ success: false, message: description || 'ERP returned failure without description header' });
            }
          });
        });

        reqHttp.setTimeout(10000, () => {
          reqHttp.destroy();
          resolve({ success: false, message: 'ERP connection timed out after 10 seconds' });
        });

        reqHttp.on('error', (err) => {
          resolve({ success: false, message: err.message || 'Network error connecting to ERP' });
        });

        reqHttp.end();
      });

      if (!erpResult.success) {
        return res.status(400).json({ message: 'ERP posting failed: ' + erpResult.message });
      }

      // Check if Quality Assurance Check feature is enabled
      const qaConfig = await db.query('SELECT IsEnabled FROM tblFeatureConfig WHERE FeatureCode = "MODULE_QUALITY_ASSURANCE"');
      const isQaEnabled = qaConfig.length > 0 ? qaConfig[0].IsEnabled === 1 : true;

      // 4. Insert parent GRN record (with IsSynced = 1 since ERP posting succeeded)
      const grnCode = `GRN-${Date.now()}`;
      const grnStatus = isQaEnabled ? 'PENDING' : 'QC_COMPLETED';
      const grnResult = await db.executeCmd(`
        INSERT INTO tblGRN (GRNCode, POId, ReceivedDate, InvoiceNo, ReceivedBy, Status, IsSynced)
        VALUES (@grnCode, @poId, CURRENT_TIMESTAMP, @invoiceNo, @userId, @grnStatus, 1)
      `, { grnCode, poId: poId || null, invoiceNo: invoiceNo || null, userId, grnStatus });

      const grnId = grnResult.lastID!;

      if (poId) {
        // Query the ordered qty vs already GRN'd quantities for each item in the PO
        const poItems = await db.query(`
          SELECT 
              pod.ItemId,
              pod.OrderQty,
              COALESCE(grn_sum.TotalGrnQty, 0) AS TotalGrnQty
          FROM tblPurchaseOrderDetail pod
          LEFT JOIN (
              SELECT gd.ItemId, SUM(gd.ReceivedQty) AS TotalGrnQty
              FROM tblGRNDetail gd
              INNER JOIN tblGRN g ON gd.GRNId = g.GRNId
              WHERE g.POId = @poId AND g.Status != 'CANCELLED'
              GROUP BY gd.ItemId
          ) grn_sum ON pod.ItemId = grn_sum.ItemId
          WHERE pod.POId = @poId
        `, { poId });

        let isPartial = false;
        let totalReceivedAfterGrn = 0;
        
        for (const poItem of poItems) {
          const currentGrnItem = validItems.find((vi: any) => vi.itemId === poItem.ItemId);
          const newGrnQty = currentGrnItem ? parseFloat(currentGrnItem.receivedQty || 0) : 0;
          const orderQty = parseFloat(poItem.OrderQty || 0);
          const totalGrnQty = parseFloat(poItem.TotalGrnQty || 0);
          
          totalReceivedAfterGrn += (totalGrnQty + newGrnQty);
          const remaining = orderQty - (totalGrnQty + newGrnQty);
          
          // Due to floating point imprecision, use a small epsilon
          if (remaining > 0.001) {
            isPartial = true;
          }
        }

        let newStatus = 'PENDING';
        if (!isPartial) {
          newStatus = 'COMPLETED';
        } else if (totalReceivedAfterGrn > 0) {
          newStatus = 'PARTIAL';
        }

        await db.executeCmd(`
          UPDATE tblPurchaseOrder SET Status = @newStatus, UpdatedAt = CURRENT_TIMESTAMP WHERE POId = @poId
        `, { poId, newStatus });
      }

      for (const item of validItems) {
        let batchId: number | null = null;

        // Resolve item configurations directly from DB to prevent client discrepancies
        const itemRows = await db.query('SELECT TrackBatch, TrackSerial FROM tblItem WHERE ItemId = @itemId', { itemId: item.itemId });
        const isBatchTracked = itemRows.length > 0 ? (itemRows[0].TrackBatch === 1) : false;
        const isSerialTracked = itemRows.length > 0 ? (itemRows[0].TrackSerial === 1) : false;

        // Auto batch handling if item tracks batch
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

        // Insert detail line
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

        // Insert serial numbers if tracked
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
      }

      if (!isQaEnabled) {
        // If QA is disabled, call the stored procedure immediately to adjust PO received levels
        await db.executeSp('sp_ProcessGRN', { GRNId: grnId, UserId: userId });
      }

      return res.status(201).json({
        message: isQaEnabled ? 'GRN created successfully' : 'GRN created and auto-approved successfully (QA Bypassed)',
        grnId,
        grnCode
      });
    } catch (err: any) {
      console.error('GRN creation failed:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Quality Control check processing
  public static async processQC(req: AuthenticatedRequest, res: Response) {
    const { grnId, status, remarks, items } = req.body;
    const userId = req.user?.userId || 1;

    if (!grnId || !status || !items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Missing inspection details' });
    }

    try {
      // 1. Create QC record
      await db.executeCmd(`
        INSERT INTO tblQC (GRNId, CheckedBy, CheckedDate, Status, Remarks)
        VALUES (@grnId, @userId, CURRENT_TIMESTAMP, @status, @remarks)
      `, { grnId, userId, status, remarks: remarks || null });

      // 2. Process inspection details for each item
      for (const item of items) {
        await db.executeCmd(`
          UPDATE tblGRNDetail
          SET AcceptedQty = @acceptedQty,
              RejectedQty = @rejectedQty,
              RejectionReason = @rejectionReason
          WHERE GRNId = @grnId AND ItemId = @itemId
        `, {
          acceptedQty: item.acceptedQty,
          rejectedQty: item.rejectedQty,
          rejectionReason: item.rejectionReason || null,
          grnId,
          itemId: item.itemId
        });

        // ISSUE-025 FIX: Process rejected serials FIRST, then accept the REST
        // Previous code accepted all serials AFTER marking rejected ones, overwriting the rejected status
        const rejectedSnSet = new Set<string>((item.rejectedSerials || []).map((s: string) => s.trim()));

        if (item.rejectedSerials && Array.isArray(item.rejectedSerials) && item.rejectedSerials.length > 0) {
          for (const rsn of item.rejectedSerials) {
            await db.executeCmd(
              `UPDATE tblSerialNo SET Status = 'QC_REJECTED' WHERE ItemId = @itemId AND SerialNumber = @rsn`,
              { itemId: item.itemId, rsn }
            );
          }
        }

        // Accept ONLY serials still in QC_HOLD (not the ones just marked rejected)
        await db.executeCmd(`
          UPDATE tblSerialNo 
          SET Status = 'IN_STOCK' 
          WHERE ItemId = @itemId AND Status = 'QC_HOLD'
        `, { itemId: item.itemId });
      }

      // 3. Fire Stored Procedure to update PO Received levels and set GRN status
      await db.executeSp('sp_ProcessGRN', { GRNId: grnId, UserId: userId });

      return res.json({ message: 'Quality check completed and GRN status updated' });
    } catch (err: any) {
      console.error('QC Processing failed:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Get active GRNs (e.g. for listing/tracking)
  public static async getGRNs(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT g.*, po.POCode, u.FullName AS OperatorName
        FROM tblGRN g
        LEFT JOIN tblPurchaseOrder po ON g.POId = po.POId
        INNER JOIN tblUser u ON g.ReceivedBy = u.UserId
        ORDER BY g.GRNId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getGRNDetails(req: AuthenticatedRequest, res: Response) {
    const { grnId } = req.params;
    try {
      const rows = await db.query(`
        SELECT gd.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM, b.BatchNumber
        FROM tblGRNDetail gd
        INNER JOIN tblItem item ON gd.ItemId = item.ItemId
        LEFT JOIN tblBatch b ON gd.BatchId = b.BatchId
        WHERE gd.GRNId = @grnId
      `, { grnId });
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // PURCHASE ORDER CRUD (MANUAL)
  // ==========================================

  public static async getPurchaseOrders(req: AuthenticatedRequest, res: Response) {
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
        whereClause += ' AND (po.POCode LIKE @searchPattern OR po.VendorName LIKE @searchPattern OR po.VendorCode LIKE @searchPattern OR po.PreparedBy LIKE @searchPattern)';
        params.searchPattern = `%${search}%`;
      }
      if (status) {
        whereClause += ' AND po.Status = @status';
        params.status = status;
      }
      if (startDate) {
        whereClause += ' AND DATE(po.OrderDate) >= @startDate';
        params.startDate = startDate;
      }
      if (endDate) {
        whereClause += ' AND DATE(po.OrderDate) <= @endDate';
        params.endDate = endDate;
      }

      const isPaginated = req.query.page !== undefined;

      if (isPaginated) {
        const offset = page * limit;
        params.limit = limit;
        params.offset = offset;

        // Query total
        const countQuery = `SELECT COUNT(po.POId) AS total FROM tblPurchaseOrder po ${whereClause}`;
        const countRows = await db.query(countQuery, params);
        const total = countRows.length > 0 ? countRows[0].total : 0;

        // Query paginated POs
        const selectQuery = `
          SELECT po.* 
          FROM tblPurchaseOrder po 
          ${whereClause} 
          ORDER BY po.OrderDate DESC, po.POId DESC 
          LIMIT @limit OFFSET @offset
        `;
        const items = await db.query(selectQuery, params);

        return res.json({ items, total });
      } else {
        const selectQuery = `
          SELECT po.* 
          FROM tblPurchaseOrder po 
          ${whereClause} 
          ORDER BY po.OrderDate DESC, po.POId DESC
        `;
        const items = await db.query(selectQuery, params);
        return res.json(items);
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getPODetailLines(req: AuthenticatedRequest, res: Response) {
    const { poId } = req.params;
    try {
      const rows = await db.query(`
        SELECT pod.*, i.Name AS ItemName, i.Code AS ItemCode 
        FROM tblPurchaseOrderDetail pod
        INNER JOIN tblItem i ON pod.ItemId = i.ItemId
        WHERE pod.POId = @poId
      `, { poId });
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async createPurchaseOrder(req: AuthenticatedRequest, res: Response) {
    const { POCode, VendorName, VendorCode, OrderDate, DeliveryDate, Items } = req.body;
    try {
      const validation = await OrderValidator.validate({
        OrderCode: POCode,
        PartnerName: VendorName,
        PartnerCode: VendorCode,
        OrderDate,
        DeliveryDate,
        Items
      }, 'PO');

      if (!validation.isValid) {
        return res.status(400).json({ message: 'Validation failed', errors: validation.errors });
      }

      const orderCode = POCode ? POCode.trim() : `PO-${Date.now()}`;

      const poId = await db.transaction(async (tx) => {
        const result = await tx.executeCmd(`
          INSERT INTO tblPurchaseOrder (POCode, VendorName, VendorCode, OrderDate, DeliveryDate, Status)
          VALUES (@orderCode, @VendorName, @VendorCode, @OrderDate, @DeliveryDate, 'PENDING')
        `, {
          orderCode,
          VendorName: VendorName.trim(),
          VendorCode: VendorCode.trim(),
          OrderDate,
          DeliveryDate: DeliveryDate || null
        });

        const newPoId = result.lastID!;

        for (const item of validation.cleanedItems!) {
          await tx.executeCmd(`
            INSERT INTO tblPurchaseOrderDetail (POId, ItemId, OrderQty, ReceivedQty, UOM, UnitPrice)
            VALUES (@poId, @ItemId, @OrderQty, 0.0, @UOM, @UnitPrice)
          `, {
            poId: newPoId,
            ItemId: item.ItemId,
            OrderQty: item.OrderQty,
            UOM: item.UOM,
            UnitPrice: item.UnitPrice
          });
        }
        return newPoId;
      });

      return res.status(201).json({ message: 'Purchase Order created successfully', poId, POCode: orderCode });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async updatePurchaseOrder(req: AuthenticatedRequest, res: Response) {
    const { poId } = req.params;
    const { POCode, VendorName, VendorCode, OrderDate, DeliveryDate, Items } = req.body;
    try {
      const existing = await db.query('SELECT Status FROM tblPurchaseOrder WHERE POId = @poId', { poId });
      if (existing.length === 0) {
        return res.status(404).json({ message: 'Purchase Order not found' });
      }
      if (existing[0].Status !== 'PENDING') {
        return res.status(400).json({ message: 'Only PENDING Purchase Orders can be modified.' });
      }

      const validation = await OrderValidator.validate({
        OrderCode: POCode,
        PartnerName: VendorName,
        PartnerCode: VendorCode,
        OrderDate,
        DeliveryDate,
        Items
      }, 'PO', Number(poId));

      if (!validation.isValid) {
        return res.status(400).json({ message: 'Validation failed', errors: validation.errors });
      }

      await db.transaction(async (tx) => {
        await tx.executeCmd(`
          UPDATE tblPurchaseOrder
          SET POCode = @POCode, VendorName = @VendorName, VendorCode = @VendorCode, OrderDate = @OrderDate, DeliveryDate = @DeliveryDate, UpdatedAt = CURRENT_TIMESTAMP
          WHERE POId = @poId
        `, {
          POCode: POCode.trim(),
          VendorName: VendorName.trim(),
          VendorCode: VendorCode.trim(),
          OrderDate,
          DeliveryDate: DeliveryDate || null,
          poId
        });

        await tx.executeCmd('DELETE FROM tblPurchaseOrderDetail WHERE POId = @poId', { poId });

        for (const item of validation.cleanedItems!) {
          await tx.executeCmd(`
            INSERT INTO tblPurchaseOrderDetail (POId, ItemId, OrderQty, ReceivedQty, UOM, UnitPrice)
            VALUES (@poId, @ItemId, @OrderQty, 0.0, @UOM, @UnitPrice)
          `, {
            poId,
            ItemId: item.ItemId,
            OrderQty: item.OrderQty,
            UOM: item.UOM,
            UnitPrice: item.UnitPrice
          });
        }
      });

      return res.json({ message: 'Purchase Order updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deletePurchaseOrder(req: AuthenticatedRequest, res: Response) {
    const { poId } = req.params;
    try {
      const existing = await db.query('SELECT POCode, Status FROM tblPurchaseOrder WHERE POId = @poId', { poId });
      if (existing.length === 0) {
        return res.status(404).json({ message: 'Purchase Order not found' });
      }
      if (existing[0].Status !== 'PENDING') {
        return res.status(400).json({ message: 'Only PENDING Purchase Orders can be deleted.' });
      }

      const poCode = existing[0].POCode;

      await db.transaction(async (tx) => {
        // Track deleted PO code to prevent sync from re-importing it
        if (poCode) {
          await tx.executeCmd('CREATE TABLE IF NOT EXISTS tblDeletedPurchaseOrder (POCode VARCHAR(100) PRIMARY KEY, DeletedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
          await tx.executeCmd('INSERT IGNORE INTO tblDeletedPurchaseOrder (POCode) VALUES (@poCode)', { poCode });
        }
        await tx.executeCmd('DELETE FROM tblPurchaseOrderDetail WHERE POId = @poId', { poId });
        await tx.executeCmd('DELETE FROM tblPurchaseOrder WHERE POId = @poId', { poId });
      });
      return res.json({ message: 'Purchase Order deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async syncGRNToERP(req: AuthenticatedRequest, res: Response) {
    const { grnId } = req.params;
    try {
      // 1. Fetch GRN header
      const grnRows = await db.query('SELECT * FROM tblGRN WHERE GRNId = @grnId', { grnId });
      if (grnRows.length === 0) {
        return res.status(404).json({ message: 'GRN not found' });
      }
      const grn = grnRows[0];

      if (grn.IsSynced === 1) {
        return res.status(400).json({ message: 'GRN is already synced to ERP' });
      }

      // 2. Fetch PO & Vendor Details
      let poCode = '';
      let vendorName = '';
      if (grn.POId) {
        const poRows = await db.query('SELECT POCode, VendorName, Status FROM tblPurchaseOrder WHERE POId = @poId', { poId: grn.POId });
        if (poRows.length > 0) {
          poCode = poRows[0].POCode || '';
          vendorName = poRows[0].VendorName || '';
          
          if (poRows[0].Status === 'PARTIAL') {
            const syncedCount = await db.query('SELECT COUNT(*) as count FROM tblGRN WHERE POId = @poId AND IsSynced = 1 AND GRNId < @grnId', { poId: grn.POId, grnId });
            const count = syncedCount[0].count;
            if (count > 0) {
              poCode = `${poCode}-${count}`;
            }
          }
        }
      }

      // 3. Fetch GRN details and item codes/names/prices
      const details = await db.query(`
        SELECT gd.ReceivedQty, item.Name AS itemName, item.UOM AS itemUom, pod.UnitPrice
        FROM tblGRNDetail gd
        INNER JOIN tblItem item ON gd.ItemId = item.ItemId
        LEFT JOIN tblPurchaseOrderDetail pod ON gd.ItemId = pod.ItemId AND pod.POId = @poId
        WHERE gd.GRNId = @grnId AND gd.ReceivedQty > 0
      `, { grnId, poId: grn.POId || 0 });

      if (details.length === 0) {
        return res.status(400).json({ message: 'No valid items in this GRN to sync' });
      }

      const getFormattedDate = (date: Date): string => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      };

      const dateStr = getFormattedDate(new Date());

      let itemDetailsXml = '';
      details.forEach((item: any, index: number) => {
        itemDetailsXml += `<ItemDetail>` +
          `<Date>${dateStr}</Date>` +
          `<VchType>4</VchType>` +
          `<VchNo>${poCode}</VchNo>` +
          `<SrNo>${index + 1}</SrNo>` +
          `<ItemName>${item.itemName}</ItemName>` +
          `<UnitName>${item.itemUom || 'SQFT'}</UnitName>` +
          `<AltUnitName>${item.itemUom || 'SQFT'}</AltUnitName>` +
          `<Qty>${item.ReceivedQty}</Qty>` +
          `<ListPrice>${item.UnitPrice || 0}</ListPrice>` +
          `</ItemDetail>`;
      });

      const xmlStr = `<MaterialReceipt>` +
        `<VchSeriesName>TP</VchSeriesName>` +
        `<Date>${dateStr}</Date>` +
        `<VchType>4</VchType>` +
        `<TranType>3</TranType>` +
        `<VchNo>${poCode}</VchNo>` +
        `<STPTName>Local-18%</STPTName>` +
        `<MasterName1>${vendorName}</MasterName1>` +
        `<MasterName2>TURNING POINT</MasterName2>` +
        `<ItemEntries>${itemDetailsXml}</ItemEntries>` +
        `</MaterialReceipt>`;

      // 4. Send request to ERP
      const erpResult = await new Promise<{ success: boolean; message: string }>((resolve) => {
        const options = {
          hostname: process.env.BUSY_ERP_HOST || '192.168.1.11',
          port: parseInt(process.env.BUSY_ERP_PORT || '999'),
          path: '/',
          method: 'POST',
          headers: {
            'SC': '2',
            'Date': dateStr,
            'VchType': '4',
            'TranType': '3',
            'UserName': process.env.BUSY_ERP_USERNAME || 'Nilesh',
            'Pwd': process.env.BUSY_ERP_PASSWORD || 'tppl@12_34',
            'Content-Type': 'application/xml',
            'VchXml': xmlStr
          }
        };

        const reqHttp = http.request(options, (resHttp) => {
          let responseData = '';
          resHttp.on('data', (chunk) => {
            responseData += chunk;
          });
          resHttp.on('end', () => {
            const result = resHttp.headers['result'];
            const description = resHttp.headers['description'] as string;
            if (result === 'T') {
              resolve({ success: true, message: responseData });
            } else {
              resolve({ success: false, message: description || 'ERP returned failure without description header' });
            }
          });
        });

        reqHttp.setTimeout(10000, () => {
          reqHttp.destroy();
          resolve({ success: false, message: 'ERP connection timed out after 10 seconds' });
        });

        reqHttp.on('error', (err) => {
          resolve({ success: false, message: err.message || 'Network error connecting to ERP' });
        });

        reqHttp.end();
      });

      if (!erpResult.success) {
        return res.status(400).json({ message: 'ERP posting failed: ' + erpResult.message });
      }

      // 5. Update status
      await db.executeCmd('UPDATE tblGRN SET IsSynced = 1 WHERE GRNId = @grnId', { grnId });

      return res.json({ success: true, message: 'GRN synced to ERP successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
}
