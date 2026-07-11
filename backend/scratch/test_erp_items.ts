import { mssqlDb } from '../src/config/mssql';

async function test() {
  try {
    await mssqlDb.connect();
    const pool = mssqlDb.getPool();
    
    // The exact query provided by the user
    const query = `
      select CODE, name,alias,HSNCODE,
      (SELECT NAME FROM MASTER1 M WHERE M.CODE=MASTER1.ParentGrp)ITEM_GRP,
      d4 as purch_price,d17 as purch_dis, d3 as alt_sale_price,d22 as alt_purch_price,
      D2 AS MRP,D16 AS SALE_DIS,

      (SELECT NAME FROM MASTER1 m  WHERE m.CODE=MASTER1.CM1) MAINUNIT,
      (SELECT NAME FROM MASTER1  m WHERE m.CODE=MASTER1.CM2)ALTUNIT,
      (SELECT NAME FROM MASTER1  m WHERE m.CODE=MASTER1.CM9)vndor,
      (SELECT NAME FROM MASTER1  m WHERE m.CODE=MASTER1.CM8)tax

      from master1 where mastertype=6
    `;
    
    console.log('Running test ERP items query...');
    const result = await pool.request().query(query);

    console.log('--- Query Success ---');
    console.log('Total items found in BUSY ERP: ' + result.recordset.length);
    console.log('First 10 records sample:');
    console.log(JSON.stringify(result.recordset.slice(0, 10), null, 2));
    process.exit(0);
  } catch (err: any) {
    console.error('Test query failed:', err.message || err);
    process.exit(1);
  }
}

test();
