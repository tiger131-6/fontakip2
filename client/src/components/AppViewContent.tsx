import type { Fund } from '../types';
import type { FundTableRow } from '../types';
import type { AppView } from '../types/views';
import SecuritiesFundsTable from './SecuritiesFundsTable';
import Portfolio from './Portfolio';
import Simulator from './Simulator';
import HistoricalSimulator from './HistoricalSimulator';
import ShadowPortfolio from './ShadowPortfolio';
import Bist100View from './Bist100View';
import Statistics from './Statistics';
import FonBulDataCenter from './FonBulDataCenter';
import ValorPlanner from './ValorPlanner';
import Settings from './Settings';

interface Props {
  view: AppView;
  funds: Fund[];
  loading: boolean;
  error: string | null;
  onSelectFund: (row: FundTableRow) => void;
  onReloadFunds: () => void | Promise<void>;
}

export default function AppViewContent({
  view,
  funds,
  loading,
  error,
  onSelectFund,
  onReloadFunds,
}: Props) {
  if (view === 'funds') {
    return (
      <>
        {error && (
          <div className="mx-auto max-w-6xl px-4 pt-4">
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              <p>{error}</p>
              <p className="mt-1 text-amber-800/90">
                Fon tablosu ayrı bir kaynaktan yüklenmeye devam ediyor. Portföy ve izleme listesi
                için{' '}
                <button
                  type="button"
                  onClick={() => void onReloadFunds()}
                  className="font-semibold text-amber-950 underline hover:no-underline"
                >
                  yeniden dene
                </button>
                .
              </p>
            </div>
          </div>
        )}
        <SecuritiesFundsTable onSelectFund={onSelectFund} onFavoriteChange={onReloadFunds} />
      </>
    );
  }

  if (view === 'portfolio') {
    return <Portfolio funds={funds} />;
  }

  if (view === 'simulator') {
    if (loading) {
      return <div className="px-4 py-16 text-center text-slate-500">Yükleniyor…</div>;
    }
    return <Simulator funds={funds} />;
  }

  if (view === 'simulator-historical') {
    if (loading) {
      return <div className="px-4 py-16 text-center text-slate-500">Yükleniyor…</div>;
    }
    return <HistoricalSimulator funds={funds} />;
  }

  if (view === 'golge-portfoy') {
    return <ShadowPortfolio />;
  }

  if (view === 'bist100') {
    return <Bist100View />;
  }

  if (view === 'istatistik') {
    if (loading) {
      return <div className="px-4 py-16 text-center text-slate-500">Yükleniyor…</div>;
    }
    return <Statistics funds={funds} />;
  }

  if (view === 'fonbul') {
    if (loading) {
      return <div className="px-4 py-16 text-center text-slate-500">Yükleniyor…</div>;
    }
    return <FonBulDataCenter funds={funds} />;
  }

  if (view === 'valor') {
    if (loading) {
      return <div className="px-4 py-16 text-center text-slate-500">Yükleniyor…</div>;
    }
    return <ValorPlanner funds={funds} />;
  }

  if (view === 'settings') {
    return (
      <>
        {error && (
          <div className="mx-auto max-w-4xl px-6 pt-4">
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {error}
            </div>
          </div>
        )}
        <Settings onFinished={onReloadFunds} />
      </>
    );
  }

  return null;
}
