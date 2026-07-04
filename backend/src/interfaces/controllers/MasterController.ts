import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';
import bcrypt from 'bcryptjs';

export class MasterController {
  
  // ==========================================
  // WAREHOUSE CRUD
  // ==========================================
  public static async getWarehouses(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query('SELECT * FROM tblWarehouse ORDER BY WarehouseId DESC');
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async createWarehouse(req: AuthenticatedRequest, res: Response) {
    const { code, name, address, companyId } = req.body;
    if (!code || !name) return res.status(400).json({ message: 'Code and Name are required' });
    try {
      await db.executeCmd(`
        INSERT INTO tblWarehouse (CompanyId, Code, Name, Address, IsActive)
        VALUES (@companyId, @code, @name, @address, 1)
      `, { companyId: companyId || 'COMP01', code, name, address: address || null });
      return res.status(201).json({ message: 'Warehouse created successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // ZONE CRUD
  // ==========================================
  public static async getZones(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT z.*, w.Name AS WarehouseName 
        FROM tblZone z
        INNER JOIN tblWarehouse w ON z.WarehouseId = w.WarehouseId
        ORDER BY z.ZoneId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async createZone(req: AuthenticatedRequest, res: Response) {
    const { warehouseId, code, name } = req.body;
    if (!warehouseId || !code || !name) return res.status(400).json({ message: 'Missing fields' });
    try {
      await db.executeCmd(`
        INSERT INTO tblZone (WarehouseId, Code, Name, IsActive)
        VALUES (@warehouseId, @code, @name, 1)
      `, { warehouseId, code, name });
      return res.status(201).json({ message: 'Zone created' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // BIN CRUD
  // ==========================================
  public static async getBins(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string || '0', 10);
      const limit = parseInt(req.query.limit as string || '50', 10);
      
      let rows;
      if (req.query.page && req.query.limit) {
        const offset = page * limit;
        rows = await db.query(`
          SELECT b.*, s.Code AS ShelfCode, r.Code AS RackCode, z.Code AS ZoneCode, w.Code AS WarehouseCode
          FROM tblBin b
          INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
          INNER JOIN tblRack r ON s.RackId = r.RackId
          INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
          INNER JOIN tblWarehouse w ON z.WarehouseId = w.WarehouseId
          ORDER BY b.BinId DESC
          LIMIT @limit OFFSET @offset
        `, { limit, offset });
      } else {
        rows = await db.query(`
          SELECT b.*, s.Code AS ShelfCode, r.Code AS RackCode, z.Code AS ZoneCode, w.Code AS WarehouseCode
          FROM tblBin b
          INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
          INNER JOIN tblRack r ON s.RackId = r.RackId
          INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
          INNER JOIN tblWarehouse w ON z.WarehouseId = w.WarehouseId
          ORDER BY b.BinId DESC
        `);
      }
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async createBin(req: AuthenticatedRequest, res: Response) {
    const { shelfId, code, barcode, capacityWeight, capacityVolume } = req.body;
    if (!shelfId || !code || !barcode) return res.status(400).json({ message: 'Missing fields' });
    try {
      await db.executeCmd(`
        INSERT INTO tblBin (ShelfId, Code, Barcode, CapacityWeight, CapacityVolume, OccupiedWeight, OccupiedVolume, IsActive)
        VALUES (@shelfId, @code, @barcode, @capacityWeight, @capacityVolume, 0, 0, 1)
      `, { shelfId, code, barcode, capacityWeight: capacityWeight || 1000, capacityVolume: capacityVolume || 500 });
      return res.status(201).json({ message: 'Bin created' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // ITEM CRUD
  // ==========================================
  public static async getItems(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string || '0', 10);
      const limit = parseInt(req.query.limit as string || '50', 10);
      const search = (req.query.search as string || '').trim();
      const inBinsOnly = req.query.inBinsOnly === 'true';

      let whereClause = 'WHERE 1=1';
      const params: Record<string, any> = {};

      if (search) {
        whereClause += ' AND (i.Name LIKE @searchPattern OR i.Code LIKE @searchPattern OR i.Alias LIKE @searchPattern OR i.HSNCode LIKE @searchPattern OR i.Category LIKE @searchPattern)';
        params.searchPattern = `%${search}%`;
      }

      let fromClause = 'tblItem i';
      if (inBinsOnly) {
        fromClause += ' INNER JOIN tblInventory inv ON i.ItemId = inv.ItemId';
        whereClause += ' AND inv.Quantity > 0';
      }

      // Check if paginated or full list requested
      const isPaginated = req.query.page !== undefined;

      if (isPaginated) {
        const offset = page * limit;
        params.limit = limit;
        params.offset = offset;

        // Query total
        const countQuery = `SELECT COUNT(DISTINCT i.ItemId) AS total FROM ${fromClause} ${whereClause}`;
        const countRows = await db.query(countQuery, params);
        const total = countRows.length > 0 ? countRows[0].total : 0;

        // Query paginated items
        const selectQuery = `
          SELECT DISTINCT i.* 
          FROM ${fromClause} 
          ${whereClause} 
          ORDER BY i.ItemId DESC 
          LIMIT @limit OFFSET @offset
        `;
        const items = await db.query(selectQuery, params);

        return res.json({ items, total });
      } else {
        // Query full list
        const selectQuery = `
          SELECT DISTINCT i.* 
          FROM ${fromClause} 
          ${whereClause} 
          ORDER BY i.ItemId DESC
        `;
        const items = await db.query(selectQuery, params);
        return res.json(items);
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async createItem(req: AuthenticatedRequest, res: Response) {
    const { code, name, description, category, brand, uom, barcode, trackBatch, trackSerial, minStock, maxStock, weight, volume } = req.body;
    if (!code || !name || !uom) return res.status(400).json({ message: 'Code, Name and UOM are required' });
    try {
      await db.executeCmd(`
        INSERT INTO tblItem (Code, Name, Description, Category, Brand, UOM, Barcode, TrackBatch, TrackSerial, MinStock, MaxStock, Weight, Volume, IsActive)
        VALUES (@code, @name, @description, @category, @brand, @uom, @barcode, @trackBatch, @trackSerial, @minStock, @maxStock, @weight, @volume, 1)
      `, {
        code, name, description: description || null, category: category || null, brand: brand || null, uom, 
        barcode: barcode || null, trackBatch: trackBatch ? 1 : 0, trackSerial: trackSerial ? 1 : 0, 
        minStock: minStock || 0, maxStock: maxStock || 999999,
        weight: weight !== undefined && weight !== null ? Number(weight) : 0.0,
        volume: volume !== undefined && volume !== null ? Number(volume) : 0.0
      });
      return res.status(201).json({ message: 'Item created' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // RACK & SHELF
  // ==========================================
  public static async getRacks(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT r.*, z.Code AS ZoneCode, w.Code AS WarehouseCode, z.Name AS ZoneName, w.Name AS WarehouseName, a.Code AS AisleCode, a.Name AS AisleName
        FROM tblRack r
        INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
        INNER JOIN tblWarehouse w ON z.WarehouseId = w.WarehouseId
        LEFT JOIN tblAisle a ON r.AisleId = a.AisleId
        ORDER BY r.RackId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async createRack(req: AuthenticatedRequest, res: Response) {
    const { zoneId, aisleId, code, name } = req.body;
    if (!zoneId || !code || !name) return res.status(400).json({ message: 'Missing fields' });
    try {
      await db.executeCmd(`
        INSERT INTO tblRack (ZoneId, AisleId, Code, Name, IsActive)
        VALUES (@zoneId, @aisleId, @code, @name, 1)
      `, { zoneId, aisleId: aisleId || null, code, name });
      return res.status(201).json({ message: 'Rack created' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getShelves(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT s.*, r.Code AS RackCode, z.Code AS ZoneCode, r.Name AS RackName
        FROM tblShelf s
        INNER JOIN tblRack r ON s.RackId = r.RackId
        INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
        ORDER BY s.ShelfId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async createShelf(req: AuthenticatedRequest, res: Response) {
    const { rackId, code, name } = req.body;
    if (!rackId || !code || !name) return res.status(400).json({ message: 'Missing fields' });
    try {
      await db.executeCmd(`
        INSERT INTO tblShelf (RackId, Code, Name, IsActive)
        VALUES (@rackId, @code, @name, 1)
      `, { rackId, code, name });
      return res.status(201).json({ message: 'Shelf created' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // BATCH & SERIALS
  // ==========================================
  public static async getBatches(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT b.*, i.Name AS ItemName, i.Code AS ItemCode 
        FROM tblBatch b
        INNER JOIN tblItem i ON b.ItemId = i.ItemId
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getSerials(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT s.*, i.Name AS ItemName, i.Code AS ItemCode, b.BatchNumber
        FROM tblSerialNo s
        INNER JOIN tblItem i ON s.ItemId = i.ItemId
        LEFT JOIN tblBatch b ON s.BatchId = b.BatchId
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // ROLES & USERS
  // ==========================================
  public static async getRoles(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query('SELECT * FROM tblRole');
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getUsers(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT u.UserId, u.Username, u.Email, u.FullName, u.WarehouseId, u.IsActive, u.CreatedAt, r.RoleName
        FROM tblUser u
        INNER JOIN tblRole r ON u.RoleId = r.RoleId
        ORDER BY u.UserId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // WAREHOUSE UPDATE & DELETE
  // ==========================================
  public static async updateWarehouse(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { code, name, address, isActive } = req.body;
    if (!code || !name) return res.status(400).json({ message: 'Code and Name are required' });
    try {
      const activeVal = isActive === false ? 0 : 1;
      const result = await db.executeCmd(`
        UPDATE tblWarehouse 
        SET Code = @code, Name = @name, Address = @address, IsActive = @activeVal 
        WHERE WarehouseId = @id
      `, { code, name, address: address || null, activeVal, id });
      
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Warehouse not found' });
      }
      return res.json({ message: 'Warehouse updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteWarehouse(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const zones = await db.query('SELECT COUNT(*) AS count FROM tblZone WHERE WarehouseId = @id', { id });
      if (zones[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete warehouse because it contains zones.' });
      }
      
      const inv = await db.query('SELECT COUNT(*) AS count FROM tblInventory WHERE WarehouseId = @id AND Quantity > 0', { id });
      if (inv[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete warehouse because it has active stock.' });
      }

      const users = await db.query('SELECT COUNT(*) AS count FROM tblUser WHERE WarehouseId = @id', { id });
      if (users[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete warehouse because it is assigned to users.' });
      }

      const result = await db.executeCmd('DELETE FROM tblWarehouse WHERE WarehouseId = @id', { id });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Warehouse not found' });
      }
      return res.json({ message: 'Warehouse deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // ZONE UPDATE & DELETE
  // ==========================================
  public static async updateZone(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { warehouseId, code, name, isActive } = req.body;
    if (!warehouseId || !code || !name) return res.status(400).json({ message: 'Missing fields' });
    try {
      const activeVal = isActive === false ? 0 : 1;
      const result = await db.executeCmd(`
        UPDATE tblZone 
        SET WarehouseId = @warehouseId, Code = @code, Name = @name, IsActive = @activeVal 
        WHERE ZoneId = @id
      `, { warehouseId, code, name, activeVal, id });
      
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Zone not found' });
      }
      return res.json({ message: 'Zone updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteZone(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const racks = await db.query('SELECT COUNT(*) AS count FROM tblRack WHERE ZoneId = @id', { id });
      if (racks[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete zone because it contains racks.' });
      }

      const inv = await db.query('SELECT COUNT(*) AS count FROM tblInventory WHERE ZoneId = @id AND Quantity > 0', { id });
      if (inv[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete zone because it has active stock.' });
      }

      const result = await db.executeCmd('DELETE FROM tblZone WHERE ZoneId = @id', { id });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Zone not found' });
      }
      return res.json({ message: 'Zone deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // RACK UPDATE & DELETE
  // ==========================================
  public static async updateRack(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { zoneId, aisleId, code, name, isActive } = req.body;
    if (!zoneId || !code || !name) return res.status(400).json({ message: 'Missing fields' });
    try {
      const activeVal = isActive === false ? 0 : 1;
      const result = await db.executeCmd(`
        UPDATE tblRack 
        SET ZoneId = @zoneId, AisleId = @aisleId, Code = @code, Name = @name, IsActive = @activeVal 
        WHERE RackId = @id
      `, { zoneId, aisleId: aisleId || null, code, name, activeVal, id });
      
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Rack not found' });
      }
      return res.json({ message: 'Rack updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteRack(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const shelves = await db.query('SELECT COUNT(*) AS count FROM tblShelf WHERE RackId = @id', { id });
      if (shelves[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete rack because it contains shelves.' });
      }

      const result = await db.executeCmd('DELETE FROM tblRack WHERE RackId = @id', { id });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Rack not found' });
      }
      return res.json({ message: 'Rack deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // SHELF UPDATE & DELETE
  // ==========================================
  public static async updateShelf(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { rackId, code, name, isActive } = req.body;
    if (!rackId || !code || !name) return res.status(400).json({ message: 'Missing fields' });
    try {
      const activeVal = isActive === false ? 0 : 1;
      const result = await db.executeCmd(`
        UPDATE tblShelf 
        SET RackId = @rackId, Code = @code, Name = @name, IsActive = @activeVal 
        WHERE ShelfId = @id
      `, { rackId, code, name, activeVal, id });
      
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Shelf not found' });
      }
      return res.json({ message: 'Shelf updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteShelf(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const bins = await db.query('SELECT COUNT(*) AS count FROM tblBin WHERE ShelfId = @id', { id });
      if (bins[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete shelf because it contains bins.' });
      }

      const result = await db.executeCmd('DELETE FROM tblShelf WHERE ShelfId = @id', { id });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Shelf not found' });
      }
      return res.json({ message: 'Shelf deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // BIN UPDATE & DELETE
  // ==========================================
  public static async updateBin(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { shelfId, code, barcode, capacityWeight, capacityVolume, isActive } = req.body;
    if (!shelfId || !code || !barcode) return res.status(400).json({ message: 'Missing fields' });
    try {
      const activeVal = isActive === false ? 0 : 1;
      const result = await db.executeCmd(`
        UPDATE tblBin 
        SET ShelfId = @shelfId, Code = @code, Barcode = @barcode, 
            CapacityWeight = @capacityWeight, CapacityVolume = @capacityVolume, IsActive = @activeVal 
        WHERE BinId = @id
      `, { shelfId, code, barcode, capacityWeight: capacityWeight || 1000, capacityVolume: capacityVolume || 500, activeVal, id });
      
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Bin not found' });
      }
      return res.json({ message: 'Bin updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteBin(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const inv = await db.query('SELECT COUNT(*) AS count FROM tblInventory WHERE BinId = @id AND Quantity > 0', { id });
      if (inv[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete bin because it has active stock.' });
      }

      const putaways = await db.query('SELECT COUNT(*) AS count FROM tblPutaway WHERE BinId = @id', { id });
      if (putaways[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete bin because it is referenced in putaway transactions.' });
      }

      const reservations = await db.query('SELECT COUNT(*) AS count FROM tblReservation WHERE BinId = @id', { id });
      if (reservations[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete bin because it has reserved stock.' });
      }

      const result = await db.executeCmd('DELETE FROM tblBin WHERE BinId = @id', { id });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Bin not found' });
      }
      return res.json({ message: 'Bin deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // ITEM UPDATE & DELETE
  // ==========================================
  public static async updateItem(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { 
      code, name, description, category, brand, uom, barcode, 
      trackBatch, trackSerial, minStock, maxStock, unitCost, sellingPrice, weight, volume, isActive 
    } = req.body;
    if (!code || !name || !uom) return res.status(400).json({ message: 'Code, Name and UOM are required' });
    try {
      const activeVal = isActive === false ? 0 : 1;
      const result = await db.executeCmd(`
        UPDATE tblItem 
        SET Code = @code, Name = @name, Description = @description, Category = @category, 
            Brand = @brand, UOM = @uom, Barcode = @barcode, 
            TrackBatch = @trackBatch, TrackSerial = @trackSerial, 
            MinStock = @minStock, MaxStock = @maxStock, 
            UnitCost = @unitCost, SellingPrice = @sellingPrice, 
            Weight = @weight, Volume = @volume, IsActive = @activeVal,
            UpdatedAt = CURRENT_TIMESTAMP
        WHERE ItemId = @id
      `, {
        code, name, description: description || null, category: category || null, brand: brand || null, uom, 
        barcode: barcode || null, trackBatch: trackBatch ? 1 : 0, trackSerial: trackSerial ? 1 : 0, 
        minStock: minStock || 0, maxStock: maxStock || 999999,
        unitCost: unitCost || 0.0, sellingPrice: sellingPrice || 0.0,
        weight: weight !== undefined && weight !== null ? Number(weight) : 0.0,
        volume: volume !== undefined && volume !== null ? Number(volume) : 0.0,
        activeVal, id
      });
      
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Item not found' });
      }
      return res.json({ message: 'Item updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteItem(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const inv = await db.query('SELECT COUNT(*) AS count FROM tblInventory WHERE ItemId = @id AND Quantity > 0', { id });
      if (inv[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete item because it has active stock.' });
      }

      const grns = await db.query('SELECT COUNT(*) AS count FROM tblGRNDetail WHERE ItemId = @id', { id });
      if (grns[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete item because it is referenced in GRN details.' });
      }

      const pos = await db.query('SELECT COUNT(*) AS count FROM tblPurchaseOrderDetail WHERE ItemId = @id', { id });
      if (pos[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete item because it is referenced in Purchase Orders.' });
      }

      const sos = await db.query('SELECT COUNT(*) AS count FROM tblSalesOrderDetail WHERE ItemId = @id', { id });
      if (sos[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete item because it is referenced in Sales Orders.' });
      }

      const result = await db.executeCmd('DELETE FROM tblItem WHERE ItemId = @id', { id });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Item not found' });
      }
      return res.json({ message: 'Item deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // USER UPDATE & DELETE
  // ==========================================
  public static async updateUser(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { username, email, fullName, roleName, warehouseId, isActive, password } = req.body;
    if (!username || !email || !roleName || !fullName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    try {
      const roles = await db.query('SELECT RoleId FROM tblRole WHERE RoleName = @roleName', { roleName });
      if (roles.length === 0) {
        return res.status(400).json({ message: 'Invalid role name' });
      }
      const roleId = roles[0].RoleId;
      const activeVal = isActive === false ? 0 : 1;

      let result;
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        result = await db.executeCmd(`
          UPDATE tblUser 
          SET Username = @username, Email = @email, PasswordHash = @hashedPassword, 
              RoleId = @roleId, FullName = @fullName, WarehouseId = @warehouseId, IsActive = @activeVal,
              UpdatedAt = CURRENT_TIMESTAMP
          WHERE UserId = @id
        `, { username, email, hashedPassword, roleId, fullName, warehouseId: warehouseId || null, activeVal, id });
      } else {
        result = await db.executeCmd(`
          UPDATE tblUser 
          SET Username = @username, Email = @email, RoleId = @roleId, 
              FullName = @fullName, WarehouseId = @warehouseId, IsActive = @activeVal,
              UpdatedAt = CURRENT_TIMESTAMP
          WHERE UserId = @id
        `, { username, email, roleId, fullName, warehouseId: warehouseId || null, activeVal, id });
      }

      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      return res.json({ message: 'User updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteUser(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    if (req.user && req.user.userId === Number(id)) {
      return res.status(400).json({ message: 'Cannot delete your own user account.' });
    }
    try {
      const grns = await db.query('SELECT COUNT(*) AS count FROM tblGRN WHERE ReceivedBy = @id', { id });
      if (grns[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete user because they have received GRNs.' });
      }

      const qcs = await db.query('SELECT COUNT(*) AS count FROM tblQC WHERE CheckedBy = @id', { id });
      if (qcs[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete user because they have performed QCs.' });
      }

      const putaways = await db.query('SELECT COUNT(*) AS count FROM tblPutaway WHERE PutawayBy = @id', { id });
      if (putaways[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete user because they have performed putaways.' });
      }

      const picklists = await db.query('SELECT COUNT(*) AS count FROM tblPickList WHERE CreatedBy = @id OR AssignedTo = @id', { id });
      if (picklists[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete user because they are associated with picking lists.' });
      }

      const result = await db.executeCmd('DELETE FROM tblUser WHERE UserId = @id', { id });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      return res.json({ message: 'User deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // SUPPLIER / CUSTOMER LOOKUPS
  // ==========================================
  
  public static async getSuppliers(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string || '0', 10);
      const limit = parseInt(req.query.limit as string || '50', 10);
      const search = (req.query.search as string || '').trim();

      let whereClause = 'WHERE 1=1';
      const params: Record<string, any> = {};

      if (search) {
        whereClause += ' AND (s.Name LIKE @searchPattern OR s.Code LIKE @searchPattern OR s.GSTIN LIKE @searchPattern OR s.Station LIKE @searchPattern OR s.State LIKE @searchPattern OR s.Mobile LIKE @searchPattern)';
        params.searchPattern = `%${search}%`;
      }

      // Check if paginated or full list requested
      const isPaginated = req.query.page !== undefined;

      if (isPaginated) {
        const offset = page * limit;
        params.limit = limit;
        params.offset = offset;

        // Query total
        const countQuery = `SELECT COUNT(SupplierId) AS total FROM tblSupplier s ${whereClause}`;
        const countRows = await db.query(countQuery, params);
        const total = countRows.length > 0 ? countRows[0].total : 0;

        // Query paginated suppliers
        const selectQuery = `
          SELECT s.* 
          FROM tblSupplier s 
          ${whereClause} 
          ORDER BY s.SupplierId DESC 
          LIMIT @limit OFFSET @offset
        `;
        const items = await db.query(selectQuery, params);

        return res.json({ items, total });
      } else {
        // Query full list
        const selectQuery = `
          SELECT s.* 
          FROM tblSupplier s 
          ${whereClause} 
          ORDER BY s.Name ASC
        `;
        const items = await db.query(selectQuery, params);
        return res.json(items);
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async getCustomers(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string || '0', 10);
      const limit = parseInt(req.query.limit as string || '50', 10);
      const search = (req.query.search as string || '').trim();

      let whereClause = 'WHERE 1=1';
      const params: Record<string, any> = {};

      if (search) {
        whereClause += ' AND (c.Name LIKE @searchPattern OR c.Code LIKE @searchPattern OR c.GSTIN LIKE @searchPattern OR c.Station LIKE @searchPattern OR c.State LIKE @searchPattern OR c.Mobile LIKE @searchPattern)';
        params.searchPattern = `%${search}%`;
      }

      // Check if paginated or full list requested
      const isPaginated = req.query.page !== undefined;

      if (isPaginated) {
        const offset = page * limit;
        params.limit = limit;
        params.offset = offset;

        // Query total
        const countQuery = `SELECT COUNT(CustomerId) AS total FROM tblCustomer c ${whereClause}`;
        const countRows = await db.query(countQuery, params);
        const total = countRows.length > 0 ? countRows[0].total : 0;

        // Query paginated customers
        const selectQuery = `
          SELECT c.* 
          FROM tblCustomer c 
          ${whereClause} 
          ORDER BY c.CustomerId DESC 
          LIMIT @limit OFFSET @offset
        `;
        const items = await db.query(selectQuery, params);

        return res.json({ items, total });
      } else {
        // Query full list
        const selectQuery = `
          SELECT c.* 
          FROM tblCustomer c 
          ${whereClause} 
          ORDER BY c.Name ASC
        `;
        const items = await db.query(selectQuery, params);
        return res.json(items);
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // ==========================================
  // AISLE CRUD
  // ==========================================
  public static async getAisles(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT a.*, z.Code AS ZoneCode, w.Code AS WarehouseCode, z.Name AS ZoneName, w.Name AS WarehouseName
        FROM tblAisle a
        INNER JOIN tblZone z ON a.ZoneId = z.ZoneId
        INNER JOIN tblWarehouse w ON z.WarehouseId = w.WarehouseId
        ORDER BY a.AisleId DESC
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async createAisle(req: AuthenticatedRequest, res: Response) {
    const { zoneId, code, name } = req.body;
    if (!zoneId || !code || !name) return res.status(400).json({ message: 'Missing fields' });
    try {
      await db.executeCmd(`
        INSERT INTO tblAisle (ZoneId, Code, Name, IsActive)
        VALUES (@zoneId, @code, @name, 1)
      `, { zoneId, code, name });
      return res.status(201).json({ message: 'Aisle created successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async updateAisle(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { zoneId, code, name, isActive } = req.body;
    if (!zoneId || !code || !name) return res.status(400).json({ message: 'Missing fields' });
    try {
      const act = isActive === false ? 0 : 1;
      const result = await db.executeCmd(`
        UPDATE tblAisle SET ZoneId = @zoneId, Code = @code, Name = @name, IsActive = @act
        WHERE AisleId = @id
      `, { zoneId, code, name, act, id });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Aisle not found' });
      }
      return res.json({ message: 'Aisle updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteAisle(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const racks = await db.query('SELECT COUNT(*) AS count FROM tblRack WHERE AisleId = @id', { id });
      if (racks[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete Aisle because it is associated with racks.' });
      }
      const result = await db.executeCmd('DELETE FROM tblAisle WHERE AisleId = @id', { id });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ message: 'Aisle not found' });
      }
      return res.json({ message: 'Aisle deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // CUSTOMER CRUD
  public static async createCustomer(req: AuthenticatedRequest, res: Response) {
    const { code, name, parentGrp, alias, mobile, email, add1, add2, add3, add4, gstin, station, country, pincode, state } = req.body;
    if (!code || !name) return res.status(400).json({ message: 'Code and Name are required' });
    try {
      await db.executeCmd(`
        INSERT INTO tblCustomer (Code, Name, ParentGrp, Alias, Mobile, Email, Add1, Add2, Add3, Add4, GSTIN, Station, Country, Pincode, State, IsActive)
        VALUES (@code, @name, @parentGrp, @alias, @mobile, @email, @add1, @add2, @add3, @add4, @gstin, @station, @country, @pincode, @state, 1)
      `, { code, name, parentGrp, alias, mobile, email, add1, add2, add3, add4, gstin, station, country, pincode, state });
      return res.status(201).json({ message: 'Customer created successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async updateCustomer(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { name, parentGrp, alias, mobile, email, add1, add2, add3, add4, gstin, station, country, pincode, state, isActive } = req.body;
    try {
      await db.executeCmd(`
        UPDATE tblCustomer 
        SET Name = @name, ParentGrp = @parentGrp, Alias = @alias, Mobile = @mobile, Email = @email,
            Add1 = @add1, Add2 = @add2, Add3 = @add3, Add4 = @add4, GSTIN = @gstin,
            Station = @station, Country = @country, Pincode = @pincode, State = @state,
            IsActive = @isActive
        WHERE CustomerId = @id
      `, { id, name, parentGrp, alias, mobile, email, add1, add2, add3, add4, gstin, station, country, pincode, state, isActive: isActive ? 1 : 0 });
      return res.json({ message: 'Customer updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteCustomer(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      await db.executeCmd('DELETE FROM tblCustomer WHERE CustomerId = @id', { id });
      return res.json({ message: 'Customer deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // SUPPLIER CRUD
  public static async createSupplier(req: AuthenticatedRequest, res: Response) {
    const { code, name, parentGrp, alias, mobile, email, add1, add2, add3, add4, gstin, station, country, pincode, state } = req.body;
    if (!code || !name) return res.status(400).json({ message: 'Code and Name are required' });
    try {
      await db.executeCmd(`
        INSERT INTO tblSupplier (Code, Name, ParentGrp, Alias, Mobile, Email, Add1, Add2, Add3, Add4, GSTIN, Station, Country, Pincode, State, IsActive)
        VALUES (@code, @name, @parentGrp, @alias, @mobile, @email, @add1, @add2, @add3, @add4, @gstin, @station, @country, @pincode, @state, 1)
      `, { code, name, parentGrp, alias, mobile, email, add1, add2, add3, add4, gstin, station, country, pincode, state });
      return res.status(201).json({ message: 'Supplier created successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async updateSupplier(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { name, parentGrp, alias, mobile, email, add1, add2, add3, add4, gstin, station, country, pincode, state, isActive } = req.body;
    try {
      await db.executeCmd(`
        UPDATE tblSupplier 
        SET Name = @name, ParentGrp = @parentGrp, Alias = @alias, Mobile = @mobile, Email = @email,
            Add1 = @add1, Add2 = @add2, Add3 = @add3, Add4 = @add4, GSTIN = @gstin,
            Station = @station, Country = @country, Pincode = @pincode, State = @state,
            IsActive = @isActive
        WHERE SupplierId = @id
      `, { id, name, parentGrp, alias, mobile, email, add1, add2, add3, add4, gstin, station, country, pincode, state, isActive: isActive ? 1 : 0 });
      return res.json({ message: 'Supplier updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteSupplier(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      await db.executeCmd('DELETE FROM tblSupplier WHERE SupplierId = @id', { id });
      return res.json({ message: 'Supplier deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
}
