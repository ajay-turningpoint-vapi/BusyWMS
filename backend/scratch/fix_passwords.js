const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../database/wms.db');
const db = new sqlite3.Database(dbPath);

async function run() {
  const hash = await bcrypt.hash('admin123', 10);
  console.log(`Generated new verified hash for 'admin123': ${hash}`);
  
  db.run('UPDATE tblUser SET PasswordHash = ?', [hash], function(err) {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`Updated ${this.changes} users with the new hash.`);
    
    // Verify again
    db.all('SELECT Username, PasswordHash FROM tblUser', [], async (err, rows) => {
      for (const row of rows) {
        const isMatch = await bcrypt.compare('admin123', row.PasswordHash);
        console.log(`User: ${row.Username}, Match: ${isMatch}`);
      }
      db.close();
    });
  });
}

run();
