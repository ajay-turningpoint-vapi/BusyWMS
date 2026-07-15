import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function syncAllGrns() {
  try {
    await db.connect();
    console.log('Connected to database.');

    console.log('Updating all GRNs to IsSynced = 1...');
    const result = await db.executeCmd('UPDATE tblGRN SET IsSynced = 1');
    console.log(`Successfully updated ${result.rowsAffected} GRN records to IsSynced = 1!`);

    process.exit(0);
  } catch (err: any) {
    console.error('Update failed:', err.message || err);
    process.exit(1);
  }
}

syncAllGrns();
