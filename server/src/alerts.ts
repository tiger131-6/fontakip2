import db, { type AlertRow } from './db';

const stmtList = db.prepare(
  'SELECT id, fund_code, target_price, condition, is_active FROM alerts ORDER BY id DESC'
);
const stmtGet = db.prepare(
  'SELECT id, fund_code, target_price, condition, is_active FROM alerts WHERE id = ?'
);
const stmtInsert = db.prepare(
  'INSERT INTO alerts (fund_code, target_price, condition, is_active) VALUES (?, ?, ?, 1)'
);
const stmtUpdate = db.prepare(
  'UPDATE alerts SET fund_code = ?, target_price = ?, condition = ?, is_active = ? WHERE id = ?'
);
const stmtDelete = db.prepare('DELETE FROM alerts WHERE id = ?');

export interface AlertInput {
  fund_code: string;
  target_price: number;
  condition: 'ABOVE' | 'BELOW';
  is_active?: boolean;
}

export function getAlerts(): AlertRow[] {
  return stmtList.all() as AlertRow[];
}

export function getAlertById(id: number): AlertRow | undefined {
  return stmtGet.get(id) as AlertRow | undefined;
}

export function createAlert(input: AlertInput): AlertRow {
  const result = stmtInsert.run(input.fund_code, input.target_price, input.condition);
  return getAlertById(Number(result.lastInsertRowid))!;
}

export function updateAlert(id: number, input: AlertInput): AlertRow | null {
  const existing = getAlertById(id);
  if (!existing) return null;
  const active = input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active;
  stmtUpdate.run(input.fund_code, input.target_price, input.condition, active, id);
  return getAlertById(id)!;
}

export function deleteAlert(id: number): boolean {
  return stmtDelete.run(id).changes > 0;
}
