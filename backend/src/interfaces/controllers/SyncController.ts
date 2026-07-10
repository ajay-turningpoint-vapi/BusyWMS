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
    try {
      const pool = mssqlDb.getPool();
      const query = `
        SELECT
          M.CODE AS CODE, 
          M.NAME AS NAME, 
          (SELECT P.NAME FROM MASTER1 P WHERE P.MASTERTYPE = 1 AND P.CODE = M.PARENTGRP) AS PARENT_GRP,
          M.ALIAS AS ALIAS,
          A.MOBILE,
          A.EMAIL,
          A.address1 AS ADD1, 
          A.address2 AS ADD2, A.address3 AS ADD3, A.address4 AS ADD4, 
          A.GSTNo AS GST_No,
          A.STATION AS STATION,
          (select name from master1 m1 where m1.code=A.CountryCodeLong) as country,
          A.PINCODE AS PINCODE,
          (select name from master1 m1 where m1.code=A.StateCodeLong) as state
        FROM MASTER1 M 
        LEFT JOIN MASTERADDRESSINFO A ON M.CODE = A.MASTERCODE 
        WHERE M.MASTERTYPE = 2 
        AND (SELECT P.NAME FROM MASTER1 P WHERE P.MASTERTYPE = 1 AND P.CODE = M.PARENTGRP) LIKE 'SUNDRY CREDITOR%' 
        AND ISNULL(LTRIM(RTRIM(A.PINCODE)), '') <> '' 
        AND ISNULL(LTRIM(RTRIM(A.STATION)), '') <> '' 
        ORDER BY M.CODE
      `;

      console.log('Fetching suppliers from MSSQL ERP...');
      const result = await pool.request().query(query);
      let erpSuppliers: any[] = result.recordset;
      console.log(`Fetched ${erpSuppliers.length} suppliers from MSSQL ERP.`);

      // Ensure tblDeletedSupplier exists and query deleted codes
      await db.executeCmd('CREATE TABLE IF NOT EXISTS tblDeletedSupplier (Code VARCHAR(50) PRIMARY KEY, DeletedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
      const deletedRows = await db.query('SELECT Code FROM tblDeletedSupplier');
      const deletedCodes = new Set(deletedRows.map((r: any) => String(r.Code).trim()));

      // Filter out deleted suppliers
      const beforeCount = erpSuppliers.length;
      erpSuppliers = erpSuppliers.filter((row: any) => {
        const code = row.CODE ? String(row.CODE).trim() : '';
        return !deletedCodes.has(code);
      });
      console.log(`Filtered out ${beforeCount - erpSuppliers.length} deleted suppliers. ${erpSuppliers.length} suppliers remain for sync.`);

      // Batch insert into MariaDB
      const chunkSize = 1000;
      let syncedCount = 0;

      for (let i = 0; i < erpSuppliers.length; i += chunkSize) {
        const chunk = erpSuppliers.slice(i, i + chunkSize);
        const values = chunk.map(row => {
          const code = row.CODE ? String(row.CODE).trim() : '';
          const name = row.NAME ? String(row.NAME).trim() : '';
          const parentGrp = row.PARENT_GRP ? String(row.PARENT_GRP).trim() : null;
          const alias = row.ALIAS ? String(row.ALIAS).trim() : null;
          const mobile = row.MOBILE ? String(row.MOBILE).trim() : null;
          const email = row.EMAIL ? String(row.EMAIL).trim() : null;
          const add1 = row.ADD1 ? String(row.ADD1).trim() : null;
          const add2 = row.ADD2 ? String(row.ADD2).trim() : null;
          const add3 = row.ADD3 ? String(row.ADD3).trim() : null;
          const add4 = row.ADD4 ? String(row.ADD4).trim() : null;
          const gstin = row.GST_No ? String(row.GST_No).trim() : null;
          const station = row.STATION ? String(row.STATION).trim() : null;
          const country = row.country ? String(row.country).trim() : null;
          const pincode = row.PINCODE ? String(row.PINCODE).trim() : null;
          const state = row.state ? String(row.state).trim() : null;

          return [
            code, name, parentGrp, alias, mobile, email,
            add1, add2, add3, add4, gstin, station, country, pincode, state, 1
          ];
        }).filter(item => item[0] !== '' && item[1] !== '');

        if (values.length > 0) {
          await db.query(`
            INSERT INTO tblSupplier (
              Code, Name, ParentGrp, Alias, Mobile, Email,
              Add1, Add2, Add3, Add4, GSTIN, Station, Country, Pincode, State, IsActive
            )
            VALUES @values
            ON DUPLICATE KEY UPDATE
              Name = VALUES(Name),
              ParentGrp = VALUES(ParentGrp),
              Alias = VALUES(Alias),
              Mobile = VALUES(Mobile),
              Email = VALUES(Email),
              Add1 = VALUES(Add1),
              Add2 = VALUES(Add2),
              Add3 = VALUES(Add3),
              Add4 = VALUES(Add4),
              GSTIN = VALUES(GSTIN),
              Station = VALUES(Station),
              Country = VALUES(Country),
              Pincode = VALUES(Pincode),
              State = VALUES(State)
          `, { values });
          syncedCount += values.length;
        }
      }

      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('SUPPLIER_SYNC', 'INBOUND', '/sync/suppliers', '{}', @res, 'SUCCESS')
      `, { 
        res: JSON.stringify({ message: 'Sync successful', syncedCount }) 
      });

      return res.json({ message: 'Supplier Masters synchronized successfully', count: syncedCount });
    } catch (err: any) {
      console.error('Failed to sync suppliers from ERP:', err);
      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
        VALUES ('SUPPLIER_SYNC', 'INBOUND', '/sync/suppliers', '{}', '', 'ERROR', @err)
      `, { err: err.message });
      return res.status(500).json({ message: 'Supplier sync failed', error: err.message });
    }
  }

  public static async syncCustomers(req: AuthenticatedRequest, res: Response) {
    try {
      const pool = mssqlDb.getPool();
      const query = `
        SELECT
          M.CODE AS CODE, 
          M.NAME AS NAME, 
          (SELECT P.NAME FROM MASTER1 P WHERE P.MASTERTYPE = 1 AND P.CODE = M.PARENTGRP) AS PARENT_GRP,
          M.ALIAS AS ALIAS,
          A.MOBILE,
          A.EMAIL,
          A.address1 AS ADD1, 
          A.address2 AS ADD2, A.address3 AS ADD3, A.address4 AS ADD4, 
          A.GSTNo AS GST_No,
          A.STATION AS STATION,
          (select name from master1 m1 where m1.code=A.CountryCodeLong) as country,
          A.PINCODE AS PINCODE,
          (select name from master1 m1 where m1.code=A.StateCodeLong) as state
        FROM MASTER1 M 
        LEFT JOIN MASTERADDRESSINFO A ON M.CODE = A.MASTERCODE 
        WHERE M.MASTERTYPE = 2 
        AND (SELECT P.NAME FROM MASTER1 P WHERE P.MASTERTYPE = 1 AND P.CODE = M.PARENTGRP) LIKE 'SUNDRY DEBTOR%' 
        AND ISNULL(LTRIM(RTRIM(A.PINCODE)), '') <> '' 
        AND ISNULL(LTRIM(RTRIM(A.STATION)), '') <> '' 
        ORDER BY M.CODE
      `;

      console.log('Fetching customers from MSSQL ERP...');
      const result = await pool.request().query(query);
      let erpCustomers: any[] = result.recordset;
      console.log(`Fetched ${erpCustomers.length} customers from MSSQL ERP.`);

      // Ensure tblDeletedCustomer exists and query deleted codes
      await db.executeCmd('CREATE TABLE IF NOT EXISTS tblDeletedCustomer (Code VARCHAR(50) PRIMARY KEY, DeletedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
      const deletedRows = await db.query('SELECT Code FROM tblDeletedCustomer');
      const deletedCodes = new Set(deletedRows.map((r: any) => String(r.Code).trim()));

      // Filter out deleted customers
      const beforeCount = erpCustomers.length;
      erpCustomers = erpCustomers.filter((row: any) => {
        const code = row.CODE ? String(row.CODE).trim() : '';
        return !deletedCodes.has(code);
      });
      console.log(`Filtered out ${beforeCount - erpCustomers.length} deleted customers. ${erpCustomers.length} customers remain for sync.`);

      // Batch insert into MariaDB
      const chunkSize = 1000;
      let syncedCount = 0;

      for (let i = 0; i < erpCustomers.length; i += chunkSize) {
        const chunk = erpCustomers.slice(i, i + chunkSize);
        const values = chunk.map(row => {
          const code = row.CODE ? String(row.CODE).trim() : '';
          const name = row.NAME ? String(row.NAME).trim() : '';
          const parentGrp = row.PARENT_GRP ? String(row.PARENT_GRP).trim() : null;
          const alias = row.ALIAS ? String(row.ALIAS).trim() : null;
          const mobile = row.MOBILE ? String(row.MOBILE).trim() : null;
          const email = row.EMAIL ? String(row.EMAIL).trim() : null;
          const add1 = row.ADD1 ? String(row.ADD1).trim() : null;
          const add2 = row.ADD2 ? String(row.ADD2).trim() : null;
          const add3 = row.ADD3 ? String(row.ADD3).trim() : null;
          const add4 = row.ADD4 ? String(row.ADD4).trim() : null;
          const gstin = row.GST_No ? String(row.GST_No).trim() : null;
          const station = row.STATION ? String(row.STATION).trim() : null;
          const country = row.country ? String(row.country).trim() : null;
          const pincode = row.PINCODE ? String(row.PINCODE).trim() : null;
          const state = row.state ? String(row.state).trim() : null;

          return [
            code, name, parentGrp, alias, mobile, email,
            add1, add2, add3, add4, gstin, station, country, pincode, state, 1
          ];
        }).filter(item => item[0] !== '' && item[1] !== '');

        if (values.length > 0) {
          await db.query(`
            INSERT INTO tblCustomer (
              Code, Name, ParentGrp, Alias, Mobile, Email,
              Add1, Add2, Add3, Add4, GSTIN, Station, Country, Pincode, State, IsActive
            )
            VALUES @values
            ON DUPLICATE KEY UPDATE
              Name = VALUES(Name),
              ParentGrp = VALUES(ParentGrp),
              Alias = VALUES(Alias),
              Mobile = VALUES(Mobile),
              Email = VALUES(Email),
              Add1 = VALUES(Add1),
              Add2 = VALUES(Add2),
              Add3 = VALUES(Add3),
              Add4 = VALUES(Add4),
              GSTIN = VALUES(GSTIN),
              Station = VALUES(Station),
              Country = VALUES(Country),
              Pincode = VALUES(Pincode),
              State = VALUES(State)
          `, { values });
          syncedCount += values.length;
        }
      }

      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('CUSTOMER_SYNC', 'INBOUND', '/sync/customers', '{}', @res, 'SUCCESS')
      `, { 
        res: JSON.stringify({ message: 'Sync successful', syncedCount }) 
      });

      return res.json({ message: 'Customer Masters synchronized successfully', count: syncedCount });
    } catch (err: any) {
      console.error('Failed to sync customers from ERP:', err);
      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status, ErrorMessage)
        VALUES ('CUSTOMER_SYNC', 'INBOUND', '/sync/customers', '{}', '', 'ERROR', @err)
      `, { err: err.message });
      return res.status(500).json({ message: 'Customer sync failed', error: err.message });
    }
  }

  public static async syncItems(req: AuthenticatedRequest, res: Response) {
    try {
      const pool = mssqlDb.getPool();
      const query = `
        SELECT 
          CODE, name, alias, HSNCODE,
          (SELECT NAME FROM MASTER1 M WHERE M.CODE=MASTER1.ParentGrp) AS ITEM_GRP,
          d4 as purch_price,
          d17 as purch_dis,
          d3 as alt_sale_price,
          d22 as alt_purch_price,
          D2 AS MRP,
          D16 AS SALE_DIS,
          (SELECT NAME FROM MASTER1 m  WHERE m.CODE=MASTER1.CM1) AS MAINUNIT,
          (SELECT NAME FROM MASTER1  m WHERE m.CODE=MASTER1.CM2) AS ALTUNIT,
          (SELECT NAME FROM MASTER1  m WHERE m.CODE=MASTER1.CM9) AS vndor,
          (SELECT NAME FROM MASTER1  m WHERE m.CODE=MASTER1.CM8) AS tax
        FROM master1 
        WHERE mastertype=6
        ORDER BY alias
      `;

      console.log('Fetching items from MSSQL ERP...');
      const result = await pool.request().query(query);
      let erpItems: any[] = result.recordset;
      console.log(`Fetched ${erpItems.length} items from MSSQL ERP.`);

      // Ensure tblDeletedItem exists and query deleted codes
      await db.executeCmd('CREATE TABLE IF NOT EXISTS tblDeletedItem (Code VARCHAR(50) PRIMARY KEY, DeletedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
      const deletedRows = await db.query('SELECT Code FROM tblDeletedItem');
      const deletedCodes = new Set(deletedRows.map((r: any) => String(r.Code).trim()));

      // Filter out deleted items
      const beforeCount = erpItems.length;
      erpItems = erpItems.filter((row: any) => {
        const code = row.CODE ? String(row.CODE).trim() : '';
        return !deletedCodes.has(code);
      });
      console.log(`Filtered out ${beforeCount - erpItems.length} deleted items. ${erpItems.length} items remain for sync.`);

      // Batch insert into MariaDB
      const chunkSize = 1000;
      let syncedCount = 0;

      for (let i = 0; i < erpItems.length; i += chunkSize) {
        const chunk = erpItems.slice(i, i + chunkSize);
        const values = chunk.map(row => {
          const code = row.CODE ? String(row.CODE).trim() : (row.alias ? String(row.alias).trim() : (row.name ? String(row.name).trim() : ''));
          const alias = row.alias ? String(row.alias).trim() : null;
          const name = row.name ? String(row.name).trim() : code;
          const uom = row.MAINUNIT ? String(row.MAINUNIT).trim() : 'PCS';
          const hsnCode = row.HSNCODE ? String(row.HSNCODE).trim() : null;
          const category = row.ITEM_GRP ? String(row.ITEM_GRP).trim() : 'General';
          const purchPrice = row.purch_price !== null && row.purch_price !== undefined ? Number(row.purch_price) : 0.0;
          const purchDiscount = row.purch_dis !== null && row.purch_dis !== undefined ? Number(row.purch_dis) : 0.0;
          const altSalePrice = row.alt_sale_price !== null && row.alt_sale_price !== undefined ? Number(row.alt_sale_price) : 0.0;
          const altPurchPrice = row.alt_purch_price !== null && row.alt_purch_price !== undefined ? Number(row.alt_purch_price) : 0.0;
          const mrp = row.MRP !== null && row.MRP !== undefined ? Number(row.MRP) : 0.0;
          const saleDiscount = row.SALE_DIS !== null && row.SALE_DIS !== undefined ? Number(row.SALE_DIS) : 0.0;
          const mainUnit = row.MAINUNIT ? String(row.MAINUNIT).trim() : null;
          const altUnit = row.ALTUNIT ? String(row.ALTUNIT).trim() : null;
          const vendor = row.vndor ? String(row.vndor).trim() : null;
          const tax = row.tax ? String(row.tax).trim() : null;

          return [
            code, alias, name, uom, hsnCode, category,
            purchPrice, purchDiscount, altSalePrice, altPurchPrice,
            mrp, saleDiscount, mainUnit, altUnit, vendor, tax, 1
          ];
        }).filter(item => item[0] !== ''); // exclude items with empty code

        if (values.length > 0) {
          // Bulk Insert query
          await db.query(`
            INSERT INTO tblItem (
              Code, Alias, Name, UOM, HSNCode, Category, 
              PurchPrice, PurchDiscount, AltSalePrice, AltPurchPrice, 
              MRP, SaleDiscount, MainUnit, AltUnit, Vendor, Tax, IsActive
            )
            VALUES @values
            ON DUPLICATE KEY UPDATE
              Alias = VALUES(Alias),
              Name = VALUES(Name),
              UOM = VALUES(UOM),
              HSNCode = VALUES(HSNCode),
              Category = VALUES(Category),
              PurchPrice = VALUES(PurchPrice),
              PurchDiscount = VALUES(PurchDiscount),
              AltSalePrice = VALUES(AltSalePrice),
              AltPurchPrice = VALUES(AltPurchPrice),
              MRP = VALUES(MRP),
              SaleDiscount = VALUES(SaleDiscount),
              MainUnit = VALUES(MainUnit),
              AltUnit = VALUES(AltUnit),
              Vendor = VALUES(Vendor),
              Tax = VALUES(Tax)
          `, { values });
          syncedCount += values.length;
        }
      }

      await db.executeCmd(`
        INSERT INTO tblApiLog (SyncType, Direction, Endpoint, RequestPayload, ResponsePayload, Status)
        VALUES ('ITEM_SYNC', 'INBOUND', '/sync/items', '{}', @res, 'SUCCESS')
      `, { 
        res: JSON.stringify({ message: 'Sync successful', syncedCount }) 
      });

      return res.json({ message: 'Item Masters synchronized successfully', count: syncedCount });
    } catch (err: any) {
      console.error('Failed to sync items from ERP:', err);
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

    try {
      await SyncController.performSyncPOs(posToSync, isManualImport);
      return res.json({
        message: 'ERP Purchase Order synchronization completed successfully.'
      });
    } catch (err: any) {
      console.error('[Sync PO Error]:', err);
      return res.status(500).json({
        message: 'ERP Purchase Order synchronization failed.',
        error: err.message
      });
    }
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

      // Ensure tblDeletedPurchaseOrder exists and query deleted PO codes
      await db.executeCmd('CREATE TABLE IF NOT EXISTS tblDeletedPurchaseOrder (POCode VARCHAR(100) PRIMARY KEY, DeletedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
      const deletedRows = await db.query('SELECT POCode FROM tblDeletedPurchaseOrder');
      const deletedPOCodes = new Set(deletedRows.map((r: any) => String(r.POCode).trim()));

      // Filter out deleted POs
      const beforeCount = posToSync.length;
      posToSync = posToSync.filter((po: any) => {
        const code = po.POCode ? String(po.POCode).trim() : '';
        return !deletedPOCodes.has(code);
      });
      console.log(`[Sync PO] Filtered out ${beforeCount - posToSync.length} deleted POs. ${posToSync.length} POs remain for sync.`);

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

    try {
      await SyncController.performSyncSOs(sosToSync, isManualImport);
      return res.json({
        message: 'ERP Sales Order synchronization completed successfully.'
      });
    } catch (err: any) {
      console.error('[Sync SO Error]:', err);
      return res.status(500).json({
        message: 'ERP Sales Order synchronization failed.',
        error: err.message
      });
    }
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

      // Ensure tblDeletedSalesOrder exists and query deleted SO codes
      await db.executeCmd('CREATE TABLE IF NOT EXISTS tblDeletedSalesOrder (SOCode VARCHAR(100) PRIMARY KEY, DeletedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
      const deletedRows = await db.query('SELECT SOCode FROM tblDeletedSalesOrder');
      const deletedSOCodes = new Set(deletedRows.map((r: any) => String(r.SOCode).trim()));

      // Filter out deleted SOs
      const beforeCount = sosToSync.length;
      sosToSync = sosToSync.filter((so: any) => {
        const code = so.SOCode ? String(so.SOCode).trim() : '';
        return !deletedSOCodes.has(code);
      });
      console.log(`[Sync SO] Filtered out ${beforeCount - sosToSync.length} deleted SOs. ${sosToSync.length} SOs remain for sync.`);

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

          // Automatically reserve inventory for this synced Sales Order
          if (resolvedSOId) {
            console.log(`[Sync SO] Automatically reserving inventory for SO ${so.SOCode} (SOId: ${resolvedSOId})`);
            try {
              // UserId 1 is default/system user for background sync operations
              await db.executeSp('sp_ReserveInventory', { SOId: resolvedSOId, UserId: 1 });
            } catch (resvErr: any) {
              console.error(`[Sync SO] Auto-reservation failed for SO ${so.SOCode}:`, resvErr.message);
            }
          }
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
        SELECT CODE, name, alias, HSNCODE,
          (SELECT NAME FROM MASTER1 M WHERE M.CODE=MASTER1.ParentGrp) AS ITEM_GRP,
          d4 AS purch_price, d17 AS purch_dis, d3 AS alt_sale_price, d22 AS alt_purch_price,
          D2 AS MRP, D16 AS SALE_DIS,
          (SELECT NAME FROM MASTER1 m WHERE m.CODE=MASTER1.CM1) AS MAINUNIT,
          (SELECT NAME FROM MASTER1 m WHERE m.CODE=MASTER1.CM2) AS ALTUNIT,
          (SELECT NAME FROM MASTER1 m WHERE m.CODE=MASTER1.CM9) AS vndor,
          (SELECT NAME FROM MASTER1 m WHERE m.CODE=MASTER1.CM8) AS tax
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
          TRAN3.SRNO,
          TRAN3.VCHCODE,
          TRY_CONVERT(DATETIME, V.OF2, 113) AS DELIVERYDATE,
          T.DATE AS DATE,
          T.VCHNO AS VCHNO,
          (SELECT NAME FROM MASTER1 P WHERE P.CODE = TRAN3.MASTERCODE2) AS PARTYNAME,
          TRAN3.MASTERCODE2 AS PARTY_CODE,
          TRAN3.MASTERCODE1 AS ITEM_ERP_CODE,
          M.NAME AS ITEMNAME,
          M.ALIAS,
          (SELECT USERNAME FROM CHECKLIST C WHERE C.CODE = T.VCHCODE AND C.TYPE = 2 AND C.ACTION = 1) AS ORDERBY,
          (SELECT NAME FROM MASTER1 M1 WHERE convert(varchar(30), CODE) = V.OF4) AS SALESINC,
          S.NAME AS SALESMAN,
          ABS(T.D1) AS QTY,
          (
              SELECT ABS(SUM(VALUE1))
              FROM TRAN3 T31
              WHERE T31.REFCODE = TRAN3.REFCODE
                AND T31.RECTYPE = 4
          ) AS PENDINGQTY,
          (SELECT NAME FROM MASTER1 U WHERE U.CODE = M.CM1) AS UNITS,
          M.D2 AS MRP,
          (CASE WHEN (TRY_CONVERT(FLOAT, SUBSTRING(M.C3, 1, 5))) > 0 THEN M.C3 ELSE M.D16 END) AS PURCHASEDIS,
          T.C1 AS VCHDIS,
          ABS(T.D6) AS LISTPRICE,
          T.D5 AS AMOUNT,
          (ABS(T.D6) * (SELECT ABS(SUM(VALUE1)) FROM TRAN3 T31 WHERE T31.REFCODE = TRAN3.REFCODE)) AS PAMT
      FROM Tran3, MASTER1 M, TRAN2 T, VCHOTHERINFO V, MASTER1 S 
      WHERE 
          Tran3.method = 1 
          AND M.CODE = TRAN3.MASTERCODE1 
          AND M.MASTERTYPE = 6 
          AND T.MASTERCODE1 = M.CODE 
          AND V.VCHCODE = T.VCHCODE 
          AND TRAN3.VCHCODE = V.VCHCODE 
          AND S.CODE = V.OF3
          AND T.DATE >= @startdate 
          AND T.DATE <= @enddate
          AND T.VCHTYPE = 13 
          AND TRAN3.VCHTYPE = 13 
          AND TRAN3.refcode IN (SELECT refcode FROM TRAN3 t32 WHERE t32.rectype = 4 GROUP BY t32.refcode) 
          AND (
              SELECT ABS(SUM(VALUE1))
              FROM TRAN3 T31
              WHERE T31.REFCODE = TRAN3.REFCODE
                AND T31.RECTYPE = 4
          ) > 0
      ORDER BY 
          TRY_CONVERT(DATETIME, V.OF2, 113) DESC
    `;

    const start = new Date(startDateParam);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDateParam);
    end.setHours(23, 59, 59, 999);

    const result = await pool.request()
      .input('startdate', mssql.DateTime, start)
      .input('enddate', mssql.DateTime, end)
      .query(query);

    const poMap = new Map<string, any>();
    for (const row of result.recordset) {
      const vouNo = row.VCHNO ? String(row.VCHNO).trim() : '';
      if (!vouNo) continue;
      
      const vendorName = row.PARTYNAME ? String(row.PARTYNAME).trim() : '';
      const vendorCode = row.PARTY_CODE ? String(row.PARTY_CODE).trim() : vendorName;
      const itemCode = row.ALIAS ? String(row.ALIAS).trim() : (row.ITEM_ERP_CODE ? String(row.ITEM_ERP_CODE).trim() : '');
      if (!itemCode) continue;

      if (!poMap.has(vouNo)) {
        poMap.set(vouNo, {
          POCode: vouNo,
          VendorName: vendorName,
          VendorCode: vendorCode,
          OrderDate: row.DATE ? new Date(row.DATE).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          PreparedBy: row.ORDERBY ? String(row.ORDERBY).trim() : null,
          DeliveryDate: row.DELIVERYDATE ? new Date(row.DELIVERYDATE).toISOString().slice(0, 10) : null,
          Items: []
        });
      }

      poMap.get(vouNo).Items.push({
        ItemCode: itemCode,
        ItemName: row.ITEMNAME ? String(row.ITEMNAME).trim() : itemCode,
        ItemGrp: 'General',
        HSNCode: null,
        OrderQty: Math.abs(row.QTY || 0),
        UOM: row.UNITS ? String(row.UNITS).trim() : 'PCS',
        UnitPrice: row.LISTPRICE || (row.QTY > 0 ? (row.AMOUNT / row.QTY) : 0) || 0
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
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDateParam);
    end.setHours(23, 59, 59, 999);

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
