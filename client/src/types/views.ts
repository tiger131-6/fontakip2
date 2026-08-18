export type AppView =
  | 'funds'
  | 'portfolio'
  | 'simulator'
  | 'simulator-historical'
  | 'golge-portfoy'
  | 'bist100'
  | 'istatistik'
  | 'fonbul'
  | 'valor'
  | 'settings';

export type SplitPaneView = Exclude<AppView, 'settings' | 'valor' | 'golge-portfoy' | 'bist100'>;

export const SPLIT_PANE_OPTIONS: Array<{ id: SplitPaneView; label: string }> = [
  { id: 'portfolio', label: 'Portföy' },
  { id: 'fonbul', label: 'FonBul Veri Merkezi' },
  { id: 'simulator', label: 'Gelecek Projeksiyonu' },
  { id: 'simulator-historical', label: 'Tarihsel Kıyaslama' },
  { id: 'istatistik', label: 'İstatistik' },
  { id: 'funds', label: 'Fonlar (Ana Sayfa)' },
];

export const VIEW_TITLES: Record<SplitPaneView, string> = {
  funds: 'Fonlar (Ana Sayfa)',
  portfolio: 'Portföy',
  simulator: 'Gelecek Projeksiyonu',
  'simulator-historical': 'Tarihsel Kıyaslama',
  istatistik: 'İstatistik',
  fonbul: 'FonBul Veri Merkezi',
};

export function isSplitPaneView(value: string | null): value is SplitPaneView {
  return (
    value === 'funds' ||
    value === 'portfolio' ||
    value === 'simulator' ||
    value === 'simulator-historical' ||
    value === 'istatistik' ||
    value === 'fonbul'
  );
}
