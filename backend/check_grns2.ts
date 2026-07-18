import db from './src/config/db';
async function run() {
  await db.connect();
  const grns = await db.query("SELECT GRNId, GRNCode, IsSynced, CreatedAt FROM tblGRN WHERE GRNCode = 'GRN-101'");
  console.log('GRNs:', grns);
  process.exit(0);
}
run();
