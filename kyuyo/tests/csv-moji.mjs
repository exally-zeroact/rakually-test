/* csv-moji.mjs — ★勤怠CSV の 文字コードの 見分け★を 実ブラウザで 通す
 * ============================================================================
 * ★出来事の 順（★私の 見立ても 指示役1 の 見立ても 実物で 削れました★）★
 *  ⑴ 指示役1「半角カナだけの UTF-8 は Shift-JIS と 決めつけられて 化ける」
 *  ⑵ 私が 同じ 字を 動かして ★化ける事を 確かめた★（ﾃｽﾄ ﾀﾛｳ → ??ｽｽ?? ???幢ｽｳ）
 *  ⑶ 指示役1「勤怠が 化ける＝出る 給与が 変わる」
 *     ⇒ 私が `app.js:2211/2213` を 読み ★未一致は 画面に 出る／全部 未一致なら 断る★
 *     ⇒ ★黙って 給与が 変わる訳では ない★（指示役1 が ★自分の 言い方を 誤りと 訂正★）
 *  ⑷ ★更に 本当の 所★（この 紙を 作って いて 分かった）
 *     `kyuyo/lib/kintai-csv.js:36` … 氏名の 列は `/氏名|名前|従業員名|社員名|従業員|担当者/`
 *     ⇒ ★見出しに 必ず 漢字が 在る★＝★前の 見分けは この道では 誤作動しない★
 *     ⇒ ★私が 最初に 作った 見本（見出しが 英字）は アプリが そもそも 受け取らない★
 *        ＝★「未一致が 無い」で 緑に なって いた＝★偽の 緑★★（実測で 捕まえた）
 *  ⇒ ★★今の 結論＝「化ける 穴は 在るが、この 道からは 届かない」★★
 *     直し（`csvMojiYomu`）は ★修理では なく 予防★＝★そう 書いて おく★
 *
 * ★直し（`app.js` の `csvMojiYomu`／★2か所を 1か所に した★）★
 *   ★どんな 字が 入って いるかを 当てるのを やめる★
 *   ① BOM（EF BB BF）が 在れば UTF-8 で 確定
 *   ② `fatal:true` で UTF-8 として 読めるか 試す（通れば UTF-8／例外なら Shift-JIS）
 *   ＝★在る 字を 数え上げる 形は 必ず 漏れる★（々 ヶ 〆／記号だけ／英字だけ…）
 *
 * ★ここで見る事（★全部 お客さんの 道★＝本物の ファイル選択・取込は 押さない）★
 *   ㋐ UTF-8（氏名は 半角カナ）… ★反映される人: 1名★
 *   ㋑ 同じ 中身の Shift-JIS …… ★反映される人: 1名★
 *   ㋒ BOM つき UTF-8 ………………… ★反映される人: 1名★
 *   ㋓ ★見出しが 英字だけ★ ……… ★取り込めません と 断る★
 *      ＝★これが 符号の 穴を 塞いで いる 実物の 門★（この 紙が 空振りで ない 証し）
 *
 * ★わざと 前の 見分けに 戻す 回（--waza）★
 *   ⇒ ★4通りとも 同じ 結果に なる★ことを 数える
 *   ＝★この 直しが 客の 道の 振る舞いを 1つも 変えて いない（＝予防）★を 字で 出す。
 *   ★もし 違いが 出たら そこが 修理★＝その時は ここが 赤に なる。
  */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { kagiAru, hairu } = await import('../../tests/_hairu.mjs');
if (!(await kagiAru(ROOT))) {
  console.log('🟡 ★未測定★ ★本番の repo では 測りません★（試験用の 口が 居ません）');
  process.exit(0);
}
const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
const G = await import('./_souko-kazoeru.mjs');
const wk = await borrow('csv-moji', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

/* ★わざと 前の 見分けに 戻す★（repo は 1バイトも 触らない） */
const WAZA = process.argv.indexOf('--waza') >= 0;
const MON_MAE = 'function csvMojiYomu(buf){';
const MON_ATO = 'function csvMojiYomu(buf){'
  + " var t=new TextDecoder('utf-8',{fatal:false}).decode(buf);"
  + " if(t.indexOf(String.fromCharCode(0xFFFD))>=0 || !/[ぁ-んァ-ヴ一-龠]/.test(t)){"
  + " t=new TextDecoder('shift-jis').decode(buf); } return t;"
  + ' /* ★わざと 戻した★＝この 下は 死に字に なる（括弧は 足さない＝壊さない） */';
const MON_HONSU = 1;
let mongae = 0;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  if (WAZA && u.indexOf('/kyuyo/js/app.js') === 0) {
    const src = fs.readFileSync(p, 'utf8');
    mongae = src.split(MON_MAE).length - 1;
    rs.end(src.split(MON_MAE).join(MON_ATO));
    return;
  }
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await launch('csv-moji', wk);

let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★はかれない★ ' + n + (m ? ' … ' + m : '')); };

console.log('\n[csv-moji] 勤怠CSV の 文字コードの 見分け（実ブラウザ）'
  + (WAZA ? '  ★★わざと 前の 見分けに 戻した 回★★' : ''));
console.log('  ★席★ ' + G.seki() + '／★この 測りは 試験の 倉庫の 数です／本番では 未測定★');

const soukoMae = await G.kazoeru();
if (!soukoMae.ok) {
  if (G.kankyoKa(soukoMae.naze)) { console.log('  ' + G.kankyoIu('符号の 見分けを 測って いません')); await b.close(); srv.close(); process.exit(0); }
  MI('倉庫を 数えられない', soukoMae.naze); await b.close(); srv.close(); process.exit(1);
}

/* ★測る 字＝★半角カナ★（本物の 名前では ない）★ */
const NL = String.fromCharCode(10);
const KANA = 'ﾃｽﾄ ﾀﾛｳ';
const NA = G.shikenNa('ｶﾅ' + String(Date.now()).slice(-6)) + ' ' + KANA;
const U8 = (s2) => Buffer.from(new TextEncoder().encode(s2));

/* ★★氏名の 列は ★日本語の 見出し★でないと 認識されない★★（`kyuyo/lib/kintai-csv.js:36` 実測）
   `/氏名|名前|従業員名|社員名|従業員|担当者/` ⇒ ★見出しに 必ず 漢字が 在る★
   ⇒ 前の 見分け（日本語らしい 字が 無ければ Shift-JIS）は ★この道では 誤作動しない★
   ⇒ ★私が 最初に 作った 見本（見出しが 英字）は アプリが そもそも 受け取らない★
      ＝★「未一致が 無い」で 緑に なって いた＝偽の 緑★（2026-09-19 実測で 捕まえた）
   ⇒ 判じは ★「反映される人: 1名」が 出る事★＝★在る 字で 見る★（無い 字では 見ない）。 */
const SHU = '日付,氏名,労働時間';
/* ★Shift-JIS の 見本は ★記憶で 書かない★★＝バイトを 置いて ★復号して 合うか 先に 確かめる★ */
const SHU_SJ = Buffer.from([0x93, 0xFA, 0x95, 0x74, 0x2C, 0x8E, 0x81, 0x96, 0xBC, 0x2C,
  0x98, 0x4A, 0x93, 0xAD, 0x8E, 0x9E, 0x8A, 0xD4]);
/* ★★Shift-JIS の 見本は ★1バイトも 混ぜない★★（2026-09-19 実測で 踏んだ）
   ★私は 前置きを UTF-8・氏名だけ Shift-JIS で 継いだ★＝★1枚の 紙に 2つの 符号★
   ⇒ アプリでは なく ★私の 見本が 壊れて いた★のに ★アプリの 欠陥に 見えた★
   ⇒ ★使う 字だけの 小さい 符号器★を 作り、★復号して 元に 戻るか★を 先に 見る。 */
const SJ_HYO = { '手': [0x8E, 0xE8], 'ｶ': [0xB6], 'ﾅ': [0xC5], 'ﾃ': [0xC3], 'ｽ': [0xBD],
  'ﾄ': [0xC4], 'ﾀ': [0xC0], 'ﾛ': [0xDB], 'ｳ': [0xB3], 'C': [0x43], 'I': [0x49] };
function sjEnc(str) {
  const out = [];
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) { out.push(c); continue; }           /* ASCII は そのまま */
    if (SJ_HYO[ch]) { out.push(...SJ_HYO[ch]); continue; }
    return null;                                        /* ★知らない 字は 作らない★ */
  }
  return Buffer.from(out);
}
const naSj = sjEnc(NA);
const sjOk = new TextDecoder('shift-jis').decode(SHU_SJ) === SHU
  && !!naSj && new TextDecoder('shift-jis').decode(naSj) === NA;

const gyo = (na) => '2026-06-01,' + na + ',160';
const SHIRYO = [
  { na: '㋐ UTF-8（氏名は 半角カナ）', buf: U8(SHU + NL + gyo(NA)), hazu: 'はいる' },
  { na: '㋑ 同じ 中身の Shift-JIS', buf: Buffer.concat([SHU_SJ, U8(NL + '2026-06-01,'), naSj, U8(',160')]), hazu: 'はいる' },
  { na: '㋒ BOM つき UTF-8', buf: Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), U8(SHU + NL + gyo(NA))]), hazu: 'はいる' },
  { na: '㋓ ★見出しが 英字だけ★（符号の 穴を 塞いで いる 実物の 門）',
    buf: U8('date,name,hours' + NL + gyo(NA)), hazu: 'ことわる' },
];

let hito = null;
try {
  const h = await G.hitoTsukuru(NA);
  if (!h.ok) { MI('支度＝人を 作れない', h.naze); throw new Error('skip'); }
  hito = h.id;
  console.log('  ★支度★ 人 1（名前は ★半角カナ★ … ' + NA + '）');

  const pg = await b.newPage();
  const hai = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr]');
  if (!hai.haitta) { MI('アプリに 入れない', hai.naze || ('試した ' + hai.kai + '回')); throw new Error('skip'); }

  /* ★覆い（クラウドの 最新を 読みますか）は 先に 答える★＝OK は 画面を 開き直す */
  const ooiNiKotaeru = async () => {
    const aru = await pg.evaluate(() => {
      const ov = document.querySelector('.ui-modal-ov');
      return ov ? (ov.textContent || '').split(String.fromCharCode(10)).join(' ').trim().slice(0, 30) : '';
    }).catch(() => '');
    if (!aru) return '';
    const bs = await pg.$$('.ui-modal-btn').catch(() => []);
    for (const btn of bs) {
      const ji = (await btn.textContent().catch(() => '')) || '';
      const oya = await btn.evaluate((e) => e.className.indexOf('primary') >= 0).catch(() => false);
      if (oya || ji.indexOf('OK') >= 0) {
        if (await btn.click({ timeout: 4000 }).then(() => true).catch(() => false)) {
          console.log('  ★覆いに 答えた【本物の click】★ … ' + aru); return ji;
        }
      }
    }
    return '';
  };
  for (let i = 0; i < 24; i++) { if (await ooiNiKotaeru()) { await new Promise((r) => setTimeout(r, 2500)); break; } await new Promise((r) => setTimeout(r, 250)); }

  if (WAZA) T('★わざ 差し替えが 効いた（' + mongae + 'か所）★', mongae === MON_HONSU, '★外したつもり★');

  T('★見本の Shift-JIS が 本当に その 字か（記憶で 書かず 復号して 確かめた）★', sjOk,
    '★見本の バイトが 思った 字に ならない＝この先は 測れません★');
  if (!sjOk) throw new Error('skip');

  for (const s of SHIRYO) {
    /* ★お客さんの 道＝本物の ファイル選択★（`#kintai-file` に 物を 置く） */
    const nyu = await pg.$('#kintai-file');
    if (!nyu) { MI(s.na, '取込の 入口（#kintai-file）が 無い'); continue; }
    await nyu.setInputFiles({ name: 'kintai.csv', mimeType: 'text/csv', buffer: s.buf });
    let ji = '';
    for (let i = 0; i < 120; i++) {
      ji = await pg.evaluate(() => {
        const m = document.querySelector('.ui-modal-b');
        return m ? (m.textContent || '').trim() : '';
      }).catch(() => '');
      if (ji) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ji) { MI(s.na, '30秒 待っても 覆いが 出ない'); continue; }
    /* ★在る 字で 見る★＝「反映される人: 1名」が 出たか（「未一致が 無い」では 見ない） */
    const hairi = ji.indexOf('反映される人: 1名') >= 0;
    const kotowari = ji.indexOf('取り込めません') >= 0;
    console.log('    ── ' + s.na + ' … アプリの 言い分「'
      + ji.split(String.fromCharCode(10)).join(' ').slice(0, 76) + '」');
    if (s.hazu === 'はいる') {
      T(s.na + ' … ★「反映される人: 1名」が 出る★', hairi,
        '出た 字に 在りません（断り ' + kotowari + '）');
    } else {
      T(s.na + ' … ★取り込めません と 断る★', kotowari && !hairi, '断って いません');
    }
    /* ★★覆いは ★消えるまで★ 閉じる★★（2026-09-19 実測で 踏んだ）
       断りは `uiAlert`＝札が ★「OK」だけ★。キャンセルを 探すと ★閉じられず★
       ★次の 回が 前の 字を 読む★＝★前の 結果を 次の 結果として 数える★。
       ⇒ ★どの 札でも 押して 覆いが 消えるまで 見る★（取込の「OK」は ここでは 出ない
         ＝断りの 覆いしか 残らない／取り込む 覆いは キャンセルが 在る）。 */
    for (let i = 0; i < 12; i++) {
      const nokori = await pg.evaluate(() => !!document.querySelector('.ui-modal-ov')).catch(() => false);
      if (!nokori) break;
      const bs = await pg.$$('.ui-modal-btn').catch(() => []);
      let osita = false;
      for (const btn of bs) {
        const t2 = (await btn.textContent().catch(() => '')) || '';
        if (t2.indexOf('キャンセル') >= 0 || t2.indexOf('閉じる') >= 0 || t2.indexOf('OK') >= 0) {
          osita = await btn.click({ timeout: 3000 }).then(() => true).catch(() => false);
          if (osita) break;
        }
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    const nokotta = await pg.evaluate(() => !!document.querySelector('.ui-modal-ov')).catch(() => false);
    if (nokotta) { MI(s.na + ' の 後始末', '★覆いが 閉じない＝次の 回が 前の 字を 読みます★'); break; }
  }
} catch (e) {
  if (String(e && e.message) !== 'skip') MI('途中で 止まった', String(e && e.message || e).slice(0, 120));
} finally {
  if (hito) {
    const m = await G.meisaiKesu(hito).catch(() => null);
    if (m && m.ok === false) console.log('  🟡 明細を 消せなかった … ' + m.naze);
    const k = await G.hitoKesu(hito).catch(() => null);
    if (k && k.ok === false) console.log('  🟡 人を 消せなかった … ' + k.naze);
  }
  await b.close().catch(() => null);
  srv.close();
}

const sou = await G.awaseru(soukoMae, 20);
if (sou.han === '環境') { mi++; console.log('  ' + sou.iu); }
else if (sou.han === '未測定') { mi++; console.log('  🟡 ★未測定★ 後始末を 倉庫で 数えられない … ' + sou.iu); }
else if (sou.han === '緑') { pass++; console.log('  ✓ ★倉庫が 支度の ぶん しか 動いて いない★ … ' + sou.iu); }
else { fail++; console.log('  ✗ ★倉庫が 戻って いない★ — ' + sou.iu); }

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (mi ? ', ' + mi + ' ★はかれない★' : ''));
process.exit(fail ? 1 : 0);
