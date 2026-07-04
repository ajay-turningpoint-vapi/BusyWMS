-- WMS Database Schema Script for Microsoft SQL Server (MSSQL)
-- Create Tables with Primary Keys, Foreign Keys, and Indexes

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'BusyWMS')
BEGIN
    CREATE DATABASE BusyWMS;
END
GO

USE BusyWMS;
GO

-- Drop tables if they exist (clean setup)
-- Drop in reverse order of dependencies
IF OBJECT_ID('tblApiLog', 'U') IS NOT NULL DROP TABLE tblApiLog;
IF OBJECT_ID('tblAuditLog', 'U') IS NOT NULL DROP TABLE tblAuditLog;
IF OBJECT_ID('tblERPConfig', 'U') IS NOT NULL DROP TABLE tblERPConfig;
IF OBJECT_ID('tblCycleCountDetail', 'U') IS NOT NULL DROP TABLE tblCycleCountDetail;
IF OBJECT_ID('tblCycleCount', 'U') IS NOT NULL DROP TABLE tblCycleCount;
IF OBJECT_ID('tblDamage', 'U') IS NOT NULL DROP TABLE tblDamage;
IF OBJECT_ID('tblReturns', 'U') IS NOT NULL DROP TABLE tblReturns;
IF OBJECT_ID('tblStockTransfer', 'U') IS NOT NULL DROP TABLE tblStockTransfer;
IF OBJECT_ID('tblDispatch', 'U') IS NOT NULL DROP TABLE tblDispatch;
IF OBJECT_ID('tblPacking', 'U') IS NOT NULL DROP TABLE tblPacking;
IF OBJECT_ID('tblPickListDetail', 'U') IS NOT NULL DROP TABLE tblPickListDetail;
IF OBJECT_ID('tblPickList', 'U') IS NOT NULL DROP TABLE tblPickList;
IF OBJECT_ID('tblPickListWave', 'U') IS NOT NULL DROP TABLE tblPickListWave;
IF OBJECT_ID('tblReservation', 'U') IS NOT NULL DROP TABLE tblReservation;
IF OBJECT_ID('tblSalesOrderDetail', 'U') IS NOT NULL DROP TABLE tblSalesOrderDetail;
IF OBJECT_ID('tblSalesOrder', 'U') IS NOT NULL DROP TABLE tblSalesOrder;
IF OBJECT_ID('tblInventory', 'U') IS NOT NULL DROP TABLE tblInventory;
IF OBJECT_ID('tblPutaway', 'U') IS NOT NULL DROP TABLE tblPutaway;
IF OBJECT_ID('tblQC', 'U') IS NOT NULL DROP TABLE tblQC;
IF OBJECT_ID('tblGRNDetail', 'U') IS NOT NULL DROP TABLE tblGRNDetail;
IF OBJECT_ID('tblGRN', 'U') IS NOT NULL DROP TABLE tblGRN;
IF OBJECT_ID('tblPurchaseOrderDetail', 'U') IS NOT NULL DROP TABLE tblPurchaseOrderDetail;
IF OBJECT_ID('tblPurchaseOrder', 'U') IS NOT NULL DROP TABLE tblPurchaseOrder;
IF OBJECT_ID('tblSerialNo', 'U') IS NOT NULL DROP TABLE tblSerialNo;
IF OBJECT_ID('tblBatch', 'U') IS NOT NULL DROP TABLE tblBatch;
IF OBJECT_ID('tblItem', 'U') IS NOT NULL DROP TABLE tblItem;
IF OBJECT_ID('tblBin', 'U') IS NOT NULL DROP TABLE tblBin;
IF OBJECT_ID('tblShelf', 'U') IS NOT NULL DROP TABLE tblShelf;
IF OBJECT_ID('tblRack', 'U') IS NOT NULL DROP TABLE tblRack;
IF OBJECT_ID('tblAisle', 'U') IS NOT NULL DROP TABLE tblAisle;
IF OBJECT_ID('tblZone', 'U') IS NOT NULL DROP TABLE tblZone;
IF OBJECT_ID('tblWarehouse', 'U') IS NOT NULL DROP TABLE tblWarehouse;
IF OBJECT_ID('tblUser', 'U') IS NOT NULL DROP TABLE tblUser;
IF OBJECT_ID('tblRole', 'U') IS NOT NULL DROP TABLE tblRole;
GO

-- 1. tblRole
CREATE TABLE tblRole (
    RoleId INT IDENTITY(1,1) PRIMARY KEY,
    RoleName VARCHAR(50) NOT NULL UNIQUE,
    Description VARCHAR(255),
    IsActive BIT DEFAULT 1 NOT NULL,
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- 2. tblUser
CREATE TABLE tblUser (
    UserId INT IDENTITY(1,1) PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    Email VARCHAR(100) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    RoleId INT FOREIGN KEY REFERENCES tblRole(RoleId),
    FullName VARCHAR(100) NOT NULL,
    WarehouseId INT, -- Default Warehouse
    IsActive BIT DEFAULT 1 NOT NULL,
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE()
);

-- 3. tblWarehouse
CREATE TABLE tblWarehouse (
    WarehouseId INT IDENTITY(1,1) PRIMARY KEY,
    CompanyId VARCHAR(50) NOT NULL DEFAULT 'COMP01',
    Code VARCHAR(20) NOT NULL UNIQUE,
    Name VARCHAR(100) NOT NULL,
    Address VARCHAR(255),
    IsActive BIT DEFAULT 1 NOT NULL,
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- 4. tblZone
CREATE TABLE tblZone (
    ZoneId INT IDENTITY(1,1) PRIMARY KEY,
    WarehouseId INT NOT NULL FOREIGN KEY REFERENCES tblWarehouse(WarehouseId),
    Code VARCHAR(20) NOT NULL,
    Name VARCHAR(100) NOT NULL,
    IsActive BIT DEFAULT 1 NOT NULL,
    CONSTRAINT UQ_Warehouse_Zone UNIQUE (WarehouseId, Code)
);

-- 4b. tblAisle (Warehouse → Zone → Aisle → Rack → Shelf → Bin)
-- Phase 2: completes the 6-level warehouse location hierarchy
CREATE TABLE tblAisle (
    AisleId  INT IDENTITY(1,1) PRIMARY KEY,
    ZoneId   INT NOT NULL FOREIGN KEY REFERENCES tblZone(ZoneId),
    Code     VARCHAR(20) NOT NULL,
    Name     VARCHAR(100) NOT NULL,
    IsActive BIT DEFAULT 1 NOT NULL,
    CONSTRAINT UQ_Zone_Aisle UNIQUE (ZoneId, Code)
);

-- 5. tblRack
CREATE TABLE tblRack (
    RackId  INT IDENTITY(1,1) PRIMARY KEY,
    ZoneId  INT NOT NULL FOREIGN KEY REFERENCES tblZone(ZoneId),
    AisleId INT FOREIGN KEY REFERENCES tblAisle(AisleId),  -- Phase 2: optional Aisle grouping
    Code    VARCHAR(20) NOT NULL,
    Name    VARCHAR(100) NOT NULL,
    IsActive BIT DEFAULT 1 NOT NULL,
    CONSTRAINT UQ_Zone_Rack UNIQUE (ZoneId, Code)
);

-- 6. tblShelf
CREATE TABLE tblShelf (
    ShelfId INT IDENTITY(1,1) PRIMARY KEY,
    RackId INT NOT NULL FOREIGN KEY REFERENCES tblRack(RackId),
    Code VARCHAR(20) NOT NULL,
    Name VARCHAR(100) NOT NULL,
    IsActive BIT DEFAULT 1 NOT NULL,
    CONSTRAINT UQ_Rack_Shelf UNIQUE (RackId, Code)
);

-- 7. tblBin
CREATE TABLE tblBin (
    BinId INT IDENTITY(1,1) PRIMARY KEY,
    ShelfId INT NOT NULL FOREIGN KEY REFERENCES tblShelf(ShelfId),
    Code VARCHAR(50) NOT NULL UNIQUE, -- E.g. WH01-Z01-R05-S02-B03
    Barcode VARCHAR(100) NOT NULL UNIQUE,
    CapacityWeight DECIMAL(18,4) DEFAULT 1000.00,
    CapacityVolume DECIMAL(18,4) DEFAULT 500.00,
    OccupiedWeight DECIMAL(18,4) DEFAULT 0.00,
    OccupiedVolume DECIMAL(18,4) DEFAULT 0.00,
    IsActive BIT DEFAULT 1 NOT NULL
);

-- 8. tblItem
CREATE TABLE tblItem (
    ItemId       INT IDENTITY(1,1) PRIMARY KEY,
    Code         VARCHAR(50)  NOT NULL UNIQUE,
    Name         VARCHAR(150) NOT NULL,
    Description  VARCHAR(255),
    Category     VARCHAR(100),
    Brand        VARCHAR(100),
    UOM          VARCHAR(20)  NOT NULL,
    Barcode      VARCHAR(100) UNIQUE,
    HSNCode      VARCHAR(20),                              -- Phase 2: GST/Customs classification
    TrackBatch   BIT DEFAULT 0 NOT NULL,
    TrackSerial  BIT DEFAULT 0 NOT NULL,
    Weight       DECIMAL(18,4) DEFAULT 0.00,               -- Phase 2: kg per unit (fixes BUG-012)
    Volume       DECIMAL(18,4) DEFAULT 0.00,               -- Phase 2: litre per unit
    UnitCost     DECIMAL(18,4) DEFAULT 0.00,               -- Phase 2: purchase cost per unit
    SellingPrice DECIMAL(18,4) DEFAULT 0.00,               -- Phase 2: selling price per unit
    MinStock     DECIMAL(18,4) DEFAULT 0.00,
    MaxStock     DECIMAL(18,4) DEFAULT 999999.00,
    PurchPrice   DECIMAL(18,4) DEFAULT 0.00,
    PurchDiscount DECIMAL(18,4) DEFAULT 0.00,
    AltSalePrice DECIMAL(18,4) DEFAULT 0.00,
    AltPurchPrice DECIMAL(18,4) DEFAULT 0.00,
    MRP          DECIMAL(18,4) DEFAULT 0.00,
    SaleDiscount DECIMAL(18,4) DEFAULT 0.00,
    MainUnit     VARCHAR(50) DEFAULT NULL,
    AltUnit      VARCHAR(50) DEFAULT NULL,
    Vendor       VARCHAR(150) DEFAULT NULL,
    Tax          VARCHAR(50) DEFAULT NULL,
    IsActive     BIT DEFAULT 1 NOT NULL,
    CreatedAt    DATETIME DEFAULT GETDATE(),
    UpdatedAt    DATETIME DEFAULT GETDATE()
);

-- 9. tblBatch
CREATE TABLE tblBatch (
    BatchId INT IDENTITY(1,1) PRIMARY KEY,
    ItemId INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    BatchNumber VARCHAR(50) NOT NULL,
    ManufactureDate DATETIME,
    ExpiryDate DATETIME,
    CreatedAt DATETIME DEFAULT GETDATE(),
    CONSTRAINT UQ_Item_Batch UNIQUE (ItemId, BatchNumber)
);

-- 10. tblSerialNo
CREATE TABLE tblSerialNo (
    SerialId INT IDENTITY(1,1) PRIMARY KEY,
    ItemId INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    BatchId INT FOREIGN KEY REFERENCES tblBatch(BatchId),
    SerialNumber VARCHAR(100) NOT NULL,
    Status VARCHAR(20) DEFAULT 'IN_STOCK' NOT NULL, -- IN_STOCK, QC_HOLD, PICKED, DISPATCHED, RETURNED, DAMAGED
    CONSTRAINT UQ_Item_Serial UNIQUE (ItemId, SerialNumber)
);

-- 11. tblPurchaseOrder
CREATE TABLE tblPurchaseOrder (
    POId INT IDENTITY(1,1) PRIMARY KEY,
    POCode VARCHAR(50) NOT NULL UNIQUE,
    VendorName VARCHAR(150) NOT NULL,
    VendorCode VARCHAR(50) NOT NULL,
    OrderDate DATETIME NOT NULL,
    DeliveryDate DATETIME,
    PreparedBy VARCHAR(100) NULL,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- PENDING, PARTIAL, COMPLETED, CANCELLED
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE()
);

-- 12. tblPurchaseOrderDetail
CREATE TABLE tblPurchaseOrderDetail (
    PODetailId INT IDENTITY(1,1) PRIMARY KEY,
    POId INT NOT NULL FOREIGN KEY REFERENCES tblPurchaseOrder(POId),
    ItemId INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    OrderQty DECIMAL(18,4) NOT NULL,
    ReceivedQty DECIMAL(18,4) DEFAULT 0.00 NOT NULL,
    UOM VARCHAR(20) NOT NULL,
    UnitPrice DECIMAL(18,4) DEFAULT 0.00
);

-- 13. tblGRN
CREATE TABLE tblGRN (
    GRNId INT IDENTITY(1,1) PRIMARY KEY,
    GRNCode VARCHAR(50) NOT NULL UNIQUE,
    POId INT FOREIGN KEY REFERENCES tblPurchaseOrder(POId),
    ReceivedDate DATETIME NOT NULL DEFAULT GETDATE(),
    InvoiceNo VARCHAR(50),
    ReceivedBy INT NOT NULL FOREIGN KEY REFERENCES tblUser(UserId),
    DocumentUrl VARCHAR(255),
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- PENDING, QC_COMPLETED, PUTAWAY_COMPLETED
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- 14. tblGRNDetail
CREATE TABLE tblGRNDetail (
    GRNDetailId INT IDENTITY(1,1) PRIMARY KEY,
    GRNId INT NOT NULL FOREIGN KEY REFERENCES tblGRN(GRNId),
    ItemId INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    BatchId INT FOREIGN KEY REFERENCES tblBatch(BatchId),
    ReceivedQty DECIMAL(18,4) NOT NULL,
    AcceptedQty DECIMAL(18,4) DEFAULT 0.00 NOT NULL,
    RejectedQty DECIMAL(18,4) DEFAULT 0.00 NOT NULL,
    PutawayQty DECIMAL(18,4) DEFAULT 0.00 NOT NULL,
    RejectionReason VARCHAR(255)
);

-- 15. tblQC
CREATE TABLE tblQC (
    QCId INT IDENTITY(1,1) PRIMARY KEY,
    GRNId INT NOT NULL FOREIGN KEY REFERENCES tblGRN(GRNId),
    CheckedBy INT NOT NULL FOREIGN KEY REFERENCES tblUser(UserId),
    CheckedDate DATETIME DEFAULT GETDATE(),
    Status VARCHAR(20) NOT NULL, -- APPROVED, REJECTED, PARTIAL
    Remarks VARCHAR(255),
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- 16. tblPutaway
CREATE TABLE tblPutaway (
    PutawayId INT IDENTITY(1,1) PRIMARY KEY,
    GRNDetailId INT NOT NULL FOREIGN KEY REFERENCES tblGRNDetail(GRNDetailId),
    ItemId INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    BinId INT NOT NULL FOREIGN KEY REFERENCES tblBin(BinId),
    BatchId INT FOREIGN KEY REFERENCES tblBatch(BatchId),
    Quantity DECIMAL(18,4) NOT NULL,
    PutawayBy INT NOT NULL FOREIGN KEY REFERENCES tblUser(UserId),
    PutawayDate DATETIME DEFAULT GETDATE(),
    Status VARCHAR(20) DEFAULT 'COMPLETED' NOT NULL
);

-- 17. tblInventory
CREATE TABLE tblInventory (
    InventoryId INT IDENTITY(1,1) PRIMARY KEY,
    WarehouseId INT NOT NULL FOREIGN KEY REFERENCES tblWarehouse(WarehouseId),
    ZoneId INT NOT NULL FOREIGN KEY REFERENCES tblZone(ZoneId),
    BinId INT NOT NULL FOREIGN KEY REFERENCES tblBin(BinId),
    ItemId INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    BatchId INT FOREIGN KEY REFERENCES tblBatch(BatchId),
    Quantity DECIMAL(18,4) DEFAULT 0.00 NOT NULL,
    ReservedQty DECIMAL(18,4) DEFAULT 0.00 NOT NULL,
    UpdatedAt DATETIME DEFAULT GETDATE()
);

-- 18. tblSalesOrder
CREATE TABLE tblSalesOrder (
    SOId INT IDENTITY(1,1) PRIMARY KEY,
    SOCode VARCHAR(50) NOT NULL UNIQUE,
    CustomerName VARCHAR(150) NOT NULL,
    CustomerCode VARCHAR(50) NOT NULL,
    OrderDate DATETIME NOT NULL,
    Salesman VARCHAR(100) NULL,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- PENDING, RESERVED, PARTIAL_PICKED, PICKED, PACKED, DISPATCHED, CANCELLED
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE()
);

-- 19. tblSalesOrderDetail
CREATE TABLE tblSalesOrderDetail (
    SODetailId INT IDENTITY(1,1) PRIMARY KEY,
    SOId INT NOT NULL FOREIGN KEY REFERENCES tblSalesOrder(SOId),
    ItemId INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    OrderQty DECIMAL(18,4) NOT NULL,
    ReservedQty DECIMAL(18,4) DEFAULT 0.00 NOT NULL,
    PickedQty DECIMAL(18,4) DEFAULT 0.00 NOT NULL,
    ShippedQty DECIMAL(18,4) DEFAULT 0.00 NOT NULL,
    UOM VARCHAR(20) NOT NULL,
    UnitPrice DECIMAL(18,4) DEFAULT 0.00
);

-- 20. tblReservation
CREATE TABLE tblReservation (
    ReservationId INT IDENTITY(1,1) PRIMARY KEY,
    SOId INT NOT NULL FOREIGN KEY REFERENCES tblSalesOrder(SOId),
    ItemId INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    BinId INT NOT NULL FOREIGN KEY REFERENCES tblBin(BinId),
    BatchId INT FOREIGN KEY REFERENCES tblBatch(BatchId),
    Quantity DECIMAL(18,4) NOT NULL,
    Status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL, -- ACTIVE, RELEASED, FULFILLED
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- 21. tblPickList
CREATE TABLE tblPickList (
    PickListId INT IDENTITY(1,1) PRIMARY KEY,
    PickCode VARCHAR(50) NOT NULL UNIQUE,
    SOId INT NOT NULL FOREIGN KEY REFERENCES tblSalesOrder(SOId),
    CreatedBy INT NOT NULL FOREIGN KEY REFERENCES tblUser(UserId),
    AssignedTo INT FOREIGN KEY REFERENCES tblUser(UserId),
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- PENDING, PICKING, COMPLETED, CANCELLED
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE()
);

-- 22. tblPickListDetail
CREATE TABLE tblPickListDetail (
    PickDetailId INT IDENTITY(1,1) PRIMARY KEY,
    PickListId INT NOT NULL FOREIGN KEY REFERENCES tblPickList(PickListId),
    ItemId INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    BinId INT NOT NULL FOREIGN KEY REFERENCES tblBin(BinId),
    BatchId INT FOREIGN KEY REFERENCES tblBatch(BatchId),
    Quantity DECIMAL(18,4) NOT NULL,
    PickedQty DECIMAL(18,4) DEFAULT 0.00 NOT NULL,
    Status VARCHAR(20) DEFAULT 'PENDING' NOT NULL -- PENDING, COMPLETED
);

-- 23. tblPacking (Phase 2: added physical dimensions for shipping)
CREATE TABLE tblPacking (
    PackingId    INT IDENTITY(1,1) PRIMARY KEY,
    PackCode     VARCHAR(50) NOT NULL UNIQUE,
    PickListId   INT NOT NULL FOREIGN KEY REFERENCES tblPickList(PickListId),
    PackedBy     INT NOT NULL FOREIGN KEY REFERENCES tblUser(UserId),
    PackedDate   DATETIME DEFAULT GETDATE(),
    CartonNo     VARCHAR(50),
    PalletNo     VARCHAR(50),
    ShippingLabel VARCHAR(255),
    GrossWeight  DECIMAL(10,3),                 -- Phase 2: kg
    LengthCm     DECIMAL(10,2),                 -- Phase 2: cm
    WidthCm      DECIMAL(10,2),                 -- Phase 2: cm
    HeightCm     DECIMAL(10,2),                 -- Phase 2: cm
    ItemCount    INT DEFAULT 0,                 -- Phase 2: total units in carton
    Notes        VARCHAR(255),
    Status       VARCHAR(20) DEFAULT 'PACKED' NOT NULL -- PACKED, SHIPPED
);

-- 24. tblDispatch
CREATE TABLE tblDispatch (
    DispatchId INT IDENTITY(1,1) PRIMARY KEY,
    DispatchCode VARCHAR(50) NOT NULL UNIQUE,
    SOId INT NOT NULL FOREIGN KEY REFERENCES tblSalesOrder(SOId),
    DeliveryChallanNo VARCHAR(50) NOT NULL,
    VehicleNo VARCHAR(50),
    TransporterName VARCHAR(100),
    LRNumber VARCHAR(50),
    DispatchDate DATETIME DEFAULT GETDATE(),
    DispatchedBy INT NOT NULL FOREIGN KEY REFERENCES tblUser(UserId),
    Status VARCHAR(20) DEFAULT 'DISPATCHED' NOT NULL
);

-- 25. tblStockTransfer
CREATE TABLE tblStockTransfer (
    TransferId INT IDENTITY(1,1) PRIMARY KEY,
    TransferCode VARCHAR(50) NOT NULL UNIQUE,
    FromWarehouseId INT NOT NULL FOREIGN KEY REFERENCES tblWarehouse(WarehouseId),
    ToWarehouseId INT NOT NULL FOREIGN KEY REFERENCES tblWarehouse(WarehouseId),
    FromBinId INT FOREIGN KEY REFERENCES tblBin(BinId),
    ToBinId INT FOREIGN KEY REFERENCES tblBin(BinId),
    ItemId INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    BatchId INT FOREIGN KEY REFERENCES tblBatch(BatchId),
    Quantity DECIMAL(18,4) NOT NULL,
    TransferredBy INT NOT NULL FOREIGN KEY REFERENCES tblUser(UserId),
    TransferDate DATETIME DEFAULT GETDATE(),
    Status VARCHAR(20) DEFAULT 'COMPLETED' NOT NULL -- COMPLETED, CANCELLED
);

-- 26. tblReturns (Phase 2: added BinId + ReturnedBy for inventory impact)
CREATE TABLE tblReturns (
    ReturnId          INT IDENTITY(1,1) PRIMARY KEY,
    ReturnCode        VARCHAR(50) NOT NULL UNIQUE,
    Type              VARCHAR(20) NOT NULL,                 -- CUSTOMER, VENDOR
    ReferenceCode     VARCHAR(50),                         -- SO Code or PO Code
    ItemId            INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    BatchId           INT FOREIGN KEY REFERENCES tblBatch(BatchId),
    Quantity          DECIMAL(18,4) NOT NULL,
    Reason            VARCHAR(255),
    BinId             INT FOREIGN KEY REFERENCES tblBin(BinId),       -- Phase 2: putback location
    ReturnedBy        INT FOREIGN KEY REFERENCES tblUser(UserId),     -- Phase 2: operator
    InventoryUpdated  BIT DEFAULT 0 NOT NULL,              -- Phase 2: has stock been restocked?
    ReturnDate        DATETIME DEFAULT GETDATE(),
    Status            VARCHAR(20) DEFAULT 'RECEIVED' NOT NULL         -- RECEIVED, RESTOCKED, DISPOSED
);

-- 27. tblAuditLog
CREATE TABLE tblAuditLog (
    AuditId INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT FOREIGN KEY REFERENCES tblUser(UserId),
    Action VARCHAR(100) NOT NULL, -- E.g. INSERT, UPDATE, DELETE, LOGIN
    TableName VARCHAR(100),
    RecordId INT,
    OldValues NVARCHAR(MAX),
    NewValues NVARCHAR(MAX),
    IPAddress VARCHAR(50),
    Timestamp DATETIME DEFAULT GETDATE()
);

-- 28. tblApiLog
CREATE TABLE tblApiLog (
    ApiLogId INT IDENTITY(1,1) PRIMARY KEY,
    SyncType VARCHAR(50) NOT NULL, -- E.g. PO_SYNC, SO_SYNC, ITEM_SYNC, CUSTOMER_SYNC, VENDOR_SYNC, STOCK_SYNC
    Direction VARCHAR(20) NOT NULL, -- INBOUND, OUTBOUND
    Endpoint VARCHAR(255) NOT NULL,
    RequestPayload NVARCHAR(MAX),
    ResponsePayload NVARCHAR(MAX),
    Status VARCHAR(20) NOT NULL, -- SUCCESS, ERROR
    ErrorMessage NVARCHAR(MAX),
    Timestamp DATETIME DEFAULT GETDATE()
);
GO

-- 29. tblPickListWave (Phase 2: Wave Picking — group multiple SOs into one wave)
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

-- 30. tblDamage (Phase 2: Damage Management Module)
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

-- 31. tblCycleCount (Phase 2: Cycle Count / Physical Verification Module)
CREATE TABLE tblCycleCount (
    CycleCountId INT IDENTITY(1,1) PRIMARY KEY,
    CountCode    VARCHAR(50) NOT NULL UNIQUE,
    WarehouseId  INT NOT NULL FOREIGN KEY REFERENCES tblWarehouse(WarehouseId),
    ZoneId       INT FOREIGN KEY REFERENCES tblZone(ZoneId),
    CountType    VARCHAR(20) DEFAULT 'FULL',  -- FULL, ZONE, BIN, ABC
    CountedBy    INT NOT NULL FOREIGN KEY REFERENCES tblUser(UserId),
    ReviewedBy   INT FOREIGN KEY REFERENCES tblUser(UserId),
    CountDate    DATETIME DEFAULT GETDATE(),
    Status       VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
    Notes        VARCHAR(255)
);

-- 32. tblCycleCountDetail
CREATE TABLE tblCycleCountDetail (
    CountDetailId INT IDENTITY(1,1) PRIMARY KEY,
    CycleCountId  INT NOT NULL FOREIGN KEY REFERENCES tblCycleCount(CycleCountId),
    BinId         INT NOT NULL FOREIGN KEY REFERENCES tblBin(BinId),
    ItemId        INT NOT NULL FOREIGN KEY REFERENCES tblItem(ItemId),
    BatchId       INT FOREIGN KEY REFERENCES tblBatch(BatchId),
    SystemQty     DECIMAL(18,4) NOT NULL DEFAULT 0.00,
    CountedQty    DECIMAL(18,4),
    Variance      AS (CountedQty - SystemQty) PERSISTED,
    Status        VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
    Notes         VARCHAR(255)
);

-- 33. tblERPConfig (Phase 2: configurable ERP integration endpoint)
CREATE TABLE tblERPConfig (
    ConfigId     INT IDENTITY(1,1) PRIMARY KEY,
    CompanyId    VARCHAR(50) NOT NULL DEFAULT 'COMP01',
    ERPName      VARCHAR(100) NOT NULL DEFAULT 'BUSY Accounting',
    BaseUrl      VARCHAR(255),
    ApiKey       VARCHAR(255),
    SecretKey    VARCHAR(255),
    SyncInterval INT DEFAULT 30,
    IsActive     BIT DEFAULT 1,
    LastSyncAt   DATETIME,
    CreatedAt    DATETIME DEFAULT GETDATE(),
    UpdatedAt    DATETIME DEFAULT GETDATE()
);
GO

-- Create Indexes for optimization
CREATE INDEX IX_tblInventory_Warehouse_Item ON tblInventory (WarehouseId, ItemId);
CREATE INDEX IX_tblInventory_Bin            ON tblInventory (BinId);
CREATE INDEX IX_tblBin_Barcode              ON tblBin (Barcode);
CREATE INDEX IX_tblItem_Barcode             ON tblItem (Barcode);
CREATE INDEX IX_tblBatch_ExpiryDate         ON tblBatch (ExpiryDate);
CREATE INDEX IX_tblSerialNo_SerialNumber    ON tblSerialNo (SerialNumber);
CREATE INDEX IX_tblPurchaseOrder_Status     ON tblPurchaseOrder (Status);
CREATE INDEX IX_tblSalesOrder_Status        ON tblSalesOrder (Status);
CREATE INDEX IX_tblPickList_Status          ON tblPickList (Status);
CREATE INDEX IX_tblReservation_SO           ON tblReservation (SOId);
CREATE INDEX IX_tblDamage_ItemId            ON tblDamage (ItemId);
CREATE INDEX IX_tblDamage_Status            ON tblDamage (Status);
CREATE INDEX IX_tblCycleCount_WarehouseId   ON tblCycleCount (WarehouseId);
CREATE INDEX IX_tblCCDetail_CycleCountId    ON tblCycleCountDetail (CycleCountId);
CREATE INDEX IX_tblPickListWave_Status      ON tblPickListWave (Status);
GO
