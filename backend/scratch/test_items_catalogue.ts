import { mssqlDb } from '../src/config/mssql';

async function test() {
  try {
    await mssqlDb.connect();
    const pool = mssqlDb.getPool();
    
    const query = `
      SELECT TOP 10 
        CODE, name, alias, HSNCODE,
        (SELECT NAME FROM MASTER1 M WHERE M.CODE=MASTER1.ParentGrp) AS ITEM_GRP,
        d4 as purch_price,
        d17 as purch_dis,
        d3 as alt_sale_price,
        d22 as alt_purch_price,
        D2 AS MRP,
        D16 AS SALE_DIS,
        (SELECT NAME FROM MASTER1 m  WHERE m.CODE=MASTER1.CM1) AS MAINUNIT,
        (SELECT NAME FROM MASTER1  m WHERE m.CODE=MASTER1.CM2) AS ALTUNIT,
        (SELECT NAME FROM MASTER1  m WHERE m.CODE=MASTER1.CM9) AS vndor,
        (SELECT NAME FROM MASTER1  m WHERE m.CODE=MASTER1.CM8) AS tax
      FROM master1 
      WHERE mastertype=6
      ORDER BY alias
    `;
    
    console.log('Running items catalogue query from BUSY ERP (TOP 10)...');
    const result = await pool.request().query(query);

    console.log('--- Results (Total ' + result.recordset.length + ' records) ---');
    console.log(JSON.stringify(result.recordset, null, 2));
    process.exit(0);
  } catch (err: any) {
    console.error('Query failed:', err.message || err);
    process.exit(1);
  }
}

test();
