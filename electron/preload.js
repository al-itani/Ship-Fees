const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  login:              (username, password) => ipcRenderer.invoke('auth:login', username, password),
  changePassword:     (userId, newPassword) => ipcRenderer.invoke('auth:changePassword', userId, newPassword),
  authLogout:         (userId) => ipcRenderer.invoke('auth:logout', userId),

  getRates:           () => ipcRenderer.invoke('berthing:getRates'),
  getAgents:          () => ipcRenderer.invoke('berthing:getAgents'),
  saveBerthing:       (data) => ipcRenderer.invoke('berthing:save', data),
  getBerthingRecords: () => ipcRenderer.invoke('berthing:getAll'),
  updateBerthing:     (id, data) => ipcRenderer.invoke('berthing:update', id, data),
  deleteBerthing:     (id, userId, opts) => ipcRenderer.invoke('berthing:delete', id, userId, opts),

  containerLookupVoyage: (voyageNumber) => ipcRenderer.invoke('container:lookupVoyage', voyageNumber),
  containerListVoyages:  () => ipcRenderer.invoke('container:listVoyages'),
  containerGetCodes:     () => ipcRenderer.invoke('container:getCodes'),
  containerSaveSession:  (data) => ipcRenderer.invoke('container:saveSession', data),
  containerGetLines:     (voyageNumber) => ipcRenderer.invoke('container:getLines', voyageNumber),
  containerDeleteLine:   (id, userId) => ipcRenderer.invoke('container:deleteLine', id, userId),

  gcLookupVoyage: (voyageNumber) => ipcRenderer.invoke('gc:lookupVoyage', voyageNumber),
  gcListVoyages:  () => ipcRenderer.invoke('gc:listVoyages'),
  gcGetCodes:     () => ipcRenderer.invoke('gc:getCodes'),
  gcSaveSession:  (data) => ipcRenderer.invoke('gc:saveSession', data),
  gcGetLines:     (voyageNumber) => ipcRenderer.invoke('gc:getLines', voyageNumber),
  gcDeleteLine:   (id, userId) => ipcRenderer.invoke('gc:deleteLine', id, userId),

  receiptGetData:              (voyageNumber) => ipcRenderer.invoke('receipt:getData', voyageNumber),
  receiptSave:                 (data) => ipcRenderer.invoke('receipt:save', data),
  receiptGetAll:               () => ipcRenderer.invoke('receipt:getAll'),
  receiptDelete:               (id, userId) => ipcRenderer.invoke('receipt:delete', id, userId),
  receiptPrepareBerthingOnly:  (voyageNumber, username) => ipcRenderer.invoke('receipt:prepareBerthingOnly', voyageNumber, username),
  receiptExportPDF:      (opts) => ipcRenderer.invoke('receipt:exportPDF', opts),
  receiptExportPDFBatch: (opts) => ipcRenderer.invoke('receipt:exportPDFBatch', opts),

  usersGetAll:         ()                              => ipcRenderer.invoke('users:getAll'),
  usersCreate:         (data)                          => ipcRenderer.invoke('users:create', data),
  usersUpdate:         (id, data, adminId)             => ipcRenderer.invoke('users:update', id, data, adminId),
  usersResetPassword:  (id, tmpPwd, adminId)           => ipcRenderer.invoke('users:resetPassword', id, tmpPwd, adminId),
  usersSetActive:      (id, isActive, adminId)         => ipcRenderer.invoke('users:setActive', id, isActive, adminId),
  usersGetPermissions: (userId)                        => ipcRenderer.invoke('users:getPermissions', userId),
  usersSetPermission:  (userId, key, grant, adminId)   => ipcRenderer.invoke('users:setPermission', userId, key, grant, adminId),
  usersCheckRecords:   (userId)                        => ipcRenderer.invoke('users:checkRecords', userId),
  usersDelete:         (id, adminId)                   => ipcRenderer.invoke('users:delete', id, adminId),
  usersHeartbeat:      (userId)                        => ipcRenderer.invoke('users:heartbeat', userId),

  auditGetEntries:      (filters) => ipcRenderer.invoke('audit:getEntries', filters),
  auditGetFilterOptions: ()       => ipcRenderer.invoke('audit:getFilterOptions'),
  auditLogImport:       (payload) => ipcRenderer.invoke('audit:logImport', payload),

  settingsLoad: ()       => ipcRenderer.invoke('settings:load'),
  settingsSave: (data)   => ipcRenderer.invoke('settings:save', data),

  openDocuments:    () => ipcRenderer.invoke('dialog:openDocuments'),

  aiExtract:        (images) => ipcRenderer.invoke('ai:extract', images),
  aiTestConnection: ()       => ipcRenderer.invoke('ai:testConnection'),

  cmaGetReport:   (year, month)          => ipcRenderer.invoke('cma:getReport', year, month),
  cmaExportExcel: (year, month, agent)   => ipcRenderer.invoke('cma:exportExcel', { year, month, agent }),

  getConfig: () => ipcRenderer.invoke('app:getConfig'),

  storageGetAll:  ()                    => ipcRenderer.invoke('storage:getAll'),
  storageGetById: (id)                  => ipcRenderer.invoke('storage:getById', id),
  storageSave:    (data)                => ipcRenderer.invoke('storage:save', data),
  storageUpdate:  (id, data, userId)    => ipcRenderer.invoke('storage:update', id, data, userId),
  storageDelete:  (id, userId)          => ipcRenderer.invoke('storage:delete', id, userId),
})
