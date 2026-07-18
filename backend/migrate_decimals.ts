import db from './src/config/db';

async function migrate() {
  try {
    await db.connect();
    
    // Find all columns with DECIMAL(18,4)
    const columns = await db.query(`
      SELECT c.TABLE_NAME, c.COLUMN_NAME, c.COLUMN_DEFAULT, c.IS_NULLABLE
      FROM information_schema.COLUMNS c
      INNER JOIN information_schema.TABLES t ON c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_SCHEMA = t.TABLE_SCHEMA
      WHERE c.TABLE_SCHEMA = 'BusyWMS' 
        AND t.TABLE_TYPE = 'BASE TABLE'
        AND c.NUMERIC_PRECISION = 18 
        AND c.NUMERIC_SCALE = 4;
    `);

    console.log(`Found ${columns.length} columns to migrate.`);

    for (const col of columns) {
      let defaultClause = '';
      if (col.COLUMN_DEFAULT !== null) {
        // Strip trailing zeros from default if it's a number
        let newDefault = col.COLUMN_DEFAULT;
        if (!isNaN(parseFloat(newDefault))) {
            newDefault = parseFloat(newDefault).toFixed(3);
        }
        defaultClause = `DEFAULT ${newDefault}`;
      }
      
      const nullClause = col.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL';

      const alterSql = `ALTER TABLE \`${col.TABLE_NAME}\` MODIFY COLUMN \`${col.COLUMN_NAME}\` DECIMAL(18,3) ${nullClause} ${defaultClause}`;
      console.log('Running:', alterSql);
      await db.executeCmd(alterSql);
    }
    
    console.log("Migration successful");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
