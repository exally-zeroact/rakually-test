/* kaisha-uwagaki-jissho.mjs — ★会社設定の 保存が 古い書きで 巻き戻るか★を 試験の倉庫で 実証する（道具・使い捨て）
 * =============================================================================
 * ★置き場★ tools/（試験では なく 道具＝tests-registered 対象外・ci.yml にも 網にも 載せない）
 * ★棚⑦（指示役と 合わせた・2026-10-03）★
 *   現状：store.js realSave は 書く前に `select updated_at`（:494）で 衝突検知するが、
 *         実際の書きは `pay_companies.upsert({...updated_at:now})`（:613）＝★条件なし★。
 *         事前SELECT と UPSERT の 間（TOCTOU）に 別の書きが 着くと 黙って 上書きし得る。
 *   問い：本当に 上書きが 起きるか（㋐2つの窓）／条件付き update だと 衝突で 止まるか。
 *
 * ★口（指示役）★ 共有の test@test.com の会社行は CI・網・他の席も 読み書きする＝そこを 書いて 戻すと
 *   同時に走る 試験に「別の端末で更新」を 起こし得る。so ★専用の口を 自分で 作る（signUp・live-roundtrip と 同じ）★。
 *   作れない（確認メール要 等）時だけ test@test.com に 落ち、★その間 網を 回さない★と 出しに 1行 添える。
 *
 * ★安全★ 試験の倉庫だけ（repoEnv==='test' 以外は 抜ける）。会社行の data は 先に 控えて 最後に 戻す。
 *   updated_at は 戻せない（戻すと 新しくなる）＝明記する。
 *
 * ★穴の 幅（指示役）★ この道具は A→B の順を ★わざと★ 作って 上書きを 出す＝「起き得る（幅は 狭い・
 *   事前SELECT が 大半を 捕まえる）」。「よく 起きる」では ない。遅らせた秒を 出しに 添える。
 *
 * 使い方:
 *   node tools/kaisha-uwagaki-jissho.mjs --mode=now           … 今の書き方（条件なし upsert）で ㋐ を 出す
 *   node tools/kaisha-uwagaki-jissho.mjs --mode=fix           … 条件付き update だと 衝突で 止まるか
 *   node tools/kaisha-uwagaki-jissho.mjs --mode=fix --seq=20  … 陽の対照（1窓で 20回 普通に 保存・偽衝突0・保存秒）
 *   --delay=NN（㋐で A の書きの後 B の書きまで 挟む ms・既定 300）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const MODE = (() => { const m = argv.find((a) => a.startsWith('--mode=')); return m ? m.slice(7) : 'now'; })();
const SEQ = (() => { const m = argv.find((a) => a.startsWith('--seq=')); const n = m ? Number(m.slice(6)) : 0; return Number.isInteger(n) && n > 0 ? n : 0; })();
const DELAY = (() => { const m = argv.find((a) => a.startsWith('--delay=')); const n = m ? Number(m.slice(8)) : 300; return Number.isFinite(n) && n >= 0 ? n : 300; })();
/* ★専用の口★（live-roundtrip と 同じ plus エイリアス＝素性が 分かる・固定の 合言葉で 作り直せる） */
const SENYOU = { email: 'exally.supoort+uwagaki-jissho@gmail.com', pass: 'Uwagaki-jissho-2026-fixed-pw' };
const KYOYU = { email: 'test@test.com', pass: 'test1234' };
const matsu = (ms) => new Promise((r) => setTimeout(r, ms));

if (MODE !== 'now' && MODE !== 'fix' && MODE !== 'noauth') { console.log('✗ --mode は now / fix / noauth'); process.exit(1); }

/* ★本番の倉庫では 走らせない★ */
{
  const { repoEnv } = await import('../scripts/repo-env.mjs').catch(() => ({ repoEnv: null }));
  let env = null; try { env = repoEnv ? repoEnv(ROOT) : null; } catch { env = null; }
  if (env !== 'test') {
    console.log('[kaisha-uwagaki-jissho] — ★test の倉庫を 指す repo では ない（' + (env || '不明') + '）＝倉庫を 触りません★');
    process.exit(0);
  }
}

const { repoSupa } = await import('../tests/repo-supa.mjs');
const { url: URL, key: ANON } = repoSupa();

/* ★口を 1つ 作る／入る★（同じ sb を 2回 呼べば 2クライアント＝同じ account_id） */
async function kuchiHiraku(cred) {
  const sb = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  let r = await sb.auth.signInWithPassword({ email: cred.email, password: cred.pass });
  if (!r.error && r.data.session) return { sb, uid: r.data.user.id };
  r = await sb.auth.signUp({ email: cred.email, password: cred.pass });
  if (!r.error && r.data.session) return { sb, uid: r.data.user.id };
  return null;   /* 入れない（確認メール要 等） */
}

/* ★専用の口を 試す→駄目なら 共有★ */
let CRED = SENYOU, SENYOU_OK = true;
let probe = await kuchiHiraku(SENYOU);
if (!probe) { CRED = KYOYU; SENYOU_OK = false; probe = await kuchiHiraku(KYOYU); }
if (!probe) { console.log('✗ 専用も共有も 入れない（確認メール要 の恐れ）'); process.exit(2); }
console.log('[kaisha-uwagaki-jissho] 接続先=' + URL + ' ／ mode=' + MODE + (SEQ ? ' ／ seq=' + SEQ : '') + ' ／ delay=' + DELAY + 'ms'
  + ' ／ 口=' + (SENYOU_OK ? '★専用（' + SENYOU.email + '）★' : '共有（test@test.com）'));
if (!SENYOU_OK) console.log('  ★★この実証は 共有の口を 使う＝走っている間 網（oshu-mae/CI/他の席の 試験）を 回さないでください★★');

async function yomu(sb, uid) {
  const r = await sb.from('pay_companies').select('data,updated_at').eq('account_id', uid).maybeSingle();
  if (r.error) throw new Error('読み不可 ' + r.error.message);
  return { data: (r.data && r.data.data) || null, ua: (r.data && r.data.updated_at) || null };
}
/* 今の書き方＝条件なし upsert（store.js:613 と 同じ形） */
async function kakuNow(sb, uid, data) {
  const now = new Date().toISOString();
  const r = await sb.from('pay_companies').upsert({ account_id: uid, data, updated_at: now }).select('updated_at').single();
  return { ok: !r.error, ua: r.data && r.data.updated_at, err: r.error && r.error.message };
}
/* 直しの形＝条件付き update（控え=倉庫が返したUAそのまま・0行なら衝突） */
async function kakuFix(sb, uid, data, cloudUA) {
  const now = new Date().toISOString();
  const r = await sb.from('pay_companies').update({ data, updated_at: now })
    .eq('account_id', uid).eq('updated_at', cloudUA).select('updated_at');
  if (r.error) return { ok: false, conflict: false, err: r.error.message };
  const rows = (r.data || []).length;
  if (rows === 0) return { ok: false, conflict: true, ua: null };
  return { ok: true, conflict: false, ua: r.data[0].updated_at };
}
const suControl = (d) => { const o = Object.assign({}, d || {}); delete o._jissho; return o; };

const A = probe;
let orig = await yomu(A.sb, A.uid);
/* 専用の口が 空なら 種を 1つ 撒いて UA を 作る（㋐は 既存の UA が 要る） */
if (orig.ua == null) { await kakuNow(A.sb, A.uid, { _jissho: { seed: true } }); orig = await yomu(A.sb, A.uid); }
const base = suControl(orig.data);
console.log('  元の会社行 … updated_at=' + orig.ua + ' ／ data鍵=' + Object.keys(base).length + '個');

let shippai = 0;
try {
  if (MODE === 'noauth') {
    /* ───── 鍵を外した呼び（ログイン切れ）で 0行を 作り「衝突でない・帯が出る理由」を 示す ───── */
    console.log('  ── noauth（鍵を外した＝ログイン切れの形）A.uid=' + A.uid + ' に 対して ──');
    const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    /* 直す前の形（条件なし upsert）＝ログイン切れの時 今 何が出るか */
    const rNow = await anon.from('pay_companies').upsert({ account_id: A.uid, data: base, updated_at: new Date().toISOString() }).select('updated_at').single();
    console.log('    [直す前 upsert] error=' + (rNow.error && rNow.error.message) + ' / rows=' + (rNow.data ? 1 : 0)
      + ' ⇒ ' + (rNow.error ? '★転ぶ＝app.js の catch で 帯（ローカルのみ保存）★' : '通った(?)'));
    /* 直しの形（条件付き update）＝0行→follow-up select→見えない→sync-check-failed（帯・no-userでない） */
    const rUpd = await anon.from('pay_companies').update({ data: base, updated_at: new Date().toISOString() })
      .eq('account_id', A.uid).eq('updated_at', orig.ua).select('updated_at');
    const updRows = (rUpd.data || []).length;
    const cur = await anon.from('pay_companies').select('updated_at').eq('account_id', A.uid).maybeSingle();
    const mieru = !!(cur.data && cur.data.updated_at);
    const han = (updRows === 0 && !mieru) ? 'sync-check-failed（帯が出る・no-userでない）'
      : (updRows === 0 && mieru && cur.data.updated_at !== orig.ua) ? 'conflict' : '不明';
    console.log('    [直し update] rows=' + updRows + ' / follow-up select 見える=' + mieru + '（err=' + (cur.error && cur.error.message) + '）');
    console.log('    ⇒ 判じ＝' + han);
    const okNotConflict = (han !== 'conflict');
    const okBanner = (han === 'sync-check-failed（帯が出る・no-userでない）');
    if (okNotConflict && okBanner) console.log('  ✓ ★0行かつ見えない＝conflictにしない AND 帯が出る理由(sync-check-failed)で返る（no-userにしない）★');
    else { console.log('  ✗ ★期待（not conflict AND 帯が出る理由）に 合わない★'); shippai++; }
  } else if (SEQ) {
    /* ───── 陽の対照：1窓で SEQ回・偽衝突0・保存秒（会社＋人）───── */
    /* ★直す前の順＝会社と人を 同時（Promise.all）／直し後の順＝会社を先に await→1行なら人★
       ⇒ 同じ回で 直す前(now)/直し後(fix) の 保存秒を 並べて 出す（指示役 ②・中央と最長） */
    const EMP = Array.from({ length: 5 }, (_, i) => ({ id: 'jissho-emp-' + i, sort: i }));
    let hikae = orig.ua, nise = 0, toshita = 0; const byo = [];
    console.log('  ── 陽の対照（mode=' + MODE + '・1窓で ' + SEQ + '回・会社＋人' + EMP.length + '＝' + (MODE === 'fix' ? '会社先→人(直し後)' : '会社と人 同時(直す前)') + '）──');
    for (let i = 1; i <= SEQ; i++) {
      const now = new Date().toISOString();
      const d = Object.assign({}, base, { _jissho: { seq: i, t: Date.now() } });
      const emps = EMP.map((e) => ({ id: e.id, account_id: A.uid, sort: e.sort, data: { name: '実証' + e.sort, seq: i }, updated_at: now }));
      const t0 = Date.now();
      let r;
      if (MODE === 'fix') {
        r = await kakuFix(A.sb, A.uid, d, hikae);
        if (r.ok) await A.sb.from('pay_employees').upsert(emps);
      } else {
        const both = await Promise.all([kakuNow(A.sb, A.uid, d), A.sb.from('pay_employees').upsert(emps)]);
        r = both[0];
      }
      byo.push(Date.now() - t0);
      if (r.conflict) { nise++; console.log('    [' + i + '] ★偽衝突（0行）★ 控え=' + hikae); }
      else if (r.ok) { toshita++; hikae = r.ua; }
      else { console.log('    [' + i + '] 書き不可 … ' + r.err); shippai++; }
    }
    byo.sort((a, b) => a - b);
    const chuou = byo[Math.floor(byo.length / 2)], saidai = byo[byo.length - 1];
    console.log('  → 通った ' + toshita + '/' + SEQ + ' ／ ★偽衝突 ' + nise + '回★ ／ ★保存の秒（会社＋人' + EMP.length + '）中央 ' + chuou + 'ms・最長 ' + saidai + 'ms★（' + (MODE === 'fix' ? '直し後＝会社先→人' : '直す前＝同時') + '）');
    if (nise > 0) { console.log('  ✗ ★偽衝突が 出た＝客が 保存できない＝本番に 出せない★'); shippai++; }
    else console.log('  ✓ ★偽衝突 0＝字形は 安全（Z と +00:00 の食い違いなし・控えは 倉庫が返したUAそのまま）★');
    try { await A.sb.from('pay_employees').delete().in('id', EMP.map((e) => e.id)); console.log('  （後始末：実証の人 ' + EMP.length + '件を 消した）'); }
    catch (e) { console.log('  ★実証の人の 消しに 失敗 … ' + ((e && e.message) || e)); shippai++; }
  } else {
    /* ───── ㋐ 2つの窓（A と B）が 同じ会社を 直す ───── */
    const B = await kuchiHiraku(CRED);
    if (!B) { console.log('✗ B の窓が 開けない'); shippai++; throw new Error('skip'); }
    const bRead = await yomu(B.sb, B.uid);
    console.log('  ── ㋐ 2つの窓（A・B とも updated_at=' + orig.ua + ' を 読んだ）── delay=' + DELAY + 'ms');
    if (bRead.ua !== orig.ua) console.log('    （注：B の読んだ UA=' + bRead.ua + ' が A と 違う＝別の書きが 既に 在る）');

    const dA = Object.assign({}, base, { _jissho: { who: 'A', t: Date.now() } });
    const rA = MODE === 'now' ? await kakuNow(A.sb, A.uid, dA) : await kakuFix(A.sb, A.uid, dA, orig.ua);
    console.log('    A が 書いた … ' + JSON.stringify(rA));
    await matsu(DELAY);
    const dB = Object.assign({}, base, { _jissho: { who: 'B', t: Date.now() } });
    const rB = MODE === 'now' ? await kakuNow(B.sb, B.uid, dB) : await kakuFix(B.sb, B.uid, dB, bRead.ua);
    console.log('    B が 書いた（A の ' + DELAY + 'ms 後・B は 古い UA ' + bRead.ua + ' 基準） … ' + JSON.stringify(rB));

    const fin = await yomu(A.sb, A.uid);
    const who = fin.data && fin.data._jissho && fin.data._jissho.who;
    console.log('    最終の会社行 … _jissho.who=' + who + ' ／ updated_at=' + fin.ua);
    if (MODE === 'now') {
      if (who === 'B') console.log('  ⇒ ★A の 書きが B に 上書きされた（巻き戻り）＝起き得る（幅は狭い・A→Bを わざと ' + DELAY + 'ms で 作った・事前SELECTが 大半を 捕まえる）★');
      else console.log('  ⇒ 上書きは 出なかった（who=' + who + '）');
    } else {
      if (rB.conflict && who === 'A') console.log('  ✓ ★条件付き update＝B は 0行で 衝突・A の 書きが 残った（上書き 防げた・遅らせ ' + DELAY + 'ms）★');
      else { console.log('  ✗ ★直しが 効いていない（who=' + who + '・B conflict=' + rB.conflict + '）★'); shippai++; }
    }
  }
} catch (e) {
  if (String((e && e.message) || e) !== 'skip') { console.log('  ✗ 実証の 途中で 転んだ … ' + ((e && e.message) || e)); shippai++; }
} finally {
  try {
    const rr = await kakuNow(A.sb, A.uid, base);
    const chk = await yomu(A.sb, A.uid);
    const nokori = chk.data && chk.data._jissho ? '★印が 残った★' : '印なし';
    console.log('  ── 後始末：data を 元に 戻した（' + nokori + '）／updated_at は 新しく ' + rr.ua + '（戻せない＝明記）');
  } catch (e) { console.log('  ★後始末に 失敗 … ' + ((e && e.message) || e) + '（印が 残っている恐れ）'); shippai++; }
}
process.exit(shippai ? 1 : 0);
