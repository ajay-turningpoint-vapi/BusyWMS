import { db } from './src/config/db';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await db.connect();

  const bin = await db.query('SELECT BinId, Code, Barcode FROM tblBin WHERE BinId = 11');
  console.log('Bin details:', bin);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
