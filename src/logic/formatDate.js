export function formatLocal(ts, opts = {}) {
  if (!ts) return '—'
  const date = new Date(ts.includes('Z') ? ts : ts + 'Z')
  if (isNaN(date)) return ts
  return date.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    ...opts,
  })
}
