import { openPopoutWindow } from '../utils/popout';

interface Props {
  path: string;
  title: string;
  className?: string;
}

export default function PopoutButton({ path, title, className = '' }: Props) {
  return (
    <button
      type="button"
      onClick={() => openPopoutWindow(path, title)}
      title={`${title} — Yeni pencerede aç`}
      aria-label={`${title} — Yeni pencerede aç`}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${className}`}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11 3h6v6M17 3l-8.5 8.5M6 5H5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-1"
        />
      </svg>
    </button>
  );
}
