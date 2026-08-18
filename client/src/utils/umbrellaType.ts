/** Colored dot for şemsiye fon type labels (TEFAS fonTurAciklama). */
export function umbrellaDotColor(umbrellaType: string): string {
  const t = umbrellaType.toLocaleLowerCase('tr-TR');
  if (t.includes('para piyasası')) return 'bg-sky-500';
  if (t.includes('hisse senedi')) return 'bg-indigo-500';
  if (t.includes('borçlanma') || t.includes('borclanma')) return 'bg-violet-500';
  if (t.includes('kıymetli maden') || t.includes('kiymetli maden') || t.includes('altın'))
    return 'bg-amber-500';
  if (t.includes('karma')) return 'bg-amber-500';
  if (t.includes('değişken') || t.includes('degisken')) return 'bg-emerald-500';
  if (t.includes('katılım') || t.includes('katilim')) return 'bg-teal-500';
  if (t.includes('fon sepeti')) return 'bg-rose-500';
  if (t.includes('serbest')) return 'bg-slate-500';
  return 'bg-blue-500';
}
