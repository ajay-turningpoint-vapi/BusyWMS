import dotenv from 'dotenv';
dotenv.config();
import { mssqlDb } from '../src/config/mssql';
import { db } from '../src/config/db';

async function compare() {
  try {
    console.log('Connecting to MSSQL ERP...');
    await mssqlDb.connect();
    const erpPool = mssqlDb.getPool();

    console.log('Connecting to local MariaDB...');
    await db.connect();

    // Query 1: Fetch from ERP
    const erpQuery = `
      WITH Items AS (
        SELECT 
          CODE, name, alias, HSNCODE,
          (SELECT NAME FROM MASTER1 m WHERE m.CODE=MASTER1.CM1) AS MAINUNIT
        FROM master1 
        WHERE mastertype=6
      )
      SELECT CODE, name, alias, MAINUNIT FROM Items
      WHERE MAINUNIT IS NULL OR (MAINUNIT != 'N/A' AND MAINUNIT != 'N.A.')
    `;
    console.log('Running ERP items query...');
    const erpResult = await erpPool.request().query(erpQuery);
    const erpItems = erpResult.recordset;
    console.log(`ERP total items: ${erpItems.length}`);

    // Query 2: Fetch from WMS Local DB
    console.log('Running WMS Local items query...');
    const wmsItems = await db.query('SELECT Code, Name, UOM FROM tblItem');
    console.log(`WMS total items: ${wmsItems.length}`);

    // Compare
    const erpCodes = new Set(erpItems.map((r: any) => String(r.alias || (r.CODE ? String(r.CODE).trim() : '')).trim()));
    const wmsCodes = new Set(wmsItems.map((r: any) => String(r.Code || '').trim()));

    const missingInWms = erpItems.filter((r: any) => {
      const code = String(r.alias || (r.CODE ? String(r.CODE).trim() : '')).trim();
      return !wmsCodes.has(code);
    });

    const extraInWms = wmsItems.filter((r: any) => {
      const code = String(r.Code || '').trim();
      return !erpCodes.has(code);
    });

    console.log('\n===== COMPARISON SUMMARY =====');
    console.log(`Total items in BUSY ERP (excluding N/A): ${erpItems.length}`);
    console.log(`Total items in WMS local database:      ${wmsItems.length}`);
    console.log(`Difference in count (ERP - WMS):         ${erpItems.length - wmsItems.length}`);

    if (missingInWms.length > 0) {
      console.log(`\nItems in ERP but MISSING in WMS (total: ${missingInWms.length}, first 10 shown):`);
      missingInWms.slice(0, 10).forEach((item: any) => {
        console.log(`- Code: "${item.CODE}", Alias: "${item.alias}", Name: "${item.name}", Unit: "${item.MAINUNIT}"`);
      });
    } else {
      console.log('\n[✔] Zero items missing in WMS (all ERP items are successfully loaded!).');
    }

    if (extraInWms.length > 0) {
      console.log(`\nExtra items in WMS (total: ${extraInWms.length}, first 10 shown):`);
      extraInWms.slice(0, 10).forEach((item: any) => {
        console.log(`- Code: "${item.Code}", Name: "${item.Name}", Unit: "${item.UOM}"`);
      });
    } else {
      console.log('[✔] Zero extra items in WMS (no stale items found).');
    }

    process.exit(0);
  } catch (err: any) {
    console.error('Comparison script failed:', err.message || err);
    process.exit(1);
  }
}

compare();
