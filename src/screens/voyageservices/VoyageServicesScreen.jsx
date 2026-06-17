import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BerthingScreen from '../berthing/BerthingScreen.jsx'
import ContainerScreen from '../container/ContainerScreen.jsx'
import GeneralCargoScreen from '../generalcargo/GeneralCargoScreen.jsx'

export default function VoyageServicesScreen({ onGenerateReceipt }) {
  const { t } = useTranslation()
  const [typingVoyage, setTypingVoyage]               = useState('')
  const [confirmedVoyage, setConfirmedVoyage]         = useState('')
  const [activeTab, setActiveTab]                     = useState('berthing')
  const [containerInitialVoyage, setContainerInitialVoyage] = useState(null)
  const [gcInitialVoyage, setGcInitialVoyage]         = useState(null)

  function confirm() {
    const vn = typingVoyage.trim().toUpperCase()
    if (!vn) return
    setTypingVoyage(vn)
    setConfirmedVoyage(vn)
  }

  function handleGoToContainers(voyageNumber) {
    const vn = (voyageNumber || confirmedVoyage || '').toUpperCase()
    setContainerInitialVoyage(vn)
    setActiveTab('container')
  }

  function handleGoToGC(voyageNumber) {
    const vn = (voyageNumber || confirmedVoyage || '').toUpperCase()
    setGcInitialVoyage(vn)
    setActiveTab('gc')
  }

  function tabStyle(key) {
    return {
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
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '28px 28px 0' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>
            🚢 {t('voyage_services')}
          </h2>
        </div>

        {/* Voyage number input */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 4 }}>
              {t('voyage_number')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="e.g. 2024/001"
                value={typingVoyage}
                onChange={e => setTypingVoyage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirm()}
                style={{
                  height: 40, padding: '0 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6, fontSize: 14,
                  outline: 'none', width: 200,
                  background: 'white',
                }}
              />
              <button
                onClick={confirm}
                style={{
                  height: 40, padding: '0 18px', borderRadius: 6,
                  background: 'var(--color-primary)', color: 'white',
                  border: 'none', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('lookup')}
              </button>
            </div>
          </div>
          {confirmedVoyage && (
            <div style={{
              padding: '0 14px',
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              fontSize: 13,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{t('open_voyage')}:</span>
              <strong style={{ color: 'var(--color-primary)' }} className="num-ltr">{confirmedVoyage}</strong>
            </div>
          )}
        </div>

        {/* Main tab bar */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          background: 'white',
          borderRadius: '8px 8px 0 0',
          padding: '0 4px',
        }}>
          <button style={tabStyle('berthing')} onClick={() => setActiveTab('berthing')}>
            ⚓ {t('berthing')}
          </button>
          <button style={tabStyle('container')} onClick={() => setActiveTab('container')}>
            📦 {t('containers')}
          </button>
          <button style={tabStyle('gc')} onClick={() => setActiveTab('gc')}>
            📋 {t('general_cargo')}
          </button>
        </div>
      </div>

      {/* Berthing tab — always mounted, preserves state */}
      <div style={{ display: activeTab === 'berthing' ? 'block' : 'none' }}>
        <BerthingScreen
          initialVoyageNumber={confirmedVoyage}
          onGoToContainers={handleGoToContainers}
          onGoToGeneralCargo={handleGoToGC}
          onGenerateReceipt={onGenerateReceipt}
        />
      </div>

      {/* Container tab */}
      <div style={{ display: activeTab === 'container' ? 'block' : 'none' }}>
        <ContainerScreen
          key={containerInitialVoyage || 'container'}
          initialVoyage={containerInitialVoyage}
          onVoyageConsumed={() => setContainerInitialVoyage(null)}
          onGenerateReceipt={onGenerateReceipt}
        />
      </div>

      {/* GC tab */}
      <div style={{ display: activeTab === 'gc' ? 'block' : 'none' }}>
        <GeneralCargoScreen
          key={gcInitialVoyage || 'gc'}
          initialVoyage={gcInitialVoyage}
          onVoyageConsumed={() => setGcInitialVoyage(null)}
          onGenerateReceipt={onGenerateReceipt}
        />
      </div>
    </div>
  )
}
