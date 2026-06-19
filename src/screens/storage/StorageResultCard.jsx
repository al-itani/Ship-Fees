const fmt = n => '$' + Number(n).toFixed(2)

function SRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', fontSize: 13 }}>
      <span style={{ color: accent || 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ color: accent || 'var(--color-text-muted)', direction: 'ltr' }}>{value}</span>
    </div>
  )
}

export default function StorageResultCard({ result, empty }) {
  if (!result) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '32px 0', fontSize: 14 }}>
        {empty || 'Fill in the form to calculate the fee.'}
      </div>
    )
  }

  const freeDays  = result.freeDays !== undefined ? result.freeDays : 9
  const isBlocks  = result.type === 'blocks'

  return (
    <div>
      {/* ── Free period banner ── */}
      {result.type === 'free' && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
          padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <div style={{ fontWeight: 700, color: '#15803d', fontSize: 15 }}>No Charge — Within Free Period</div>
            <div style={{ fontSize: 13, color: '#16a34a', marginTop: 2 }}>
              Days in storage: {result.days} / Free period: {freeDays} days
            </div>
          </div>
        </div>
      )}

      {/* ── Forced banner ── */}
      {result.type === 'forced' && (
        <div style={{
          background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            background: '#ffedd5', border: '1px solid #fdba74', color: '#c2410c',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '3px 10px', borderRadius: 4, flexShrink: 0,
          }}>
            Forced Status
          </span>
          <span style={{ fontSize: 13, color: '#92400e' }}>Flat daily rate — no free period</span>
        </div>
      )}

      {/* ── Transit/Export flat note ── */}
      {result.type === 'transit' && (
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--color-text-muted)',
        }}>
          <strong style={{ color: 'var(--color-text)' }}>{result.periods} period{result.periods !== 1 ? 's' : ''}</strong>
          {' × '}
          <strong style={{ color: 'var(--color-text)' }}>$20 / period</strong>
          {' = '}
          <strong style={{ color: 'var(--color-primary)', direction: 'ltr', display: 'inline-block' }}>{fmt(result.fee)}</strong>
          <span style={{ marginLeft: 10, opacity: 0.65, fontSize: 12 }}>Transit / Export rate</span>
        </div>
      )}

      {/* ── Summary section ── */}
      {result.type !== 'free' && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
          {/* Normal breakdown summary */}
          {result.type !== 'forced' && result.type !== 'transit' && (
            <>
              <SRow label="Free period" value={`${freeDays} days`} />
              <SRow label="Chargeable days" value={result.chargeable} />
              {!isBlocks && <SRow label="Periods (3-day)" value={result.periods} />}
              {isBlocks && <SRow label="Blocks (9-day)" value={result.blocks} />}
            </>
          )}

          {/* Transit summary */}
          {result.type === 'transit' && (
            <>
              <SRow label="Free period" value={`${freeDays} days`} />
              <SRow label="Chargeable days" value={result.chargeable} />
              <SRow label="Periods (3-day)" value={result.periods} />
              <SRow label="Rate per period" value="$20" />
            </>
          )}

          {/* Forced flat rate line */}
          {result.type === 'forced' && (
            <SRow
              label={`${result.days} days × $${result.dailyRate}${result.tons != null ? `/day/ton × ${result.tons} tons` : '/day'}`}
              value={fmt(result.fee)}
            />
          )}

          {/* Daily cap row (vehicle) */}
          {result.capped && (
            <SRow
              label={`Daily cap applied ($${V_CAP_LABEL(result)} × ${result.days} days)`}
              value={fmt(result.cap)}
              accent="#B45309"
            />
          )}

          {/* 50% discount row (grain) */}
          {result.grainDiscount && (
            <SRow
              label="50% discount (Bulk Grain)"
              value={`−${fmt(result.sum * 0.5)}`}
              accent="#B45309"
            />
          )}

          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '10px 0 4px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
            <span style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: 15 }}>Storage Fee</span>
            <span style={{
              fontWeight: 800, fontSize: 24, direction: 'ltr',
              color: result.fee === 0 ? 'var(--color-success)' : 'var(--color-primary)',
            }}>
              {fmt(result.fee)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function V_CAP_LABEL(result) {
  if (!result.cap || !result.days) return ''
  return (result.cap / result.days).toFixed(0)
}
