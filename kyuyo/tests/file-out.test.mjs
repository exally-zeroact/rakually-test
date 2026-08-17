/* file-out.test.mjs — ★ファイルの渡し方（種類・共有シート・落とす）を固定する★
 *
 * なぜ必要か（2026-08-04・司さんの実機）:
 *   iPhone に Excel が入っているのに、落としたファイルを開けなかった。
 *   原因は端末ではなく、★種類を application/octet-stream で落としていた★こと。
 *   さらに ★共有シート(navigator.share)を1箇所も使っていなかった★＝
 *   iPhoneでファイルを渡す普通のやり方をしていなかった。
 *
 * ここで固定すること:
 *   ① 拡張子から種類が必ず決まる（xlsx/csv/txt…）。★分からない拡張子は落とさない★
 *   ② 指で触る端末(pointer: coarse)では共有シートに渡す＝「Excelで開く」が並ぶ
 *   ③ ★PCでは今までどおり落ちる★（共有シートに行かない）
 *      — 実測でここを一度壊した: デスクトップChromeも canShare は true を返すので、
 *        機能だけで判定すると PCでファイルが落ちなくなる（退行）。だから pointer で分ける。
 *   ④ 客が共有シートを閉じただけの時は、エラーにしない
 *
 * 使い方: node tests/file-out.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, '../js/file-out.js'), 'utf8');

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const TA = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

/* 端末のふりをして FileOut を読み込む。coarse=指で触る端末 / share=共有シートが使えるか */
function load({ coarse = false, share = true } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const win = dom.window;
  win.matchMedia = (q) => ({ matches: q === '(pointer: coarse)' ? coarse : false });
  const shared = [], downloaded = [];
  if (share) {
    win.navigator.canShare = (d) => !!(d && d.files && d.files.length);
    win.navigator.share = (d) => { shared.push({ name: d.files[0].name, type: d.files[0].type }); return Promise.resolve(); };
  } else { win.navigator.canShare = undefined; win.navigator.share = undefined; }
  win.URL.createObjectURL = () => 'blob:test';
  win.URL.revokeObjectURL = () => { };
  const origCreate = win.document.createElement.bind(win.document);
  win.document.createElement = (t) => {
    const el = origCreate(t);
    if (t === 'a') el.click = () => downloaded.push({ name: el.download, target: el.target, rel: el.rel });
    return el;
  };
  const s = win.document.createElement('script');
  s.textContent = SRC;
  win.document.body.appendChild(s);
  return { win, FileOut: win.FileOut, shared, downloaded };
}

console.log('\n[file-out] ファイルの渡し方（種類・落とす）');

T('① 拡張子から種類が決まる', () => {
  const { FileOut } = load();
  eq(FileOut.mimeOf('a.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx');
  eq(FileOut.mimeOf('a.csv'), 'text/csv', 'csv');
  eq(FileOut.mimeOf('furikomi_2026-08.txt'), 'text/plain', 'txt（全銀ファイル）');
  eq(FileOut.mimeOf('a.pdf'), 'application/pdf', 'pdf');
});

T('★① 分からない拡張子は種類を作らない（octet-stream に落とさない）', () => {
  const { FileOut } = load();
  eq(FileOut.mimeOf('nazo.bin'), null, '知らない拡張子');
  eq(FileOut.mimeOf('拡張子なし'), null, '拡張子なし');
});

await TA('★① 分からない拡張子は【渡さずに止める】（iPhoneで開けないファイルを作らない）', async () => {
  const { FileOut, downloaded, shared } = load();
  let msg = null;
  try { await FileOut.deliver(new Uint8Array([1]), 'nazo.bin'); } catch (e) { msg = e.message; }
  ok(msg && /種類が分かりません/.test(msg), '止めた理由を言っている: ' + msg);
  eq(downloaded.length, 0, 'ファイルを作っていない');
  eq(shared.length, 0, '共有もしていない');
});

await TA('★② 指で触る端末（スマホ相当）でも、ふつうに落とす（共有シートに行かない）', async () => {
  const { FileOut, shared, downloaded } = load({ coarse: true, share: true });
  const r = await FileOut.deliver(new Uint8Array([80, 75, 3, 4]), '給与明細_2026-08.xlsx');
  eq(r.how, 'download', '落ちた');
  eq(shared.length, 0, '★共有シートに行っていない（人に送る仕組みは使わない）');
  eq(downloaded.length, 1, '1回落とした');
  eq(downloaded[0].name, '給与明細_2026-08.xlsx', 'ファイル名');
});

await TA('★③ PCでも同じに落ちる（端末で分岐していない）', async () => {
  const { FileOut, shared, downloaded } = load({ coarse: false, share: true });
  const r = await FileOut.deliver(new Uint8Array([80, 75, 3, 4]), '給与明細_2026-08.xlsx');
  eq(r.how, 'download', '落ちた');
  eq(shared.length, 0, '共有シートに行っていない');
  eq(downloaded.length, 1, '1回落とした');
});

await TA('共有シートが無い端末でも同じ（分岐が無いので当然）', async () => {
  const { FileOut, downloaded } = load({ coarse: true, share: false });
  const r = await FileOut.deliver(new Uint8Array([1]), 'furikomi_2026-08.txt');
  eq(r.how, 'download', '落ちた');
  eq(downloaded.length, 1, '1回落とした');
});

T('★渡し口のコードに共有シートの分岐が残っていない', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const bad of ['navigator.share', 'canShare', 'pointer: coarse', 'prefersShare']) {
    if (code.indexOf(bad) >= 0) throw new Error('★まだ残っています: ' + bad);
  }
});

/* ★ホーム画面から開いたアプリ（standalone）で、押したあとアプリに戻れること（2026-08-09）
   download が効かない端末では、同じ窓でファイルが開いて★戻れなくなる★（既知の罠）。
   別の窓なら閉じるだけで戻れる。落とす物は全部この1箇所を通るので、ここで固定する。 */
await TA('★★落とすリンクは別の窓で開く（ホーム画面のアプリから戻れなくならない）★★', async () => {
  for (const dev of [{ coarse: true }, { coarse: false }]) {
    const { FileOut, downloaded } = load(dev);
    await FileOut.deliver(new Uint8Array([1]), 'furikomi_2026-08.txt');
    eq(downloaded.length, 1, '落ちていない');
    eq(downloaded[0].target, '_blank', '★target="_blank" が付いていない（同じ窓で開く＝戻れない）');
    eq(downloaded[0].rel, 'noopener', 'rel="noopener" が付いていない');
  }
});
T('★渡し口のコードに target が書いてある（消したら赤）', () => {
  if (!/target\s*=\s*['"]_blank['"]/.test(SRC)) throw new Error('★target="_blank" が渡し口から消えている');
});

T('★後始末をしている（URLの取り消しと要素の削除）', () => {
  if (SRC.indexOf('revokeObjectURL') < 0) throw new Error('URLを取り消していない');
  if (!/removeChild|\.remove\(\)/.test(SRC)) throw new Error('要素を消していない');
});

T('ファイル名の日時が作れる（毎回違う名前＝古いのと見分けがつく）', () => {
  const { FileOut } = load();
  eq(FileOut.stamp(new Date(2026, 7, 4, 9, 5)), '20260804_0905', '代行請求アプリと同じ形（YYYYMMDD_HHmm）');
});


console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
