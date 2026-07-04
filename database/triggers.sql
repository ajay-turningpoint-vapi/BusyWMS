USE BusyWMS;
GO

-- Drop triggers if they exist
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'tr_InventoryAudit')
    DROP TRIGGER tr_InventoryAudit;
GO

-- Create Audit trigger on tblInventory for Insert, Update, and Delete
CREATE TRIGGER tr_InventoryAudit
ON tblInventory
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Action VARCHAR(20);
    IF EXISTS(SELECT * FROM inserted) AND EXISTS(SELECT * FROM deleted)
        SET @Action = 'UPDATE';
    ELSE IF EXISTS(SELECT * FROM inserted)
        SET @Action = 'INSERT';
    ELSE
        SET @Action = 'DELETE';

    -- Format values as JSON (supported in MSSQL 2016+)
    IF @Action = 'INSERT'
    BEGIN
        INSERT INTO tblAuditLog (UserId, Action, TableName, RecordId, OldValues, NewValues, IPAddress, Timestamp)
        SELECT 
            NULL, -- Can be updated later by application middleware context if needed
            'INSERT',
            'tblInventory',
            i.InventoryId,
            NULL,
            (SELECT i.WarehouseId, i.BinId, i.ItemId, i.Quantity, i.ReservedQty FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            'SYSTEM',
            GETDATE()
        FROM inserted i;
    END
    ELSE IF @Action = 'UPDATE'
    BEGIN
        INSERT INTO tblAuditLog (UserId, Action, TableName, RecordId, OldValues, NewValues, IPAddress, Timestamp)
        SELECT 
            NULL,
            'UPDATE',
            'tblInventory',
            i.InventoryId,
            (SELECT d.WarehouseId, d.BinId, d.ItemId, d.Quantity, d.ReservedQty FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT i.WarehouseId, i.BinId, i.ItemId, i.Quantity, i.ReservedQty FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            'SYSTEM',
            GETDATE()
        FROM inserted i
        INNER JOIN deleted d ON i.InventoryId = d.InventoryId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        INSERT INTO tblAuditLog (UserId, Action, TableName, RecordId, OldValues, NewValues, IPAddress, Timestamp)
        SELECT 
            NULL,
            'DELETE',
            'tblInventory',
            d.InventoryId,
            (SELECT d.WarehouseId, d.BinId, d.ItemId, d.Quantity, d.ReservedQty FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            NULL,
            'SYSTEM',
            GETDATE()
        FROM deleted d;
    END
END;
GO
