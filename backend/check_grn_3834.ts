import db from './src/config/db';
async function run() {
  await db.connect();
  const q = `SELECT GRNId, GRNCode, CreatedAt FROM tblGRN WHERE POId = 21`;
  const res = await db.query(q);
  console.log(res);
  process.exit(0);
}
run();
