/* apply-seikyu-schema.mjs — ★請求書の設計図を倉庫に当てる（テスト線だけ）★
 *
 *   node scripts/apply-seikyu-schema.mjs --probe   … 当てずに「今どうなっているか」だけ測る
 *   node scripts/apply-seikyu-schema.mjs           … 門番を通してから当てて、当たったかを数える
 *
 * ★守り★
 *   ① 向き先は ★js/supa-config.js から読む★（このリポジトリの向き先以外には当たらない）
 *   ② ★本番倉庫なら即中止★（このrepoはテスト線。本番は司さんの一言があってから）
 *   ③ ★門番(scripts/seikyu-sql-guard.mjs)に1本でも落ちたら1文字も当てない★
 *   ④ 当てた後に ★棚・列・索引・仕掛け・窓口を数えて APPLY RESULT: OK/NG を出す★
 *      （目視の「できました」を成果にしない）
 *
 * 鍵: Supabase Personal Access Token。%TEMP%\nomiya-db-url.json などに置いてある。
 *     ★アカウント全体を触れる強い鍵なので、中身は絶対に画面へ出さない。★
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspect, PROD_WAREHOUSE_REF, ALLOWED_TABLES } from './seikyu-sql-guard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL_PATH = path.join(ROOT, 'supabase/schema-seikyu.sql');

// ★終わり方: process.exit を叩かず exitCode で抜ける。
//   fetch の接続が残っている途中で exit すると Windows の Node が落ちる
//   （Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)）。
//   落ちると「成功したのに失敗に見える」ので、必ず自然に終わらせる。
class Stop extends Error {}
function die(msg) { console.error('\n★中止: ' + msg); console.log('\nAPPLY RESULT: NG'); throw new Stop(msg); }

/* ── ① 向き先はこのリポジトリの設定から読む ─────────────────────── */
function refFromRepo() {
  const src = fs.readFileSync(path.join(ROOT, 'js/supa-config.js'), 'utf8');
  const m = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(src);
  if (!m) die('js/supa-config.js から倉庫の向き先を読めません');
  return m[1];
}

/* ── 鍵（中身は出さない） ────────────────────────────────────── */
function token() {
  const tmp = process.env.TEMP || process.env.TMP || os.tmpdir();
  for (const f of ['nomiya-db-url.json', 'daikome-db-token.json', 'nomiya-db-url-prod.json']) {
    const p = path.join(tmp, f);
    if (!fs.existsSync(p)) continue;
    try {
      const t = JSON.parse(fs.readFileSync(p, 'utf8')).token;
      if (t) return { t, from: f };
    } catch (e) { /* 次を探す */ }
  }
  die('鍵が見つかりません（%TEMP%\\nomiya-db-url.json 等）。司さんに作り直しを頼んでください');
}

async function q(ref, tok, sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { body = text; }
  return { status: r.status, body };
}

/* ── ④ 当たったかを数える（読むだけ） ───────────────────────────── */
const PROBE_SQL = `
select
  (select count(*) from information_schema.tables
     where table_schema='kyuyo' and table_name in ('pay_invoices','pay_receipts')) as tables,
  (select count(*) from information_schema.columns
     where table_schema='kyuyo' and table_name='pay_invoices') as inv_cols,
  (select count(*) from information_schema.columns
     where table_schema='kyuyo' and table_name='pay_receipts') as rcp_cols,
  (select count(*) from pg_indexes
     where schemaname='kyuyo' and indexname='uq_pay_invoices_no') as uq_no,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='kyuyo' and c.relname='pay_invoices' and not t.tgisinternal) as inv_triggers,
  (select count(*) from pg_policies where schemaname='kyuyo' and tablename in ('pay_invoices','pay_receipts')) as policies,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname in ('pay_invoices','pay_receipts')
       and c.relkind='v' and array_to_string(c.reloptions,',') like '%security_invoker=true%') as views_invoker,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='kyuyo' and c.relname in ('pay_invoices','pay_receipts') and c.relrowsecurity) as rls_on
`;

const EXPECT = { tables: 2, uq_no: 1, inv_triggers: 2, policies: 2, views_invoker: 2, rls_on: 2 };

async function probe(ref, tok, label) {
  const r = await q(ref, tok, PROBE_SQL);
  if (r.status !== 200 && r.status !== 201) {
    console.log(`  [${label}] 測れませんでした HTTP ${r.status}: ` + JSON.stringify(r.body).slice(0, 200));
    return null;
  }
  const row = Array.isArray(r.body) ? r.body[0] : null;
  if (!row) { console.log(`  [${label}] 返り値が空`); return null; }
  console.log(`  [${label}] 棚 ${row.tables}/2 ・ 請求の列 ${row.inv_cols} ・ 入金の列 ${row.rcp_cols} ・ `
    + `番号の一意 ${row.uq_no}/1 ・ 仕掛け ${row.inv_triggers}/2 ・ RLS ${row.rls_on}/2 ・ `
    + `決まり ${row.policies}/2 ・ 窓口(invoker=true) ${row.views_invoker}/2`);
  return row;
}

/* ── main ─────────────────────────────────────────────────────── */
async function main() {
  const ref = refFromRepo();
  const probeOnly = process.argv.includes('--probe');

  console.log('\n[apply-seikyu-schema] 倉庫: ' + ref + '（js/supa-config.js から読んだ向き先）');
  if (ref === PROD_WAREHOUSE_REF) {
    die('★これは本番倉庫です。このrepoはテスト線。本番へ当てるのは司さんの一言があってから。');
  }

  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  const g = inspect(sql);
  console.log('  門番: ' + (g.ok ? '通過' : '★止めました★'));
  console.log('  触る物: ' + g.stats.objects.join(', '));
  if (!g.ok) { g.reasons.forEach(r => console.error('   - ' + r)); die('門番に落ちたので1文字も当てません'); }
  for (const t of ALLOWED_TABLES) if (!sql.includes('kyuyo.' + t)) die('許可した棚 ' + t + ' が設計図に無い');

  const { t: tok, from } = token();
  console.log('  鍵: ' + from + ' から読みました（中身は出しません）');

  console.log('\n── 当てる前 ──');
  const before = await probe(ref, tok, 'before');

  if (probeOnly) {
    console.log('\n（--probe なので当てていません）');
    console.log('\nAPPLY RESULT: ' + (before && EXPECT.tables === before.tables ? 'OK（既に当たっています）' : 'NOT-APPLIED'));
    return;
  }

  console.log('\n── 当てる ──');
  const res = await q(ref, tok, sql);
  if (res.status !== 200 && res.status !== 201) {
    console.error('  HTTP ' + res.status + ': ' + JSON.stringify(res.body).slice(0, 600));
    die('当てられませんでした');
  }
  console.log('  HTTP ' + res.status + ' で通りました');

  console.log('\n── 当てた後 ──');
  const after = await probe(ref, tok, 'after');
  if (!after) die('当てた後を測れませんでした');

  const bad = Object.entries(EXPECT).filter(([k, v]) => Number(after[k]) !== v);
  if (bad.length) {
    bad.forEach(([k, v]) => console.error('   - ' + k + ' が ' + after[k] + '（' + v + ' のはず）'));
    die('数が合いません');
  }
  console.log('\nAPPLY RESULT: OK');

}

try {
  await main();
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); console.log('\nAPPLY RESULT: NG'); }
  process.exitCode = 1;
}
