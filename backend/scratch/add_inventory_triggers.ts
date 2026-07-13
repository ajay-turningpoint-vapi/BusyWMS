import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function addTriggers() {
  try {
    await db.connect();
    console.log('Connected to database.');

    console.log('Dropping existing triggers if they exist...');
    await db.query('DROP TRIGGER IF EXISTS tr_tblInventory_PreventMixedProducts_Insert');
    await db.query('DROP TRIGGER IF EXISTS tr_tblInventory_PreventMixedProducts_Update');

    console.log('Creating BEFORE INSERT trigger on tblInventory...');
    await db.query(`
      CREATE TRIGGER tr_tblInventory_PreventMixedProducts_Insert
      BEFORE INSERT ON tblInventory
      FOR EACH ROW
      BEGIN
          IF NEW.Quantity > 0 AND EXISTS (
              SELECT 1 FROM tblInventory 
              WHERE BinId = NEW.BinId AND ItemId != NEW.ItemId AND Quantity > 0
          ) THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operation failed: Target bin already contains a different product.';
          END IF;
      END
    `);

    console.log('Creating BEFORE UPDATE trigger on tblInventory...');
    await db.query(`
      CREATE TRIGGER tr_tblInventory_PreventMixedProducts_Update
      BEFORE UPDATE ON tblInventory
      FOR EACH ROW
      BEGIN
          IF NEW.Quantity > 0 AND EXISTS (
              SELECT 1 FROM tblInventory 
              WHERE BinId = NEW.BinId AND ItemId != NEW.ItemId AND Quantity > 0
          ) THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operation failed: Target bin already contains a different product.';
          END IF;
      END
    `);

    console.log('Triggers created successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('Trigger creation failed:', err.message || err);
    process.exit(1);
  }
}

addTriggers();
