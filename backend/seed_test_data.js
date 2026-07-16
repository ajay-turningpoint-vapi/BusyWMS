const db = require('./src/config/db').db; // assuming it exports 'db'

async function seed() {
  await db.connect();
  console.log("Connected");

  // Get a random user, item, and bin
  const [user] = await db.query("SELECT UserId FROM tblUser LIMIT 1");
  const userId = user ? user.UserId : 1;

  const [item] = await db.query("SELECT ItemId, Code, Barcode FROM tblItem LIMIT 1");
  const itemId = item.ItemId;

  const [bin] = await db.query("SELECT BinId, Code, Barcode FROM tblBin LIMIT 1");
  const binId = bin.BinId;

  const [so] = await db.query("SELECT SOId, SOCode FROM tblSalesOrder WHERE Status = 'PENDING' LIMIT 1");
  const soId = so ? so.SOId : null;

  // 1. Create a dummy Pick List if SO exists
  if (soId) {
    const pickRes = await db.executeCmd("INSERT INTO tblPickList (PickCode, SOId, CreatedBy, Status) VALUES ('PICK-TEST-001', ?, ?, 'PENDING')", { param1: soId, param2: userId });
    const pickListId = pickRes.lastID;
    if (pickListId) {
       await db.executeCmd("INSERT INTO tblPickListDetail (PickListId, ItemId, BinId, Quantity, PickedQty, Status) VALUES (?, ?, ?, 10, 0, 'PENDING')", { param1: pickListId, param2: itemId, param3: binId });
       await db.executeCmd("UPDATE tblSalesOrder SET Status = 'PICKING' WHERE SOId = ?", { param1: soId });
    }
  }

  // 2. Create a COMPLETED Pick List for testing Pack
  const [so2] = await db.query("SELECT SOId, SOCode FROM tblSalesOrder WHERE Status = 'PENDING' LIMIT 1");
  if (so2) {
    const pickRes2 = await db.executeCmd("INSERT INTO tblPickList (PickCode, SOId, CreatedBy, Status) VALUES ('PICK-PACK-001', ?, ?, 'COMPLETED')", { param1: so2.SOId, param2: userId });
    const pickListId2 = pickRes2.lastID;
    await db.executeCmd("UPDATE tblSalesOrder SET Status = 'PICKED' WHERE SOId = ?", { param1: so2.SOId });
  }

  // 3. Create a PACKED Sales Order for testing Dispatch
  const [so3] = await db.query("SELECT SOId, SOCode FROM tblSalesOrder WHERE Status = 'PENDING' LIMIT 1");
  if (so3) {
    await db.executeCmd("UPDATE tblSalesOrder SET Status = 'PACKED' WHERE SOId = ?", { param1: so3.SOId });
  }

  // 4. Create a Cycle Count
  const ccRes = await db.executeCmd("INSERT INTO tblCycleCount (CountCode, WarehouseId, CountedBy, Status) VALUES ('CC-TEST-001', 1, ?, 'PENDING')", { param1: userId });
  const ccId = ccRes.lastID;
  if (ccId) {
    await db.executeCmd("INSERT INTO tblCycleCountDetail (CycleCountId, BinId, ItemId, SystemQty, Status) VALUES (?, ?, ?, 5, 'PENDING')", { param1: ccId, param2: binId, param3: itemId });
  }

  // 5. Create some Inventory for transfer and picking
  const [warehouse] = await db.query("SELECT WarehouseId FROM tblWarehouse LIMIT 1");
  const [zone] = await db.query("SELECT ZoneId FROM tblZone LIMIT 1");
  const whId = warehouse ? warehouse.WarehouseId : 1;
  const zId = zone ? zone.ZoneId : 1;
  
  await db.executeCmd("INSERT INTO tblInventory (WarehouseId, ZoneId, BinId, ItemId, Quantity) VALUES (?, ?, ?, ?, 100) ON DUPLICATE KEY UPDATE Quantity = Quantity + 100", {
    param1: whId, param2: zId, param3: binId, param4: itemId
  });

  console.log("Seeding complete. Use these codes:");
  console.log("Pick List (to pick): PICK-TEST-001");
  console.log("Pick List (to pack): PICK-PACK-001");
  console.log("Cycle Count: CC-TEST-001");
  console.log("Sales Order (to dispatch): " + (so3 ? so3.SOCode : 'None'));

  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
