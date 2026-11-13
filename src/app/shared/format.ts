/** Duração restante em texto curto: "2 d 05 h", "3 h 12 min", "4 min 05 s", "12 s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d} d ${String(h % 24).padStart(2, '0')} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
}

/** Contagem regressiva curta "hh:mm" (arredonda para cima; hora local só para exibição). */
export function formatHm(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
}
