CREATE TABLE IF NOT EXISTS tblStockAlertLog (
    AlertLogId INT AUTO_INCREMENT PRIMARY KEY,
    ItemId INT NOT NULL,
    AlertType VARCHAR(20) NOT NULL, -- 'BELOW_MIN', 'ABOVE_MAX'
    CurrentStock DECIMAL(18,4) NOT NULL,
    ThresholdValue DECIMAL(18,4) NOT NULL,
    ReferenceDoc VARCHAR(100) DEFAULT NULL, -- PO Code, Pick List, or GRN Code
    Status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL, -- 'ACTIVE', 'RESOLVED'
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ResolvedAt DATETIME DEFAULT NULL,
    FOREIGN KEY (ItemId) REFERENCES tblItem(ItemId)
) ENGINE=InnoDB;

CREATE INDEX IX_tblStockAlertLog_ItemId ON tblStockAlertLog (ItemId);
CREATE INDEX IX_tblStockAlertLog_Status ON tblStockAlertLog (Status);
CREATE INDEX IX_tblStockAlertLog_AlertType ON tblStockAlertLog (AlertType);
