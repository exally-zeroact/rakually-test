/* ★言葉を消したら「画面に出る字で0件」まで数える★（指示役 2026-08-21 ⑦）
 *
 *   なぜ要るか … 同じ語を ★3回とも「1か所 直して 0件」と思い込んだ★（「代行」）。
 *   目で1件、指示役が2件目、また指示役が3件目。★grep を1回 打っただけで「0件」と言っていた★。
 *   ⇒ 語ごとに ★画面に出る字での件数★ を数えて、0でなければ赤にする。
 *
 *   数える所 …「覚書（コメント）を取り除いた あとの字」＝★客に届きうる字★
 *     ・.js … // と / * * / を ★文字列の中かどうかを見ながら★ 取り除く
 *             （'https://…' の // を消すと 別の穴になるので 手で解く）
 *             日本語は コードにならないので、覚書を取り除いた後に残る和語は 文字列の中＝画面に出る字。
 *     ・.html … <!-- --> を取り除き、<script> の中は 上の .js と同じ扱い
 *   数えない所 … 覚書の中（例「代行請求の『全額／残額／半額』から採った」）＝画面に出ない。
 *
 *   ★2026-10-07 門の堅牢化（姉妹門 kyaku-hoshi と 揃えた・taiketsu/kensan 付き）★
 *     ・(穴①) HTMLの タグを外した 地の文の 業者名(VENDOR)も 数える（前は 引用符リテラルだけ＝タグ外本文を すり抜けた）。
 *     ・(穴②) 実体参照 &#DDD;/&#xHH; と JS \uXXXX/\u{XXXX} を 行ごと／リテラルごとに 復号してから 数える
 *            （客には その文字が 見える＝生で 書いた時と 同じ／逃がし逆斜線 \\u は 客に "\u…" が 見える＝数えない）。
 *     ・★min.js は 除外していない（kyaku-hoshi は 除外＝非対称・勝手に揃えない）★。復号は 必ず 行ごと後掛け
 *       ＝lib/xlsx.full.min.js の &#10; を blob先復号すると 行番号が ずれる（kensan 実測）ので やらない。
 *
 *   使い方: node scripts/screen-words.mjs [--list] [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoEnv } from './repo-env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

/* ★手で書いた一覧は 必ず漏れる★（2026-08-21 実際に漏れた）
   最初は「客が読む字を作っているファイル」を14本 手で書いた。そこに js/env-badge.js が無く、
   実配信を押して回ったら ★「練習用の倉庫です」★ が出た＝★見張りが 0件と言っている横で 画面に出ていた★。
   ⇒ ★一覧を手で書くのをやめて 全部の .html / .js を見る★。見ない所は 理由を書いて外す。 */
const NOSCAN = [
  { dir: 'node_modules', why: '他人の物' },
  { dir: 'tests', why: '試験＝客は読まない（試験の中の言葉まで直させない）' },
  { dir: 'test', why: '同上' },
  { dir: 'scripts', why: '道具＝客は読まない（この見張り自身の説明も ここに在る）' },
    /* ★`tools` は `scripts` と 同じ 道具なのに 抜けて いました★（2026-09-22）
       ★測った★ … ★HTML が tools/ を 読む 所 ★0件★★（scripts と 同じ）
       ⇒ ★★緩めたのでは なく ★この門の 決まり（「見ない所は 理由を書いて 外す」）を 揃えた★★ */
    { dir: 'tools', why: '道具＝客は読まない（★見立てで 外さず 数えた★＝HTML が tools/ を 読む 所 ★0件★）' },
  { dir: 'docs', why: '覚書＝客は読まない' },
  { dir: 'vendor', why: '他人の物' }, { dir: 'dist', why: '作った物' }, { dir: 'build', why: '作った物' },
];
function listFiles(root) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 6) return;
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith('.')) continue;
        if (NOSCAN.some((x) => x.dir === e.name)) continue;
        walk(p, depth + 1); continue;
      }
      if (!/\.(html?|js|mjs)$/i.test(e.name)) continue;
      out.push(path.relative(root, p).split(String.fromCharCode(92)).join('/'));
    }
  };
  walk(root, 0);
  return out.sort();
}
const FILES = listFiles(ROOT);

/* ★出してはいけない語★（＝うちの中の言葉・他アプリの名前）
   allow … 客の言葉として正しい並び（例「運転代行」＝所得税法204条の非該当の例） */
const BAD = [
  { w: '代行', why: 'うちの中の言葉（他社には「代行」の業務は無い）', allow: ['運転代行'] },
  { w: '従来', why: 'はじめて使う会社に「従来」は無い', allow: [] },
  /* ★『倉庫業』は 法令の 言葉★（2026-09-04）＝労働保険の保険料の徴収等に関する法律施行規則
     ★別表第１（労災保険率表）の 事業の種類★「倉庫業、警備業、消毒又は害虫駆除の事業又はゴルフ場の事業」。
     ★法令の 写しは 1文字も 変えない★ので、客の 言葉として 正しい 並びに 入れる（『運転代行』と 同じ 扱い）。 */
  { w: '倉庫', why: 'うちの中の言葉（客は DB を倉庫と呼ばない）', allow: ['倉庫業'] },
  /* ★明細（従業員のスマホ画面）を読んで出た語★（2026-08-21）
     従業員は「WEB交付」を知らない＝管理画面の「USERS」と同じ型。 */
  { w: 'WEB交付', why: '従業員は知らない言葉（電子交付の中の呼び方）', allow: [] },
];

/* ★この配信に無い物の名前を 客に見せない★（指示役の決まり）
   ＝★本番(rakually)だけ★ 見る語。テスト線には給与が在るので 数えない。
   2026-08-26 実測：本番へ出した直後に数えたら ★3件★ 出た。
     js/auth.js「給与・請求書も、同じ…」／js/hub.js「給与で従業員を登録すると…」／
     seikyu/js/auth.js「ホーム・給与も、同じ…」
   ＝どれも ★本番には無い画面の名前★。ソースを見て「残りは覚書」と言っていたが、
     ★覚書を取り除いてから数えたら 客の字だった★。だから ★repo ごとに 機械で数える★。 */
const BAD_PROD = [
  { w: '給与', why: 'この配信に 給与の画面が 無い＝無い物の名前を 客に見せない', allow: [] },
];
/* ★「無い物の名前」かどうかは ★実物を見て★ 決める★（2026-09-03）
   前は ★repo が 本番なら いつも 給与を 禁止★ にしていた。
   ★司さん 2026-09-03「渡せる状態にやって／URLは1本かして」＝本番に 給与を 入れる★ので、
   ★入った瞬間に この見張りが 嘘になる★（在る物の名前を「見せるな」と言う）。
   ⇒ ★kyuyo/index.html が 在るかどうかで 決める★＝repo の名前でも env でも なく ★物★を見る。
   （[[feedback_repo_name_is_not_the_environment]] と 同じ考え＝★名札ではなく 実物★） */
const HAS_KYUYO = fs.existsSync(path.join(ROOT, 'kyuyo/index.html'));
const WATCH = (repoEnv(ROOT) === 'prod' && !HAS_KYUYO) ? BAD.concat(BAD_PROD) : BAD;

/* ★業者の名前★（2026-08-21 実スクショで見つけた「保存先: Supabase（クラウド）」）
   ただし Store.mode==='supabase' のような ★中の合図★ まで赤にすると 直しようがない。
   ⇒ ★同じ文字列の中に 日本語が在る時だけ数える★＝それは 人に読ませる文だから。 */
const VENDOR = [
  { w: 'Supabase', why: '客は 倉庫の会社名を知らない' },
  { w: 'supabase', why: '同上' },
  { w: 'localStorage', why: '客は ブラウザの言葉を知らない' },
  { w: 'Vercel', why: '客は 配信の会社名を知らない' },
  { w: 'GitHub', why: '同上' },
];
const JP = /[぀-ヿ一-龯]/;

/* ★客に見える字へ復号してから数える（姉妹門 tests/kyaku-hoshi.test.mjs と 揃える・2026-10-07 門の堅牢化）★
   前は 生の字しか見ず、★実体参照 &#20195;&#34892;（＝「代行」）や JS 代 で書くと すり抜けた★（実測で reachable）。
   ・JS … \uXXXX / \u{XXXX} を その文字に。★逃がし逆斜線 \\u（客には 文字列 "\u…" が 見える＝禁句でない）は 復号しない★
     ＝先に 逃がし逆斜線 \\ を 退避してから 直す（kyaku-hoshi の decodeJs と 同じ型）。
   ・HTML … &#DDD; / &#xHH;（; は任意＝ブラウザは ;無しも 描画）を そのコードポイントの字に。
     ★一般復号（実コードポイントに戻す）なので kyaku-hoshi の 固定点向け 桁境界ガード（&#97331 を ★にしない）は 不要★
     ＝&#201950 は 97331… でなく そのまま 別のコードポイントになり 禁句と 一致しない（kensan 2026-10-07 指摘＝写すのは カーゴカルト）。
   ・名前実体（&amp; 等）は 変えない＝客にも 記号で 見えるだけで 禁句検出に 無関係。
   ★必ず 行ごと／リテラルごとに 後掛けする（blob 全体を 先に復号すると &#10; が 改行になり lib/xlsx.full.min.js で 行番号が ずれる・kensan 実測）★。 */
function cpChar(str, radix, orig) {
  const n = parseInt(str, radix);
  if (!Number.isFinite(n) || n < 0 || n > 0x10FFFF) return orig;
  try { return String.fromCodePoint(n); } catch { return orig; }
}
function decodeVisible(s) {
  const PH = String.fromCharCode(1);
  let t = String(s).replace(/\\\\/g, PH);                               /* 逃がし逆斜線を 退避（\\u… を 守る） */
  t = t.replace(/\\u\{([0-9a-fA-F]+)\}/g, (m, h) => cpChar(h, 16, m));
  t = t.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => cpChar(h, 16, m));
  t = t.split(PH).join('\\\\');                                         /* 退避を 戻す */
  t = t.replace(/&#x([0-9a-fA-F]+);?/g, (m, h) => cpChar(h, 16, m));
  t = t.replace(/&#([0-9]+);?/g, (m, d) => cpChar(d, 10, m));
  return t;
}

/* ── 覚書を取り除く（文字列の中は 消さない） ───────────────── */
function stripJsComments(src) {
  let out = '', i = 0, n = src.length;
  let q = null;      /* 今いる文字列の囲み（' " ` のどれか） */
  let last = '';     /* 直前の 空白でない字（/ が 割り算か 正規表現かを決める） */
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (q) {
      if (c === '\\') { out += c + (d || ''); i += 2; continue; }
      if (c === q) q = null;
      out += c; i++; continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; last = c; i++; continue; }
    /* ★正規表現リテラルを 文字列と間違えない★（2026-08-21 実際に間違えた）
       /['"]/ の中の ' で「文字列に入った」と思い込み、そこから先の覚書を 消さずに数えていた
       ＝★見張りが 覚書を「画面に出る字」と言う嘘★（10件のうち 8件が それ）。
       直前の字が 値を取り得ない物なら、その / は 正規表現の始まり。 */
    if (c === '/' && d !== '/' && d !== '*' && (last === '' || '(,=:[!&|?{};+-*%~^<>'.indexOf(last) >= 0 || /[\n\r]/.test(last))) {
      out += c; i++;
      let esc = false, cls = false;
      while (i < n) {
        const ch = src[i];
        out += ch; i++;
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '[') cls = true;
        else if (ch === ']') cls = false;
        else if (ch === '/' && !cls) break;
        else if (ch === '\n') break;            /* 割り算だった＝行をまたがない */
      }
      last = '/';
      continue;
    }
    if (c === '/' && d === '/') {              /* 行の覚書 */
      while (i < n && src[i] !== '\n') { out += src[i] === '\n' ? '\n' : ' '; i++; }
      continue;
    }
    if (c === '/' && d === '*') {              /* 囲みの覚書 */
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      i += 2; continue;
    }
    out += c; if (!/\s/.test(c)) last = c; i++;
  }
  return out;
}

function stripHtmlComments(src) {
  /* <!-- --> を 行を崩さずに消す */
  let out = src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  /* <script> の中は JS として覚書を消す */
  out = out.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (m, a, body, b) => a + stripJsComments(body) + b);
  return out;
}

function strip(file, src) {
  return /\.html?$/i.test(file) ? stripHtmlComments(src) : stripJsComments(src);
}

/* ── 数える ───────────────────────────────── */
function countIn(file, src) {
  const clean = strip(file, src);
  const lines = clean.split('\n');
  const hits = [];
  /* ★人に読ませる文（日本語が入っている文字列）の中の 業者名だけ 数える★ */
  const QS = String.fromCharCode(39) + String.fromCharCode(34) + String.fromCharCode(96);
  const BSL = String.fromCharCode(92);
  const litRx = new RegExp('([' + QS + '])([^' + QS + ']{1,300}?)' + BSL + '1', 'g');
  for (const m of clean.matchAll(litRx)) {
    const raw = m[2];
    const lit = decodeVisible(raw);     /* ★リテラルごとに 後掛け復号（行番号は pre-decode の clean から取る＝ズレ無し）★ */
    if (!JP.test(lit)) continue;
    const line = clean.slice(0, m.index).split(String.fromCharCode(10)).length;
    for (const v of VENDOR) {
      if (lit.indexOf(v.w) >= 0) {
        hits.push({ file, line, word: v.w, why: v.why, text: raw.trim().slice(0, 80) });
      }
    }
  }
  /* ★(穴①) HTMLの タグを外した 地の文の 業者名も 数える（2026-10-07 門の堅牢化）★
     前は VENDOR は 引用符リテラル(litRx)しか 見ず、<p>Supabaseに保存しました</p> の様な タグ外本文を すり抜けた
     （BAD語は 下の 全行走査で 拾うのに VENDOR だけ 非対称＝実測で reachable）。
     ★タグを外した 地の文だけ★を 見る＝.js の Store.mode==='supabase'（タグ外経路に 来ない）に 触れない・
     属性値は 上の litRx が 既に 見る（タグは ここで 外れて 地の文には 残らない）＝二重計上しない。JP同居ルールは 維持。 */
  if (/\.html?$/i.test(file)) {
    lines.forEach((ln, idx) => {
      const text = decodeVisible(ln.replace(/<[^>]*>/g, ' '));
      if (!JP.test(text)) return;
      for (const v of VENDOR) {
        if (text.indexOf(v.w) >= 0) hits.push({ file, line: idx + 1, word: v.w, why: v.why, text: ln.trim().slice(0, 80) });
      }
    });
  }
  for (const b of WATCH) {
    lines.forEach((ln, idx) => {
      const dln = decodeVisible(ln);     /* ★行ごとに 後掛け復号（実体参照/エスケープの禁句も 拾う・採番は idx で 固定＝行ズレ無し）★ */
      let at = -1;
      while ((at = dln.indexOf(b.w, at + 1)) >= 0) {
        /* 客の言葉として正しい並びなら 数えない（復号後の行で 揃えて 照合） */
        if (b.allow.some((a) => {
          const p = a.indexOf(b.w);
          return dln.slice(at - p, at - p + a.length) === a;
        })) continue;
        hits.push({ file, line: idx + 1, word: b.w, why: b.why, text: ln.trim().slice(0, 80) });
      }
    });
  }
  return hits;
}

function run(root, files, label) {
  const hits = [];
  const missing = [];
  for (const f of files) {
    const p = path.join(root, f);
    /* ★書いた名前が無ければ 黙って飛ばさない★（飛ばすと「0件」が嘘になる） */
    if (!fs.existsSync(p)) { missing.push(f); continue; }
    hits.push(...countIn(f, fs.readFileSync(p, 'utf8')));
  }
  const per = {};
  WATCH.forEach((b) => { per[b.w] = hits.filter((h) => h.word === b.w).length; });
  const vend = hits.filter((h) => VENDOR.some((v) => v.w === h.word)).length;
  console.log('[' + label + '] 見たファイル ' + (files.length - missing.length) + '本 ／ '
    + WATCH.map((b) => b.w + ' ' + per[b.w] + '件').join(' ／ ') + ' ／ 業者の名前 ' + vend + '件');
  missing.forEach((f) => console.log('  ★書いてあるのに ファイルが無い★ ' + f));
  hits.forEach((h) => console.log('  ★画面に出る字に「' + h.word + '」★ ' + h.file + ':' + h.line + '  ' + h.text));
  return hits.length + missing.length;
}

/* ── わざと壊して 赤になるか ───────────────────── */
if (process.argv.includes('--self-test')) {
  const tmp = fs.mkdtempSync(path.join(ROOT, '.sw-'));
  const w = (name, body) => { fs.writeFileSync(path.join(tmp, name), body); return name; };
  let ng = 0;
  const must = (want, got, why) => {
    if (want !== got) { console.error('  ★自己診断 失敗★ ' + why + '（欲しい ' + want + ' / 出た ' + got + '）'); ng++; }
    else console.log('  ✓ ' + why);
  };
  try {
    console.log('[自己診断]');
    must(0, run(tmp, [w('a.js', "/* 代行請求から採った書き方 */\nvar t='こんにちは';\n")], '① 覚書の中の「代行」は数えない'), '覚書の中は数えない');
    must(1, run(tmp, [w('b.js', "var t='代行の1〜10';\n")], '② 文字列の中の「代行」は数える'), '文字列の中は数える');
    must(0, run(tmp, [w('c.js', "var t='非該当（運転代行・運送等）';\n")], '③ 運転代行は 客の言葉'), '運転代行は数えない');
    must(1, run(tmp, [w('d.js', "var u='https://a.b/c'; var t='従来どおり';\n")], '④ URLの // を覚書と間違えない'), 'URLの//で後ろを消さない');
    must(1, run(tmp, [w('e.html', '<!-- 倉庫の話 -->\n<p>倉庫が守ります</p>\n')], '⑤ HTMLの覚書は数えない・本文は数える'), 'HTMLの覚書と本文を分ける');
    must(1, run(tmp, ['ない.js'], '⑥ 書いた名前のファイルが無ければ赤'), '無いファイルを黙って飛ばさない');
    /* ★本物で わざと1件 戻して 赤になるか★ */
    const real = path.join(ROOT, 'kyuyo/js/app.js');
    const keep = fs.readFileSync(real, 'utf8');
    try {
      fs.writeFileSync(real, keep.replace('読み込んで、<b>売上や歩合', '読み込んで、代行など<b>売上や歩合'));
      must(1, run(ROOT, ['kyuyo/js/app.js'], '⑦ ★本物に1件 戻した★'), '本物に戻したら赤になる');
    } finally { fs.writeFileSync(real, keep); }
    must(0, run(ROOT, ['kyuyo/js/app.js'], '⑧ 戻した物を 元へ戻した'), '元へ戻したら緑に戻る');
    /* ★(穴①) HTMLの タグを外した 地の文の 業者名を 数える／JP同居ルールは 維持★ */
    must(1, run(tmp, [w('f.html', '<p>Supabaseに保存しました</p>\n')], '⑨ タグ外本文の業者名(Supabase)を数える'), '穴①: タグ外本文の業者名を数える');
    must(0, run(tmp, [w('g.html', '<p>Supabase saved</p>\n')], '⑩ 日本語なしなら数えない（中の合図を守る）'), '穴①: JP同居ルールを維持');
    /* ★(穴②) 実体参照/JSエスケープで 書いた 禁句も 復号して 数える（逃がし逆斜線は 数えない）★
       &#20195;&#34892; と 代行 は ともに「代行」＝BAD。 */
    must(1, run(tmp, [w('h.html', '<p>&#20195;&#34892;で送ります</p>\n')], '⑪ HTML実体参照の禁句(代行)を復号して数える'), '穴②: HTML実体参照を復号して数える');
    must(1, run(tmp, [w('i.js', "var t='\\u4ee3\\u884cで送る';\n")], '⑫ JSエスケープの禁句(代行)を復号して数える'), '穴②: JSエスケープを復号して数える');
    must(0, run(tmp, [w('j.js', "var t='\\\\u4ee3\\\\u884c';\n")], '⑬ 逃がし逆斜線 \\\\u… は 客に "\\u…" が 見える＝数えない'), '穴②: 逃がし逆斜線は復号しない');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (ng) { console.error('\n★自己診断 ' + ng + '件 失敗★'); process.exit(1); }
  console.log('\n自己診断 13件 とも 正しい');
  process.exit(0);
}

const bad = run(ROOT, FILES, 'screen-words');
if (process.argv.includes('--list')) process.exit(0);
if (bad) { console.error('\n★' + bad + '件★ 画面に出る字から消すまで 進めない'); process.exit(1); }
console.log('OK（画面に出る字に 中の言葉は 0件）');
