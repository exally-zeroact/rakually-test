// seed-statutory.mjs — 中央 statutory テーブルに全kindの実値を投入(版管理・再現可能)。
//   値は payslip-app の検証済みlibからそのまま流し込む(捏造なし)。追記式(kind,year主キー・既存に触れない)。
//   使い方: SUPA_DB_PW='...' node scripts/seed-statutory.mjs
//   前提: supabase/schema.sql の statutory テーブルDDLが適用済みであること(未適用なら本スクリプトが create も行う)。
import pg from 'pg';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SHH = require('../lib/shakaihoken-hyo.js');
const SAI = require('../lib/saitei-chingin.js');
const KOYO = require('../lib/koyo-hoken.js');
const D = require('../lib/shotokuzei-densan.js');
const H = require('../lib/shotokuzei-hei.js');
const NI = require('../lib/shotokuzei-nichi.js');
const SZ = require('../lib/shoyo-zei.js');
const N = require('../lib/nenmatsu.js');
const WM = require('../lib/warimashi.js');
const SHZ = require('../lib/shouhizei-ritsu.js');
const { buildStatutoryRows } = require('../lib/statutory-rows.js');

// ★書き込み先は【このリポジトリ自身の接続設定】から導く（ホスト直書きをやめた・2026-08-01）★
//   なぜ: これは書き込みツール。ホストを直書きすると、テスト用リポジトリ(exally-staging)で
//   うっかり走らせた時に【本番倉庫へ書いてしまう】。リポジトリが持つ js/supa-config.js から
//   プロジェクトrefを取れば、本番repo→本番DB / stagingのrepo→DB-test にしかならない＝事故が構造的に起きない。
//   (js/supa-config.js は本番とstagingで中身が違う唯一のファイル＝環境の唯一の分かれ目。)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function projectRefFromRepo() {
  const p = path.join(REPO, 'js', 'supa-config.js');
  if (!fs.existsSync(p)) throw new Error('js/supa-config.js が無い＝接続先を決められない。書き込みは行いません。');
  const m = fs.readFileSync(p, 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  if (!m) throw new Error('js/supa-config.js から Supabase の URL を読めない。書き込みは行いません。');
  return m[1];
}
const REF = projectRefFromRepo();
console.log('書き込み先(このリポジトリの js/supa-config.js 由来): db.' + REF + '.supabase.co');
const c = new pg.Client({ host: 'db.' + REF + '.supabase.co', port: 5432, user: 'postgres', password: process.env.SUPA_DB_PW, database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

// ★行生成は lib/statutory-rows.js に集約(seedとadmin.htmlで単一ソース・二重持ち禁止)★
const rows = buildStatutoryRows({ SHH, SAI, KOYO, D, H, NI, SZ, N, WM, SHZ });

const run = async () => {
  await c.connect();
  await c.query(`create table if not exists statutory (kind text not null, year int not null, data jsonb not null default '{}'::jsonb, source_url text, verified_at date default now(), updated_at timestamptz not null default now(), primary key (kind, year))`);
  await c.query('alter table statutory enable row level security');
  await c.query('drop policy if exists statutory_read on statutory');
  await c.query('create policy statutory_read on statutory for select using (true)');
  await c.query('grant select on statutory to anon, authenticated');
  for (const r of rows) {
    await c.query(
      `insert into statutory(kind,year,data,source_url) values($1,$2,$3,$4)
       on conflict (kind,year) do update set data=excluded.data, source_url=excluded.source_url, updated_at=now()
       where statutory.data is distinct from excluded.data`,
      [r.kind, r.year, JSON.stringify(r.data), r.source_url]);
  }
  const chk = await c.query('select kind, year from statutory order by kind, year');
  console.log('SEEDED statutory rows:', chk.rows.length);
  chk.rows.forEach(x => console.log('  ', x.kind, x.year));
  await c.end();
};
run().catch(e => { console.log('ERR', e.message); process.exit(2); });
