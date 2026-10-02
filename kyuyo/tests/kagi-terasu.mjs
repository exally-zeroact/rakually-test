/* kagi-terasu.mjs — ★明細・申告の 関数（/rpc/）が 鍵を 本当に 照らしているか★（試験の 倉庫・anon の 道）
 * ============================================================================
 * ★なぜ（2026-10-02）★
 *   従業員が ログイン 無しで 自分の 明細・申告を 開く 道は、anon で 呼べる SECURITY DEFINER 関数（10本）。
 *   RLS を 飛び越えるので、★関数の 中で 鍵（token）と 合言葉を 照らしているか★が 唯一の 守り。
 *   手で 測ったら 穴0 だったが、★道具に 1回だけ 持たせる★（覚書は 読むでは 効かない）。
 *
 * ★ここで 見る 事（各関数）★
 *   ・陽の 対照 … 正しい 鍵/合言葉/初回コード で ★通る★（呼び方・引数・/rpc/ の 口が 合っている 証し）
 *   ・㋐鍵なし ㋑でたらめ鍵 ㋒A鍵+Bの合言葉 ㋓合言葉なし ㋔A鍵+Bの紙id … ★全部 拒まれる★
 *   ★陽が 通らなければ その 関数は 🟡未測定（呼び方が 合っていない）＝緑に しない・終わり値 非0★
 *
 * ★鍵★ … 管理の 鍵は ~/.supabase-token（★写しを 増やさない＝直に 読む★）。無ければ ㋐＝この 機械では 測らない（終わり値0）
 *        /rpc/ は 配信の 公開鍵（anon）で 叩く＝お客さんの 道。★試験の 倉庫だけ★
 *
 * ★わざと 穴を 開ける 回（--waza）★ … 倉庫の 関数は 壊せないので、★試験の 側で 穴を 真似る★
 *   ㋑でたらめ鍵 の 代わりに A の 本物の 鍵／㋒Bの合言葉 の 代わりに A の 合言葉 を 渡す
 *   ⇒ 関数は 通してしまう＝「拒まれる はずが 通った」＝★赤★。★開けた 穴の 数＝赤に なった 数★を 並べる
 *
 * ★片づけ★ … 作る 人の 名前は `ztestKagi-<時刻>-<乱数>`。finally で 必ず 消す。
 *   始める 前に ★名前の 時刻が 1時間より 古い 置き土産だけ★ 消す（同じ時に 別の 回が 走っても 消さない）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WAZA = process.argv.indexOf('--waza') >= 0;

/* ── 鍵が 無い 時の 分け方（指示役 2026-10-02）──
   ・GitHub の 上（GITHUB_ACTIONS=true）＝鍵は 元から 無い＝「ここでは 測らない」で 終わり値0（CI を 赤に しない）
   ・それ以外（手元＝押す前の 網）＝★鍵が 無いのは 事故★（%TEMP% が 消えた・置き場が 変わった 等）
     ＝「測れないので 止める」で ★終わり値 非0★。黙って 抜けると どこでも 走らない 日が できる
   ★WAZA_NOKAGI＝わざと 鍵を 見えなくする★（手元で 非0に なる事を 1回 見る） */
const KAGI_FILE = path.join(os.homedir(), '.supabase-token');
const CI_UE = String(process.env.GITHUB_ACTIONS || '') === 'true';
const WAZA_NOKAGI = process.argv.indexOf('--waza-nokagi') >= 0;
let TOK = null;
try { if (!WAZA_NOKAGI) TOK = JSON.parse(fs.readFileSync(KAGI_FILE, 'utf8')).token; } catch (e) { TOK = null; }
if (!TOK) {
  if (CI_UE) { console.log('🟡 ★未測定★ ★GitHub には 倉庫の 鍵が 無い（ここでは 測らない）★'); process.exit(0); }
  console.log('✗ ★鍵が 無い（' + KAGI_FILE + '）のに 手元（押す前の 網）＝★事故★。黙って 抜けさせない＝止めます★'
    + (WAZA_NOKAGI ? '（--waza-nokagi＝わざと 見えなくした）' : ''));
  process.exit(1);
}
/* ★本番の 倉庫を 指す repo では 走らせない★（repoEnv が test の 時だけ） */
let env = 'test';
try { const { repoEnv } = await import('../../scripts/repo-env.mjs'); env = repoEnv(ROOT); } catch (e) { env = 'test'; }
if (env !== 'test') { console.log('🟡 ★未測定★ ★この repo は 本番（' + env + '）を 指す＝試験の 倉庫では 無い ので 測りません★'); process.exit(0); }

/* ★向き先・公開鍵は 直書きしない★＝js/supa-config.js を 読む 1か所（tests/repo-supa.mjs）経由（門 no-hardcoded-supa） */
const { repoSupa } = await import('../../tests/repo-supa.mjs');
const { url: URL, key: ANON, ref: REF } = repoSupa(ROOT);
const qs = (v) => "'" + String(v).replace(/'/g, "''") + "'";
async function sql(q) {
  const r = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', { method: 'POST', headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  if (!r.ok) throw new Error('倉庫が ' + r.status + ' を 返した（管理API）');
  return r.json();
}
async function rpc(fn, args) {
  const r = await fetch(URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { st: r.status, j };
}
/* 返り値から「拒まれたか」を 見る（字では なく 旗で）＝unauth/found:false/ok:false/need_consent */
function kobamareta(j) {
  if (j == null) return true;
  if (Array.isArray(j)) return j.length === 0;
  if (typeof j !== 'object') return false;
  if (j.unauth === true) return true;
  if (j.found === false) return true;
  if (j.ok === false) return true;
  if (j.need_consent === true) return true;
  return false;
}

const INIT = 'INITCODE9';
async function mkEmp(na, pw, keepInit) {
  const id = 'e' + Math.random().toString(36).slice(2, 10);
  await sql("insert into kyuyo.pay_employees (id, account_id, sort, data) select " + qs(id) + ", u.id, coalesce((select max(e.sort) from kyuyo.pay_employees e where e.account_id=u.id),-1)+1, jsonb_build_object('id'," + qs(id) + ",'name'," + qs(na) + ",'employmentType','employee') from auth.users u where u.email='test@test.com'");
  const r = await sql("insert into kyuyo.pay_meisai_pub (account_id, employee_id, init_code) select e.account_id, e.id, " + qs(INIT) + " from kyuyo.pay_employees e where e.id=" + qs(id) + ' returning token');
  const token = (r[0] || {}).token;
  const did = 'd' + Math.random().toString(36).slice(2, 12);
  await sql("insert into kyuyo.pay_meisai_docs (id, token, account_id, ym, kind, data, published_at) select " + qs(did) + ", " + qs(token) + ", account_id, '2026-06','monthly','{\"doc\":{\"month\":\"2026-06\"},\"person\":{\"net\":234567}}'::jsonb, now() from kyuyo.pay_meisai_pub where token=" + qs(token));
  if (pw) await sql('update kyuyo.pay_meisai_pub set pw_hash=crypt(' + qs(pw) + ",gen_salt('bf')), consent_at=now()" + (keepInit ? '' : ', init_code=null') + ', fail_count=0, locked_until=null where token=' + qs(token));
  return { id, token };
}
async function rmEmp(e) {
  if (!e) return;
  try {
    if (e.token) { for (const t of ['pay_emp_profile', 'pay_nencho_decl', 'pay_meisai_docs', 'pay_meisai_pub']) await sql('delete from kyuyo.' + t + ' where token=' + qs(e.token)); }
    if (e.id) await sql('delete from kyuyo.pay_employees where id=' + qs(e.id));
  } catch (x) { console.log('  ★片づけ 失敗★ ' + String(x.message).slice(0, 90)); }
}
async function docId(token) { const r = await sql('select id from kyuyo.pay_meisai_docs where token=' + qs(token) + ' limit 1'); return (r[0] || {}).id; }
async function pwPrint(token) { const r = await sql('select md5(coalesce(pw_hash,' + qs('') + ')) as h from kyuyo.pay_meisai_pub where token=' + qs(token)); return String((r[0] || {}).h).slice(0, 8); }
async function rowCnt(token, tbl) { const r = await sql('select count(*) as n, coalesce(max(updated_at)::text,' + qs('-') + ') as u from kyuyo.' + tbl + ' where token=' + qs(token)); const g = r[0] || {}; return g.n + '/' + String(g.u).slice(0, 19); }

const BAD = '00000000-0000-4000-8000-000000000000';
let you = 0, kobamu = 0, mi = 0, akaWaza = 0, wazaKai = 0;
const miList = [];
const AI = 'tamesiAIkotoba1', BI = 'tamesiBIkotoba2';
let A, B, C;

console.log('\n[kagi-terasu] 明細・申告の 関数が 鍵を 照らしているか（試験の 倉庫・anon の 道）' + (WAZA ? '  ★★わざと 穴を 開けた 回★★' : ''));

/* ── 置き土産の 掃除（名前の 時刻が 1時間より 古い 物だけ） ── */
try {
  const furui = await sql("select p.token, e.id from kyuyo.pay_meisai_pub p join kyuyo.pay_employees e on e.id=p.employee_id"
    + " where e.data->>'name' like 'ztestKagi-%' and (regexp_replace(e.data->>'name','^ztestKagi-([0-9]+)-.*$','\\1'))::bigint < " + (Date.now() - 3600000));
  for (const x of furui) { await sql('delete from kyuyo.pay_meisai_pub where token=' + qs(x.token)); await sql('delete from kyuyo.pay_employees where id=' + qs(x.id)); }
  console.log('  置き土産（1時間より 古い ztestKagi）を 消した … ' + furui.length + '人');
} catch (e) { console.log('  （掃除 できず ' + String(e.message).slice(0, 60) + '）'); }

/* 1本 見る＝陽が 通れば 「㋐〜で 拒まれたか」を 数える／陽が 通らなければ 未測定（止める） */
function miru(na, youOk, waza, seikyoHaji) {
  if (!youOk) { mi++; miList.push(na); console.log('  🟡 ' + na + ' … ★未測定（陽の 対照が 通らない＝呼び方が 合っていない）★'); return; }
  if (waza) {
    wazaKai++;
    if (!seikyoHaji) { akaWaza++; console.log('  ✓ ' + na + ' … ★穴を 開けたら 通った＝赤（門は 効く）★'); }
    else { console.log('  ✗ ' + na + ' … ★穴を 開けたのに 拒まれた＝門が 緩い（赤に ならない）★'); }
    return;
  }
  you++;
  if (seikyoHaji) { kobamu++; console.log('  ✓ ' + na + ' … 陽○・㋐〜㋔ ★全部 拒まれた★'); }
  else { console.log('  ✗ ' + na + ' … ★拒まれる はずが 通った★'); }
}

try {
  A = await mkEmp('ztestKagi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), AI, false);
  B = await mkEmp('ztestKagi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), BI, false);
  const bDoc = await docId(B.token);
  /* ★A に プロフィールと 申告を 先に 1回 保存★＝get_emp_profile／get_nencho_decl の 陽の 対照が
     「正しい鍵なら 中身が 返る（unauth では ない）」に なる（保存前は found=false で 陽と 区別できない） */
  await rpc('save_emp_profile', { p_token: A.token, p_device: null, p_pw: AI, p_data: { t: 1 } });
  await rpc('save_nencho_decl', { p_token: A.token, p_device: null, p_pw: AI, p_year: 2026, p_decl: { t: 1 } });

  /* 読む4本＝陽（A鍵+合言葉）／㋐㋑㋒㋓ を 拒むか。--waza は ㋑でたらめ→A本物 ／㋒B合言葉→A合言葉 */
  for (const [fn, mk] of [
    ['get_meisai', (t, pw, y) => ({ p_token: t, p_device: null, p_pw: pw })],
    ['get_emp_profile', (t, pw) => ({ p_token: t, p_device: null, p_pw: pw })],
    ['get_nencho_decl', (t, pw) => ({ p_token: t, p_device: null, p_pw: pw, p_year: 2026 })],
    ['set_meisai_consent', (t, pw) => ({ p_token: t, p_device: null, p_pw: pw })],
  ]) {
    const you1 = await rpc(fn, mk(A.token, AI));
    const youOk = !kobamareta(you1.j);                       /* 陽＝通る（拒まれない） */
    if (WAZA) {
      /* 穴を 真似る＝でたらめ鍵の 代わりに A本物、Bの合言葉の 代わりに A合言葉 */
      const h1 = await rpc(fn, mk(A.token, AI));             /* ㋑→A本物（通ってしまう）*/
      miru(fn, youOk, true, kobamareta(h1.j));
    } else {
      const r1 = await rpc(fn, mk(BAD, AI));                  /* ㋐鍵なし相当（でたらめ）*/
      const r2 = await rpc(fn, mk(A.token, BI));             /* ㋒A鍵+Bの合言葉 */
      const r3 = await rpc(fn, mk(A.token, null));           /* ㋓合言葉なし */
      miru(fn, youOk, false, kobamareta(r1.j) && kobamareta(r2.j) && kobamareta(r3.j));
    }
  }

  /* meisai_auth＝陽 found=true／㋐㋑ found=false。--waza は でたらめ鍵→A本物（found=true に なる＝穴） */
  {
    const you1 = await rpc('meisai_auth', { p_token: A.token, p_device: null });
    const youOk = you1.j && you1.j.found === true;
    if (WAZA) { const h = await rpc('meisai_auth', { p_token: A.token, p_device: null }); miru('meisai_auth', youOk, true, !(h.j && h.j.found === true)); }
    else { const r1 = await rpc('meisai_auth', { p_token: BAD, p_device: null }); miru('meisai_auth', youOk, false, (r1.j && r1.j.found === false)); }
  }

  /* meisai_verify＝陽 ok=true／㋒違う合言葉 ok=false（1回だけ・ロックさせない）。--waza は 違う合言葉→正しい（通る＝穴） */
  {
    const you1 = await rpc('meisai_verify', { p_token: A.token, p_pw: AI });
    const youOk = you1.j && you1.j.ok === true;
    if (WAZA) { const h = await rpc('meisai_verify', { p_token: A.token, p_pw: AI }); miru('meisai_verify', youOk, true, !(h.j && h.j.ok === true)); }
    else { const r1 = await rpc('meisai_verify', { p_token: A.token, p_pw: 'chigau9' }); miru('meisai_verify', youOk, false, (r1.j && r1.j.ok === false)); }
  }

  /* meisai_set_password＝B(初回コード在り)で 陽＝正しい初回コードで 印が 付く。
     ㋐でたらめ鍵 ㋒初回コードなし ㋓でたらめ初回コード → 合言葉が 付かない。決めた後は 上書き されない。
     --waza は「決めた後に 初回コードなしで 上書き」が 通る＝穴（本来 already_set で 拒む） */
  {
    const Bp = await mkEmp('ztestKagi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), null, true);
    const mae = await pwPrint(Bp.token);                      /* 合言葉なし の 印 */
    const r0 = await rpc('meisai_set_password', { p_token: BAD, p_init: INIT, p_pw: 'nusubito1' });
    const r1 = await rpc('meisai_set_password', { p_token: Bp.token, p_init: null, p_pw: 'nusubito1' });
    const r2 = await rpc('meisai_set_password', { p_token: Bp.token, p_init: 'WRONG', p_pw: 'nusubito1' });
    const naoMae = (await pwPrint(Bp.token)) === mae;         /* まだ 合言葉なし＝他人は 決められない */
    const you1 = await rpc('meisai_set_password', { p_token: Bp.token, p_init: INIT, p_pw: 'honnin12' });
    const kimeta = (await pwPrint(Bp.token)) !== mae && you1.j && you1.j.ok === true;   /* 陽＝本人が 決めた */
    const uw = await rpc('meisai_set_password', { p_token: Bp.token, p_init: INIT, p_pw: 'uwagaki2' });  /* 上書き 試み */
    const uwPrint = await pwPrint(Bp.token);
    if (WAZA) {
      /* 穴の 真似＝「他人が 合言葉を 決める」の 負の側に ★正しい 初回コード★を 渡す（別の 未設定 Cp で）
         ⇒ 合言葉が 付く＝「まだ 合言葉なし」が 偽＝赤（門が 効けば 捕まる） */
      const Cp = await mkEmp('ztestKagi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), null, true);
      const cMae = await pwPrint(Cp.token);
      await rpc('meisai_set_password', { p_token: Cp.token, p_init: INIT, p_pw: 'anadake1' });
      const cNaoNashi = (await pwPrint(Cp.token)) === cMae;   /* 正しい初回コードで 付いたら 偽 */
      miru('meisai_set_password', kimeta, true, cNaoNashi);
      await rmEmp(Cp);
    } else miru('meisai_set_password', kimeta, false,
      kobamareta(r0.j) && kobamareta(r1.j) && kobamareta(r2.j) && naoMae
      && (uw.j && uw.j.ok === false) && uwPrint === (await pwPrint(Bp.token)));
    await rmEmp(Bp);
  }

  /* mark_meisai_opened＝㋔A鍵+Bの紙id → B の opened_at が 前後とも 空（他人の 紙に 手が 届かない）
     ★--waza では 数えない★＝倉庫を 壊さずに「A鍵で Bの紙を 既読に する」穴を 真似る 道が 無いから（開けられない 穴は 赤の 対象外） */
  if (bDoc && !WAZA) {
    const b0 = (await sql('select opened_at from kyuyo.pay_meisai_docs where id=' + qs(bDoc)))[0] || {};
    await rpc('mark_meisai_opened', { p_token: A.token, p_id: bDoc, p_device: null, p_pw: AI });
    const b1 = (await sql('select opened_at from kyuyo.pay_meisai_docs where id=' + qs(bDoc)))[0] || {};
    miru('mark_meisai_opened(㋔)', true, false, !b0.opened_at && !b1.opened_at);
  }

  /* 書く2本＝陽で 書けて（A の 行 0→1）／㋐㋒違う鍵で 変わらない */
  for (const [fn, tbl, mk] of [
    ['save_emp_profile', 'pay_emp_profile', (t, pw) => ({ p_token: t, p_device: null, p_pw: pw, p_data: { t: 1 } })],
    ['save_nencho_decl', 'pay_nencho_decl', (t, pw) => ({ p_token: t, p_device: null, p_pw: pw, p_year: 2026, p_decl: { t: 1 } })],
  ]) {
    const mae = await rowCnt(A.token, tbl);
    const you1 = await rpc(fn, mk(A.token, AI));
    const ato1 = await rowCnt(A.token, tbl);
    const youOk = you1.j && you1.j.ok === true && ato1 !== mae;   /* 陽＝書けた（数か 時刻が 変わった）*/
    if (WAZA) { const h = await rpc(fn, mk(A.token, AI)); const ato2 = await rowCnt(A.token, tbl); miru(fn, youOk, true, ato2 === ato1); }  /* 穴の 真似＝負の側に 正しい鍵→書けて ato 変わる→「変わらない」が 偽→赤 */
    else {
      await rpc(fn, mk(BAD, AI));
      await rpc(fn, mk(A.token, BI));
      const ato2 = await rowCnt(A.token, tbl);
      miru(fn, youOk, false, ato2 === ato1);                      /* 違う鍵で 変わらない */
    }
  }

  /* ロック＝C で 単独・最後（違う合言葉 5回で locked／ロック後は 正しい合言葉でも locked） */
  if (!WAZA) {
    C = await mkEmp('ztestKagi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), AI, false);
    let lockedAt = -1;
    for (let i = 1; i <= 6; i++) { const r = await rpc('meisai_verify', { p_token: C.token, p_pw: 'x' + i }); if (r.j && r.j.locked === true && lockedAt < 0) lockedAt = i; }
    const after = await rpc('meisai_verify', { p_token: C.token, p_pw: AI });
    const lockOk = lockedAt === 5 && after.j && after.j.locked === true;
    you++; if (lockOk) { kobamu++; console.log('  ✓ ロック … ★5回目で locked・ロック後は 正しい合言葉でも locked★'); }
    else { console.log('  ✗ ロック … 5回目で 止まらない か ロック後に 入れた（' + lockedAt + '回目・after ' + JSON.stringify(after.j) + '）'); }
  }
} catch (e) {
  console.log('  ✗ ★途中で 止まった★ … ' + String(e && e.message || e).slice(0, 140));
  mi++; miList.push('例外');
} finally {
  await rmEmp(A); await rmEmp(B); await rmEmp(C);
  try { const r = await sql("select count(*) as n from kyuyo.pay_meisai_pub p join kyuyo.pay_employees e on e.id=p.employee_id where e.data->>'name' like 'ztestKagi-%'"); console.log('  片づけ … 残った ztestKagi … ' + ((r[0] || {}).n) + '人'); } catch (x) {}
}

if (WAZA) {
  console.log('\n★わざと 穴を 開けた ' + wazaKai + '本／赤に なった ' + akaWaza + '本★（★開けた 数＝赤の 数 なら 門は 効く★）');
  const ng = (akaWaza !== wazaKai) ? 1 : 0;
  console.log(ng ? '  ✗ ★開けた 数と 赤の 数が 違う＝門に 穴★' : '  ✓ ★開けた 穴は 全部 赤に なった★');
  process.exit(ng ? 1 : 0);
}
console.log('\n陽が 通った ' + you + '本／㋐〜㋔が 拒まれた ' + kobamu + '本／未測定 ' + mi + '本' + (miList.length ? '（' + miList.join('、') + '）' : ''));
/* ★未測定が 在れば 止める（終わり値 非0）＝陽が 通らない＝呼び方が 合っていない★／拒めなかった 本が 在っても 止める */
process.exit((mi > 0 || kobamu !== you) ? 1 : 0);
