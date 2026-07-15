import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MARIADB_HOST || 'localhost',
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER || 'root',
    password: process.env.MARIADB_PASSWORD || 'Password123!',
    database: process.env.MARIADB_DATABASE || 'BusyWMS',
  });
  console.log('Connected to database.');

  try {
    const migrationSqlPath = path.join(__dirname, '../../database/migrations/stock_alerts_schema.sql');
    console.log(`Reading SQL migration: ${migrationSqlPath}`);
    const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

    const commands = migrationSql
      .split(';')
      .map(c => c.trim())
      .filter(c => c);

    console.log('Executing migration commands...');
    for (const cmd of commands) {
      try {
        await connection.query(cmd);
      } catch (err: any) {
        if (
          err.message.includes('already exists') || 
          err.message.includes('Duplicate key name') || 
          err.message.includes('Duplicate column name')
        ) {
          console.log(`Warning bypassed: ${err.message}`);
        } else {
          throw err;
        }
      }
    }

    console.log('Migration runner finished successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('Migration failed:', err.message || err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
