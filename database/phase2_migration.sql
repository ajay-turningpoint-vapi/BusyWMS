USE BusyWMS;
GO

-- ============================================================
-- PHASE 2 MIGRATION SCRIPT
-- Database Schema Enhancements
-- Run ONCE on existing BusyWMS database (MSSQL only)
-- ============================================================

PRINT 'Starting Phase 2 Schema Migration...';
GO

-- -------------------------------------------------------
-- 1. ADD PHYSICAL PROPERTIES + COST FIELDS TO tblItem
--    Fixes BUG-012 (hardcoded 2kg/1.5L), BUG-003 (valuation)
--    and ISSUE-029 (missing UnitCost)
-- -------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tblItem' AND COLUMN_NAME='Weight')
BEGIN
    ALTER TABLE tblItem ADD Weight DECIMAL(18,4) DEFAULT 0.00;
    PRINT 'Added Weight to tblItem';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tblItem' AND COLUMN_NAME='Volume')
BEGIN
    ALTER TABLE tblItem ADD Volume DECIMAL(18,4) DEFAULT 0.00;
    PRINT 'Added Volume to tblItem';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tblItem' AND COLUMN_NAME='UnitCost')
BEGIN
    ALTER TABLE tblItem ADD UnitCost DECIMAL(18,4) DEFAULT 0.00;
    PRINT 'Added UnitCost to tblItem';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tblItem' AND COLUMN_NAME='SellingPrice')
BEGIN
    ALTER TABLE tblItem ADD SellingPrice DECIMAL(18,4) DEFAULT 0.00;
    PRINT 'Added SellingPrice to tblItem';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tblItem' AND COLUMN_NAME='HSNCode')
BEGIN
    ALTER TABLE tblItem ADD HSNCode VARCHAR(20);
    PRINT 'Added HSNCode to tblItem';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tblItem' AND COLUMN_NAME='UpdatedAt')
BEGIN
    ALTER TABLE tblItem ADD UpdatedAt DATETIME DEFAULT GETDATE();
    PRINT 'Added UpdatedAt to tblItem';
END
GO

-- -------------------------------------------------------
-- 2. ADD tblAisle (Warehouse → Zone → Aisle → Rack hierarchy)
--    Fixes ISSUE-027: missing Aisle level in location hierarchy
-- -------------------------------------------------------
IF OBJECT_ID('tblAisle', 'U') IS NULL
BEGIN
    CREATE TABLE tblAisle (
        AisleId   INT IDENTITY(1,1) PRIMARY KEY,
        ZoneId    INT NOT NULL FOREIGN KEY REFERENCES tblZone(ZoneId),
        Code      VARCHAR(20) NOT NULL,
        Name      VARCHAR(100) NOT NULL,
        IsActive  BIT DEFAULT 1 NOT NULL,
        CONSTRAINT UQ_Zone_Aisle UNIQUE (ZoneId, Code)
    );
    PRINT 'Created tblAisle';
END
ELSE
    PRINT 'tblAisle already exists - skipping';
GO

-- Add optional AisleId FK to tblRack (nullable — backward compatible)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tblRack' AND COLUMN_NAME='AisleId')
BEGIN
    ALTER TABLE tblRack ADD AisleId INT NULL FOREIGN KEY REFERENCES tblAisle(AisleId);
    PRINT 'Added AisleId FK to tblRack';
END
GO

-- -------------------------------------------------------
-- 3. ADD tblDamage (Damage Management Module)
--    Fixes ISSUE-039: no damage tracking
-- -------------------------------------------------------
IF OBJECT_ID('tblDamage', 'U') IS NULL
BEGIN
    CREATE TABLE tblDamage (
        DamageId     INT IDENTITY(1,1) PRIMARY KEY,
        DamageCode   VARCHAR(50) NOT NULL UNIQUE,
        ItemId       INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
        BinId        INT FOREIGN KEY REFERENCES tblBin(BinId),
        BatchId      INT FOREIGN KEY REFERENCES tblBatch(BatchId),
        SerialId     INT FOREIGN KEY REFERENCES tblSerialNo(SerialId),
        Quantity     DECIMAL(18,4) NOT NULL,
        DamageReason VARCHAR(255),
        DamageType   VARCHAR(50) DEFAULT 'PHYSICAL',  -- PHYSICAL, EXPIRED, TRANSIT, OTHER
        DamageDate   DATETIME DEFAULT GETDATE(),
        ReportedBy   INT FOREIGN KEY REFERENCES tblUser(UserId),
        ReviewedBy   INT FOREIGN KEY REFERENCES tblUser(UserId),
        Status       VARCHAR(20) DEFAULT 'REPORTED' NOT NULL,  -- REPORTED, CONFIRMED, DISPOSED, RETURNED
        Remarks      VARCHAR(255)
    );
    CREATE INDEX IX_tblDamage_ItemId    ON tblDamage (ItemId);
    CREATE INDEX IX_tblDamage_Status    ON tblDamage (Status);
    CREATE INDEX IX_tblDamage_DamageDate ON tblDamage (DamageDate DESC);
    PRINT 'Created tblDamage';
END
ELSE
    PRINT 'tblDamage already exists - skipping';
GO

-- -------------------------------------------------------
-- 4. ADD tblCycleCount + tblCycleCountDetail
--    Fixes ISSUE-040: no cycle count module
-- -------------------------------------------------------
IF OBJECT_ID('tblCycleCount', 'U') IS NULL
BEGIN
    CREATE TABLE tblCycleCount (
        CycleCountId INT IDENTITY(1,1) PRIMARY KEY,
        CountCode    VARCHAR(50) NOT NULL UNIQUE,
        WarehouseId  INT NOT NULL FOREIGN KEY REFERENCES tblWarehouse(WarehouseId),
        ZoneId       INT FOREIGN KEY REFERENCES tblZone(ZoneId),
        CountType    VARCHAR(20) DEFAULT 'FULL',      -- FULL, ZONE, BIN, ABC
        CountedBy    INT NOT NULL FOREIGN KEY REFERENCES tblUser(UserId),
        ReviewedBy   INT FOREIGN KEY REFERENCES tblUser(UserId),
        CountDate    DATETIME DEFAULT GETDATE(),
        Status       VARCHAR(20) DEFAULT 'PENDING' NOT NULL,  -- PENDING, IN_PROGRESS, COMPLETED, APPROVED
        Notes        VARCHAR(255)
    );
    CREATE INDEX IX_tblCycleCount_WarehouseId ON tblCycleCount (WarehouseId);
    CREATE INDEX IX_tblCycleCount_Status      ON tblCycleCount (Status);
    PRINT 'Created tblCycleCount';
END
GO

IF OBJECT_ID('tblCycleCountDetail', 'U') IS NULL
BEGIN
    CREATE TABLE tblCycleCountDetail (
        CountDetailId INT IDENTITY(1,1) PRIMARY KEY,
        CycleCountId  INT NOT NULL FOREIGN KEY REFERENCES tblCycleCount(CycleCountId),
        BinId         INT NOT NULL FOREIGN KEY REFERENCES tblBin(BinId),
        ItemId        INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
        BatchId       INT FOREIGN KEY REFERENCES tblBatch(BatchId),
        SystemQty     DECIMAL(18,4) NOT NULL DEFAULT 0.00,
        CountedQty    DECIMAL(18,4),
        Variance      AS (CountedQty - SystemQty) PERSISTED,  -- Computed column
        Status        VARCHAR(20) DEFAULT 'PENDING' NOT NULL,  -- PENDING, COUNTED, APPROVED
        Notes         VARCHAR(255)
    );
    CREATE INDEX IX_tblCCDetail_CycleCountId ON tblCycleCountDetail (CycleCountId);
    CREATE INDEX IX_tblCCDetail_BinItem       ON tblCycleCountDetail (BinId, ItemId);
    PRINT 'Created tblCycleCountDetail';
END
GO

-- -------------------------------------------------------
-- 5. ADD tblPickListWave (Wave Picking — multi-SO support)
--    Fixes ISSUE-041: single-SO pick list limitation
-- -------------------------------------------------------
IF OBJECT_ID('tblPickListWave', 'U') IS NULL
BEGIN
    CREATE TABLE tblPickListWave (
        WaveId      INT IDENTITY(1,1) PRIMARY KEY,
        WaveCode    VARCHAR(50) NOT NULL UNIQUE,
        WarehouseId INT NOT NULL FOREIGN KEY REFERENCES tblWarehouse(WarehouseId),
        CreatedBy   INT NOT NULL FOREIGN KEY REFERENCES tblUser(UserId),
        AssignedTo  INT FOREIGN KEY REFERENCES tblUser(UserId),
        Status      VARCHAR(20) DEFAULT 'PENDING' NOT NULL,  -- PENDING, PICKING, COMPLETED, CANCELLED
        Notes       VARCHAR(255),
        CreatedAt   DATETIME DEFAULT GETDATE(),
        UpdatedAt   DATETIME DEFAULT GETDATE()
    );
    CREATE INDEX IX_tblPickListWave_Status ON tblPickListWave (Status);
    PRINT 'Created tblPickListWave';
END
GO

-- Add optional WaveId FK to tblPickList (nullable — backward compatible)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tblPickList' AND COLUMN_NAME='WaveId')
BEGIN
    ALTER TABLE tblPickList ADD WaveId INT NULL FOREIGN KEY REFERENCES tblPickListWave(WaveId);
    PRINT 'Added WaveId FK to tblPickList';
END
GO

-- -------------------------------------------------------
-- 6. ENHANCE tblPacking with physical dimensions
--    Fixes ISSUE-042: no weight/dims for shipping
-- -------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tblPacking' AND COLUMN_NAME='GrossWeight')
BEGIN
    ALTER TABLE tblPacking ADD GrossWeight   DECIMAL(10,3);
    ALTER TABLE tblPacking ADD LengthCm      DECIMAL(10,2);
    ALTER TABLE tblPacking ADD WidthCm       DECIMAL(10,2);
    ALTER TABLE tblPacking ADD HeightCm      DECIMAL(10,2);
    ALTER TABLE tblPacking ADD ItemCount     INT DEFAULT 0;
    ALTER TABLE tblPacking ADD Notes         VARCHAR(255);
    PRINT 'Added shipping dimensions to tblPacking';
END
GO

-- -------------------------------------------------------
-- 7. ENHANCE tblReturns with inventory linkage
--    Fixes ISSUE-038: returns have no bin/inventory impact
-- -------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tblReturns' AND COLUMN_NAME='BinId')
BEGIN
    ALTER TABLE tblReturns ADD BinId       INT FOREIGN KEY REFERENCES tblBin(BinId);
    ALTER TABLE tblReturns ADD ReturnedBy  INT FOREIGN KEY REFERENCES tblUser(UserId);
    ALTER TABLE tblReturns ADD InventoryUpdated BIT DEFAULT 0;  -- Flag: has stock been restocked?
    PRINT 'Added BinId, ReturnedBy, InventoryUpdated to tblReturns';
END
GO

-- -------------------------------------------------------
-- 8. ADD ERP Configuration Table
--    Fixes ISSUE-035: hardcoded ERP endpoint
-- -------------------------------------------------------
IF OBJECT_ID('tblERPConfig', 'U') IS NULL
BEGIN
    CREATE TABLE tblERPConfig (
        ConfigId     INT IDENTITY(1,1) PRIMARY KEY,
        CompanyId    VARCHAR(50) NOT NULL DEFAULT 'COMP01',
        ERPName      VARCHAR(100) NOT NULL DEFAULT 'BUSY Accounting',
        BaseUrl      VARCHAR(255),
        ApiKey       VARCHAR(255),
        SecretKey    VARCHAR(255),
        SyncInterval INT DEFAULT 30,       -- minutes
        IsActive     BIT DEFAULT 1,
        LastSyncAt   DATETIME,
        CreatedAt    DATETIME DEFAULT GETDATE(),
        UpdatedAt    DATETIME DEFAULT GETDATE()
    );
    -- Seed default config (blank)
    INSERT INTO tblERPConfig (CompanyId, ERPName) VALUES ('COMP01', 'BUSY Accounting');
    PRINT 'Created tblERPConfig with default row';
END
GO

-- -------------------------------------------------------
-- 9. UPDATE vw_InventoryStatus to include Item cost fields
--    and recompute valuation per row
-- -------------------------------------------------------
IF OBJECT_ID('vw_InventoryStatus', 'V') IS NOT NULL
    DROP VIEW vw_InventoryStatus;
GO

CREATE VIEW vw_InventoryStatus AS
SELECT
    i.InventoryId,
    w.WarehouseId,  w.Code AS WarehouseCode,  w.Name AS WarehouseName,
    z.ZoneId,       z.Code AS ZoneCode,        z.Name AS ZoneName,
    b.BinId,        b.Code AS BinCode,         b.Barcode AS BinBarcode,
    item.ItemId,    item.Code AS ItemCode,      item.Name AS ItemName,
    item.Category AS ItemCategory,              item.UOM AS ItemUOM,
    item.Weight AS ItemWeight,                  item.Volume AS ItemVolume,
    item.UnitCost AS ItemUnitCost,
    batch.BatchId,  batch.BatchNumber,          batch.ExpiryDate,
    i.Quantity,     i.ReservedQty,
    (i.Quantity - i.ReservedQty) AS AvailableQty,
    (i.Quantity * COALESCE(item.UnitCost, 0)) AS StockValue
FROM tblInventory i
INNER JOIN tblWarehouse w    ON i.WarehouseId = w.WarehouseId
INNER JOIN tblZone z         ON i.ZoneId = z.ZoneId
INNER JOIN tblBin b          ON i.BinId = b.BinId
INNER JOIN tblItem item      ON i.ItemId = item.ItemId
LEFT  JOIN tblBatch batch    ON i.BatchId = batch.BatchId;
GO

PRINT 'Recreated vw_InventoryStatus with cost fields';
GO

-- -------------------------------------------------------
-- 10. Reseed item weights/volumes/costs from existing PO data
--     (Best-effort — update items that have PO pricing)
-- -------------------------------------------------------
UPDATE i
SET i.UnitCost = pd.AvgPrice
FROM tblItem i
INNER JOIN (
    SELECT ItemId, AVG(UnitPrice) AS AvgPrice
    FROM tblPurchaseOrderDetail
    WHERE UnitPrice > 0
    GROUP BY ItemId
) pd ON i.ItemId = pd.ItemId
WHERE i.UnitCost = 0;
PRINT 'Seeded UnitCost on tblItem from PO history';
GO

PRINT 'Phase 2 Schema Migration Complete!';
GO
