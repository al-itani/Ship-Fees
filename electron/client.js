// HTTP client that mirrors every server.js endpoint as a plain async function.
// Used in client mode so the main process can proxy IPC calls to the server PC
// instead of hitting local SQLite. Function signatures match the external API
// surface defined in Prompt 2; internal arg packing maps to what server.js expects.

const { getConfig } = require('./configStore')

// Use Node 18+ global fetch; fall back to dynamic node-fetch import if absent.
const fetch = globalThis.fetch
  ?? ((...args) => import('node-fetch').then(({ default: f }) => f(...args)))

async function apiCall(endpoint, body = {}) {
  const { serverUrl, token } = getConfig()
  console.log('apiCall:', endpoint, JSON.stringify(body))
  const res = await fetch(`${serverUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-token': token,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

// ── Auth ──────────────────────────────────────────────────────────────────
// After the server.js login fix, apiCall returns the user object directly.
async function login(username, password) {
  try {
    const user = await apiCall('/api/auth/login', { username, password })
    return { success: true, user }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function restoreSession(userId) {
  try {
    const user = await apiCall('/api/auth/restoreSession', { userId })
    return { success: true, user }
  } catch (err) {
    return { success: false }
  }
}

// currentPassword is accepted for API surface parity; the handler doesn't validate it.
async function changePassword(userId, currentPassword, newPassword) {
  return apiCall('/api/auth/changePassword', { userId, newPassword })
}

// ── Berthing ─────────────────────────────────────────────────────────────
async function berthingGetRates() {
  return apiCall('/api/berthing/getRates')
}

async function berthingGetAgents() {
  return apiCall('/api/berthing/getAgents')
}

async function berthingSave(data) {
  return apiCall('/api/berthing/save', data)
}

async function berthingGetAll(filters) {
  return apiCall('/api/berthing/getAll', filters)
}

async function berthingUpdate(id, data) {
  return apiCall('/api/berthing/update', { id, data })
}

async function berthingSoftDelete(id, deletedBy) {
  return apiCall('/api/berthing/delete', { id, deletedBy })
}

// ── Container ─────────────────────────────────────────────────────────────
async function containerLookupVoyage(voyageNumber) {
  return apiCall('/api/container/lookupVoyage', { voyageNumber })
}

async function containerListVoyages(filters) {
  return apiCall('/api/container/listVoyages', filters)
}

async function containerGetCodes() {
  return apiCall('/api/container/getCodes')
}

// saveSession on the handler takes a single data object; pack the 3-arg
// external signature into the shape the handler destructures.
async function containerSaveSession(voyageNumber, lines, savedBy) {
  return apiCall('/api/container/saveSession', { voyageNumber, lines, created_by: savedBy })
}

async function containerGetLines(voyageNumber) {
  return apiCall('/api/container/getLines', { voyageNumber })
}

async function containerDeleteLine(id, deletedBy) {
  return apiCall('/api/container/deleteLine', { id, deletedBy })
}

// ── General Cargo ─────────────────────────────────────────────────────────
async function gcLookupVoyage(voyageNumber) {
  return apiCall('/api/gc/lookupVoyage', { voyageNumber })
}

async function gcListVoyages(filters) {
  return apiCall('/api/gc/listVoyages', filters)
}

async function gcGetCodes() {
  return apiCall('/api/gc/getCodes')
}

async function gcSaveSession(voyageNumber, lines, savedBy) {
  return apiCall('/api/gc/saveSession', { voyageNumber, lines, created_by: savedBy })
}

async function gcGetLines(voyageNumber) {
  return apiCall('/api/gc/getLines', { voyageNumber })
}

async function gcDeleteLine(id, deletedBy) {
  return apiCall('/api/gc/deleteLine', { id, deletedBy })
}

// ── Receipts ──────────────────────────────────────────────────────────────
async function receiptGetData(voyageNumber) {
  return apiCall('/api/receipt/getData', { voyageNumber })
}

async function receiptSave(data) {
  return apiCall('/api/receipt/save', data)
}

async function receiptGetAll(filters) {
  return apiCall('/api/receipt/getAll', filters)
}

async function receiptGetById(id) {
  return apiCall('/api/receipt/getById', { id })
}

async function receiptSoftDelete(id, deletedBy) {
  return apiCall('/api/receipt/delete', { id, deletedBy })
}

async function prepareBerthingOnly(voyageNumber) {
  return apiCall('/api/receipt/prepareBerthingOnly', { voyageNumber })
}

// ── CMA ──────────────────────────────────────────────────────────────────
// External signature is (month, year); server body uses named keys so order
// on the wire doesn't matter — getReport(year, month) receives them correctly.
async function cmaGetReport(month, year) {
  return apiCall('/api/cma/getReport', { month, year })
}

async function cmaGetGCReport(month, year) {
  return apiCall('/api/cma/getGCReport', { month, year })
}

async function cmaGetTrsReport(month, year) {
  return apiCall('/api/cma/getTrsReport', { month, year })
}

// ── Users ─────────────────────────────────────────────────────────────────
async function usersGetAll() {
  return apiCall('/api/users/getAll')
}

async function usersCreate(data) {
  return apiCall('/api/users/create', data)
}

async function usersUpdate(id, data) {
  return apiCall('/api/users/update', { id, data })
}

async function usersResetPassword(id, newPassword) {
  return apiCall('/api/users/resetPassword', { id, newPassword })
}

async function usersSetActive(id, isActive) {
  return apiCall('/api/users/setActive', { id, isActive })
}

async function usersGetPermissions(userId) {
  return apiCall('/api/users/getPermissions', { userId })
}

async function usersSetPermission(userId, permission, value) {
  return apiCall('/api/users/setPermission', { userId, permission, value })
}

async function usersCheckRecords(userId) {
  return apiCall('/api/users/checkRecords', { userId })
}

async function usersDeleteUser(id) {
  return apiCall('/api/users/delete', { id })
}

// ── Storage ───────────────────────────────────────────────────────────────
async function storageGetAll() {
  return apiCall('/api/storage/getAll')
}
async function storageGetById(id) {
  return apiCall('/api/storage/getById', { id })
}
async function storageSave(data) {
  return apiCall('/api/storage/save', data)
}
async function storageUpdate(id, data, userId) {
  return apiCall('/api/storage/update', { id, data, userId })
}
async function storageDelete(id, userId) {
  return apiCall('/api/storage/delete', { id, userId })
}

// ── Settings ───────────────────────────────────────────────────────────────
async function settingsLoad() {
  return apiCall('/api/settings/load')
}

async function settingsSave(data) {
  return apiCall('/api/settings/save', data)
}

module.exports = {
  // Auth
  login,
  restoreSession,
  changePassword,
  // Berthing
  berthingGetRates,
  berthingGetAgents,
  berthingSave,
  berthingGetAll,
  berthingUpdate,
  berthingSoftDelete,
  // Container
  containerLookupVoyage,
  containerListVoyages,
  containerGetCodes,
  containerSaveSession,
  containerGetLines,
  containerDeleteLine,
  // GC
  gcLookupVoyage,
  gcListVoyages,
  gcGetCodes,
  gcSaveSession,
  gcGetLines,
  gcDeleteLine,
  // Receipt
  receiptGetData,
  receiptSave,
  receiptGetAll,
  receiptGetById,
  receiptSoftDelete,
  prepareBerthingOnly,
  // CMA
  cmaGetReport,
  cmaGetGCReport,
  cmaGetTrsReport,
  // Users
  usersGetAll,
  usersCreate,
  usersUpdate,
  usersResetPassword,
  usersSetActive,
  usersGetPermissions,
  usersSetPermission,
  usersCheckRecords,
  usersDeleteUser,
  // Storage
  storageGetAll,
  storageGetById,
  storageSave,
  storageUpdate,
  storageDelete,
  // Settings
  settingsLoad,
  settingsSave,
}
