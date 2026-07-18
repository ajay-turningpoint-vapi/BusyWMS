import db from './src/config/db';
async function run() {
  await db.connect();
  const q = `
    SELECT pod.*, item.Code AS ItemCode, item.Name AS ItemName, item.UOM,
           (SELECT PendingQty FROM vw_PendingGRN vw WHERE vw.PODetailId = pod.PODetailId LIMIT 1) AS PendingQty
    FROM tblPurchaseOrderDetail pod 
    INNER JOIN tblItem item ON pod.ItemId = item.ItemId 
    WHERE pod.POId = 28
  `;
  const res = await db.query(q);
  console.log(res);
  process.exit(0);
}
run();
