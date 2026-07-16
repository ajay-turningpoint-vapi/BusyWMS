USE BusyWMSV1;

DROP PROCEDURE IF EXISTS sp_ProcessGRN;
DELIMITER //
CREATE PROCEDURE `sp_ProcessGRN`(
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
            -- Changed from 'COMPLETED' to 'GRN_CREATED' to indicate pending putaway
            UPDATE tblPurchaseOrder SET Status = 'GRN_CREATED', UpdatedAt = NOW() WHERE POId = v_POId;
        ELSE
            UPDATE tblPurchaseOrder SET Status = 'PARTIAL', UpdatedAt = NOW() WHERE POId = v_POId;
        END IF;
    END IF;

    COMMIT;
    SELECT 1 AS Success, 'GRN processed successfully.' AS Message;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_ProcessPutaway;
DELIMITER //
CREATE PROCEDURE `sp_ProcessPutaway`(
    IN p_GRNDetailId INT,
    IN p_BinId INT,
    IN p_Quantity DECIMAL(18,4),
    IN p_UserId INT
)
BEGIN
    DECLARE v_ItemId INT;
    DECLARE v_BatchId INT;
    DECLARE v_GRNId INT;
    DECLARE v_POId INT;
    DECLARE v_WarehouseId INT;
    DECLARE v_ZoneId INT;
    DECLARE v_ItemWeight DECIMAL(18,4);
    DECLARE v_ItemVolume DECIMAL(18,4);
    DECLARE v_TotalAccepted DECIMAL(18,4);
    DECLARE v_TotalPutaway DECIMAL(18,4);
    DECLARE v_TotalOrdered DECIMAL(18,4);
    DECLARE v_TotalPutawayPO DECIMAL(18,4);

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

    -- Ensure PO is only marked as COMPLETED when putaway is completely done
    SELECT POId INTO v_POId FROM tblGRN WHERE GRNId = v_GRNId;
    IF v_POId IS NOT NULL THEN
        SELECT COALESCE(SUM(OrderQty), 0) INTO v_TotalOrdered FROM tblPurchaseOrderDetail WHERE POId = v_POId;
        
        SELECT COALESCE(SUM(gd.PutawayQty), 0) INTO v_TotalPutawayPO
        FROM tblGRNDetail gd
        INNER JOIN tblGRN g ON gd.GRNId = g.GRNId
        WHERE g.POId = v_POId AND g.Status != 'CANCELLED';

        IF v_TotalPutawayPO > 0 AND v_TotalPutawayPO >= v_TotalOrdered THEN
            UPDATE tblPurchaseOrder SET Status = 'COMPLETED', UpdatedAt = NOW() WHERE POId = v_POId;
        END IF;
    END IF;

    COMMIT;
    SELECT 1 AS Success, 'Putaway executed successfully.' AS Message;
END //
DELIMITER ;
