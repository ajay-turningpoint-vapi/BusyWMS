import mysql from 'mysql2/promise';

export type DbType = 'MARIADB';

class DatabaseConnection {
  private dbType: DbType = 'MARIADB';
  private mariadbPool: mysql.Pool | null = null;

  constructor() {
    this.dbType = 'MARIADB';
  }

  public async connect(): Promise<void> {
    try {
      const config: any = {
        host: process.env.MARIADB_HOST || 'localhost',
        port: parseInt(process.env.MARIADB_PORT || '3306'),
        user: process.env.MARIADB_USER || 'root',
        password: process.env.MARIADB_PASSWORD || 'Password123!',
        database: process.env.MARIADB_DATABASE || 'BusyWMS',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        authPlugins: {
          mysql_native_password: () => () => process.env.MARIADB_PASSWORD || 'Password123!'
        },
        enableKeepAlive: true
      };
      console.log(`Connecting to MariaDB at ${config.host}:${config.port}...`);
      this.mariadbPool = mysql.createPool(config);
      // Test connection
      const conn = await this.mariadbPool.getConnection();
      console.log('MariaDB Connected successfully.');
      conn.release();
    } catch (err) {
      console.error('MariaDB Connection failed.', err);
      throw err;
    }
  }

  public getEngine(): DbType {
    return this.dbType;
  }

  // Generalized query wrapper that handles parameter bindings for MariaDB (@param -> ?)
  public async query<T = any>(sql: string, params: Record<string, any> = {}): Promise<T[]> {
    let mysqlSql = sql;
    const values: any[] = [];
    mysqlSql = mysqlSql.replace(/@([a-zA-Z0-9_]+)\b/g, (match, paramName) => {
      if (paramName in params) {
        values.push(params[paramName]);
        return '?';
      }
      return match;
    });
    try {
      const [rows] = await this.mariadbPool!.query(mysqlSql, values);
      return rows as T[];
    } catch (err: any) {
      if (err.sqlState === '45000') {
        throw err;
      }
      console.error('[DATABASE ERROR query]:', err, { sql, params });
      throw new Error('A secure database operation error occurred. Details logged on server.');
    }
  }

  // Run updates/inserts and return status
  public async executeCmd(sql: string, params: Record<string, any> = {}): Promise<{ rowsAffected: number, lastID?: number }> {
    let mysqlSql = sql;
    const values: any[] = [];
    mysqlSql = mysqlSql.replace(/@([a-zA-Z0-9_]+)\b/g, (match, paramName) => {
      if (paramName in params) {
        values.push(params[paramName]);
        return '?';
      }
      return match;
    });
    try {
      const [result]: any = await this.mariadbPool!.execute(mysqlSql, values);
      return { 
        rowsAffected: result.affectedRows || 0,
        lastID: result.insertId || undefined
      };
    } catch (err: any) {
      if (err.sqlState === '45000') {
        throw err;
      }
      console.error('[DATABASE ERROR executeCmd]:', err, { sql, params });
      throw new Error('A secure database operation error occurred. Details logged on server.');
    }
  }

  // Stored Procedure execution wrapper
  public async executeSp<T = any>(spName: string, params: Record<string, any> = {}): Promise<T[]> {
    let sql = '';
    let values: any[] = [];
    if (spName === 'sp_AllocateBinForPutaway') {
      sql = 'CALL sp_AllocateBinForPutaway(?, ?, ?)';
      values = [params.ItemId, params.Qty, params.PreferredWarehouseId];
    } else if (spName === 'sp_ReserveInventory') {
      sql = 'CALL sp_ReserveInventory(?, ?)';
      values = [params.SOId, params.UserId];
    } else if (spName === 'sp_ProcessGRN') {
      sql = 'CALL sp_ProcessGRN(?, ?)';
      values = [params.GRNId ?? params.grnId, params.UserId ?? params.userId];
    } else if (spName === 'sp_ProcessPutaway') {
      sql = 'CALL sp_ProcessPutaway(?, ?, ?, ?)';
      values = [
        params.GRNDetailId ?? params.grnDetailId,
        params.BinId ?? params.binId,
        params.Quantity ?? params.quantity,
        params.UserId ?? params.userId
      ];
    } else {
      throw new Error(`Unsupported Stored Procedure: ${spName}`);
    }
    try {
      const [rows]: any = await this.mariadbPool!.query(sql, values);
      if (Array.isArray(rows)) {
        return (rows[0] || []) as T[];
      }
      return [] as T[];
    } catch (err: any) {
      if (err.sqlState === '45000') {
        throw err;
      }
      console.error('[DATABASE ERROR executeSp]:', err, { spName, params });
      throw new Error('A secure database operation error occurred. Details logged on server.');
    }
  }

  // Transaction manager executing callbacks on a single connection scope
  public async transaction<T = any>(callback: (tx: TransactionContext) => Promise<T>): Promise<T> {
    if (!this.mariadbPool) {
      throw new Error('Database pool not initialized.');
    }
    const conn = await this.mariadbPool.getConnection();
    await conn.beginTransaction();
    const context = new TransactionContext(conn);
    try {
      const result = await callback(context);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

export class TransactionContext {
  private conn: mysql.PoolConnection;

  constructor(conn: mysql.PoolConnection) {
    this.conn = conn;
  }

  public async query<T = any>(sql: string, params: Record<string, any> = {}): Promise<T[]> {
    let mysqlSql = sql;
    const values: any[] = [];
    mysqlSql = mysqlSql.replace(/@([a-zA-Z0-9_]+)\b/g, (match, paramName) => {
      if (paramName in params) {
        values.push(params[paramName]);
        return '?';
      }
      return match;
    });
    try {
      const [rows] = await this.conn.query(mysqlSql, values);
      return rows as T[];
    } catch (err: any) {
      if (err.sqlState === '45000') {
        throw err;
      }
      console.error('[DATABASE ERROR tx.query]:', err, { sql, params });
      throw new Error('A secure database operation error occurred. Details logged on server.');
    }
  }

  public async executeCmd(sql: string, params: Record<string, any> = {}): Promise<{ rowsAffected: number, lastID?: number }> {
    let mysqlSql = sql;
    const values: any[] = [];
    mysqlSql = mysqlSql.replace(/@([a-zA-Z0-9_]+)\b/g, (match, paramName) => {
      if (paramName in params) {
        values.push(params[paramName]);
        return '?';
      }
      return match;
    });
    try {
      const [result]: any = await this.conn.execute(mysqlSql, values);
      return { 
        rowsAffected: result.affectedRows || 0,
        lastID: result.insertId || undefined
      };
    } catch (err: any) {
      if (err.sqlState === '45000') {
        throw err;
      }
      console.error('[DATABASE ERROR tx.executeCmd]:', err, { sql, params });
      throw new Error('A secure database operation error occurred. Details logged on server.');
    }
  }

  public async executeSp<T = any>(spName: string, params: Record<string, any> = {}): Promise<T[]> {
    let sql = '';
    let values: any[] = [];
    if (spName === 'sp_AllocateBinForPutaway') {
      sql = 'CALL sp_AllocateBinForPutaway(?, ?, ?)';
      values = [params.ItemId, params.Qty, params.PreferredWarehouseId];
    } else if (spName === 'sp_ReserveInventory') {
      sql = 'CALL sp_ReserveInventory(?, ?)';
      values = [params.SOId, params.UserId];
    } else if (spName === 'sp_ProcessGRN') {
      sql = 'CALL sp_ProcessGRN(?, ?)';
      values = [params.GRNId ?? params.grnId, params.UserId ?? params.userId];
    } else if (spName === 'sp_ProcessPutaway') {
      sql = 'CALL sp_ProcessPutaway(?, ?, ?, ?)';
      values = [
        params.GRNDetailId ?? params.grnDetailId,
        params.BinId ?? params.binId,
        params.Quantity ?? params.quantity,
        params.UserId ?? params.userId
      ];
    } else {
      throw new Error(`Unsupported Stored Procedure: ${spName}`);
    }
    try {
      const [rows]: any = await this.conn.query(sql, values);
      if (Array.isArray(rows)) {
        return (rows[0] || []) as T[];
      }
      return [] as T[];
    } catch (err: any) {
      if (err.sqlState === '45000') {
        throw err;
      }
      console.error('[DATABASE ERROR tx.executeSp]:', err, { spName, params });
      throw new Error('A secure database operation error occurred. Details logged on server.');
    }
  }
}

export const db = new DatabaseConnection();
export default db;
