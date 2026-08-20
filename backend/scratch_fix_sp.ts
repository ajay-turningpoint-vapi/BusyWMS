import { db } from './src/config/db';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await db.connect();

  console.log("Dropping existing stored procedure...");
  await db.executeCmd("DROP PROCEDURE IF EXISTS sp_AllocateBinForPutaway");

  console.log("Creating updated stored procedure...");
  const sql = `
    CREATE PROCEDURE sp_AllocateBinForPutaway(
        IN p_ItemId INT,
        IN p_Qty DECIMAL(18,3),
        IN p_PreferredWarehouseId INT
    )
    BEGIN
        DECLARE v_ItemWeight DECIMAL(18,3);
        DECLARE v_ItemVolume DECIMAL(18,3);
        DECLARE v_TotalExistingCapacity DECIMAL(18,3);
        
        SELECT 
            CASE WHEN COALESCE(Weight, 0) > 0 THEN Weight ELSE 2.0 END,
            CASE WHEN COALESCE(Volume, 0) > 0 THEN Volume ELSE 1.5 END
        INTO v_ItemWeight, v_ItemVolume
        FROM tblItem WHERE ItemId = p_ItemId;

        SET @ReqWeight = p_Qty * v_ItemWeight;
        SET @ReqVolume = p_Qty * v_ItemVolume;

        -- Calculate total capacity in existing bins
        SELECT COALESCE(SUM(
            FLOOR(LEAST(
                (b.CapacityWeight - b.OccupiedWeight) / v_ItemWeight,
                (b.CapacityVolume - b.OccupiedVolume) / v_ItemVolume
            ))
        ), 0)
        INTO v_TotalExistingCapacity
        FROM tblBin b
        INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
        INNER JOIN tblRack r  ON s.RackId = r.RackId
        INNER JOIN tblZone z  ON r.ZoneId = z.ZoneId
        INNER JOIN tblWarehouse w ON z.WarehouseId = w.WarehouseId
        WHERE w.WarehouseId = p_PreferredWarehouseId
          AND b.IsActive = 1
          AND (b.CapacityWeight - b.OccupiedWeight) >= v_ItemWeight
          AND (b.CapacityVolume - b.OccupiedVolume) >= v_ItemVolume
          AND EXISTS (
              SELECT 1 FROM tblInventory i2 WHERE i2.BinId = b.BinId AND i2.ItemId = p_ItemId
          );

        IF v_TotalExistingCapacity >= p_Qty THEN
            -- Only return existing bins since they have enough capacity
            SELECT 
                b.BinId,
                b.Code AS BinCode,
                b.Barcode AS BinBarcode,
                (b.CapacityWeight - b.OccupiedWeight) AS AvailableWeight,
                (b.CapacityVolume - b.OccupiedVolume) AS AvailableVolume,
                w.Name AS WarehouseName,
                z.Name AS ZoneName,
                1 AS HasExistingStock,
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
              AND EXISTS (
                  SELECT 1 FROM tblInventory i2 WHERE i2.BinId = b.BinId AND i2.ItemId = p_ItemId
              )
            ORDER BY (b.CapacityWeight - b.OccupiedWeight) ASC
            LIMIT 5;
        ELSE
            -- Return existing bins PLUS up to 5 empty/partially occupied bins (prioritizing empty)
            SELECT * FROM (
                SELECT 
                    b.BinId,
                    b.Code AS BinCode,
                    b.Barcode AS BinBarcode,
                    (b.CapacityWeight - b.OccupiedWeight) AS AvailableWeight,
                    (b.CapacityVolume - b.OccupiedVolume) AS AvailableVolume,
                    w.Name AS WarehouseName,
                    z.Name AS ZoneName,
                    1 AS HasExistingStock,
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
                  AND EXISTS (
                      SELECT 1 FROM tblInventory i2 WHERE i2.BinId = b.BinId AND i2.ItemId = p_ItemId
                  )
                ORDER BY (b.CapacityWeight - b.OccupiedWeight) ASC
                LIMIT 5
            ) AS existing_stock_bins
            
            UNION ALL
            
            SELECT * FROM (
                SELECT 
                    b.BinId,
                    b.Code AS BinCode,
                    b.Barcode AS BinBarcode,
                    (b.CapacityWeight - b.OccupiedWeight) AS AvailableWeight,
                    (b.CapacityVolume - b.OccupiedVolume) AS AvailableVolume,
                    w.Name AS WarehouseName,
                    z.Name AS ZoneName,
                    0 AS HasExistingStock,
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
                      SELECT 1 FROM tblInventory i3 WHERE i3.BinId = b.BinId AND i3.ItemId != p_ItemId AND i3.Quantity > 0
                  )
                ORDER BY 
                  (EXISTS (SELECT 1 FROM tblInventory i2 WHERE i2.BinId = b.BinId AND i2.Quantity > 0)) ASC,
                  (b.CapacityWeight - b.OccupiedWeight) DESC
                LIMIT 2
            ) AS empty_bins
            ORDER BY HasExistingStock DESC, AvailableWeight ASC
            LIMIT 5;
        END IF;
    END
  `;

  await db.executeCmd(sql);
  console.log("Stored procedure sp_AllocateBinForPutaway recreated successfully!");

  // Test the suggestion now
  const suggestions = await db.executeSp('sp_AllocateBinForPutaway', {
    ItemId: 110949,
    Qty: 5.0,
    PreferredWarehouseId: 4
  });
  console.log('Tested Suggestions result after SP fix:', suggestions);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
