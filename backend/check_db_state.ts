import db from './src/config/db';
async function run() {
  await db.connect();
  const q = `
    SELECT pod.ItemId, pod.OrderQty, pod.ReceivedQty,
           (SELECT PendingQty FROM vw_PendingGRN vw WHERE vw.PODetailId = pod.PODetailId LIMIT 1) AS PendingQty
    FROM tblPurchaseOrderDetail pod 
    WHERE pod.POId = 28
  `;
  const res = await db.query(q);
  console.log(res);
  process.exit(0);
}
run();
