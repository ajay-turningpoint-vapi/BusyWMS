import db from './src/config/db';
async function run() {
  await db.connect();
  const q = `
    SELECT po.POId, po.POCode, po.Status, pod.ItemId, pod.OrderQty, pod.ReceivedQty,
    (SELECT SUM(gd.ReceivedQty) FROM tblGRNDetail gd INNER JOIN tblGRN g ON gd.GRNId = g.GRNId WHERE g.POId = po.POId AND gd.ItemId = pod.ItemId AND g.Status != 'CANCELLED') AS TotalGrnQty
    FROM tblPurchaseOrder po
    INNER JOIN tblPurchaseOrderDetail pod ON po.POId = pod.POId
    WHERE po.POCode = 'TVPO/3834/26-27'
  `;
  const res = await db.query(q);
  console.log(res);
  process.exit(0);
}
run();
