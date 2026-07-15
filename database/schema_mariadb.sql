-- WMS Database Schema Script for MariaDB / MySQL
-- Sets up database tables, constraints, views, stored procedures, triggers, and seeds default values.

CREATE DATABASE IF NOT EXISTS BusyWMS;
USE BusyWMS;

-- Drop triggers if they exist
DROP TRIGGER IF EXISTS tr_InventoryAudit_Insert;
DROP TRIGGER IF EXISTS tr_InventoryAudit_Update;
DROP TRIGGER IF EXISTS tr_InventoryAudit_Delete;

-- Drop views if they exist
DROP VIEW IF EXISTS vw_WarehouseOccupancy;
DROP VIEW IF EXISTS vw_PendingPick;
DROP VIEW IF EXISTS vw_PendingPutaway;
DROP VIEW IF EXISTS vw_PendingQC;
DROP VIEW IF EXISTS vw_PendingGRN;
DROP VIEW IF EXISTS vw_InventoryStatus;

-- Drop stored procedures
DROP PROCEDURE IF EXISTS sp_AllocateBinForPutaway;
DROP PROCEDURE IF EXISTS sp_ReserveInventory;
DROP PROCEDURE IF EXISTS sp_ProcessGRN;
DROP PROCEDURE IF EXISTS sp_ProcessPutaway;

-- Drop tables with foreign keys disabled (clean rebuild)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS tblERPConfig;
DROP TABLE IF EXISTS tblSupplier;
DROP TABLE IF EXISTS tblCustomer;
DROP TABLE IF EXISTS tblCycleCountDetail;
DROP TABLE IF EXISTS tblCycleCount;
DROP TABLE IF EXISTS tblDamage;
DROP TABLE IF EXISTS tblReturns;
DROP TABLE IF EXISTS tblStockTransfer;
DROP TABLE IF EXISTS tblDispatch;
DROP TABLE IF EXISTS tblPacking;
DROP TABLE IF EXISTS tblPickListDetail;
DROP TABLE IF EXISTS tblPickList;
DROP TABLE IF EXISTS tblPickListWave;
DROP TABLE IF EXISTS tblReservation;
DROP TABLE IF EXISTS tblSalesOrderDetail;
DROP TABLE IF EXISTS tblSalesOrder;
DROP TABLE IF EXISTS tblInventory;
DROP TABLE IF EXISTS tblPutaway;
DROP TABLE IF EXISTS tblQC;
DROP TABLE IF EXISTS tblGRNDetail;
DROP TABLE IF EXISTS tblGRN;
DROP TABLE IF EXISTS tblPurchaseOrderDetail;
DROP TABLE IF EXISTS tblPurchaseOrder;
DROP TABLE IF EXISTS tblSerialNo;
DROP TABLE IF EXISTS tblBatch;
DROP TABLE IF EXISTS tblItem;
DROP TABLE IF EXISTS tblBin;
DROP TABLE IF EXISTS tblShelf;
DROP TABLE IF EXISTS tblRack;
DROP TABLE IF EXISTS tblAisle;
DROP TABLE IF EXISTS tblZone;
DROP TABLE IF EXISTS tblWarehouse;
DROP TABLE IF EXISTS tblUser;
DROP TABLE IF EXISTS tblRole;
DROP TABLE IF EXISTS tblFeatureConfig;
DROP TABLE IF EXISTS tblUserSetting;
DROP TABLE IF EXISTS tblBarcodeTemplate;
DROP TABLE IF EXISTS tblPermissionMatrix;
DROP TABLE IF EXISTS tblLoginHistory;
DROP TABLE IF EXISTS tblNotification;
DROP TABLE IF EXISTS tblAuditLog;
DROP TABLE IF EXISTS tblApiLog;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 1. BASE CONFIGURATION & MEMBERSHIP TABLES
-- ============================================================

CREATE TABLE tblRole (
    RoleId INT AUTO_INCREMENT PRIMARY KEY,
    RoleName VARCHAR(50) NOT NULL UNIQUE,
    Description VARCHAR(255),
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tblUser (
    UserId INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    Email VARCHAR(100) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    RoleId INT NOT NULL,
    FullName VARCHAR(100) NOT NULL,
    WarehouseId INT DEFAULT NULL,
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (RoleId) REFERENCES tblRole(RoleId)
) ENGINE=InnoDB;

CREATE TABLE tblSupplier (
    SupplierId INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(100) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    ParentGrp VARCHAR(100) DEFAULT NULL,
    Alias VARCHAR(100) DEFAULT NULL,
    Mobile VARCHAR(100) DEFAULT NULL,
    Email VARCHAR(255) DEFAULT NULL,
    Add1 VARCHAR(255) DEFAULT NULL,
    Add2 VARCHAR(255) DEFAULT NULL,
    Add3 VARCHAR(255) DEFAULT NULL,
    Add4 VARCHAR(255) DEFAULT NULL,
    GSTIN VARCHAR(50) DEFAULT NULL,
    Station VARCHAR(100) DEFAULT NULL,
    Country VARCHAR(100) DEFAULT NULL,
    Pincode VARCHAR(50) DEFAULT NULL,
    State VARCHAR(100) DEFAULT NULL,
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tblCustomer (
    CustomerId INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(100) NOT NULL UNIQUE,
    Name VARCHAR(150) NOT NULL,
    ParentGrp VARCHAR(100) DEFAULT NULL,
    Alias VARCHAR(100) DEFAULT NULL,
    Mobile VARCHAR(100) DEFAULT NULL,
    Email VARCHAR(255) DEFAULT NULL,
    Add1 VARCHAR(255) DEFAULT NULL,
    Add2 VARCHAR(255) DEFAULT NULL,
    Add3 VARCHAR(255) DEFAULT NULL,
    Add4 VARCHAR(255) DEFAULT NULL,
    GSTIN VARCHAR(50) DEFAULT NULL,
    Station VARCHAR(100) DEFAULT NULL,
    Country VARCHAR(100) DEFAULT NULL,
    Pincode VARCHAR(50) DEFAULT NULL,
    State VARCHAR(100) DEFAULT NULL,
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 2. LOCATION HIERARCHY TABLES (6-Level hierarchy)
-- ============================================================

CREATE TABLE tblWarehouse (
    WarehouseId INT AUTO_INCREMENT PRIMARY KEY,
    CompanyId VARCHAR(50) NOT NULL DEFAULT 'COMP01',
    Code VARCHAR(20) NOT NULL UNIQUE,
    Name VARCHAR(100) NOT NULL,
    Address VARCHAR(255),
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tblZone (
    ZoneId INT AUTO_INCREMENT PRIMARY KEY,
    WarehouseId INT NOT NULL,
    Code VARCHAR(20) NOT NULL,
    Name VARCHAR(100) NOT NULL,
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    CONSTRAINT UQ_Warehouse_Zone UNIQUE (WarehouseId, Code),
    FOREIGN KEY (WarehouseId) REFERENCES tblWarehouse(WarehouseId)
) ENGINE=InnoDB;

CREATE TABLE tblAisle (
    AisleId INT AUTO_INCREMENT PRIMARY KEY,
    ZoneId INT NOT NULL,
    Code VARCHAR(20) NOT NULL,
    Name VARCHAR(100) NOT NULL,
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    CONSTRAINT UQ_Zone_Aisle UNIQUE (ZoneId, Code),
    FOREIGN KEY (ZoneId) REFERENCES tblZone(ZoneId)
) ENGINE=InnoDB;

CREATE TABLE tblRack (
    RackId INT AUTO_INCREMENT PRIMARY KEY,
    ZoneId INT NOT NULL,
    AisleId INT DEFAULT NULL,
    Code VARCHAR(20) NOT NULL,
    Name VARCHAR(100) NOT NULL,
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    CONSTRAINT UQ_Zone_Rack UNIQUE (ZoneId, Code),
    FOREIGN KEY (ZoneId) REFERENCES tblZone(ZoneId),
    FOREIGN KEY (AisleId) REFERENCES tblAisle(AisleId)
) ENGINE=InnoDB;

CREATE TABLE tblShelf (
    ShelfId INT AUTO_INCREMENT PRIMARY KEY,
    RackId INT NOT NULL,
    Code VARCHAR(20) NOT NULL,
    Name VARCHAR(100) NOT NULL,
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    CONSTRAINT UQ_Rack_Shelf UNIQUE (RackId, Code),
    FOREIGN KEY (RackId) REFERENCES tblRack(RackId)
) ENGINE=InnoDB;

CREATE TABLE tblBin (
    BinId INT AUTO_INCREMENT PRIMARY KEY,
    ShelfId INT NOT NULL,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Barcode VARCHAR(100) NOT NULL UNIQUE,
    CapacityWeight DECIMAL(18,4) DEFAULT 1000.0000,
    CapacityVolume DECIMAL(18,4) DEFAULT 500.0000,
    OccupiedWeight DECIMAL(18,4) DEFAULT 0.0000,
    OccupiedVolume DECIMAL(18,4) DEFAULT 0.0000,
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    FOREIGN KEY (ShelfId) REFERENCES tblShelf(ShelfId)
) ENGINE=InnoDB;

-- ============================================================
-- 3. ITEM & TRACKING MASTER TABLES
-- ============================================================

CREATE TABLE tblItem (
    ItemId INT AUTO_INCREMENT PRIMARY KEY,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Alias VARCHAR(100) DEFAULT NULL,
    Name VARCHAR(150) NOT NULL,
    Description VARCHAR(255),
    Category VARCHAR(100),
    Brand VARCHAR(100),
    UOM VARCHAR(20) NOT NULL,
    Barcode VARCHAR(100) UNIQUE,
    HSNCode VARCHAR(20) DEFAULT NULL,
    TrackBatch TINYINT(1) DEFAULT 0 NOT NULL,
    TrackSerial TINYINT(1) DEFAULT 0 NOT NULL,
    Weight DECIMAL(18,4) DEFAULT 0.0000,
    Volume DECIMAL(18,4) DEFAULT 0.0000,
    UnitCost DECIMAL(18,4) DEFAULT 0.0000,
    SellingPrice DECIMAL(18,4) DEFAULT 0.0000,
    MinStock DECIMAL(18,4) DEFAULT 0.0000,
    MaxStock DECIMAL(18,4) DEFAULT 999999.0000,
    PurchPrice DECIMAL(18,4) DEFAULT 0.0000,
    PurchDiscount DECIMAL(18,4) DEFAULT 0.0000,
    AltSalePrice DECIMAL(18,4) DEFAULT 0.0000,
    AltPurchPrice DECIMAL(18,4) DEFAULT 0.0000,
    MRP DECIMAL(18,4) DEFAULT 0.0000,
    SaleDiscount DECIMAL(18,4) DEFAULT 0.0000,
    MainUnit VARCHAR(50) DEFAULT NULL,
    AltUnit VARCHAR(50) DEFAULT NULL,
    Vendor VARCHAR(150) DEFAULT NULL,
    Tax VARCHAR(50) DEFAULT NULL,
    IsActive TINYINT(1) DEFAULT 1 NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tblBatch (
    BatchId INT AUTO_INCREMENT PRIMARY KEY,
    ItemId INT NOT NULL,
    BatchNumber VARCHAR(50) NOT NULL,
    ManufactureDate DATETIME DEFAULT NULL,
    ExpiryDate DATETIME DEFAULT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_Item_Batch UNIQUE (ItemId, BatchNumber),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId)
) ENGINE=InnoDB;

CREATE TABLE tblSerialNo (
    SerialId INT AUTO_INCREMENT PRIMARY KEY,
    ItemId INT NOT NULL,
    BatchId INT DEFAULT NULL,
    SerialNumber VARCHAR(100) NOT NULL,
    Status VARCHAR(20) DEFAULT 'IN_STOCK' NOT NULL, -- IN_STOCK, QC_HOLD, PICKED, DISPATCHED, RETURNED, DAMAGED
    CONSTRAINT UQ_Item_Serial UNIQUE (ItemId, SerialNumber),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId),
    FOREIGN KEY (BatchId) REFERENCES tblBatch(BatchId)
) ENGINE=InnoDB;

-- ============================================================
-- 4. TRANSACTION TABLES (INBOUND)
-- ============================================================

CREATE TABLE tblPurchaseOrder (
    POId INT AUTO_INCREMENT PRIMARY KEY,
    POCode VARCHAR(50) NOT NULL UNIQUE,
    VendorName VARCHAR(150) NOT NULL,
    VendorCode VARCHAR(50) NOT NULL,
    OrderDate DATETIME NOT NULL,
    DeliveryDate DATETIME DEFAULT NULL,
    PreparedBy VARCHAR(100) NULL,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- PENDING, PARTIAL, COMPLETED, CANCELLED
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tblPurchaseOrderDetail (
    PODetailId INT AUTO_INCREMENT PRIMARY KEY,
    POId INT NOT NULL,
    ItemId INT NOT NULL,
    OrderQty DECIMAL(18,4) NOT NULL,
    ReceivedQty DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    UOM VARCHAR(20) NOT NULL,
    UnitPrice DECIMAL(18,4) DEFAULT 0.0000,
    FOREIGN KEY (POId) REFERENCES tblPurchaseOrder(POId),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId)
) ENGINE=InnoDB;

CREATE TABLE tblGRN (
    GRNId INT AUTO_INCREMENT PRIMARY KEY,
    GRNCode VARCHAR(50) NOT NULL UNIQUE,
    POId INT DEFAULT NULL,
    ReceivedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    InvoiceNo VARCHAR(50) DEFAULT NULL,
    ReceivedBy INT NOT NULL,
    DocumentUrl VARCHAR(255) DEFAULT NULL,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- PENDING, QC_COMPLETED, PUTAWAY_COMPLETED
    IsSynced TINYINT(1) DEFAULT 0,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (POId) REFERENCES tblPurchaseOrder(POId),
    FOREIGN KEY (ReceivedBy) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

CREATE TABLE tblGRNDetail (
    GRNDetailId INT AUTO_INCREMENT PRIMARY KEY,
    GRNId INT NOT NULL,
    ItemId INT NOT NULL,
    BatchId INT DEFAULT NULL,
    ReceivedQty DECIMAL(18,4) NOT NULL,
    AcceptedQty DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    RejectedQty DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    PutawayQty DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    RejectionReason VARCHAR(255) DEFAULT NULL,
    FOREIGN KEY (GRNId) REFERENCES tblGRN(GRNId),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId),
    FOREIGN KEY (BatchId) REFERENCES tblBatch(BatchId)
) ENGINE=InnoDB;

CREATE TABLE tblQC (
    QCId INT AUTO_INCREMENT PRIMARY KEY,
    GRNId INT NOT NULL,
    CheckedBy INT NOT NULL,
    CheckedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    Status VARCHAR(20) NOT NULL, -- APPROVED, REJECTED, PARTIAL
    Remarks VARCHAR(255) DEFAULT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (GRNId) REFERENCES tblGRN(GRNId),
    FOREIGN KEY (CheckedBy) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

CREATE TABLE tblPutaway (
    PutawayId INT AUTO_INCREMENT PRIMARY KEY,
    GRNDetailId INT NOT NULL,
    ItemId INT NOT NULL,
    BinId INT NOT NULL,
    BatchId INT DEFAULT NULL,
    Quantity DECIMAL(18,4) NOT NULL,
    PutawayBy INT NOT NULL,
    PutawayDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    Status VARCHAR(20) DEFAULT 'COMPLETED' NOT NULL,
    FOREIGN KEY (GRNDetailId) REFERENCES tblGRNDetail(GRNDetailId),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId),
    FOREIGN KEY (BinId) REFERENCES tblBin(BinId),
    FOREIGN KEY (BatchId) REFERENCES tblBatch(BatchId),
    FOREIGN KEY (PutawayBy) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

-- ============================================================
-- 5. STOCK & TRANSACTION TABLES (OUTBOUND)
-- ============================================================

CREATE TABLE tblInventory (
    InventoryId INT AUTO_INCREMENT PRIMARY KEY,
    WarehouseId INT NOT NULL,
    ZoneId INT NOT NULL,
    BinId INT NOT NULL,
    ItemId INT NOT NULL,
    BatchId INT DEFAULT NULL,
    Quantity DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    ReservedQty DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT UQ_Inventory_Bin_Item_Batch UNIQUE (BinId, ItemId, BatchId),
    FOREIGN KEY (WarehouseId) REFERENCES tblWarehouse(WarehouseId),
    FOREIGN KEY (ZoneId) REFERENCES tblZone(ZoneId),
    FOREIGN KEY (BinId) REFERENCES tblBin(BinId),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId),
    FOREIGN KEY (BatchId) REFERENCES tblBatch(BatchId)
) ENGINE=InnoDB;

CREATE TABLE tblSalesOrder (
    SOId INT AUTO_INCREMENT PRIMARY KEY,
    SOCode VARCHAR(50) NOT NULL UNIQUE,
    CustomerName VARCHAR(150) NOT NULL,
    CustomerCode VARCHAR(50) NOT NULL,
    OrderDate DATETIME NOT NULL,
    Salesman VARCHAR(100) NULL,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- PENDING, RESERVED, PARTIAL_RESERVED, PICKED, PACKED, DISPATCHED, CANCELLED
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tblSalesOrderDetail (
    SODetailId INT AUTO_INCREMENT PRIMARY KEY,
    SOId INT NOT NULL,
    ItemId INT NOT NULL,
    OrderQty DECIMAL(18,4) NOT NULL,
    ReservedQty DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    PickedQty DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    ShippedQty DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    UOM VARCHAR(20) NOT NULL,
    UnitPrice DECIMAL(18,4) DEFAULT 0.0000,
    FOREIGN KEY (SOId) REFERENCES tblSalesOrder(SOId),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId)
) ENGINE=InnoDB;

CREATE TABLE tblReservation (
    ReservationId INT AUTO_INCREMENT PRIMARY KEY,
    SOId INT NOT NULL,
    ItemId INT NOT NULL,
    BinId INT NOT NULL,
    BatchId INT DEFAULT NULL,
    Quantity DECIMAL(18,4) NOT NULL,
    Status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL, -- ACTIVE, RELEASED, FULFILLED
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (SOId) REFERENCES tblSalesOrder(SOId),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId),
    FOREIGN KEY (BinId) REFERENCES tblBin(BinId),
    FOREIGN KEY (BatchId) REFERENCES tblBatch(BatchId)
) ENGINE=InnoDB;

CREATE TABLE tblPickListWave (
    WaveId INT AUTO_INCREMENT PRIMARY KEY,
    WaveCode VARCHAR(50) NOT NULL UNIQUE,
    WarehouseId INT NOT NULL,
    CreatedBy INT NOT NULL,
    AssignedTo INT DEFAULT NULL,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- PENDING, PICKING, COMPLETED, CANCELLED
    Notes VARCHAR(255) DEFAULT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (WarehouseId) REFERENCES tblWarehouse(WarehouseId),
    FOREIGN KEY (CreatedBy) REFERENCES tblUser(UserId),
    FOREIGN KEY (AssignedTo) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

CREATE TABLE tblPickList (
    PickListId INT AUTO_INCREMENT PRIMARY KEY,
    PickCode VARCHAR(50) NOT NULL UNIQUE,
    SOId INT NOT NULL,
    WaveId INT DEFAULT NULL,
    CreatedBy INT NOT NULL,
    AssignedTo INT DEFAULT NULL,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- PENDING, PICKING, COMPLETED, CANCELLED
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (SOId) REFERENCES tblSalesOrder(SOId),
    FOREIGN KEY (WaveId) REFERENCES tblPickListWave(WaveId),
    FOREIGN KEY (CreatedBy) REFERENCES tblUser(UserId),
    FOREIGN KEY (AssignedTo) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

CREATE TABLE tblPickListDetail (
    PickDetailId INT AUTO_INCREMENT PRIMARY KEY,
    PickListId INT NOT NULL,
    ItemId INT NOT NULL,
    BinId INT NOT NULL,
    BatchId INT DEFAULT NULL,
    Quantity DECIMAL(18,4) NOT NULL,
    PickedQty DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
    FOREIGN KEY (PickListId) REFERENCES tblPickList(PickListId),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId),
    FOREIGN KEY (BinId) REFERENCES tblBin(BinId),
    FOREIGN KEY (BatchId) REFERENCES tblBatch(BatchId)
) ENGINE=InnoDB;

CREATE TABLE tblPacking (
    PackingId INT AUTO_INCREMENT PRIMARY KEY,
    PackCode VARCHAR(50) NOT NULL UNIQUE,
    PickListId INT NOT NULL,
    PackedBy INT NOT NULL,
    PackedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    CartonNo VARCHAR(50) DEFAULT NULL,
    PalletNo VARCHAR(50) DEFAULT NULL,
    ShippingLabel VARCHAR(255) DEFAULT NULL,
    GrossWeight DECIMAL(10,3) DEFAULT NULL,
    LengthCm DECIMAL(10,2) DEFAULT NULL,
    WidthCm DECIMAL(10,2) DEFAULT NULL,
    HeightCm DECIMAL(10,2) DEFAULT NULL,
    ItemCount INT DEFAULT 0,
    Notes VARCHAR(255) DEFAULT NULL,
    Status VARCHAR(20) DEFAULT 'PACKED' NOT NULL, -- PACKED, SHIPPED
    FOREIGN KEY (PickListId) REFERENCES tblPickList(PickListId),
    FOREIGN KEY (PackedBy) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

CREATE TABLE tblDispatch (
    DispatchId INT AUTO_INCREMENT PRIMARY KEY,
    DispatchCode VARCHAR(50) NOT NULL UNIQUE,
    SOId INT NOT NULL,
    DeliveryChallanNo VARCHAR(50) NOT NULL,
    VehicleNo VARCHAR(50) DEFAULT NULL,
    TransporterName VARCHAR(100) DEFAULT NULL,
    LRNumber VARCHAR(50) DEFAULT NULL,
    DispatchDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    DispatchedBy INT NOT NULL,
    Status VARCHAR(20) DEFAULT 'DISPATCHED' NOT NULL,
    FOREIGN KEY (SOId) REFERENCES tblSalesOrder(SOId),
    FOREIGN KEY (DispatchedBy) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

-- ============================================================
-- 6. STOCK ADJUSTMENTS, DAMAGES & RETURNS
-- ============================================================

CREATE TABLE tblStockTransfer (
    TransferId INT AUTO_INCREMENT PRIMARY KEY,
    TransferCode VARCHAR(50) NOT NULL UNIQUE,
    FromWarehouseId INT NOT NULL,
    ToWarehouseId INT NOT NULL,
    FromBinId INT DEFAULT NULL,
    ToBinId INT DEFAULT NULL,
    ItemId INT NOT NULL,
    BatchId INT DEFAULT NULL,
    Quantity DECIMAL(18,4) NOT NULL,
    TransferredBy INT NOT NULL,
    TransferDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    Status VARCHAR(20) DEFAULT 'COMPLETED' NOT NULL,
    FOREIGN KEY (FromWarehouseId) REFERENCES tblWarehouse(WarehouseId),
    FOREIGN KEY (ToWarehouseId) REFERENCES tblWarehouse(WarehouseId),
    FOREIGN KEY (FromBinId) REFERENCES tblBin(BinId),
    FOREIGN KEY (ToBinId) REFERENCES tblBin(BinId),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId),
    FOREIGN KEY (BatchId) REFERENCES tblBatch(BatchId),
    FOREIGN KEY (TransferredBy) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

CREATE TABLE tblReturns (
    ReturnId INT AUTO_INCREMENT PRIMARY KEY,
    ReturnCode VARCHAR(50) NOT NULL UNIQUE,
    Type VARCHAR(20) NOT NULL, -- CUSTOMER, VENDOR
    ReferenceCode VARCHAR(50) DEFAULT NULL,
    ItemId INT NOT NULL,
    BatchId INT DEFAULT NULL,
    Quantity DECIMAL(18,4) NOT NULL,
    Reason VARCHAR(255) DEFAULT NULL,
    BinId INT DEFAULT NULL,
    ReturnedBy INT DEFAULT NULL,
    InventoryUpdated TINYINT(1) DEFAULT 0 NOT NULL,
    ReturnDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    Status VARCHAR(20) DEFAULT 'RECEIVED' NOT NULL,
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId),
    FOREIGN KEY (BatchId) REFERENCES tblBatch(BatchId),
    FOREIGN KEY (BinId) REFERENCES tblBin(BinId),
    FOREIGN KEY (ReturnedBy) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

CREATE TABLE tblDamage (
    DamageId INT AUTO_INCREMENT PRIMARY KEY,
    DamageCode VARCHAR(50) NOT NULL UNIQUE,
    ItemId INT NOT NULL,
    BinId INT DEFAULT NULL,
    BatchId INT DEFAULT NULL,
    SerialId INT DEFAULT NULL,
    Quantity DECIMAL(18,4) NOT NULL,
    DamageReason VARCHAR(255) DEFAULT NULL,
    DamageType VARCHAR(50) DEFAULT 'PHYSICAL',
    DamageDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    ReportedBy INT DEFAULT NULL,
    ReviewedBy INT DEFAULT NULL,
    Status VARCHAR(20) DEFAULT 'REPORTED' NOT NULL,
    Remarks VARCHAR(255) DEFAULT NULL,
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId),
    FOREIGN KEY (BinId) REFERENCES tblBin(BinId),
    FOREIGN KEY (BatchId) REFERENCES tblBatch(BatchId),
    FOREIGN KEY (SerialId) REFERENCES tblSerialNo(SerialId),
    FOREIGN KEY (ReportedBy) REFERENCES tblUser(UserId),
    FOREIGN KEY (ReviewedBy) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

CREATE TABLE tblCycleCount (
    CycleCountId INT AUTO_INCREMENT PRIMARY KEY,
    CountCode VARCHAR(50) NOT NULL UNIQUE,
    WarehouseId INT NOT NULL,
    ZoneId INT DEFAULT NULL,
    CountType VARCHAR(20) DEFAULT 'FULL',
    CountedBy INT NOT NULL,
    ReviewedBy INT DEFAULT NULL,
    CountDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
    Notes VARCHAR(255) DEFAULT NULL,
    FOREIGN KEY (WarehouseId) REFERENCES tblWarehouse(WarehouseId),
    FOREIGN KEY (ZoneId) REFERENCES tblZone(ZoneId),
    FOREIGN KEY (CountedBy) REFERENCES tblUser(UserId),
    FOREIGN KEY (ReviewedBy) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

CREATE TABLE tblCycleCountDetail (
    CountDetailId INT AUTO_INCREMENT PRIMARY KEY,
    CycleCountId INT NOT NULL,
    BinId INT NOT NULL,
    ItemId INT NOT NULL,
    BatchId INT DEFAULT NULL,
    SystemQty DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    CountedQty DECIMAL(18,4) DEFAULT NULL,
    Variance DECIMAL(18,4) GENERATED ALWAYS AS (CountedQty - SystemQty) STORED,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
    Notes VARCHAR(255) DEFAULT NULL,
    FOREIGN KEY (CycleCountId) REFERENCES tblCycleCount(CycleCountId),
    FOREIGN KEY (BinId) REFERENCES tblBin(BinId),
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId),
    FOREIGN KEY (BatchId) REFERENCES tblBatch(BatchId)
) ENGINE=InnoDB;

-- ============================================================
-- 7. NEW CONFIGURATION, SETTINGS & SECURITY TABLES
-- ============================================================

CREATE TABLE tblFeatureConfig (
    ConfigId INT AUTO_INCREMENT PRIMARY KEY,
    Category VARCHAR(50) NOT NULL, -- MODULE, WAREHOUSE, PICKUP, PUTAWAY, DISPATCH, BARCODE
    FeatureCode VARCHAR(50) NOT NULL UNIQUE,
    DisplayName VARCHAR(100) NOT NULL,
    IsEnabled TINYINT(1) DEFAULT 0 NOT NULL,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UpdatedBy INT DEFAULT NULL
) ENGINE=InnoDB;

CREATE TABLE tblUserSetting (
    SettingId INT AUTO_INCREMENT PRIMARY KEY,
    SettingKey VARCHAR(50) NOT NULL UNIQUE,
    SettingValue TEXT DEFAULT NULL,
    Description VARCHAR(255) DEFAULT NULL,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tblBarcodeTemplate (
    TemplateId INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(255) NOT NULL,
    IsDefault TINYINT(1) DEFAULT 0 NOT NULL,
    PageSize VARCHAR(50) DEFAULT 'CUSTOM' NOT NULL,
    LabelWidth DECIMAL(5,2) DEFAULT 50.00 NOT NULL,
    LabelHeight DECIMAL(5,2) DEFAULT 30.00 NOT NULL,
    MarginLeft DECIMAL(5,2) DEFAULT 2.00 NOT NULL,
    MarginTop DECIMAL(5,2) DEFAULT 2.00 NOT NULL,
    RowsPerPage INT DEFAULT 1 NOT NULL,
    ColsPerPage INT DEFAULT 1 NOT NULL,
    GapX DECIMAL(5,2) DEFAULT 1.00 NOT NULL,
    GapY DECIMAL(5,2) DEFAULT 1.00 NOT NULL,
    Orientation VARCHAR(20) DEFAULT 'PORTRAIT' NOT NULL,
    BarcodeType VARCHAR(50) DEFAULT 'CODE39' NOT NULL,
    BarcodePosition VARCHAR(20) DEFAULT 'CENTER' NOT NULL,
    TextPosition VARCHAR(20) DEFAULT 'BOTTOM' NOT NULL,
    FontSize INT DEFAULT 10 NOT NULL,
    FontStyle VARCHAR(50) DEFAULT 'normal' NOT NULL,
    Alignment VARCHAR(20) DEFAULT 'center' NOT NULL,
    PrintItemName TINYINT(1) DEFAULT 0 NOT NULL,
    PrintItemCode TINYINT(1) DEFAULT 0 NOT NULL,
    PrintSKU TINYINT(1) DEFAULT 0 NOT NULL,
    PrintBarcodeNumber TINYINT(1) DEFAULT 0 NOT NULL,
    PrintBatchNumber TINYINT(1) DEFAULT 0 NOT NULL,
    PrintSerialNumber TINYINT(1) DEFAULT 0 NOT NULL,
    PrintMRP TINYINT(1) DEFAULT 0 NOT NULL,
    PrintSalePrice TINYINT(1) DEFAULT 0 NOT NULL,
    PrintMfgDate TINYINT(1) DEFAULT 0 NOT NULL,
    PrintExpiryDate TINYINT(1) DEFAULT 0 NOT NULL,
    PrintCompanyName TINYINT(1) DEFAULT 0 NOT NULL,
    CompanyName VARCHAR(255) DEFAULT 'BusyWMS Enterprise' NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tblPermissionMatrix (
    PermissionId INT AUTO_INCREMENT PRIMARY KEY,
    RoleId INT NOT NULL,
    ResourceName VARCHAR(100) NOT NULL,
    CanRead TINYINT(1) DEFAULT 0 NOT NULL,
    CanCreate TINYINT(1) DEFAULT 0 NOT NULL,
    CanUpdate TINYINT(1) DEFAULT 0 NOT NULL,
    CanDelete TINYINT(1) DEFAULT 0 NOT NULL,
    CONSTRAINT UQ_Role_Resource UNIQUE (RoleId, ResourceName),
    FOREIGN KEY (RoleId) REFERENCES tblRole(RoleId)
) ENGINE=InnoDB;

CREATE TABLE tblLoginHistory (
    LoginLogId INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    IPAddress VARCHAR(50) DEFAULT NULL,
    Browser VARCHAR(255) DEFAULT NULL,
    LoginTime DATETIME DEFAULT CURRENT_TIMESTAMP,
    Status VARCHAR(20) NOT NULL, -- SUCCESS, FAILED
    FailureReason VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB;

CREATE TABLE tblNotification (
    NotificationId INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT DEFAULT NULL, -- Null means broadcast to all eligible operators
    Type VARCHAR(50) NOT NULL, -- LOW_STOCK, PENDING_PICK, PENDING_PUTAWAY, FAILED_SYNC
    Title VARCHAR(100) NOT NULL,
    Message TEXT NOT NULL,
    IsRead TINYINT(1) DEFAULT 0 NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tblERPConfig (
    ConfigId INT AUTO_INCREMENT PRIMARY KEY,
    CompanyId VARCHAR(50) NOT NULL DEFAULT 'COMP01',
    ERPName VARCHAR(100) NOT NULL DEFAULT 'BUSY Accounting',
    BaseUrl VARCHAR(255) DEFAULT NULL,
    ApiKey VARCHAR(255) DEFAULT NULL,
    SecretKey VARCHAR(255) DEFAULT NULL,
    SyncInterval INT DEFAULT 30,
    IsActive TINYINT(1) DEFAULT 1,
    LastSyncAt DATETIME DEFAULT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 8. PARTITIONED AUDITING & API LOG TABLES
-- ============================================================

CREATE TABLE tblApiLog (
    ApiLogId INT NOT NULL AUTO_INCREMENT,
    SyncType VARCHAR(50) NOT NULL,
    Direction VARCHAR(20) NOT NULL,
    Endpoint VARCHAR(255) NOT NULL,
    RequestPayload LONGTEXT DEFAULT NULL,
    ResponsePayload LONGTEXT DEFAULT NULL,
    Status VARCHAR(20) NOT NULL,
    ErrorMessage LONGTEXT DEFAULT NULL,
    Timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ApiLogId, Timestamp)
) ENGINE=InnoDB
PARTITION BY RANGE (YEAR(Timestamp)) (
    PARTITION p2025 VALUES LESS THAN (2026),
    PARTITION p2026 VALUES LESS THAN (2027),
    PARTITION p2027 VALUES LESS THAN (2028),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

CREATE TABLE tblAuditLog (
    AuditId INT NOT NULL AUTO_INCREMENT,
    UserId INT DEFAULT NULL,
    Action VARCHAR(100) NOT NULL,
    TableName VARCHAR(100) DEFAULT NULL,
    RecordId INT DEFAULT NULL,
    OldValues LONGTEXT DEFAULT NULL,
    NewValues LONGTEXT DEFAULT NULL,
    IPAddress VARCHAR(50) DEFAULT NULL,
    Timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (AuditId, Timestamp)
) ENGINE=InnoDB
PARTITION BY RANGE (YEAR(Timestamp)) (
    PARTITION p2025 VALUES LESS THAN (2026),
    PARTITION p2026 VALUES LESS THAN (2027),
    PARTITION p2027 VALUES LESS THAN (2028),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- ============================================================
-- 9. OPTIMIZATION INDEXES
-- ============================================================

CREATE INDEX IX_tblInventory_Warehouse_Item ON tblInventory (WarehouseId, ItemId);
CREATE INDEX IX_tblInventory_Bin ON tblInventory (BinId);
CREATE INDEX IX_tblBin_Barcode ON tblBin (Barcode);
CREATE INDEX IX_tblItem_Barcode ON tblItem (Barcode);
CREATE INDEX IX_tblBatch_ExpiryDate ON tblBatch (ExpiryDate);
CREATE INDEX IX_tblSerialNo_SerialNumber ON tblSerialNo (SerialNumber);
CREATE INDEX IX_tblPurchaseOrder_Status ON tblPurchaseOrder (Status);
CREATE INDEX IX_tblSalesOrder_Status ON tblSalesOrder (Status);
CREATE INDEX IX_tblPickList_Status ON tblPickList (Status);
CREATE INDEX IX_tblReservation_SO ON tblReservation (SOId);
CREATE INDEX IX_tblDamage_ItemId ON tblDamage (ItemId);
CREATE INDEX IX_tblDamage_Status ON tblDamage (Status);
CREATE INDEX IX_tblCycleCount_WarehouseId ON tblCycleCount (WarehouseId);
CREATE INDEX IX_tblCCDetail_CycleCountId ON tblCycleCountDetail (CycleCountId);
CREATE INDEX IX_tblPickListWave_Status ON tblPickListWave (Status);
CREATE INDEX IX_tblAuditLog_Timestamp ON tblAuditLog (Timestamp DESC);
CREATE INDEX IX_tblApiLog_Status_Timestamp ON tblApiLog (Status, Timestamp DESC);

-- ============================================================
-- 10. DATABASE ANALYSIS VIEWS
-- ============================================================

CREATE VIEW vw_InventoryStatus AS
SELECT 
    i.InventoryId,
    w.WarehouseId,
    w.Code AS WarehouseCode,
    w.Name AS WarehouseName,
    z.ZoneId,
    z.Code AS ZoneCode,
    z.Name AS ZoneName,
    b.BinId,
    b.Code AS BinCode,
    b.Barcode AS BinBarcode,
    item.ItemId,
    item.Code AS ItemCode,
    item.Name AS ItemName,
    item.Category AS ItemCategory,
    item.UOM AS ItemUOM,
    item.Weight AS ItemWeight,
    item.Volume AS ItemVolume,
    item.UnitCost AS ItemUnitCost,
    batch.BatchId,
    batch.BatchNumber,
    batch.ExpiryDate,
    i.Quantity,
    i.ReservedQty,
    (i.Quantity - i.ReservedQty) AS AvailableQty,
    (i.Quantity * COALESCE(item.UnitCost, 0)) AS StockValue
FROM tblInventory i
INNER JOIN tblWarehouse w ON i.WarehouseId = w.WarehouseId
INNER JOIN tblZone z ON i.ZoneId = z.ZoneId
INNER JOIN tblBin b ON i.BinId = b.BinId
INNER JOIN tblItem item ON i.ItemId = item.ItemId
LEFT JOIN tblBatch batch ON i.BatchId = batch.BatchId;

CREATE VIEW vw_PendingGRN AS
SELECT 
    po.POId,
    po.POCode,
    po.VendorName,
    po.VendorCode,
    po.OrderDate,
    pod.PODetailId,
    item.ItemId,
    item.Code AS ItemCode,
    item.Name AS ItemName,
    item.UOM AS ItemUOM,
    pod.OrderQty,
    pod.ReceivedQty,
    (pod.OrderQty - pod.ReceivedQty) AS PendingQty
FROM tblPurchaseOrder po
INNER JOIN tblPurchaseOrderDetail pod ON po.POId = pod.POId
INNER JOIN tblItem item ON pod.ItemId = item.ItemId
WHERE po.Status IN ('PENDING', 'PARTIAL') AND (pod.OrderQty - pod.ReceivedQty) > 0;

CREATE VIEW vw_PendingQC AS
SELECT 
    g.GRNId,
    g.GRNCode,
    g.ReceivedDate,
    g.InvoiceNo,
    po.POCode,
    g.Status,
    u.FullName AS ReceivedBy
FROM tblGRN g
LEFT JOIN tblPurchaseOrder po ON g.POId = po.POId
INNER JOIN tblUser u ON g.ReceivedBy = u.UserId
WHERE g.Status = 'PENDING';

CREATE VIEW vw_PendingPutaway AS
SELECT 
    gd.GRNDetailId,
    g.GRNId,
    g.GRNCode,
    item.ItemId,
    item.Code AS ItemCode,
    item.Name AS ItemName,
    batch.BatchId,
    batch.BatchNumber,
    gd.AcceptedQty,
    gd.PutawayQty,
    (gd.AcceptedQty - gd.PutawayQty) AS PendingPutawayQty
FROM tblGRNDetail gd
INNER JOIN tblGRN g ON gd.GRNId = g.GRNId
INNER JOIN tblItem item ON gd.ItemId = item.ItemId
LEFT JOIN tblBatch batch ON gd.BatchId = batch.BatchId
WHERE g.Status = 'QC_COMPLETED' AND (gd.AcceptedQty - gd.PutawayQty) > 0;

CREATE VIEW vw_PendingPick AS
SELECT 
    so.SOId,
    so.SOCode,
    so.CustomerName,
    so.OrderDate,
    sod.SODetailId,
    item.ItemId,
    item.Code AS ItemCode,
    item.Name AS ItemName,
    sod.OrderQty,
    sod.ReservedQty,
    sod.PickedQty,
    (sod.OrderQty - sod.PickedQty) AS PendingPickQty
FROM tblSalesOrder so
INNER JOIN tblSalesOrderDetail sod ON so.SOId = sod.SOId
INNER JOIN tblItem item ON sod.ItemId = item.ItemId
WHERE so.Status IN ('PENDING', 'RESERVED', 'PARTIAL_PICKED') AND (sod.OrderQty - sod.PickedQty) > 0;

CREATE VIEW vw_WarehouseOccupancy AS
SELECT 
    w.WarehouseId,
    w.Code AS WarehouseCode,
    w.Name AS WarehouseName,
    COUNT(b.BinId) AS TotalBins,
    SUM(b.CapacityWeight) AS TotalCapacityWeight,
    SUM(b.OccupiedWeight) AS TotalOccupiedWeight,
    CASE 
        WHEN SUM(b.CapacityWeight) > 0 THEN (SUM(b.OccupiedWeight) / SUM(b.CapacityWeight)) * 100 
        ELSE 0 
    END AS WeightOccupancyPercentage,
    SUM(b.CapacityVolume) AS TotalCapacityVolume,
    SUM(b.OccupiedVolume) AS TotalOccupiedVolume,
    CASE 
        WHEN SUM(b.CapacityVolume) > 0 THEN (SUM(b.OccupiedVolume) / SUM(b.CapacityVolume)) * 100 
        ELSE 0 
    END AS VolumeOccupancyPercentage
FROM tblWarehouse w
INNER JOIN tblZone z ON w.WarehouseId = z.WarehouseId
INNER JOIN tblRack r ON z.ZoneId = r.ZoneId
INNER JOIN tblShelf s ON r.RackId = s.RackId
INNER JOIN tblBin b ON s.ShelfId = b.ShelfId
GROUP BY w.WarehouseId, w.Code, w.Name;

-- ============================================================
-- 11. STORED PROCEDURES
-- ============================================================

DELIMITER //

CREATE PROCEDURE sp_AllocateBinForPutaway(
    IN p_ItemId INT,
    IN p_Qty DECIMAL(18,4),
    IN p_PreferredWarehouseId INT
)
BEGIN
    DECLARE v_ItemWeight DECIMAL(18,4);
    DECLARE v_ItemVolume DECIMAL(18,4);
    
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
END //

CREATE PROCEDURE sp_ReserveInventory(
    IN p_SOId INT,
    IN p_UserId INT
)
BEGIN
    DECLARE v_TotalQty DECIMAL(18,4);
    DECLARE v_TotalReserved DECIMAL(18,4);
    DECLARE v_PickingRule VARCHAR(50);
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Retrieve current picking rule from settings
    SELECT COALESCE(SettingValue, 'FIFO') INTO v_PickingRule 
    FROM tblUserSetting 
    WHERE SettingKey = 'PICKING_RULE_FIFO_FEFO';

    CREATE TEMPORARY TABLE IF NOT EXISTS temp_allocations (
        SODetailId INT,
        ItemId INT,
        InventoryId INT,
        BinId INT,
        BatchId INT,
        AllocateQty DECIMAL(18,4)
    ) ENGINE=MEMORY;

    TRUNCATE TABLE temp_allocations;

    INSERT INTO temp_allocations (SODetailId, ItemId, InventoryId, BinId, BatchId, AllocateQty)
    SELECT
        sl.SODetailId,
        sl.ItemId,
        ri.InventoryId,
        ri.BinId,
        ri.BatchId,
        CASE
            WHEN (ri.CumulativeAvailable - ri.AvailableQty) >= sl.PendingQty THEN 0
            WHEN ri.CumulativeAvailable <= sl.PendingQty THEN ri.AvailableQty
            ELSE sl.PendingQty - (ri.CumulativeAvailable - ri.AvailableQty)
        END AS AllocateQty
    FROM (
        SELECT SODetailId, ItemId, (OrderQty - ReservedQty) AS PendingQty
        FROM tblSalesOrderDetail
        WHERE SOId = p_SOId AND (OrderQty - ReservedQty) > 0
    ) sl
    INNER JOIN (
        SELECT
            i.InventoryId,
            i.BinId,
            i.BatchId,
            i.ItemId,
            (i.Quantity - i.ReservedQty) AS AvailableQty,
            SUM(i.Quantity - i.ReservedQty) OVER (
                PARTITION BY i.ItemId
                ORDER BY
                    -- FEFO sort keys
                    CASE WHEN v_PickingRule = 'FEFO' THEN (CASE WHEN bat.ExpiryDate IS NULL THEN 1 ELSE 0 END) ELSE 0 END ASC,
                    CASE WHEN v_PickingRule = 'FEFO' THEN bat.ExpiryDate END ASC,
                    -- FIFO sort keys
                    CASE WHEN v_PickingRule = 'FIFO' THEN (CASE WHEN bat.ManufactureDate IS NULL THEN 1 ELSE 0 END) ELSE 0 END ASC,
                    CASE WHEN v_PickingRule = 'FIFO' THEN bat.ManufactureDate END ASC,
                    -- Default fallback
                    i.BatchId ASC,
                    i.InventoryId ASC
            ) AS CumulativeAvailable
        FROM tblInventory i
        LEFT JOIN tblBatch bat ON i.BatchId = bat.BatchId
        WHERE (i.Quantity - i.ReservedQty) > 0
    ) ri ON ri.ItemId = sl.ItemId
    WHERE (ri.CumulativeAvailable - ri.AvailableQty) < sl.PendingQty;

    INSERT INTO tblReservation (SOId, ItemId, BinId, BatchId, Quantity, Status, CreatedAt)
    SELECT p_SOId, ItemId, BinId, BatchId, AllocateQty, 'ACTIVE', NOW()
    FROM temp_allocations
    WHERE AllocateQty > 0;

    UPDATE tblInventory i
    INNER JOIN (
        SELECT InventoryId, SUM(AllocateQty) AS AllocateQty
        FROM temp_allocations
        WHERE AllocateQty > 0
        GROUP BY InventoryId
    ) a ON i.InventoryId = a.InventoryId
    SET i.ReservedQty = i.ReservedQty + a.AllocateQty,
        i.UpdatedAt = NOW();

    UPDATE tblSalesOrderDetail sod
    INNER JOIN (
        SELECT SODetailId, SUM(AllocateQty) AS TotalAllocated
        FROM temp_allocations
        WHERE AllocateQty > 0
        GROUP BY SODetailId
    ) a ON sod.SODetailId = a.SODetailId
    SET sod.ReservedQty = sod.ReservedQty + a.TotalAllocated;

    SELECT SUM(OrderQty), SUM(ReservedQty)
    INTO v_TotalQty, v_TotalReserved
    FROM tblSalesOrderDetail
    WHERE SOId = p_SOId;

    IF v_TotalReserved >= v_TotalQty THEN
        UPDATE tblSalesOrder SET Status = 'RESERVED', UpdatedAt = NOW() WHERE SOId = p_SOId;
    ELSEIF v_TotalReserved > 0 THEN
        UPDATE tblSalesOrder SET Status = 'PARTIAL_RESERVED', UpdatedAt = NOW() WHERE SOId = p_SOId;
    END IF;

    COMMIT;
    
    SELECT 1 AS Success, 'Reservation completed successfully.' AS Message;
END //

CREATE PROCEDURE sp_ProcessGRN(
    IN p_GRNId INT,
    IN p_UserId INT
)
BEGIN
    DECLARE v_POId INT;
    DECLARE v_TotalOrdered DECIMAL(18,4);
    DECLARE v_TotalReceived DECIMAL(18,4);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    UPDATE tblGRN 
    SET Status = 'QC_COMPLETED', UpdatedAt = NOW()
    WHERE GRNId = p_GRNId;

    SELECT POId INTO v_POId FROM tblGRN WHERE GRNId = p_GRNId;

    IF v_POId IS NOT NULL THEN
        UPDATE tblPurchaseOrderDetail pod
        INNER JOIN tblGRNDetail gd ON pod.ItemId = gd.ItemId
        SET pod.ReceivedQty = pod.ReceivedQty + gd.AcceptedQty
        WHERE gd.GRNId = p_GRNId AND pod.POId = v_POId;

        SELECT SUM(OrderQty), SUM(ReceivedQty)
        INTO v_TotalOrdered, v_TotalReceived
        FROM tblPurchaseOrderDetail
        WHERE POId = v_POId;

        IF v_TotalReceived >= v_TotalOrdered THEN
            UPDATE tblPurchaseOrder SET Status = 'COMPLETED', UpdatedAt = NOW() WHERE POId = v_POId;
        ELSE
            UPDATE tblPurchaseOrder SET Status = 'PARTIAL', UpdatedAt = NOW() WHERE POId = v_POId;
        END IF;
    END IF;

    COMMIT;
    SELECT 1 AS Success, 'GRN processed successfully.' AS Message;
END //

CREATE PROCEDURE sp_ProcessPutaway(
    IN p_GRNDetailId INT,
    IN p_BinId INT,
    IN p_Quantity DECIMAL(18,4),
    IN p_UserId INT
)
BEGIN
    DECLARE v_ItemId INT;
    DECLARE v_BatchId INT;
    DECLARE v_GRNId INT;
    DECLARE v_WarehouseId INT;
    DECLARE v_ZoneId INT;
    DECLARE v_ItemWeight DECIMAL(18,4);
    DECLARE v_ItemVolume DECIMAL(18,4);
    DECLARE v_TotalAccepted DECIMAL(18,4);
    DECLARE v_TotalPutaway DECIMAL(18,4);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT ItemId, BatchId, GRNId
    INTO v_ItemId, v_BatchId, v_GRNId
    FROM tblGRNDetail WHERE GRNDetailId = p_GRNDetailId;

    SELECT z.WarehouseId, z.ZoneId 
    INTO v_WarehouseId, v_ZoneId
    FROM tblBin b
    INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
    INNER JOIN tblRack r  ON s.RackId = r.RackId
    INNER JOIN tblZone z  ON r.ZoneId = z.ZoneId
    WHERE b.BinId = p_BinId;

    SELECT 
        CASE WHEN COALESCE(Weight, 0) > 0 THEN Weight ELSE 2.0 END,
        CASE WHEN COALESCE(Volume, 0) > 0 THEN Volume ELSE 1.5 END
    INTO v_ItemWeight, v_ItemVolume
    FROM tblItem WHERE ItemId = v_ItemId;

    IF EXISTS (
        SELECT 1 FROM tblInventory 
        WHERE BinId = p_BinId AND ItemId = v_ItemId 
          AND (BatchId = v_BatchId OR (BatchId IS NULL AND v_BatchId IS NULL))
    ) THEN
        UPDATE tblInventory
        SET Quantity = Quantity + p_Quantity, UpdatedAt = NOW()
        WHERE BinId = p_BinId AND ItemId = v_ItemId 
          AND (BatchId = v_BatchId OR (BatchId IS NULL AND v_BatchId IS NULL));
    ELSE
        INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, BatchId, Quantity, ReservedQty, UpdatedAt)
        VALUES (v_WarehouseId, v_ZoneId, p_BinId, v_ItemId, v_BatchId, p_Quantity, 0.00, NOW());
    END IF;

    UPDATE tblGRNDetail
    SET PutawayQty = PutawayQty + p_Quantity
    WHERE GRNDetailId = p_GRNDetailId;

    SET @AddWeight = p_Quantity * v_ItemWeight;
    SET @AddVolume = p_Quantity * v_ItemVolume;

    -- Validate capacity weight and volume limits
    SELECT CapacityWeight, CapacityVolume, OccupiedWeight, OccupiedVolume
    INTO @CapWeight, @CapVolume, @OccWeight, @OccVolume
    FROM tblBin
    WHERE BinId = p_BinId;

    IF (@OccWeight + @AddWeight > @CapWeight) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Putaway failed: Target bin exceeds maximum weight capacity.';
    END IF;

    IF (@OccVolume + @AddVolume > @CapVolume) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Putaway failed: Target bin exceeds maximum volume capacity.';
    END IF;

    UPDATE tblBin
    SET OccupiedWeight = OccupiedWeight + @AddWeight,
        OccupiedVolume = OccupiedVolume + @AddVolume
    WHERE BinId = p_BinId;

    INSERT INTO tblPutaway (GRNDetailId, ItemId, BinId, BatchId, Quantity, PutawayBy, PutawayDate, Status)
    VALUES (p_GRNDetailId, v_ItemId, p_BinId, v_BatchId, p_Quantity, p_UserId, NOW(), 'COMPLETED');

    SELECT SUM(AcceptedQty), SUM(PutawayQty)
    INTO v_TotalAccepted, v_TotalPutaway
    FROM tblGRNDetail
    WHERE GRNId = v_GRNId;

    IF v_TotalPutaway >= v_TotalAccepted THEN
        UPDATE tblGRN SET Status = 'PUTAWAY_COMPLETED' WHERE GRNId = v_GRNId;
    END IF;

    COMMIT;
    SELECT 1 AS Success, 'Putaway executed successfully.' AS Message;
END //

DELIMITER ;

-- ============================================================
-- 12. DATABASE TRIGGER TRIGGERS (AUDIT)
-- ============================================================

DELIMITER //

CREATE TRIGGER tr_tblInventory_PreventMixedProducts_Insert
BEFORE INSERT ON tblInventory
FOR EACH ROW
BEGIN
    IF NEW.Quantity > 0 AND EXISTS (
        SELECT 1 FROM tblInventory 
        WHERE BinId = NEW.BinId AND ItemId != NEW.ItemId AND Quantity > 0
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operation failed: Target bin already contains a different product.';
    END IF;
END //

CREATE TRIGGER tr_tblInventory_PreventMixedProducts_Update
BEFORE UPDATE ON tblInventory
FOR EACH ROW
BEGIN
    IF NEW.Quantity > 0 AND EXISTS (
        SELECT 1 FROM tblInventory 
        WHERE BinId = NEW.BinId AND ItemId != NEW.ItemId AND Quantity > 0
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operation failed: Target bin already contains a different product.';
    END IF;
END //

CREATE TRIGGER tr_InventoryAudit_Insert
AFTER INSERT ON tblInventory
FOR EACH ROW
BEGIN
    INSERT INTO tblAuditLog (UserId, Action, TableName, RecordId, OldValues, NewValues, IPAddress, Timestamp)
    VALUES (
        NULL,
        'INSERT',
        'tblInventory',
        NEW.InventoryId,
        NULL,
        JSON_OBJECT('WarehouseId', NEW.WarehouseId, 'BinId', NEW.BinId, 'ItemId', NEW.ItemId, 'Quantity', NEW.Quantity, 'ReservedQty', NEW.ReservedQty),
        'SYSTEM',
        NOW()
    );
END //

CREATE TRIGGER tr_InventoryAudit_Update
AFTER UPDATE ON tblInventory
FOR EACH ROW
BEGIN
    INSERT INTO tblAuditLog (UserId, Action, TableName, RecordId, OldValues, NewValues, IPAddress, Timestamp)
    VALUES (
        NULL,
        'UPDATE',
        'tblInventory',
        NEW.InventoryId,
        JSON_OBJECT('WarehouseId', OLD.WarehouseId, 'BinId', OLD.BinId, 'ItemId', OLD.ItemId, 'Quantity', OLD.Quantity, 'ReservedQty', OLD.ReservedQty),
        JSON_OBJECT('WarehouseId', NEW.WarehouseId, 'BinId', NEW.BinId, 'ItemId', NEW.ItemId, 'Quantity', NEW.Quantity, 'ReservedQty', NEW.ReservedQty),
        'SYSTEM',
        NOW()
    );
END //

CREATE TRIGGER tr_InventoryAudit_Delete
AFTER DELETE ON tblInventory
FOR EACH ROW
BEGIN
    INSERT INTO tblAuditLog (UserId, Action, TableName, RecordId, OldValues, NewValues, IPAddress, Timestamp)
    VALUES (
        NULL,
        'DELETE',
        'tblInventory',
        OLD.InventoryId,
        JSON_OBJECT('WarehouseId', OLD.WarehouseId, 'BinId', OLD.BinId, 'ItemId', OLD.ItemId, 'Quantity', OLD.Quantity, 'ReservedQty', OLD.ReservedQty),
        NULL,
        'SYSTEM',
        NOW()
    );
END //

DELIMITER ;

-- ============================================================
-- 13. SEED INITIAL DATA
-- ============================================================

-- Seed Roles
INSERT INTO tblRole (RoleName, Description, IsActive) VALUES 
('Admin', 'System Administrator with full access', 1),
('Warehouse Manager', 'Oversees all warehouse operations', 1),
('Supervisor', 'Manages tasks, stock audits, and approvals', 1),
('GRN Operator', 'Performs goods receiving and entry', 1),
('QC Operator', 'Inspects received goods and logs quality status', 1),
('Picker', 'Retrieves items from bins for order fulfillment', 1),
('Packer', 'Packages picked goods and prepares shipping labels', 1),
('Dispatcher', 'Logs transport details and executes dispatch', 1),
('Auditor', 'Performs stock physical verification and cycle counts', 1);

-- Seed Users (Pre-hashed password 'admin123' using bcrypt)
INSERT INTO tblUser (Username, Email, PasswordHash, RoleId, FullName, WarehouseId, IsActive) VALUES
('admin', 'admin@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 1, 'System Admin', 1, 1),
('manager', 'manager@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 2, 'Warehouse Manager', 1, 1),
('grn_user', 'grn@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 4, 'GRN Operator', 1, 1),
('qc_user', 'qc@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 5, 'QC Inspector', 1, 1),
('picker_user', 'picker@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 6, 'Order Picker', 1, 1),
('packer_user', 'packer@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 7, 'Order Packer', 1, 1),
('dispatcher_user', 'dispatch@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 8, 'Dispatcher Agent', 1, 1);

-- Seed Warehouses
INSERT INTO tblWarehouse (CompanyId, Code, Name, Address, IsActive) VALUES
('COMP01', 'WH-DEL', 'Delhi Main Warehouse', 'Sector 18, Okhla, New Delhi', 1),
('COMP01', 'WH-BOM', 'Mumbai Port Warehouse', 'JNPT Area, Navi Mumbai', 1);

-- Seed Zones
INSERT INTO tblZone (WarehouseId, Code, Name, IsActive) VALUES
(1, 'Z-INB', 'Delhi Inbound receiving zone', 1),
(1, 'Z-BULK', 'Delhi Bulk Storage rack zone', 1),
(1, 'Z-OUTB', 'Delhi Packing & Outbound zone', 1),
(2, 'Z-GEN', 'Mumbai General Storage zone', 1);

-- Seed Aisle
INSERT INTO tblAisle (ZoneId, Code, Name, IsActive) VALUES
(2, 'A-01', 'Delhi Bulk Storage Aisle 01', 1),
(4, 'A-01', 'Mumbai General Storage Aisle 01', 1);

-- Seed Racks
INSERT INTO tblRack (ZoneId, AisleId, Code, Name, IsActive) VALUES
(2, 1, 'R-01', 'Bulk Rack 01', 1),
(2, 1, 'R-02', 'Bulk Rack 02', 1),
(2, 1, 'R-03', 'Bulk Rack 03', 1),
(4, 2, 'R-01', 'Mumbai General Rack 01', 1);

-- Seed Shelves
INSERT INTO tblShelf (RackId, Code, Name, IsActive) VALUES
(1, 'S-01', 'Rack 01 Shelf 01', 1),
(1, 'S-02', 'Rack 01 Shelf 02', 1),
(2, 'S-01', 'Rack 02 Shelf 01', 1),
(4, 'S-01', 'Mumbai Rack 01 Shelf 01', 1);

-- Seed Bins
INSERT INTO tblBin (ShelfId, Code, Barcode, CapacityWeight, CapacityVolume, OccupiedWeight, OccupiedVolume, IsActive) VALUES
(1, 'WH01-Z02-R01-S01-B01', 'WH01Z02R01S01B01', 1000.0, 500.0, 0.0, 0.0, 1),
(1, 'WH01-Z02-R01-S01-B02', 'WH01Z02R01S01B02', 1000.0, 500.0, 0.0, 0.0, 1),
(2, 'WH01-Z02-R01-S02-B01', 'WH01Z02R01S02B01', 1000.0, 500.0, 0.0, 0.0, 1),
(2, 'WH01-Z02-R01-S02-B02', 'WH01Z02R01S02B02', 1000.0, 500.0, 0.0, 0.0, 1),
(3, 'WH01-Z02-R02-S01-B01', 'WH01Z02R02S01B01', 1000.0, 500.0, 0.0, 0.0, 1),
(4, 'WH02-Z01-R01-S01-B01', 'WH02Z01R01S01B01', 2000.0, 1000.0, 0.0, 0.0, 1);

-- Seed Items
INSERT INTO tblItem (Code, Name, Description, Category, Brand, UOM, Barcode, Weight, Volume, UnitCost, SellingPrice, TrackBatch, TrackSerial, MinStock, MaxStock, IsActive) VALUES
('ITM-001', 'Logitech G102 Mouse', 'Wired Gaming Mouse with RGB', 'Peripherals', 'Logitech', 'PCS', '8901012345671', 0.1500, 0.3500, 600.00, 850.00, 0, 0, 10, 500, 1),
('ITM-002', 'Dell KB216 Keyboard', 'Standard Multimedia USB Keyboard', 'Peripherals', 'Dell', 'PCS', '8901012345672', 0.4500, 1.2000, 480.00, 700.00, 0, 0, 10, 500, 1),
('ITM-003', 'Crucial MX500 SSD 500GB', 'SATA 2.5 Inch Internal Solid State Drive', 'Storage', 'Crucial', 'PCS', '8901012345673', 0.0600, 0.1000, 3500.00, 4800.00, 1, 1, 5, 200, 1),
('ITM-004', 'Lenovo ThinkPad E14', 'Intel Core i5 11th Gen Laptop', 'Laptops', 'Lenovo', 'PCS', '8901012345674', 1.6400, 3.5000, 52000.00, 65000.00, 1, 1, 2, 50, 1),
('ITM-005', 'HP LaserJet Pro M12w', 'Single Function Monochrome Printer', 'Printers', 'HP', 'PCS', '8901012345675', 5.2000, 12.0000, 12500.00, 15500.00, 0, 0, 1, 20, 1);

-- Seed Batches
INSERT INTO tblBatch (ItemId, BatchNumber, ManufactureDate, ExpiryDate) VALUES
(3, 'BAT-SSD-001', '2026-01-01', '2031-01-01'),
(3, 'BAT-SSD-002', '2026-03-01', '2031-03-01'),
(4, 'BAT-LP-2026A', '2026-02-01', '2029-02-01');

-- Seed Serials
INSERT INTO tblSerialNo (ItemId, BatchId, SerialNumber, Status) VALUES
(3, 1, 'SN-SSD-1001', 'IN_STOCK'),
(3, 1, 'SN-SSD-1002', 'IN_STOCK'),
(3, 2, 'SN-SSD-2001', 'IN_STOCK'),
(4, 3, 'SN-LEN-9901', 'IN_STOCK'),
(4, 3, 'SN-LEN-9902', 'IN_STOCK');

-- Seed Purchase Orders
INSERT INTO tblPurchaseOrder (POCode, VendorName, VendorCode, OrderDate, DeliveryDate, Status) VALUES
('PO-2026-001', 'Supertron Electronics', 'VND-001', '2026-06-10', '2026-06-25', 'PENDING'),
('PO-2026-002', 'Redington India Ltd', 'VND-002', '2026-06-12', '2026-06-28', 'PARTIAL');

-- Seed Purchase Order Details
INSERT INTO tblPurchaseOrderDetail (POId, ItemId, OrderQty, ReceivedQty, UOM, UnitPrice) VALUES
(1, 1, 50.0, 0.0, 'PCS', 600.00),
(1, 2, 30.0, 0.0, 'PCS', 500.00),
(2, 3, 20.0, 10.0, 'PCS', 3500.00),
(2, 4, 5.0, 2.0, 'PCS', 52000.00);

-- Seed Sales Orders
INSERT INTO tblSalesOrder (SOCode, CustomerName, CustomerCode, OrderDate, Status) VALUES
('SO-2026-001', 'Apex Tech Solutions', 'CST-001', '2026-06-15', 'PENDING'),
('SO-2026-002', 'Prime Retailers', 'CST-002', '2026-06-16', 'PENDING');

-- Seed Sales Order Details
INSERT INTO tblSalesOrderDetail (SOId, ItemId, OrderQty, ReservedQty, PickedQty, ShippedQty, UOM, UnitPrice) VALUES
(1, 1, 10.0, 0.0, 0.0, 0.0, 'PCS', 850.00),
(1, 3, 5.0, 0.0, 0.0, 0.0, 'PCS', 4800.00),
(2, 2, 8.0, 0.0, 0.0, 0.0, 'PCS', 700.00),
(2, 4, 1.0, 0.0, 0.0, 0.0, 'PCS', 65000.00);

-- Seed ERP Configuration
INSERT INTO tblERPConfig (CompanyId, ERPName, SyncInterval, IsActive) VALUES 
('COMP01', 'BUSY Accounting', 30, 1);

-- Seed Feature Config (Only basic features enabled by default)
INSERT INTO tblFeatureConfig (Category, FeatureCode, DisplayName, IsEnabled) VALUES
('MODULE', 'MODULE_MULTI_WAREHOUSE', 'Multi Warehouse Management', 0),
('MODULE', 'MODULE_MULTI_BRANCH', 'Multi Branch Support', 0),
('MODULE', 'MODULE_MULTI_COMPANY', 'Multi Company Profiles', 0),
('MODULE', 'MODULE_PICKUP', 'Advanced Pickup Engine', 1),
('MODULE', 'MODULE_PUTAWAY', 'Advanced Putaway Engine', 1),
('MODULE', 'MODULE_DISPATCH', 'Advanced Outbound Dispatch', 1),
('MODULE', 'MODULE_BARCODE', 'Barcode Support Module', 0),
('MODULE', 'MODULE_BATCH', 'Batch Tracking & Expiry Controls', 0),
('MODULE', 'MODULE_SERIAL', 'Serial Number Tracking', 0),
('MODULE', 'MODULE_REPORTS', 'Enterprise Advanced Reports', 1),
('MODULE', 'MODULE_DASHBOARD', 'Enterprise KPI Dashboard', 1),
('MODULE', 'MODULE_BUSY_INTEGRATION', 'Busy Accounting ERP Auto Sync', 1),
('MODULE', 'MODULE_NOTIFICATIONS', 'Email/SMS/In-App Alerts', 0),
('MODULE', 'MODULE_APPROVAL_WORKFLOW', 'Multi-Level Approval Flow', 0);

-- Seed User Settings
INSERT INTO tblUserSetting (SettingKey, SettingValue, Description) VALUES
('DOC_FORMAT_PO', 'PO-{YYYY}-{NNN}', 'Document number format for Purchase Orders'),
('DOC_FORMAT_SO', 'SO-{YYYY}-{NNN}', 'Document number format for Sales Orders'),
('DOC_FORMAT_GRN', 'GRN-{NNN}', 'Document number format for Goods Receipt Notes'),
('DOC_FORMAT_PICK', 'PK-{NNN}', 'Document number format for Pick Lists'),
('DOC_FORMAT_PACK', 'PAC-{NNN}', 'Document number format for Packing Carton slips'),
('DOC_FORMAT_DISPATCH', 'DS-{NNN}', 'Document number format for Dispatch Challenge notes'),
('AUTO_NUMBERING', '1', 'Flag to enable automatic numbering (1=enabled, 0=disabled)'),
('APPROVAL_LEVELS_GRN', '1', 'Number of required approval tiers for GRN verification'),
('PICKING_RULE_FIFO_FEFO', 'FIFO', 'Algorithm used to reserve items (FIFO, FEFO, MANUAL)'),
('PUTAWAY_RULE_BIN_PRIORITY', '1', 'Enable capacity check & slot consolidation priority on putaway'),
('BARCODE_FORMAT', 'CODE128', 'Format type for barcode generation'),
('LABEL_SIZE', '4x6', 'Default label print size (e.g. 4x6, 3x2 inches)'),
('EMAIL_NOTIFICATIONS_ENABLED', '0', 'Enable system emails to managers (1=enabled, 0=disabled)'),
('SMS_NOTIFICATIONS_ENABLED', '0', 'Enable system SMS alerts (1=enabled, 0=disabled)'),
('DEFAULT_TAX_RATE', '18.00', 'Default GST tax rate in %');

-- Seed Permission Matrix for Roles (Admins have everything; managers/operators have selective actions)
INSERT INTO tblPermissionMatrix (RoleId, ResourceName, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
(1, 'Masters', 1, 1, 1, 1),
(1, 'Inbound', 1, 1, 1, 1),
(1, 'Inventory', 1, 1, 1, 1),
(1, 'Outbound', 1, 1, 1, 1),
(1, 'Reports', 1, 1, 1, 1),
(1, 'Settings', 1, 1, 1, 1),

(2, 'Masters', 1, 1, 1, 0),
(2, 'Inbound', 1, 1, 1, 0),
(2, 'Inventory', 1, 1, 1, 0),
(2, 'Outbound', 1, 1, 1, 0),
(2, 'Reports', 1, 1, 1, 0),
(2, 'Settings', 1, 0, 1, 0),

(4, 'Masters', 1, 0, 0, 0),
(4, 'Inbound', 1, 1, 1, 0),
(4, 'Inventory', 1, 0, 0, 0),
(4, 'Outbound', 0, 0, 0, 0),
(4, 'Reports', 1, 0, 0, 0),

(6, 'Masters', 1, 0, 0, 0),
(6, 'Inbound', 0, 0, 0, 0),
(6, 'Inventory', 1, 0, 0, 0),
(6, 'Outbound', 1, 0, 1, 0),
(6, 'Reports', 0, 0, 0, 0);

-- Seed Suppliers
INSERT INTO tblSupplier (Code, Name, Add1, GSTIN) VALUES
('VND-001', 'Supertron Electronics', 'Nehru Place, New Delhi', '07AAAAS1234A1Z1'),
('VND-002', 'Redington India Ltd', 'Guindy, Chennai', '33AAAAR4321B2Z2'),
('VND-003', 'Lenovo India Pvt Ltd', 'Electronic City, Bangalore', '29AAAAK5678C3Z3'),
('VND-004', 'Crucial Technology Corp', 'Silicon Valley, California', '99AAAAC8888D4Z4'),
('VND-005', 'HP Enterprise Solutions', 'Cyber City, Gurgaon', '06AAAAH9999E5Z5');

-- Seed Customers
INSERT INTO tblCustomer (Code, Name, Add1, GSTIN) VALUES
('CST-001', 'Apex Tech Solutions', 'Noida Sec 62, UP', '09AAAAC5555F1Z6'),
('CST-002', 'Prime Retailers', 'Connaught Place, New Delhi', '07AAAAP7777G2Z7'),
('CST-003', 'Croma Electronics', 'Andheri East, Mumbai', '27AAAAC9999H3Z8'),
('CST-004', 'Reliance Digital', 'Ghansoli, Navi Mumbai', '27AAAAR2222I4Z9'),
('CST-009', 'Reliance Retail Ltd', 'Ghansoli, Navi Mumbai', '27AAAAR2222I4Z9');

-- Seed Barcode Templates
INSERT INTO tblBarcodeTemplate (
    Name, IsDefault, PageSize, LabelWidth, LabelHeight, MarginLeft, MarginTop, 
    RowsPerPage, ColsPerPage, GapX, GapY, Orientation, BarcodeType, BarcodePosition, 
    TextPosition, FontSize, FontStyle, Alignment, PrintItemName, PrintItemCode, 
    PrintSKU, PrintBarcodeNumber, PrintBatchNumber, PrintSerialNumber, PrintMRP, 
    PrintSalePrice, PrintMfgDate, PrintExpiryDate, PrintCompanyName, CompanyName
) VALUES (
    'Standard 50x30 Label', 1, 'CUSTOM', 50.00, 30.00, 2.00, 2.00, 
    1, 1, 1.00, 1.00, 'PORTRAIT', 'CODE128', 'CENTER', 
    'BOTTOM', 10, 'normal', 'center', 1, 1, 
    0, 1, 1, 0, 1, 
    1, 0, 0, 1, 'BusyWMS Enterprise'
);
