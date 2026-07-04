USE BusyWMS;
GO

-- ============================================================
-- PHASE 1 MIGRATION SCRIPT
-- Apply all schema fixes from Audit Phase 1
-- Run this ONCE on existing BusyWMS database
-- ============================================================

PRINT 'Starting Phase 1 Schema Migration...';
GO

-- -------------------------------------------------------
-- FIX: BUG-009 / BUG-020 - Add UpdatedAt to tblGRN
-- -------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'tblGRN' AND COLUMN_NAME = 'UpdatedAt'
)
BEGIN
    ALTER TABLE tblGRN ADD UpdatedAt DATETIME DEFAULT GETDATE();
    PRINT 'Added UpdatedAt to tblGRN';
END
ELSE
BEGIN
    PRINT 'UpdatedAt already exists on tblGRN - skipping';
END
GO

-- -------------------------------------------------------
-- FIX: ISSUE-047 - Add UNIQUE constraint to tblInventory
-- Prevents duplicate bin+item+batch inventory records
-- -------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_Inventory_Bin_Item_Batch' AND object_id = OBJECT_ID('tblInventory')
)
BEGIN
    -- Remove any existing duplicates first (keep the row with the highest quantity)
    WITH CTE AS (
        SELECT InventoryId,
               ROW_NUMBER() OVER (PARTITION BY BinId, ItemId, ISNULL(BatchId, -1) ORDER BY Quantity DESC) AS rn
        FROM tblInventory
    )
    DELETE FROM CTE WHERE rn > 1;

    ALTER TABLE tblInventory
    ADD CONSTRAINT UQ_Inventory_Bin_Item_Batch
    UNIQUE (BinId, ItemId, BatchId);

    PRINT 'Added UNIQUE constraint UQ_Inventory_Bin_Item_Batch to tblInventory';
END
ELSE
BEGIN
    PRINT 'UQ_Inventory_Bin_Item_Batch already exists - skipping';
END
GO

-- -------------------------------------------------------
-- PERFORMANCE: Add missing high-impact indexes
-- -------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblGRN_Status' AND object_id = OBJECT_ID('tblGRN'))
    CREATE INDEX IX_tblGRN_Status ON tblGRN (Status);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblGRN_ReceivedDate' AND object_id = OBJECT_ID('tblGRN'))
    CREATE INDEX IX_tblGRN_ReceivedDate ON tblGRN (ReceivedDate);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblGRNDetail_GRNId' AND object_id = OBJECT_ID('tblGRNDetail'))
    CREATE INDEX IX_tblGRNDetail_GRNId ON tblGRNDetail (GRNId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblPutaway_GRNDetailId' AND object_id = OBJECT_ID('tblPutaway'))
    CREATE INDEX IX_tblPutaway_GRNDetailId ON tblPutaway (GRNDetailId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblPickListDetail_PickListId' AND object_id = OBJECT_ID('tblPickListDetail'))
    CREATE INDEX IX_tblPickListDetail_PickListId ON tblPickListDetail (PickListId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblReservation_ItemId_Status' AND object_id = OBJECT_ID('tblReservation'))
    CREATE INDEX IX_tblReservation_ItemId_Status ON tblReservation (ItemId, Status);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblInventory_Item_Batch' AND object_id = OBJECT_ID('tblInventory'))
    CREATE INDEX IX_tblInventory_Item_Batch ON tblInventory (ItemId, BatchId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblDispatch_SOId' AND object_id = OBJECT_ID('tblDispatch'))
    CREATE INDEX IX_tblDispatch_SOId ON tblDispatch (SOId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblAuditLog_Timestamp' AND object_id = OBJECT_ID('tblAuditLog'))
    CREATE INDEX IX_tblAuditLog_Timestamp ON tblAuditLog (Timestamp DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblApiLog_Status_Timestamp' AND object_id = OBJECT_ID('tblApiLog'))
    CREATE INDEX IX_tblApiLog_Status_Timestamp ON tblApiLog (Status, Timestamp DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblSalesOrder_Status' AND object_id = OBJECT_ID('tblSalesOrder'))
    CREATE INDEX IX_tblSalesOrder_Status ON tblSalesOrder (Status);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tblPurchaseOrder_Status' AND object_id = OBJECT_ID('tblPurchaseOrder'))
    CREATE INDEX IX_tblPurchaseOrder_Status ON tblPurchaseOrder (Status);
GO

-- -------------------------------------------------------
-- Add PARTIAL_RESERVED status comment to tblSalesOrder
-- (no schema change needed, just documenting it)
-- ISSUE-023: Status documented: PENDING, RESERVED, PARTIAL_RESERVED,
--            PICKING, PARTIAL_PICKED, PICKED, PACKED, DISPATCHED, CANCELLED
-- -------------------------------------------------------

PRINT 'Phase 1 Schema Migration Complete!';
GO
