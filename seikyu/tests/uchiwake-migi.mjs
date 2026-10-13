/* uchiwake-migi.mjs — ★請求書の（内訳）の表は 振込先が 有っても 無くても 右端に 固定／振込先の 箱と 重ならない★
 * =============================================================================
 * ★司さん 2026-10-12★「赤丸の所は振込先なかったらかってに左端に移動するし右端に固定してけや」
 *   （赤丸＝合計の 下の「（内訳）区分・対象額・消費税」の 表・実機の iPhone の PDF）
 * ★何が 起きて いたか（測った）★
 *   足元は 2つの 欄の 表（左＝振込先／右＝内訳）。table-layout:auto＋右の 欄 width:1%＋振込先の 箱 min-width:112mm だった。
 *   ・WebKit（iPhone）は 振込先が 無いと 右の 欄を 紙の 幅いっぱいに 広げ、内訳が 左へ 寄った（右端 421px／合計の 右端 859px）。
 *   ・振込先が 有ると 112mm の 箱が 欄より 広く、内訳を 右へ 押し出した（合計より 21px 右・長い 名義で 紙の 外へ 17〜149px）。
 *   ・内訳だけ 74mm に 固定すると、今度は 112mm の 箱が 内訳の 枠に 21px 重なった（絵で 確かめた）。
 *   ⇒ 内訳は 74mm 固定・振込先の 箱は 左の 欄いっぱい・入らない 1口座は 地の 字だけ 縮める（口座番号の 13pt は そのまま）。
 * ★ここで 見る 物★ … WebKit と Chromium で、7様式 × 控除の 有り無し × 振込先 7通り（無し・ふつう・長い 名義 2つ・下限越え・英大文字・半角カナ・2口座・6口座）
 *   ① 内訳の 表の 右端が 合計の 欄の 右端と 同じ（1px 以内）
 *   ② 振込先が 有っても 無くても 内訳の 左端が 同じ
 *   ③ 振込先の 箱の 右端が 内訳の 枠（.bd）の 左端を 越えない
 *   ④ 振込先の 字が 箱から はみ出さない（scrollWidth ≤ clientWidth）
 *   ⑤ 口座番号は 13pt のまま（縮めて いない）
 *   ⑥ 紙から はみ出さない（.sheet は overflow:hidden＝黙って 切れる）
 *   ⑦ 描いた 行の 数＝行数の 計算に 渡す 数（bankKumi）・09-10 の 手本（ふつう・青森）は 1口座 1行・下限越えは 名義が 2行目
 * ★様式は 本物の 渡し方で 渡す★（taiketsu 10-13＝build() は template を 読まない。
 *   前の 版は template: を 渡して いて 4様式とも 同じ 紙（sha256 同じ）だった）。
 *   アプリと 同じ 呼び方＝cols: TPL.colsOf(inv)・theme: TPL.getOrDefault(id).theme・deductLines（koujo-paper.test.mjs と 同じ）。
 * ★--waza★ … 前の CSS（table-layout:auto・右の 欄 width:1%・箱 112mm）に 戻すと 赤に なるか（空振り止め）
 * ★ブラウザが 要る★＝無い 機械では 未測定（scripts/_borrow-playwright.mjs が 1か所で 決める）。
 * 使い方: node seikyu/tests/uchiwake-migi.mjs   ／   --waza
 */
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
require_(path.join(ROOT, 'seikyu/lib/seikyu-cols.js'));
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const DOC = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const WAZA = process.argv.includes('--waza');

let pass = 0, fail = 0;
const akaNa = [];
const T = (n, c, m) => { if (c) { pass++; } else { fail++; akaNa.push(n + (m ? ' — ' + m : '')); } };

const YOUSHIKI = ['std1', 'std1memo', 'elegant', 'koujo', 'koujomemo', 'genba', 'genbanashi'];
const NL = String.fromCharCode(10);
const FURIKOMI = {
  無し: '',
  ふつう: '見本銀行　見本支店　普通　1234567　ミホン',
  長い名義: '青森県信用組合　十和田支店　普通　1234567　カ）トウホクソウゴウケンセツコウギョウ',
  長い支店: '三井住友信託銀行　みなとみらいランドマークタワー支店　当座　12345678　ド）サンプルコウギョウ',
  下限越え: '北海道信用農業協同組合連合会　本所営業部　普通　1234567　トクヒ）ニホンコクサイキョウリョクセンターキョウカイ',
  英大文字: 'MUFG BANK　TOKYO MAIN OFFICE　普通　1234567　カ）ZEROACT INTERNATIONAL HOLDINGS WWW',
  /* ★taiketsu 10-13 3回目★ 0.8 でも 入らず 名義の 送り先が 無い／送っても まだ 長い 入力（前は 箱が 内訳に 最大 111px 重なった） */
  番号無し: 'ゆうちょ銀行　〇一八店　普通　口座番号は別紙をご覧ください　ヤマダタロウショウテンカブシキガイシャホンシャエイギョウブ',
  全角数字: '北海道信用農業協同組合連合会　本所営業部　普通　１２３４５６７　トクヒ）ニホンコクサイキョウリョクセンターキョウカイ',
  名義に数字: '北海道信用農業協同組合連合会　本所営業部　普通　1234567　トクヒ）ニホンコクサイキョウリョクセンター第12345号キョウカイ',
  支店が長い: '北海道信用農業協同組合連合会北海道信用農業協同組合連合会　みなとみらいランドマークタワー第一法人営業部支店　普通　1234567　カ）ミホン',
  名義だけ長い: '見本銀行　見本支店　普通　1234567' + NL + 'カ）ニホンコクサイキョウリョクセンターキョウカイホッカイドウシブジムキョクソウムブケイリカ',
  半角カナ: '見本銀行 見本支店 普通 1234567 ｶ)ﾄｳﾎｸｿｳｺﾞｳｹﾝｾﾂｺｳｷﾞｮｳ',
  /* ★taiketsu 10-13 4回目★ 数字だけの 長い 行（前は「入る」と 判じて 330px 重なった）・
     𠮷（サロゲート）と 濁点の 結合文字（前は 字の 途中で 割って 豆腐／濁点だけの 行頭）・幅の 広い 英字 */
  数字だけ長い: '12345678'.repeat(8),
  吉が長い: '見本銀行　見本支店　普通　1234567　カ）' + '𠮷'.repeat(45),
  結合文字: '見本銀行　見本支店　普通　1234567　' + 'ガ'.repeat(45),
  幅の広い英字: '見本銀行　見本支店　普通　1234567　' + 'W'.repeat(28),
  '2口座': '見本銀行　見本支店　普通　1234567　ミホン' + NL + '青森県信用組合　十和田支店　普通　7654321　カ）トウホクソウゴウケンセツコウギョウ',
  /* ★名義を 2行目へ 送った 口座が 3つ＋明細を 紙いっぱい★＝送った 行を 行数の 計算が 数えて いないと 紙の 下が 切れる（⑥） */
  '下限越え3口座': [1, 2, 3].map((i) => '北海道信用農業協同組合連合会　本所営業部　普通　123456' + i + '　トクヒ）ニホンコクサイキョウリョクセンターキョウカイ').join(NL),
  '6口座': [1, 2, 3, 4, 5, 6].map((i) => '見本銀行　見本第' + i + '支店　普通　123456' + i + '　カ）ミホンショウジ').join(NL),
};

function html(id, kouj, bank, gyou) {
  const inv = {
    id: 'iv_x', doc_type: 'invoice', no: 'X-1', issue_ymd: '2026-10-01', status: 'issued',
    tax_mode: 'exclusive', rounding: 'floor', template_id: id,
    lines: [{ name: '見本の品', qty: 1, unit: '式', price: 99999999, rate: 10 }, { name: '見本の食品', qty: 1, unit: '式', price: 1500, rate: 8 }]
      .concat(Array.from({ length: gyou || 0 }, (_, n) => ({ name: '見本の品 ' + (n + 1), qty: 1, unit: '式', price: 1000, rate: 10 }))),
    data: kouj ? { deductions: [{ name: '見本の控除', amount: 7310 }] } : {},
  };
  const tax = TAX.compute({ lines: inv.lines, taxMode: inv.tax_mode, rounding: inv.rounding });
  const ded = DOC.deductionsOf(inv).map((d) => ({ name: String(d.name || ''), amount: DOC.receiptAmountOf(d.amount) }));
  let h = PAPER.build({
    inv, tax, partner: { name: '例野商事', keisho: '御中' }, org: { yago: '見本合同会社', bank },
    cols: TPL.colsOf(inv), theme: TPL.getOrDefault(id).theme, deduct: DOC.deductTotalOf(inv), deductLines: ded,
  }).html;
  /* ★わざと 前の CSS に 戻す★ */
  if (WAZA) h = h.replace('table-layout:fixed;margin:0;}', 'table-layout:auto;margin:0;}').replace('.foot-r{width:74mm;', '.foot-r{width:1%;')
    .replace('.foot-l .note-bank{width:100%;box-sizing:border-box;}', '').replace('.note-b.note-bb{width:auto;min-width:0;', '.note-b.note-bb{width:auto;min-width:112mm;');
  return h;
}

console.log('\n[uchiwake-migi] 請求書の（内訳）は 右端に 固定・振込先の 箱と 重ならない' + (WAZA ? '  ★★前の CSS に 戻した 回★★' : ''));
/* ★様式が 本当に 違う 紙に なって いるか★（前の 版の 空振りを 止める） */
const kao = new Set(YOUSHIKI.map((id) => crypto.createHash('sha256').update(html(id, false, FURIKOMI.ふつう)).digest('hex')));
T('⓪ 7様式が 違う 紙に なって いる（' + kao.size + '種類）', kao.size === YOUSHIKI.length);
/* ★⑨ 折った 行が 字を 割って いない・字を 落として いない★（ブラウザ 無しで 見る） */
{
  const kata = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  const sp = (x) => x.replace(/[\s　]/g, '');
  for (const [k, bank] of Object.entries(FURIKOMI)) {
    if (!bank) continue;
    const rows = PAPER.bankKumi(PAPER.bankLines(bank)).map((r) => r.t);
    T('⑨ 振込先' + k + ' … サロゲートを 割らない', !rows.some((t) => kata.test(t)), JSON.stringify(rows));
    T('⑨ 振込先' + k + ' … 濁点だけで 始まる 行が 無い', !rows.some((t) => /^\p{M}/u.test(t)), JSON.stringify(rows));
    T('⑨ 振込先' + k + ' … 字を 落として いない', sp(rows.join('')) === sp(PAPER.bankLines(bank).join('')), JSON.stringify(rows));
  }
  /* ★折れ目は 長さで 変わる★＝1つの 例だけだと たまたま ペアの 境目で 折れて 空振りした（10-13 壊して 赤0 を 見た）。
     ★長さを 変えて 1040通り★（taiketsu 10-13 4回目と 同じ 組） */
  let ware = [], dakuten = [], otoshi = [];
  for (let a = 0; a < 8; a++) {
    for (let n = 10; n < 80; n++) {
      const L = '見本銀行　見本支店　普通　1234567　カ）' + 'あ'.repeat(a) + '𠮷'.repeat(n);
      const r = PAPER.bankKumi([L]).map((x) => x.t);
      if (r.some((t) => kata.test(t))) ware.push(a + '/' + n);
      if (sp(r.join('')) !== sp(L)) otoshi.push('吉' + a + '/' + n);
    }
    for (let n = 10; n < 70; n++) {
      const L = '見本銀行　見本支店　普通　1234567　' + 'あ'.repeat(a) + 'ガ'.repeat(n);
      const r = PAPER.bankKumi([L]).map((x) => x.t);
      if (r.some((t) => /^\p{M}/u.test(t))) dakuten.push(a + '/' + n);
      if (sp(r.join('')) !== sp(L)) otoshi.push('濁' + a + '/' + n);
    }
  }
  T('⑨ 𠮷 の 長さを 変えた 560通り … サロゲートを 割らない', ware.length === 0, ware.length + '通りで 割れた ' + ware.slice(0, 5).join(' '));
  T('⑨ 濁点（結合文字）の 長さを 変えた 480通り … 濁点だけで 始まる 行が 無い', dakuten.length === 0, dakuten.length + '通り ' + dakuten.slice(0, 5).join(' '));
  T('⑨ 1040通り … 字を 落として いない', otoshi.length === 0, otoshi.slice(0, 5).join(' '));
}

let mita = 0;
for (const name of ['webkit', 'chromium']) {
  const pw = await borrow('uchiwake-migi', name);
  if (!pw) continue;
  const br = await pwLaunch('uchiwake-migi', pw, undefined, name);
  const pg = await (await br.newContext({ viewport: { width: 1000, height: 1500 } })).newPage();
  for (const id of YOUSHIKI) for (const kouj of [false, true]) {
    const hidari = {};
    for (const [k, bank] of Object.entries(FURIKOMI)) {
      await pg.setContent(html(id, kouj, bank));
      const r = await pg.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const t = q('.rates'), sm = q('.sums'), bd = q('.foot-r .bd'), shs = document.querySelectorAll('.sheet'), sh = shs[shs.length - 1];   /* ★足元は 最後の 紙★ */
        if (!t || !sm) return null;
        const nb = q('.note-bank'), bb = q('.note-bb');
        const nos = [...document.querySelectorAll('.bank-no')].map((e) => getComputedStyle(e).fontSize);
        return {
          ratesL: t.getBoundingClientRect().left, ratesR: t.getBoundingClientRect().right, sumsR: sm.getBoundingClientRect().right,
          bdL: bd ? bd.getBoundingClientRect().left : null,
          boxR: nb ? nb.getBoundingClientRect().right : null,
          /* ★字の 右端は Range で 取る★（.note-bank は display:table＝字が 長いと 箱が 広がる＝scrollWidth は いつも 0・taiketsu 10-13） */
          jiR: bb ? (() => { const g = document.createRange(); g.selectNodeContents(bb); return g.getBoundingClientRect().right; })() : null,
          bbR: bb ? bb.getBoundingClientRect().right - parseFloat(getComputedStyle(bb).paddingRight || '0') : null,
          gyou: bb ? bb.querySelectorAll('br').length + 1 : 0,
          nos, sheetW: sh ? sh.scrollWidth - sh.clientWidth : 0, sheetH: sh ? sh.scrollHeight - sh.clientHeight : 0,
        };
      });
      const na = name + ' ' + id + (kouj ? '・控除' : '') + ' 振込先' + k;
      if (!r) { T(na + ' … 内訳か 合計が 描かれて いない', false); continue; }
      mita++;
      T('① ' + na, Math.abs(r.ratesR - r.sumsR) <= 1, '内訳の 右端 ' + Math.round(r.ratesR) + '／合計の 右端 ' + Math.round(r.sumsR));
      hidari[k] = r.ratesL;
      if (bank) {
        T('③ ' + na, r.boxR !== null && r.bdL !== null && r.boxR <= r.bdL + 0.5, '箱の 右端 ' + Math.round(r.boxR) + ' が 内訳の 枠の 左端 ' + Math.round(r.bdL) + ' を 越えた');
        T('④ ' + na, r.jiR !== null && r.jiR <= r.bbR + 0.5, '字の 右端 ' + Math.round(r.jiR) + ' が 箱の 中の 右端 ' + Math.round(r.bbR) + ' を 越えた');
        /* ★描いた 行＝行数の 計算が 数えた 行★（ずれると 紙の 下が 黙って 切れる） */
        const kazu = PAPER.bankKumi(PAPER.bankLines(bank)).length;
        T('⑦ ' + na, r.gyou === kazu, '描いた 行 ' + r.gyou + '／行数の 計算 ' + kazu);
        if (k === 'ふつう' || k === '長い名義') T('⑦ ' + na + ' … 1行', r.gyou === 1, '行 ' + r.gyou);
        if (k === '下限越え') T('⑦ ' + na + ' … 名義が 2行目', r.gyou === 2, '行 ' + r.gyou);
        if (/\d{5,8}/.test(bank)) T('⑤ ' + na, r.nos.length > 0 && r.nos.every((f) => Math.abs(parseFloat(f) - 13 * 96 / 72) < 0.2), '口座番号の 字の 大きさ ' + r.nos.join(','));
      }
      T('⑥ ' + na, r.sheetW <= 0 && r.sheetH <= 0, '紙から はみ出し 横 ' + r.sheetW + '／縦 ' + r.sheetH + 'px');
    }
    const ls = Object.values(hidari);
    T('② ' + name + ' ' + id + (kouj ? '・控除' : '') + ' … 振込先で 内訳の 左端が 動かない', Math.max(...ls) - Math.min(...ls) <= 1, ls.map(Math.round).join('／'));
  }
  /* ★⑧ 名義を 2行目へ 送った 3口座で 明細を 1行ずつ 増やしても 紙の 下が 切れない★
     ＝送った 行を 行数の 計算（bankRows＝bankKumi）が 数えて いるか。数えて いないと 最後の 紙の 中身が 下へ はみ出す（.sheet は overflow:hidden）。 */
  for (const id of ['std1', 'koujo', 'genba']) for (const kouj of [false, true]) {
    let kireta = [];
    for (let n = 8; n <= 26; n++) {
      await pg.setContent(html(id, kouj, FURIKOMI['下限越え3口座'], n));
      const r = await pg.evaluate(() => { const shs = document.querySelectorAll('.sheet'); const sh = shs[shs.length - 1]; return { h: sh.scrollHeight - sh.clientHeight, br: (document.querySelector('.note-bb') || { querySelectorAll: () => [] }).querySelectorAll('br').length }; });
      if (r.h > 0 || r.br !== 5) kireta.push(n + '行（はみ出し ' + r.h + 'px・行 ' + (r.br + 1) + '）');
    }
    T('⑧ ' + name + ' ' + id + (kouj ? '・控除' : '') + ' 下限越え3口座（6行）で 明細 8〜26行 … 紙の 下が 切れない', kireta.length === 0, kireta.join(' '));
  }
  await br.close();
}
for (const a of akaNa.slice(0, 40)) console.log('  ✗ ' + a);
if (akaNa.length > 40) console.log('  …ほか ' + (akaNa.length - 40) + '件');
if (mita === 0) { console.log('  🟡 ★未測定★ ブラウザを 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }
console.log('\n  測った 紙 ' + mita + '枚（7様式 × 控除 2 × 振込先 ' + Object.keys(FURIKOMI).length + ' × ブラウザ）');
if (WAZA) {
  /* ★わざと 戻した 回は 赤が 出れば 合格★（門が 空振りして いない 証し） */
  console.log('  わざと 戻した 回 … 赤 ' + fail + '件');
  if (fail > 0) { console.log('  ✓ ★前の CSS に 戻すと 赤に なる＝この 門は 空振りして いない★'); process.exit(0); }
  console.log('  ✗ ★★戻したのに 赤が 0件＝空振り★★'); process.exit(1);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
