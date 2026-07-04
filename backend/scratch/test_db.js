const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function test() {
  const config = {
    host: process.env.MARIADB_HOST || 'localhost',
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER || 'root',
    password: process.env.MARIADB_PASSWORD || 'Password123!',
    database: process.env.MARIADB_DATABASE || 'BusyWMS',
  };
  console.log('Connecting with config:', { ...config, password: '***' });
  const conn = await mysql.createConnection(config);
  const [rows] = await conn.query('SHOW TABLES');
  console.log('Tables in database:', rows);
  await conn.end();
}

test().catch(err => {
  console.error('Error connecting to database:', err);
  process.exit(1);
});
