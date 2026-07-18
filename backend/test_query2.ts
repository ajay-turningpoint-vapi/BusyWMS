import db from './src/config/db';
async function run() {
  await db.connect();
  const q = `
    SELECT pod.ItemId, pod.OrderQty, pod.ReceivedQty,
           (
             SELECT COALESCE(SUM(gd.ReceivedQty), 0)
             FROM tblGRNDetail gd
             INNER JOIN tblGRN g ON gd.GRNId = g.GRNId
             WHERE gd.ItemId = pod.ItemId AND g.POId = pod.POId 
               AND g.Status IN ('PENDING', 'QC_COMPLETED', 'PARTIAL_PUTAWAY')
           ) AS UnconfirmedGrnQty
    FROM tblPurchaseOrderDetail pod 
    WHERE pod.POId = 28
  `;
  const res = await db.query(q);
  console.log(res);
  process.exit(0);
}
run();
