import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';
import { OrderValidator } from '../../services/OrderValidator';
import { mssqlDb } from '../../config/mssql';
import mssql from 'mssql';

export class SyncController {

  public static async getLogs(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query('SELECT * FROM tblApiLog ORDER BY ApiLogId DESC LIMIT 100');
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // MASTER SYNCHRONIZATION
  // ==========================================

  public static async syncSuppliers(req: AuthenticatedRequest, res: Response) {
    const mockErpSuppliers = [
      { Code: 'VND-003', Name: 'Lenovo India Pvt Ltd', Address: 'Electronic City, Bangalore', GSTIN: '29AAAAK5678C3Z3' },
      { Code: 'VND-004', Name: 'Crucial Technology Corp', Address: 'Silicon Valley, California', GSTIN: '99AAAAC8888D4Z4' },
      { Code: 'VND-005', Name: 'HP Enterprise Solutions', Address: 'Cyber City, Gurgaon', GSTIN: '06AAAAH9999E5Z5' },
      { Code: 'VND-006', Name: 'Asus Tek Computer Inc', Address: 'Taipei, Taiwan', GSTIN: '99ASUS12345A1Z2' }
    ];

    try {
      let syncedCount = 0;
      for (const supplier of mockErpSuppliers) {
        // Upsert Supplier into tblSupplier
        await db.executeCmd(`
          INSERT INTO tblSupplier (Code, Name, Address, GSTIN)
          VALUES (@code, @name, @address, @gstin)
          ON DUPLICATE KEY UPDATE 
            Name = @name, 
            Address = @address, 
            GSTIN = @gstin
        `, {
          code: supplier.Code,
          name: supplier.Name,
          address: supplier.Address,
          gstin: supplier.GSTIN
        });
        syncedCount++;
      }

      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('SUPPLIER_SYNC', 'INBOUND', '/sync/suppliers', @req, @res, 'SUCCESS')
      `, { 
        req: JSON.stringify(mockErpSuppliers), 
        res: JSON.stringify({ message: 'Sync successful', syncedCount }) 
      });

      return res.json({ message: 'Supplier Masters synchronized successfully', count: syncedCount });
    } catch (err: any) {
      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
        VALUES ('SUPPLIER_SYNC', 'INBOUND', '/sync/suppliers', '{}', '', 'ERROR', @err)
      `, { err: err.message });
      return res.status(500).json({ message: 'Supplier sync failed', error: err.message });
    }
  }

  public static async syncCustomers(req: AuthenticatedRequest, res: Response) {
    const mockErpCustomers = [
      { Code: 'CST-003', Name: 'Croma Electronics', Address: 'Andheri East, Mumbai', GSTIN: '27AAAAC9999H3Z8' },
      { Code: 'CST-004', Name: 'Reliance Digital', Address: 'Ghansoli, Navi Mumbai', GSTIN: '27AAAAR2222I4Z9' },
      { Code: 'CST-005', Name: 'Vijay Sales Retail', Address: 'Mahim, Mumbai', GSTIN: '27VIJAY9876J2Z5' },
      { Code: 'CST-006', Name: 'Croma Retail CP', Address: 'Connaught Place, Delhi', GSTIN: '07AAAAC9999H1Z0' }
    ];

    try {
      let syncedCount = 0;
      for (const customer of mockErpCustomers) {
        await db.executeCmd(`
          INSERT INTO tblCustomer (Code, Name, Address, GSTIN)
          VALUES (@code, @name, @address, @gstin)
          ON DUPLICATE KEY UPDATE 
            Name = @name, 
            Address = @address, 
            GSTIN = @gstin
        `, {
          code: customer.Code,
          name: customer.Name,
          address: customer.Address,
          gstin: customer.GSTIN
        });
        syncedCount++;
      }

      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('CUSTOMER_SYNC', 'INBOUND', '/sync/customers', @req, @res, 'SUCCESS')
      `, { 
        req: JSON.stringify(mockErpCustomers), 
        res: JSON.stringify({ message: 'Sync successful', syncedCount }) 
      });

      return res.json({ message: 'Customer Masters synchronized successfully', count: syncedCount });
    } catch (err: any) {
      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
        VALUES ('CUSTOMER_SYNC', 'INBOUND', '/sync/customers', '{}', '', 'ERROR', @err)
      `, { err: err.message });
      return res.status(500).json({ message: 'Customer sync failed', error: err.message });
    }
  }

  public static async syncItems(req: AuthenticatedRequest, res: Response) {
    const mockErpItems = [
      { Code: 'ITM-001', Name: 'Logitech G102 Mouse', Description: 'Wired Gaming Mouse with RGB', Category: 'Peripherals', Brand: 'Logitech', UOM: 'PCS', Barcode: '8901012345671', HSNCode: '84716060', Weight: 0.1500, Volume: 0.3500, UnitCost: 600.00, SellingPrice: 850.00 },
      { Code: 'ITM-002', Name: 'Dell KB216 Keyboard', Description: 'Standard Multimedia USB Keyboard', Category: 'Peripherals', Brand: 'Dell', UOM: 'PCS', Barcode: '8901012345672', HSNCode: '84716060', Weight: 0.4500, Volume: 1.2000, UnitCost: 480.00, SellingPrice: 700.00 },
      { Code: 'ITM-003', Name: 'Crucial MX500 SSD 500GB', Description: 'SATA 2.5 Inch Internal Solid State Drive', Category: 'Storage', Brand: 'Crucial', UOM: 'PCS', Barcode: '8901012345673', HSNCode: '85235190', Weight: 0.0600, Volume: 0.1000, UnitCost: 3500.00, SellingPrice: 4800.00 },
      { Code: 'ITM-006', Name: 'SanDisk Ultra Dual 64GB', Description: 'OTG USB 3.1 Flash Drive for Android', Category: 'Storage', Brand: 'SanDisk', UOM: 'PCS', Barcode: '8901012345676', HSNCode: '85235100', Weight: 0.0200, Volume: 0.0500, UnitCost: 550.00, SellingPrice: 850.00 }
    ];

    try {
      let syncedCount = 0;
      for (const item of mockErpItems) {
        await db.executeCmd(`
          INSERT INTO tblItem (Code, Name, Description, Category, Brand, UOM, Barcode, HSNCode, Weight, Volume, UnitCost, SellingPrice, IsActive)
          VALUES (@code, @name, @desc, @category, @brand, @uom, @barcode, @hsn, @weight, @volume, @cost, @price, 1)
          ON DUPLICATE KEY UPDATE 
            Name = @name, 
            Description = @desc,
            Category = @category,
            Brand = @brand,
            Barcode = @barcode,
            HSNCode = @hsn,
            Weight = @weight,
            Volume = @volume,
            UnitCost = @cost,
            SellingPrice = @price
        `, {
          code: item.Code,
          name: item.Name,
          desc: item.Description,
          category: item.Category,
          brand: item.Brand,
          uom: item.UOM,
          barcode: item.Barcode,
          hsn: item.HSNCode,
          weight: item.Weight,
          volume: item.Volume,
          cost: item.UnitCost,
          price: item.SellingPrice
        });
        syncedCount++;
      }

      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('ITEM_SYNC', 'INBOUND', '/sync/items', @req, @res, 'SUCCESS')
      `, { 
        req: JSON.stringify(mockErpItems), 
        res: JSON.stringify({ message: 'Sync successful', syncedCount }) 
      });

      return res.json({ message: 'Item Masters synchronized successfully', count: syncedCount });
    } catch (err: any) {
      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
        VALUES ('ITEM_SYNC', 'INBOUND', '/sync/items', '{}', '', 'ERROR', @err)
      `, { err: err.message });
      return res.status(500).json({ message: 'Item sync failed', error: err.message });
    }
  }

  // ==========================================
  // TRANSACTION SYNCHRONIZATION
  // ==========================================

  public static async syncPurchaseOrders(req: AuthenticatedRequest, res: Response) {
    const posToSync = req.body;
    const isManualImport = Array.isArray(posToSync) && posToSync.length > 0;

    res.status(202).json({
      message: 'ERP Purchase Order synchronization triggered in the background. Please check WMS Sync Audit Logs for progress status.'
    });

    setImmediate(async () => {
      try {
        await SyncController.performSyncPOs(posToSync, isManualImport);
      } catch (err: any) {
        console.error('[Sync Background PO Error]:', err);
      }
    });
  }

  // Actual PO sync background task
  private static async performSyncPOs(posToSyncInput: any, isManualImport: boolean) {
    let posToSync = posToSyncInput;
    try {
      if (!isManualImport) {
        // Query last 30 days of POs from MSSQL
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        
        console.log(`[Sync] Fetching ERP POs from MSSQL for range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
        posToSync = await SyncController.fetchPOsFromMSSQL(startDate.toISOString(), endDate.toISOString());
      }

      // 1. Gather all unique item codes from POs and resolve/insert them in parallel batches
      const uniqueItemCodes = new Set<string>();
      const itemCodeToDetails = new Map<string, any>();
      for (const po of posToSync) {
        if (po.Items) {
          for (const item of po.Items) {
            if (item.ItemCode) {
              uniqueItemCodes.add(item.ItemCode);
              itemCodeToDetails.set(item.ItemCode, item);
            }
          }
        }
      }

      if (uniqueItemCodes.size > 0) {
        const codesArray = Array.from(uniqueItemCodes);
        const existingResults = await Promise.all(
          codesArray.map(async (code) => {
            const res = await db.query('SELECT ItemId FROM tblItem WHERE Code = @code', { code });
            return { code, exists: res.length > 0 };
          })
        );
        const existingCodes = new Set(existingResults.filter(r => r.exists).map(r => r.code));
        
        for (const code of codesArray) {
          if (!existingCodes.has(code)) {
            const item = itemCodeToDetails.get(code);
            console.log(`[Sync] Dynamically creating item ${code} - ${item.ItemName}`);
            try {
              await db.executeCmd(`
                INSERT INTO tblItem (Code, Name, Description, Category, Brand, UOM, Barcode, HSNCode, IsActive)
                VALUES (@code, @name, @desc, @category, 'ERP', @uom, @barcode, @hsn, 1)
              `, {
                code,
                name: item.ItemName || code,
                desc: 'Synced from ERP PO',
                category: item.ItemGrp || 'General',
                uom: item.UOM || 'PCS',
                barcode: code,
                hsn: item.HSNCode || null
              });
            } catch (err: any) {
              console.error(`[Sync] Failed to dynamically create item ${code}:`, err.message);
            }
          }
        }
      }

      let syncedCount = 0;
      for (const po of posToSync) {

        const existing = await db.query('SELECT POId, Status FROM tblPurchaseOrder WHERE POCode = @code', { code: po.POCode });
        let resolvedPOId: any;
        let existingPOId: number | undefined = undefined;

        if (existing.length > 0) {
          existingPOId = existing[0].POId;
          const status = existing[0].Status;
          if (status !== 'PENDING') {
            continue; // Skip updating since warehouse operations have started
          }
        }

        // Validate incoming PO data using the shared OrderValidator
        const validation = await OrderValidator.validate({
          OrderCode: po.POCode,
          PartnerName: po.VendorName,
          PartnerCode: po.VendorCode,
          OrderDate: po.OrderDate,
          Items: po.Items ? po.Items.map((item: any) => ({
            ItemCode: item.ItemCode,
            OrderQty: item.OrderQty,
            UOM: item.UOM,
            UnitPrice: item.UnitPrice
          })) : []
        }, 'PO', existingPOId);

        if (!validation.isValid) {
          console.error(`[Sync] Validation failed for PO ${po.POCode}:`, validation.errors);
          await db.executeCmd(`
            INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
            VALUES ('PO_SYNC', 'INBOUND', '/sync/po', @req, '', 'ERROR', @err)
          `, { req: JSON.stringify(po), err: `Validation failed: ${validation.errors.join(', ')}` });
          continue;
        }

        try {
          await db.transaction(async (tx) => {
            if (existing.length > 0) {
              const poId = existing[0].POId;
              const status = existing[0].Status;

              if (status !== 'PENDING') {
                return; // Skip updating since warehouse operations have started
              }

              await tx.executeCmd(`
                UPDATE tblPurchaseOrder 
                SET VendorName = @VendorName, VendorCode = @VendorCode, OrderDate = @OrderDate, PreparedBy = @PreparedBy, UpdatedAt = CURRENT_TIMESTAMP
                WHERE POId = @poId
              `, {
                VendorName: po.VendorName,
                VendorCode: po.VendorCode,
                OrderDate: po.OrderDate,
                PreparedBy: po.PreparedBy || null,
                poId
              });

              await tx.executeCmd('DELETE FROM tblPurchaseOrderDetail WHERE POId = @poId', { poId });
              resolvedPOId = poId;
            } else {
              const poRes = await tx.executeCmd(`
                INSERT INTO tblPurchaseOrder (POCode, VendorName, VendorCode, OrderDate, PreparedBy, Status)
                VALUES (@POCode, @VendorName, @VendorCode, @OrderDate, @PreparedBy, 'PENDING')
              `, {
                POCode: po.POCode,
                VendorName: po.VendorName,
                VendorCode: po.VendorCode,
                OrderDate: po.OrderDate,
                PreparedBy: po.PreparedBy || null
              });
              
              resolvedPOId = poRes.lastID!;
            }

            for (const item of validation.cleanedItems!) {
              await tx.executeCmd(`
                INSERT INTO tblPurchaseOrderDetail (POId, ItemId, OrderQty, ReceivedQty, UOM, UnitPrice)
                VALUES (@POId, @ItemId, @OrderQty, 0.0, @UOM, @UnitPrice)
              `, {
                POId: resolvedPOId,
                ItemId: item.ItemId,
                OrderQty: item.OrderQty,
                UOM: item.UOM,
                UnitPrice: item.UnitPrice
              });
            }
            syncedCount++;
          });
        } catch (err: any) {
          console.error(`[Sync] Failed to sync PO ${po.POCode}:`, err.message);
          await db.executeCmd(`
            INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
            VALUES ('PO_SYNC', 'INBOUND', '/sync/po', @req, '', 'ERROR', @err)
          `, { req: JSON.stringify(po), err: err.message });
        }
      }

      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('PO_SYNC', 'INBOUND', '/sync/po', @req, @res, 'SUCCESS')
      `, { req: JSON.stringify(posToSync), res: JSON.stringify({ message: "Sync successful", syncedCount }) });

    } catch (err: any) {
      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
        VALUES ('PO_SYNC', 'INBOUND', '/sync/po', @req, '', 'ERROR', @err)
      `, { req: JSON.stringify(posToSync), err: err.message });
    }
  }

  public static async syncSalesOrders(req: AuthenticatedRequest, res: Response) {
    const sosToSync = req.body;
    const isManualImport = Array.isArray(sosToSync) && sosToSync.length > 0;

    res.status(202).json({
      message: 'ERP Sales Order synchronization triggered in the background. Please check WMS Sync Audit Logs for progress status.'
    });

    setImmediate(async () => {
      try {
        await SyncController.performSyncSOs(sosToSync, isManualImport);
      } catch (err: any) {
        console.error('[Sync Background SO Error]:', err);
      }
    });
  }

  // Actual SO sync background task
  private static async performSyncSOs(sosToSyncInput: any, isManualImport: boolean) {
    let sosToSync = sosToSyncInput;
    try {
      if (!isManualImport) {
        // Query last 30 days of SOs from MSSQL
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        
        console.log(`[Sync] Fetching ERP SOs from MSSQL for range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
        sosToSync = await SyncController.fetchSOsFromMSSQL(startDate.toISOString(), endDate.toISOString());
      }

      // 1. Gather all unique item codes from SOs and resolve/insert them in parallel batches
      const uniqueItemCodes = new Set<string>();
      const itemCodeToDetails = new Map<string, any>();
      for (const so of sosToSync) {
        if (so.Items) {
          for (const item of so.Items) {
            if (item.ItemCode) {
              uniqueItemCodes.add(item.ItemCode);
              itemCodeToDetails.set(item.ItemCode, item);
            }
          }
        }
      }

      if (uniqueItemCodes.size > 0) {
        const codesArray = Array.from(uniqueItemCodes);
        const existingResults = await Promise.all(
          codesArray.map(async (code) => {
            const res = await db.query('SELECT ItemId FROM tblItem WHERE Code = @code', { code });
            return { code, exists: res.length > 0 };
          })
        );
        const existingCodes = new Set(existingResults.filter(r => r.exists).map(r => r.code));
        
        for (const code of codesArray) {
          if (!existingCodes.has(code)) {
            const item = itemCodeToDetails.get(code);
            console.log(`[Sync] Dynamically creating item ${code} - ${item.ItemName}`);
            try {
              await db.executeCmd(`
                INSERT INTO tblItem (Code, Name, Description, Category, Brand, UOM, Barcode, IsActive)
                VALUES (@code, @name, @desc, @category, 'ERP', @uom, @barcode, 1)
              `, {
                code,
                name: item.ItemName || code,
                desc: 'Synced from ERP SO',
                category: item.ItemGrp || 'General',
                uom: item.UOM || 'PCS',
                barcode: code
              });
            } catch (err: any) {
              console.error(`[Sync] Failed to dynamically create item ${code}:`, err.message);
            }
          }
        }
      }

      let syncedCount = 0;
      for (const so of sosToSync) {

        const existing = await db.query('SELECT SOId, Status FROM tblSalesOrder WHERE SOCode = @code', { code: so.SOCode });
        let resolvedSOId: any;
        let existingSOId: number | undefined = undefined;

        if (existing.length > 0) {
          existingSOId = existing[0].SOId;
          const status = existing[0].Status;
          if (status !== 'PENDING') {
            continue; // Skip updating since warehouse operations have started
          }
        }

        // Validate incoming SO data using the shared OrderValidator
        const validation = await OrderValidator.validate({
          OrderCode: so.SOCode,
          PartnerName: so.CustomerName,
          PartnerCode: so.CustomerCode,
          OrderDate: so.OrderDate,
          Items: so.Items ? so.Items.map((item: any) => ({
            ItemCode: item.ItemCode,
            OrderQty: item.OrderQty,
            UOM: item.UOM,
            UnitPrice: item.UnitPrice
          })) : []
        }, 'SO', existingSOId);

        if (!validation.isValid) {
          console.error(`[Sync] Validation failed for SO ${so.SOCode}:`, validation.errors);
          await db.executeCmd(`
            INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
            VALUES ('SO_SYNC', 'INBOUND', '/sync/so', @req, '', 'ERROR', @err)
          `, { req: JSON.stringify(so), err: `Validation failed: ${validation.errors.join(', ')}` });
          continue;
        }

        try {
          await db.transaction(async (tx) => {
            if (existing.length > 0) {
              const soId = existing[0].SOId;
              await tx.executeCmd(`
                UPDATE tblSalesOrder 
                SET CustomerName = @CustomerName, CustomerCode = @CustomerCode, OrderDate = @OrderDate, Salesman = @Salesman, UpdatedAt = CURRENT_TIMESTAMP
                WHERE SOId = @soId
              `, {
                CustomerName: so.CustomerName,
                CustomerCode: so.CustomerCode,
                OrderDate: so.OrderDate,
                Salesman: so.Salesman || null,
                soId
              });

              await tx.executeCmd('DELETE FROM tblSalesOrderDetail WHERE SOId = @soId', { soId });
              resolvedSOId = soId;
            } else {
              const soRes = await tx.executeCmd(`
                INSERT INTO tblSalesOrder (SOCode, CustomerName, CustomerCode, OrderDate, Salesman, Status)
                VALUES (@SOCode, @CustomerName, @CustomerCode, @OrderDate, @Salesman, 'PENDING')
              `, {
                SOCode: so.SOCode,
                CustomerName: so.CustomerName,
                CustomerCode: so.CustomerCode,
                OrderDate: so.OrderDate,
                Salesman: so.Salesman || null
              });
              
              resolvedSOId = soRes.lastID!;
            }

            for (const item of validation.cleanedItems!) {
              await tx.executeCmd(`
                INSERT INTO tblSalesOrderDetail (SOId, ItemId, OrderQty, ReservedQty, PickedQty, ShippedQty, UOM, UnitPrice)
                VALUES (@SOId, @ItemId, @OrderQty, 0.0, 0.0, 0.0, @UOM, @UnitPrice)
              `, {
                SOId: resolvedSOId,
                ItemId: item.ItemId,
                OrderQty: item.OrderQty,
                UOM: item.UOM,
                UnitPrice: item.UnitPrice
              });
            }
            syncedCount++;
          });
        } catch (err: any) {
          console.error(`[Sync] Failed to sync SO ${so.SOCode}:`, err.message);
          await db.executeCmd(`
            INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
            VALUES ('SO_SYNC', 'INBOUND', '/sync/so', @req, '', 'ERROR', @err)
          `, { req: JSON.stringify(so), err: err.message });
        }
      }

      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('SO_SYNC', 'INBOUND', '/sync/so', @req, @res, 'SUCCESS')
      `, { req: JSON.stringify(sosToSync), res: JSON.stringify({ message: "Sync successful", syncedCount }) });

    } catch (err: any) {
      console.error('[Sync] SO Sync failed:', err);
      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
        VALUES ('SO_SYNC', 'INBOUND', '/sync/so', @req, '', 'ERROR', @err)
      `, { req: JSON.stringify(sosToSync), err: err.message });
    }
  }

  // Import Purchase Invoice (Creates automated GRN and Staging Stock)
  public static async syncPurchaseInvoices(req: AuthenticatedRequest, res: Response) {
    try {
      const mockInvoices = [
        {
          InvoiceNo: `INV-PUR-${Date.now()}`,
          POCode: 'PO-2026-001',
          VendorName: 'Supertron Electronics',
          VendorCode: 'VND-001',
          Items: [
            { ItemCode: 'ITM-001', Qty: 30.0, UOM: 'PCS', UnitPrice: 600.0 },
            { ItemCode: 'ITM-002', Qty: 20.0, UOM: 'PCS', UnitPrice: 500.0 }
          ]
        }
      ];

      let syncedCount = 0;
      for (const inv of mockInvoices) {
        // Prevent duplicate GRNs by invoice number
        const existing = await db.query('SELECT GRNId FROM tblGRN WHERE InvoiceNo = @inv', { inv: inv.InvoiceNo });
        if (existing.length > 0) continue;

        // Resolve POId
        const pos = await db.query('SELECT POId FROM tblPurchaseOrder WHERE POCode = @poCode', { poCode: inv.POCode });
        const poId = pos[0]?.POId || null;

        const grnCode = `GRN-INV-${Date.now()}`;
        const grnRes = await db.executeCmd(`
          INSERT INTO tblGRN (GRNCode, POId, ReceivedDate, InvoiceNo, ReceivedBy, Status)
          VALUES (@grnCode, @poId, NOW(), @invoiceNo, 1, 'QC_COMPLETED')
        `, {
          grnCode,
          poId,
          invoiceNo: inv.InvoiceNo
        });

        const grnId = grnRes.lastID!;

        // Insert details and auto putaway to staging bin WH01-Z02-R01-S01-B01
        const stagingBinId = 1; // Delhi main staging bin WH01-Z02-R01-S01-B01
        
        for (const item of inv.Items) {
          const items = await db.query('SELECT ItemId FROM tblItem WHERE ItemId = @code OR Code = @code', { code: item.ItemCode });
          if (items.length > 0) {
            const itemId = items[0].ItemId;
            
            const detailRes = await db.executeCmd(`
              INSERT INTO tblGRNDetail (GRNId, ItemId, ReceivedQty, AcceptedQty, RejectedQty, PutawayQty)
              VALUES (@grnId, @itemId, @qty, @qty, 0.0, @qty)
            `, {
              grnId,
              itemId,
              qty: item.Qty
            });

            const grnDetailId = detailRes.lastID!;

            // Putaway record
            await db.executeCmd(`
              INSERT INTO tblPutaway (GRNDetailId, ItemId, BinId, Quantity, PutawayBy, PutawayDate, Status)
              VALUES (@grnDetailId, @itemId, @binId, @qty, 1, NOW(), 'COMPLETED')
            `, {
              grnDetailId,
              itemId,
              binId: stagingBinId,
              qty: item.Qty
            });

            // Upsert inventory
            const invExists = await db.query('SELECT InventoryId FROM tblInventory WHERE BinId = @binId AND ItemId = @itemId AND BatchId IS NULL', { binId: stagingBinId, itemId });
            if (invExists.length > 0) {
              await db.executeCmd(`
                UPDATE tblInventory SET Quantity = Quantity + @qty, UpdatedAt = NOW() WHERE InventoryId = @invId
              `, { qty: item.Qty, invId: invExists[0].InventoryId });
            } else {
              await db.executeCmd(`
                INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, BatchId, Quantity, ReservedQty)
                VALUES (1, 1, @binId, @itemId, NULL, @qty, 0.0)
              `, { binId: stagingBinId, itemId, qty: item.Qty });
            }
          }
        }
        syncedCount++;
      }

      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('PURCHASE_INVOICE_SYNC', 'INBOUND', '/sync/purchase-invoices', @req, @res, 'SUCCESS')
      `, { req: JSON.stringify(mockInvoices), res: JSON.stringify({ message: "Invoices synced successfully", syncedCount }) });

      return res.json({ message: 'Purchase Invoices synced successfully', count: syncedCount });
    } catch (err: any) {
      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
        VALUES ('PURCHASE_INVOICE_SYNC', 'INBOUND', '/sync/purchase-invoices', '{}', '', 'ERROR', @err)
      `, { err: err.message });
      return res.status(500).json({ message: 'Invoice Sync failed', error: err.message });
    }
  }

  // Import Sales Invoice (Completes outbound and dispatch)
  public static async syncSalesInvoices(req: AuthenticatedRequest, res: Response) {
    try {
      const mockSalesInvoices = [
        {
          InvoiceNo: `INV-SAL-${Date.now()}`,
          SOCode: 'SO-2026-001',
          CustomerName: 'Apex Tech Solutions',
          CustomerCode: 'CST-001',
          Items: [
            { ItemCode: 'ITM-001', Qty: 5.0, UOM: 'PCS', UnitPrice: 850.0 }
          ]
        }
      ];

      let syncedCount = 0;
      for (const inv of mockSalesInvoices) {
        // Prevent duplicate dispatch logs
        const existing = await db.query('SELECT DispatchId FROM tblDispatch WHERE DeliveryChallanNo = @inv', { inv: inv.InvoiceNo });
        if (existing.length > 0) continue;

        // Resolve SOId
        const sos = await db.query('SELECT SOId FROM tblSalesOrder WHERE SOCode = @code', { code: inv.SOCode });
        if (sos.length === 0) continue;
        const soId = sos[0].SOId;

        // Create Dispatch directly
        const dispatchCode = `DC-INV-${Date.now()}`;
        await db.executeCmd(`
          INSERT INTO tblDispatch (DispatchCode, SOId, DeliveryChallanNo, VehicleNo, TransporterName, LRNumber, DispatchDate, DispatchedBy, Status)
          VALUES (@dispatchCode, @soId, @invoiceNo, 'DL-3C-9900', 'Busy Transporters', 'LR-9921', NOW(), 1, 'DISPATCHED')
        `, {
          dispatchCode,
          soId,
          invoiceNo: inv.InvoiceNo
        });

        // Update SalesOrder status
        await db.executeCmd('UPDATE tblSalesOrder SET Status = "DISPATCHED", UpdatedAt = NOW() WHERE SOId = @soId', { soId });

        // Update sales order details shipped quantity
        for (const item of inv.Items) {
          const items = await db.query('SELECT ItemId FROM tblItem WHERE Code = @code', { code: item.ItemCode });
          if (items.length > 0) {
            await db.executeCmd(`
              UPDATE tblSalesOrderDetail 
              SET ShippedQty = ShippedQty + @qty 
              WHERE SOId = @soId AND ItemId = @itemId
            `, { qty: item.Qty, soId, itemId: items[0].ItemId });
          }
        }
        syncedCount++;
      }

      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('SALES_INVOICE_SYNC', 'INBOUND', '/sync/sales-invoices', @req, @res, 'SUCCESS')
      `, { req: JSON.stringify(mockSalesInvoices), res: JSON.stringify({ message: "Sales Invoices synced successfully", syncedCount }) });

      return res.json({ message: 'Sales Invoices synced successfully', count: syncedCount });
    } catch (err: any) {
      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
        VALUES ('SALES_INVOICE_SYNC', 'INBOUND', '/sync/sales-invoices', '{}', '', 'ERROR', @err)
      `, { err: err.message });
      return res.status(500).json({ message: 'Sales Invoice Sync failed', error: err.message });
    }
  }

  // Trigger retry for failed API logging
  public static async retryLog(req: AuthenticatedRequest, res: Response) {
    const { logId } = req.params;
    try {
      const logs = await db.query('SELECT * FROM tblApiLog WHERE ApiLogId = @logId', { logId });
      if (logs.length === 0) return res.status(404).json({ message: 'Log not found' });
      
      const logObj = logs[0];
      
      // Execute based on sync type
      const dummyReq: any = null;
      if (logObj.SyncType === 'SUPPLIER_SYNC') {
        await SyncController.syncSuppliers(dummyReq, res);
      } else if (logObj.SyncType === 'CUSTOMER_SYNC') {
        await SyncController.syncCustomers(dummyReq, res);
      } else if (logObj.SyncType === 'ITEM_SYNC') {
        await SyncController.syncItems(dummyReq, res);
      } else if (logObj.SyncType === 'PO_SYNC') {
        await SyncController.syncPurchaseOrders(dummyReq, res);
      } else if (logObj.SyncType === 'SO_SYNC') {
        await SyncController.syncSalesOrders(dummyReq, res);
      } else if (logObj.SyncType === 'PURCHASE_INVOICE_SYNC') {
        await SyncController.syncPurchaseInvoices(dummyReq, res);
      } else if (logObj.SyncType === 'SALES_INVOICE_SYNC') {
        await SyncController.syncSalesInvoices(dummyReq, res);
      } else {
        // Fallback simulation
        await db.executeCmd(`
          UPDATE tblApiLog SET Status = 'SUCCESS', ErrorMessage = NULL WHERE ApiLogId = @logId
        `, { logId });
        return res.json({ message: `Successfully retried sync for action ${logObj.SyncType}` });
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Get items details directly from ERP MSSQL database
  public static async getErpItems(req: AuthenticatedRequest, res: Response) {
    const text1 = (req.query.name || req.query.text || '') as string;
    try {
      const pool = mssqlDb.getPool();
      const query = `
        SELECT name, alias, HSNCODE,
          (SELECT NAME FROM MASTER1 M WHERE M.CODE=MASTER1.ParentGrp) AS ITEM_GRP,
          d4 AS purch_price, d17 AS purch_dis, d21 AS alt_sale_price, d22 AS alt_purch_price,
          D3 AS MRP, D16 AS SALE_DIS,
          (SELECT NAME FROM MASTER1 m WHERE m.CODE=MASTER1.CM1) AS MAINUNIT,
          (SELECT NAME FROM MASTER1 m WHERE m.CODE=MASTER1.CM2) AS ALTUNIT,
          (SELECT NAME FROM MASTER1 m WHERE m.CODE=MASTER1.CM9) AS vndor,
          (SELECT NAME FROM MASTER1 m WHERE m.CODE=MASTER1.B16) AS tax
        FROM master1 
        WHERE mastertype=6 AND alias LIKE (@text1 + '[0-9]%') 
        ORDER BY ALIAS
      `;
      
      const result = await pool.request()
        .input('text1', mssql.VarChar, text1)
        .query(query);

      return res.json(result.recordset);
    } catch (err: any) {
      console.error('Failed to get ERP items from MSSQL:', err);
      return res.status(500).json({ message: 'Failed to fetch ERP items', error: err.message });
    }
  }

  // Get raw Purchase Orders from ERP MSSQL database
  public static async getErpPurchaseOrders(req: AuthenticatedRequest, res: Response) {
    const startDate = (req.query.startDate || '2000-01-01') as string;
    const endDate = (req.query.endDate || '2099-12-31') as string;
    try {
      const pos = await SyncController.fetchPOsFromMSSQL(startDate, endDate);
      return res.json(pos);
    } catch (err: any) {
      console.error('Failed to get ERP POs from MSSQL:', err);
      return res.status(500).json({ message: 'Failed to fetch ERP Purchase Orders', error: err.message });
    }
  }

  // Helper method to fetch and group POs from MSSQL ERP database
  private static async fetchPOsFromMSSQL(startDateParam: string, endDateParam: string): Promise<any[]> {
    const pool = mssqlDb.getPool();
    const query = `
      SELECT 
          TRAN2.DATE AS VOUCHER_DATE,
          C.ActionTime,
          C.USERNAME AS PREPARED_BY,
          (SELECT NAME FROM MASTER1 T WHERE T.CODE = TRAN2.MASTERCODE2) AS BRANCH,
          TRAN2.VCHNO AS VOU_NO,
          (SELECT NAME FROM MASTER1 WHERE CODE = TRAN2.CM1) AS PARTY,
          P.CODE AS PARTY_CODE, -- WMS compatibility
          TRAN2.MASTERCODE1 AS ITEM_ERP_CODE, -- WMS compatibility
          (SELECT ALIAS FROM MASTER1 WHERE CODE = TRAN2.MASTERCODE1) AS ALIAS,
          (SELECT NAME FROM MASTER1 U 
           WHERE U.CODE = TRAN2.MASTERCODE1 AND U.MASTERTYPE = 6) AS ITEM_NAME,
          (SELECT NAME FROM MASTER1 M WHERE M.CODE = ITEM.PARENTGRP) AS ITEM_GRP,
          CASE WHEN ITEM.D1 = 1 THEN NULL ELSE ITEM.D1 END AS CON_FAC,
          (SELECT CASE 
              WHEN ITEM.CM1 = ITEM.CM2 THEN NULL
              ELSE CONCAT(
                  (SELECT NAME FROM MASTER1 WHERE MASTERTYPE = 8 AND CODE = ITEM.CM2),
                  '/',
                  (SELECT NAME FROM MASTER1 WHERE MASTERTYPE = 8 AND CODE = ITEM.CM1)
              )
          END) AS CON_TYP,
          ABS(TRAN2.D1) AS QTY,
          (SELECT NAME FROM MASTER1 WHERE CODE = TRAN2.CM2) AS UNITS,
          TRAN2.VALUE3 AS TOTAL_AMOUNT,
          CASE 
              WHEN TRAN2.D1 = 0 THEN NULL 
              ELSE (TRAN2.VALUE3 / ABS(TRAN2.D1)) 
          END AS PER_PC_AMOUNT,
          ITEM.D2 AS MRP,
          CASE 
              WHEN TRY_CONVERT(FLOAT, SUBSTRING(ITEM.C3,1,5)) > 0 
              THEN ITEM.C3 
              ELSE ITEM.D16 
          END AS DIS_R,
          (SELECT TOP 1 MA.D2 
           FROM MASTERSUPPORT MA 
           WHERE MA.MASTERCODE = ITEM.CODE AND MA.I1 = 101) AS DIS_A,
          (SELECT TOP 1 MA.D2 
           FROM MASTERSUPPORT MA 
           WHERE MA.MASTERCODE = ITEM.CODE AND MA.I1 = 102) AS DIS_B,
          (SELECT NAME 
           FROM MASTER1 
           WHERE CODE IN (
               SELECT TOP 1 CM1 
               FROM MASTERSUPPORT MS 
               WHERE MS.MASTERCODE = TRAN2.MASTERCODE1
           )) AS DISC_STR,
          ITEM.D4 AS DP,
          ITEM.D17 AS PUR_DIS,
          (SELECT TOP 1 RIGHT(NAME,3) 
           FROM MASTER1 
           WHERE CODE = (
               SELECT TOP 1 CM8 FROM MASTER1 WHERE CODE = ITEM.CODE
           )) AS GST_RATE,
          (SELECT OF1 FROM MASTERADDRESSINFO MA WHERE ITEM.CODE = MA.MASTERCODE) AS PD_HD_LD,
          (SELECT TOP 1 NAME 
           FROM MASTER1 
           WHERE CODE = (
               SELECT TOP 1 T.CM1 
               FROM TRAN1 T 
               WHERE VCHCODE = TRAN2.VCHCODE
           )) AS PUR_TYPE
      FROM TRAN2
      INNER JOIN MASTER1 ITEM 
          ON ITEM.CODE = TRAN2.MASTERCODE1
         AND ITEM.MASTERTYPE = 6
      INNER JOIN MASTER1 P 
          ON P.CODE = TRAN2.CM1
         AND P.MASTERTYPE = 2
      INNER JOIN VCHOTHERINFO V 
          ON V.VCHCODE = TRAN2.VCHCODE
      INNER JOIN CHECKLIST C 
          ON C.CODE = TRAN2.VCHCODE
         AND C.TYPE = 2
         AND C.ACTION = 1
      WHERE 
          TRAN2.VCHTYPE = 13
          AND TRAN2.TRANTYPE IN (0,3)
          AND TRAN2.DATE >= @startdate
          AND TRAN2.DATE <= @enddate
      ORDER BY 
          TRAN2.DATE DESC,
          TRAN2.VCHNO ASC
    `;

    const start = new Date(startDateParam);
    const end = new Date(endDateParam);

    const result = await pool.request()
      .input('startdate', mssql.DateTime, start)
      .input('enddate', mssql.DateTime, end)
      .query(query);

    const poMap = new Map<string, any>();
    for (const row of result.recordset) {
      const vouNo = row.VOU_NO ? String(row.VOU_NO).trim() : '';
      if (!vouNo) continue;
      
      const vendorName = row.PARTY ? String(row.PARTY).trim() : '';
      const vendorCode = row.PARTY_CODE ? String(row.PARTY_CODE).trim() : vendorName;
      const itemCode = row.ALIAS ? String(row.ALIAS).trim() : (row.ITEM_ERP_CODE ? String(row.ITEM_ERP_CODE).trim() : '');
      if (!itemCode) continue;

      if (!poMap.has(vouNo)) {
        poMap.set(vouNo, {
          POCode: vouNo,
          VendorName: vendorName,
          VendorCode: vendorCode,
          OrderDate: row.VOUCHER_DATE ? new Date(row.VOUCHER_DATE).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          PreparedBy: row.PREPARED_BY ? String(row.PREPARED_BY).trim() : null,
          Items: []
        });
      }

      poMap.get(vouNo).Items.push({
        ItemCode: itemCode,
        ItemName: row.ITEM_NAME ? String(row.ITEM_NAME).trim() : itemCode,
        ItemGrp: row.ITEM_GRP ? String(row.ITEM_GRP).trim() : 'General',
        HSNCode: row.HSNCODE ? String(row.HSNCODE).trim() : null,
        OrderQty: Math.abs(row.QTY || 0),
        UOM: row.UNITS ? String(row.UNITS).trim() : 'PCS',
        UnitPrice: row.PER_PC_AMOUNT || 0
      });
    }

    return Array.from(poMap.values());
  }

  // Get raw Sales Orders from ERP MSSQL database
  public static async getErpSalesOrders(req: AuthenticatedRequest, res: Response) {
    const startDate = (req.query.startDate || '2000-01-01') as string;
    const endDate = (req.query.endDate || '2099-12-31') as string;
    try {
      const sos = await SyncController.fetchSOsFromMSSQL(startDate, endDate);
      return res.json(sos);
    } catch (err: any) {
      console.error('Failed to get ERP SOs from MSSQL:', err);
      return res.status(500).json({ message: 'Failed to fetch ERP Sales Orders', error: err.message });
    }
  }

  // Helper method to fetch and group SOs from MSSQL ERP database
  private static async fetchSOsFromMSSQL(startDateParam: string, endDateParam: string): Promise<any[]> {
    const pool = mssqlDb.getPool();
    const query = `
      SELECT 
          T.VCHCODE,
          T.VCHNO,
          T.DATE,
          P.NAME AS PARTYNAME,
          P.CODE AS PARTY_CODE,
          PG.NAME AS ACCOUNT_GRP,
          SM.NAME AS SALESMAN,
          PCB.NAME AS PACKED_CHECKED_BY,
          I.NAME AS ITEM,
          I.ALIAS,
          T.MASTERCODE1 AS ITEM_ERP_CODE,
          U.NAME AS UNITS,
          IG.NAME AS ITEM_GRP,
          ABS(T.D1) AS QTY,
          MA.OF2 AS SCHEME,
          MA.OF5 AS INCENTIVE_POINTS,
          ((T.D2 * MA.OF5) / 100.0) * ABS(T.D1) AS INCENTIVE_AMOUNT,
          CM.NAME AS COMMISSION,
          (T.D2 * TRY_CONVERT(FLOAT, CM.NAME) / 100.0) AS COMMISSION_POINTS_PER_ITEM,
          ((T.D2 * TRY_CONVERT(FLOAT, CM.NAME) / 100.0) * ABS(T.D1)) AS COMMISSION_AMOUNT,
          T.D18 AS MRP,
          CASE 
              WHEN TRY_CONVERT(FLOAT, SUBSTRING(I.C3,1,5)) > 0 
                  THEN I.C3
              ELSE I.D16
          END AS SALEDISCOUNT,
          CASE 
              WHEN ISNUMERIC(I.D16) = 1 
                  THEN CONVERT(VARCHAR(30), I.D16)
              ELSE CONVERT(VARCHAR(30), I.C3)
          END AS DISCOUNT,
          T.D9 AS VCHDISCOUNT,
          CASE 
              WHEN T.VCHSERIESCODE IN ('296829','258')  
                  THEN MS.D2
              ELSE I.D16 
          END AS PARTYWISE_DISCOUNT_IN_MASTER,
          (
              CASE 
                  WHEN T.VCHSERIESCODE IN ('296829','258')  
                      THEN MS.D2
                  ELSE I.D16 
              END - T.D9
          ) AS DIFFERANCE_IN_DIS,
          T.D2 AS NET_PRICE,
          T.D5 AS AMOUNT,
          C.USERNAME AS PREPARED_BY
      FROM TRAN2 T
      -- Party
      INNER JOIN MASTER1 P 
          ON P.CODE = T.CM1 
         AND P.MASTERTYPE = 2
      LEFT JOIN MASTER1 PG 
          ON PG.CODE = P.PARENTGRP
      -- Item
      INNER JOIN MASTER1 I 
          ON I.CODE = T.MASTERCODE1 
         AND I.MASTERTYPE = 6
      -- Units
      LEFT JOIN MASTER1 U 
          ON U.CODE = T.CM2
      -- Salesman
      LEFT JOIN VCHOTHERINFO V 
          ON V.VCHCODE = T.VCHCODE
      LEFT JOIN MASTER1 SM 
          ON SM.CODE = TRY_CONVERT(INT, V.OF3)
      -- Packed/Checked By
      LEFT JOIN MASTER1 PCB 
          ON PCB.CODE = TRY_CONVERT(INT, V.OF6)
      -- Item Group
      LEFT JOIN MASTER1 IG 
          ON IG.CODE = I.PARENTGRP
      -- Scheme / Incentive
      LEFT JOIN MASTERADDRESSINFO MA 
          ON MA.MASTERCODE = I.CODE
      -- Commission
      LEFT JOIN MASTERADDRESSINFO MA2 
          ON MA2.MASTERCODE = I.CODE
      LEFT JOIN MASTER1 CM 
          ON CM.CODE = TRY_CONVERT(INT, MA2.OF4)
      -- Master Support
      LEFT JOIN MASTERSUPPORT MS 
          ON MS.MASTERCODE = T.MASTERCODE1 
         AND MS.I1 = 101
      -- Prepared By
      INNER JOIN CHECKLIST C 
          ON C.CODE = T.VCHCODE 
         AND C.TYPE = 2 
         AND C.ACTION = 1
      WHERE 
          T.VCHTYPE IN (12)
          AND T.TRANTYPE IN (0)
          AND T.RECTYPE = 4
          AND T.DATE BETWEEN @startdate AND @enddate
    `;

    const start = new Date(startDateParam);
    const end = new Date(endDateParam);

    const result = await pool.request()
      .input('startdate', mssql.DateTime, start)
      .input('enddate', mssql.DateTime, end)
      .query(query);

    const soMap = new Map<string, any>();
    for (const row of result.recordset) {
      const vouNo = row.VOU_NO || row.VCHNO ? String(row.VOU_NO || row.VCHNO).trim() : '';
      if (!vouNo) continue;
      
      const customerName = row.PARTYNAME ? String(row.PARTYNAME).trim() : '';
      const customerCode = row.PARTY_CODE ? String(row.PARTY_CODE).trim() : customerName;
      const itemCode = row.ALIAS ? String(row.ALIAS).trim() : (row.ITEM_ERP_CODE ? String(row.ITEM_ERP_CODE).trim() : '');
      if (!itemCode) continue;

      if (!soMap.has(vouNo)) {
        soMap.set(vouNo, {
          SOCode: vouNo,
          CustomerName: customerName,
          CustomerCode: customerCode,
          OrderDate: row.DATE ? new Date(row.DATE).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          Salesman: row.SALESMAN ? String(row.SALESMAN).trim() : null,
          Items: []
        });
      }

      soMap.get(vouNo).Items.push({
        ItemCode: itemCode,
        ItemName: row.ITEM ? String(row.ITEM).trim() : itemCode,
        ItemGrp: row.ITEM_GRP ? String(row.ITEM_GRP).trim() : 'General',
        OrderQty: Math.abs(row.QTY || 0),
        UOM: row.UNITS ? String(row.UNITS).trim() : 'PCS',
        UnitPrice: row.NET_PRICE || 0
      });
    }

    return Array.from(soMap.values());
  }
}
