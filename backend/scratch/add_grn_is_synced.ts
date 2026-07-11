import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function migrate() {
  try {
    await db.connect();
    console.log('Connected to database.');

    console.log('Adding IsSynced column to tblGRN...');
    await db.query(`
      ALTER TABLE tblGRN ADD COLUMN IsSynced TINYINT(1) DEFAULT 0;
    `);

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('Migration failed:', err.message || err);
    process.exit(1);
  }
}

migrate();
