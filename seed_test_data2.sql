USE BusyWMSV1;

SET @userId = 1;
SET @whId = 4;
SET @zoneId = 2;
SET @bin1 = 5;
SET @bin2 = 6;
SET @itemId = 79036;

-- Pick List for Pick screen (linked to SOId = 3)
UPDATE tblSalesOrder SET Status = 'PICKING' WHERE SOId = 3;
INSERT IGNORE INTO tblPickList (PickListId, PickCode, SOId, CreatedBy, Status) VALUES (2001, 'PICK-TEST-001', 3, @userId, 'PENDING');
INSERT IGNORE INTO tblPickListDetail (PickListId, ItemId, BinId, Quantity, PickedQty, Status) VALUES (2001, @itemId, @bin1, 10, 0, 'PENDING');

-- Pick List for Pack screen (linked to SOId = 4)
UPDATE tblSalesOrder SET Status = 'PICKED' WHERE SOId = 4;
INSERT IGNORE INTO tblPickList (PickListId, PickCode, SOId, CreatedBy, Status) VALUES (2002, 'PICK-PACK-001', 4, @userId, 'COMPLETED');
INSERT IGNORE INTO tblPickListDetail (PickListId, ItemId, BinId, Quantity, PickedQty, Status) VALUES (2002, @itemId, @bin1, 10, 10, 'COMPLETED');

-- Sales Order for Dispatch screen (linked to SOId = 5)
UPDATE tblSalesOrder SET Status = 'PACKED' WHERE SOId = 5;

-- Cycle Count
INSERT IGNORE INTO tblCycleCount (CycleCountId, CountCode, WarehouseId, CountedBy, Status) VALUES (2001, 'CC-TEST-001', @whId, @userId, 'PENDING');
INSERT IGNORE INTO tblCycleCountDetail (CycleCountId, BinId, ItemId, SystemQty, Status) VALUES (2001, @bin1, @itemId, 5, 'PENDING');

-- Add inventory for picking and transfer
INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, Quantity) VALUES (@whId, @zoneId, @bin1, @itemId, 500) ON DUPLICATE KEY UPDATE Quantity = Quantity + 500;
INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, Quantity) VALUES (@whId, @zoneId, @bin2, @itemId, 250) ON DUPLICATE KEY UPDATE Quantity = Quantity + 250;

-- Pending PO for GRN / ASN (POId = 282)
UPDATE tblPurchaseOrder SET Status = 'PENDING' WHERE POId = 282;

-- Putaway Data (need GRNDetail pending Putaway)
INSERT IGNORE INTO tblGRN (GRNId, GRNCode, POId, ReceivedBy, Status) VALUES (2001, 'GRN-TEST-001', 282, @userId, 'PENDING');
INSERT IGNORE INTO tblGRNDetail (GRNDetailId, GRNId, ItemId, ReceivedQty, AcceptedQty, RejectedQty, PutawayQty) VALUES (2001, 2001, @itemId, 50, 50, 0, 10);
