const Database = require('better-sqlite3')
const DB_PATH = 'C:\ShipFees\data\ship_fees.db'
const db = new Database(DB_PATH)
const before = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c
db.exec('DELETE FROM audit_log')
try { db.exec("DELETE FROM sqlite_sequence WHERE name='audit_log'") } catch {}
const after = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c
console.log(`audit_log: ${before} rows -> ${after} rows (IDs reset)`)
db.close()
