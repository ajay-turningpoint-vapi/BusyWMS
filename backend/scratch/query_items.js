const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'wms_user', password: 'Busy@123', database: 'BusyWMSV1'
  });
  try {
    const [before] = await conn.query('SELECT COUNT(*) as cnt FROM tblItem');
    console.log(`Items before: ${before[0].cnt}`);
    
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE tblItem');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    
    const [after] = await conn.query('SELECT COUNT(*) as cnt FROM tblItem');
    console.log(`Items after:  ${after[0].cnt}`);
    console.log('✅ tblItem cleared successfully. Ready for fresh ERP sync.');
  } catch (err) {
    console.error('Failed:', err.message);
  }
  await conn.end();
  process.exit(0);
}
run();
