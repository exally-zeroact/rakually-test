/* file-out-share.test.mjs — ★PDF を 送る 時は 共有に PDF と 字1行 だけ 渡す（url は 付けない）★（司さん 2026-11-04・11-06「B」）
 *
 * 司さん「請求書を LINE で 転送したら 訳わからん URL みたいなのも 送られる・開けんやつや・こんな作りにすんなや」
 *   直す前＝blob の URL を Safari で 開き、その 共有から 送っていた＝LINE に「blob:https://…」が 届いた。
 *   直した後＝FileOut.sharePdf が navigator.share に ★{ files:[PDF], text:'請求書 2026年10月分 〇〇 御中' }★ 渡す。
 *   ★11-06 司さん「B」★＝files だけ（11-04）は ホーム画面の アプリで 共有に LINE が 並ばない（10-30 の 形）＝text を 必ず 付ける。
 *
 * 見る事:
 *   ① 共有に 渡す 物は files と text だけ（url・title が 無い）・PDF 1つ・種類 application/pdf・名前そのまま・text は 呼ぶ側の 字
 *   ⑨ text が 無い 時は ファイル名から 作る（空で 送らない）・URL に 見える 字は 落とす
 *   ⑩ opts.open（呼ぶ側の 開き方）＝共有しない 端末では それを 呼ぶ（給与の 今までの 開き方を 変えない）
 *   ⑪ 未発行（下書き）の 紙は 共有に 渡さず 見るだけ（pdfView＝openInViewer・コンサル 11-06＝ダイコメと 揃える）
 *   ⑫ 給与の 2口（印刷画面 app.js・Web明細 meisai.js）も sharePdf に text と open を 渡す・字に 金額を 入れない
 *   ⑬ 「送った」印は 共有が 済んでから（やめた・帯で 待つ・作れなかった 時は 付けない・帯で 送れたら onShared で 付く）（taiketsu 11-06 止3）
 *   ⑭ 未発行の 紙の 知らせは「見るだけ」（共有ボタンから 送れ と 言わない・taiketsu 11-06 止4）
 *   ② 開いた 窓（window.open）も blob の URL も 使わない
 *   ③ iPhone が「指で 押した 扱いが 切れた」で 断った（NotAllowedError）＝「送る・印刷する」ボタンが 出て、押すと もう一度 共有（files だけ）
 *   ④ やめた（AbortError）＝cancelled（「渡した」印を 付けない 為）
 *   ⑤ ファイルを 共有できない 端末＝今まで通り 開く（openInViewer）
 *   ⑥ 請求書の 送る口（seikyu-out.js の pdfOpen）が sharePdf を 通る
 *
 * 使い方: node tests/file-out-share.test.mjs
 *         node tests/file-out-share.test.mjs --self-test   ← 下の 壊し方を 1つずつ 当てて 全部 赤に なるか（子の 走りで 数える）
 *         node tests/file-out-share.test.mjs --break=<種類>  ← 1つだけ 壊して 走る
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');
/* ★壊し方★（taiketsu 11-06 任5＝url の 1つだけでは ⑪⑫⑬ が 縛れているか 分からない） */
const BREAKS = {
  url: ['js/file-out.js', 'return global.navigator.share({ files: [file], text: text });', "return global.navigator.share({ files: [file], url: 'blob:https://x/1', text: 'x' });"],
  'draft-if0': ['seikyu/js/seikyu-app.js', "    if (how === 'open' && DOC.statusOf(S.cur) !== 'issued') how = 'view';", "    if (0) { if (how === 'open' && DOC.statusOf(S.cur) !== 'issued') how = 'view'; }"],
  'draft-only': ['seikyu/js/seikyu-app.js', "DOC.statusOf(S.cur) !== 'issued') how = 'view';", "DOC.statusOf(S.cur) === 'draft') how = 'view';"],
  'sumi-cancel': ['seikyu/js/seikyu-app.js', "typeof sumi === 'function' && !(r && (r.cancelled || r.how === 'need-tap'))) sumi();", "typeof sumi === 'function' && !(r && (r.how === 'need-tap'))) sumi();"],
  'bill-needtap': ['seikyu/js/seikyu-app.js', "if (shirushi && !(o && (o.cancelled || o.how === 'need-tap'))) billOkutta(made);", "if (shirushi && !(o && o.cancelled)) billOkutta(made);"],
  'oshita-shunkan': ['seikyu/js/seikyu-app.js', "doPdf(n, 'open', null, null, te); }); };", "doPdf(n, 'open'); okutta(); }); };"],
  'view-msg': ['seikyu/js/seikyu-app.js', ": '送る時は「発行する」を 押してから「PDFを開く（送る）」で 送ってください。'", ": 'その画面の 共有ボタンから メールなどで 送れます。'"],
  'onshared': ['js/file-out.js', "close(); if (typeof onShared === 'function') { try { onShared(); } catch (e2) {} }", 'close();'],
  'okutta-hadaka': ['seikyu/js/seikyu-app.js', "doPdf(n, 'open', null, null, te); }); };", "doPdf(n, 'open', null, null, okutta); }); };"],
  'okuttaWo-naka': ['seikyu/js/seikyu-app.js', 'return v ? function () { okutta(v); } : function () {};', 'return function () { okutta(); };'],
  'okutta-scur': ['seikyu/js/seikyu-app.js', 'var v = v0 || S.cur;', 'var v = S.cur;'],
  'kingaku': ['kyuyo/js/app.js', 'var text=[kind,tuki,who].filter', 'var text=[kind,tuki,who,String(sashihiki)].filter'],
};
const BRK = (process.argv.find((a) => a.startsWith('--break=')) || '').slice(8);
function rd(rel) {
  let t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const b = BREAKS[BRK];
  if (b && b[0] === rel) {
    if (!t.includes(b[1])) { console.log('✗ 自己確認：壊す所が 見つからない（' + BRK + '）'); process.exit(3); }
    t = t.replace(b[1], () => b[2]);
  }
  return t;
}
if (SELF) {
  const { spawnSync } = await import('node:child_process');
  let bad = 0;
  for (const k of Object.keys(BREAKS)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--break=' + k], { encoding: 'utf8' });
    const red = r.status === 1;
    console.log((red ? '  ✓ ' : '  ✗ ') + '壊し「' + k + '」 … ' + (red ? '赤に なる（見張りが 気づく）' : '赤に ならない（終わり値 ' + r.status + '）'));
    if (!red) bad++;
  }
  console.log(bad ? ('✗ 自己確認：' + bad + '種 壊しても 緑') : '自己確認：' + Object.keys(BREAKS).length + '種 全部 赤＝見張りは 効いている');
  process.exit(bad ? 1 : 0);
}
let SRC = rd('js/file-out.js');

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

/* 小さな 画面の 代わり（ボタンを 置いて 押せれば 良い） */
function mkDoc() {
  const byId = {};
  const mk = (tag) => {
    const el = { tagName: tag, children: [], style: {}, attrs: {}, parentNode: null, textContent: '', id: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      appendChild(c) { c.parentNode = this; this.children.push(c); if (c.id) byId[c.id] = c; (c.children || []).forEach((g) => { if (g.id) byId[g.id] = g; }); return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; if (c.id) delete byId[c.id]; (c.children || []).forEach((g) => { if (g.id) delete byId[g.id]; }); } };
    return el;
  };
  const body = mk('body');
  return { body, createElement: mk, getElementById: (id) => byId[id] || null };
}

async function run(opts) {
  const called = [];
  const shared = [], opened = [], anchors = [];
  const doc = mkDoc();
  const g = {
    Blob, File, Uint8Array, ArrayBuffer, Promise, Object, Error, setTimeout: () => 0,
    URL: { createObjectURL: () => 'blob:https://rakually.vercel.app/x', revokeObjectURL: () => {} },
    document: Object.assign(doc, {}),
    open: (u) => { opened.push(u); return {}; },
  };
  /* <a download> の 代わり（落とす 道に 来たかを 数える） */
  const ce = doc.createElement;
  doc.createElement = (t) => { const e = ce(t); if (t === 'a') { e.click = () => anchors.push(e.download); } return e; };
  if (opts.share) {
    let n = 0;
    g.navigator = {
      canShare: (d) => !!(d && d.files && d.files.length),
      share: (d) => { shared.push(d); n++; return opts.share(n, d); },
    };
  } else {
    g.navigator = {};
  }
  if (g.navigator) { g.navigator.userAgent = opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'; g.navigator.platform = (opts.ipadDesk || /Macintosh/.test(opts.ua || '')) ? 'MacIntel' : 'iPhone'; g.navigator.maxTouchPoints = opts.ipadDesk ? 5 : (/Macintosh/.test(opts.ua || '') ? 0 : 5); }
  g.matchMedia = (q) => ({ matches: q === '(pointer: coarse)' ? opts.coarse !== false : false });
  g.window = g; g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(SRC, g);
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const so = {};
  if (opts.text !== undefined) so.text = opts.text;
  if (opts.withOpen) so.open = () => { called.push('open'); return { how: 'open', mine: true }; };
  if (opts.withShared) so.onShared = () => { called.push('shared'); };
  const r = await g.FileOut.sharePdf(bytes, '20261101_見本工業_請求書.pdf', so);
  return { r, shared, opened, anchors, doc, g, called };
}

console.log('\n[file-out-share] PDF を 送る 時は 共有に PDF と 字1行 だけ 渡す（url 無し）');

const JI = '請求書 2026年10月分 見本工業株式会社 御中';
{
  const t = await run({ share: () => Promise.resolve(), text: JI });
  const d = t.shared[0] || {};
  const keys = Object.keys(d).sort().join(',');
  T('① 共有に 渡す 物は files と text だけ（url・title が 無い）', keys === 'files,text', '渡した 鍵＝' + keys);
  T('① text は 呼ぶ側の 字 そのまま', d.text === JI, JSON.stringify(d.text));
  const f = (d.files || [])[0];
  T('① PDF 1つ・種類 application/pdf・名前そのまま', (d.files || []).length === 1 && f && f.type === 'application/pdf' && f.name === '20261101_見本工業_請求書.pdf',
    f ? (f.type + ' ' + f.name) : '無い');
  T('② 窓を 開かない（blob の URL を Safari に 出さない）', t.opened.length === 0, t.opened.join(' '));
  T('① 返りは how=share', t.r && t.r.how === 'share' && !t.r.cancelled, JSON.stringify(t.r));
}
{
  const t = await run({ text: JI, share: (n) => n === 1 ? Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) : Promise.resolve() });
  const btn = t.doc.getElementById('fo-share-go');
  T('③ 断られた 時は 黙らず「送る・印刷する」ボタンを 出す', t.r && t.r.how === 'need-tap' && btn && btn.textContent === '送る・印刷する', JSON.stringify(t.r));
  if (btn) { btn.onclick(); await new Promise((ok) => setImmediate(ok)); }
  const d2 = t.shared[1] || {};
  T('③ ボタンを 押すと もう一度 共有（files と 同じ text・url 無し）', t.shared.length === 2 && Object.keys(d2).sort().join(',') === 'files,text' && d2.text === JI, '共有 ' + t.shared.length + '回 ' + Object.keys(d2).join(','));
  T('③ 共有の 後は ボタンが 消える', !t.doc.getElementById('fo-share'), '残っている');
  T('③ 断られても 窓は 開かない', t.opened.length === 0, t.opened.join(' '));
}
{
  const t = await run({ text: JI, withShared: true, share: (n) => n === 1 ? Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) : Promise.resolve() });
  T('⑬ 帯を 出した 時点では onShared を 呼ばない（まだ 送っていない）', t.called.indexOf('shared') < 0, JSON.stringify(t.called));
  const b = t.doc.getElementById('fo-share-go'); if (b) { b.onclick(); await new Promise((ok) => setImmediate(ok)); }
  T('⑬ 帯から 送れたら onShared を 1回 呼ぶ（「送った」印）', t.called.filter((x) => x === 'shared').length === 1, JSON.stringify(t.called));
  const a = await run({ text: JI, withShared: true, share: (n) => Promise.reject(Object.assign(new Error('x'), { name: n === 1 ? 'NotAllowedError' : 'AbortError' })) });
  const b2 = a.doc.getElementById('fo-share-go'); if (b2) { b2.onclick(); await new Promise((ok) => setImmediate(ok)); }
  T('⑬ 帯から 開いて やめたら onShared を 呼ばない', a.called.indexOf('shared') < 0, JSON.stringify(a.called));
  const s1 = await run({ text: JI, withShared: true, share: () => Promise.resolve() });
  T('⑬ 1回目で 送れた 時は onShared を 呼ばない（呼ぶ側が 返りで 付ける＝二重に しない）', s1.called.indexOf('shared') < 0, JSON.stringify(s1.called));
}
{
  const t = await run({ share: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })) });
  T('④ やめた 時は cancelled（「渡した」印を 付けない 為）', t.r && t.r.how === 'share' && t.r.cancelled === true, JSON.stringify(t.r));
}
{
  const t = await run({ share: null });
  T('⑤ ファイルを 共有できない 端末は 今まで通り 開く', t.r && t.r.how === 'open' && t.opened.length === 1, JSON.stringify(t.r));
}
{
  const t = await run({ share: () => Promise.resolve(), coarse: false });
  T('⑤ パソコン（指で 触らない）は canShare が true でも 共有に 行かず 開く（印刷が 消えない）', t.shared.length === 0 && t.r && t.r.how === 'open', JSON.stringify(t.r) + ' 共有' + t.shared.length);
}
{
  const t = await run({ share: () => Promise.resolve(), ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' });
  T('⑦ Android は 共有に 行かず 今まで通り 開く（印刷・納品書・領収書・送る どの ボタンでも）', t.shared.length === 0 && t.r && t.r.how === 'open', JSON.stringify(t.r));
  const i = await run({ share: () => Promise.resolve(), ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', ipadDesk: true });
  T('⑦ iPad の デスクトップ表示（MacIntel・指 5本）は 共有へ', i.shared.length === 1 && i.r && i.r.how === 'share', JSON.stringify(i.r));
  const m = await run({ share: () => Promise.resolve(), ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
  T('⑦ 指で 触らない Mac は 開く', m.shared.length === 0, '共有 ' + m.shared.length);
}
{
  const out = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-out.js'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
  T('⑧ ボタンごとの 分け（forPrint）は 無い＝漏れる 口が 無い', app.indexOf('forPrint') < 0 && out.indexOf('forPrint') < 0, 'forPrint が 残っている');
  T('⑥ 請求書の 送る口（pdfOpen）が sharePdf を 通る', /function pdfOpen\([^)]*\)\s*\{\s*return global\.FileOut\.sharePdf\(/.test(out), 'pdfOpen が sharePdf を 呼んでいない');
}

{
  const t = await run({ share: () => Promise.resolve() });
  const d = t.shared[0] || {};
  T('⑨ text を 渡さない 時は ファイル名から 作る（空で 送らない）', d.text === '20261101 見本工業 請求書', JSON.stringify(d.text));
  const u = await run({ share: () => Promise.resolve(), text: '請求書 blob:https://rakually.vercel.app/abc 10月分 https://x.y/z' });
  const du = u.shared[0] || {};
  T('⑨ URL に 見える 字は 落とす（blob: http:）', du.text === '請求書 10月分', JSON.stringify(du.text));
  const sp = await run({ share: () => Promise.resolve(), text: '   ' });
  T('⑨ 空白だけの text も ファイル名から', (sp.shared[0] || {}).text === '20261101 見本工業 請求書', JSON.stringify((sp.shared[0] || {}).text));
}
{
  const a = await run({ share: () => Promise.resolve(), ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', withOpen: true, text: JI });
  T('⑩ 共有しない 端末は opts.open を 呼ぶ（openInViewer の 窓は 開かない）', a.called.length === 1 && a.opened.length === 0 && a.shared.length === 0 && a.r && a.r.mine === true, JSON.stringify(a.r) + ' 窓' + a.opened.length);
  const i = await run({ share: () => Promise.resolve(), withOpen: true, text: JI });
  T('⑩ iPhone は opts.open を 呼ばず 共有', i.called.length === 0 && i.shared.length === 1, '呼んだ ' + i.called.length);
  const e = await run({ withOpen: true, text: JI, share: () => Promise.reject(Object.assign(new Error('x'), { name: 'TypeError' })) });
  T('⑩ 共有が 他の 訳で 失敗＝opts.open に 落ちる', e.called.length === 1 && e.r && e.r.mine === true, JSON.stringify(e.r));
}
{
  const out = rd('seikyu/js/seikyu-out.js');
  const app = rd('seikyu/js/seikyu-app.js');
  T('⑪ 見るだけの 口（pdfView）は openInViewer を 通る（共有しない）', /function pdfView\([^)]*\)\s*\{\s*return global\.FileOut\.openInViewer\(/.test(out), 'pdfView が 無い か 違う 道');
  const dp = app.slice(app.indexOf('function doPdf('), app.indexOf('pdfDase(built.html', app.indexOf('function doPdf(')));
  const dpCode = dp.replace(/\/\*[\s\S]*?\*\//g, '');
  T('⑪ 1通の PDF（doPdf）は 発行済みの 時だけ 送る（下書き・取り消し・分からない は 見るだけ）',
    /\n    if \(how === 'open' && DOC\.statusOf\(S\.cur\) !== 'issued'\) how = 'view';\n/.test(dpCode) && !/if \((0|false)\)/.test(dpCode), '分けが 無い か 包まれている');
  T('⑪ pdfDase は view を pdfView へ・open を pdfOpen（字1行つき）へ', app.indexOf("how === 'view' ? OUT.pdfView(bytes, name) : open ? OUT.pdfOpen(bytes, name, okuriJi, tabiSumi)") > 0, '振り分けが 違う');
  /* ⑬ 「送った」印は 済んでから */
  T('⑬ 1通の「送った」印は 済んだ 時だけ（やめた・帯で 待つ 時は 付けない）', app.indexOf("if (how !== 'view' && typeof sumi === 'function' && !(r && (r.cancelled || r.how === 'need-tap'))) sumi();") > 0, '条件が 違う');
  T('⑬ まとめの「渡した」印も やめた・帯で 待つ 時は 付けない', app.indexOf("if (shirushi && !(o && (o.cancelled || o.how === 'need-tap'))) billOkutta(made);") > 0, '条件が 違う');
  T('⑬ まとめは 帯で 送れた 時に onShared で 印を 付け・箱の 字も 直す', app.indexOf("OUT.pdfOpen(r.bytes, name, okuriJi, function () { if (shirushi) billOkutta(made); box('bk-ok', shareMsg({ how: 'share' }, yobi)); })") > 0, 'onShared を 渡していない');
  /* ⑮ 印は 押した 時の 1通に（taiketsu 11-06 止A＝遅れて 呼ぶと 確認を 閉じた 後の S.cur に 付いた） */
  const ap = app.replace(/\/\*[\s\S]*?\*\//g, '');
  T('⑮ okuttaWo は 掴んだ 1通だけに 印を 付ける（空なら 何もしない）', ap.indexOf('return v ? function () { okutta(v); } : function () {};') > 0, '中身が 違う');
  T('⑮ okutta は 渡された 1通を 見る（S.cur は 渡されない 時だけ）', /function okutta\(v0\) \{\s*var v = v0 \|\| S\.cur;/.test(ap), '渡された 1通を 見ていない');
  T('⑮ 送る・保存・印刷は 押した 時に 掴んだ 1通（okuttaWo(S.cur)）を 渡す・okutta を 裸で 渡さない',
    (ap.match(/var te = okuttaWo\(S\.cur\);/g) || []).length === 3 && !/[,(]\s*okutta\s*\)/.test(ap)
    && ap.indexOf("doPdf(n, 'open', null, null, te)") > 0 && ap.indexOf("doPdf(n, 'save', null, null, te)") > 0 && ap.indexOf('doPrint(n, te)') > 0, '掴んでいない');
  T('⑮ 帯から 送れたら 1通の 箱の 字も「渡しました」に', app.indexOf("var tabiSumi = function () { if (typeof sumi === 'function') sumi(); box(okId, shareMsg({ how: 'share' }, yobi)); };") > 0 && app.indexOf('OUT.pdfOpen(bytes, name, okuriJi, tabiSumi)') > 0, '直していない');
  T('⑭ 取り消した 紙は「取り消した 見るだけの 紙」・送れない と 言う', app.indexOf("(DOC.statusOf(S.cur) === 'void') ? '取り消した 見るだけの 紙'") > 0 && app.indexOf("'取り消した 紙は 送れません。'") > 0, '字が 無い');
  const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '');
  T('⑬ 押した 瞬間に okutta() を 呼ぶ 口が 無い（送る・印刷・保存）', !/doPdf\([^)]*\);\s*okutta\(\)/.test(appCode) && appCode.indexOf('motoPrint') < 0
    && appCode.indexOf("doPdf(n, 'open', null, null, te)") > 0 && appCode.indexOf("doPdf(n, 'save', null, null, te)") > 0 && appCode.indexOf('doPrint(n, te)') > 0, '押した 瞬間の 印が 残っている');
  T('⑬ seikyu-out の pdfOpen は onShared を sharePdf へ 渡す', out.indexOf('return global.FileOut.sharePdf(bytes, filename, { text: text, onShared: onShared });') > 0, '渡していない');
  /* ⑭ 見るだけの 知らせ */
  const vi = app.indexOf("if (how === 'view') {"), vb = app.slice(vi, app.indexOf('return;', vi));
  T('⑭ 未発行の 紙の 知らせは「見るだけ」・共有ボタンから 送れ と 言わない', vi > 0 && vb.indexOf('見るだけ') > 0 && vb.indexOf('共有ボタン') < 0 && vb.indexOf('送ってください') > 0, '字が 違う');
  const calls = app.match(/OUT\.pdfOpen\([^\n]*/g) || [];
  const withJi = calls.filter((c) => /OUT\.pdfOpen\([^,]+,\s*name,\s*\S/.test(c));
  T('⑥ 請求書の 送る口 3つ（まとめ・領収書・1通）が 全部 字1行を 渡す', calls.length === 3 && withJi.length === 3, 'pdfOpen ' + calls.length + ' 字つき ' + withJi.length);
  T('⑥ 全社の まとめの 字も「◯年◯月分」（他の 紙と 揃える）', app.indexOf("['請求書', ymJi(billPick.ym), '全社（' + made.length + '通）']") > 0, '書き方が 違う');
}
{
  const kapp = rd('kyuyo/js/app.js');
  const mei = rd('kyuyo/js/meisai.js');
  const meiHtml = fs.readFileSync(path.join(ROOT, 'kyuyo/meisai.html'), 'utf8');
  const kidx = fs.readFileSync(path.join(ROOT, 'kyuyo/index.html'), 'utf8');
  const call = 'window.FileOut.sharePdf(pdfBlob, okuri.name, { text:okuri.text, open:hiraku })';
  T('⑫ 給与の 印刷画面（app.js）は sharePdf に text と open を 渡す', kapp.indexOf(call) > 0, '呼び方が 違う');
  T('⑫ Web明細（meisai.js）も 同じ', mei.indexOf(call) > 0, '呼び方が 違う');
  const ki = kapp.indexOf('function kyuyoOkuriJi'), kb = kapp.slice(ki, kapp.indexOf("$('#b-print')", ki));
  const mb = mei.slice(mei.indexOf('function okuriOf'), mei.indexOf('function openDoc'));
  const gaku = /\b(net|gross|total|pay|amount)\b|支給額|差引|金額/;
  T('⑫ 金額を 共有の 字に 入れない（kyuyoOkuriJi・okuriOf）', ki > 0 && kb.length > 0 && mb.length > 0 && !gaku.test(kb.replace(/\/\*[\s\S]*?\*\//g, '')) && !gaku.test(mb.replace(/\/\*[\s\S]*?\*\//g, '')), '額の 字が 在る');
  /* ★字の 並びは 名指し★（名前の 決まりで 額を 探すと sashihiki 等で すり抜ける・taiketsu 11-06 任5） */
  const shs = rd('seikyu/js/seikyu-app.js');
  T('⑫ 字1行の 並びは 種類・月・宛先 の 3つだけ（給与・Web明細・請求書）',
    (kb.match(/\[kind,tuki,who\]/g) || []).length === 2 && !/\[kind,tuki,who,/.test(kb)
    && /var parts=\[kind,tuki,who\]\.filter/.test(mb)
    && /return \[label, lead, ate\]\.filter/.test(shs), '並びが 違う');
  T('⑫ 給与の 字1行は 押した 時に 作る（作る 間に 選びを 変えても ずれない）', kapp.indexOf('var okuriAtPress=kyuyoOkuriJi();') > 0 && kapp.indexOf('okuri=okuriAtPress') > kapp.indexOf('var okuriAtPress=kyuyoOkuriJi();'), '押した 時に 作っていない');
  const sf = (h) => h.indexOf('js/file-out.js'), sm = meiHtml.indexOf('js/meisai.js');
  T('⑫ meisai.html は file-out.js を meisai.js より 先に 読む', sf(meiHtml) > 0 && sf(meiHtml) < sm, 'file-out ' + sf(meiHtml) + ' meisai ' + sm);
  T('⑫ 給与の 画面（kyuyo/index.html）も file-out.js を 読む', sf(kidx) > 0, '読んでいない');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (BRK ? '（壊し「' + BRK + '」）' : ''));
process.exit(fail ? 1 : 0);
