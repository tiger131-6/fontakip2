interface Props {
  isTaxFree: boolean;
}

export default function TaxBadge({ isTaxFree }: Props) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ' +
        (isTaxFree
          ? 'bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200'
          : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200')
      }
    >
      {isTaxFree ? 'Vergisiz' : 'Vergili'}
    </span>
  );
}
