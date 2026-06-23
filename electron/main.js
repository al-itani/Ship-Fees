const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')

// ── Auto-updater ─────────────────────────────────────────────────────────────
// To release an update:
//   1. Bump "version" in package.json
//   2. npm run build  →  produces new .exe + latest.yml in dist-app/
//   3. Create a GitHub Release on al-itani/Ship-Fees and upload both files
//   4. Client PCs will detect the new version automatically on next launch
// ─────────────────────────────────────────────────────────────────────────────
let autoUpdater = null
try {
  autoUpdater = require('electron-updater').autoUpdater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available.\nDownload and install now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate()
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'The update has been downloaded. Restart the app to apply it.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err?.message || err)
    dialog.showMessageBox({ type: 'error', title: 'Updater Error', message: err?.message || String(err) })
  })
} catch (err) {
  console.error('[updater] failed to load electron-updater:', err?.message || err)
}
// ─────────────────────────────────────────────────────────────────────────────

// Initialize DB (creates file + schema + seeds on first run)
require('./database/db')

const authHandlers       = require('./database/handlers/auth')
const berthingHandlers   = require('./database/handlers/berthing')
const containerHandlers  = require('./database/handlers/container')
const gcHandlers         = require('./database/handlers/gc')
const receiptHandlers    = require('./database/handlers/receipts')
const cmaHandlers        = require('./database/handlers/cma')
const usersHandlers      = require('./database/handlers/users')
const auditHandlers      = require('./database/handlers/audit')
const settingsHandlers   = require('./handlers/settings')
const aiHandlers         = require('./handlers/ai')
const { getConfig }      = require('./configStore')
const storageHandlers    = require('./database/handlers/storage')
const tariffCHandlers    = require('./database/handlers/tariffC')
const statsHandlers      = require('./database/handlers/stats')
const clientHandlers     = require('./client')

const appConfig = getConfig()
if (appConfig.mode !== 'client') require('./server').startServer()

const C = appConfig.mode === 'client'
console.log('MODE:', appConfig.mode, 'C:', C)

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

let lastDocumentDir = 'C:\\Users\\User\\Desktop\\MAIN\\Work\\Port\\Ships\\Automate'
let lastReceiptDir  = null

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 800,
    title: 'Ship Fees — Port of Beirut',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
    win.webContents.on('did-finish-load', () => win.webContents.focus())
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
    win.setMenu(null)
  }
}

// Auth
ipcMain.handle('auth:login',
  (_, username, password) => C
    ? clientHandlers.login(username, password)
    : authHandlers.login(username, password)
)
ipcMain.handle('auth:changePassword',
  // client.js signature is (userId, currentPassword, newPassword); pass null for currentPassword
  (_, userId, newPassword) => C
    ? clientHandlers.changePassword(userId, null, newPassword)
    : authHandlers.changePassword(userId, newPassword)
)
ipcMain.handle('auth:logout', (_, userId) => authHandlers.logout(userId))

// Berthing
ipcMain.handle('berthing:getRates',
  () => C ? clientHandlers.berthingGetRates() : berthingHandlers.getRates()
)
ipcMain.handle('berthing:getAgents',
  () => C ? clientHandlers.berthingGetAgents() : berthingHandlers.getAgents()
)
ipcMain.handle('berthing:save',
  (_, data) => C ? clientHandlers.berthingSave(data) : berthingHandlers.save(data)
)
ipcMain.handle('berthing:getAll',
  () => C ? clientHandlers.berthingGetAll() : berthingHandlers.getAll()
)
ipcMain.handle('berthing:update',
  (_, id, data) => C ? clientHandlers.berthingUpdate(id, data) : berthingHandlers.update(id, data)
)
ipcMain.handle('berthing:delete',
  // client.js berthingSoftDelete does not accept opts; local handler still gets opts
  (_, id, userId, opts) => C
    ? clientHandlers.berthingSoftDelete(id, userId)
    : berthingHandlers.softDelete(id, userId, opts)
)

// Container
ipcMain.handle('container:lookupVoyage',
  (_, voyageNumber) => C
    ? clientHandlers.containerLookupVoyage(voyageNumber)
    : containerHandlers.lookupVoyage(voyageNumber)
)
ipcMain.handle('container:listVoyages',
  () => C ? clientHandlers.containerListVoyages() : containerHandlers.listVoyages()
)
ipcMain.handle('container:getCodes',
  () => C ? clientHandlers.containerGetCodes() : containerHandlers.getCodes()
)
ipcMain.handle('container:saveSession',
  // data arrives as a single object; destructure for client which takes (voyageNumber, lines, savedBy)
  (_, data) => C
    ? clientHandlers.containerSaveSession(data.voyageNumber, data.lines, data.created_by)
    : containerHandlers.saveSession(data)
)
ipcMain.handle('container:getLines',
  (_, voyageNumber) => C
    ? clientHandlers.containerGetLines(voyageNumber)
    : containerHandlers.getLines(voyageNumber)
)
ipcMain.handle('container:deleteLine',
  (_, id, userId) => C
    ? clientHandlers.containerDeleteLine(id, userId)
    : containerHandlers.deleteLine(id, userId)
)

// General Cargo
ipcMain.handle('gc:lookupVoyage',
  (_, voyageNumber) => C
    ? clientHandlers.gcLookupVoyage(voyageNumber)
    : gcHandlers.lookupVoyage(voyageNumber)
)
ipcMain.handle('gc:listVoyages',
  () => C ? clientHandlers.gcListVoyages() : gcHandlers.listVoyages()
)
ipcMain.handle('gc:getCodes',
  () => C ? clientHandlers.gcGetCodes() : gcHandlers.getCodes()
)
ipcMain.handle('gc:saveSession',
  // data arrives as a single object; destructure for client which takes (voyageNumber, lines, savedBy)
  (_, data) => C
    ? clientHandlers.gcSaveSession(data.voyageNumber, data.lines, data.created_by)
    : gcHandlers.saveSession(data)
)
ipcMain.handle('gc:getLines',
  (_, voyageNumber) => C
    ? clientHandlers.gcGetLines(voyageNumber)
    : gcHandlers.getLines(voyageNumber)
)
ipcMain.handle('gc:deleteLine',
  (_, id, userId) => C
    ? clientHandlers.gcDeleteLine(id, userId)
    : gcHandlers.deleteLine(id, userId)
)

// Receipts
ipcMain.handle('receipt:getData',
  (_, voyageNumber) => C
    ? clientHandlers.receiptGetData(voyageNumber)
    : receiptHandlers.getDataForReceipt(voyageNumber)
)
ipcMain.handle('receipt:save',
  (_, data) => C ? clientHandlers.receiptSave(data) : receiptHandlers.saveReceipt(data)
)
ipcMain.handle('receipt:getAll',
  () => C ? clientHandlers.receiptGetAll() : receiptHandlers.getAll()
)
ipcMain.handle('receipt:getById',
  (_, id) => C ? clientHandlers.receiptGetById(id) : receiptHandlers.getById(id)
)
ipcMain.handle('receipt:delete',
  (_, id, userId) => C
    ? clientHandlers.receiptSoftDelete(id, userId)
    : receiptHandlers.softDelete(id, userId)
)
ipcMain.handle('receipt:existsForVoyage',
  (_, voyageNumber) => receiptHandlers.existsForVoyage(voyageNumber)
)
ipcMain.handle('receipt:prepareBerthingOnly',
  // client.js prepareBerthingOnly does not accept username; local handler still gets it
  (_, voyageNumber, username) => C
    ? clientHandlers.prepareBerthingOnly(voyageNumber)
    : receiptHandlers.prepareBerthingOnly(voyageNumber, username)
)

// Native dialogs (confirm / message)
ipcMain.handle('dialog:confirm', async (event, { title, message, detail, type = 'question' }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showMessageBox(win, {
    type, title, message, detail,
    buttons: ['OK', 'Cancel'], defaultId: 0, cancelId: 1, noLink: true,
  })
  return result.response === 0
})
ipcMain.handle('dialog:message', async (event, { title, message, detail, type = 'info' }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  await dialog.showMessageBox(win, {
    type, title, message, detail, buttons: ['OK'], noLink: true,
  })
  return true
})

// PDF Export — uses printToPDF on the calling window's webContents
ipcMain.handle('dialog:openDocuments', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      filters: [{ name: 'Documents', extensions: ['jpg', 'jpeg', 'png', 'pdf'] }],
      properties: ['openFile', 'multiSelections'],
    }
    if (lastDocumentDir) opts.defaultPath = lastDocumentDir
    const { canceled, filePaths } = await dialog.showOpenDialog(win, opts)
    if (canceled || filePaths.length === 0) return { success: false, canceled: true }
    lastDocumentDir = path.dirname(filePaths[0])
    const files = []
    for (const fp of filePaths) {
      const bytes    = await fs.promises.readFile(fp)
      const stat     = await fs.promises.stat(fp)
      const ext      = path.extname(fp).toLowerCase()
      const mimeType = ext === '.pdf' ? 'application/pdf' : (ext === '.png' ? 'image/png' : 'image/jpeg')
      files.push({ filename: path.basename(fp), data: bytes.toString('base64'), mimeType, size: bytes.length, mtimeMs: stat.mtimeMs })
    }
    return { success: true, files }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('receipt:exportPDF', async (event, { defaultFilename }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const defaultPath = lastReceiptDir ? path.join(lastReceiptDir, defaultFilename) : defaultFilename
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }
    lastReceiptDir = path.dirname(filePath)
    const pdfData = await event.sender.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'printableArea' },
    })
    await fs.promises.writeFile(filePath, pdfData)
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Batch PDF export — no dialog, writes directly to the computed path, creates folder if needed
ipcMain.handle('receipt:exportPDFBatch', async (event, { filePath }) => {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    const pdfData = await event.sender.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'printableArea' },
    })
    await fs.promises.writeFile(filePath, pdfData)
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// CMA Receipt
// IPC receives (year, month) to match preload call order; client.js signature is (month, year) — swap intentional
ipcMain.handle('cma:getReport',
  (_, year, month) => C
    ? clientHandlers.cmaGetReport(month, year)
    : cmaHandlers.getReport(year, month)
)

ipcMain.handle('cma:exportExcel', async (event, { year, month, agent }) => {
  try {
    const XLSX = require('xlsx')

    const voyageHeaders = ['Vessel Name','Agent','Voyage #','Bill #','20ft Local','40ft Local','20ft Trans','40ft Trans','Local TEUs','Trans TEUs','Local Fee ($)','Trans Fee ($)','Total ($)']
    const toRow = r => ({
      'Vessel Name':   r.vessel_name || '',
      'Agent':         r.agent,
      'Voyage #':      r.voyage_number,
      'Bill #':        r.bill_number || '',
      '20ft Local':    r.local_20,
      '40ft Local':    r.local_40,
      '20ft Trans':    r.trans_20,
      '40ft Trans':    r.trans_40,
      'Local TEUs':    r.local_teus,
      'Trans TEUs':    r.trans_teus,
      'Local Fee ($)': r.local_fee,
      'Trans Fee ($)': r.trans_fee,
      'Total ($)':     r.total,
    })
    const colWidths = (rows, headers) =>
      headers.map(h => ({ wch: Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length)) + 2 }))

    const wb = XLSX.utils.book_new()
    let defaultFilename

    if (agent === '__ALL__') {
      // One sheet per agent (voyage detail) + one All Agents summary sheet
      const reportResult = cmaHandlers.getReport(year, month)
      if (!reportResult.success) return reportResult

      const summaryHeaders = ['Agent','20ft Local','40ft Local','20ft Trans','40ft Trans','Local TEUs','Trans TEUs','Local Fee ($)','Trans Fee ($)','Total ($)']
      const summaryRows = []

      for (const agentRow of reportResult.data) {
        const detail = cmaHandlers.getVoyageDetail(year, month, agentRow.agent)
        if (!detail.success || detail.data.length === 0) continue

        const rows = detail.data
        const mapped = rows.map(toRow)
        const ws = XLSX.utils.json_to_sheet(mapped, { header: voyageHeaders })
        ws['!cols'] = colWidths(mapped, voyageHeaders)
        // Sheet name: strip Excel-illegal chars, max 31 chars
        const sheetName = agentRow.agent.replace(/[/\\?*[\]:]/g, '').slice(0, 31) || `Agent_${summaryRows.length + 1}`
        XLSX.utils.book_append_sheet(wb, ws, sheetName)

        summaryRows.push({
          'Agent':          agentRow.agent,
          '20ft Local':     agentRow.local_20,
          '40ft Local':     agentRow.local_40,
          '20ft Trans':     agentRow.trans_20,
          '40ft Trans':     agentRow.trans_40,
          'Local TEUs':     agentRow.local_teus,
          'Trans TEUs':     agentRow.trans_teus,
          'Local Fee ($)':  agentRow.local_fee,
          'Trans Fee ($)':  agentRow.trans_fee,
          'Total ($)':      agentRow.total,
        })
      }

      const wsSummary = XLSX.utils.json_to_sheet(summaryRows, { header: summaryHeaders })
      wsSummary['!cols'] = colWidths(summaryRows, summaryHeaders)
      XLSX.utils.book_append_sheet(wb, wsSummary, 'All Agents')

      defaultFilename = `CMA_ALL_AGENTS_${MONTHS[month - 1]}_${year}.xlsx`
    } else {
      // Single agent export
      const result = cmaHandlers.getVoyageDetail(year, month, agent)
      if (!result.success) return result

      const rows = result.data
      const mapped = rows.map(toRow)
      const wsVoyages = XLSX.utils.json_to_sheet(mapped, { header: voyageHeaders })
      wsVoyages['!cols'] = colWidths(mapped, voyageHeaders)

      const totals = rows.reduce((acc, r) => ({
        local_20: acc.local_20 + r.local_20, local_40: acc.local_40 + r.local_40,
        trans_20: acc.trans_20 + r.trans_20, trans_40: acc.trans_40 + r.trans_40,
        local_teus: acc.local_teus + r.local_teus, trans_teus: acc.trans_teus + r.trans_teus,
        local_fee: acc.local_fee + r.local_fee, trans_fee: acc.trans_fee + r.trans_fee,
        total: acc.total + r.total,
      }), { local_20:0, local_40:0, trans_20:0, trans_40:0, local_teus:0, trans_teus:0, local_fee:0, trans_fee:0, total:0 })

      const summaryRow = {
        'Vessel Name':   `${agent} — ${MONTHS[month - 1]} ${year}`,
        'Agent':         agent,
        'Voyage #':      `${rows.length} voyage(s)`,
        'Bill #':        '',
        '20ft Local':    totals.local_20,
        '40ft Local':    totals.local_40,
        '20ft Trans':    totals.trans_20,
        '40ft Trans':    totals.trans_40,
        'Local TEUs':    totals.local_teus,
        'Trans TEUs':    totals.trans_teus,
        'Local Fee ($)': +totals.local_fee.toFixed(2),
        'Trans Fee ($)': +totals.trans_fee.toFixed(2),
        'Total ($)':     +totals.total.toFixed(2),
      }
      const wsSummary = XLSX.utils.json_to_sheet([summaryRow], { header: voyageHeaders })
      wsSummary['!cols'] = colWidths([summaryRow], voyageHeaders)

      XLSX.utils.book_append_sheet(wb, wsVoyages, 'Voyages')
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

      const agentSafe = agent.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
      defaultFilename = `CMA_${agentSafe}_${MONTHS[month - 1]}_${year}.xlsx`
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultFilename,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }

    XLSX.writeFile(wb, filePath)
    try { statsHandlers.log({ action_type: 'cma_exported', detail: { agent, year, month } }) } catch {}
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// User Management
ipcMain.handle('users:getAll',
  () => C ? clientHandlers.usersGetAll() : usersHandlers.getAll()
)
ipcMain.handle('users:create',
  (_, data) => C ? clientHandlers.usersCreate(data) : usersHandlers.create(data)
)
ipcMain.handle('users:update',
  // adminId not forwarded to client (server doesn't require it for this endpoint)
  (_, id, data, adminId) => C
    ? clientHandlers.usersUpdate(id, data)
    : usersHandlers.update(id, data, adminId)
)
ipcMain.handle('users:resetPassword',
  // adminId not forwarded to client
  (_, id, tmpPwd, adminId) => C
    ? clientHandlers.usersResetPassword(id, tmpPwd)
    : usersHandlers.resetPassword(id, tmpPwd, adminId)
)
ipcMain.handle('users:setActive',
  // adminId not forwarded to client
  (_, id, isActive, adminId) => C
    ? clientHandlers.usersSetActive(id, isActive)
    : usersHandlers.setActive(id, isActive, adminId)
)
ipcMain.handle('users:getPermissions',
  (_, userId) => C
    ? clientHandlers.usersGetPermissions(userId)
    : usersHandlers.getPermissions(userId)
)
ipcMain.handle('users:setPermission',
  // adminId not forwarded to client
  (_, userId, key, grant, adminId) => C
    ? clientHandlers.usersSetPermission(userId, key, grant)
    : usersHandlers.setPermission(userId, key, grant, adminId)
)
ipcMain.handle('users:checkRecords',
  (_, userId) => C
    ? clientHandlers.usersCheckRecords(userId)
    : usersHandlers.checkHasRecords(userId)
)
ipcMain.handle('users:delete',
  // exported as usersDeleteUser in client.js; adminId not forwarded
  (_, id, adminId) => C
    ? clientHandlers.usersDeleteUser(id)
    : usersHandlers.deleteUser(id, adminId)
)
ipcMain.handle('users:heartbeat', (_, userId) => usersHandlers.heartbeat(userId))
ipcMain.handle('users:updateProfile', (_, userId, data) => usersHandlers.updateProfile(userId, data))
ipcMain.handle('users:uploadAvatar', async (_, { userId, base64, ext }) => {
  try {
    const dir = 'C:\\ShipFees\\avatars'
    await fs.promises.mkdir(dir, { recursive: true })
    const filename = `${userId}_${Date.now()}.${ext}`
    const filepath = path.join(dir, filename)
    await fs.promises.writeFile(filepath, Buffer.from(base64, 'base64'))
    const db = require('./database/db')
    db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(filepath, userId)
    return { success: true, path: filepath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
ipcMain.handle('users:getAvatarBase64', async (_, avatarPath) => {
  try {
    if (!avatarPath) return { success: false, error: 'no_path' }
    const data = await fs.promises.readFile(avatarPath)
    const ext = path.extname(avatarPath).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
    return { success: true, dataUrl: `data:${mime};base64,${data.toString('base64')}` }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Audit log — local only (no client.js implementation)
ipcMain.handle('audit:getEntries',       (_, filters) => auditHandlers.getEntries(filters))
ipcMain.handle('audit:getFilterOptions', () => auditHandlers.getFilterOptions())
ipcMain.handle('audit:logImport',        (_, payload) => auditHandlers.logImport(payload))

// Settings
ipcMain.handle('settings:load',
  () => C ? clientHandlers.settingsLoad() : settingsHandlers.load()
)
ipcMain.handle('settings:save',
  (_, data) => C ? clientHandlers.settingsSave(data) : settingsHandlers.save(data)
)

// Storage
ipcMain.handle('storage:getAll',
  () => C ? clientHandlers.storageGetAll() : storageHandlers.getAll()
)
ipcMain.handle('storage:getById',
  (_, id) => C ? clientHandlers.storageGetById(id) : storageHandlers.getById(id)
)
ipcMain.handle('storage:save',
  (_, data) => C ? clientHandlers.storageSave(data) : storageHandlers.saveRecord(data)
)
ipcMain.handle('storage:update',
  (_, id, data, userId) => C ? clientHandlers.storageUpdate(id, data, userId) : storageHandlers.updateRecord(id, data, userId)
)
ipcMain.handle('storage:delete',
  (_, id, userId) => C ? clientHandlers.storageDelete(id, userId) : storageHandlers.softDelete(id, userId)
)

// Usage stats
ipcMain.handle('stats:log',      (_, payload) => statsHandlers.log(payload))
ipcMain.handle('stats:getStats', (_, filters) => statsHandlers.getStats(filters))

// Tariff C
ipcMain.handle('tariff-c:openFile', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return { success: false, canceled: true }
    return { success: true, filePath: filePaths[0] }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
ipcMain.handle('tariff-c:pickFolder', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })
    if (canceled || filePaths.length === 0) return { success: false, canceled: true }
    return { success: true, folderPath: filePaths[0] }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
ipcMain.handle('tariff-c:readFile',              (_, filePath) => tariffCHandlers.readFile(filePath))
ipcMain.handle('tariff-c:getNextBillingNumber',  ()            => tariffCHandlers.getNextBillingNumber())
ipcMain.handle('tariff-c:saveReceipt',           (_, data)     => tariffCHandlers.saveReceipt(data))

// AI document extraction
ipcMain.handle('ai:extract', async (_, images) => {
  const result = await aiHandlers.extract(images)
  if (result.success) try { statsHandlers.log({ action_type: 'ai_extract', detail: { pages: images.length } }) } catch {}
  return result
})
ipcMain.handle('ai:testConnection', () => aiHandlers.testConnection())

ipcMain.handle('app:getConfig', () => ({ mode: appConfig.mode, serverUrl: appConfig.serverUrl, token: appConfig.token }))

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  // Check for updates after window is ready — runs in background, never blocks launch
  if (!isDev && autoUpdater) {
    setTimeout(() => {
      try { autoUpdater.checkForUpdates() } catch (err) {
        console.error('[updater] checkForUpdates failed:', err?.message || err)
      }
    }, 3000)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  try { require('./database/db').exec('UPDATE users SET is_online = 0') } catch {}
})
