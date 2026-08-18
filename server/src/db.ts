/**
 * SQLite database bootstrap (better-sqlite3 or sql.js on Android).
 */

import { getDatabase } from './db-instance';

const db = getDatabase();

export interface FundRow {
  fund_code: string;
  fund_name: string;
  is_tax_free: number;
  is_active: number;
  umbrella_type?: string | null;
}

export interface PriceRow {
  id: number;
  fund_code: string;
  price_date: string;
  price: number;
  portfolio_value?: number | null;
  total_pay_value?: number | null;
  total_shares?: number | null;
  investor_count?: number | null;
  active_value?: number | null;
  occupancy_rate?: number | null;
}

export interface PortfolioRow {
  id: number;
  fund_code: string;
  buy_date: string;
  buy_price: number;
  quantity: number;
}

export interface PortfolioHistoryRow {
  id: number;
  fund_code: string;
  transaction_type: 'BUY' | 'SELL';
  transaction_date: string;
  price: number;
  quantity: number;
  realized_pnl: number;
}

export interface DividendRow {
  id: number;
  fund_code: string;
  amount_tl: number;
  date: string;
}

export interface AlertRow {
  id: number;
  fund_code: string;
  target_price: number;
  condition: 'ABOVE' | 'BELOW';
  is_active: number;
}

export default db;
