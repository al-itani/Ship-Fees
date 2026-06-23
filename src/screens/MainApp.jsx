import { useState } from 'react'
import Sidebar from '../components/Sidebar.jsx'
import TopBar from '../components/TopBar.jsx'
import Home from './Home.jsx'
import BerthingScreen from './berthing/BerthingScreen.jsx'
import ContainerScreen from './container/ContainerScreen.jsx'
import GeneralCargoScreen from './generalcargo/GeneralCargoScreen.jsx'
import ReceiptPreview from './receipt/ReceiptPreview.jsx'
import ReceiptArchive from './receipt/ReceiptArchive.jsx'
import SettingsScreen from './settings/SettingsScreen.jsx'
import AutomateScreen from './automate/AutomateScreen.jsx'
import CMAScreen from './cma/CMAScreen.jsx'
import UserManagementScreen from './users/UserManagementScreen.jsx'
import AuditLogScreen from './audit/AuditLogScreen.jsx'
import VoyageServicesScreen from './voyageservices/VoyageServicesScreen.jsx'
import StorageScreen from './storage/StorageScreen.jsx'
import TariffCScreen from './tariff-c/TariffCScreen.jsx'
import TariffCReceiptPreview from './tariff-c/TariffCReceiptPreview.jsx'
import { useSession } from '../context/SessionContext.jsx'

export default function MainApp() {
  const { session } = useSession()
  const [currentScreen, setCurrentScreen]     = useState('home')
  const [containerVoyage, setContainerVoyage] = useState(null)
  const [gcVoyage, setGcVoyage]               = useState(null)
  // { type, voyageNumber, readOnly } or { type, receipt }
  const [receiptState, setReceiptState]       = useState(null)

  function handleGoToContainers(voyageNumber) {
    setContainerVoyage(voyageNumber)
    setCurrentScreen('containers')
  }

  function handleGoToGeneralCargo(voyageNumber) {
    setGcVoyage(voyageNumber)
    setCurrentScreen('general_cargo')
  }

  function handleGenerateReceipt(voyageNumber) {
    if (session?.role !== 'admin' && !session?.perm_receipt) return
    setReceiptState({ type: 'voyage', voyageNumber, readOnly: false })
  }

  async function handleViewReceipt(receipt) {
    if (session?.role !== 'admin' && !session?.perm_receipt) return
    if (typeof receipt === 'string') {
      setReceiptState({ type: 'voyage', voyageNumber: receipt, readOnly: true })
      return
    }
    if ((receipt?.receipt_type || 'voyage') === 'tariff_c') {
      const res = await window.api.receiptGetById(receipt.id)
      if (res.success) setReceiptState({ type: 'tariff_c', receipt: res.data })
      else window.alert(res.error || 'Could not load receipt')
      return
    }
    setReceiptState({ type: 'voyage', voyageNumber: receipt.voyage_number, readOnly: true })
  }

  function handleCloseReceipt() {
    setReceiptState(null)
  }

  const isAdmin = session?.role === 'admin'

  function renderScreen() {
    switch (currentScreen) {
      case 'voyage_services':
        if (!isAdmin && !session?.perm_voyage) return <Home setCurrentScreen={setCurrentScreen} />
        return <VoyageServicesScreen onGenerateReceipt={handleGenerateReceipt} />
      case 'berthing':
        if (!isAdmin && !session?.perm_voyage) return <Home setCurrentScreen={setCurrentScreen} />
        return <BerthingScreen onGoToContainers={handleGoToContainers} onGoToGeneralCargo={handleGoToGeneralCargo} onGenerateReceipt={handleGenerateReceipt} />
      case 'containers':
        if (!isAdmin && !session?.perm_voyage) return <Home setCurrentScreen={setCurrentScreen} />
        return (
          <ContainerScreen
            initialVoyage={containerVoyage}
            onVoyageConsumed={() => setContainerVoyage(null)}
            onGenerateReceipt={handleGenerateReceipt}
          />
        )
      case 'general_cargo':
        if (!isAdmin && !session?.perm_voyage) return <Home setCurrentScreen={setCurrentScreen} />
        return (
          <GeneralCargoScreen
            initialVoyage={gcVoyage}
            onVoyageConsumed={() => setGcVoyage(null)}
            onGenerateReceipt={handleGenerateReceipt}
          />
        )
      case 'storage':
        if (!isAdmin && !session?.perm_storage) return <Home setCurrentScreen={setCurrentScreen} />
        return <StorageScreen />
      case 'receipts_archive':
        if (!isAdmin && !session?.perm_receipt) return <Home setCurrentScreen={setCurrentScreen} />
        return <ReceiptArchive onViewReceipt={handleViewReceipt} />
      case 'automate':
        if (!isAdmin && !session?.perm_automate) return <Home setCurrentScreen={setCurrentScreen} />
        return <AutomateScreen onGenerateReceipt={handleGenerateReceipt} />
      case 'tariff_c':
        if (!isAdmin && !session?.perm_tariff_c) return <Home setCurrentScreen={setCurrentScreen} />
        return <TariffCScreen />
      case 'cma':
        if (!isAdmin && !session?.perm_cma) return <Home setCurrentScreen={setCurrentScreen} />
        return <CMAScreen />
      case 'settings':
        if (!isAdmin) return <Home setCurrentScreen={setCurrentScreen} />
        return <SettingsScreen />
      case 'audit_log':
        if (!isAdmin && !session?.perm_audit_log) return <Home setCurrentScreen={setCurrentScreen} />
        return <AuditLogScreen />
      case 'user_management':
        if (!isAdmin && !session?.perm_view_users) return <Home setCurrentScreen={setCurrentScreen} />
        return <UserManagementScreen />
      default:
        return <Home setCurrentScreen={setCurrentScreen} />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar currentScreen={currentScreen} setCurrentScreen={setCurrentScreen} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar currentScreen={currentScreen} />
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--color-bg)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          {renderScreen()}
        </div>
      </div>

      {/* Full-screen receipt overlay — rendered via portal inside ReceiptPreview */}
      {receiptState?.type === 'voyage' && (
        <ReceiptPreview
          voyageNumber={receiptState.voyageNumber}
          readOnly={receiptState.readOnly}
          onClose={handleCloseReceipt}
        />
      )}
      {receiptState?.type === 'tariff_c' && (
        <TariffCReceiptPreview
          savedReceipt={receiptState.receipt}
          readOnly
          onClose={handleCloseReceipt}
        />
      )}
    </div>
  )
}
