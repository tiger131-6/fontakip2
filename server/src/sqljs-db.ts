/**
 * sql.js-backed SQLite compatible with the better-sqlite3 surface used by FundTrack.
 * Used on Android (embedded Node) where native better-sqlite3 binaries are unavailable.
 */

import fs from 'fs';
import path from 'path';
import initSqlJs, { type Database as SqlJsRaw, type SqlValue } from 'sql.js';
import type { FundTrackDatabase } from './db-instance';

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

class SqlJsStatement<Result = unknown> {
  constructor(
    private readonly raw: SqlJsRaw,
    private readonly sql: string,
    private readonly onMutate: () => void
  ) {}

  run(...params: SqlValue[]): RunResult {
    this.raw.run(this.sql, params);
    this.onMutate();
    return {
      changes: this.raw.getRowsModified(),
      lastInsertRowid: this.readLastInsertRowid(),
    };
  }

  get(...params: SqlValue[]) {
    const stmt = this.raw.prepare(this.sql);
    try {
      if (params.length) stmt.bind(params);
      if (!stmt.step()) return undefined;
      return stmt.getAsObject() as Result;
    } finally {
      stmt.free();
    }
  }

  all(...params: SqlValue[]) {
    const stmt = this.raw.prepare(this.sql);
    const rows: Result[] = [];
    try {
      if (params.length) stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject() as Result);
      return rows;
    } finally {
      stmt.free();
    }
  }

  private readLastInsertRowid(): number {
    const row = this.raw.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0];
    return typeof row === 'number' ? row : Number(row ?? 0);
  }
}

export class SqlJsDatabase implements FundTrackDatabase {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly raw: SqlJsRaw,
    private readonly dbPath: string
  ) {}

  pragma(source: string): void {
    this.raw.run(`PRAGMA ${source}`);
  }

  exec(source: string): void {
    this.raw.exec(source);
    this.scheduleSave();
  }

  prepare<Params extends unknown[] = unknown[], Result = unknown>(source: string) {
    return new SqlJsStatement<Result>(this.raw, source, () => this.scheduleSave()) as {
      run(...params: Params): { changes: number; lastInsertRowid: number | bigint };
      get(...params: Params): Result;
      all(...params: Params): Result[];
    };
  }

  transaction<T extends (...args: never[]) => unknown>(fn: T): T {
    const wrapped = (...args: never[]) => {
      this.raw.run('BEGIN');
      try {
        const result = fn(...args);
        this.raw.run('COMMIT');
        this.scheduleSave();
        return result;
      } catch (err) {
        try {
          this.raw.run('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      }
    };
    return wrapped as T;
  }

  close(): void {
    this.persistNow();
    this.raw.close();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.persistNow();
      this.saveTimer = null;
    }, 1500);
  }

  private persistNow(): void {
    const data = this.raw.export();
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }
}

export async function createSqlJsDatabase(dbPath: string, wasmPath: string): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  let raw: SqlJsRaw;
  if (fs.existsSync(dbPath)) {
    raw = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    raw = new SQL.Database();
  }

  return new SqlJsDatabase(raw, dbPath);
}
