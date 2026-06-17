import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

function fmtDateProcessed(s) {
  if (!s) return '—'
  const [datePart = '', timePart = ''] = s.split(' ')
  const [y, m, d] = datePart.split('-')
  if (!y || !m || !d) return s
  return `${d}-${m}-${y} ${timePart.slice(0, 5)}`
}

const thStyle = {
  padding: '9px 16px', textAlign: 'start', fontWeight: 600,
  fontSize: 12, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.03em',
}
const tdStyle = { padding: '10px 16px', verticalAlign: 'middle', fontSize: 13 }

export default function GeneralCargoRecords({ onLookup, voyageError, looking, openingVoyage, refreshKey }) {
  const { t } = useTranslation()
  const [voyageSuggestions, setVoyageSuggestions] = useState([])
  const [listSearch, setListSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const listSearchRef = useRef(null)

  useEffect(() => {
    window.api.gcListVoyages().then(res => {
      if (res.success) setVoyageSuggestions(res.data)
    })
  }, [refreshKey])

  useEffect(() => {
    setTimeout(() => listSearchRef.current?.focus(), 50)
  }, [])

  function handleSortCol(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const fieldStyle = {
    height: 44, padding: '0 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 6, fontSize: 14, outline: 'none',
    background: 'white', boxSizing: 'border-box',
  }

  const searchLower = listSearch.trim().toLowerCase()
  const filteredVoyages = voyageSuggestions.filter(v => {
    if (!searchLower) return true
    return (
      v.voyage_number?.toLowerCase().includes(searchLower) ||
      v.vessel_name?.toLowerCase().includes(searchLower) ||
      v.shipping_agent?.toLowerCase().includes(searchLower)
    )
  })
  const sortedVoyages = sortCol
    ? [...filteredVoyages].sort((a, b) => {
        const av = (a[sortCol] || '').toLowerCase()
        const bv = (b[sortCol] || '').toLowerCase()
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    : filteredVoyages

  return (
    <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)' }}>
      {/* Search bar */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          ref={listSearchRef}
          style={{ ...fieldStyle, flex: 1, maxWidth: 360 }}
          value={listSearch}
          onChange={e => setListSearch(e.target.value)}
          placeholder={t('search')}
          autoFocus
        />
        {voyageError && (
          <div style={{
            flex: 1, padding: '8px 14px', borderRadius: 6,
            background: '#FEF2F2', color: 'var(--color-danger)', fontSize: 13,
          }}>
            {voyageError}
          </div>
        )}
      </div>

      {/* Table */}
      {sortedVoyages.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
          {listSearch.trim() ? t('no_results') : t('no_container_voyages')}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFF' }}>
              {[
                { key: 'voyage_number',  label: t('voyage_number') },
                { key: 'vessel_name',    label: t('vessel_name') },
                { key: 'shipping_agent', label: t('shipping_agent') },
                { key: 'date_processed', label: t('date_processed') },
              ].map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSortCol(col.key)}
                  style={{
                    ...thStyle, cursor: 'pointer', userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.label}
                  {sortCol === col.key
                    ? (sortDir === 'asc' ? ' ▲' : ' ▼')
                    : <span style={{ opacity: 0.3 }}> ⇅</span>}
                </th>
              ))}
              <th style={{ ...thStyle, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {sortedVoyages.map(v => (
              <tr
                key={v.voyage_number}
                style={{ borderBottom: '1px solid #F5F5F5' }}
                onDoubleClick={() => !looking && onLookup(v.voyage_number)}
              >
                <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--color-primary)' }}>
                  {v.voyage_number}
                </td>
                <td style={tdStyle}>{v.vessel_name || '—'}</td>
                <td style={tdStyle}>{v.shipping_agent || '—'}</td>
                <td style={{ ...tdStyle, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {fmtDateProcessed(v.date_processed)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'end' }}>
                  <button
                    onClick={() => onLookup(v.voyage_number)}
                    disabled={looking}
                    style={{
                      padding: '6px 16px', borderRadius: 6, border: 'none',
                      background: openingVoyage === v.voyage_number ? '#B0BEC5' : 'var(--color-primary)',
                      color: 'white', fontWeight: 600, fontSize: 13,
                      cursor: looking ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {openingVoyage === v.voyage_number ? '...' : t('open')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
