/* nagasu-rireki.mjs — ★給与の 直しの 記録（kyuyo.pay_rireki・引き金 6本）を 倉庫へ 流して 数える★（2026-11-20）
 *
 *   node scripts/nagasu-rireki.mjs --kura test --probe    … 読むだけ（今 在るか・引き金・権限）
 *   node scripts/nagasu-rireki.mjs --kura test            … 流して 数える
 *   node scripts/nagasu-rireki.mjs --kura honban --honban … 本番（★2つ 打たないと 動かない★・★司さんの 一言の 後だけ★）
 *
 * ★守り★
 *   ① 流すのは supabase/schema-kyuyo-rireki.sql だけ。★門番（scripts/rireki-sql-guard.mjs）に 1つでも 落ちたら 1字も 流さない★
 *   ② 道具と sql が commit 済みの 時だけ 流す（何で 流したかを 後から 辿れる）
 *   ③ 流す 前と 後に 数える：表・関数（definer・search_path=''・anon/authenticated/PUBLIC に 実行権 無し）・
 *      ★生きた 引き金 6本（tgenabled='O'・関数が この 1本）★・policy（select 1本だけ）・表と 窓の 権限（anon 無し・authenticated は r だけ）
 *   ④ supabase/NAGASHITA.md に 試み と 結果を 残す（落ちても 試みは 残る）
 * 鍵: ~/.supabase-token（{"token":"sbp_…"}）。中身は 画面へ 出さない。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROD_REF, TEST_REF } from './_souko-ref.mjs';
import { inspect, HIKIGANE } from './rireki-sql-guard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL_REL = 'supabase/schema-kyuyo-rireki.sql';
const KURA = { test: TEST_REF, honban: PROD_REF };
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const has = (k) => process.argv.includes(k);
class Stop extends Error {}
function die(m) { console.error('★中止: ' + m); console.log('NAGASU RESULT: NG'); throw new Stop(m); }
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

async function q(ref, tok, query, readOnly) {
  const r = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/query', {
    method: 'POST',
    headers: { 'User-Agent': 'rakunally-nagasu', Authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
    body: JSON.stringify(readOnly ? { query, read_only: true } : { query }),
  });
  const t = await r.text();
  if (!r.ok) die('倉庫が 断った（HTTP ' + r.status + '）: ' + t.slice(0, 300));
  try { return JSON.parse(t); } catch (e) { die('返事が 読めない: ' + t.slice(0, 200)); }
}

/* 数える 1本（読むだけ） */
export const MIRU = "select "
  + "(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kyuyo' and c.relname='pay_rireki' and c.relkind='r') hyou, "
  + "(select coalesce(c.relacl::text,'') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kyuyo' and c.relname='pay_rireki') hyou_acl, "
  + "(select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kyuyo' and c.relname='pay_rireki') rls, "
  + "(select coalesce(c.relacl::text,'') || ' ' || coalesce(array_to_string(c.reloptions, ','),'') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='pay_rireki' and c.relkind='v') mado, "
  + "(select count(*) from pg_policies where schemaname='kyuyo' and tablename='pay_rireki') pol_all, "
  + "(select count(*) from pg_policies where schemaname='kyuyo' and tablename='pay_rireki' and cmd='SELECT' and roles='{authenticated}' and qual='(account_id = auth.uid())') pol_ok, "
  + "(select md5(p.prosrc) || ' ' || p.prosecdef || ' ' || coalesce(array_to_string(p.proconfig, ','),'') || ' ' || coalesce(p.proacl::text,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kyuyo' and p.proname='pay_rireki_kaku') kansu, "
  + "(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace cn on cn.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace "
  + "  where cn.nspname='kyuyo' and pn.nspname='kyuyo' and p.proname='pay_rireki_kaku' and t.tgenabled='O' and (c.relname, t.tgname) in ("
  + HIKIGANE.map(([g, t]) => "('" + t + "','" + g + "')").join(',') + ")) ikita, "
  + "(select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where p.proname='pay_rireki_kaku') hikigane_all";

/* 数えた 物が 決めた 通りか（純関数・試験で 叩く） */
export function hantei(m) {
  const why = [];
  if (Number(m.hyou) !== 1) why.push('表 kyuyo.pay_rireki が ' + m.hyou + '本');
  if (m.rls !== true) why.push('RLS が 入っていない');
  if (/(^|[{,])anon=/.test(m.hyou_acl || '')) why.push('表に anon の 権限が 在る ' + m.hyou_acl);
  if (!/authenticated=r\//.test(m.hyou_acl || '')) why.push('表の authenticated が r だけで ない ' + m.hyou_acl);
  if (!m.mado || /(^|[{,])anon=/.test(m.mado) || !/authenticated=r\//.test(m.mado) || !/security_invoker=true/.test(m.mado)) why.push('窓 public.pay_rireki の 権限か invoker が 違う ' + m.mado);
  if (Number(m.pol_all) !== 1 || Number(m.pol_ok) !== 1) why.push('policy が select 1本 だけで ない（全 ' + m.pol_all + '・合う ' + m.pol_ok + '）');
  const k = String(m.kansu || '');
  const [, secdef, config] = k.split(' ');   // 'md5 true search_path="" {acl}'
  if (secdef !== 'true' || !/^search_path=(""|)$/.test(config || '')) why.push("関数が definer＋search_path='' で ない " + k.slice(33));
  if (/(^|[{,])(anon|authenticated)=X/.test(k) || /[{,]=X\//.test(k)) why.push('関数の 実行権が anon/authenticated/PUBLIC に 残る ' + k.slice(33));
  if (Number(m.ikita) !== HIKIGANE.length) why.push('生きた 引き金が ' + m.ikita + '本（' + HIKIGANE.length + '本で ない）');
  if (Number(m.hikigane_all) !== HIKIGANE.length) why.push('pay_rireki_kaku を 呼ぶ 引き金が 全部で ' + m.hikigane_all + '本');
  return { ok: why.length === 0, why };
}

const LOG = path.join(ROOT, 'supabase/NAGASHITA.md');
const kiroku = (line) => fs.appendFileSync(LOG, line);
const hyouji = (m) => '表' + m.hyou + '・引き金' + m.ikita + '/' + m.hikigane_all + '・policy' + m.pol_ok + '/' + m.pol_all;

async function main() {
  const kura = arg('--kura');
  if (!KURA[kura]) die('--kura test か --kura honban を 打ってください');
  if (kura === 'honban' && !has('--honban')) die('本番は --honban も 打ってください（打ち間違い 止め）');
  const ref = KURA[kura];
  const tok = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.supabase-token'), 'utf8')).token;
  if (!tok) die('鍵が 無い（~/.supabase-token）');

  const sql = fs.readFileSync(path.join(ROOT, SQL_REL), 'utf8');
  const g = inspect(sql);
  if (!g.ok) die('門番に 落ちた＝1字も 流さない：' + g.why.join(' / '));
  console.log('流す sql md5 ' + md5(sql) + '（' + sql.length + '字）・門番 通った');

  const [m0] = await q(ref, tok, MIRU, true);
  const h0 = hantei(m0);
  console.log('[' + kura + '] 前 … ' + hyouji(m0) + '・' + (h0.ok ? '決めた 通り' : h0.why.length + '件 違う'));
  if (has('--probe')) { for (const w of h0.why) console.log('   ・' + w); console.log('NAGASU RESULT: PROBE'); return; }

  let dougu = '';
  try {
    if (execSync('git status --porcelain -- scripts/nagasu-rireki.mjs scripts/rireki-sql-guard.mjs ' + SQL_REL, { cwd: ROOT }).toString().trim()) die('道具か sql が commit されていない／書き換え中＝流さない');
    dougu = execSync('git log -1 --format=%H -- scripts/nagasu-rireki.mjs ' + SQL_REL, { cwd: ROOT }).toString().trim();
  } catch (e) { if (e instanceof Stop) throw e; die('git が 読めない'); }
  if (!dougu) die('道具が commit されていない');

  kiroku('| ' + new Date().toISOString() + ' | ' + kura + ' | 流す（試み） | kyuyo.pay_rireki 一式 | ' + (m0.kansu ? String(m0.kansu).slice(0, 32) : '無し') + ' | — | '
    + m0.ikita + '→? | ' + hyouji(m0) + ' | ' + md5(sql) + ' | ' + dougu.slice(0, 12) + ' | 試み |\n');
  let ochi = '';
  try { await q(ref, tok, sql, false); } catch (e) { ochi = (e && e.message) || 'error'; }
  const [m1] = await q(ref, tok, MIRU, true);   // ★落ちても 後を 読む★
  const h1 = hantei(m1 || {});
  console.log('[' + kura + '] 後 … ' + hyouji(m1 || {}));
  for (const w of h1.why) console.log('   ・' + w);
  const ok = !ochi && h1.ok;
  kiroku('| ' + new Date().toISOString() + ' | ' + kura + ' | 流す | kyuyo.pay_rireki 一式 | ' + (m0.kansu ? String(m0.kansu).slice(0, 32) : '無し') + ' | ' + String((m1 || {}).kansu || '').slice(0, 32) + ' | '
    + m0.ikita + '→' + (m1 || {}).ikita + ' | ' + hyouji(m1 || {}) + ' | ' + md5(sql) + ' | ' + dougu.slice(0, 12) + ' | '
    + (ok ? 'OK' : 'NG' + (ochi ? '（' + ochi.slice(0, 80).replace(/\|/g, '/') + '）' : '（' + h1.why.length + '件）')) + ' |\n');
  console.log('記録 → supabase/NAGASHITA.md');
  console.log('NAGASU RESULT: ' + (ok ? 'OK' : 'NG'));
  if (!ok) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { if (!(e instanceof Stop)) console.error(e && e.message); process.exitCode = 1; });
}
