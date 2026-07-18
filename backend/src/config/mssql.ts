import mssql from 'mssql';
import dotenv from 'dotenv';
import logger from '../utils/logger';
dotenv.config();

const rawServer = process.env.DB_SERVER || '0.0.0.0';
const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined;

let server = rawServer;
const options: any = {
  encrypt: process.env.DB_ENCRYPT !== 'false',
  trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  enableArithAbort: true,
  useUTC: true,
};

// host\INSTANCE — when port is set, connect by host:port (typical for static ports)
if (rawServer.includes('\\')) {
  const [host, instanceName] = rawServer.split('\\');
  server = host;
  if (!port) {
    options.instanceName = instanceName;
  }
}

const config: mssql.config = {
  server,
  port,
  database: process.env.DB_DATABASE || 'BusyComp0018_db12026',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  options,
  pool: {
    min: process.env.DB_POOL_MIN ? parseInt(process.env.DB_POOL_MIN, 10) : 2,
    max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 20,
    idleTimeoutMillis: 30000,
  },
  requestTimeout: process.env.DB_REQUEST_TIMEOUT ? parseInt(process.env.DB_REQUEST_TIMEOUT, 10) : 120000,
  connectionTimeout: process.env.DB_CONNECTION_TIMEOUT ? parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) : 30000,
};

export class MssqlConnection {
  private pool: mssql.ConnectionPool | null = null;

  public async connect(): Promise<mssql.ConnectionPool> {
    try {
      logger.info(`Connecting to MSSQL at ${server}${port ? ':' + port : ''}...`);
      this.pool = await new mssql.ConnectionPool(config).connect();
      logger.info('MSSQL Connected successfully.');
      return this.pool;
    } catch (err: any) {
      logger.error('MSSQL Connection failed:', err.message || err);
      throw err;
    }
  }

  public getPool(): mssql.ConnectionPool {
    if (!this.pool) {
      throw new Error('MSSQL connection pool is not initialized. Call connect() first.');
    }
    return this.pool;
  }
}

export const mssqlDb = new MssqlConnection();
export default mssqlDb;
