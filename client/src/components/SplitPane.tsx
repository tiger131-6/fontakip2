import type { Fund } from '../types';
import type { FundTableRow } from '../types';
import type { SplitPaneView } from '../types/views';
import { SPLIT_PANE_OPTIONS } from '../types/views';
import AppViewContent from './AppViewContent';

interface Props {
  paneId: 'left' | 'right';
  selectedView: SplitPaneView;
  onViewChange: (view: SplitPaneView) => void;
  funds: Fund[];
  loading: boolean;
  error: string | null;
  onSelectFund: (row: FundTableRow) => void;
  onReloadFunds: () => void | Promise<void>;
}

export default function SplitPane({
  paneId,
  selectedView,
  onViewChange,
  funds,
  loading,
  error,
  onSelectFund,
  onReloadFunds,
}: Props) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-slate-100">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {paneId === 'left' ? 'Sol Panel' : 'Sağ Panel'}
        </span>
        <select
          value={selectedView}
          onChange={(e) => onViewChange(e.target.value as SplitPaneView)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          aria-label={`${paneId === 'left' ? 'Sol' : 'Sağ'} panel görünümü`}
        >
          {SPLIT_PANE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="split-pane-content min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <AppViewContent
          view={selectedView}
          funds={funds}
          loading={loading}
          error={error}
          onSelectFund={onSelectFund}
          onReloadFunds={onReloadFunds}
        />
      </div>
    </div>
  );
}
