import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function inspectPo() {
  try {
    await db.connect();
    console.log('Connected to database.');

    const poId = 26;
    const grns = await db.query('SELECT * FROM tblGRN WHERE POId = @poId', { poId });
    console.log('GRNs linked to PO 26:', grns);

    if (grns.length > 0) {
      const details = await db.query(`
        SELECT gd.*, g.Status AS GRNStatus 
        FROM tblGRNDetail gd 
        INNER JOIN tblGRN g ON gd.GRNId = g.GRNId 
        WHERE g.POId = @poId
      `, { poId });
      console.log('GRN Details linked to PO 26:', details);
    }

    process.exit(0);
  } catch (err: any) {
    console.error('Inspection failed:', err.message || err);
    process.exit(1);
  }
}

inspectPo();
