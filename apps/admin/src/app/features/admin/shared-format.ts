/** Formatting helpers for ops surfaces. Values stay as the API returned them
 * (decimal strings) — only presentation changes. Fira Code renders them. */

export function formatKsh(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    return String(value);
  }
  return `KSh ${Math.round(num).toLocaleString('en-KE')}`;
}
