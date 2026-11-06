/* print-nigenai.mjs — ★「PDF で保存」から ブラウザ印刷（window.print）へ 逃げない★（2026-11-06）
 * =============================================================================
 * ★守る事★
 *   iOS の web 頁の印刷は URL・日付が紙に付き、白紙の2枚目が出て、元の画面へ戻れない（app.js:6431・meisai.js:208 の注）。
 *   それでも前は 次の2か所が 黙って print へ落ちていた：
 *     ・Web明細 meisai.js v-pdf … 源泉徴収票は .sheet/.page でなく .gensen ＝target が null ＝★必ず 外側の頁ごと print★
 *                                  （部品が読めない時も print）
 *     ・会社 app.js b-print     … html2canvas/jsPDF が読めない時に iframe.contentWindow.print()
 *   直し＝print を抜き、止めて 字で言う。源泉徴収票は .gensen が在る時だけ body を焼く。
 * ★この歯★
 *   (a) 字の見張り … kyuyo/js と js/ の全 .js で `.print(` を数える。許すのは 紙に刷る為の QR カード（printQRCards の中）と、
 *       （会社の源泉徴収票 nenPrintGensen は 2026-11-06 に PDF へ 作り替えて 許しから外した）。名前でなく 関数の中に在るかで許す。
 *   (b) 会社 b-print を jsdom で押す … 部品を消す→ print 0・字が出る・「出した」印を付けない。
 *   (c) Web明細 v-pdf を jsdom で押す … 源泉徴収票の頁で body を焼く・print 0／部品無し→print 0・字／紙無し→print 0・字／
 *       外の字体の link（倉庫の源泉徴収票）は焼く間だけ外して済んだら戻す（返事なしで永久に止まらない）。
 *   (d) 会社の源泉徴収票 nenPrintGensen を jsdom で呼ぶ … print 0・幅794の包みを人数分焼く・計算できない人と焼けない人を数えて言う・
 *       全員だめなら共有しない・部品無しは字・見えない iframe は済んだら消す。
 * ★わざと(--waza)★ … 直す前の形を差し込み、(a) が その字を拾う事、(b)(c) が print≥1 を見る事を確かめる（歯が新旧を見分ける証し）。
 * 依存: jsdom。使い方: node kyuyo/tests/print-nigenai.mjs   ／   --waza
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(ROOT, '..');
const WAZA = process.argv.includes('--waza');
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const sleep = (win, ms) => new Promise((r) => win.setTimeout(r, ms));

/* ★直す前の形（--waza で差し込む）★ */
/* 会社の源泉徴収票の 直す前（新しい窓に書いて onload で window.print） */
const OLD_NEN = String.raw`  function nenPrintGensen(){
    var year=nenYear(); var emps=state._nenEmps||[];
    if(!emps.length){ uiAlert('対象の従業員がいません。'); return; }
    var body=emps.map(function(e){ return nenGensenHTML(e, year); }).join('');
    var html='<!doctype html><html><head><meta charset="utf-8"><title>源泉徴収票 '+year+'</title>'
      +'<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@500&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">'
      +'<style>'+gensenCss()+'</style></head><body>'+body
      +'<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print();},400);}</scr'+'ipt></body></html>';
    var w=window.open('', '_blank'); if(!w){ uiAlert('ポップアップがブロックされました。ブラウザの設定で許可してください。'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }
`;
const OLD_APP_NEW = "uiAlert('PDFを作る部品が読み込めていません。アプリ（画面）を閉じて開き直してから、もう一度押してください。'); return;";
const OLD_APP_OLD = 'try{f.contentWindow.focus();f.contentWindow.print();}catch(err){window.print();} return;';
const OLD_MEI_TGT_NEW = "var target=idoc&&(idoc.querySelector('.sheet,.page')||(idoc.querySelector('.gensen')?idoc.body:null));";
const OLD_MEI_TGT_OLD = "var target=idoc&&idoc.querySelector('.sheet,.page');";
const OLD_MEI_STOP_NEW = "if(nanika){ pdfTome(load, nanika); return; }";
const OLD_MEI_STOP_OLD = 'if(nanika){ try{ window.print(); }catch(e){} return; }';
/* 画面替えで 札を 下げる 1行（--waza で 抜く＝札が 残る 形に 戻す） */
const OLD_MEI_SHOW_NEW = "var ft=document.getElementById('m-pdf-tome'); if(ft){ ft.style.display='none'; }";
const OLD_MEI_SHOW_OLD = '';
/* 押した時の 番号の 確かめ（--waza で 抜く＝戻った後の 失敗が 一覧に 札を 出す 形） */
const OLD_MEI_BAN_NEW = 'if(ban!=null && ban!==_pdfBan) return;';
const OLD_MEI_BAN_OLD = '';
/* 外の catch（--waza で 前の「明細の上に 2.2秒」へ 戻す） */
const OLD_MEI_CATCH_NEW = ".catch(function(){ pdfTome(load, 'PDFの作成に失敗しました。時間をおいて、もう一度押してください。', banAtPress); });";
const OLD_MEI_CATCH_OLD = ".catch(function(){ if(load){ load.textContent='PDFの作成に失敗しました。時間をおいて再度お試しください。'; setTimeout(function(){ if(load)load.style.display='none'; },2200); } });";
function readSrc(rel) {
  let code = fs.readFileSync(path.join(REPO, rel), 'utf8');
  if (WAZA && /kyuyo[\\/]js[\\/]app\.js$/.test(rel)) {
    /* ★b-print の 中の 物だけを 差し替える★（同じ字が 源泉徴収票 nenPrintGensen にも 在る＝前から1つ目を 替えると 外れる） */
    const bp = code.indexOf("$('#b-print').addEventListener"), at = bp < 0 ? -1 : code.indexOf(OLD_APP_NEW, bp);
    if (at < 0) { console.log('✗ ★--waza の差し込み先（app.js b-print）が見つからない＝字がずれた★'); process.exit(1); }
    code = code.slice(0, at) + OLD_APP_OLD + code.slice(at + OLD_APP_NEW.length);
    /* 源泉徴収票 nenPrintGensen を 直す前の 新窓＋print に 戻す（(d) が print≥1 を 見る） */
    const ns = code.indexOf('  function nenPrintGensen(){'), ne = code.indexOf('  // 源泉徴収票を従業員へWeb交付');
    if (ns < 0 || ne < 0) { console.log('✗ ★--waza の差し込み先（app.js nenPrintGensen）が見つからない＝字がずれた★'); process.exit(1); }
    code = code.slice(0, ns) + OLD_NEN + code.slice(ne);
  }
  if (WAZA && /kyuyo[\\/]js[\\/]meisai\.js$/.test(rel)) {
    if (code.indexOf(OLD_MEI_TGT_NEW) < 0 || code.indexOf(OLD_MEI_STOP_NEW) < 0) { console.log('✗ ★--waza の差し込み先（meisai.js v-pdf）が見つからない＝字がずれた★'); process.exit(1); }
    for (const [k, v] of [['show の札下げ', OLD_MEI_SHOW_NEW], ['押した時の番号', OLD_MEI_BAN_NEW], ['外の catch', OLD_MEI_CATCH_NEW]]) {
      if (code.indexOf(v) < 0) { console.log('✗ ★--waza の差し込み先（meisai.js ' + k + '）が見つからない＝字がずれた★'); process.exit(1); }
    }
    code = code.replace(OLD_MEI_TGT_NEW, OLD_MEI_TGT_OLD).replace(OLD_MEI_STOP_NEW, OLD_MEI_STOP_OLD).replace(OLD_MEI_SHOW_NEW, OLD_MEI_SHOW_OLD)
      .replace(OLD_MEI_BAN_NEW, OLD_MEI_BAN_OLD).replace(OLD_MEI_CATCH_NEW, OLD_MEI_CATCH_OLD);
  }
  return code;
}

/* ── (a) 字の見張り ── */
console.log('\n[print-nigenai] (a) `.print(` を 数える（kyuyo/js・js）');
/* 関数の中身の範囲（`function 名(` から 次の 同じ深さの `}` まで）を 括弧で 数えて 取る */
function fnRange(code, name) {
  const at = code.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = code.indexOf('{', at);
  let d = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') d++;
    else if (code[i] === '}') { d--; if (d === 0) return [at, i]; }
  }
  return null;
}
// 注の中か（塊の注の中・または 行の // の後ろ）。字の中の // は 引用符の数で 見分ける（粗い＝--waza で 本物の2か所を 拾う事を 必ず見る）
function inComment(code, i) {
  const lastOpen = code.lastIndexOf('/*', i), lastClose = code.lastIndexOf('*/', i);
  if (lastOpen > lastClose) return true;
  const ls = code.lastIndexOf('\n', i) + 1, pre = code.slice(ls, i);
  const k = pre.indexOf('//');
  if (k < 0) return false;
  const before = pre.slice(0, k);
  return ((before.match(/'/g) || []).length % 2 === 0) && ((before.match(/"/g) || []).length % 2 === 0) && !/:\s*$/.test(before);
}
const YURUSU = { 'kyuyo/js/app.js': ['printQRCards'] };
const files = [];
for (const dir of ['kyuyo/js', 'js']) {
  for (const f of fs.readdirSync(path.join(REPO, dir))) if (/\.js$/.test(f)) files.push(dir + '/' + f);
}
const nige = [];
for (const rel of files) {
  const code = readSrc(rel);
  const ranges = (YURUSU[rel] || []).map((n) => { const r = fnRange(code, n); if (!r) T('許す関数 ' + n + ' が ' + rel + ' に在る', false, '名前が変わったら この表も直す'); return r; }).filter(Boolean);
  const re = /\.\s*print\s*\(/g; let m;
  while ((m = re.exec(code))) {
    if (ranges.some(([s, e]) => m.index > s && m.index < e)) continue;
    const ln = code.slice(0, m.index).split('\n').length;
    if (inComment(code, m.index)) continue;   // 注の中の字は数えない
    nige.push(rel + ':' + ln);
  }
}
if (WAZA) T('(a) --waza＝直す前の b-print の print を 拾う', nige.some((x) => /app\.js/.test(x)) && nige.some((x) => /meisai\.js/.test(x)), 'nige=' + nige.join(','));
else T('(a) ★PDF の道から print へ逃げる所が 0★', nige.length === 0, 'nige=' + nige.join(','));
T('(a) 数えた .js が 在る（空振りしない）', files.length >= 10 && files.includes('kyuyo/js/meisai.js') && files.includes('kyuyo/js/app.js'), 'files=' + files.length);

/* ── (b) 会社 b-print ── */
console.log('\n[print-nigenai] (b) 会社の 印刷 / PDF保存（部品が 読めない時）');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/\?.*$/, ''))
    .filter((s) => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  let printed = 0;
  win.print = () => { printed++; };
  for (const src of srcs) {
    const rel = path.relative(REPO, path.join(ROOT, src)).replace(/\\/g, '/');
    const el = doc.createElement('script'); el.textContent = readSrc(rel); doc.body.appendChild(el);
  }
  const btn = doc.querySelector('#b-print'), frame = doc.querySelector('#frame');
  const A = win.__PAYSLIP_TEST;
  if (!A || !btn || !frame) { console.log('✗ ★__PAYSLIP_TEST・#b-print・#frame の どれかが 無い★'); process.exit(1); }
  const idoc = frame.contentDocument || frame.contentWindow.document;
  idoc.body.innerHTML = '<div class="sheet">明細</div>';
  try { frame.contentWindow.print = () => { printed++; }; frame.contentWindow.focus = () => {}; } catch (_) {}
  if (A.state) A.state.onboardOutput = false;
  win.html2canvas = undefined; win.jspdf = undefined;
  btn.disabled = false;
  btn.dispatchEvent(new win.Event('click', { bubbles: true }));
  await sleep(win, 20);
  const mt = Array.from(doc.querySelectorAll('.ui-modal-b,.ui-modal-ov')).map((e) => e.textContent || '').join(' | ');
  if (WAZA) T('(b) --waza＝直す前は print へ 落ちる（歯が 見分ける）', printed >= 1, 'printed=' + printed);
  else {
    T('(b) ★部品が無くても print を 呼ばない★', printed === 0, 'printed=' + printed);
    T('(b) ★黙らず「部品が読み込めていません」と 言う★', /部品が読み込めていません/.test(mt), 'modal=' + mt.slice(0, 80));
    T('(b) 作れなかったのに 「出した」印（はじめかた④）を 付けない', !!A.state && A.state.onboardOutput === false, 'onboardOutput=' + (A.state && A.state.onboardOutput));
  }
}

/* ── (c) Web明細 v-pdf ── */
console.log('\n[print-nigenai] (c) Web明細の PDFで保存（源泉徴収票・部品無し・紙無し）');
{
  const html = fs.readFileSync(path.join(ROOT, 'meisai.html'), 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/kyuyo/meisai.html?t=shiken', pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  let printed = 0;
  win.print = () => { printed++; };
  /* ★t が無いと meisai.js は 配線の前で 帰る（51行）＝倉庫の答えは 返さないまま 置く（ログインの先へ 進めない） */
  win.Store = { meisaiAuth: () => new Promise(() => {}) };
  const el = doc.createElement('script'); el.textContent = readSrc('kyuyo/js/meisai.js'); doc.body.appendChild(el);
  const btn = doc.getElementById('v-pdf'), frame = doc.getElementById('frame'), load = doc.getElementById('ps-loading');
  if (!btn || !frame || !load) { console.log('✗ ★#v-pdf・#frame・#ps-loading の どれかが 無い★'); process.exit(1); }
  const idoc = frame.contentDocument || frame.contentWindow.document;
  let burned = [];
  const libs = () => {
    win.html2canvas = (t) => { burned.push(t); return Promise.resolve({ width: 794, height: 1123, toDataURL: () => 'data:image/jpeg;base64,xx' }); };
    win.jspdf = { jsPDF: function () { this.addImage = () => {}; this.output = () => 'BLOB'; this.save = () => {}; } };
  };
  win.URL.createObjectURL = () => 'blob:x'; win.URL.revokeObjectURL = () => {};
  win.open = () => ({});
  async function press(body, withLibs) {
    printed = 0; burned = []; load.textContent = ''; load.style.display = 'none';
    idoc.body.innerHTML = body;
    if (withLibs) libs(); else { win.html2canvas = undefined; win.jspdf = undefined; }
    btn.dispatchEvent(new win.Event('click', { bubbles: true }));
    await sleep(win, 20);
  }
  /* 止めの 札の 字（出ていなければ 空） */
  const fudaJi = () => { const f = doc.getElementById('m-pdf-tome'); return f && f.style.display !== 'none' ? (f.textContent || '') : ''; };
  /* ① 源泉徴収票の頁（nenGensenDoc の形＝body の中に .gensen 1つ） */
  await press('<div class="gensen"><div class="gt">給与所得の源泉徴収票</div></div>', true);
  if (WAZA) T('(c)① --waza＝直す前は 源泉徴収票で print へ 落ちる', printed >= 1 && burned.length === 0, 'printed=' + printed + ' burned=' + burned.length);
  else {
    T('(c)① ★源泉徴収票で print を 呼ばない★', printed === 0, 'printed=' + printed);
    T('(c)① ★源泉徴収票は body を 焼く（.gensen を 見落とさない）★', burned.length === 1 && burned[0] === idoc.body, 'burned=' + burned.length + ' tag=' + (burned[0] && burned[0].tagName));
  }
  /* ② 明細の頁（.sheet）＝今まで通り その紙を 焼く（誤って body にしない） */
  await press('<div class="sheet">明細</div>', true);
  T('(c)② 明細は 今まで通り .sheet を 焼く', burned.length === 1 && burned[0] && burned[0].className === 'sheet' && printed === 0, 'burned=' + burned.length + ' printed=' + printed);
  /* ⑨ 外の字体の link が在る紙（倉庫の 源泉徴収票 nenGensenDoc）＝焼く間だけ 外す・済んだら 戻す・手元の link は 触らない */
  {
    idoc.head.innerHTML = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP"><link rel="stylesheet" href="local.css">';
    printed = 0; burned = []; load.textContent = ''; load.style.display = 'none';
    idoc.body.innerHTML = '<div class="gensen">源泉</div>'; libs();
    let sotoAtBurn = -1, kokoAtBurn = -1; const h0 = win.html2canvas;
    win.html2canvas = (t) => { sotoAtBurn = idoc.querySelectorAll('link[href^="https:"]').length; kokoAtBurn = idoc.querySelectorAll('link[href="local.css"]').length; return h0(t); };
    btn.dispatchEvent(new win.Event('click', { bubbles: true }));
    await sleep(win, 30);
    if (!WAZA) {
      T('(c)⑨ ★焼く間は 外の字体の link を 外す（返事なしで 永久に 止まらない）★', sotoAtBurn === 0 && burned.length === 1, 'soto=' + sotoAtBurn + ' burned=' + burned.length);
      T('(c)⑨ 済んだら 外の link を 元へ 戻す・手元の link は 触らない', idoc.querySelectorAll('link[href^="https:"]').length === 1 && kokoAtBurn === 1 && idoc.head.firstElementChild && /^https:/.test(idoc.head.firstElementChild.getAttribute('href')), 'after=' + idoc.head.innerHTML.slice(0, 120));
    }
    idoc.head.innerHTML = '';
  }
  /* ③ 部品が無い */
  await press('<div class="sheet">明細</div>', false);
  if (WAZA) T('(c)③ --waza＝直す前は 部品無しで print へ 落ちる', printed >= 1, 'printed=' + printed);
  else {
    T('(c)③ ★部品が無くても print を 呼ばない★', printed === 0, 'printed=' + printed);
    T('(c)③ ★黙らず「部品が読み込めていません」と 言う（画面の下の 赤い札）★', /部品が読み込めていません/.test(fudaJi()), 'fuda=' + fudaJi());
    T('(c)③ 札は 画面に 貼り付く（明細の上に 重ねない）', (() => { const f = doc.getElementById('m-pdf-tome'); return !!f && f.style.position === 'fixed'; })(), 'pos=' + (doc.getElementById('m-pdf-tome') || {}).style?.position);
  }
  /* ④ 紙が無い（表示できませんでした の頁など） */
  await press('<p style="padding:16px">源泉徴収票を表示できませんでした。</p>', true);
  if (WAZA) T('(c)④ --waza＝直す前は 紙無しで print へ 落ちる', printed >= 1, 'printed=' + printed);
  else {
    T('(c)④ ★紙が無くても print を 呼ばない・何も焼かない★', printed === 0 && burned.length === 0, 'printed=' + printed + ' burned=' + burned.length);
    T('(c)④ ★黙らず「PDFにできません・会社へ」と 言う★', /PDFにできません/.test(fudaJi()) && /会社へ/.test(fudaJi()), 'fuda=' + fudaJi());
    await sleep(win, 4300);
    T('(c)④ 札は 自分では 消えない（4秒 待っても 出ている＝読めずに 消えない）', /PDFにできません/.test(fudaJi()), 'fuda=' + fudaJi());
  }
  /* ⑤ 作れる時は 前の 止めの 札を 下げる */
  await press('<div class="sheet">明細</div>', true);
  T('(c)⑤ 作れる時は 止めの 札を 下げる', fudaJi() === '' && burned.length === 1, 'fuda=' + fudaJi() + ' burned=' + burned.length);
  const back = doc.getElementById('v-back');
  const toList = async () => { try { back.dispatchEvent(new win.Event('click', { bubbles: true })); } catch (_) {} await sleep(win, 20); };
  /* ⑥ 作る途中で 転んだ（html2canvas が reject＝外の catch）＝同じ 赤い札（前は 明細の上に 2.2秒で 消えた） */
  printed = 0; idoc.body.innerHTML = '<div class="sheet">明細</div>'; libs();
  win.html2canvas = () => Promise.reject(new Error('わざと'));
  btn.dispatchEvent(new win.Event('click', { bubbles: true }));
  await sleep(win, 30);
  if (WAZA) T('(c)⑥ --waza＝前の 2.2秒の 形に 戻すと 札が 出ない（歯が 見分ける）', fudaJi() === '', 'fuda=' + fudaJi());
  else T('(c)⑥ ★作る途中の 失敗も 赤い札で 言う・print 0★', /作成に失敗しました/.test(fudaJi()) && printed === 0, 'fuda=' + fudaJi() + ' printed=' + printed);
  await toList();
  /* ⑦ 札を 出したまま 一覧へ 戻る＝札を 下げる（別の画面・別の明細に 嘘を 残さない）。札は 中の catch（jsPDF が 投げる）で 出す */
  idoc.body.innerHTML = '<div class="sheet">明細</div>'; libs();
  win.jspdf = { jsPDF: function () { throw new Error('わざと'); } };
  btn.dispatchEvent(new win.Event('click', { bubbles: true }));
  await sleep(win, 30);
  const deta7 = fudaJi();
  await toList();
  T('(c)⑦ 前提＝中の catch でも 赤い札が 出た', /作成に失敗しました/.test(deta7), 'fuda=' + deta7);
  if (WAZA) T('(c)⑦ --waza＝札を 下げる 1行を 抜くと 一覧へ 戻っても 残る（歯が 見分ける）', /作成に失敗しました/.test(fudaJi()), 'fuda=' + fudaJi());
  else T('(c)⑦ ★一覧へ 戻ったら 止めの 札を 下げる★', fudaJi() === '', 'fuda=' + fudaJi());
  /* ⑧ 押す→一覧へ 戻る→その後に 失敗＝一覧の 上に 札を 出さない（押した時の 番号） */
  { const f = doc.getElementById('m-pdf-tome'); if (f) f.style.display = 'none'; }
  idoc.body.innerHTML = '<div class="sheet">明細</div>'; libs();
  /* 焼くのは 戻った後に 終わり、その後の jsPDF が 投げる（中の catch＝--waza で 前の形に 戻さない 方の 道で 番号だけを 見る） */
  win.jspdf = { jsPDF: function () { throw new Error('わざと・戻った後'); } };
  let otosu; win.html2canvas = () => new Promise((ok) => { otosu = () => ok({ width: 794, height: 1123, toDataURL: () => 'data:image/jpeg;base64,xx' }); });
  btn.dispatchEvent(new win.Event('click', { bubbles: true }));
  await sleep(win, 10);
  await toList();
  if (otosu) otosu();
  await sleep(win, 30);
  if (WAZA) T('(c)⑧ --waza＝番号の 確かめを 抜くと 一覧に 札が 出る（歯が 見分ける）', /作成に失敗しました/.test(fudaJi()), 'fuda=' + fudaJi());
  else T('(c)⑧ ★押した後に 一覧へ 戻ってから 失敗しても 一覧に 札を 出さない★', fudaJi() === '' && !!otosu && load.style.display === 'none', 'fuda=' + fudaJi() + ' otosu=' + !!otosu + ' load=' + load.style.display);
}

/* ── (d) 会社の 源泉徴収票 nenPrintGensen ── */
console.log('\n[print-nigenai] (d) 会社の 源泉徴収票（PDF へ・print へ 逃げない）');
{
  const code = readSrc('kyuyo/js/app.js');
  const take = (n) => { const r = fnRange(code, n); if (!r) { console.log('✗ ★' + n + ' が app.js に 無い★'); process.exit(1); } return code.slice(r[0], r[1] + 1); };
  const fns = [take('gensenCss'), take('nenPrintGensen')];
  const pr = fnRange(code, 'pagesToPdf'); if (pr) fns.push(code.slice(pr[0], pr[1] + 1)); else if (!WAZA) T('(d) pagesToPdf が app.js に 在る', false);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  let printed = 0; const ji = []; const share = []; const yaku = [];
  win.print = () => { printed++; };
  win.__ji = ji;
  const el = doc.createElement('script');
  el.textContent = 'var state={}; var nenPdfBusy=false; function nenYear(){ return 2025; } function nenGensenHTML(e){ return e.kake ? "" : "<div class=\\"gensen\\">"+e.name+"</div>"; }'
    + 'function uiAlert(m){ window.__ji.push(m); } function toast(){} ' + fns.join('\n')
    + '\nwindow.__nen=function(emps){ state._nenEmps=emps; nenPrintGensen(); };'
    + '\nwindow.__p2p=(typeof pagesToPdf==="function")?pagesToPdf:null;';
  doc.body.appendChild(el);
  /* 直す前は 新しい窓に 書いて onload で print＝書かれた字に window.print が 在れば 逃げたと 数える */
  win.open = () => ({ document: { open() {}, write(h) { if (/window\.print\(\)/.test(h)) printed++; }, close() {} } });
  const libs = (failAll) => {
    win.html2canvas = (e, op) => { yaku.push({ cls: e.className, w: op && op.width, h: op && op.height }); return (failAll || /失敗/.test(e.textContent || '')) ? Promise.reject(new Error('わざと')) : Promise.resolve({ width: 794, height: 600, toDataURL: () => 'data:image/jpeg;base64,xx' }); };
    win.jspdf = { jsPDF: function () { this.addPage = () => {}; this.addImage = () => {}; this.output = () => 'BLOB'; this.save = () => {}; } };
    win.FileOut = { sharePdf: (b, name, o) => { share.push({ name, text: o && o.text }); return Promise.resolve({ how: 'share' }); } };
  };
  const reset = () => { printed = 0; ji.length = 0; share.length = 0; yaku.length = 0; };
  const waitDone = async () => { for (let k = 0; k < 80; k++) { await sleep(win, 100); if (share.length || ji.length || printed) { await sleep(win, 50); return; } } };
  const iframes = () => doc.querySelectorAll('iframe').length;
  /* ① 3人・1人は 計算できない */
  reset(); libs(false);
  win.__nen([{ name: '山田' }, { name: '佐藤', kake: true }, { name: '鈴木' }]);
  await waitDone();
  if (WAZA) T('(d)① --waza＝直す前は 源泉徴収票で print へ 落ちる（歯が 見分ける）', printed >= 1, 'printed=' + printed);
  else {
    T('(d)① ★源泉徴収票で print を 呼ばない★', printed === 0, 'printed=' + printed);
    T('(d)① 計算できた 2人分の 包み（.gwrap）を 焼く', yaku.length === 2 && yaku.every((y) => y.cls === 'gwrap'), JSON.stringify(yaku));
    T('(d)① 共有へ 1回・字と 名前は 2人', share.length === 1 && share[0].text === '源泉徴収票 2025年分 2人' && share[0].name === '源泉徴収票_2025年分_2人.pdf', JSON.stringify(share));
    T('(d)① ★計算できない 1人を 黙って 抜かない★', ji.some((m) => /⚠ 1人分/.test(m)), JSON.stringify(ji));
    T('(d)① 見えない iframe は 済んだら 消す', iframes() === 0, 'iframe=' + iframes());
  }
  if (!WAZA) {
    /* ② 1人＝名前に 様 */
    reset(); libs(false); win.__nen([{ name: '山田 太郎' }]); await waitDone();
    T('(d)② 1人なら「〇〇様」', share.length === 1 && share[0].text === '源泉徴収票 2025年分 山田 太郎様' && share[0].name === '源泉徴収票_2025年分_山田_太郎様.pdf', JSON.stringify(share));
    /* ③ 全員 焼けない＝共有しない・字で言う */
    reset(); libs(true); win.__nen([{ name: 'A' }, { name: 'B' }]); await waitDone();
    T('(d)③ ★全員 焼けなければ 共有しない・「すべて失敗」★', share.length === 0 && ji.some((m) => /すべて失敗/.test(m)) && printed === 0, JSON.stringify({ share, ji, printed }));
    T('(d)③ 失敗でも iframe は 消す', iframes() === 0, 'iframe=' + iframes());
    /* ④ 全員 計算できない */
    reset(); libs(false); win.__nen([{ name: 'A', kake: true }]); await waitDone();
    T('(d)④ 計算できる人が 0 なら 作らず 字で言う', share.length === 0 && yaku.length === 0 && ji.some((m) => /計算できませんでした/.test(m)), JSON.stringify(ji));

    /* ⑥ 一部だけ 焼けない＝⚠ と 字は 載せた人数（taiketsu 任1・任4） */
    reset(); libs(false); win.__nen([{ name: 'A' }, { name: 'B失敗' }, { name: 'C' }]); await waitDone();
    T('(d)⑥ ★一部 焼けない人を 黙って 抜かない★', ji.some((m) => /⚠ 1人分/.test(m)), JSON.stringify(ji));
    T('(d)⑥ 共有の 字は 実際に 載せた 2人（3人と 言わない）', share.length === 1 && share[0].text === '源泉徴収票 2025年分 2人', JSON.stringify(share));
    /* ⑦ 外の字体を 読ませない（返事が来ないと 永久に 出来ない＝taiketsu 止1） */
    { const r = fnRange(code, 'nenPrintGensen'); const src = r ? code.slice(r[0], r[1] + 1) : '';
      T('(d)⑦ ★源泉の iframe に 外の URL（字体の CSS 等）を 書かない★', !!src && !/https?:\/\//.test(src), (src.match(/https?:\/\/[^'" ]+/) || [''])[0]); }
    /* ⑧ 作っている間の 2度押し＝PDF は 1つ */
    reset(); libs(false); win.__nen([{ name: 'A' }]); win.__nen([{ name: 'A' }]); await waitDone(); await sleep(win, 200);
    T('(d)⑧ 作っている間の 2度押しで PDF を 2つ 作らない', share.length === 1, 'share=' + share.length);
    reset(); libs(false); win.__nen([{ name: 'A' }]); await waitDone();
    T('(d)⑧ 済んだら また 押せる', share.length === 1, 'share=' + share.length);
    /* ⑨ 明細（b-print）は 決まった大きさで 焼く＝fix を 効かせる */
    reset(); libs(false);
    { const d2 = doc.createElement('div'); d2.textContent = '明細'; doc.body.appendChild(d2);
      const r = win.__p2p ? await win.__p2p([d2], { isLand: true, fix: { w: 1123, h: 794 } }) : null; d2.remove();
      T('(d)⑨ pagesToPdf は fix の 大きさ（横 1123×794）で 焼く', !!r && r.wrote === 1 && yaku.length === 1 && yaku[0].w === 1123 && yaku[0].h === 794, JSON.stringify(yaku)); }
    /* ⑩ jsPDF を 作る所が 転んでも 投げっぱなしにしない＝Promise が 落ちる */
    { const keep = win.jspdf; win.jspdf = { jsPDF: function () { throw new Error('わざと'); } };
      let how = 'none'; try { await win.__p2p([doc.body], {}).then(() => { how = 'ok'; }, () => { how = 'reject'; }); } catch (_) { how = 'throw'; }
      win.jspdf = keep;
      T('(d)⑩ jsPDF が 転ぶと 呼ぶ側の catch へ 落ちる（同期で 投げない）', how === 'reject', 'how=' + how); }
    /* ⑤ 部品無し */
    reset(); win.html2canvas = undefined; win.jspdf = undefined; win.__nen([{ name: 'A' }]); await sleep(win, 30);
    T('(d)⑤ ★部品が無くても print を 呼ばない・字で言う・iframe を 作らない★', printed === 0 && ji.some((m) => /部品が読み込めていません/.test(m)) && iframes() === 0, JSON.stringify({ ji, printed }));
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (WAZA ? '（--waza）' : ''));
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
