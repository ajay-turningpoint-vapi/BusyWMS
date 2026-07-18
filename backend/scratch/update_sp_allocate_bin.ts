import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function updateSp() {
  try {
    await db.connect();
    console.log('Connected to database.');

    console.log('Dropping existing sp_AllocateBinForPutaway procedure...');
    await db.query('DROP PROCEDURE IF EXISTS sp_AllocateBinForPutaway');

    console.log('Creating sp_AllocateBinForPutaway procedure with MaxQtyItCanTake...');
    await db.query(`
      CREATE PROCEDURE sp_AllocateBinForPutaway(
          IN p_ItemId INT,
          IN p_Qty DECIMAL(18,3),
          IN p_PreferredWarehouseId INT
      )
      BEGIN
          DECLARE v_ItemWeight DECIMAL(18,3);
          DECLARE v_ItemVolume DECIMAL(18,3);
          
          SELECT 
              CASE WHEN COALESCE(Weight, 0) > 0 THEN Weight ELSE 2.0 END,
              CASE WHEN COALESCE(Volume, 0) > 0 THEN Volume ELSE 1.5 END
          INTO v_ItemWeight, v_ItemVolume
          FROM tblItem WHERE ItemId = p_ItemId;

          SET @ReqWeight = p_Qty * v_ItemWeight;
          SET @ReqVolume = p_Qty * v_ItemVolume;

          SELECT 
              b.BinId,
              b.Code AS BinCode,
              b.Barcode AS BinBarcode,
              (b.CapacityWeight - b.OccupiedWeight) AS AvailableWeight,
              (b.CapacityVolume - b.OccupiedVolume) AS AvailableVolume,
              w.Name AS WarehouseName,
              z.Name AS ZoneName,
              IF(EXISTS(
                  SELECT 1 FROM tblInventory i2 WHERE i2.BinId = b.BinId AND i2.ItemId = p_ItemId
              ), 1, 0) AS HasExistingStock,
              FLOOR(LEAST(
                  (b.CapacityWeight - b.OccupiedWeight) / v_ItemWeight,
                  (b.CapacityVolume - b.OccupiedVolume) / v_ItemVolume
              )) AS MaxQtyItCanTake
          FROM tblBin b
          INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
          INNER JOIN tblRack r  ON s.RackId = r.RackId
          INNER JOIN tblZone z  ON r.ZoneId = z.ZoneId
          INNER JOIN tblWarehouse w ON z.WarehouseId = w.WarehouseId
          WHERE w.WarehouseId = p_PreferredWarehouseId
            AND b.IsActive = 1
            AND (b.CapacityWeight - b.OccupiedWeight) >= v_ItemWeight
            AND (b.CapacityVolume - b.OccupiedVolume) >= v_ItemVolume
            AND NOT EXISTS (
                SELECT 1 
                FROM tblInventory i2 
                WHERE i2.BinId = b.BinId 
                  AND i2.ItemId != p_ItemId 
                  AND i2.Quantity > 0
            )
          ORDER BY HasExistingStock DESC,
                   (b.CapacityWeight - b.OccupiedWeight) ASC
          LIMIT 5;
      END
    `);

    console.log('sp_AllocateBinForPutaway procedure updated successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('Update failed:', err.message || err);
    process.exit(1);
  }
}

updateSp();
