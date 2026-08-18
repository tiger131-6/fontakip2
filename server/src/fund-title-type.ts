/** TEFAS "Fon Unvan Tipi" values — derived from official fund title text. */
export const FUND_TITLE_TYPES = [
  'Altın',
  'Borçlanma Araçları',
  'Çalışanlarına Yönelik',
  'Çoklu Varlık',
  'Değişken',
  'Döviz',
  'Döviz Cinsinden İhraç (Dolar)',
  'Girişim Sermayesi',
  'Hisse Senedi',
  'Hisse Senedi Yoğun',
  'Karma',
  'Katılım',
  'Kira Sertifikaları',
  'Özel',
  'Para Piyasası',
  'Serbest',
  'Diğer',
] as const;

export type FundTitleType = (typeof FUND_TITLE_TYPES)[number];

const TITLE_RULES: Array<{ pattern: string; label: FundTitleType }> = [
  { pattern: 'DÖVİZ CİNSİNDEN', label: 'Döviz Cinsinden İhraç (Dolar)' },
  { pattern: 'ÇALIŞANLARINA YÖNELİK', label: 'Çalışanlarına Yönelik' },
  { pattern: 'HİSSE SENEDİ YOĞUN', label: 'Hisse Senedi Yoğun' },
  { pattern: 'GİRİŞİM SERMAYESİ', label: 'Girişim Sermayesi' },
  { pattern: 'KİRA SERTİFİKALARI', label: 'Kira Sertifikaları' },
  { pattern: 'BORÇLANMA ARAÇLARI', label: 'Borçlanma Araçları' },
  { pattern: 'ÇOKLU VARLIK', label: 'Çoklu Varlık' },
  { pattern: 'PARA PİYASASI', label: 'Para Piyasası' },
  { pattern: 'HİSSE SENEDİ', label: 'Hisse Senedi' },
  { pattern: 'DEĞİŞKEN', label: 'Değişken' },
  { pattern: 'KATILIM', label: 'Katılım' },
  { pattern: 'SERBEST', label: 'Serbest' },
  { pattern: 'KARMA', label: 'Karma' },
  { pattern: 'DÖVİZ', label: 'Döviz' },
  { pattern: 'ALTIN', label: 'Altın' },
  { pattern: 'ÖZEL', label: 'Özel' },
];

function normalizeParenHint(hint: string): FundTitleType | null {
  const upper = hint.toLocaleUpperCase('tr-TR').replace(/\s*FONU?\s*$/i, '').trim();
  for (const rule of TITLE_RULES) {
    if (upper.includes(rule.pattern)) return rule.label;
  }
  return null;
}

/** Classify a fund's official TEFAS title into Fon Unvan Türü. */
export function extractFundTitleType(fundName: string): FundTitleType {
  const name = fundName.trim();
  if (!name) return 'Diğer';

  const parenMatch = name.match(/\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const fromParen = normalizeParenHint(parenMatch[1]);
    if (fromParen) return fromParen;
  }

  const upper = name.toLocaleUpperCase('tr-TR');
  for (const rule of TITLE_RULES) {
    if (upper.includes(rule.pattern)) return rule.label;
  }

  return 'Diğer';
}
