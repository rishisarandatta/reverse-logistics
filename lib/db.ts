import mysql from "mysql2/promise";
import type { Pool, PoolConnection } from "mysql2/promise";

// All connection settings come from environment variables (.env.local),
// never from source code. See .env.example.
function createPool(): Pool {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (!DB_HOST || !DB_USER || DB_PASSWORD === undefined || !DB_NAME) {
    throw new Error(
      "MySQL is not configured. Copy .env.example to .env.local and set DB_HOST, DB_USER, DB_PASSWORD and DB_NAME."
    );
  }

  return mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT ?? 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    // DATE columns as 'YYYY-MM-DD' strings (no timezone shifting) and
    // DECIMAL columns as numbers.
    dateStrings: true,
    decimalNumbers: true,
  });
}

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { mysqlPool?: Pool };
const pool = globalForDb.mysqlPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.mysqlPool = pool;

export default pool;

// Runs `work` on one connection. @app_user_id is set first so the audit
// triggers can record who made each change.
export async function withConnection<T>(
  userId: number | null,
  work: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.query("SET @app_user_id = ?", [userId]);
    return await work(connection);
  } finally {
    connection.release();
  }
}

// Runs `work` inside a transaction: COMMIT on success, ROLLBACK on any error.
export async function withTransaction<T>(
  userId: number | null,
  work: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  return withConnection(userId, async (connection) => {
    await connection.beginTransaction();
    try {
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}
