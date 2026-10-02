/* silent-catch.mjs — ★黙って消える所を数える★（合計・金額を作る所だけ取り出す）
 * =============================================================================
 * なぜ要るか（指示役 2026-08-21／前科）:
 *   ★#ERROR より「合計が黙って小さくなる」方が怖い★。
 *   527,000 が 186,000 になった型＝★読めなかった物を 0 にして そのまま足した★。
 *   だから「何もしない catch」を ★お金を作る所★に絞って数え、
 *   ★①0を返す ②空を返す ③そのまま進む★ に分ける。★①を先に潰す★。
 *
 * 使い方:
 *   node scripts/silent-catch.mjs            … 数えて出す
 *   node scripts/silent-catch.mjs --list     … 1件ずつ出す
 *   node scripts/silent-catch.mjs --check    … ★お金の所で「0を返す」が0件か★（1件でも赤）
 *   node scripts/silent-catch.mjs --self-test … わざと1件 戻したら赤になるか
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

/* ★見るファイル＝入口から辿って お金に関わる物を全部★（実物のパスで書く）
   ★書いた名前が無ければ赤★＝黙って飛ばすと「見ていないのに0件」になる（2026-08-21 に踏んだ） */
const FILES = [
  'kyuyo/js/app.js', 'kyuyo/js/store.js', 'kyuyo/js/render.js', 'kyuyo/js/meisai.js',
  'kyuyo/lib/payroll-monthly.js', 'kyuyo/lib/zengin.js', 'kyuyo/lib/pay-parse.js',
  'seikyu/js/seikyu-app.js', 'seikyu/js/seikyu-store.js', 'seikyu/js/seikyu-out.js',
  'seikyu/lib/seikyu-tax.js', 'seikyu/lib/seikyu-doc.js', 'seikyu/lib/seikyu-gensen.js',
  'seikyu/lib/seikyu-carry.js', 'seikyu/lib/seikyu-cols.js', 'seikyu/lib/seikyu-paper.js',
  'seikyu/lib/seikyu-aoa.js', 'seikyu/lib/seikyu-book.js', 'seikyu/lib/seikyu-name.js',
  'seikyu/lib/seikyu-templates.js', 'seikyu/lib/seikyu-partner-ask.js',
  'js/suite-data.js', 'js/hub.js',
];
{
  const missing = FILES.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) {
    console.error('★書いてあるのに 無いファイル★ … ' + missing.join(' , '));
    console.error('  黙って飛ばすと「見ていないのに0件」になります。名前を直してください。');
    process.exit(2);
  }
}

/* お金・合計を作る所の目印（この字が 近くに在れば「お金の所」） */
const MONEY = /合計|金額|支給|控除|税|賃金|給与|net\b|total|Total|amount|yen|kingaku|shikyu|kojo|grandTotal|subtotal/;

/* catch の中身を取り出す（釣り合った } まで） */
function catches(src) {
  const out = [];
  const rx = /catch\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = rx.exec(src))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    out.push({ at: m.index, body: src.slice(m.index + m[0].length, i - 1), end: i });
  }
  return out;
}

/* ★約束の受け皿★ .catch(function(){ … }) も数える
   （2026-08-21：`catch (e) {` の形しか見ておらず ★1件も数えていなかった★） */
function promiseCatches(src) {
  const out = [];
  const rx = /\.catch\(\s*function\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = rx.exec(src))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    out.push({ at: m.index, body: src.slice(m.index + m[0].length, i - 1), end: i, promise: true });
  }
  /* 短い書き方 .catch(() => …) も見る */
  const rx2 = /\.catch\(\s*\(\s*[^)]*\)\s*=>\s*([^),;]+)/g;
  let m2;
  while ((m2 = rx2.exec(src))) out.push({ at: m2.index, body: 'return ' + m2[1].trim(), end: rx2.lastIndex, promise: true });
  return out;
}

/* その catch を囲んでいる関数の名前（いちばん近い function 宣言） */
function ownerOf(src, at) {
  const head = src.slice(0, at);
  /* ★名前の付け方は2通り★ function foo(){} と Store.foo = function(){} ／ var foo = function(){}
     後者を拾えないと ★別の関数の名前が付いて 一覧と噛み合わない★（2026-08-21 に実際に起きた） */
  const rx2 = /function\s+([A-Za-z_$][\w$]*)\s*\(|(?:^|[\s;{])(?:var\s+|[A-Za-z_$][\w$]*\.)([A-Za-z_$][\w$]*)\s*=\s*function\s*\(/g;
  const m = [...head.matchAll(rx2)].pop();
  return m ? (m[1] || m[2]) : '(名前なし)';
}

const rows = [];
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const c of catches(src).concat(promiseCatches(src))) {
    const body = c.body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
    /* 近く（前後）にお金の言葉が在るか＝この catch は お金を作る所か */
    const around = src.slice(Math.max(0, c.at - 700), c.end + 200);
    const isMoney = MONEY.test(around);
    let kind;
    /* ★言ってから返す物は「黙って消える」ではない★（先に見る） */
    const tells = /console\.|throw|msg\(|box\(|setText\(|alert\(|toast\(/.test(body);
    if (tells) kind = '④知らせている';
    else if (/return\s*0\b/.test(body)) kind = '①0を返す';
    else if (/return\s*(\[\s*\]|\{\s*\}|''|""|null|undefined)\s*;?/.test(body)) kind = '②空を返す';
    else if (!body) kind = '③そのまま進む';
    else kind = '③そのまま進む';
    rows.push({ file: f, line: src.slice(0, c.at).split('\n').length, owner: ownerOf(src, c.at), money: isMoney, kind, promise: !!c.promise, body: body.slice(0, 60) });
  }
}

/* ★空を返すが これでよい物★（読んで確かめた・2026-08-21）
   ここに無い「空を返す」が出たら赤＝★気づかないうちに もう1件★を止める。
   ★戻す条件★＝その所が お金の合計に入るようになった日（その時は言うか止める）。 */
const EMPTY_OK = {
  /* ── お金・公開に関わるが これでよい物（読んで確かめた） ── */
  qrSvg: 'QRの絵が作れない時。★お金ではない★（リンクは字でも出している）',
  csvMojiYomu: 'UTF-8 でも Shift-JIS でも 読めない 紙。★空を返すと 取込は 「空のCSVです」と 出して 断る★（kintai-csv.js:73／app.js:2215 で 実測）＝★黙って 小さくならない★。戻す条件＝空の 時に 断らずに 進む 作りに した日。',
  getStatutory: '雲につながっていない時。★内蔵の表を使う★という設計（空＝雲に無い、ではない）',
  currentGensen: '税が計算できない時。★0にしない＝null のまま渡す★（紙に「未確認」と出る）／失敗は recalc が画面に言う',
  currentCarry: '同上（繰越）。★入金が読めていない時は null のまま★＝0にしない',
  renderNenView: '★読めなかった時は null を返し、_readFail に積んで あとで画面に言う★（0件と混ぜない）。戻す条件＝言うのをやめる日',
  framePageCount: '下絵が読めない時 0枚。★0枚だと印刷ボタンが押せない★（押して確かめた・見張り⑥）。戻す条件＝0枚でも押せる作りにした日',
  /* ── 「無い」が正しい物（お金ではない） ── */
  readList: '★使えない端末＝本当に空★／★壊れている＝書き込みを止める★に作り分け済み（2026-08-21）',
  uid: 'ログインしていない時は null（誰でもない）。★倉庫は uid が無ければ書かない★',
  me: '同上（ログインしていない）',
  attempt: '同上（認証の やり直し）',
  ymLabel: 'URLの合言葉・端末の記憶が読めない時は null。★中身は1バイトも出さない★のが正しい',
  oops: '同上（URLの合言葉・端末の記憶を読む所。すぐ上に知らせの関数が在るので この名前で出る）★中身は1バイトも出さない★',
};

const money = rows.filter((r) => r.money);
const byKind = {};
money.forEach((r) => { byKind[r.kind] = (byKind[r.kind] || 0) + 1; });
const zero = money.filter((r) => r.kind === '①0を返す');
/* ★お金の言葉で絞らない★（2026-08-21：絞ったせいで 年末調整の申告・公開ずみ明細・倉庫の読みが漏れた）
   空や0を返す受け皿は ★全部★ 出して、残すなら理由を書く。 */
const emptyAll = rows.filter((r) => r.kind === '②空を返す' || r.kind === '①0を返す');
const emptyBad = emptyAll.filter((r) => !EMPTY_OK[r.owner]);
const emptyOk = emptyAll.filter((r) => EMPTY_OK[r.owner]);

/* ★外へ出す呼び出しは ★呼んでいる場所ごとに★ 失敗の受け皿を持つ★
   （2026-08-21 夜：listMeisaiPub は3か所から呼ばれていて、受け皿は1か所だけだった＝
     ★1か所 直して「直した」と言っていた★） */
function statementAt(src, at) {
  /* その呼び出しを含む1文を取り出す（( ) { } の釣り合いを見て ; まで） */
  let i = at, par = 0, bra = 0;
  const limit = Math.min(src.length, at + 4000);
  while (i < limit) {
    const ch = src[i];
    if (ch === '(') par++;
    else if (ch === ')') par--;
    else if (ch === '{') bra++;
    else if (ch === '}') bra--;
    else if (ch === ';' && par <= 0 && bra <= 0) { i++; break; }
    i++;
  }
  return src.slice(at, i);
}
/* ★try/catch も 受け皿として数える★（2026-08-28 に足した）
   前は ★`.catch(` だけ★を受け皿と見ていた。ところが
   ★同期で投げる呼び出し（例: SuiteData.create()）には `.catch` を付けられない★ので、
   ★正しく try/catch で受けているのに 赤★になった＝★見張りを避ける書き方を誘発する★。
   ⇒ 呼び出しが ★try { … } catch の中に居る★なら 受け皿が在ると数える。
   ★見る範囲は 狭く決め打ち★（前へ800字・後ろへ400字）＝
   遠くの try を拾って ★受け皿が無いのに緑★にしない為。 */
export function inTryCatch(src, at, stLen) {
  const from = Math.max(0, at - 800);
  const before = src.slice(from, at);
  const t = before.lastIndexOf('try');
  if (t < 0 || !/^try\s*\{/.test(before.slice(t))) return false;
  /* try { から 呼び出しまでの間で その try が もう閉じていないか（釣り合いで見る） */
  let bal = 0;
  for (const ch of before.slice(t)) { if (ch === '{') bal++; else if (ch === '}') bal--; }
  if (bal <= 0) return false;                       // すでに閉じている＝この呼び出しは try の外
  const after = src.slice(at + stLen, at + stLen + 400);
  return /\}\s*catch\s*\(/.test(after);
}

/* ★★★覚書（コメント）を 外して から 探す★★★（2026-09-28）
   ★なぜ 要るか（★2回 踏んだ★）★
     2026-09-27 … 私の 覚書に `` `Store.ooiNoKazu()` `` と 書いたら
        ★この 門が それを ★本物の 呼び★ と 数えて 赤に した★
     2026-09-28 … 同じ 型を もう 一度（覚書の 中の `Store.savePayslip(`）
     ⇒ ★★1度目は ★私が 字を 変えて★ 済ませました＝★門は 直って いない★★★
     ⇒ ★★＝『紙に した』は『効いて いる』の 証しに ならない★★
     ⇒ ★★＝★道具に 持たせる★★（記憶の 決まり）
   ★やり方★ … ★覚書の 中身を ★空白に 置き換える★（★長さと 改行は そのまま★）
     ⇒ ★★行番号も 文の 切れ目も 1つも ずれません★★
   ★★おまけ★★ … ★覚書の 中に だけ 書いた `.catch(` も 消えます★
     ＝★★『覚書に 受け皿を 書いて 緑』という ★偽の 緑★も 同時に 閉まります★★
   ★弱い 所（★先に 書く★）★
     ・★字の 中（`'…'` `"…"` `` `…` ``）は 外しません★＝★字に 呼びを 書けば 数えます★（★安全側★）
     ・★正規表現の 中の `//` `/*` は 見分けません★
       ⇒ ★だから ★長さと 改行の 数が 変わって いない事★を 毎回 確かめます★
       ⇒ ★＋『覚書で 落ちた 数』を 出します★（★急に 増えたら 人が 気づける★） */
/* ★★正規表現を 見分ける★★（2026-10-02・指示役引き継ぎ ★7）
   ★穴★ … 正規表現の 中の 引用符を「字の 始まり」と 読み、次の 引用符まで 飲んでいた
     ⇒ ★その 先の 覚書が 剥がれない★（実測 app.js … 剥がせた 覚書 621字／本当は 70,806字）
     ⇒ 覚書の 中の 呼びの 字（app.js:6406）を ★本物の 呼び★と 数えていた
   ★見分け方★ … 直前の 意味の 在る 字が 演算子・開き括弧・区切り か、return などの 言葉 か、頭 なら ★正規表現★
     ／++ と -- の 後、名前・数・閉じ括弧の 後は ★割り算★
   ★知っている 穴（★緩めない・自己確認に 名前で 載せる★）★ … 閉じ丸括弧の 後の 正規表現（if(a) の 直後 など）は 割り算と 読む
     （10-02 に 23本で 数えた＝閉じ丸括弧の 直後の スラッシュは 24個とも 割り算／正規表現 0個）
   ★本物を 消して いない 証し★ … 剥がした 字を ★毎回 node --check に 通す★（下の 走査）＝転べば 赤 */
const RX_MAE_JI = /[(,=:\[!&|?{};+\-*%<>~^]/;
const RX_MAE_KOTOBA = /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;
function seikiHyougenKa(out) {
  let k = out.length - 1;
  while (k >= 0 && /\s/.test(out[k])) k--;
  if (k < 0) return true;
  const mae = out.slice(Math.max(0, k - 11), k + 1);
  if (mae.endsWith('++') || mae.endsWith('--')) return false;
  return RX_MAE_JI.test(out[k]) || RX_MAE_KOTOBA.test(mae);
}
export function oboegakiWoKesu(src) {
  const n = src.length;
  let out = '', i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {                     /* ★行の 覚書★ */
      let j = i; while (j < n && src[j] !== '\n') j++;
      out += ' '.repeat(j - i); i = j; continue;
    }
    if (c === '/' && d === '*') {                     /* ★囲みの 覚書★ */
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      /* ★改行は 残す★＝行番号を ずらさない */
      for (let k = i; k < j; k++) out += (src[k] === '\n' ? '\n' : ' ');
      i = j; continue;
    }
    if (c === '/' && seikiHyougenKa(out)) {           /* ★正規表現★＝字の まま 写す（中の 引用符を 字と 読まない） */
      let j = i + 1, kakko = false, toji = false;
      while (j < n && src[j] !== '\n') {              /* ★改行で 打ち切る★＝割り算の 見間違いで 遠くまで 飲まない */
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') kakko = true;
        else if (src[j] === ']') kakko = false;
        else if (src[j] === '/' && !kakko) { toji = true; j++; break; }
        j++;
      }
      if (toji) {
        while (j < n && /[a-z]/i.test(src[j])) j++;   /* 旗（g i m など） */
        out += src.slice(i, j); i = j; continue;
      }
    }
    if (c === "'" || c === '"' || c === '`') {        /* ★字は そのまま★（外しません） */
      const q = c; let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      out += src.slice(i, j); i = j; continue;
    }
    out += c; i++;
  }
  return out;
}

/* 倉庫（外）を呼ぶ所。約束を返す物だけ見る */
const OUT_RX = /\b(?:Store|suite|SD|S\.store)\.([A-Za-z_$][\w$]*)\s*\(/g;
const OUT_SKIP = new Set(['getUser', 'getSession']);   /* 約束を返さない・見ても意味が無い物 */
const calls = [];
const kouboSumi = new Set();   /* ★構文を 確かめ済みの ファイル★ */
let oboegakiDeOchita = 0;   /* ★覚書の 中だったので 数えなかった 所★（★急に 増えたら 人が 気づける★） */
for (const f of FILES) {
  const nama = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const src = oboegakiWoKesu(nama);
  /* ★★長さと 改行が 1つも 変わって いない事を 毎回 確かめる★★
     ＝★正規表現の 中の `//` を 覚書と 見間違えて ★本物の コードを 消す★のを 防ぐ★
     ⇒ ★消したら ★偽の 緑★に なる＝一番 危ない★ */
  const gyo = (s) => s.split('\n').length;
  if (src.length !== nama.length || gyo(src) !== gyo(nama)) {
    console.error('★★覚書を 外したら 長さか 行数が 変わりました＝★数えません★★ … ' + f
      + '（字 ' + nama.length + '→' + src.length + ' ／ 行 ' + gyo(nama) + '→' + gyo(src) + '）');
    process.exit(1);
  }
  /* ★★剥がした 字が まだ 構文として 通るか★★（2026-10-02・指示役）
     ＝★覚書 以外（本物の コード）を 空白に したら ここで 転ぶ★＝剥がしが 本物を 消した 日に その場で 止まる
     （長さと 行数が 同じ だけ では 分からない＝空白に 置き換えても 長さは 変わらない） */
  if (!kouboSumi.has(f)) {
    const tmp = path.join(os.tmpdir(), 'silent-catch-hagashi-' + process.pid + '-' + path.basename(f));
    fs.writeFileSync(tmp, src);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (e) {
      console.error('★★覚書を 剥がしたら 構文が 壊れました＝★本物の コードを 消した★★★ … ' + f);
      console.error('  ' + String(e.stderr || e.message).split('\n').slice(0, 4).join(' | ').slice(0, 300));
      process.exit(1);
    } finally { try { fs.unlinkSync(tmp); } catch (e2) { console.error('  （剥がした 字の 一時ファイルを 消せません … ' + tmp + '）'); } }
    kouboSumi.add(f);
  }
  /* ★覚書の 中に 在った 呼びの 数★（★出しに 出す★） */
  { let a = 0, b = 0, mm;
    OUT_RX.lastIndex = 0; while ((mm = OUT_RX.exec(nama))) a++;
    OUT_RX.lastIndex = 0; while ((mm = OUT_RX.exec(src))) b++;
    oboegakiDeOchita += (a - b); }
  let m;
  OUT_RX.lastIndex = 0;
  while ((m = OUT_RX.exec(src))) {
    const name = m[1];
    if (OUT_SKIP.has(name)) continue;
    const st = statementAt(src, m.index);
    /* 約束の道に乗っている物だけ（.then / .catch / await / return が在る）＝呼びっぱなしを見る */
    const isPromise = /\.then\(|\.catch\(|await\s|return\s/.test(st) || /\.then\(/.test(src.slice(m.index, m.index + 400));
    if (!isPromise) continue;
    calls.push({
      file: f, line: src.slice(0, m.index).split('\n').length, name,
      caught: /\.catch\(/.test(st) || inTryCatch(src, m.index, st.length),
    });
  }
}
const noCatch = calls.filter((c) => !c.caught).map((c) => c.file + ':' + c.line + '  Store.' + c.name + '(');
/* ★1か所だけ直っている関数★ を数える */
const byName = {};
calls.forEach((c) => {
  byName[c.name] = byName[c.name] || { all: 0, ok: 0 };
  byName[c.name].all++;
  if (c.caught) byName[c.name].ok++;
});
const halfDone = Object.keys(byName).filter((k) => byName[k].ok > 0 && byName[k].ok < byName[k].all);

if (process.argv.includes('--list')) {
  console.log('\n[お金を作る所の catch] ' + money.length + '件');
  money.forEach((r) => console.log('  ' + r.kind + '  ' + r.file + ':' + r.line + '  ' + r.owner + '  「' + r.body + '」'));
} else {
  console.log('\n[黙って消える所を数える]');
  console.log('  見たファイル ' + FILES.length + '本 ／ catch ぜんぶ ' + rows.length + '件');
  console.log('  ★お金・合計を作る所の catch ' + money.length + '件★（数えた所＝' + FILES.join(', ') + '）');
  console.log('  ※「0件」はいつも ★この' + FILES.length + '本の中で★ の話。ほかの所は数えていない（未測定）。');
  /* ★中身が空の catch{} の数★（「空を返す」とは別の数え方＝2通りを混ぜない） */
  const emptyBrace = rows.filter((r) => !r.body).length;
  console.log('  ★中身が空の catch{} … ' + emptyBrace + '件★（お金の所に限らない・上の分け方とは別の数）');
  ['①0を返す', '②空を返す', '③そのまま進む', '④知らせている'].forEach((k) => {
    console.log('    ' + k + ' … ' + (byKind[k] || 0) + '件');
  });
  console.log('  ★外へ出す呼び出し（呼んでいる場所ごと）… ' + calls.length + 'か所／受け皿が無い ' + noCatch.length + 'か所★');
  /* ★覚書の 中だったので 数えなかった 数★＝★急に 増えたら 人が 気づける★
     （★0 なら『覚書に 呼びの 字は 1つも 無い』／1以上 なら『在るが 数えて いない』★） */
  console.log('  ★覚書（コメント）の 中だったので 数えなかった 所 … ' + oboegakiDeOchita + 'か所★'
    + (oboegakiDeOchita ? '（★門は それを 本物の 呼びと 数えません★）' : '') + '★');
  if (noCatch.length) { console.log('  ★受け皿が無い所（1か所ずつ）★'); noCatch.forEach((x)=>console.log('    '+x)); }
  if (halfDone.length) {
    console.log('  ★1か所だけ直っている関数 … ' + halfDone.length + '本★');
    halfDone.forEach((k) => console.log('    ' + k + ' … ' + byName[k].all + 'か所のうち ' + byName[k].ok + 'か所だけ受け皿あり'));
  }
  console.log('    うち ★理由を書いて残した物★ … ' + emptyOk.length + '件／★一覧に無い物★ … ' + emptyBad.length + '件');
  if (emptyOk.length) emptyOk.forEach((r) => console.log('      残す：' + r.owner + '  … ' + EMPTY_OK[r.owner]));
  if (zero.length) {
    console.log('\n  ★①0を返す（一番 危ない）★');
    zero.forEach((r) => console.log('    ' + r.file + ':' + r.line + '  ' + r.owner));
  }
}

if (process.argv.includes('--self-test')) {
  /* わざと「0を返す catch」を1件 足したら 見つけられるか（ファイルは触らない） */
  const fake = 'function goukeiWo(){ var total=0; try{ total=x(); }catch(e){ return 0; } return total; }';
  const c = catches(fake)[0];
  const body = c.body.trim();
  const isZero = /return\s*0\b/.test(body);
  const isMoney = MONEY.test(fake);
  console.log('\n★自己確認★ わざと「合計の所で0を返す catch」を作ると … '
    + (isZero && isMoney ? '★見つけられる★' : '★見つけられない（見張りが効いていない）★'));
  let ng = (isZero && isMoney) ? 0 : 1;
  /* ★★★『覚書（コメント）を 外して から 探す』が 効いて いるか★★★（2026-09-28）
     ★なぜ 自己確認で 証すか★
       ★今の repo は 覚書の 中の 呼びが ★0か所★★（私が 字を 変えた ので）
       ⇒ ★★『0か所』は 効いて いる 証しに なりません★★（★材料が 無い★）
       ⇒ ★★＝わざと 材料を 作って 見る★★
     ★★偽の 緑を 一番 恐れます★★＝★本物の 呼びまで 消したら 受け皿が 無くても 緑★
       ⇒ ★『本物は 数える』『長さと 行数が 変わらない』を 必ず 見る★ */
  {
    const NL = String.fromCharCode(10);
    const iu = (na, ok) => { if (!ok) ng++; console.log('  ' + (ok ? '✓' : '✗') + ' ' + na + (ok ? '' : '  ★思っていたのと 違う★')); };
    const kazu = (t) => { let c = 0, mm; OUT_RX.lastIndex = 0; while ((mm = OUT_RX.exec(t))) c++; return c; };
    const honmono = 'Store.savePayslip(a).then(f).catch(g);';
    const kakoi = '/* ' + honmono + ' */';
    const gyo = '// ' + honmono;
    const ji = 'var s = ' + String.fromCharCode(39) + 'Store.savePayslip(x)' + String.fromCharCode(39) + ';';
    iu('★囲みの 覚書の 中の 呼びは 数えない★', kazu(oboegakiWoKesu(kakoi)) === 0);
    iu('★行の 覚書の 中の 呼びは 数えない★', kazu(oboegakiWoKesu(gyo)) === 0);
    iu('★★本物の 呼びは 数える（★偽の 緑に しない★）★★', kazu(oboegakiWoKesu(honmono)) === 1);
    iu('★字（クォート）の 中は 外さない＝安全側で 数える★', kazu(oboegakiWoKesu(ji)) === 1);
    const mix = kakoi + NL + honmono + NL + gyo + NL + honmono;
    iu('★★混ぜても 本物だけ 2件★★', kazu(oboegakiWoKesu(mix)) === 2);
    iu('★★長さが 変わらない★★', oboegakiWoKesu(mix).length === mix.length);
    iu('★★行数が 変わらない★★', oboegakiWoKesu(mix).split(NL).length === mix.split(NL).length);
    iu('★覚書の 中の 受け皿も 消える（★覚書で 緑に しない★）★',
      oboegakiWoKesu(kakoi).indexOf('.catch(') < 0);
    iu('★閉じて いない 囲みの 覚書でも 転ばない★', typeof oboegakiWoKesu('/* ' + honmono) === 'string');
    /* ★★正規表現の 見分け★★（2026-10-02・★7）＝★直す 前の 形では ①③ が 赤（10-02 実測・②④⑤⑥ は 前の 形でも たまたま 通る）★ */
    const Q = String.fromCharCode(39), BQ = String.fromCharCode(96), BS = String.fromCharCode(92);
    const kakoiNi = '/* ' + honmono + ' */';
    iu('★① 引用符を 含む 正規表現の 後ろの 覚書が 剥がれる（本物 1）★',
      kazu(oboegakiWoKesu('var r=/' + Q + '/;' + NL + kakoiNi + NL + honmono)) === 1);
    iu('★② 割り算を 正規表現と 見違えない（a = b / c; の 後ろの 覚書が 剥がれる）★',
      kazu(oboegakiWoKesu('a = b / c; ' + kakoiNi)) === 0);
    iu('★③ 正規表現の [ ] の 中の / で 閉じない★',
      kazu(oboegakiWoKesu('var r=/[/]' + Q + '/;' + NL + kakoiNi)) === 0);
    iu('★④ テンプレート字の ${ } の 中に 引用符と 覚書の 始まりが 在っても 後ろの 覚書が 剥がれる★',
      kazu(oboegakiWoKesu('var t=' + BQ + 'a${ "/*" }b' + BQ + '; ' + kakoiNi)) === 0);
    const rxKakoi = 'var r=/' + BS + '/' + BS + '*/; ' + kakoiNi;
    const rxDeta = oboegakiWoKesu(rxKakoi);
    iu('★⑤ 正規表現の 中に 覚書の 始まりの 字が 在っても 正規表現は 残り 覚書は 剥がれる★',
      kazu(rxDeta) === 0 && rxDeta.indexOf('/' + BS + '/' + BS + '*/') === 6);
    iu('★⑥ ++ の 後の / は 割り算（x++ / 2 の 後ろの 覚書が 剥がれる）★',
      kazu(oboegakiWoKesu('x++ / 2 ' + kakoiNi)) === 0);
    /* ★★知っている 穴（★緩めない・名前で 載せる★）★★ … 閉じ丸括弧の 直後の 正規表現は 割り算と 読む
       ＝if(a) の 直後に 引用符入りの 正規表現が 来ると 後ろの 覚書が 剥がれない
       ★今の 23本に その 形は 0個★（10-02 に 数えた＝閉じ丸括弧の 直後の スラッシュ 24個とも 割り算）
       ★この 行が「剥がれる」に 変わったら 誰かが 穴を 塞いだ★＝その日に 穴の 覚書を 消す */
    {
      const ana = kazu(oboegakiWoKesu('if(a) /' + Q + '/.test(b);' + NL + kakoiNi));
      console.log('  ' + (ana === 1 ? '△' : '★') + ' ★知っている 穴★ if(a) の 直後の 引用符入り 正規表現の 後ろの 覚書 … '
        + (ana === 1 ? '剥がれない（穴の まま・今の 23本に この 形は 0個）' : '★剥がれた＝穴が 塞がった？ 覚書を 見直す★'));
    }
  }
  console.log(ng ? '★自己確認 ' + ng + '件 おかしい★' : '  ★★自己確認 ぜんぶ 思った通り★★');
  process.exit(ng ? 1 : 0);
}

if (process.argv.includes('--check')) {
  if (noCatch.length) {
    console.error('\n★外へ出す呼び出しに 失敗の受け皿が無い（' + noCatch.length + '件）★');
    noCatch.forEach((x) => console.error('   ' + x));
    console.error('  失敗しても 誰にも伝わりません。★言ってから 投げ直す★を付けてください。');
    process.exit(1);
  }
  if (emptyBad.length) {
    console.error('\n★一覧に無い「空を返す」catch が ' + emptyBad.length + '件★');
    emptyBad.forEach((r) => console.error('   ' + r.file + ':' + r.line + '  ' + r.owner));
    console.error('  空も 合計が静かに小さくなります。★言うか 止めるか★／これでよいなら EMPTY_OK に理由を書いてください。');
    process.exit(1);
  }
  if (zero.length) {
    console.error('\n★お金を作る所で「黙って0を返す」catch が ' + zero.length + '件★');
    console.error('  0にして進むと ★合計が黙って小さくなる★（527,000 が 186,000 になった型）。');
    console.error('  「分かりません」と出すか、止めてください。');
    process.exit(1);
  }
  console.log('\n  お金を作る所で「黙って0を返す」catch は 0件。緑。');
}
