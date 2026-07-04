const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function run() {
  const config = {
    host: process.env.MARIADB_HOST || 'localhost',
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER || 'root',
    password: process.env.MARIADB_PASSWORD || 'Password123!',
    database: process.env.MARIADB_DATABASE || 'BusyWMS',
    multipleStatements: true // Enable multi-statement execution
  };

  const sqlPath = path.join(__dirname, '..', '..', 'database', 'asn_migration.sql');
  console.log('Reading migration file from:', sqlPath);
  let sql = fs.readFileSync(sqlPath, 'utf8');

  // Remove MSSQL specific lines if any (like USE BusyWMS or GO)
  sql = sql.replace(/\bGO\b/gi, '');
  sql = sql.replace(/USE BusyWMS;/gi, '');

  console.log('Connecting to database...');
  const conn = await mysql.createConnection(config);
  console.log('Running migration...');
  await conn.query(sql);
  console.log('Migration executed successfully!');
  await conn.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
