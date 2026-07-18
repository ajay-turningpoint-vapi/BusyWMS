import db from './src/config/db';
async function run() {
  await db.connect();
  const grns = await db.query("SELECT GRNId, GRNCode, POId, IsSynced, CreatedAt FROM tblGRN ORDER BY GRNId DESC LIMIT 5");
  console.log('GRNs:', grns);
  process.exit(0);
}
run();
