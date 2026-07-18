import db from './src/config/db';
async function run() {
  await db.connect();
  const po = await db.query("SELECT * FROM tblPurchaseOrder WHERE POCode = 'TVPO/3836/26-27'");
  if (po.length > 0) {
    const lines = await db.query("SELECT * FROM tblPurchaseOrderDetail WHERE POId = @poId", { poId: po[0].POId });
    console.log('Lines:', lines);
  }
  process.exit(0);
}
run();
