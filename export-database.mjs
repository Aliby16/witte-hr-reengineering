import { readFileSync, writeFileSync } from 'node:fs';
import { SqliteAdapter } from './local-db.js';
import { seedDemo } from './seed.js';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const database = new SqliteAdapter();
database.initialize(schema);
await seedDemo({ DB: database });

// Экспортируется только начальный набор; активные сеансы в него не входят.
const tables = database.connection.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY rowid"
).all().map(row => row.name);
const quoteName = value => '"'+value.replaceAll('"','""')+'"';
const literal = value => value === null ? 'NULL' : typeof value === 'number'
  ? String(value) : "'"+String(value).replaceAll("'","''")+"'";
const queries = schema.replace(/^PRAGMA.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
const counts = {};
for (const table of tables) {
  const rows = database.connection.prepare(`SELECT * FROM ${quoteName(table)}`).all();
  counts[table] = rows.length;
  if (['sessions','login_attempts'].includes(table)) continue;
  for (const row of rows) {
    queries.push(`INSERT INTO ${quoteName(table)} (${Object.keys(row).map(quoteName).join(',')}) VALUES (${Object.values(row).map(literal).join(',')})`);
  }
}
writeFileSync(new URL('./database.sql', import.meta.url),
  '-- PostgreSQL: схема и начальное наполнение кадровой системы\nBEGIN;\n'+queries.map(s=>s+';').join('\n\n')+'\nCOMMIT;\n');
if (process.argv.includes('--queries')) {
  writeFileSync(new URL('../analysis/neon_init_queries.json', import.meta.url), JSON.stringify(queries,null,2));
}
database.close();
console.log(JSON.stringify({ tables: tables.length, records: counts, statements: queries.length }));
