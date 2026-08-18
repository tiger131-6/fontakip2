import db, { type DividendRow } from './db';

const stmtList = db.prepare(
  'SELECT id, fund_code, amount_tl, date FROM dividends ORDER BY date DESC, id DESC'
);
const stmtInsert = db.prepare(
  'INSERT INTO dividends (fund_code, amount_tl, date) VALUES (?, ?, ?)'
);
const stmtDelete = db.prepare('DELETE FROM dividends WHERE id = ?');

export function getDividends(): DividendRow[] {
  return stmtList.all() as DividendRow[];
}

export function addDividend(input: {
  fund_code: string;
  amount_tl: number;
  date: string;
}): DividendRow {
  const result = stmtInsert.run(input.fund_code, input.amount_tl, input.date);
  const id = Number(result.lastInsertRowid);
  const row = db
    .prepare('SELECT id, fund_code, amount_tl, date FROM dividends WHERE id = ?')
    .get(id) as DividendRow;
  return row;
}

export function deleteDividend(id: number): boolean {
  return stmtDelete.run(id).changes > 0;
}

export function getDividendTotal(): number {
  const row = db.prepare('SELECT COALESCE(SUM(amount_tl), 0) AS total FROM dividends').get() as {
    total: number;
  };
  return row.total;
}
