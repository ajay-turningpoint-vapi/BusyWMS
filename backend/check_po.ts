import db from './src/config/db';
async function run() {
  await db.connect();
  const po = await db.query("SELECT Status FROM tblPurchaseOrder WHERE POId = 28");
  console.log('PO Status:', po);
  process.exit(0);
}
run();
