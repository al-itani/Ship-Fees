const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DB_DIR = 'C:\\ShipFees\\data'
const DB_PATH = path.join(DB_DIR, 'ship_fees.db')

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true })
}

let db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const { needsReopen } = require('./schema')(db)

// SQLite does not reload the in-memory schema for the same connection after a
// writable_schema patch. If the schema migration patched FK references that were
// pointing to the stale users_pre_manager table, close and reopen so the next
// connection reads the corrected sqlite_master fresh — preventing FK check errors
// like "no such table: main.users_pre_manager" on the first launch after migration.
if (needsReopen) {
  db.close()
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
}

module.exports = db
