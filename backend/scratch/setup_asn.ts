import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

async function setupAsn() {
  const connection = await mysql.createConnection({
    host: process.env.MARIADB_HOST || 'localhost',
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER || 'root',
    password: process.env.MARIADB_PASSWORD || 'Password123!',
    database: process.env.MARIADB_DATABASE || 'BusyWMS',
  });
  console.log('Connected directly to MariaDB.');

  try {
    const migrationSqlPath = path.join(__dirname, '../../database/asn_migration.sql');
    console.log(`Reading migration SQL from: ${migrationSqlPath}`);
    const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

    // Split SQL by semicolon and run each command
    const commands = migrationSql
      .split(';')
      .map(c => c.trim())
      .filter(c => c && !c.startsWith('USE '));

    console.log('Executing migration commands...');
    for (const cmd of commands) {
      try {
        await connection.query(cmd);
      } catch (err: any) {
        if (
          err.message.includes('Duplicate key name') || 
          err.message.includes('already exists') || 
          err.message.includes('Duplicate column name') ||
          err.message.includes('Duplicate entry')
        ) {
          console.log(`Skipped duplicate schema element: ${err.message}`);
        } else {
          throw err;
        }
      }
    }
    console.log('Migration completed successfully.');

    // Fetch existing entities to link the dummy data correctly
    const [suppliers]: any = await connection.query('SELECT SupplierId FROM tblSupplier LIMIT 3');
    const [warehouses]: any = await connection.query('SELECT WarehouseId FROM tblWarehouse LIMIT 2');
    const [items]: any = await connection.query('SELECT ItemId, UOM FROM tblItem LIMIT 5');
    const [users]: any = await connection.query('SELECT UserId FROM tblUser LIMIT 2');
    const [purchaseOrders]: any = await connection.query('SELECT POId FROM tblPurchaseOrder LIMIT 2');

    if (suppliers.length === 0 || warehouses.length === 0 || items.length === 0 || users.length === 0) {
      console.error('Cannot seed dummy ASN data because database is missing basic seed records.');
      process.exit(1);
    }

    const supplierId = suppliers[0].SupplierId;
    const warehouseId = warehouses[0].WarehouseId;
    const userId = users[0].UserId;
    const poId = purchaseOrders.length > 0 ? purchaseOrders[0].POId : null;

    console.log('Clearing existing dummy ASNs...');
    await connection.query('DELETE FROM tblASNItem');
    await connection.query('DELETE FROM tblASN');

    console.log('Seeding dummy ASNs...');
    const dummyAsns = [
      {
        ASNNumber: 'ASN-20260715-0001',
        SupplierId: supplierId,
        POId: poId,
        ShipmentDate: '2026-07-14 08:00:00',
        ExpectedArrivalDate: '2026-07-16 14:00:00',
        Transporter: 'DHL Express',
        VehicleNumber: 'MH-12-PQ-9876',
        TrackingNumber: 'TRK987654321',
        WarehouseId: warehouseId,
        Status: 'Confirmed',
        Remarks: 'Primary batch delivery containing raw panels',
        CreatedBy: userId,
        Items: [
          { ItemId: items[0].ItemId, ExpectedQty: 100.0, UOM: items[0].UOM || 'SQFT', BatchNumber: 'BATCH-001A' },
          { ItemId: items[1 % items.length].ItemId, ExpectedQty: 50.0, UOM: items[1 % items.length].UOM || 'SQFT', BatchNumber: 'BATCH-001B' }
        ]
      },
      {
        ASNNumber: 'ASN-20260715-0002',
        SupplierId: suppliers[suppliers.length - 1].SupplierId,
        POId: null,
        ShipmentDate: '2026-07-15 09:30:00',
        ExpectedArrivalDate: '2026-07-17 10:00:00',
        Transporter: 'BlueDart Logistics',
        VehicleNumber: 'DL-03-XY-1234',
        TrackingNumber: 'TRK123456789',
        WarehouseId: warehouseId,
        Status: 'In Transit',
        Remarks: 'Urgent restocking order',
        CreatedBy: userId,
        Items: [
          { ItemId: items[2 % items.length].ItemId, ExpectedQty: 250.0, UOM: items[2 % items.length].UOM || 'SQFT', BatchNumber: 'BATCH-002A' }
        ]
      },
      {
        ASNNumber: 'ASN-20260715-0003',
        SupplierId: supplierId,
        POId: poId,
        ShipmentDate: '2026-07-12 06:00:00',
        ExpectedArrivalDate: '2026-07-13 18:00:00',
        Transporter: 'FedEx Cargo',
        VehicleNumber: 'HR-26-AB-5678',
        TrackingNumber: 'TRK567812349',
        WarehouseId: warehouseId,
        Status: 'Fully Received',
        Remarks: 'Completed shipment receipt',
        CreatedBy: userId,
        Items: [
          { ItemId: items[0].ItemId, ExpectedQty: 80.0, UOM: items[0].UOM || 'SQFT', BatchNumber: 'BATCH-003A' }
        ]
      }
    ];

    for (const asn of dummyAsns) {
      const [parentResult]: any = await connection.query(`
        INSERT INTO tblASN (ASNNumber, SupplierId, POId, ShipmentDate, ExpectedArrivalDate, Transporter, VehicleNumber, TrackingNumber, WarehouseId, Status, Remarks, CreatedBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        asn.ASNNumber, asn.SupplierId, asn.POId, asn.ShipmentDate, asn.ExpectedArrivalDate,
        asn.Transporter, asn.VehicleNumber, asn.TrackingNumber, asn.WarehouseId, asn.Status,
        asn.Remarks, asn.CreatedBy
      ]);

      const asnId = parentResult.insertId;

      for (const item of asn.Items) {
        await connection.query(`
          INSERT INTO tblASNItem (ASNId, ItemId, ExpectedQty, ReceivedQty, UOM, BatchNumber)
          VALUES (?, ?, ?, 0.0000, ?, ?)
        `, [
          asnId, item.ItemId, item.ExpectedQty, item.UOM, item.BatchNumber
        ]);
      }
    }

    // Force enable MODULE_ASN flag inside database
    await connection.query('UPDATE tblFeatureConfig SET IsEnabled = 1 WHERE FeatureCode = "MODULE_ASN"');

    console.log('Successfully setup and seeded 3 dummy ASNs!');
    process.exit(0);
  } catch (err: any) {
    console.error('Setup failed:', err.message || err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

setupAsn();
