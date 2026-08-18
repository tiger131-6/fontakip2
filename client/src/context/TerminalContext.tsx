import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppView, SplitPaneView } from '../types/views';

interface TerminalContextValue {
  isSplitMode: boolean;
  setIsSplitMode: (value: boolean) => void;
  toggleSplitMode: () => void;
  leftPaneView: SplitPaneView;
  rightPaneView: SplitPaneView;
  setLeftPaneView: (view: SplitPaneView) => void;
  setRightPaneView: (view: SplitPaneView) => void;
  syncPanesFromView: (view: AppView) => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

interface Props {
  children: ReactNode;
  initialView?: AppView;
}

export function TerminalProvider({ children, initialView = 'funds' }: Props) {
  const defaultPane: SplitPaneView =
    initialView === 'settings' ||
    initialView === 'valor' ||
    initialView === 'golge-portfoy' ||
    initialView === 'bist100'
      ? 'funds'
      : (initialView as SplitPaneView);

  const [isSplitMode, setIsSplitMode] = useState(false);
  const [leftPaneView, setLeftPaneView] = useState<SplitPaneView>(defaultPane);
  const [rightPaneView, setRightPaneView] = useState<SplitPaneView>(
    defaultPane === 'portfolio' ? 'simulator' : 'portfolio'
  );

  const value = useMemo<TerminalContextValue>(
    () => ({
      isSplitMode,
      setIsSplitMode,
      toggleSplitMode: () => setIsSplitMode((prev) => !prev),
      leftPaneView,
      rightPaneView,
      setLeftPaneView,
      setRightPaneView,
      syncPanesFromView: (view: AppView) => {
        if (view === 'settings' || view === 'valor' || view === 'golge-portfoy' || view === 'bist100') return;
        setLeftPaneView(view);
      },
    }),
    [isSplitMode, leftPaneView, rightPaneView]
  );

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) {
    throw new Error('useTerminal must be used within TerminalProvider');
  }
  return ctx;
}
