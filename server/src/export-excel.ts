import * as XLSX from 'xlsx';
import db from './db';
import { getPortfolioHistory } from './portfolio';
import { getDividends } from './dividends';

export function buildPortfolioExcelBuffer(): Buffer {
  const holdings = db
    .prepare(
      `SELECT p.id, p.fund_code, f.fund_name, p.buy_date, p.buy_price, p.quantity
       FROM portfolio p
       LEFT JOIN funds f ON f.fund_code = p.fund_code
       ORDER BY p.id`
    )
    .all() as Array<{
    id: number;
    fund_code: string;
    fund_name: string | null;
    buy_date: string;
    buy_price: number;
    quantity: number;
  }>;

  const history = getPortfolioHistory();
  const dividends = getDividends();

  const wb = XLSX.utils.book_new();

  const holdingsSheet = XLSX.utils.json_to_sheet(
    holdings.map((h) => ({
      ID: h.id,
      'Fon Kodu': h.fund_code,
      'Fon Adı': h.fund_name ?? '',
      'Alım Tarihi': h.buy_date,
      'Alış Fiyatı': h.buy_price,
      Adet: h.quantity,
      'Toplam Maliyet': h.buy_price * h.quantity,
    }))
  );
  XLSX.utils.book_append_sheet(wb, holdingsSheet, 'Aktif Portföy');

  const historySheet = XLSX.utils.json_to_sheet(
    history.map((h) => ({
      ID: h.id,
      'Fon Kodu': h.fund_code,
      'İşlem Tipi': h.transaction_type,
      Tarih: h.transaction_date,
      Fiyat: h.price,
      Adet: h.quantity,
      'Gerçekleşen K/Z': h.realized_pnl,
    }))
  );
  XLSX.utils.book_append_sheet(wb, historySheet, 'İşlem Geçmişi');

  const dividendSheet = XLSX.utils.json_to_sheet(
    dividends.map((d) => ({
      ID: d.id,
      'Fon Kodu': d.fund_code,
      'Temettü (TL)': d.amount_tl,
      Tarih: d.date,
    }))
  );
  XLSX.utils.book_append_sheet(wb, dividendSheet, 'Temettüler');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
