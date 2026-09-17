// Run a .sql file against the Awaken database and print real Postgres errors.
//   node supabase/tools/run-sql.mjs path/to/file.sql [--commit]
// Wraps everything in a transaction. Rolls back unless --commit is passed.
// Connection string is read from DB-CONNECTION.txt (gitignored, never printed).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = path.join(root, 'DB-CONNECTION.txt');
if (!fs.existsSync(envPath)) {
  console.error('MISSING ' + envPath);
  process.exit(2);
}
const raw = fs.readFileSync(envPath, 'utf8');
const get = (k) => {
  const mm = raw.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*?)\\s*$', 'm'));
  return mm ? mm[1].replace(/^["']|["']$/g, '') : null;
};

// Discrete fields avoid every URL-encoding trap: a password with @ : / ? # %
// or a space needs no escaping here.
const cfg = {
  host: get('DB_HOST'),
  port: parseInt(get('DB_PORT') || '5432', 10),
  user: get('DB_USER'),
  password: get('DB_PASSWORD'),
  database: get('DB_NAME') || 'postgres',
  ssl: { rejectUnauthorized: false },
};
if (!cfg.host || !cfg.user || !cfg.password) {
  console.error('DB-CONNECTION.txt needs DB_HOST, DB_USER and DB_PASSWORD lines.');
  process.exit(2);
}

const file = process.argv[2];
const commit = process.argv.includes('--commit');
if (!file) { console.error('usage: run-sql.mjs <file.sql> [--commit]'); process.exit(2); }
const sql = fs.readFileSync(path.resolve(file), 'utf8');

const client = new pg.Client(cfg);
try {
  await client.connect();
} catch (e) {
  console.error('CONNECT FAILED: ' + e.message);
  process.exit(1);
}

let failed = false;
try {
  await client.query('begin');
  const res = await client.query(sql);
  const list = Array.isArray(res) ? res : [res];
  for (const r of list) {
    if (r.command) process.stdout.write(r.command + (r.rowCount != null ? ' ' + r.rowCount : '') + '\n');
    if (r.rows && r.rows.length) console.table(r.rows);
  }
  if (commit) { await client.query('commit'); console.log('\n*** COMMITTED ***'); }
  else { await client.query('rollback'); console.log('\n*** ROLLED BACK (dry run) - pass --commit to apply ***'); }
} catch (e) {
  failed = true;
  await client.query('rollback').catch(() => {});
  console.error('\nSQLSTATE ' + (e.code || '?') + ': ' + e.message);
  if (e.position) {
    const p = parseInt(e.position, 10);
    console.error('at character ' + p + ':');
    console.error('  ...' + sql.slice(Math.max(0, p - 120), p) + '  <<<HERE>>>  ' + sql.slice(p, p + 120) + '...');
  }
  if (e.detail) console.error('detail: ' + e.detail);
  if (e.hint) console.error('hint: ' + e.hint);
} finally {
  await client.end();
}
process.exit(failed ? 1 : 0);
