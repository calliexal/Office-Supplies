import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const migrations = (await readdir(join(DIR, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
const parts = [...migrations.map((f) => `migrations/${f}`), 'seed.sql'];

const bar = `-- ${'='.repeat(85)}`;
let out = [
  bar,
  '-- ONE-SHOT SETUP for a fresh Supabase project: schema + RLS + RPC + storage + seed.',
  '-- Generated from migrations/*.sql and seed.sql by scripts/build-setup-sql.mjs - do not edit.',
  '-- Paste into Dashboard -> SQL Editor -> Run (once). Existing projects: run only the new migration files.',
  bar,
  '',
].join('\n');
for (const part of parts) out += `\n-- >>> ${part}\n${(await readFile(join(DIR, part), 'utf8')).trimEnd()}\n`;

await writeFile(join(DIR, 'setup.sql'), out, 'utf8');
console.log(`supabase/setup.sql <- ${parts.join(', ')}`);
