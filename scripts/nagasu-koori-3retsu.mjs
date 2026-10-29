/* nagasu-koori-3retsu.mjs — ★請求書の 凍結（pay_invoices_freeze）を repo の 3列版に 入れ替える★（2026-10-14）
 *
 * なぜ：repo の supabase/schema-seikyu.sql は 09-11（c17fcf3）で 12列→3列 に 直したのに、
 *       ★倉庫へ 流していなかった★（テスト線の 倉庫は 08-18 版 md5 fb3e5671… の まま・SELECT で 実測）。
 *       画面は「発行済みも いつでも 直せる」なのに 倉庫が 拒み、客の 保存が 落ちていた。
 *       司さん 2026-10-14「やれ」（請求書の 凍結を 3列に・本番の 倉庫に 書いてよいのは この件と 給与の 作り変えだけ）。
 *
 *   node scripts/nagasu-koori-3retsu.mjs --kura test --probe    … 読むだけ（今の md5）
 *   node scripts/nagasu-koori-3retsu.mjs --kura test            … 流して 数える
 *   node scripts/nagasu-koori-3retsu.mjs --kura honban --honban … 本番（★2つ 打たないと 動かない★）
 *
 * ★守り★
 *   ① 流すのは ★この 関数 1本だけ★（create or replace function kyuyo.pay_invoices_freeze）。表・引き金・他の 関数は 触らない
 *   ② 流す 本体は repo の sql から 抜き、★md5 が c17fcf3 の 本体（1dd05a57…）と 同じ 時だけ★ 流す
 *   ③ 流す 前と 後の md5 を 取り、後が 1dd05a57… で なければ NG。引き金が 付いて 生きているかも 数える
 *   ④ ★流した 記録を repo に 残す★（supabase/NAGASHITA.md：いつ・どの 倉庫・前と 後の md5・HEAD）
 *      ＝「repo は 3列・倉庫は 12列」を もう 作らない
 * 鍵: ~/.supabase-token（{"token":"sbp_…"}）。中身は 画面へ 出さない。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROD_REF, TEST_REF } from './_souko-ref.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KURA = { test: TEST_REF, honban: PROD_REF };
const MD5_3RETSU = '1dd05a5792ce3cd28460ea2919144644';   // c17fcf3 の 本体
const MD5_0818 = 'fb3e567157ede478ace0030f5f3c0be7';     // 93525d5 の 本体（12列）

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const has = (k) => process.argv.includes(k);
class Stop extends Error {}
function die(m) { console.error('★中止: ' + m); console.log('NAGASU RESULT: NG'); throw new Stop(m); }

function honbunOf(sql) {
  const i = sql.indexOf('create or replace function kyuyo.pay_invoices_freeze()');
  if (i < 0) die('repo の sql に pay_invoices_freeze が 無い');
  const a = sql.indexOf('$$', i) + 2, b = sql.indexOf('$$', a);
  const end = sql.indexOf(';', b);
  return { stmt: sql.slice(i, end + 1), body: sql.slice(a, b) };
}
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
/* ★本体の md5 だけでは 見えない 性質も 数える★（taiketsu 10-14）
   create or replace は 持ち主・権限は 残すが、search_path・definer・volatile などは 文の 既定に 戻す。
   ⇒ 前と 後で 同じかを 門に する。CR を 外した md5 も 並べる（SQL の 画面で 貼った 版を 見分ける） */
const MIRU = "select p.oid::text oid, md5(p.prosrc) m, md5(replace(p.prosrc, chr(13), '')) m_lf, length(p.prosrc) n, "
  + "pg_get_userbyid(p.proowner) owner, p.prosecdef secdef, coalesce(array_to_string(p.proconfig, ','), '') config, "
  + "p.provolatile vol, coalesce(p.proacl::text, '') acl, p.prorettype::regtype::text ret, l.lanname lang, p.pronargs nargs, "
  + "(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace cn on cn.oid=c.relnamespace "
  + " where cn.nspname='kyuyo' and c.relname='pay_invoices' and t.tgname='trg_pay_invoices_freeze' and t.tgenabled='O' and t.tgtype=19 and t.tgfoid=p.oid) hikigane "
  + "from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang "
  + "where n.nspname='kyuyo' and p.proname='pay_invoices_freeze'";
const SEISHITSU = ['oid', 'owner', 'secdef', 'config', 'vol', 'acl', 'ret', 'lang', 'nargs'];

const LOG = path.join(ROOT, 'supabase/NAGASHITA.md');
function kiroku(line) {
  if (!fs.existsSync(LOG)) {
    fs.writeFileSync(LOG, '# 倉庫へ 流した 記録（★repo と 倉庫が ずれない為・2026-10-14〜★）\n\n'
      + '流す 時は 必ず 道具が ここに 書く（★流す 前に「試み」・流した 後に 結果★＝途中で 落ちても 試みた 事は 残る）。\n'
      + 'md5 は 関数の 本体（prosrc）。性質＝持ち主/definer/search_path 等/volatile/権限/戻り/言語/引数の数。\n\n'
      + '| いつ（UTC） | 倉庫 | 段 | 物 | 前の md5 | 後の md5 | 生きた 引き金（前→後） | 性質 | 流した 文の md5 | 道具の commit | 結果 |\n'
      + '|---|---|---|---|---|---|---|---|---|---|---|\n');
  }
  fs.appendFileSync(LOG, line);
}

async function main() {
  const kura = arg('--kura');
  if (!KURA[kura]) die('--kura test か --kura honban を 打ってください');
  if (kura === 'honban' && !has('--honban')) die('本番は --honban も 打ってください（打ち間違い 止め）');
  const modosu = has('--modosu');        // ★戻しの 口★＝3列版 → 08-18 版（前が 3列版の 時だけ）
  const ref = KURA[kura];
  const tok = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.supabase-token'), 'utf8')).token;
  if (!tok) die('鍵が 無い（~/.supabase-token）');

  /* 流す 本体＝repo の sql（流す）／93525d5 の sql（戻す） */
  const sql = modosu
    ? execSync('git show 93525d5:supabase/schema-seikyu.sql', { cwd: ROOT }).toString()
    : fs.readFileSync(path.join(ROOT, 'supabase/schema-seikyu.sql'), 'utf8');
  const { stmt, body } = honbunOf(sql);
  const MOTO = modosu ? MD5_3RETSU : MD5_0818, SAKI = modosu ? MD5_0818 : MD5_3RETSU;
  console.log((modosu ? '戻す' : '流す') + ' 本体 md5 ' + md5(body) + '（' + body.length + '字）');
  if (md5(body) !== SAKI) die('流す 本体の md5 が 決めた 版と 違う＝流さない');

  const mae = await q(ref, tok, MIRU, true);
  const namae = (x) => x === MD5_3RETSU ? '3列版' : x === MD5_0818 ? '08-18 版（12列）' : '★知らない 版★';
  if (mae.length !== 1) die('同じ 名前の 関数が ' + mae.length + '本＝どれを 指すか 分からない');
  const m0 = mae[0];
  console.log('[' + kura + '] 前 … md5 ' + m0.m + '（' + namae(m0.m) + '・' + m0.n + '字・CR 抜き ' + m0.m_lf + '）／引き金 ' + m0.hikigane + '本');
  console.log('        性質 … ' + SEISHITSU.map((k) => k + '=' + JSON.stringify(m0[k])).join(' '));
  if (has('--probe')) { console.log('NAGASU RESULT: PROBE'); return; }

  /* ★流す 道具は commit 済みの 物だけ★（何で 流したかが 後から 分かる様に・指示役 10-14） */
  let dougu = '';
  try {
    const rel = 'scripts/nagasu-koori-3retsu.mjs';
    if (execSync('git status --porcelain -- ' + rel + ' supabase/schema-seikyu.sql', { cwd: ROOT }).toString().trim()) die('道具か sql が commit されていない／書き換え中＝流さない');
    dougu = execSync('git log -1 --format=%H -- ' + rel, { cwd: ROOT }).toString().trim();
  } catch (e) { if (e instanceof Stop) throw e; die('git が 読めない'); }
  if (!dougu) die('道具が commit されていない');
  if (m0.m === SAKI) { console.log('もう ' + namae(SAKI) + '＝流さない'); console.log('NAGASU RESULT: OK'); return; }
  if (m0.m !== MOTO) die('前が ' + namae(MOTO) + ' で ない＝知らない 物を 上書きしない（門を 緩めない）');
  if (Number(m0.hikigane) !== 1) die('前の 時点で 生きた 引き金が ' + m0.hikigane + '本＝流さない');
  if (m0.secdef !== false || m0.config !== '' || m0.vol !== 'v' || m0.ret !== 'trigger' || m0.lang !== 'plpgsql' || Number(m0.nargs) !== 0) {
    die('性質が 既定で ない（流すと 黙って 消える 物が 在る）＝流さない');
  }

  const dan = modosu ? '戻す' : '流す';
  const sei = (x) => SEISHITSU.map((k) => k + '=' + x[k]).join(';');
  kiroku('| ' + new Date().toISOString() + ' | ' + kura + ' | ' + dan + '（試み） | kyuyo.pay_invoices_freeze | ' + m0.m + ' | — | '
    + m0.hikigane + '→? | ' + sei(m0) + ' | ' + md5(stmt) + ' | ' + dougu.slice(0, 12) + ' | 試み |\n');
  let ochi = '';
  try { await q(ref, tok, stmt, false); } catch (e) { ochi = (e && e.message) || 'error'; }
  /* ★落ちても 後を 読む★＝当たっていたのに 記録に 無い、を 作らない */
  const ato = await q(ref, tok, MIRU, true);
  const m1 = ato[0] || {};
  console.log('[' + kura + '] 後 … md5 ' + m1.m + '（' + namae(m1.m) + '・' + m1.n + '字）／引き金 ' + m1.hikigane + '本');
  const onaji = SEISHITSU.every((k) => String(m0[k]) === String(m1[k]));
  if (!onaji) console.log('★性質が 変わった★ 前 ' + sei(m0) + ' ／ 後 ' + sei(m1));
  const ok = !ochi && ato.length === 1 && m1.m === SAKI && Number(m1.hikigane) === 1 && onaji;
  kiroku('| ' + new Date().toISOString() + ' | ' + kura + ' | ' + dan + ' | kyuyo.pay_invoices_freeze | ' + m0.m + ' | ' + m1.m + ' | '
    + m0.hikigane + '→' + m1.hikigane + ' | ' + (onaji ? '同じ' : '★変わった★ ' + sei(m1)) + ' | ' + md5(stmt) + ' | '
    + dougu.slice(0, 12) + ' | ' + (ok ? 'OK' : 'NG' + (ochi ? '（' + ochi.slice(0, 80).replace(/\|/g, '/') + '）' : '')) + ' |\n');
  console.log('記録 → supabase/NAGASHITA.md');
  console.log('NAGASU RESULT: ' + (ok ? 'OK' : 'NG'));
  if (!ok) process.exitCode = 1;
}
main().catch((e) => { if (!(e instanceof Stop)) console.error(e && e.message); process.exitCode = 1; });
