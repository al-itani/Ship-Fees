/**
 * One-time DB repair script.
 * Run with:  node electron/fix-db.js
 *
 * Fixes the broken state left by a failed users table migration where
 * `users` was renamed to `users_pre_manager` but the migration never completed.
 */
const Database = require('better-sqlite3')

const DB_PATH = 'C:\\ShipFees\\data\\ship_fees.db'
const db = new Database(DB_PATH)

db.pragma('foreign_keys = OFF')

try {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name)
  console.log('Tables in DB:', tables.join(', '))

  const usersSchema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get()
  if (usersSchema) {
    const hasManager = usersSchema.sql.includes("'manager'")
    console.log('users CHECK includes manager:', hasManager)
    if (!hasManager) {
      console.log('Patching users CHECK constraint...')
      const newSql = usersSchema.sql.replace("role IN ('admin', 'user')", "role IN ('admin', 'user', 'manager')")
      db.pragma('writable_schema = ON')
      db.prepare(`UPDATE sqlite_master SET sql=? WHERE type='table' AND name='users'`).run(newSql)
      db.pragma('writable_schema = OFF')
      const ver = db.pragma('schema_version', { simple: true })
      db.pragma(`schema_version = ${ver + 1}`)
      console.log('CHECK constraint patched.')
    }
  }

  const hasBackup = tables.includes('users_pre_manager')
  const hasUsers  = tables.includes('users')

  // Fix FK references in any table whose SQL still says REFERENCES users_pre_manager
  const brokenFKs = db.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%users_pre_manager%'`
  ).all()
  if (brokenFKs.length > 0) {
    console.log(`Found ${brokenFKs.length} table(s) with stale FK references — fixing...`)
    // Must use exec() for both pragma and UPDATE — db.prepare() validates sqlite_master access at compile time
    db.exec('PRAGMA writable_schema = ON')
    for (const t of brokenFKs) {
      const fixed = t.sql.replace(/users_pre_manager/g, 'users')
      const esc = s => "'" + s.replace(/'/g, "''") + "'"
      db.exec(`UPDATE sqlite_master SET sql=${esc(fixed)} WHERE type='table' AND name=${esc(t.name)}`)
      console.log(`  Fixed: ${t.name}`)
    }
    db.exec('PRAGMA writable_schema = OFF')
    const ver = db.pragma('schema_version', { simple: true })
    db.pragma(`schema_version = ${ver + 1}`)
    console.log('FK references fixed.')
  } else {
    console.log('No stale FK references found.')
  }

  if (!hasBackup) {
    console.log('No users_pre_manager table — nothing else to fix.')
    process.exit(0)
  }

  console.log('Found users_pre_manager — starting recovery...')

  if (hasUsers) {
    const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c
    console.log(`users table exists with ${count} row(s)`)
    if (count === 0) {
      db.exec('DROP TABLE users')
      console.log('Dropped empty users shell.')
    } else {
      // users has real data, backup is stale
      db.exec('DROP TABLE users_pre_manager')
      console.log('users has data — dropped stale users_pre_manager. Done.')
      process.exit(0)
    }
  }

  db.exec('ALTER TABLE users_pre_manager RENAME TO users')
  console.log('Renamed users_pre_manager → users')

  // SQLite 3.26+ auto-updates FK references in other tables when a table is renamed.
  // Fix any tables whose FK was rewritten to reference users_pre_manager.
  db.pragma('writable_schema = ON')
  const affected = db.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%users_pre_manager%'`
  ).all()

  if (affected.length === 0) {
    console.log('No FK references needed fixing.')
  } else {
    for (const t of affected) {
      const fixed = t.sql.replace(/users_pre_manager/g, 'users')
      db.prepare(`UPDATE sqlite_master SET sql=? WHERE type='table' AND name=?`).run(fixed, t.name)
      console.log(`Fixed FK references in table: ${t.name}`)
    }
  }

  db.pragma('writable_schema = OFF')
  const ver = db.pragma('schema_version', { simple: true })
  db.pragma(`schema_version = ${ver + 1}`)
  console.log(`Schema version bumped to ${ver + 1}`)
  console.log('\nDB is fixed. Restart the app now.')
} catch (err) {
  console.error('Recovery failed:', err)
} finally {
  db.pragma('foreign_keys = ON')
  db.close()
}
