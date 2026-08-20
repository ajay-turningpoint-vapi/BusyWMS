import { db } from './src/config/db';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await db.connect();

  const pickLists = await db.query('SELECT * FROM tblPickList');
  console.log('tblPickList:', pickLists);

  const pickDetails = await db.query('SELECT * FROM tblPickListDetail');
  console.log('tblPickListDetail:', pickDetails);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
