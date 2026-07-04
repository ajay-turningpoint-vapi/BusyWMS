USE BusyWMS;
GO

-- 1. Seed Roles
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

-- 2. Seed Users (Pre-hashed password 'admin123' / 'operator123' using bcrypt)
-- We insert standard bcrypt hashes compatible with standard Node.js bcrypt libraries
-- Hash for 'admin123': $2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa
INSERT INTO tblUser (Username, Email, PasswordHash, RoleId, FullName, WarehouseId, IsActive) VALUES
('admin', 'admin@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 1, 'System Admin', 1, 1),
('manager', 'manager@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 2, 'Warehouse Manager', 1, 1),
('grn_user', 'grn@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 4, 'GRN Operator', 1, 1),
('qc_user', 'qc@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 5, 'QC Inspector', 1, 1),
('picker_user', 'picker@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 6, 'Order Picker', 1, 1),
('packer_user', 'packer@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 7, 'Order Packer', 1, 1),
('dispatcher_user', 'dispatch@busywms.com', '$2a$10$ZfXOqR0ZFmZ9BIt58skDOuuIj1XuNt9ixO4p40MAYGS/EKQvj7uYa', 8, 'Dispatcher Agent', 1, 1);

-- 3. Seed Warehouses
INSERT INTO tblWarehouse (CompanyId, Code, Name, Address, IsActive) VALUES
('COMP01', 'WH-DEL', 'Delhi Main Warehouse', 'Sector 18, Okhla, New Delhi', 1),
('COMP01', 'WH-BOM', 'Mumbai Port Warehouse', 'JNPT Area, Navi Mumbai', 1);

-- 4. Seed Zones
INSERT INTO tblZone (WarehouseId, Code, Name, IsActive) VALUES
(1, 'Z-INB', 'Delhi Inbound receiving zone', 1),
(1, 'Z-BULK', 'Delhi Bulk Storage rack zone', 1),
(1, 'Z-OUTB', 'Delhi Packing & Outbound zone', 1),
(2, 'Z-GEN', 'Mumbai General Storage zone', 1);

-- 5. Seed Racks
INSERT INTO tblRack (ZoneId, Code, Name, IsActive) VALUES
(2, 'R-01', 'Bulk Rack 01', 1),
(2, 'R-02', 'Bulk Rack 02', 1),
(2, 'R-03', 'Bulk Rack 03', 1),
(4, 'R-01', 'Mumbai General Rack 01', 1);

-- 6. Seed Shelves
INSERT INTO tblShelf (RackId, Code, Name, IsActive) VALUES
(1, 'S-01', 'Rack 01 Shelf 01', 1),
(1, 'S-02', 'Rack 01 Shelf 02', 1),
(2, 'S-01', 'Rack 02 Shelf 01', 1),
(4, 'S-01', 'Mumbai Rack 01 Shelf 01', 1);

-- 7. Seed Bins
INSERT INTO tblBin (ShelfId, Code, Barcode, CapacityWeight, CapacityVolume, OccupiedWeight, OccupiedVolume, IsActive) VALUES
(1, 'WH01-Z02-R01-S01-B01', 'WH01Z02R01S01B01', 1000.0, 500.0, 0.0, 0.0, 1),
(1, 'WH01-Z02-R01-S01-B02', 'WH01Z02R01S01B02', 1000.0, 500.0, 0.0, 0.0, 1),
(2, 'WH01-Z02-R01-S02-B01', 'WH01Z02R01S02B01', 1000.0, 500.0, 0.0, 0.0, 1),
(2, 'WH01-Z02-R01-S02-B02', 'WH01Z02R01S02B02', 1000.0, 500.0, 0.0, 0.0, 1),
(3, 'WH01-Z02-R02-S01-B01', 'WH01Z02R02S01B01', 1000.0, 500.0, 0.0, 0.0, 1),
(4, 'WH02-Z01-R01-S01-B01', 'WH02Z01R01S01B01', 2000.0, 1000.0, 0.0, 0.0, 1);

-- 8. Seed Items
INSERT INTO tblItem (Code, Name, Description, Category, Brand, UOM, Barcode, TrackBatch, TrackSerial, MinStock, MaxStock, IsActive) VALUES
('ITM-001', 'Logitech G102 Mouse', 'Wired Gaming Mouse with RGB', 'Peripherals', 'Logitech', 'PCS', '8901012345671', 0, 0, 10, 500, 1),
('ITM-002', 'Dell KB216 Keyboard', 'Standard Multimedia USB Keyboard', 'Peripherals', 'Dell', 'PCS', '8901012345672', 0, 0, 10, 500, 1),
('ITM-003', 'Crucial MX500 SSD 500GB', 'SATA 2.5 Inch Internal Solid State Drive', 'Storage', 'Crucial', 'PCS', '8901012345673', 1, 1, 5, 200, 1),
('ITM-004', 'Lenovo ThinkPad E14', 'Intel Core i5 11th Gen Laptop', 'Laptops', 'Lenovo', 'PCS', '8901012345674', 1, 1, 2, 50, 1),
('ITM-005', 'HP LaserJet Pro M12w', 'Single Function Monochrome Printer', 'Printers', 'HP', 'PCS', '8901012345675', 0, 0, 1, 20, 1);

-- 9. Seed Batches for item 3 and 4
INSERT INTO tblBatch (ItemId, BatchNumber, ManufactureDate, ExpiryDate) VALUES
(3, 'BAT-SSD-001', '2026-01-01', '2031-01-01'),
(3, 'BAT-SSD-002', '2026-03-01', '2031-03-01'),
(4, 'BAT-LP-2026A', '2026-02-01', '2029-02-01');

-- 10. Seed Serials
INSERT INTO tblSerialNo (ItemId, BatchId, SerialNumber, Status) VALUES
(3, 1, 'SN-SSD-1001', 'IN_STOCK'),
(3, 1, 'SN-SSD-1002', 'IN_STOCK'),
(3, 2, 'SN-SSD-2001', 'IN_STOCK'),
(4, 3, 'SN-LEN-9901', 'IN_STOCK'),
(4, 3, 'SN-LEN-9902', 'IN_STOCK');

-- 11. Seed Purchase Orders
INSERT INTO tblPurchaseOrder (POCode, VendorName, VendorCode, OrderDate, DeliveryDate, Status) VALUES
('PO-2026-001', 'Supertron Electronics', 'VND-001', '2026-06-10', '2026-06-25', 'PENDING'),
('PO-2026-002', 'Redington India Ltd', 'VND-002', '2026-06-12', '2026-06-28', 'PARTIAL');

-- 12. Seed Purchase Order Details
INSERT INTO tblPurchaseOrderDetail (POId, ItemId, OrderQty, ReceivedQty, UOM, UnitPrice) VALUES
(1, 1, 50.0, 0.0, 'PCS', 600.00),
(1, 2, 30.0, 0.0, 'PCS', 500.00),
(2, 3, 20.0, 10.0, 'PCS', 3500.00),
(2, 4, 5.0, 2.0, 'PCS', 52000.00);

-- 13. Seed Sales Orders
INSERT INTO tblSalesOrder (SOCode, CustomerName, CustomerCode, OrderDate, Status) VALUES
('SO-2026-001', 'Apex Tech Solutions', 'CST-001', '2026-06-15', 'PENDING'),
('SO-2026-002', 'Prime Retailers', 'CST-002', '2026-06-16', 'PENDING');

-- 14. Seed Sales Order Details
INSERT INTO tblSalesOrderDetail (SOId, ItemId, OrderQty, ReservedQty, PickedQty, ShippedQty, UOM, UnitPrice) VALUES
(1, 1, 10.0, 0.0, 0.0, 0.0, 'PCS', 850.00),
(1, 3, 5.0, 0.0, 0.0, 0.0, 'PCS', 4800.00),
(2, 2, 8.0, 0.0, 0.0, 0.0, 'PCS', 700.00),
(2, 4, 1.0, 0.0, 0.0, 0.0, 'PCS', 65000.00);
GO
