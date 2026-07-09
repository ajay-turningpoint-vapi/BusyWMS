const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'wms_user', password: 'Busy@123', database: 'BusyWMSV1'
  });
  try {
    const [rows] = await conn.query('SELECT * FROM tblBin LIMIT 10');
    console.log('\nSample bins:');
    rows.forEach(r => console.log(r));
  } catch (err) {
    console.error(err.message);
  }
  await conn.end();
  process.exit(0);
}
run();
