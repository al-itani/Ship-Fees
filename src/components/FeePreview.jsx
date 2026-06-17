import { useTranslation } from 'react-i18next'

function fmt(n) {
  if (n === null || n === undefined) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function FeePreview({ breakdown }) {
  const { t } = useTranslation()

  if (!breakdown) return null

  const {
    lIndex, rawFee, discountFactor, feeAfterDiscount,
    minFee, maintenanceFee, finalFee,
  } = breakdown

  const discountPct = discountFactor < 1
    ? ` (${Math.round((1 - discountFactor) * 100)}%)`
    : ''

  const rows = [
    { label: t('raw_fee'), value: fmt(rawFee) },
    { label: `${t('discount')}${discountPct}`, value: discountFactor < 1 ? `-${fmt(rawFee - feeAfterDiscount)}` : '—' },
    { label: t('after_discount'), value: fmt(feeAfterDiscount) },
    { label: t('minimum_fee'), value: fmt(minFee) },
    { label: t('maintenance_fee'), value: fmt(maintenanceFee) },
  ]

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: 20,
      background: '#F8FAFF',
      marginTop: 4,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {t('fee_breakdown')}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td style={{ padding: '4px 0', color: 'var(--color-text-muted)' }}>{r.label}</td>
              <td style={{ padding: '4px 0', textAlign: 'end' }}>
                <span className="num-ltr">{r.value}</span>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={2} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, paddingBottom: 2 }} />
          </tr>
          <tr>
            <td style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-primary)' }}>
              {t('total_fee')}
            </td>
            <td style={{ textAlign: 'end' }}>
              <span className="num-ltr" style={{ fontWeight: 700, fontSize: 22, color: 'var(--color-primary)' }}>
                {fmt(finalFee)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
