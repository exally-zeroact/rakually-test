/* hozon-fuda-ui.mjs — ★保存できなかった 時に どの 画面でも 客に 見えるか★（実ブラウザ・WebKit）
 * ============================================================================
 * ★なぜ（2026-10-02）★
 *   保存の 失敗の 字は #save-status（★入力画面の 帯の 中★）にしか 書かれず、
 *   ★設定・一覧・印刷・振込の 4画面では 1文字も 出なかった★＝客は 保存できていないのに 気づかない。
 *   直し＝下の ナビの すぐ上に ★帯 #save-alert★ を 1つ 固定し、失敗の 道から 種類（'ng'/'ok'）を 渡して 出し入れする。
 *   （toast は 1枚を 上書きする＝後の 札が 前の 札を 消すので 使わない／指示役と 決めた）
 *
 * ★ここで 見る 事（★印や hidden では なく ★その 場所に 何が 描かれて いるか★（elementFromPoint）で 見る）★
 *   ④ 開いた 直後（何も しない）は 帯が 出ていない（★わざと 書かなかった 物の 嘘の 警告 止め★）
 *   ① 設定画面で 倉庫への 書きが 落ちたら ★帯が 描かれる★（(a) 網で 落とす／(b) 偽の 500）
 *      ★どちらの 道に 入ったか★（落ちた＝reject の 後／返事が ok:false）を 出しに 出す
 *   ② 下へ 巻いても 帯は 同じ 所に 在る／★失敗が 続いて もう1回 打っても 消えない★
 *   ③ 書きを 通して 打つと ★帯が 消える★（保存できた 時だけ 消す）
 *   ⑤ iPhone の 幅（390px）でも ① が 同じ
 *   ⑥ 入力画面で「今月を確定」の 帯と 重ならない（帯の 真ん中に 帯／確定の 真ん中に 確定ボタン・既定と 390px）
 * ★倉庫の 中身は 動かさない★ … 違う 値を 打つのは ★書きを 止めて いる 間だけ★／書きを 通す ③は ★元の 値★を 打つ
 * ★わざと 壊す 回（--waza）★ … 配る 時だけ setS から 帯への 1行を 外す ⇒ ① が 赤
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { kagiAru, hairu, shizumaru } = await import('../../tests/_hairu.mjs');
if (!(await kagiAru(ROOT))) {
  console.log('🟡 ★未測定★ ★本番の repo では 測りません★（試験用の 口が 居ません）');
  process.exit(0);
}
const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
const wk = await borrow('hozon-fuda-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const WAZA = process.argv.indexOf('--waza') >= 0;
const MON_MAE = 'if(e) e.textContent=t; hozonFuda(kind, t); };';
const MON_ATO = 'if(e) e.textContent=t; };';
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
const URL = 'http://localhost:' + srv.address().port + '/kyuyo/index.html';
const b = await launch('hozon-fuda-ui', wk);

let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★はかれない★ ' + n + (m ? ' … ' + m : '')); };
const matsu = (ms) => new Promise((r) => setTimeout(r, ms));
const RAN = '#c-payday-day';
const SHIZEN = { list: [], get n() { return this.list.reduce((a, k) => a + k.shizen, 0); } };

/* ★帯が 描かれて いるか★＝★下の ナビの すぐ上★の 点に ★帯（か その中）★が 返るか
   ★点は 帯の 箱からは 取らない★（帯が 無い／隠れて いる時も 同じ 点を 見る）＝下の ナビの 上端 から 8px 上 */
const obiWoMiru = (pg) => pg.evaluate(() => {
  const bn = document.querySelector('.botnav');
  const ob = document.getElementById('save-alert');
  if (!bn) return { naze: '下の ナビが 無い' };
  const r = bn.getBoundingClientRect();
  const x = Math.round(window.innerWidth / 2), y = Math.round(r.top - 8);
  const el = document.elementFromPoint(x, y);
  const t = (document.getElementById('app-toast') || {});
  return {
    mieru: !!(ob && el && (el === ob || ob.contains(el))),
    ji: ob ? (ob.textContent || '') : null,
    ten: x + ',' + y,
    soko: el ? (el.id ? '#' + el.id : el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '')) : 'なし',
    toast: (t.textContent || '') && t.offsetParent ? t.textContent : '',
  };
});

/* ★覆いの 箱（別の 端末で 更新／未読込）が 点に 乗って いたら★ … ★道を 分けて 出し、「いいえ」で 閉じてから 取り直す★
   （客でも 箱が 帯の 上に 乗る 事は 在る＝★緩めない★：閉じた 後に 帯が 無ければ 赤） */
async function obiWoMiruHakoKoe(pg, na) {
  let o = await obiWoMiru(pg);
  if (/ui-modal-ov/.test(o.soko)) {
    const ji = await pg.$eval('.ui-modal-ov', (e) => (e.innerText || '').replace(/\s+/g, ' ').slice(0, 60)).catch(() => '');
    console.log('    ── ' + na + ' … ★点に 覆いの 箱★「' + ji + '」＝別の 端末の 箱が 出た 道 ⇒「いいえ」で 閉じて 取り直す');
    await pg.evaluate(() => {
      const y = Array.from(document.querySelectorAll('.ui-modal-ov button')).find((e) => /^(いいえ|キャンセル)$/.test(e.textContent.trim()));
      if (y) y.click();
    });
    await matsu(800);
    o = await obiWoMiru(pg);
  }
  return o;
}

/* ★倉庫への 書き★を どう 扱うか（'tosu'＝通す／'otosu'＝網で 落とす／'500'＝偽の 500） */
async function hiraku(haba) {
  const cx = await b.newContext(haba ? { viewport: { width: haba, height: 844 } } : {});
  const pg = await cx.newPage();
  const kaki = { mode: 'tosu', otoshita: 0, nise500: 0, zen: 0, wazato: new WeakSet(), shizen: 0, shizenKaki: 0 };
  /* ★自然に 落ちた 要求★（網で わざと 落とした 物は 除く）＝倉庫への 線が 約19秒で 丸ごと 落ちる 回を 数える */
  /* ★最後に 返った 書き★が どう 終わったか（'ok'＝2xx で 返った／'ng'＝落ちた・4xx/5xx）＝④の 判じは これ 1つで 決める */
  kaki.saigo = null;
  pg.on('requestfinished', async (r) => {
    const m = r.method();
    if (String(r.url()).indexOf('/rest/v1/pay_') < 0 || m === 'GET' || m === 'HEAD') return;
    const res = await r.response().catch(() => null);
    kaki.saigo = (res && res.status() < 400) ? 'ok' : 'ng';
  });
  pg.on('requestfailed', (r) => {
    const m0 = r.method();
    if (String(r.url()).indexOf('/rest/v1/pay_') >= 0 && m0 !== 'GET' && m0 !== 'HEAD') kaki.saigo = 'ng';
    if (String(r.url()).indexOf('/rest/v1/') >= 0 && !kaki.wazato.has(r)) {
      kaki.shizen++;
      const m = r.method();
      if (m !== 'GET' && m !== 'HEAD') kaki.shizenKaki++;
    }
  });
  await pg.route('**/rest/v1/pay_**', (rt) => {
    const m = rt.request().method();
    if (m === 'GET' || m === 'HEAD') return rt.continue();
    kaki.zen++;
    if (kaki.mode === 'tosu') return rt.continue();
    if (kaki.mode === 'otosu') { kaki.otoshita++; kaki.wazato.add(rt.request()); return rt.abort(); }
    kaki.nise500++;
    return rt.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: kaki.nise500Ji || 'わざと 落とした（試験）', code: 'XX000' }) });
  });
  const hai = await hairu(pg, URL, '.bn[data-scr]');
  if (!hai.haitta) return { naze: 'アプリに 入れない … ' + (hai.naze || ('試した ' + hai.kai + '回')), cx };
  await shizumaru(pg, 2000, 20000);
  for (let i = 0; i < 30; i++) {
    if (await pg.click('.bn[data-scr="scr-settings"]', { timeout: 1000 }).then(() => true).catch(() => false)) break;
    await matsu(300);
  }
  await matsu(1200);
  /* ★設定を 押した 時の 保存が 返るまで 待つ★（★返る 前に 書きを 落とす 形へ 切り替えると、打った 後の 保存が
     その 後ろで 待たされ 出て こない＝列の 数で「待った 1」と 出た 回が 在った★） */
  await shizumaru(pg, 2000, 20000);
  if (!(await pg.$(RAN))) return { naze: '設定に ' + RAN + ' が 無い', cx };
  /* ★返って いない 要求★を 控える（★書きが 出ない 回の 訳★を 出す 為） */
  kaki.tochu = new Map();
  pg.on('request', (r) => { if (String(r.url()).indexOf('/rest/v1/') >= 0) kaki.tochu.set(r, Date.now()); });
  const owari = (r) => kaki.tochu.delete(r);
  pg.on('requestfinished', owari); pg.on('requestfailed', owari);
  pg._kaki = kaki;
  SHIZEN.list.push(kaki);
  return { pg, cx, kaki };
}
/* ★キーで 打つ★→ 保存が 返るまで 待つ
   ★書きを 止めて いる 間★は ★今と 違う 値★を 打つ（同じ 値だと 保存が 出ない 事が 在る＝390px で 0本だった）
   ★書きを 通す 時★は ★元の 値★を 打つ＝★倉庫の 中身は 元の まま★ */
async function utsu(pg, v) {
  const k0 = pg._kaki; const _mae = k0.zen;
  await pg.click(RAN);
  await pg.keyboard.press('Control+A');
  await pg.keyboard.press('Backspace');
  await pg.keyboard.type(String(v), { delay: 40 });
  await pg.keyboard.press('Tab');
  /* ★時間で 待たない★＝★書きが 1本 出るまで★ 待つ（上限 40秒・出なければ 呼ぶ 側が 未測定に する）
     ★40秒の 訳★ … 倉庫への 線が ときどき 丸ごと 止まり ★約19秒で 落ちて 返る★（2026-10-02 実測 18,973〜18,983ms・
       WebKit でも Chromium でも 10回に 1回）。その間 次の 保存は 列で 待つ ⇒ 15秒では 足りなかった */
  const k = k0, mae = _mae;
  for (let i = 0; i < 160 && k.zen === mae; i++) await matsu(250);
  await matsu(1500);
  if (k.zen === mae) {
    /* ★書きが 出なかった 訳を 出す★（列の 数・送った 数） */
    const naze = await pg.evaluate(() => {
      const S = window.Store || {};
      const f = (n) => { try { return typeof S[n] === 'function' ? JSON.stringify(S[n]()).slice(0, 300) : '口が 無い'; } catch (e) { return '転んだ ' + e; } };
      return { retsu: f('retsuNoKazu'), okutta: f('okuttaNoKazu'), machi: f('machiNoKazu'), ran: (document.querySelector('#c-payday-day') || {}).value, act: (document.activeElement || {}).id || (document.activeElement || {}).tagName };
    }).catch((e) => ({ err: String(e) }));
    console.log('       🟡 書きが 出なかった … ' + JSON.stringify(naze));
    const ima = Date.now();
    console.log('       🟡 返って いない 要求 ' + k.tochu.size + '本 … ' + [...k.tochu.entries()].map(([r, t]) => r.method() + ' ' + String(r.url()).split('/rest/v1/')[1].split('?')[0] + ' ' + (ima - t) + 'ms').join('／'));
  }
  return v;
}
const chigau = (moto) => (String(moto) === '20' ? '15' : '20');
function michi(o) { return /ローカルのみ/.test(o.ji) ? '落ちた（reject の 後）' : /クラウド未保存/.test(o.ji) ? '返事が ok:false' : '不明（字「' + o.ji + '」）'; }

console.log('\n[hozon-fuda-ui] 保存できなかった 時に どの 画面でも 見えるか（実ブラウザ）' + (WAZA ? '  ★★わざと 帯への 1行を 外した 回★★' : ''));
try {
  const A = await hiraku(0);
  if (!A.pg) { MI('設定画面まで 行けない', A.naze); throw new Error('skip'); }
  if (WAZA) T('★わざ 差し替えが 効いた（' + mongae + 'か所）★', mongae === 1, '★外したつもり★');

  /* ── ④ 開いた 直後 ── */
  const o4 = await obiWoMiru(A.pg);
  console.log('    ── ④ 開いた 直後 … 点 ' + o4.ten + ' に 在る 物 ' + o4.soko + '／帯の 字「' + o4.ji + '」');
  /* ★開いた 時の 保存が ★自然に 落ちた★ 回は 帯が 出るのが 正しい★＝★道を 分けて 出す（緩めない）★
     ★落ちて いないのに 帯が 出たら 赤★ */
  if (!WAZA) {
    /* ★判じる 前に 返って いない 要求が 0に なるまで 待つ★（線が 落ちる 回は 約19秒で 束ごと 返る・上限 40秒）
       ★一度 間違えた 形★ … 「何か 1本 自然に 落ちた ⇒ 帯が 出る」で 判じて 赤に した（20回中 1回）。
         その 時 落ちて いたのは 1本で、★保存の 束は まだ 返って いなかった★＝帯が 出ないのが 正しい 時だった
       ★判じは「★最後に 返った 書き★が どう 終わったか」★（指示役）＝1本 落ちても 次の 書きが 通れば 帯は 消えるのが 正しい */
    for (let i = 0; i < 160 && A.kaki.tochu.size; i++) await matsu(250);
    const o4b = await obiWoMiru(A.pg);
    if (A.kaki.tochu.size) MI('④', '返って いない 要求が 40秒 たっても ' + A.kaki.tochu.size + '本 残る');
    else if (A.kaki.saigo === 'ng') {
      console.log('    ── ④ 開いた 時の ★最後の 書きが 自然に 落ちた★（落ちた 書き ' + A.kaki.shizenKaki + '本／要求 ' + A.kaki.shizen + '本）⇒「保存が 落ちて 帯が 出る」道');
      T('★④ 最後の 書きが 落ちた 道＝帯が 出ている（正しい・字「' + o4b.ji + '」）★', o4b.mieru, '最後の 書きが 落ちたのに 帯が 出ない');
    } else {
      T('★④ 最後の 書きが 通った（' + A.kaki.saigo + '）なら 帯は 出ない（嘘の 警告が 無い・落ちた 書き ' + A.kaki.shizenKaki + '本／要求 ' + A.kaki.shizen + '本）★', !o4b.mieru, '帯「' + o4b.ji + '」');
    }
  }

  /* ── ① (a) 網で 落とす ── */
  const moto = await A.pg.$eval(RAN, (x) => x.value);
  A.kaki.mode = 'otosu';
  const v = await utsu(A.pg, chigau(moto));
  const oa = await obiWoMiruHakoKoe(A.pg, '①(a)');
  console.log('    ── ①(a) 「' + v + '」を 打った／網で 落とした 書き ' + A.kaki.otoshita + '本／道＝' + michi(oa) + '／点 ' + oa.ten + ' に ' + oa.soko + (oa.toast ? '／toast「' + oa.toast + '」' : ''));
  if (A.kaki.otoshita === 0) MI('①(a)', '書きが 1本も 出ていない＝落とせていない');
  else if (WAZA) T('★わざ① 帯への 1行を 外したら 帯が 描かれない★', !oa.mieru, '★外しても 描かれる＝①は 何を しても 緑★');
  else T('★①(a) 書きが 落ちたら 設定画面に 帯が 描かれる（字「' + oa.ji + '」）★', oa.mieru && !!oa.ji, '点に 在るのは ' + oa.soko);

  if (!WAZA) {
    /* ── ② 巻いても 付いて来る／もう1回 失敗しても 消えない ── */
    await A.pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await matsu(400);
    const o2 = await obiWoMiruHakoKoe(A.pg, '②');
    T('★② 下へ 巻いても 帯が 同じ 所に 在る（点 ' + o2.ten + ' に ' + o2.soko + '）★', o2.mieru, '巻いたら 帯が 消えた');
    await A.pg.evaluate(() => window.scrollTo(0, 0));
    await matsu(300);

    /* ── ① (b) 偽の 500 ── */
    A.kaki.mode = '500';
    await utsu(A.pg, moto);
    const ob = await obiWoMiruHakoKoe(A.pg, '①(b)');
    console.log('    ── ①(b) 偽の 500 ' + A.kaki.nise500 + '本／道＝' + michi(ob));
    if (A.kaki.nise500 === 0) MI('①(b)', '書きが 1本も 出ていない');
    else T('★①(b)・② 偽の 500 でも 帯が 描かれた まま（字「' + ob.ji + '」）★', ob.mieru && !!ob.ji, '点に 在るのは ' + ob.soko);

    /* ── ③ 通して 打つと 消える ── */
    A.kaki.mode = 'tosu';
    await utsu(A.pg, moto);
    console.log('    ── ③ 元の 値「' + moto + '」に 戻して 書きを 通した');
    const o3 = await obiWoMiru(A.pg);
    T('★③ 書きが 通ったら 帯が 消える（点 ' + o3.ten + ' に ' + o3.soko + '）★', !o3.mieru, '帯「' + o3.ji + '」が 残った');
  }
  await A.cx.close();

  /* ── ⑤ iPhone の 幅 ── */
  if (!WAZA) {
    const B = await hiraku(390);
    if (!B.pg) MI('⑤ 390px で 設定画面まで 行けない', B.naze);
    else {
      B.kaki.mode = 'otosu';
      await utsu(B.pg, chigau(await B.pg.$eval(RAN, (x) => x.value)));
      const o5 = await obiWoMiruHakoKoe(B.pg, '⑤');
      console.log('    ── ⑤ 390px … 落とした 書き ' + B.kaki.otoshita + '本／点 ' + o5.ten + ' に ' + o5.soko);
      if (B.kaki.otoshita === 0) MI('⑤', '書きが 1本も 出ていない');
      else T('★⑤ iPhone の 幅（390px）でも 帯が 描かれる★', o5.mieru && !!o5.ji, '点に 在るのは ' + o5.soko);
      await B.cx.close();
    }
  }

  /* ── ⑥ 入力画面＝「今月を確定」の 帯と 重ならない（★帯も 確定ボタンも 両方 描かれて いる★） ──
     ★なぜ★ … 確定の 帯も 下のナビの 上に 貼り付く（sticky・同じ z）。直す前は 確定の 帯の 下の 警告の 箱が
       ★この 帯を 隠した★（指示役が 読んで 見つけ、2026-10-02 実測で 確かめた）⇒ 帯が 出て いる 間は --sa-h で 確定の 帯を 持ち上げる */
  if (!WAZA) {
    for (const haba of [0, 390]) {
      const C = await hiraku(haba);
      if (!C.pg) { MI('⑥ 入力画面（幅 ' + (haba || '既定') + '）', C.naze); continue; }
      for (let i = 0; i < 30; i++) {
        if (await C.pg.click('.bn[data-scr="scr-input"]', { timeout: 1000 }).then(() => true).catch(() => false)) break;
        await matsu(300);
      }
      await matsu(1500);
      await shizumaru(C.pg, 2000, 20000);
      if (!(await C.pg.$('[data-confirm-month]'))) { MI('⑥ 幅 ' + (haba || '既定'), '確定の ボタンが 出ていない'); await C.cx.close(); continue; }
      /* 390px の 回は ★長い 理由の 偽の 500★ で 落とす＝帯の 字が 折り返し、⑦で 幅を 広げると 高さが 変わる */
      if (haba === 390) {
        C.kaki.nise500Ji = 'わざと 落とした（試験・折り返しを 作る 為の 長い 理由の 字です。幅を 変えると 帯の 高さが 変わります）';
        C.kaki.mode = '500';
      } else C.kaki.mode = 'otosu';
      const mae = C.kaki.zen;
      /* ★書きを 落として いる 間だけ★ 入力画面の 欄を 1つ 打つ（倉庫には 届かない） */
      const aru = await C.pg.$$eval('#input-list input:not([type=checkbox]):not([type=hidden]):not([readonly]):not([disabled])', (a) => {
        const e = a.find((x) => x.offsetParent); if (!e) return false; e.setAttribute('data-hf6', '1'); return true;
      });
      if (!aru) { MI('⑥ 幅 ' + (haba || '既定'), '入力画面に 打てる 欄が 無い'); await C.cx.close(); continue; }
      await C.pg.click('[data-hf6="1"]');
      await C.pg.keyboard.press('Control+A');
      await C.pg.keyboard.type('7');
      await C.pg.keyboard.press('Tab');
      for (let i = 0; i < 160 && C.kaki.zen === mae; i++) await matsu(250);
      await matsu(2000);
      const o6 = await C.pg.evaluate(() => {
        const ob = document.getElementById('save-alert'), bt = document.querySelector('[data-confirm-month]');
        const naka = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
        const nani = (e) => { if (!e) return 'なし'; return e.id ? '#' + e.id : e.tagName + (e.className ? '.' + String(e.className).split(' ')[0] : ''); };
        const po = ob && !ob.hidden ? naka(ob) : null, pb = bt ? naka(bt) : null;
        const eo = po && document.elementFromPoint(po.x, po.y), eb = pb && document.elementFromPoint(pb.x, pb.y);
        return { obi: !!(eo && (eo === ob || ob.contains(eo))), obiSoko: nani(eo), btn: !!(eb && (eb === bt || bt.contains(eb))), btnSoko: nani(eb), ji: ob ? ob.textContent : '' };
      });
      const na = '幅 ' + (haba || '既定');
      console.log('    ── ⑥ 入力画面 ' + na + ' … 落とした 書き ' + (C.kaki.otoshita + C.kaki.nise500) + '本／帯の 真ん中に ' + o6.obiSoko + '／確定の 真ん中に ' + o6.btnSoko);
      if (C.kaki.otoshita + C.kaki.nise500 === 0) MI('⑥ ' + na, '書きが 1本も 出ていない');
      else T('★⑥ 入力画面（' + na + '）で 帯も 確定ボタンも 描かれて いる（重ならない）★', o6.obi && o6.btn,
        '帯の 真ん中に ' + o6.obiSoko + '／確定の 真ん中に ' + o6.btnSoko);
      /* ── ⑦ 帯が 出た まま 幅を 変える（390→700）＝折り返しで 帯の 高さが 変わっても 重ならない ──
         （指示役：--sa-h は 帯を 出し入れした 時にしか 測って いなかった＝幅の 受け手でも 測り直す） */
      if (haba === 390 && C.kaki.nise500 > 0) {
        const takasaMae = await C.pg.$eval('#save-alert', (e) => Math.round(e.getBoundingClientRect().height));
        await C.pg.setViewportSize({ width: 700, height: 844 });
        await matsu(800);
        const o7 = await C.pg.evaluate(() => {
          const ob = document.getElementById('save-alert'), bt = document.querySelector('[data-confirm-month]');
          const naka = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
          const po = naka(ob), pb = naka(bt);
          const eo = document.elementFromPoint(po.x, po.y), eb = document.elementFromPoint(pb.x, pb.y);
          const nani = (e) => (!e ? 'なし' : e.id ? '#' + e.id : e.tagName + (e.className ? '.' + String(e.className).split(' ')[0] : ''));
          return { takasa: Math.round(ob.getBoundingClientRect().height), sah: getComputedStyle(document.documentElement).getPropertyValue('--sa-h').trim(),
            obi: !!(eo && (eo === ob || ob.contains(eo))), obiSoko: nani(eo), btn: !!(eb && (eb === bt || bt.contains(eb))), btnSoko: nani(eb) };
        });
        console.log('    ── ⑦ 幅 390→700 … 帯の 高さ ' + takasaMae + '→' + o7.takasa + 'px／--sa-h ' + o7.sah + '／帯の 真ん中に ' + o7.obiSoko + '／確定の 真ん中に ' + o7.btnSoko);
        if (o7.takasa === takasaMae) MI('⑦', '幅を 変えても 帯の 高さが 変わらない（' + o7.takasa + 'px）＝測り直しを 試せて いない');
        else T('★⑦ 幅を 変えて 帯の 高さが 変わっても 帯も 確定ボタンも 描かれて いる（--sa-h ' + o7.sah + '＝帯 ' + o7.takasa + 'px）★',
          o7.obi && o7.btn && o7.sah === o7.takasa + 'px', '帯の 真ん中に ' + o7.obiSoko + '／確定の 真ん中に ' + o7.btnSoko + '／--sa-h ' + o7.sah);
      }
      await C.cx.close();
    }
  }
} catch (e) {
  if (String(e && e.message) !== 'skip') MI('途中で 止まった', String(e && e.message || e).slice(0, 160));
} finally {
  await b.close().catch(() => null);
  srv.close();
}
console.log('    ── ★自然に 落ちた 要求（この 回 全部）★ … ' + SHIZEN.n + '本' + (SHIZEN.n ? '' : '（＝落ちた 時の 道は この 回 未測定）'));
if (WAZA) console.log('\n★わざと 帯への 1行を 外した 回の 読み方★ … ★① が 崩れれば 門は 効いている★');
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (mi ? ', ' + mi + ' ★はかれない★' : ''));
process.exit(fail ? 1 : (mi ? 2 : 0));
