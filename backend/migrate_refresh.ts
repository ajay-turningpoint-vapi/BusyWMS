import db from './src/config/db';

async function migrate() {
  try {
    await db.connect();
    await db.executeCmd(`
      CREATE TABLE IF NOT EXISTS tblRefreshToken (
          TokenId INT AUTO_INCREMENT PRIMARY KEY,
          UserId INT NOT NULL,
          Token VARCHAR(512) NOT NULL UNIQUE,
          ExpiresAt DATETIME NOT NULL,
          CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          Revoked TINYINT(1) DEFAULT 0 NOT NULL,
          FOREIGN KEY (UserId) REFERENCES tblUser(UserId) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log("Migration successful: created tblRefreshToken");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
