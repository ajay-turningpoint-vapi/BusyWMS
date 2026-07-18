import db from './src/config/db';
async function run() {
  await db.connect();
  await db.executeCmd("UPDATE tblPurchaseOrder SET Status = 'COMPLETED' WHERE POId = 28");
  console.log('Fixed PO 28');
  process.exit(0);
}
run();
