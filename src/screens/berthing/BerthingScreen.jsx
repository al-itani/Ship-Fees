import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BerthingForm from './BerthingForm.jsx'
import BerthingRecords from './BerthingRecords.jsx'

export default function BerthingScreen({ onGoToContainers, onGoToGeneralCargo, onGenerateReceipt, initialVoyageNumber }) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab]             = useState('new-entry')
  const [editVoyageNumber, setEditVoyageNumber] = useState(null)
  const [refreshKey, setRefreshKey]           = useState(0)

  function handleEdit(voyageNumber) {
    setEditVoyageNumber(voyageNumber)
    setActiveTab('new-entry')
  }

  function handleSaved() {
    setEditVoyageNumber(null)
    setActiveTab('records')
    setRefreshKey(k => k + 1)
  }

  function handleCancelEdit() {
    setEditVoyageNumber(null)
  }

  const tabStyle = (key) => ({
    padding: '10px 24px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: activeTab === key ? 700 : 400,
    color: activeTab === key ? 'var(--color-primary)' : 'var(--color-text-muted)',
    background: 'none',
    border: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: activeTab === key ? 'var(--color-primary)' : 'transparent',
    userSelect: 'none',
  })

  return (
    <div className="app-screen" style={{ padding: 28 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>
          ⚓ {t('berthing')}
        </h2>
      </div>

      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: 28,
        background: 'white',
        borderRadius: '8px 8px 0 0',
        padding: '0 4px',
      }}>
        <button style={tabStyle('new-entry')} onClick={() => setActiveTab('new-entry')}>
          {editVoyageNumber ? `✏️ ${t('edit')}` : `+ ${t('new_entry')}`}
        </button>
        <button style={tabStyle('records')} onClick={() => { setActiveTab('records'); setEditVoyageNumber(null) }}>
          {t('records')}
        </button>
      </div>

      {activeTab === 'new-entry' && (
        <BerthingForm
          editVoyageNumber={editVoyageNumber}
          onSaved={handleSaved}
          onCancelEdit={handleCancelEdit}
          onGoToContainers={onGoToContainers}
          onGoToGeneralCargo={onGoToGeneralCargo}
          initialVoyageNumber={initialVoyageNumber}
        />
      )}
      {activeTab === 'records' && (
        <BerthingRecords
          key={refreshKey}
          onEdit={handleEdit}
          onGenerateReceipt={onGenerateReceipt}
        />
      )}
    </div>
  )
}
