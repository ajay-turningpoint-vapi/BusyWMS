import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function diagnose() {
  try {
    await db.connect();
    
    console.log('=== tblGRN ===');
    const grns = await db.query("SELECT * FROM tblGRN");
    console.log(JSON.stringify(grns, null, 2));

    console.log('\n=== tblGRNDetail ===');
    const grnDetails = await db.query("SELECT * FROM tblGRNDetail");
    console.log(JSON.stringify(grnDetails, null, 2));

    process.exit(0);
  } catch (err: any) {
    console.error('Diagnosis failed:', err.message || err);
    process.exit(1);
  }
}

diagnose();
