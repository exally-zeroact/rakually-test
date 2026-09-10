/* eigo-dasanai.mjs — ★画面に ブラウザ任せの 英語を 出さない★
 * =============================================================================
 * 司さん 2026-09-10「★なんで いきなり 英語 入れるんど ぼけ★」
 *
 * ★正体（実測 2026-09-10）★
 *   <input type="file"> は ★ブラウザが 用意した ボタンと 字★を 出す。
 *   手元（Chromium）では 「Choose File / No file chosen」＝★英語★だった。
 *   その字は ★こちらの コードに 1文字も 無い★ので、
 *   源（ソース）を grep しても 見つからない。★実ブラウザで 画面の 字を 拾う★しか ない。
 *   請求書には 2か所 在った（判子の画像・自社のExcel）。
 *   ★給与（kyuyo）は 前から 隠して 自分の ボタンから 呼んでいた★＝そちらに 合わせた。
 *
 * 見る物:
 *   ① ★見えている ファイルの欄（type=file）が 1つも 無い★
 *      ★display:none では 隠さない★＝見張り（scripts/webkit-size.mjs）は
 *        「隠れた物も 開いて 測る」ので、開いた とたん 英語の ボタンが 出て
 *        ★375px で 3px はみ出した★（2026-09-10 CI で 実測・手元は 0px）。
 *      ⇒ ★1px の 透明（.file-kakusu）★＝開かれても 大きくならない・字も 出ない。
 *   ② ★日本語の ボタンから 選べる★（押すと 隠れた 欄が 呼ばれる）
 *   ③ ★選んだ ファイルの 名前を 自分で 出す★（「No file chosen」を 見せない）
 *   ④ ★4つの 画面に 思わぬ 英語が 出ていない★（許す物は 下に 名指し）
 *   ⑤ 空振りしない（本当に 画面の 字を 拾えている）
 *
 * ★実ブラウザで 測る★＝ブラウザが 作る 字は jsdom には 出ない。
 * ★入る（ログインする）★ので ★本番の repo では 走らない★（鍵が 無い＝tests/_hairu.mjs kagiAru）。
 * 使い方: node seikyu/tests/eigo-dasanai.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';
import { hairu } from '../../tests/_hairu.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

/* ★★入る（ログインする）見張りは 本番の repo では 走らせない★★
   ＝本番の repo は ★本番の 倉庫★を 指すので test@test.com は 居ない
     （2026-09-10 実測＝本番の 入れ物で 3回とも 入れず 30秒で 落ちた）。
   ★黙って 緑に しない★＝「ここでは 測れない・テスト線で 測っている」と 字で 言ってから 抜ける。
   ★決まりは tests/_hairu.mjs の kagiAru が 唯一の正★（他の 入る見張りと 同じ道）。 */
{
  const { kagiAru } = await import('../../tests/_hairu.mjs');
  if (!(await kagiAru(ROOT))) {
    console.log('[eigo-dasanai] — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★／戻す条件＝本番CIに 鍵を 置いた日）');
    process.exit(0);
  }
}
const ch = await borrow('eigo-dasanai', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('eigo-dasanai', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
const inn = await hairu(pg, 'http://localhost:' + PORT + '/seikyu/index.html', '.bn[data-scr]');
if (!inn || inn.ok === false) {
  console.log('🟡 ★未測定★ 入れなかった … ' + JSON.stringify(inn));
  await b.close(); srv.close(); process.exit(2);
}

/* ★許す 物★＝日本語に できない／変えると かえって 分からなくなる 字。
   ★ここに 足す時は 訳を 1行 書く★（黙って 足すと この見張りは 何も 守らなくなる）。 */
const YURUSU = [
  'Rakunally',   // 製品の名前
  'Excel', 'PDF', 'CSV', 'PNG', 'JPEG', '.xlsx',   // 物の名前（日本語にすると 通じない）
  'TEL', 'FAX', 'No', 'No.',                        // 紙・画面の 決まり文句
  'mm', 'A4', 'T',                                  // 単位・登録番号の 頭
];

const hirou = () => pg.evaluate(() => {
  const out = { ji: [], file: 0, fileMieru: 0 };
  const scr = [...document.querySelectorAll('.screen')].filter((s) => getComputedStyle(s).display !== 'none')[0];
  if (!scr) return out;
  /* ★「見えている」＝人の目に 字が 出る大きさ★
     ＝1px の 透明（.file-kakusu）は 見えていない。
       ★0より大きい で 見ると 隠した 欄まで「見えている」に なる★（2026-09-10 実測）。 */
  const mieru = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
  };
  const w = document.createTreeWalker(scr, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (!t) continue;
    if (n.parentElement && !mieru(n.parentElement)) continue;
    out.ji.push(t);
  }
  scr.querySelectorAll('input,select,textarea,button,img,summary,option').forEach((el) => {
    if (el.tagName === 'INPUT' && el.type === 'file') { out.file++; if (mieru(el)) out.fileMieru++; }
    if (!mieru(el)) return;
    ['placeholder', 'value', 'alt', 'title', 'aria-label'].forEach((k) => {
      const v = el.getAttribute && el.getAttribute(k);
      if (v && String(v).trim()) out.ji.push(String(v).trim());
    });
  });
  return out;
});

const GAMEN = [['設定', 'scr-set'], ['入力', 'scr-edit'], ['一覧', 'scr-list'], ['請求/集計', 'scr-bill']];
const mita = [];
for (const [na, sel] of GAMEN) {
  await pg.click('.bn[data-scr="' + sel + '"]');
  await pg.waitForTimeout(500);
  mita.push(Object.assign({ na }, await hirou()));
}
/* ★日本語の ボタンから 選べるか★＝隠れた 欄が 呼ばれるかを 見る（窓は 開けない） */
await pg.click('.bn[data-scr="scr-set"]');
await pg.waitForTimeout(400);
const oshita = await pg.evaluate(() => {
  const r = {};
  [['b-seal-pick', 'seal-file'], ['b-book-pick', 'book-file']].forEach(([bt, fi]) => {
    const bb = document.getElementById(bt), ff = document.getElementById(fi);
    if (!bb || !ff) { r[bt] = 'ボタンか 欄が 無い'; return; }
    let yonda = 0;
    const moto = ff.click;
    ff.click = function () { yonda++; };          /* ★窓は 開けない★＝呼ばれたかだけ 見る */
    bb.click();
    ff.click = moto;
    r[bt] = yonda;
  });
  r.namae = [(document.getElementById('seal-fname') || {}).textContent,
    (document.getElementById('book-fname') || {}).textContent];
  return r;
});
await b.close(); srv.close();

console.log('\n[eigo-dasanai] 画面に ブラウザ任せの 英語を 出さない' + (SELF ? '（自分ためし）' : ''));

if (SELF) {
  const h = fs.readFileSync(path.join(ROOT, 'seikyu', 'index.html'), 'utf8');
  const a = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8');
  const kowasu = [
    ['判子の欄を 見せる', h, 'class="file-kakusu" id="seal-file"'],
    ['Excelの欄を 見せる', h, 'class="file-kakusu" id="book-file"'],
    ['判子の ボタンを 外す', a, "$('b-seal-pick').onclick"],
    ['Excelの ボタンを 外す', a, "$('b-book-pick').onclick"],
  ];
  kowasu.forEach(([na, src, x]) => ok(src.split(x).length === 2, '★壊す所が 1つ 見つからない★ ' + na + ' … ' + x));
  console.log('     壊す所 ' + kowasu.length + '箇所（本当に コードに 在る事を 見た）');
}

T('★⑤ 空振りしていない（本当に 画面の 字を 拾えている）', () => {
  ok(mita.length === GAMEN.length, '見た 画面が 足りない');
  /* ★画面ごとの 字の 数は そろっていない★（請求/集計は 中身が 来るまで 数行）
     ＝1画面の 数で 決めず、★全部で いくつ 拾えたか★と ★どの画面も 0では ない★を 見る。 */
  const zen = mita.reduce((a, z) => a + z.ji.length, 0);
  ok(zen >= 60, '★ぜんぶで ' + zen + '個＝拾えていない★');
  mita.forEach((z) => ok(z.ji.length >= 3, z.na + '：★字が ' + z.ji.length + '個＝拾えていない★'));
  const f = mita.reduce((a, z) => a + z.file, 0);
  ok(f >= 2, '★ファイルの欄が ' + f + '個＝この検査は 何も 見ていない★');
  console.log('     拾った 字 … ' + zen + '個（' + mita.map((z) => z.na + ' ' + z.ji.length).join(' ／ ') + '）'
    + ' ／ ファイルの欄 ' + f + '個');
});

T('★① 見えている ファイルの欄（ブラウザが 字を 作る）が 1つも 無い', () => {
  const dame = mita.filter((z) => z.fileMieru > 0).map((z) => z.na + ' ' + z.fileMieru + '個');
  ok(dame.length === 0,
    '★ブラウザ任せの 欄が 見えている★（英語の ボタンが 出る）: ' + dame.join(' ／ '));
});

T('★② 日本語の ボタンから 選べる（押すと 隠れた 欄が 呼ばれる）', () => {
  ok(oshita['b-seal-pick'] === 1, '★判子：ボタンから 呼べていない★ ' + oshita['b-seal-pick']);
  ok(oshita['b-book-pick'] === 1, '★Excel：ボタンから 呼べていない★ ' + oshita['b-book-pick']);
});

T('★③ 選んだ ファイルの 名前を 自分で 出す', () => {
  oshita.namae.forEach(function (t) {
    ok(t && String(t).trim(), '★名前を 出す 所が 無い★');
    ok(!/[A-Za-z]/.test(String(t)), '★英語で 出している★: ' + t);
  });
});

T('★④ 4つの 画面に 思わぬ 英語が 出ていない', () => {
  const yaru = (t) => String(t).split(/[\s　、。（）()「」／/,]+/).filter((w) => {
    if (!w) return false;
    if (!/[A-Za-z]/.test(w)) return false;
    if (/[ぁ-んァ-ヶ一-龥]/.test(w)) return false;       /* 日本語に 混ざった 型番などは 別 */
    if (/^[0-9A-Za-z._%+-]+@[0-9A-Za-z.-]+$/.test(w)) return false;  /* 入っている人の メール */
    /* 数と 単位が くっついた 物（20mm・T1234567890123・No.202609-001） */
    const su = w.replace(/[0-9,.\-/:%¥×＋+〜~]/g, '');
    if (!su) return false;
    return YURUSU.indexOf(su) < 0 && YURUSU.indexOf(w) < 0;
  });
  const dame = [];
  mita.forEach((z) => { z.ji.forEach((t) => yaru(t).forEach((w) => dame.push(z.na + '：' + w))); });
  const uniq = [...new Set(dame)];
  ok(uniq.length === 0, '★思わぬ 英語★: ' + uniq.join(' ／ '));
  console.log('     許している 字 … ' + YURUSU.join(' ') + '（訳は 上に 書いてある）');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
