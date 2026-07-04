USE BusyWMS;
GO

-- Drop stored procedures if they exist
IF OBJECT_ID('sp_AllocateBinForPutaway', 'P') IS NOT NULL DROP PROCEDURE sp_AllocateBinForPutaway;
IF OBJECT_ID('sp_ReserveInventory', 'P') IS NOT NULL DROP PROCEDURE sp_ReserveInventory;
IF OBJECT_ID('sp_ProcessGRN', 'P') IS NOT NULL DROP PROCEDURE sp_ProcessGRN;
IF OBJECT_ID('sp_ProcessPutaway', 'P') IS NOT NULL DROP PROCEDURE sp_ProcessPutaway;
GO

-- 1. sp_AllocateBinForPutaway: Suggest bins based on REAL item weight/volume from tblItem
-- Phase 2: No longer uses hardcoded 2kg/1.5L constants — reads from tblItem.Weight/Volume
CREATE PROCEDURE sp_AllocateBinForPutaway
    @ItemId INT,
    @Qty DECIMAL(18,4),
    @PreferredWarehouseId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Phase 2 FIX: Read actual item weight/volume; fall back to 2.0/1.5 if not set
    DECLARE @ItemWeight DECIMAL(18,4), @ItemVolume DECIMAL(18,4);
    SELECT 
        @ItemWeight = CASE WHEN COALESCE(Weight, 0) > 0 THEN Weight ELSE 2.0 END,
        @ItemVolume = CASE WHEN COALESCE(Volume, 0) > 0 THEN Volume ELSE 1.5 END
    FROM tblItem WHERE ItemId = @ItemId;

    DECLARE @ReqWeight DECIMAL(18,4) = @Qty * @ItemWeight;
    DECLARE @ReqVolume DECIMAL(18,4) = @Qty * @ItemVolume;

    -- Return top 5 bins with most free capacity first, PLUS bins already stocking this item (consolidation)
    SELECT TOP 5 
        b.BinId,
        b.Code AS BinCode,
        b.Barcode AS BinBarcode,
        (b.CapacityWeight - b.OccupiedWeight) AS AvailableWeight,
        (b.CapacityVolume - b.OccupiedVolume) AS AvailableVolume,
        w.Name AS WarehouseName,
        z.Name AS ZoneName,
        -- Consolidation hint: prefer bins already holding this item
        CASE WHEN EXISTS (
            SELECT 1 FROM tblInventory i2 WHERE i2.BinId = b.BinId AND i2.ItemId = @ItemId
        ) THEN 1 ELSE 0 END AS HasExistingStock
    FROM tblBin b
    INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
    INNER JOIN tblRack r  ON s.RackId = r.RackId
    INNER JOIN tblZone z  ON r.ZoneId = z.ZoneId
    INNER JOIN tblWarehouse w ON z.WarehouseId = w.WarehouseId
    WHERE w.WarehouseId = @PreferredWarehouseId
      AND b.IsActive = 1
      AND (b.CapacityWeight - b.OccupiedWeight) >= @ReqWeight
      AND (b.CapacityVolume - b.OccupiedVolume) >= @ReqVolume
    ORDER BY HasExistingStock DESC,   -- Prefer bins with existing stock for consolidation
             (b.CapacityWeight - b.OccupiedWeight) ASC;  -- Then tightest-fit bin
END;
GO

-- 2. sp_ReserveInventory (Phase 2 REWRITE): Set-based FEFO/FIFO allocation — eliminates nested cursors
-- Previous version used O(n²) nested cursors. This version uses ranked CTE + running totals.
CREATE PROCEDURE sp_ReserveInventory
    @SOId INT,
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    BEGIN TRY
        -- STEP 1: Build a ranked inventory snapshot per item with running cumulative available qty
        -- This gives us FEFO (earliest expiry first) / FIFO (earliest batch/location) ordering
        ;WITH RankedInventory AS (
            SELECT
                i.InventoryId,
                i.BinId,
                i.BatchId,
                i.ItemId,
                (i.Quantity - i.ReservedQty) AS AvailableQty,
                ROW_NUMBER() OVER (
                    PARTITION BY i.ItemId
                    ORDER BY
                        CASE WHEN bat.ExpiryDate IS NULL THEN 1 ELSE 0 END,
                        bat.ExpiryDate ASC,
                        i.BatchId ASC,
                        i.InventoryId ASC
                ) AS RowNum,
                SUM(i.Quantity - i.ReservedQty) OVER (
                    PARTITION BY i.ItemId
                    ORDER BY
                        CASE WHEN bat.ExpiryDate IS NULL THEN 1 ELSE 0 END,
                        bat.ExpiryDate ASC,
                        i.BatchId ASC,
                        i.InventoryId ASC
                    ROWS UNBOUNDED PRECEDING
                ) AS CumulativeAvailable
            FROM tblInventory i
            LEFT JOIN tblBatch bat ON i.BatchId = bat.BatchId
            WHERE (i.Quantity - i.ReservedQty) > 0
        ),
        -- STEP 2: For each SO line, cross with ranked inventory to determine allocation per row
        SOLines AS (
            SELECT SODetailId, ItemId, (OrderQty - ReservedQty) AS PendingQty
            FROM tblSalesOrderDetail
            WHERE SOId = @SOId AND (OrderQty - ReservedQty) > 0
        ),
        Allocations AS (
            SELECT
                sl.SODetailId,
                sl.ItemId,
                ri.InventoryId,
                ri.BinId,
                ri.BatchId,
                -- Allocate: min of this row's available qty vs remaining demand at this row
                CASE
                    WHEN (ri.CumulativeAvailable - ri.AvailableQty) >= sl.PendingQty THEN 0
                    WHEN ri.CumulativeAvailable <= sl.PendingQty THEN ri.AvailableQty
                    ELSE sl.PendingQty - (ri.CumulativeAvailable - ri.AvailableQty)
                END AS AllocateQty
            FROM SOLines sl
            INNER JOIN RankedInventory ri ON ri.ItemId = sl.ItemId
            WHERE (ri.CumulativeAvailable - ri.AvailableQty) < sl.PendingQty  -- Only rows we actually need
        )

        -- STEP 3: Insert Reservations (only for non-zero allocations)
        INSERT INTO tblReservation (SOId, ItemId, BinId, BatchId, Quantity, Status, CreatedAt)
        SELECT @SOId, a.ItemId, a.BinId, a.BatchId, a.AllocateQty, 'ACTIVE', GETDATE()
        FROM Allocations a
        WHERE a.AllocateQty > 0;

        -- STEP 4: Update tblInventory ReservedQty in bulk
        UPDATE i
        SET i.ReservedQty = i.ReservedQty + a.AllocateQty,
            i.UpdatedAt   = GETDATE()
        FROM tblInventory i
        INNER JOIN (
            SELECT InventoryId, SUM(AllocateQty) AS AllocateQty
            FROM Allocations
            WHERE AllocateQty > 0
            GROUP BY InventoryId
        ) a ON i.InventoryId = a.InventoryId;

        -- STEP 5: Update tblSalesOrderDetail ReservedQty in bulk
        UPDATE sod
        SET sod.ReservedQty = sod.ReservedQty + a.TotalAllocated
        FROM tblSalesOrderDetail sod
        INNER JOIN (
            SELECT SODetailId, SUM(AllocateQty) AS TotalAllocated
            FROM Allocations
            WHERE AllocateQty > 0
            GROUP BY SODetailId
        ) a ON sod.SODetailId = a.SODetailId;

        -- STEP 6: Update Sales Order status
        DECLARE @TotalQty DECIMAL(18,4), @TotalReserved DECIMAL(18,4);
        SELECT @TotalQty      = SUM(OrderQty),
               @TotalReserved = SUM(ReservedQty)
        FROM tblSalesOrderDetail
        WHERE SOId = @SOId;

        IF @TotalReserved >= @TotalQty
            UPDATE tblSalesOrder SET Status = 'RESERVED', UpdatedAt = GETDATE() WHERE SOId = @SOId;
        ELSE IF @TotalReserved > 0
            UPDATE tblSalesOrder SET Status = 'PARTIAL_RESERVED', UpdatedAt = GETDATE() WHERE SOId = @SOId;

        COMMIT TRANSACTION;
        SELECT 1 AS Success, 'Reservation completed successfully.' AS Message;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @ErrMessage NVARCHAR(4000) = ERROR_MESSAGE();
        SELECT 0 AS Success, @ErrMessage AS Message;
    END CATCH;
END;
GO

-- 3. sp_ProcessGRN: Complete goods receiving against PO and update status
CREATE PROCEDURE sp_ProcessGRN
    @GRNId INT,
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    BEGIN TRY
        -- Set GRN Status (BUG-009 FIX: Update Status only, do NOT overwrite CreatedAt)
        -- UpdatedAt column added via ALTER TABLE in schema migration
        UPDATE tblGRN 
        SET Status = 'QC_COMPLETED'
        WHERE GRNId = @GRNId;

        -- Loop through GRN details and update Purchase Order received quantities
        DECLARE @POId INT;
        SELECT @POId = POId FROM tblGRN WHERE GRNId = @GRNId;

        IF @POId IS NOT NULL
        BEGIN
            -- Update PO details ReceivedQty
            UPDATE pod
            SET pod.ReceivedQty = pod.ReceivedQty + gd.AcceptedQty
            FROM tblPurchaseOrderDetail pod
            INNER JOIN tblGRNDetail gd ON pod.ItemId = gd.ItemId
            WHERE gd.GRNId = @GRNId AND pod.POId = @POId;

            -- Check if PO is completed
            DECLARE @TotalOrdered DECIMAL(18,4), @TotalReceived DECIMAL(18,4);
            SELECT @TotalOrdered = SUM(OrderQty), @TotalReceived = SUM(ReceivedQty)
            FROM tblPurchaseOrderDetail
            WHERE POId = @POId;

            IF @TotalReceived >= @TotalOrdered
            BEGIN
                UPDATE tblPurchaseOrder SET Status = 'COMPLETED', UpdatedAt = GETDATE() WHERE POId = @POId;
            END
            ELSE
            BEGIN
                UPDATE tblPurchaseOrder SET Status = 'PARTIAL', UpdatedAt = GETDATE() WHERE POId = @POId;
            END
        END

        COMMIT TRANSACTION;
        SELECT 1 AS Success, 'GRN processed successfully.' AS Message;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @ErrMessage NVARCHAR(4000) = ERROR_MESSAGE();
        SELECT 0 AS Success, @ErrMessage AS Message;
    END CATCH;
END;
GO

-- 4. sp_ProcessPutaway (Phase 2): Uses real item Weight/Volume from tblItem
CREATE PROCEDURE sp_ProcessPutaway
    @GRNDetailId INT,
    @BinId INT,
    @Quantity DECIMAL(18,4),
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    BEGIN TRY
        -- Get details
        DECLARE @ItemId INT, @BatchId INT, @GRNId INT, @WarehouseId INT, @ZoneId INT;
        SELECT @ItemId = ItemId, @BatchId = BatchId, @GRNId = GRNId
        FROM tblGRNDetail WHERE GRNDetailId = @GRNDetailId;
        
        -- Get Warehouse and Zone for the Bin
        SELECT 
            @WarehouseId = z.WarehouseId,
            @ZoneId = z.ZoneId
        FROM tblBin b
        INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
        INNER JOIN tblRack r  ON s.RackId = r.RackId
        INNER JOIN tblZone z  ON r.ZoneId = z.ZoneId
        WHERE b.BinId = @BinId;

        -- Phase 2 FIX: Use real item weight/volume (fallback to 2.0/1.5 if not configured)
        DECLARE @ItemWeight DECIMAL(18,4), @ItemVolume DECIMAL(18,4);
        SELECT 
            @ItemWeight = CASE WHEN COALESCE(Weight, 0) > 0 THEN Weight ELSE 2.0 END,
            @ItemVolume = CASE WHEN COALESCE(Volume, 0) > 0 THEN Volume ELSE 1.5 END
        FROM tblItem WHERE ItemId = @ItemId;

        -- 1. Create or update tblInventory
        IF EXISTS (
            SELECT 1 FROM tblInventory 
            WHERE BinId = @BinId AND ItemId = @ItemId 
              AND (BatchId = @BatchId OR (BatchId IS NULL AND @BatchId IS NULL))
        )
        BEGIN
            UPDATE tblInventory
            SET Quantity = Quantity + @Quantity, UpdatedAt = GETDATE()
            WHERE BinId = @BinId AND ItemId = @ItemId 
              AND (BatchId = @BatchId OR (BatchId IS NULL AND @BatchId IS NULL));
        END
        ELSE
        BEGIN
            INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, BatchId, Quantity, ReservedQty, UpdatedAt)
            VALUES (@WarehouseId, @ZoneId, @BinId, @ItemId, @BatchId, @Quantity, 0.00, GETDATE());
        END

        -- 2. Update tblGRNDetail PutawayQty
        UPDATE tblGRNDetail
        SET PutawayQty = PutawayQty + @Quantity
        WHERE GRNDetailId = @GRNDetailId;

        -- 3. Update tblBin occupied capacity using REAL item weight/volume
        DECLARE @AddWeight DECIMAL(18,4) = @Quantity * @ItemWeight;
        DECLARE @AddVolume DECIMAL(18,4) = @Quantity * @ItemVolume;

        UPDATE tblBin
        SET OccupiedWeight = OccupiedWeight + @AddWeight,
            OccupiedVolume = OccupiedVolume + @AddVolume
        WHERE BinId = @BinId;

        -- 4. Insert Putaway entry
        INSERT INTO tblPutaway (GRNDetailId, ItemId, BinId, BatchId, Quantity, PutawayBy, PutawayDate, Status)
        VALUES (@GRNDetailId, @ItemId, @BinId, @BatchId, @Quantity, @UserId, GETDATE(), 'COMPLETED');

        -- 5. Check if all GRN details are put away → update GRN status
        DECLARE @TotalAccepted DECIMAL(18,4), @TotalPutaway DECIMAL(18,4);
        SELECT @TotalAccepted = SUM(AcceptedQty), @TotalPutaway = SUM(PutawayQty)
        FROM tblGRNDetail
        WHERE GRNId = @GRNId;

        IF @TotalPutaway >= @TotalAccepted
            UPDATE tblGRN SET Status = 'PUTAWAY_COMPLETED' WHERE GRNId = @GRNId;

        COMMIT TRANSACTION;
        SELECT 1 AS Success, 'Putaway executed successfully.' AS Message;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @ErrMessage NVARCHAR(4000) = ERROR_MESSAGE();
        SELECT 0 AS Success, @ErrMessage AS Message;
    END CATCH;
END;
GO
