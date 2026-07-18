import db from './src/config/db';
async function run() {
  await db.connect();
  const res = await db.executeCmd("UPDATE tblPurchaseOrder SET Status = 'COMPLETED' WHERE Status = 'GRN_CREATED'");
  console.log(res);
  process.exit(0);
}
run();
