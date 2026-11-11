import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from 'mysql2/promise';

import * as schema from './schema/index.js';

/** 数据库连接参数：由调用方从环境变量读取后传入。 */
export interface DatabaseOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
  timezone?: string;
}

export type TransactionConnection = PoolConnection;

/**
 * 共享数据库客户端。
 * - `db`：Drizzle 查询构建器；
 * - `query` / `queryOne` / `execute`：参数化 SQL（API 层主要使用）；
 * - `transaction`：在同一连接上开启事务。
 */
export class DatabaseClient {
  readonly pool: Pool;
  readonly db: MySql2Database<typeof schema>;

  constructor(options: DatabaseOptions) {
    this.pool = mysql.createPool({
      host: options.host,
      port: options.port,
      user: options.user,
      password: options.password,
      database: options.database,
      waitForConnections: true,
      connectionLimit: options.connectionLimit ?? 10,
      queueLimit: 0,
      timezone: options.timezone ?? '+08:00',
      dateStrings: true,
    });
    this.db = drizzle(this.pool, { schema, mode: 'default' });
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params as unknown[]);
    return rows as unknown as T[];
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params: readonly unknown[] = []): Promise<ResultSetHeader> {
    const [result] = await this.pool.query(sql, params as unknown[]);
    return result as ResultSetHeader;
  }

  async transaction<T>(fn: (conn: TransactionConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** 事务连接上的参数化查询。 */
export async function queryOn<T = Record<string, unknown>>(
  conn: TransactionConnection,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const [rows] = await conn.query(sql, params as unknown[]);
  return rows as unknown as T[];
}

export async function queryOneOn<T = Record<string, unknown>>(
  conn: TransactionConnection,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await queryOn<T>(conn, sql, params);
  return rows[0] ?? null;
}

export async function executeOn(
  conn: TransactionConnection,
  sql: string,
  params: readonly unknown[] = [],
): Promise<ResultSetHeader> {
  const [result] = await conn.query(sql, params as unknown[]);
  return result as ResultSetHeader;
}

export { schema };
