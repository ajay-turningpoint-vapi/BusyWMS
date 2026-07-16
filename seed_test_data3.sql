USE BusyWMSV1;

SET @userId = 1;
SET @whId = 4;
SET @zoneId = 2;
SET @bin1 = 5;
SET @bin2 = 6;
SET @itemId = 130165;

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
INSERT IGNORE INTO tblCycleCountDetail (CycleCountId, BinId, ItemId, SystemQty, Status) VALUES (2001, @bin1, @itemId, 20, 'PENDING');

-- Pending PO for GRN / ASN (POId = 282)
UPDATE tblPurchaseOrder SET Status = 'PENDING' WHERE POId = 282;

-- Putaway Data (need GRNDetail pending Putaway)
INSERT IGNORE INTO tblGRN (GRNId, GRNCode, POId, ReceivedBy, Status) VALUES (2001, 'GRN-TEST-001', 282, @userId, 'PENDING');
INSERT IGNORE INTO tblGRNDetail (GRNDetailId, GRNId, ItemId, ReceivedQty, AcceptedQty, RejectedQty, PutawayQty) VALUES (2001, 2001, @itemId, 50, 50, 0, 10);

-- Make sure we have enough inventory in bin 5 for picking 10
UPDATE tblInventory SET Quantity = Quantity + 100 WHERE BinId = @bin1 AND ItemId = @itemId;
