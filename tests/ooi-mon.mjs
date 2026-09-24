/* ooi-mon.mjs — ★覆い（`.ui-modal-ov`）の 扱いの 門★
 * =============================================================================
 * ★なぜ 要るか（2026-09-24 実測）★
 *   `fuyo-ui` が CI で 赤に なった。訳は ★conflict の 覆いが 押しを 塞いだ★
 *     `page.click: Timeout 8000ms exceeded.` ／ `<div class="ui-modal-ov"> intercepts pointer events`（15回とも）
 *   ★訳は ログを 2,189行 掘るまで 分からなかった★（約 2分 無言で 死ぬ）。
 *   更に 掘ると ★`tests/_hairu.mjs` の `toziru()` は 覆いを ★黙って 閉じて いた★★
 *     … 型 `/×|閉じる|あとで|いいえ|キャンセル|OK|…/` に conflict の 覆いの ボタンが ★当たる★
 *     … ⇒ ★conflict が 起きた 事が ログから 消える★（`state._conflictPrompted` が 立ち 二度と 訊かれない）
 *   ★決め（指示役1 2026-09-24）★ … ★★『答える』では なく『見つけて その場で 止める』★★
 *
 * ★この 門が 見る 事（★倉庫にも アプリにも 触りません★）★
 *   ①★conflict の 覆いが 出て いたら `osu()` は 押さずに 止める★（`oseta:false` ／ `ooi:true` ／ 箱の 字）
 *   ②★★答えて いない＝覆いが ★残って いる★★★（＝閉じて いない＝signal を 消して いない）
 *   ③★案内の 覆いは 今まで通り 本物の click で 閉じる★（★一緒くたに 止めない★）
 *   ④★閉じた 時は「何を 閉じたか」を 1行 出す★（★黙って 閉じるのを やめる★）
 *   ⑤★覆いの class は アプリの 字から 取れて いる★（★手で 打った 物に 落ちて いない★）
 *
 * ★弱い所（★先に 書く★）★
 *   ★『本物の conflict の 覆い』では なく ★同じ 形の 札★を 自分で 置いて 測って います★。
 *   ⇒ ★`class` や 文言が 変わった 日に 空振りします★
 *   ⇒ だから ⑤で ★class を アプリの 字から 取れて いるか★を 見る（取れなければ ★未測定★で 止める）。
 *
 * 使い方: node tests/ooi-mon.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { borrow, launch } = await import('../scripts/_borrow-playwright.mjs');
const { OOI, OOI_MOTO, TOJINAI_JI, osu, toziru, ooiWoMiru } = await import('./_hairu.mjs');

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

console.log('\n[ooi-mon] ★覆いの 扱い★（★倉庫にも アプリにも 触りません★）');
console.log('  覆いの 印 … ' + OOI + '（' + OOI_MOTO + '）');
console.log('  閉じない 字 … ' + JSON.stringify(TOJINAI_JI));

/* ⑤★手で 打った 物に 落ちて いないか★＝落ちて いたら ★この先は 当てに ならない★ */
if (OOI_MOTO.indexOf('から 取った') < 0) {
  console.log('  🟡 ★未測定★ … ' + OOI_MOTO);
  process.exit(2);
}
T('★⑤ 覆いの class を ★アプリの 字から★ 取れて いる（手で 打って いない）', true);

const wk = await borrow('ooi-mon', 'webkit');
if (!wk) { console.log('  🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }
const b = await launch('ooi-mon', wk);
try {
  const ctx = await b.newContext();
  const pg = await ctx.newPage();
  await pg.goto('about:blank');

  /* ── ①②★conflict の 覆いを 1枚 置く★（★アプリは 動かしません★） ── */
  const OKU = (cls, honbun, botan) => pg.evaluate((x) => {
    document.body.innerHTML = '<button id="mato" style="position:fixed;left:10px;top:10px">まと</button>';
    const ov = document.createElement('div');
    ov.className = x.cls;
    ov.setAttribute('style', 'position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.4)');
    const card = document.createElement('div');
    card.innerHTML = '<div>' + x.honbun + '</div>';
    /* ★本物と 同じく「閉じる を 押すと 覆いが 消える」★（`app.js` の `uiModal` の `close()` と 同じ振る舞い）
       ★これを 付けないと『閉じても 消えない 札』に なり ★道具では なく 札の せいで 赤に なる★ */
    x.botan.forEach((t) => {
      const e = document.createElement('button'); e.textContent = t;
      e.addEventListener('click', () => { if (ov.parentNode) ov.parentNode.removeChild(ov); });
      card.appendChild(e);
    });
    ov.appendChild(card); document.body.appendChild(ov);
    window.__osareta = 0;
    document.getElementById('mato').addEventListener('click', () => { window.__osareta++; });
  }, { cls: cls, honbun: honbun, botan: botan });

  const KAO = String(TOJINAI_JI[0]);                    /* ★字は 1か所（_hairu.mjs）から★ */
  await OKU(OOI.slice(1), 'この会社の設定・従業員データが、' + KAO + 'されています。', ['キャンセル', 'OK']);
  const r1 = await osu(pg, '#mato');
  const nokotta = await ooiWoMiru(pg);
  const osareta = await pg.evaluate(() => window.__osareta).catch(() => -1);
  console.log('  ①の 返り … ' + JSON.stringify({ oseta: r1.oseta, ooi: r1.ooi, ji: (r1.ji || '').slice(0, 40) }));
  T('★① conflict の 覆いが 出て いたら ★押さずに 止める★', r1.oseta === false && r1.ooi === true,
    '返り＝' + JSON.stringify(r1));
  T('★① 止めた 訳（箱の 字）を 返して いる', typeof r1.ji === 'string' && r1.ji.indexOf(KAO) >= 0, '字＝' + r1.ji);
  T('★★② 答えて いない＝覆いが ★残って いる★★（閉じたら signal が 消える）', nokotta.aru === true && nokotta.conflict === true);
  T('★② まとを 1回も 押して いない', osareta === 0, '押された 回数＝' + osareta);

  /* ── ③④★案内の 覆いは 今まで通り 閉じる／何を 閉じたか 出す★ ── */
  await OKU(OOI.slice(1), 'はじめての方へ（使い方の案内）', ['閉じる']);
  const nokori = await toziru(pg);
  const ato = await ooiWoMiru(pg);
  T('★③ 案内の 覆いは 今まで通り 閉じる（一緒くたに 止めない）', nokori === 0 && ato.aru === false,
    '閉じ残り＝' + nokori);
  const r2 = await osu(pg, '#mato');
  const osareta2 = await pg.evaluate(() => window.__osareta).catch(() => -1);
  T('★③ 案内を 閉じた 後は 押せる', r2.oseta === true && osareta2 === 1, '返り＝' + JSON.stringify(r2) + '／押＝' + osareta2);

  /* ── ★空振り止め★＝★門が 本当に 効いて いるか★（わざと 字を 変える） ── */
  await OKU(OOI.slice(1), '★conflict では ない 字★', ['キャンセル', 'OK']);
  const r3 = await ooiWoMiru(pg);
  T('★空振り止め … conflict で ない 覆いを conflict と 言わない', r3.aru === true && r3.conflict === false);
  await toziru(pg);
} catch (e) {
  fail++; console.log('  ✗ 転びました — ' + String((e && e.message) || e).split('\n')[0].slice(0, 160));
} finally { await b.close().catch(() => null); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
