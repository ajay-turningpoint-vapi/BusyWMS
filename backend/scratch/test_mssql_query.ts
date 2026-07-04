import { mssqlDb } from '../src/config/mssql';
import mssql from 'mssql';

async function test() {
  try {
    await mssqlDb.connect();
    const pool = mssqlDb.getPool();
    const start = new Date('2020-01-01');
    const end = new Date('2030-12-31');
    
    const query = `
      SELECT TOP 5
          T.VCHCODE,
          T.VCHNO,
          T.DATE,
          P.NAME AS PARTYNAME,
          P.CODE AS PARTY_CODE,
          PG.NAME AS ACCOUNT_GRP,
          SM.NAME AS SALESMAN,
          PCB.NAME AS PACKED_CHECKED_BY,
          I.NAME AS ITEM,
          I.ALIAS,
          T.MASTERCODE1 AS ITEM_ERP_CODE,
          U.NAME AS UNITS,
          IG.NAME AS ITEM_GRP,
          ABS(T.D1) AS QTY,
          MA.OF2 AS SCHEME,
          MA.OF5 AS INCENTIVE_POINTS,
          ((T.D2 * MA.OF5) / 100.0) * ABS(T.D1) AS INCENTIVE_AMOUNT,
          CM.NAME AS COMMISSION,
          (T.D2 * TRY_CONVERT(FLOAT, CM.NAME) / 100.0) AS COMMISSION_POINTS_PER_ITEM,
          ((T.D2 * TRY_CONVERT(FLOAT, CM.NAME) / 100.0) * ABS(T.D1)) AS COMMISSION_AMOUNT,
          T.D18 AS MRP,
          CASE 
              WHEN TRY_CONVERT(FLOAT, SUBSTRING(I.C3,1,5)) > 0 
                  THEN I.C3
              ELSE I.D16
          END AS SALEDISCOUNT,
          CASE 
              WHEN ISNUMERIC(I.D16) = 1 
                  THEN CONVERT(VARCHAR(30), I.D16)
              ELSE CONVERT(VARCHAR(30), I.C3)
          END AS DISCOUNT,
          T.D9 AS VCHDISCOUNT,
          CASE 
              WHEN T.VCHSERIESCODE IN ('296829','258')  
                  THEN MS.D2
              ELSE I.D16 
          END AS PARTYWISE_DISCOUNT_IN_MASTER,
          (
              CASE 
                  WHEN T.VCHSERIESCODE IN ('296829','258')  
                      THEN MS.D2
                  ELSE I.D16 
              END - T.D9
          ) AS DIFFERANCE_IN_DIS,
          T.D2 AS NET_PRICE,
          T.D5 AS AMOUNT,
          C.USERNAME AS PREPARED_BY
      FROM TRAN2 T
      -- Party
      INNER JOIN MASTER1 P 
          ON P.CODE = T.CM1 
         AND P.MASTERTYPE = 2
      LEFT JOIN MASTER1 PG 
          ON PG.CODE = P.PARENTGRP
      -- Item
      INNER JOIN MASTER1 I 
          ON I.CODE = T.MASTERCODE1 
         AND I.MASTERTYPE = 6
      -- Units
      LEFT JOIN MASTER1 U 
          ON U.CODE = T.CM2
      -- Salesman
      LEFT JOIN VCHOTHERINFO V 
          ON V.VCHCODE = T.VCHCODE
      LEFT JOIN MASTER1 SM 
          ON SM.CODE = TRY_CONVERT(INT, V.OF3)
      -- Packed/Checked By
      LEFT JOIN MASTER1 PCB 
          ON PCB.CODE = TRY_CONVERT(INT, V.OF6)
      -- Item Group
      LEFT JOIN MASTER1 IG 
          ON IG.CODE = I.PARENTGRP
      -- Scheme / Incentive
      LEFT JOIN MASTERADDRESSINFO MA 
          ON MA.MASTERCODE = I.CODE
      -- Commission
      LEFT JOIN MASTERADDRESSINFO MA2 
          ON MA2.MASTERCODE = I.CODE
      LEFT JOIN MASTER1 CM 
          ON CM.CODE = TRY_CONVERT(INT, MA2.OF4)
      -- Master Support
      LEFT JOIN MASTERSUPPORT MS 
          ON MS.MASTERCODE = T.MASTERCODE1 
         AND MS.I1 = 101
      -- Prepared By
      INNER JOIN CHECKLIST C 
          ON C.CODE = T.VCHCODE 
         AND C.TYPE = 2 
         AND C.ACTION = 1
      WHERE 
          T.VCHTYPE IN (9)
          AND T.TRANTYPE IN (0)
          AND V.OF3 LIKE '[0-9]%'
          AND T.RECTYPE = 2
          AND T.DATE BETWEEN @startdate AND @enddate
    `;
    
    console.log('Running test SO query...');
    const result = await pool.request()
      .input('startdate', mssql.DateTime, start)
      .input('enddate', mssql.DateTime, end)
      .query(query);

    console.log('Query result count:', result.recordset.length);
    console.log('Sample record:', result.recordset[0]);
    process.exit(0);
  } catch (err) {
    console.error('Test query failed:', err);
    process.exit(1);
  }
}

test();
