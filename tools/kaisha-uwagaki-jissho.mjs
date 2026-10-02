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

if (MODE !== 'now' && MODE !== 'fix') { console.log('✗ --mode は now か fix'); process.exit(1); }

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
  if (SEQ) {
    /* ───── 陽の対照：1窓で 普通の保存を SEQ回・偽衝突0・保存秒 ───── */
    let hikae = orig.ua, nise = 0, toshita = 0; const byo = [];
    console.log('  ── 陽の対照（mode=' + MODE + '・1窓で ' + SEQ + '回 続けて 保存）──');
    for (let i = 1; i <= SEQ; i++) {
      const d = Object.assign({}, base, { _jissho: { seq: i, t: Date.now() } });
      const t0 = Date.now();
      const r = MODE === 'fix' ? await kakuFix(A.sb, A.uid, d, hikae) : await kakuNow(A.sb, A.uid, d);
      byo.push(Date.now() - t0);
      if (r.conflict) { nise++; console.log('    [' + i + '] ★偽衝突（0行）★ 控え=' + hikae); }
      else if (r.ok) { toshita++; hikae = r.ua; }
      else { console.log('    [' + i + '] 書き不可 … ' + r.err); shippai++; }
    }
    byo.sort((a, b) => a - b);
    const chuou = byo[Math.floor(byo.length / 2)], saidai = byo[byo.length - 1];
    console.log('  → 通った ' + toshita + '/' + SEQ + ' ／ ★偽衝突 ' + nise + '回★ ／ 保存の秒 中央 ' + chuou + 'ms・最長 ' + saidai + 'ms（会社の書き1本ぶん）');
    if (nise > 0) { console.log('  ✗ ★偽衝突が 出た＝客が 保存できない＝本番に 出せない★'); shippai++; }
    else console.log('  ✓ ★偽衝突 0＝字形は 安全（Z と +00:00 の食い違いなし・控えは 倉庫が返したUAそのまま）★');
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
