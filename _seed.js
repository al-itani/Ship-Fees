const fs = require('fs')
const db = require('better-sqlite3')('C:/ShipFees/data/ship_fees.db')
const insShip = db.prepare('INSERT INTO ships (name, loa) VALUES (?, ?)')
const insName = db.prepare('INSERT OR IGNORE INTO ship_names (name) VALUES (?)')
const vessels = [
  ['ADELINA',168.0],['ALIJAX OUS',100.0],['AMK NOBLE',178.0],
  ['ARCHERFISH',102.0],['ASMAR',110.0],['ATLAS',184.0],
  ['BASILIS L',183.0],['CMA CGM FORT STE MARIE',198.0],
  ['CMA CGM SINTRA',205.0],['CMA CGM TOKYO',271.0],
  ['DIANE A',184.0],['ETRACO',8.0],['EVER CHAMP',172.0],
  ['EYUP',108.0],['GOLDEN ROSE',114.0],['HARMONY LIVESTOCK',79.0],
  ['HIGH FREEDOM',184.0],['KHODR',101.0],['LOTUS',137.0],
  ['MED DENIZLI',152.0],['MED IZMIR',134.0],['MSC ABIDJAN',300.0],
  ['MSC BANU III',231.0],['MSC CHARLOTTE',148.0],['MUSTAFA DAYI',183.0],
  ['NABOLSI 1',76.0],['ONUR G.A',156.0],['PRINCESS MARIAM',117.0],
  ['ROMAN E',96.0],['ROSE I',185.0],['VICTORY',121.0],
]
let inserted = 0
db.transaction(() => {
  for (const [name, loa] of vessels) {
    const exists = db.prepare('SELECT id FROM ships WHERE name = ? AND is_deleted = 0').get(name)
    if (!exists) { insShip.run(name, loa); inserted++ }
    insName.run(name)
  }
})()
const total = db.prepare('SELECT COUNT(*) as c FROM ships WHERE is_deleted = 0').get().c
fs.writeFileSync('C:\Users\User\AppData\Local\Temp\dbout.txt', JSON.stringify({ inserted, total }))
process.exit(0)
