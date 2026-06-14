const bcrypt = require('bcryptjs')
const containerCodesSeed = require('./container_codes_seed.json')
const gcCodesSeed = require('./gc_codes_seed.json')

module.exports = function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en', 'ar')),
      can_generate_cma INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS berthing_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voyage_number TEXT NOT NULL,
      bill_number TEXT NOT NULL,
      vessel_name TEXT NOT NULL,
      vessel_type TEXT,
      flag TEXT,
      shipping_agent TEXT NOT NULL,
      ata TEXT NOT NULL,
      atd TEXT NOT NULL,
      loa REAL NOT NULL,
      days INTEGER NOT NULL,
      position TEXT NOT NULL CHECK(position IN ('Quay', 'P2', 'En Rade', 'Congestion')),
      vessel_category TEXT,
      maintenance TEXT NOT NULL DEFAULT 'No',
      l_index INTEGER NOT NULL,
      d1_days INTEGER NOT NULL DEFAULT 0,
      d2_days INTEGER NOT NULL DEFAULT 0,
      d3_days INTEGER NOT NULL DEFAULT 0,
      raw_fee REAL NOT NULL,
      discount_factor REAL NOT NULL DEFAULT 1.0,
      fee_after_discount REAL NOT NULL,
      min_fee REAL NOT NULL,
      late_fee REAL NOT NULL DEFAULT 0,
      maintenance_fee REAL NOT NULL DEFAULT 0,
      final_fee REAL NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id),
      updated_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_by INTEGER REFERENCES users(id),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('INSERT', 'UPDATE', 'DELETE')),
      old_data TEXT,
      new_data TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS berthing_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position TEXT NOT NULL,
      tier TEXT NOT NULL,
      l_index INTEGER NOT NULL,
      rate REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS berthing_minimums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position TEXT NOT NULL,
      l_index INTEGER NOT NULL,
      min_fee REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vessel_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      discount_factor REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shipping_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS voyages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      voyage_number TEXT NOT NULL UNIQUE,
      vessel_name   TEXT,
      vessel_type   TEXT CHECK(vessel_type IN ('Container', 'General Cargo')),
      module_type   TEXT CHECK(module_type IN ('Container', 'GC')),
      is_deleted    INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS container_codes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT NOT NULL UNIQUE,
      description     TEXT NOT NULL,
      default_rate_20 REAL,
      default_rate_40 REAL,
      is_taxable      INTEGER DEFAULT 0,
      is_fixed        INTEGER DEFAULT 0,
      is_active       INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS container_services (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      voyage_number  TEXT NOT NULL,
      service_code   TEXT NOT NULL,
      description    TEXT,
      container_type TEXT NOT NULL CHECK(container_type IN ('20ft', '40ft')),
      quantity       REAL NOT NULL,
      price_per_unit REAL NOT NULL,
      line_total     REAL NOT NULL,
      is_taxable     INTEGER DEFAULT 0,
      is_fixed       INTEGER DEFAULT 0,
      is_auto        INTEGER DEFAULT 0,
      is_deleted     INTEGER DEFAULT 0,
      created_by     INTEGER REFERENCES users(id),
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gc_codes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL UNIQUE,
      description TEXT,
      rate        REAL,
      minimum     REAL DEFAULT 0,
      unit        TEXT,
      is_taxable  INTEGER DEFAULT 0,
      is_fixed    INTEGER DEFAULT 0,
      is_active   INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS gc_services (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      voyage_number   TEXT NOT NULL,
      service_code    TEXT NOT NULL,
      unit            TEXT,
      quantity        REAL NOT NULL,
      rate            REAL NOT NULL,
      minimum         REAL DEFAULT 0,
      line_total      REAL NOT NULL,
      minimum_applied INTEGER DEFAULT 0,
      is_taxable      INTEGER DEFAULT 0,
      is_fixed        INTEGER DEFAULT 0,
      is_auto         INTEGER DEFAULT 0,
      is_deleted      INTEGER DEFAULT 0,
      created_by      TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      voyage_id         INTEGER REFERENCES voyages(id),
      voyage_number     TEXT NOT NULL,
      bill_number       TEXT NOT NULL,
      berthing_total    REAL,
      services_subtotal REAL,
      taxable_subtotal  REAL,
      rehab_fee         REAL,
      total_tax         REAL,
      price             REAL,
      fundable          REAL,
      fresh_amount      REAL,
      final_price       REAL,
      generated_by      TEXT,
      generated_at      TEXT,
      is_deleted        INTEGER DEFAULT 0
    );
  `)

  // Column migrations — safe to re-run; SQLite throws on duplicate column, which we catch silently
  try { db.exec(`ALTER TABLE container_codes ADD COLUMN is_overtime INTEGER NOT NULL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE gc_codes ADD COLUMN is_overtime INTEGER NOT NULL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN nbr_of_stamps INTEGER NOT NULL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN created_by TEXT`) } catch {}

  // Fix PQ1 rate to $60 if it was stored incorrectly
  try { db.prepare(`UPDATE gc_codes SET rate = 60 WHERE code = 'PQ1' AND rate != 60`).run() } catch {}

  // Ensure these codes exist (may be missing from databases seeded before they were added)
  try {
    const ensureCode = db.prepare(`
      INSERT INTO container_codes (code, description, default_rate_20, default_rate_40, is_taxable, is_fixed, is_active)
      VALUES (?, ?, ?, ?, 0, 0, 1)
      ON CONFLICT(code) DO NOTHING
    `)
    for (const [code, r20, r40] of [
      ['C6',  14.54, 19.39],
      ['FRP', 19.91, 27.33],
      ['FRV', 10.20, 13.76],
      ['FCP', 27.87, 38.26],
      ['FCV', 14.27, 19.26],
    ]) ensureCode.run(code, code, r20, r40)
  } catch {}

  // One-time data fix: soft-delete duplicate voyage entries B2026-258 and 258
  try {
    const dupeExists = db.prepare(
      `SELECT id FROM berthing_records WHERE voyage_number IN ('B2026-258','258') AND is_deleted = 0`
    ).get()
    if (dupeExists) {
      db.exec(`
        UPDATE container_services SET is_deleted = 1 WHERE voyage_number IN ('B2026-258','258') AND is_deleted = 0;
        UPDATE gc_services        SET is_deleted = 1 WHERE voyage_number IN ('B2026-258','258') AND is_deleted = 0;
        UPDATE receipts           SET is_deleted = 1 WHERE voyage_number IN ('B2026-258','258') AND is_deleted = 0;
        UPDATE berthing_records   SET is_deleted = 1 WHERE voyage_number IN ('B2026-258','258') AND is_deleted = 0;
        UPDATE voyages            SET is_deleted = 1 WHERE voyage_number IN ('B2026-258','258') AND is_deleted = 0;
      `)
    }
  } catch {}

  // user_permissions table — stores per-user permission grants
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id),
      permission_key TEXT NOT NULL,
      granted_by     INTEGER REFERENCES users(id),
      granted_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, permission_key)
    )
  `)

  // Migrate legacy can_generate_cma column → user_permissions
  try {
    const withCma = db.prepare('SELECT id FROM users WHERE can_generate_cma = 1').all()
    const ins = db.prepare("INSERT OR IGNORE INTO user_permissions (user_id, permission_key) VALUES (?, 'generate_cma_receipt')")
    for (const u of withCma) ins.run(u.id)
  } catch {}

  // Rate migration: swap P2 and En Rade fees (guard: old P2/L1 rate was 1.00, new is 0.50)
  const p2L1 = db.prepare(`SELECT rate FROM berthing_rates WHERE position = 'P2' AND l_index = 1`).get()
  if (p2L1 && p2L1.rate === 1.00) {
    db.transaction(() => {
      db.exec(`UPDATE berthing_rates SET position = 'SWAP_TEMP' WHERE position = 'P2'`)
      db.exec(`UPDATE berthing_rates SET position = 'P2' WHERE position = 'En Rade'`)
      db.exec(`UPDATE berthing_rates SET position = 'En Rade' WHERE position = 'SWAP_TEMP'`)
      db.exec(`UPDATE berthing_minimums SET position = 'SWAP_TEMP' WHERE position = 'P2'`)
      db.exec(`UPDATE berthing_minimums SET position = 'P2' WHERE position = 'En Rade'`)
      db.exec(`UPDATE berthing_minimums SET position = 'En Rade' WHERE position = 'SWAP_TEMP'`)
    })()
  }

  // Migration: expand berthing_records CHECK to allow 'Congestion' position
  try {
    const schemaRow = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='berthing_records'`).get()
    if (schemaRow && !schemaRow.sql.includes("'Congestion'")) {
      db.transaction(() => {
        db.exec(`ALTER TABLE berthing_records RENAME TO berthing_records_pre_cong`)
        db.exec(`
          CREATE TABLE berthing_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voyage_number TEXT NOT NULL,
            bill_number TEXT NOT NULL,
            vessel_name TEXT NOT NULL,
            vessel_type TEXT,
            flag TEXT,
            shipping_agent TEXT NOT NULL,
            ata TEXT NOT NULL,
            atd TEXT NOT NULL,
            loa REAL NOT NULL,
            days INTEGER NOT NULL,
            position TEXT NOT NULL CHECK(position IN ('Quay', 'P2', 'En Rade', 'Congestion')),
            vessel_category TEXT,
            maintenance TEXT NOT NULL DEFAULT 'No',
            l_index INTEGER NOT NULL,
            d1_days INTEGER NOT NULL DEFAULT 0,
            d2_days INTEGER NOT NULL DEFAULT 0,
            d3_days INTEGER NOT NULL DEFAULT 0,
            raw_fee REAL NOT NULL,
            discount_factor REAL NOT NULL DEFAULT 1.0,
            fee_after_discount REAL NOT NULL,
            min_fee REAL NOT NULL,
            late_fee REAL NOT NULL DEFAULT 0,
            maintenance_fee REAL NOT NULL DEFAULT 0,
            final_fee REAL NOT NULL,
            created_by INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_by INTEGER REFERENCES users(id),
            updated_at TEXT,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            deleted_by INTEGER REFERENCES users(id),
            deleted_at TEXT
          )
        `)
        db.exec(`INSERT INTO berthing_records SELECT * FROM berthing_records_pre_cong`)
        db.exec(`DROP TABLE berthing_records_pre_cong`)
      })()
    }
  } catch {}

  // Remove any duplicate auto/fixed service lines per voyage (keep oldest row per code)
  db.exec(`
    DELETE FROM container_services
    WHERE (is_fixed = 1 OR is_auto = 1)
      AND is_deleted = 0
      AND id NOT IN (
        SELECT MIN(id) FROM container_services
        WHERE (is_fixed = 1 OR is_auto = 1) AND is_deleted = 0
        GROUP BY voyage_number, service_code
      );

    DELETE FROM gc_services
    WHERE (is_fixed = 1 OR is_auto = 1)
      AND is_deleted = 0
      AND id NOT IN (
        SELECT MIN(id) FROM gc_services
        WHERE (is_fixed = 1 OR is_auto = 1) AND is_deleted = 0
        GROUP BY voyage_number, service_code
      );
  `)

  // Seed berthing_rates
  const rateCount = db.prepare('SELECT COUNT(*) as c FROM berthing_rates').get().c
  if (rateCount === 0) {
    const insertRate = db.prepare('INSERT INTO berthing_rates (position, tier, l_index, rate) VALUES (?, ?, ?, ?)')
    const seedRates = db.transaction(() => {
      insertRate.run('Quay', 'D1', 1, 1.50); insertRate.run('Quay', 'D1', 2, 2.25)
      insertRate.run('Quay', 'D1', 3, 3.25); insertRate.run('Quay', 'D1', 4, 4.00)
      insertRate.run('Quay', 'D2', 1, 2.00); insertRate.run('Quay', 'D2', 2, 3.50)
      insertRate.run('Quay', 'D2', 3, 4.50); insertRate.run('Quay', 'D2', 4, 6.00)
      insertRate.run('Quay', 'D3', 1, 4.00); insertRate.run('Quay', 'D3', 2, 7.00)
      insertRate.run('Quay', 'D3', 3, 9.00); insertRate.run('Quay', 'D3', 4, 12.00)
      insertRate.run('P2', 'ALL', 1, 0.50); insertRate.run('P2', 'ALL', 2, 1.00)
      insertRate.run('P2', 'ALL', 3, 1.00); insertRate.run('P2', 'ALL', 4, 1.00)
      insertRate.run('En Rade', 'ALL', 1, 1.00); insertRate.run('En Rade', 'ALL', 2, 1.50)
      insertRate.run('En Rade', 'ALL', 3, 2.00); insertRate.run('En Rade', 'ALL', 4, 3.00)
    })
    seedRates()
  }

  // Seed berthing_minimums
  const minCount = db.prepare('SELECT COUNT(*) as c FROM berthing_minimums').get().c
  if (minCount === 0) {
    const insertMin = db.prepare('INSERT INTO berthing_minimums (position, l_index, min_fee) VALUES (?, ?, ?)')
    const seedMins = db.transaction(() => {
      insertMin.run('Quay', 1, 300);  insertMin.run('Quay', 2, 500)
      insertMin.run('Quay', 3, 750);  insertMin.run('Quay', 4, 1000)
      insertMin.run('P2', 1, 75);     insertMin.run('P2', 2, 125)
      insertMin.run('P2', 3, 175);    insertMin.run('P2', 4, 225)
      insertMin.run('En Rade', 1, 150);  insertMin.run('En Rade', 2, 250)
      insertMin.run('En Rade', 3, 350);  insertMin.run('En Rade', 4, 550)
    })
    seedMins()
  }

  // Seed vessel_categories
  const catCount = db.prepare('SELECT COUNT(*) as c FROM vessel_categories').get().c
  if (catCount === 0) {
    const insertCat = db.prepare('INSERT INTO vessel_categories (name, discount_factor) VALUES (?, ?)')
    const seedCats = db.transaction(() => {
      insertCat.run('Lebanese', 0.50)
      insertCat.run('Wooden Coasters', 0.50)
      insertCat.run('Sailboats', 0.50)
      insertCat.run('Passenger', 0.50)
      insertCat.run('Tourist', 0.50)
      insertCat.run('Ro-Ro', 0.65)
      insertCat.run('Military', 0.00)
      insertCat.run('Lebanese Government (Non-Commercial)', 0.00)
    })
    seedCats()
  }

  // Seed shipping_agents
  const agentCount = db.prepare('SELECT COUNT(*) as c FROM shipping_agents').get().c
  if (agentCount === 0) {
    const insertAgent = db.prepare('INSERT INTO shipping_agents (name) VALUES (?)')
    const agents = [
      'ADELMAR SHIPPING LINES SARL', 'Akak Marine Company sal', 'ANCHOR sarl',
      'Arab Shipping And Chart.Comp. sal', 'Arabian Maritime & Transport Agency',
      'Badr Shipping Co.Ltd', 'Badri Freiha', 'BALTAGI', 'Banaco Shipping Agency',
      'Blue Wave', 'Bow Marine International SARL', 'BRAINMAR sarl',
      'Divina Line S.A.R.L.', 'El Fil Shipping', 'Gezairi Shipping sarl',
      'GHARIB SHIPPING AGENCY', 'Ghassan Kamari Shipping Agency',
      'Global Lines co sarl', 'Global Lines Transport sarl',
      'Global Marine Agency (GMA) sarl', 'GOLDEN SHIP SAL',
      'Golf Agency Maritime GAM S.A.R.L.', 'Harbor Ships Service S.A.L.',
      'Henry Heald & Co. sal', 'J.T. Mar Limited', 'Josmar', 'K & F MaHAERY',
      'Lamare Maritime Services sarl', 'Lebanese Shipping United sal',
      'MAERSK LEBANON SARL', 'Marakiba Shipping', 'Medawar Shipping Company SARL',
      'Medbridge Shipping Agency sal', 'Mediterranean Navigation co (MEDNAV)',
      'MSC', 'Medkon Lines Lebanon S.A.L.', 'Merit Shipping SAL',
      'Minerva Shipping Agency', 'MLH LIBAN sal',
      'National Trad. & Shipping Ag.', 'Nicolas Abou Rjeily sarl',
      'Nouvelle societe libanaise d\'acconage sarl', 'Owner of the Ship',
      'Phoenician Maritime Agency', 'Rabunion Maritime Agency',
      'Rassem Shipping Agency Ltd', 'Saab Shipping and chartering Sarl',
      'SALEH SHIPPING', 'Samir Chaar Maritime Ag. SARL',
      'Sea Shipping & Chartering SARL', 'Seanautics sal',
      'SEATRADE Maritime Agency SAL', 'Sigma Shipping',
      'Societe Abou Merhi Agency', 'Sonade Line sarl', 'SPIROCO SARL',
      'T. Gargour & Fils SAL', 'Tamara Shipping', 'Tarros Phoenicia sal',
      'United Chartering Agency', 'VICTOIR', 'XFS sal', 'Ziad Sahyoun',
    ]
    const seedAgents = db.transaction(() => {
      agents.forEach(name => insertAgent.run(name))
    })
    seedAgents()
  }

  // Seed container_codes (user codes from JSON + fixed system codes)
  const codeCount = db.prepare('SELECT COUNT(*) as c FROM container_codes').get().c
  if (codeCount === 0) {
    const insertCode = db.prepare(`
      INSERT INTO container_codes (code, description, default_rate_20, default_rate_40, is_taxable, is_fixed, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const seedCodesTx = db.transaction(() => {
      // All user-facing codes from the seed file
      for (const c of containerCodesSeed) {
        insertCode.run(c.code, c.description, c.default_rate_20 ?? null, c.default_rate_40 ?? null, c.is_taxable || 0, c.is_fixed || 0, c.is_active !== false ? 1 : 0)
      }
      // Fixed system codes — never shown in dropdown
      insertCode.run('AUTOM', 'Automation fee',    1.00, 1.00, 0, 1, 1)
      insertCode.run('BILLF', 'Billing fee',       1.00, 1.00, 0, 1, 1)
    })
    seedCodesTx()
  }

  // Seed gc_codes from JSON (user codes + system fixed lines)
  const gcCodeCount = db.prepare('SELECT COUNT(*) as c FROM gc_codes').get().c
  if (gcCodeCount === 0) {
    const insertGcCode = db.prepare(`
      INSERT INTO gc_codes (code, description, rate, minimum, unit, is_taxable, is_fixed, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const seedGcCodesTx = db.transaction(() => {
      for (const c of gcCodesSeed) {
        // BILLF is in the JSON as is_fixed=0 but must be a system line (not in dropdown)
        const isFixed = c.code === 'BILLF' ? 1 : (c.is_fixed || 0)
        insertGcCode.run(
          c.code, c.description, c.rate ?? null, c.minimum ?? 0,
          c.unit ?? null, c.is_taxable || 0, isFixed, c.is_active !== false ? 1 : 0
        )
      }
      // AUTOM fixed system line — not in the JSON
      insertGcCode.run('AUTOM', 'Automation fee', 1.00, 0, 'unit', 0, 1, 1)
    })
    seedGcCodesTx()
  }

  // Seed default admin user
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10)
    db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, language, must_change_password)
      VALUES ('admin', 'Administrator', ?, 'admin', 'en', 1)
    `).run(hash)
  }
}
