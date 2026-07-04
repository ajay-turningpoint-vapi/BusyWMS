USE BusyWMS;

-- 1. Create tblASN Header Table
CREATE TABLE IF NOT EXISTS tblASN (
    ASNId INT AUTO_INCREMENT PRIMARY KEY,
    ASNNumber VARCHAR(50) NOT NULL UNIQUE,
    SupplierId INT NOT NULL,
    POId INT DEFAULT NULL,
    ShipmentDate DATETIME NOT NULL,
    ExpectedArrivalDate DATETIME NOT NULL,
    Transporter VARCHAR(100) DEFAULT NULL,
    VehicleNumber VARCHAR(50) DEFAULT NULL,
    TrackingNumber VARCHAR(100) DEFAULT NULL,
    WarehouseId INT NOT NULL,
    Status VARCHAR(20) DEFAULT 'Draft' NOT NULL, -- Draft, Confirmed, In Transit, Partially Received, Fully Received, Cancelled
    Remarks VARCHAR(255) DEFAULT NULL,
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (SupplierId) REFERENCES tblSupplier(SupplierId),
    FOREIGN KEY (POId) REFERENCES tblPurchaseOrder(POId) ON DELETE SET NULL,
    FOREIGN KEY (WarehouseId) REFERENCES tblWarehouse(WarehouseId),
    FOREIGN KEY (CreatedBy) REFERENCES tblUser(UserId)
) ENGINE=InnoDB;

-- 2. Create tblASNItem Details Table
CREATE TABLE IF NOT EXISTS tblASNItem (
    ASNItemId INT AUTO_INCREMENT PRIMARY KEY,
    ASNId INT NOT NULL,
    ItemId INT NOT NULL,
    ExpectedQty DECIMAL(18,4) NOT NULL,
    ReceivedQty DECIMAL(18,4) DEFAULT 0.0000 NOT NULL,
    UOM VARCHAR(20) NOT NULL,
    BatchNumber VARCHAR(50) DEFAULT NULL,
    SerialNumber VARCHAR(100) DEFAULT NULL,
    ExpiryDate DATETIME DEFAULT NULL,
    FOREIGN KEY (ASNId) REFERENCES tblASN(ASNId) ON DELETE CASCADE,
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId)
) ENGINE=InnoDB;

-- 3. Register Feature Configuration if not already present
INSERT INTO tblFeatureConfig (Category, FeatureCode, DisplayName, IsEnabled)
SELECT 'MODULE', 'MODULE_ASN', 'Advanced Shipment Notice (ASN)', 1
FROM dual
WHERE NOT EXISTS (
    SELECT 1 FROM tblFeatureConfig WHERE FeatureCode = 'MODULE_ASN'
);

-- 4. Create Indexes for ASN tables to optimize reporting
CREATE INDEX IX_tblASN_ExpectedArrivalDate ON tblASN (ExpectedArrivalDate);
CREATE INDEX IX_tblASN_Status ON tblASN (Status);
CREATE INDEX IX_tblASNItem_ASNId ON tblASNItem (ASNId);
CREATE INDEX IX_tblASNItem_ItemId ON tblASNItem (ItemId);
