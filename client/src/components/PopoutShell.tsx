import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import type { Fund } from '../types';
import type { FundTableRow } from '../types';
import type { SplitPaneView } from '../types/views';
import { VIEW_TITLES } from '../types/views';
import { getFunds } from '../api';
import FundDetail from './FundDetail';
import AppViewContent from './AppViewContent';

interface Props {
  view: SplitPaneView;
}

export default function PopoutShell({ view }: Props) {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Fund | null>(null);

  const loadFunds = async () => {
    try {
      setFunds(await getFunds());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fonlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = `${VIEW_TITLES[view]} — Fon Takip Programı`;
    void loadFunds();
  }, [view]);

  const openFundFromTable = (row: FundTableRow) => {
    const real = funds.find((f) => f.fund_code === row.fund_code);
    setSelected(
      real ?? {
        fund_code: row.fund_code,
        fund_name: row.fund_name,
        is_tax_free: row.is_tax_free,
        is_active: row.is_active,
        is_favorite: row.is_favorite,
      }
    );
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              Terminal Modu
            </p>
            <h1 className="text-sm font-bold text-slate-800">{VIEW_TITLES[view]}</h1>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
            Bağımsız Pencere
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <AppViewContent
          view={view}
          funds={funds}
          loading={loading}
          error={error}
          onSelectFund={openFundFromTable}
          onReloadFunds={loadFunds}
        />
      </main>

      {selected && (
        <FundDetail
          fund={selected}
          allFunds={funds}
          onClose={() => setSelected(null)}
        />
      )}

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: { background: '#333', color: '#fff' },
        }}
      />
    </div>
  );
}
