import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/config/db';

async function insertSetting() {
  try {
    await db.connect();
    console.log('Connected to database.');

    console.log('Inserting BLOCK_GRN_ON_MAX_STOCK user setting...');
    await db.executeCmd(`
      INSERT INTO tblUserSetting (SettingKey, SettingValue, Description)
      SELECT 'BLOCK_GRN_ON_MAX_STOCK', '1', 'Block GRN creation if it causes stock to exceed MaxStock (1=block, 0=warn)'
      FROM dual
      WHERE NOT EXISTS (
          SELECT 1 FROM tblUserSetting WHERE SettingKey = 'BLOCK_GRN_ON_MAX_STOCK'
      )
    `);

    console.log('Setting verified successfully.');
    process.exit(0);
  } catch (err: any) {
    console.error('Failed to insert setting:', err.message || err);
    process.exit(1);
  }
}

insertSetting();
