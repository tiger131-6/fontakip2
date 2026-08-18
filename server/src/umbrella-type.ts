import { extractFundTitleType, type FundTitleType } from './fund-title-type';

/** Official TEFAS şemsiye labels (fonTurAciklama). */
const TITLE_TO_UMBRELLA: Record<FundTitleType, string> = {
  'Para Piyasası': 'Para Piyasası Şemsiye Fonu',
  'Hisse Senedi': 'Hisse Senedi Şemsiye Fonu',
  'Hisse Senedi Yoğun': 'Hisse Senedi Şemsiye Fonu',
  'Borçlanma Araçları': 'Borçlanma Araçları Şemsiye Fonu',
  'Değişken': 'Değişken Şemsiye Fonu',
  'Serbest': 'Serbest Şemsiye Fonu',
  'Katılım': 'Katılım Şemsiye Fonu',
  'Altın': 'Kıymetli Madenler Şemsiye Fonu',
  'Karma': 'Değişken Şemsiye Fonu',
  'Çoklu Varlık': 'Değişken Şemsiye Fonu',
  'Girişim Sermayesi': 'Serbest Şemsiye Fonu',
  'Kira Sertifikaları': 'Borçlanma Araçları Şemsiye Fonu',
  Döviz: 'Serbest Şemsiye Fonu',
  'Döviz Cinsinden İhraç (Dolar)': 'Serbest Şemsiye Fonu',
  'Çalışanlarına Yönelik': 'Değişken Şemsiye Fonu',
  Özel: 'Serbest Şemsiye Fonu',
  Diğer: 'Değişken Şemsiye Fonu',
};

/** Infer şemsiye type from fund title when TEFAS fonTurAciklama is unavailable. */
export function inferUmbrellaTypeFromFundName(fundName: string): string {
  const upper = fundName.toLocaleUpperCase('tr-TR');
  if (upper.includes('FON SEPET')) return 'Fon Sepeti Şemsiye Fonu';
  if (upper.includes('KİYMETLİ MADEN') || upper.includes('KIYMETLI MADEN')) {
    return 'Kıymetli Madenler Şemsiye Fonu';
  }

  const titleType = extractFundTitleType(fundName);
  return TITLE_TO_UMBRELLA[titleType];
}

export function resolveUmbrellaType(
  stored: string | null | undefined,
  fundName: string
): string {
  const trimmed = stored?.trim();
  if (trimmed && trimmed !== '—') return trimmed;
  return inferUmbrellaTypeFromFundName(fundName);
}
