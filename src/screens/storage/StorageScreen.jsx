import { useState, useEffect } from 'react'
import StorageCalculator from './StorageCalculator.jsx'
import StorageRecords from './StorageRecords.jsx'

const tabStyle = (active) => ({
  padding: '9px 20px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: active ? 600 : 400,
  background: active ? 'var(--color-primary)' : 'white',
  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
  color: active ? 'white' : 'var(--color-text-muted)',
  transition: 'all 0.15s',
})

export default function StorageScreen() {
  const [tab,          setTab]          = useState('calculator')
  const [agents,       setAgents]       = useState([])
  const [editRecord,   setEditRecord]   = useState(null)
  const [refreshKey,   setRefreshKey]   = useState(0)

  useEffect(() => {
    window.api.getAgents().then(res => {
      if (res?.success) setAgents(res.data)
      else if (Array.isArray(res)) setAgents(res)
    }).catch(() => {})
  }, [])

  function handleSaved() {
    setRefreshKey(k => k + 1)
    if (editRecord) setEditRecord(null)
  }

  function handleEditRecord(record) {
    setEditRecord(record)
    setTab('calculator')
  }

  function handleTabChange(newTab) {
    setTab(newTab)
    if (newTab === 'calculator' && editRecord) setEditRecord(null)
  }

  return (
    <div style={{ padding: 28, maxWidth: 1200 }}>
      <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>
        🏪 Storage Fees
      </h2>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button style={tabStyle(tab === 'calculator')} onClick={() => handleTabChange('calculator')}>
          Calculator
        </button>
        <button style={tabStyle(tab === 'records')} onClick={() => handleTabChange('records')}>
          Records
        </button>
        {editRecord && tab === 'calculator' && (
          <span style={{ marginLeft: 8, alignSelf: 'center', fontSize: 13, color: '#B45309', fontStyle: 'italic' }}>
            Editing record #{editRecord.id}
          </span>
        )}
      </div>

      {/* ── Views ── */}
      {tab === 'calculator' && (
        <StorageCalculator
          agents={agents}
          editRecord={editRecord}
          onSaved={handleSaved}
        />
      )}

      {tab === 'records' && (
        <StorageRecords
          refreshKey={refreshKey}
          onEdit={handleEditRecord}
        />
      )}
    </div>
  )
}
