import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import GeneralCargoRecords from './GeneralCargoRecords.jsx'
import GeneralCargoForm from './GeneralCargoForm.jsx'

export default function GeneralCargoScreen({ initialVoyage, onVoyageConsumed, onGenerateReceipt }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState('lookup')
  const [voyageError, setVoyageError] = useState('')
  const [looking, setLooking] = useState(false)
  const [openingVoyage, setOpeningVoyage] = useState(null)
  const [voyageInfo, setVoyageInfo] = useState(null)
  const [recordsRefreshKey, setRecordsRefreshKey] = useState(0)

  // Auto-lookup when navigated from Berthing with a voyage number
  useEffect(() => {
    if (!initialVoyage) return
    onVoyageConsumed?.()
    handleLookup(initialVoyage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVoyage])

  async function handleLookup(vn) {
    if (!vn) return
    setVoyageError('')
    setLooking(true)
    setOpeningVoyage(vn)
    try {
      const res = await window.api.gcLookupVoyage(vn)
      if (!res.success) {
        const msg = res.error === 'voyage_not_found'    ? t('voyage_not_found')
          : res.error === 'voyage_is_container' ? t('voyage_is_container')
          : res.error
        setVoyageError(msg)
      } else {
        setVoyageInfo(res.data)
        setPhase('entry')
      }
    } finally {
      setLooking(false)
      setOpeningVoyage(null)
    }
  }

  function handleChangeVoyage() {
    setPhase('lookup')
    setVoyageInfo(null)
    setVoyageError('')
    setRecordsRefreshKey(k => k + 1)
  }

  return (
    <div style={{ padding: 28, maxWidth: 1100 }}>
      <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>
        📋 {t('general_cargo')}
      </h2>

      {phase === 'lookup' && (
        <GeneralCargoRecords
          onLookup={handleLookup}
          voyageError={voyageError}
          looking={looking}
          openingVoyage={openingVoyage}
          refreshKey={recordsRefreshKey}
        />
      )}

      {phase === 'entry' && voyageInfo && (
        <GeneralCargoForm
          voyageInfo={voyageInfo}
          onChangeVoyage={handleChangeVoyage}
          onGenerateReceipt={onGenerateReceipt}
        />
      )}
    </div>
  )
}
