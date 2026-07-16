USE BusyWMSV1;

-- Seed a Cycle Count
INSERT IGNORE INTO tblCycleCount (CycleCountId, CountCode, WarehouseId, CountedBy, Status) VALUES (1001, 'CC-TEST-001', 1, 1, 'PENDING');
INSERT IGNORE INTO tblCycleCountDetail (CycleCountId, BinId, ItemId, SystemQty, Status) VALUES (1001, 1, 1, 5, 'PENDING');

-- Pick List for Pick screen (linked to SOId = 1)
UPDATE tblSalesOrder SET Status = 'PICKING' WHERE SOId = 1;
INSERT IGNORE INTO tblPickList (PickListId, PickCode, SOId, CreatedBy, Status) VALUES (1001, 'PICK-TEST-001', 1, 1, 'PENDING');
INSERT IGNORE INTO tblPickListDetail (PickListId, ItemId, BinId, Quantity, PickedQty, Status) VALUES (1001, 1, 1, 10, 0, 'PENDING');

-- Pick List for Pack screen (linked to SOId = 2)
UPDATE tblSalesOrder SET Status = 'PICKED' WHERE SOId = 2;
INSERT IGNORE INTO tblPickList (PickListId, PickCode, SOId, CreatedBy, Status) VALUES (1002, 'PICK-PACK-001', 2, 1, 'COMPLETED');
INSERT IGNORE INTO tblPickListDetail (PickListId, ItemId, BinId, Quantity, PickedQty, Status) VALUES (1002, 1, 1, 10, 10, 'COMPLETED');

-- Sales Order for Dispatch screen (linked to SOId = 3)
UPDATE tblSalesOrder SET Status = 'PACKED' WHERE SOId = 3;

-- Add inventory for picking and transfer
INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, Quantity) VALUES (1, 1, 1, 1, 500) ON DUPLICATE KEY UPDATE Quantity = 500;
INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, Quantity) VALUES (1, 1, 2, 1, 250) ON DUPLICATE KEY UPDATE Quantity = 250;

-- Pending PO for GRN / ASN (POId = 1)
UPDATE tblPurchaseOrder SET Status = 'PENDING' WHERE POId = 1;
