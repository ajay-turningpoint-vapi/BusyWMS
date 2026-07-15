USE BusyWMS;
GO

-- Drop views if they exist
IF OBJECT_ID('vw_InventoryStatus', 'V') IS NOT NULL DROP VIEW vw_InventoryStatus;
IF OBJECT_ID('vw_PendingGRN', 'V') IS NOT NULL DROP VIEW vw_PendingGRN;
IF OBJECT_ID('vw_PendingQC', 'V') IS NOT NULL DROP VIEW vw_PendingQC;
IF OBJECT_ID('vw_PendingPutaway', 'V') IS NOT NULL DROP VIEW vw_PendingPutaway;
IF OBJECT_ID('vw_PendingPick', 'V') IS NOT NULL DROP VIEW vw_PendingPick;
IF OBJECT_ID('vw_WarehouseOccupancy', 'V') IS NOT NULL DROP VIEW vw_WarehouseOccupancy;
GO

-- 1. vw_InventoryStatus: Detailed stock view
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
    batch.BatchId,
    batch.BatchNumber,
    batch.ExpiryDate,
    i.Quantity,
    i.ReservedQty,
    (i.Quantity - i.ReservedQty) AS AvailableQty
FROM tblInventory i
INNER JOIN tblWarehouse w ON i.WarehouseId = w.WarehouseId
INNER JOIN tblZone z ON i.ZoneId = z.ZoneId
INNER JOIN tblBin b ON i.BinId = b.BinId
INNER JOIN tblItem item ON i.ItemId = item.ItemId
LEFT JOIN tblBatch batch ON i.BatchId = batch.BatchId;
GO

-- 2. vw_PendingGRN: Pending PO lines
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
    (pod.OrderQty - pod.ReceivedQty - COALESCE(pending_grn.TotalPendingQty, 0)) AS PendingQty
FROM tblPurchaseOrder po
INNER JOIN tblPurchaseOrderDetail pod ON po.POId = pod.POId
INNER JOIN tblItem item ON pod.ItemId = item.ItemId
LEFT JOIN (
    SELECT gd.ItemId, g.POId, SUM(gd.ReceivedQty) AS TotalPendingQty
    FROM tblGRNDetail gd
    INNER JOIN tblGRN g ON gd.GRNId = g.GRNId
    WHERE g.Status = 'PENDING'
    GROUP BY gd.ItemId, g.POId
) pending_grn ON po.POId = pending_grn.POId AND pod.ItemId = pending_grn.ItemId
WHERE po.Status IN ('PENDING', 'PARTIAL') 
  AND (pod.OrderQty - pod.ReceivedQty - COALESCE(pending_grn.TotalPendingQty, 0)) > 0;
GO

-- 3. vw_PendingQC: GRN arrivals awaiting inspection
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
GO

-- 4. vw_PendingPutaway: Accepted GRN quantity awaiting putaway
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
GO

-- 5. vw_PendingPick: Pending items to be picked for Sales Orders
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
GO

-- 6. vw_WarehouseOccupancy: Bin storage volume and weight utilization
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
GO
