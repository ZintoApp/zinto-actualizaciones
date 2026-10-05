import { Pool, type PoolClient } from 'pg';
import pgvector from 'pgvector/pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "../shared/schema";
import { secureEnv } from "./utils/secure-env";


if (!secureEnv.validateIntegrity()) {
  throw new Error("Environment integrity check failed");
}

const sslConfig = () => {
  const sslMode = process.env.PGSSLMODE || 'disable';

  if (sslMode === 'disable') {
    return false;
  }

  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.includes('localhost')) {
    return { rejectUnauthorized: false };
  }
  return false;
};


async function registerPgvectorTypes(client: PoolClient): Promise<void> {
  try {
    await pgvector.registerTypes(client);
  } catch (err) {
    if (err instanceof Error && err.message === 'vector type not found in the database') {
      return;
    }
    console.warn('Failed to register pgvector types:', err);
  }
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: secureEnv.getDatabaseUrl(),
    ssl: sslConfig(),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
  });

  pool.on('connect', (client) => {
    void registerPgvectorTypes(client);
  });

  return pool;
}

let poolInstance = createPool();


let isPoolDrained = false;

/**
 * Get the current pool instance
 * Always returns the live pool reference, even after reinitialization
 */
export function getPool(): Pool {
  if (isPoolDrained) {
    throw new Error('Database pool is drained. Pool is being reinitialized during maintenance.');
  }
  return poolInstance;
}

/**
 * Get the current db instance
 * Always returns the live db reference, even after reinitialization
 */
export function getDb() {
  if (isPoolDrained) {
    throw new Error('Database pool is drained. Database is being reinitialized during maintenance.');
  }
  return db;
}



export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  },
  set(_target, prop, value) {
    (getPool() as any)[prop] = value;
    return true;
  }
}) as Pool;


export let db = drizzle(poolInstance, { schema });

/**
 * Drain and end the current pool
 * Used during maintenance operations like database restore
 */
export async function drainPool(): Promise<void> {
  
  isPoolDrained = true;
  await poolInstance.end();
  
}

/**
 * Reinitialize the pool after it has been drained
 * Used after maintenance operations like database restore
 */
export function reinitializePool(): void {
  

  poolInstance = createPool();


  db = drizzle(poolInstance, { schema });


  isPoolDrained = false;

  
}

/**
 * Replace the pool after migrations so new clients register pgvector types
 * once the vector extension exists.
 */
export async function refreshPoolAfterMigrations(): Promise<void> {
  const oldPool = poolInstance;
  isPoolDrained = true;
  await oldPool.end();
  reinitializePool();
}