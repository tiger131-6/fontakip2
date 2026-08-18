import path from 'path';
import Database from 'better-sqlite3';
import { applySchemaMigrations } from './db-migrations';
import { createSqlJsDatabase, type SqlJsDatabase } from './sqljs-db';

export interface FundTrackStatement<Params extends unknown[] = unknown[], Result = unknown> {
  run(...params: Params): { changes: number; lastInsertRowid: number | bigint };
  get(...params: Params): Result;
  all(...params: Params): Result[];
}

export interface FundTrackDatabase {
  pragma(source: string): unknown;
  exec(source: string): void;
  prepare<Params extends unknown[] = unknown[], Result = unknown>(
    source: string
  ): FundTrackStatement<Params, Result>;
  transaction<F extends (...args: never[]) => unknown>(fn: F): F;
  close(): void;
}

let dbInstance: FundTrackDatabase | null = null;

export function getDbPath(): string {
  return process.env.DB_PATH || path.join(__dirname, '..', 'funds.db');
}

export function getDatabase(): FundTrackDatabase {
  if (!dbInstance) {
    if (process.env.USE_SQLJS === '1') {
      throw new Error('SQL.js veritabanı henüz başlatılmadı.');
    }
    const db = new Database(getDbPath()) as unknown as FundTrackDatabase;
    applySchemaMigrations(db);
    dbInstance = db;
  }
  return dbInstance;
}

export async function initSqlJsDatabase(dbPath: string, wasmPath: string): Promise<FundTrackDatabase> {
  const db = await createSqlJsDatabase(dbPath, wasmPath);
  applySchemaMigrations(db);
  dbInstance = db;
  return db;
}
