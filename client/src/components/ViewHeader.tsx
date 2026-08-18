import type { ReactNode } from 'react';
import type { SplitPaneView } from '../types/views';
import { VIEW_TITLES } from '../types/views';
import { buildPopoutPath } from '../utils/popout';
import PopoutButton from './PopoutButton';

interface Props {
  title: string;
  subtitle?: string;
  popoutView?: SplitPaneView;
  actions?: ReactNode;
}

export default function ViewHeader({ title, subtitle, popoutView, actions }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          {popoutView && (
            <PopoutButton
              path={buildPopoutPath(popoutView)}
              title={VIEW_TITLES[popoutView]}
              className="mt-0.5"
            />
          )}
        </div>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
