/* shot-memobox-all.mjs — ★足元の 備考欄の 置き方を 全パターン 絵に する★
 * 司さん 2026-09-10「前に作成したやつ それやなかったろが／勝手に変えるなや／全パターンで見せろよ」
 * ★本体（seikyu-paper.js）は これ以上 いじらない★＝出来た 紙を DOM で 組み替えて 撮る。
 *   A 振込先の 下・枠なし（字だけ）      … 2026-09-08 の 1つ目
 *   B 振込先の 下・枠あり                … 2026-09-08 の 2つ目（今 本体に 在る形）
 *   C 締めの 左横（2段組み）             … 2026-09-08 の 3つ目
 *   D 表の すぐ下・横いっぱい            … まだ 見せていない 置き方
 * 使い方: node scripts/shot-memobox-all.mjs
 */
import fs from 'node:fs'; import path from 'node:path';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-memobox-all', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const A4 = 1122.5;

function html() {
  const ln = [
    { name: 'エアコン取付工事', qty: '1', unit: '式', price: '42000', amount: '42000', rate: 10, memo: '' },
    { name: 'ダクト補修', qty: '1', unit: '式', price: '18000', amount: '18000', rate: 10, memo: '' },
  ];
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault('std1');
  return PAPER.build({
    inv: { no: '202609-001', issue_ymd: '2026-09-10', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal }, data: {} },
    tax: t, partner: { name: '黒田空調', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
      invoiceNo: 'T1234567890123', bank: '伊予銀行 今治支店 普通 1234567 ド）ラクナリー' },
    template: tp, templateId: 'std1', theme: tp.theme, memoBox: true,
    cols: COLS.normalizeSpec(tp.cols), deduct: 0, deductLines: [],
  }).html;
}

const KUMI = {
  /* ★A（枠なし）と D（表のすぐ下・横いっぱい）は 司さんが 却下★（2026-09-10）
       A「枠ないと 備考が わからんやろ」／D「なにこれ？なめとん？」
     ⇒ 残すのは B と C。どちらも ★言われた所を 直してから★ 出す。 */
  /* B … 振込先の 下・枠あり ＋ ★備考の 幅を 左の列いっぱいに★
       （司さん「B 備考欄は 赤線の ところまでは あった方が よくないか？」
        ＝赤線＝内訳の 手前＝足元の 左の 列の 右端） */
  B: () => {
    const m = document.querySelector('.note-memo');
    if (!m) return;
    m.style.width = '100%';
    m.style.display = 'block';
  },
  /* C … 締めの 左横 ＋ ★表と 足元の すきまを 詰める★
       （司さん「Cにいたっては 赤丸の 隙間の 話 せんかったか？」
        ＝紙は「足元を 下端に 貼る」作りなので、明細が 少ないと 大きな 空白が 残る） */
  C: () => {
    /* ★2026-09-10 司さん「Cも 備考と 振り込み 逆にして ★備考が 下★の方が よくないか？」★
       ＝左の 塊を ★上＝お振込先／下＝備考★ に する。
       ＋ 赤丸の すきまも 詰める（足元を 紙の 下端に 貼るのを やめる）。 */
    const m = document.querySelector('.note-memo');
    const bank = document.querySelector('.note-bank');
    if (m && bank && bank.parentNode) {
      bank.parentNode.insertBefore(m, bank.nextSibling);   /* 振込先の 直後＝下 */
      m.style.width = '100%';
      m.style.display = 'block';
      bank.style.width = '100%';
      bank.style.display = 'block';
    }
    /* ★すきまを 詰める★
       紙は「上の 中身は 上から 積み、★足元は 紙の 下端に 貼る★」作り
       （.pg の 2行の 表／.pg-f>td{vertical-align:bottom}）。
       ★足元だけ 上寄せに しても 動かない★＝上の段が 残りの 高さを 全部 使うから。 */
    document.querySelectorAll('.pg-b > td').forEach((td) => { td.style.height = '1px'; });
    document.querySelectorAll('.pg-f > td').forEach((td) => {
      td.style.verticalAlign = 'top'; td.style.height = 'auto';
    });
  },
};
const NA = {
  B: 'B 振込先の下・枠あり（幅を 左の列いっぱいに）',
  C: 'C 上＝振込先／下＝備考（すきまを 詰めた）',
};

const b = await pwLaunch('shot-memobox-all', ch, undefined, 'chromium');
const out = [];
for (const k of ['B', 'C']) {
  const pg = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await pg.setContent(html(), { waitUntil: 'load' });
  await pg.waitForTimeout(300);
  await pg.evaluate(KUMI[k]);
  await pg.waitForTimeout(300);
  const m = await pg.evaluate(() => {
    const s = document.querySelector('.sheet');
    const box = s.querySelector('.note-memo') || [...s.querySelectorAll('.note')]
      .filter((e) => (e.textContent || '').indexOf('備考') === 0)[0];
    const r = box && box.getBoundingClientRect();
    /* ★赤丸の すきま★＝表の 下端と 足元の 塊の 上端の あいだ */
    const items = s.querySelector('.blk-items');
    const foot = s.querySelector('.foot') || s.querySelector('.sums');
    const ri = items && items.getBoundingClientRect();
    const rf = foot && foot.getBoundingClientRect();
    const sheet = s.getBoundingClientRect();
    return { naka: Math.round(s.scrollHeight), waku: !!box,
      takasa: r ? Math.round(r.height) : 0, haba: r ? Math.round(r.width) : 0,
      suki: (ri && rf) ? Math.round(rf.top - ri.bottom) : null,
      hidariHaba: Math.round(sheet.width) };
  });
  const f = path.join(OUT, 'memobox-' + k + '.png');
  await (await pg.$('.sheet')).screenshot({ path: f });
  await pg.close();
  out.push({ k, p: f, m, byte: fs.statSync(f).size,
    sha: createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12) });
}
await b.close();

console.log('A4 = ' + Math.round(A4) + 'px ／ 明細2行・備考は 空のまま');
out.forEach((x) => {
  const over = x.m.naka - Math.round(A4);
  console.log('  ' + NA[x.k]);
  console.log('      中身 ' + x.m.naka + 'px' + (over > 1 ? '  ★はみ出し ' + over + 'px★' : '  ★収まる★')
    + ' ／ 備考の枠 ' + (x.m.waku ? x.m.haba + '×' + x.m.takasa + 'px' : '★出ない★')
    + ' ／ ★表と 足元の すきま ' + x.m.suki + 'px★');
  console.log('      ' + x.byte + 'バイト sha ' + x.sha);
  console.log('      ' + x.p);
});
