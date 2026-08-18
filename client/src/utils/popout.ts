import type { SplitPaneView } from '../types/views';
import { isSplitPaneView } from '../types/views';

const POPOUT_WINDOW_FEATURES =
  'width=900,height=700,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';

export function buildPopoutPath(view: SplitPaneView): string {
  const url = new URL(window.location.href);
  url.searchParams.set('popout', view);
  return `${url.pathname}${url.search}`;
}

export function openPopoutWindow(path: string, title: string): void {
  const win = window.open(path, '_blank', POPOUT_WINDOW_FEATURES);
  if (win) {
    win.document.title = title;
  }
}

export function getPopoutViewFromUrl(): SplitPaneView | null {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('popout');
  return isSplitPaneView(view) ? view : null;
}
