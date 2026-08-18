/** TEFAS-aligned Fon Unvan Türü filter options (matches server classification). */
export const FUND_TITLE_TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'Altın', label: 'Altın' },
  { value: 'Borçlanma Araçları', label: 'Borçlanma Araçları' },
  { value: 'Çalışanlarına Yönelik', label: 'Çalışanlarına Yönelik' },
  { value: 'Çoklu Varlık', label: 'Çoklu Varlık' },
  { value: 'Değişken', label: 'Değişken' },
  { value: 'Döviz', label: 'Döviz' },
  { value: 'Döviz Cinsinden İhraç (Dolar)', label: 'Döviz Cinsinden İhraç (Dolar)' },
  { value: 'Girişim Sermayesi', label: 'Girişim Sermayesi' },
  { value: 'Hisse Senedi', label: 'Hisse Senedi' },
  { value: 'Hisse Senedi Yoğun', label: 'Hisse Senedi Yoğun' },
  { value: 'Karma', label: 'Karma' },
  { value: 'Katılım', label: 'Katılım' },
  { value: 'Kira Sertifikaları', label: 'Kira Sertifikaları' },
  { value: 'Özel', label: 'Özel' },
  { value: 'Para Piyasası', label: 'Para Piyasası' },
  { value: 'Serbest', label: 'Serbest' },
  { value: 'Diğer', label: 'Diğer' },
] as const;

export type FundTitleTypeFilter = (typeof FUND_TITLE_TYPE_FILTER_OPTIONS)[number]['value'];
