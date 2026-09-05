/* souko-machi.mjs — ★倉庫の 答えが 遅れても 画面が 動かない／押させない／黙らない★
 * =============================================================================
 * ★なぜ（2026-09-05 実測 → 指示役の裁定・案D）★
 *   入力画面は ★端末の 写しで 先に 描き、あとから 倉庫の 本物で 丸ごと 差し替えて★いた。
 *   ★犯人は 1つずつ 遅らせて 測って 突き止めた★（推し量って 直さない）:
 *     法定データ(getStatutory)   … ずれ ★0px★
 *     確定明細(getPayslipsByYm)  … ずれ ★0px★
 *     ★倉庫の状態(cloudLoadState)★ … ずれ ★3737px★
 *       前＝従業員 1人「県が未選択」 → 後＝従業員 19人
 *       ＝★1人だと 嘘を 見せていた★（★裁定④「先に描いて後で消す」と 同じ形★）
 *
 * ★直し（案D＋3つ）★
 *   ①★人の 一覧は 倉庫の 答えが 来るまで 描かない★（二度 描かない＝1pxも 動かない）
 *   ②★答えが 来るまで「今月を確定」は 押せない★（★理由を 札の 中に 書く★＝灰色だけは ×）
 *   ③★つながらなかった 時は 失敗と 言う★（空のまま／永久に 読み込み中 は ×）
 *
 * ★ここで 固定する事★（375/390/412 の 3つの 幅で）
 *   ①★動く その間は 押せない★／★押せるように なった あとは 0px★
 *      ★指示役の 注文は「0px」だった★が、★人の 一覧が ボタンの 上に 在る 以上
 *        0人→本物 に なった 時に 下が 下がるのは 避けられない★（実測 2674〜3963px）。
 *      ⇒★危ないのは「指の 下から 逃げる」事★なので、
 *        ★動く 間は 押せない／動き終わってから 0px★ に 測る物を 直した（便で 報告ずみ）。
 *   ②遅れている 間は ★押せない★／★理由が 字で 出ている★（灰色に するだけは ×）
 *   ③失敗させたら ★失敗と 出て、押せないまま★／★もう一度 読み込む が 在る★
 *   ④★空の 一覧を 出さない★＝「0人」に 見せない
 *
 * 使い方: node kyuyo/tests/souko-machi.mjs [--self-test]
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

/* ★物差しそのもの★（ブラウザを 使わない） */
export function zure(mae, ato) { return Math.round(ato - mae); }
export function machiOk(fuda) {           /* 札の 中に 理由が 書いてあるか */
  return /読み込み中|つながりません/.test(String(fuda || ''));
}

if (SELF) {
  console.log('\n[souko-machi] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('動いていなければ 0', zure(500, 500) === 0);
  say('★実測の 3737px を 見つける★', zure(850, 4587) === 3737);
  say('1px でも 見つける', zure(500, 501) === 1);
  say('★理由が 書いてある 札は 通す★', machiOk('今月を確定（読み込み中です）') === true);
  say('★理由が 書いてある 札（失敗）も 通す★', machiOk('今月を確定（クラウドに つながりません）') === true);
  say('★灰色に するだけ（理由を 言わない）は 通さない★', machiOk('今月を確定（台帳・年調に反映）') === false);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★6通り ぜんぶ 思った通り★');
  process.exit(0);
}

/* ── ここから 実ブラウザ ───────────────────────────────── */
let borrow, pwLaunch, hairu, osu;
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu } = await import('../../tests/_hairu.mjs'));
} catch (e) { console.log('🟡 ★未測定★ 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('souko-machi', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('souko-machi', wk);

let pass = 0, fail = 0, mihakari = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));

/* ★倉庫の 答えを わざと 遅らせる／わざと 失敗させる★（アプリ自身の 道は 変えない） */
const shikomu = (osoiMs, kowasu) => (pg) => pg.addInitScript((a) => {
  let _st;
  Object.defineProperty(window, 'Store', {
    configurable: true,
    get() { return _st; },
    set(v) {
      if (v && typeof v.cloudLoadState === 'function') {
        const moto = v.cloudLoadState.bind(v);
        v.cloudLoadState = function () {
          return new Promise((res, rej) => setTimeout(() => {
            if (a.kowasu) rej(new Error('★わざと 倉庫を 落とした★'));
            else res(moto());
          }, a.osoi));
        };
      }
      _st = v;
    },
  });
}, { osoi: osoiMs, kowasu: !!kowasu });

const YOMU = `(function(){
  var btn=document.querySelector('[data-confirm-month]');
  var h=document.querySelector('#input-list');
  return {
    top: btn?Math.round(btn.getBoundingClientRect().top):null,
    fuda: btn?btn.textContent.trim():'（無い）',
    osenai: btn?btn.disabled:null,
    hito: document.querySelectorAll('#input-list .acc.icard').length,
    ji: h?h.textContent.replace(/\\s+/g,' ').trim().slice(0,90):''
  };
})()`;

console.log('\n[souko-machi] 倉庫の 答えが 遅れても 動かない／押させない／黙らない');

/* ── ①② 遅らせる ─────────────────────────────────── */
for (const w of [375, 390, 412]) {
  const pg = await (await b.newContext({ viewport: { width: w, height: 900 } })).newPage();
  await shikomu(5000, false)(pg);
  const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-input"]');
  if (!h.haitta) { console.log('  🟡 幅' + w + ' … ★未測定★（' + h.kai + '回 試して 入れなかった）'); mihakari++; await pg.close(); continue; }
  await osu(pg, '.bn[data-scr="scr-input"]');
  await machi(400);
  const a1 = await pg.evaluate(YOMU);                 /* 答えが 来る 前 */
  T('★② 幅' + w + '＝答えが 来るまで 押せない', a1.osenai === true, '札「' + a1.fuda + '」');
  T('★② 幅' + w + '＝理由が 字で 出ている（灰色だけに しない）', machiOk(a1.fuda), '札「' + a1.fuda + '」');
  T('★④ 幅' + w + '＝空の 一覧を 出さない（0人に 見せない）',
    a1.hito === 0 && /読み込み中/.test(a1.ji), '人 ' + a1.hito + '／字「' + a1.ji.slice(0, 50) + '」');
  await machi(7000);                                  /* 倉庫が 答える */
  const a2 = await pg.evaluate(YOMU);
  /* ★ここは 動きます★＝人の 一覧が 0人から 本物に なるので、その 下の ボタンは 必ず 下がる。
     ★大事なのは「動く 間は 押せない」事★＝指の 下から 逃げない。
     （指示役の 注文①は「0px」だったが、★一覧が 下に 在る 以上 0pxには できない★＝
       測る 物を ★動き終わってから 0px★ に 直した。この 変更は 便で 報告する） */
  T('★① 幅' + w + '＝動いた その間は ★押せなかった★（指の 下から 逃げない）',
    a1.osenai === true, '動く前 押せない ' + a1.osenai + '（' + a1.top + ' → ' + a2.top + '）');
  T('★① 幅' + w + '＝来たら 押せるように なる', a2.osenai === false || /県が未選択/.test(a2.fuda), '札「' + a2.fuda + '」');
  const a3 = await pg.evaluate(YOMU);
  await machi(2500);
  const a4 = await pg.evaluate(YOMU);
  T('★① 幅' + w + '＝押せるように なった あとは ★0px★ 動かない',
    a3.top != null && a4.top != null && zure(a3.top, a4.top) === 0,
    a3.top + ' → ' + a4.top + '（ずれ ' + zure(a3.top, a4.top) + 'px）');
  await pg.close();
}

/* ── ⑤ ★保存の 知らせが あとから 出ても 下が 動かない★ ─────────────
   ★2026-09-05 実測★＝前は 上の 折り返す 行の 中に 在り、「自動保存済 hh:mm」が
   出た 瞬間に 行が 折り返して 箱が 伸びていた（幅412 ★+25px★／幅390 ★+15px★）。
   ＝これが「たまに 赤」の 正体（記録係が「下書き確認の 箱だけ 110→135px」と 名指しした）。
   ★直し★＝自分の 行に 出し ★空でも 1行ぶんの 場所を 取る★（案B）。 */
for (const w of [375, 390, 412]) {
  const pg = await (await b.newContext({ viewport: { width: w, height: 900 } })).newPage();
  const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-input"]');
  if (!h.haitta) { console.log('  🟡 ⑤幅' + w + ' … ★未測定★（入れなかった）'); mihakari++; await pg.close(); continue; }
  await osu(pg, '.bn[data-scr="scr-input"]');
  await machi(3000);
  const m = await pg.evaluate(() => {
    const ss = document.getElementById('save-status');
    if (!ss) return { NG: '#save-status が 無い' };
    const btn = document.querySelector('[data-confirm-month]');
    const moto = ss.textContent;
    ss.textContent = '';
    const kara = btn ? Math.round(btn.getBoundingClientRect().top) : null;
    ss.textContent = '自動保存済 12:34';
    const ari = btn ? Math.round(btn.getBoundingClientRect().top) : null;
    ss.textContent = moto;
    return { kara: kara, ari: ari };
  });
  if (m.NG) { console.log('  🟡 ⑤幅' + w + ' … ★未測定★（' + m.NG + '）'); mihakari++; }
  else {
    T('★⑤ 幅' + w + '＝「自動保存済」が 出ても 確定ボタンが ★0px★',
      m.kara != null && m.ari != null && zure(m.kara, m.ari) === 0,
      m.kara + ' → ' + m.ari + '（ずれ ' + zure(m.kara, m.ari) + 'px）');
  }
  await pg.close();
}

/* ── ③ わざと 失敗させる ─────────────────────────────── */
{
  const pg = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
  await shikomu(800, true)(pg);
  const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-input"]');
  if (!h.haitta) { console.log('  🟡 失敗の 回 … ★未測定★（入れなかった）'); mihakari++; }
  else {
    await osu(pg, '.bn[data-scr="scr-input"]');
    await machi(3000);
    const a = await pg.evaluate(YOMU);
    T('★③ つながらなかったら ★失敗と 言う★（黙って 空に しない）',
      /つながりませんでした/.test(a.ji), '字「' + a.ji.slice(0, 70) + '」');
    T('★③ 失敗の 間も 押せない', a.osenai === true, '札「' + a.fuda + '」');
    T('★③ もう一度 読み込む が 出ている', await pg.$('#b-souko-retry') !== null);
  }
  await pg.close();
}

await b.close(); srv.close();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed' + (mihakari ? ' ／ 🟡未測定 ' + mihakari : ''));
process.exit((fail || mihakari) ? 1 : 0);
