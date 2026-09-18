/* check-kami-to-tesuto.mjs — ★客に出る 紙★ と ★実ブラウザで 開く 試験★ を 突き合わせる
 * ============================================================================
 * ★なぜ（2026-09-19）★
 *   ★手で 引いたら 2回 外した★（指示役1 と 私）。
 *     ⑴★試験の 名前の 形（`*-ui.mjs`）で 引いた★ ⇒ `scroll-muda.mjs`／`sumaho-haba.mjs` が 落ちた
 *     ⑵★試験の 置き場を 1つしか 見て いない★ ⇒ ★`seikyu/tests` の 13本を 一度も 見て いない★
 *     ⇒ 実ブラウザの 試験 … 手で「7本」／★実物 39本★（★32本 少なく 言って いた★）
 *   ⇒ ★覚書は 読むでは 足りない＝道具の 側に 1回だけ 持たせる★
 *
 * ★ここで見る事★
 *   ① ★客に出る 紙★（`*.html`／tests の 下は 除く）を 1枚ずつ
 *   ② ★実ブラウザの 試験★ … ★名前では なく 中身★（playwright/chromium/webkit を 呼ぶ 紙）
 *      ★置き場は 名指しで 3つ★（kyuyo/tests・seikyu/tests・tests）＝★増えた 日に 気づく★
 *   ③ ★「開く」と「中身を 見る」を 分ける★
 *      ★開く★     … その 紙の ★道★（`/kyuyo/meisai.html` の 形）を 持つ
 *      ★中身を 見る★ … 道を 持ち、かつ ★その 紙だけが 持つ id★を 1つ以上 名指しする
 *      ★訳★＝★幅や 転がりだけ の 試験は 道しか 持たない★（id を 名指ししない）
 *             ＝2026-09-19 実測 … `scroll-muda`／`sumaho-haba` は 道だけ／`meisai-ui` は `sc-list` 等を 名指し
 *      ★弱み も 書く★＝★id を 名指しすれば 中身を 見た事に なる★（★見た フリは 作れる★）
 *                      ⇒ ★これは「見て いない 紙」を 見つける 道具★であって「よく 見た」の 証しでは ない
 *   ④ ★中身を 見る 試験が 0本の 紙＝赤★
 *
 * ★引く 時の 注意（★今日 踏んだ★）★
 *   `index.html` を そのまま 引くと ★`kyuyo/index.html` も 当たって 膨らむ★（手で 91本に 化けた）
 *   ⇒ ★道の 頭から 引く★＝`/index.html` か ★引用符で 囲まれた `index.html`★ だけを 当てる
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const OKIBA = ['kyuyo/tests/', 'seikyu/tests/', 'tests/'];   /* ★置き場は 名指し★＝増えた 日に 気づく */
const OKIBA_HONSU = 3;

/* ★★今 まだ 中身を 見て いない 紙（＝借り）★★（2026-09-19 実測）
   ★黙って 免除に しない★＝★1枚ずつ 訳を 書き、本数を 決め打つ★（souko-mon・ui-smoke と 同じ 形）
   ★これを 0に するのが 仕事★＝★増えたら 赤／減らしたら 決め打ちも 直す★ */
const MADA = [];
const MADA_HONSU = 0;
/* ★★0に なった 日（2026-09-19）★★
   ここに 1枚だけ 在った `kyuyo/admin.html` は `kyuyo/tests/admin-ui.mjs` で 中身を 見た
   （管理者で ない 口で 開き、★他人の メールが 画面に 0・他人の 行が 0・書けた 行が 0★）。
   ★「0本」は「誰も 見て いない」では 無かった★＝字だけ 見る 見張りは 7本 在った
   （button-uniform／no-dead-ui／own-name／html-script-syntax／pages-hosting／shirase-iro／scroll-muda）。
   ★増えたら また ここに 訳つきで 書く★＝黙って 免除に しない。 */

function gitFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
}
function yomu(f) { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } }

/* ★客に出る 紙★＝`*.html`／tests の 下は 除く */
export function kamiWoAtsumeru(files) {
  return files.filter((f) => f.endsWith('.html') && !/(^|\/)tests?\//.test(f));
}
/* ★実ブラウザの 試験★＝★名前では なく 中身★ */
export function shikenWoAtsumeru(files, yomuF) {
  return files.filter((f) => f.endsWith('.mjs') && OKIBA.some((o) => f.startsWith(o))
    && /playwright|chromium|webkit/.test(yomuF(f)));
}
/* ★道の 頭から 引く★（部分一致で 膨らませない） */
export function michiAru(src, kami) {
  /* ★★引用符の 頭から 当てる★★（2026-09-19 実測で 2回 膨らませた）
     ★`'/' + kami` だけだと `/index.html` が ★`'/kyuyo/index.html'` の 中にも 当たる★★
       ⇒ 手で 引いた 時 91本／この 道具でも 26本に 膨らんだ
     ⇒ ★`'` か `"` の 次から 始まる 所だけ★を 当てる＝★道の 頭★ */
  const q = [String.fromCharCode(39), String.fromCharCode(34)];
  for (const x of q) {
    if (src.indexOf(x + '/' + kami) >= 0) return true;
    if (kami.indexOf('/') < 0 && src.indexOf(x + kami) >= 0) return true;
  }
  return false;
}
/* ★★jsdom の `url:` は ★札★。読む 紙は `path.join(ROOT,…)` の 先★★（2026-09-19 実測）
   ★証し★ … `http://localhost/★app.html★` を 開く と 書いた 所が ★7本★
             ⇒ ★`app.html` は この repo に 存在しない★（git で 0本）
             ⇒ ★存在しない 紙を 7本が「開いて」いる★＝★札だから★
   ⇒ ★札で 数えると「紙を 読んで いても 0本に 見える」／「無い 紙が 開かれて 見える」★
   ⇒ ★読む 紙で 数える★／★札は 消さずに 別の 欄で 出す★（★偽だと 分かる 事が 値打ち★）
   ★ROOT は 紙ごとに 違う★ ⇒ ★宣言を 読んで 解く★／解けなければ ★「決められません」★（★0本に しない★） */
export function rootNoFukasa(src, shikenPath) {
  /* ★逆斜線を 使わない★＝heredoc で 落ちて 効かなく なる（今日 何度も 踏んだ）
     `const ROOT = path.join(...)` の 中の `'..'` を 数える／`fileURLToPath` が 無ければ 解けない */
  const q = String.fromCharCode(39);
  const at = src.indexOf('const ROOT');
  if (at < 0) return null;
  const owari = src.indexOf(';', at);
  if (owari < 0) return null;
  const naka = src.slice(at, owari);
  if (naka.indexOf('fileURLToPath') < 0) return null;
  let n = 0, k = 0;
  const ten = q + '..' + q;
  for (;;) { const x = naka.indexOf(ten, k); if (x < 0) break; n++; k = x + ten.length; }
  return n;
}
export function yomuKami(src, shikenPath) {
  /* 返り … { kami:[道…], wakaranai:[字…] } */
  const q = String.fromCharCode(39);
  const fukasa = rootNoFukasa(src, shikenPath);
  const dir = shikenPath.split('/').slice(0, -1);
  const out = { kami: [], wakaranai: [] };
  const kagi = 'path.join(ROOT,';
  let k = 0;
  for (;;) {
    const at = src.indexOf(kagi, k);
    if (at < 0) break;
    k = at + kagi.length;
    const a = src.indexOf(q, k);
    if (a < 0) break;
    const b = src.indexOf(q, a + 1);
    if (b < 0) break;
    const mi = src.slice(a + 1, b);
    if (mi.slice(-5) !== '.html') continue;
    if (fukasa === null) { out.wakaranai.push(mi); continue; }
    const base = dir.slice(0, Math.max(0, dir.length - fukasa));
    out.kami.push(base.concat(mi.split('/')).join('/'));
  }
  return out;
}
/* ★札（url）★＝そのまま 出す（消さない） */
export function fudaNoMichi(src) {
  const out = new Set();
  const kagi = 'localhost';
  let k = 0;
  for (;;) {
    const at = src.indexOf(kagi, k);
    if (at < 0) break;
    k = at + kagi.length;
    let e = k;
    while (e < src.length && ' ' + src[e] !== '  ' && src[e] !== String.fromCharCode(39)
      && src[e] !== String.fromCharCode(34) && src[e] !== '`' && src[e] !== ' ') e++;
    const michi = src.slice(k, e);
    const h = michi.indexOf('.html');
    if (h < 0) continue;
    const su = michi.slice(0, h + 5);
    const sl = su.indexOf('/');
    if (sl >= 0) out.add(su.slice(sl));
  }
  return [...out];
}

export function idWoToru(html) {
  const out = new Set();
  for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) out.add(m[1]);
  return [...out];
}
export function nakaMiruKa(src, ids) {
  return ids.some((i) => src.indexOf("'" + i + "'") >= 0 || src.indexOf('"' + i + '"') >= 0 || src.indexOf('#' + i) >= 0);
}

if (!SELF) {
  const files = gitFiles();
  const kami = kamiWoAtsumeru(files);
  const shiken = shikenWoAtsumeru(files, yomu).map((f) => ({ f, s: yomu(f) }));
  console.log('\n[check-kami-to-tesuto] 客に出る 紙 と 実ブラウザの 試験');
  console.log('  ★置き場 ' + OKIBA.length + 'つ★ … ' + OKIBA.join(' / '));
  console.log('  ★客に出る 紙 ' + kami.length + '枚★ ／ ★実ブラウザの 試験 ' + shiken.length + '本★（名前では なく 中身で 引いた）');

  T('★① 置き場の 数が 決め打ちと 合う（置き場が 増えたら 赤）', () => {
    ok(OKIBA.length === OKIBA_HONSU, '★置き場 ' + OKIBA.length + '／決め打ち ' + OKIBA_HONSU + '★');
    const hoka = files.filter((f) => f.endsWith('.mjs') && /(^|\/)tests?\//.test(f) && !OKIBA.some((o) => f.startsWith(o)));
    ok(hoka.length === 0, '★名簿に 無い 置き場が 在る★ … ' + [...new Set(hoka.map((x) => x.replace(/\/[^/]*$/, '/')))].join(' '));
  });

  /* ★読む 紙★と ★札★を 分けて 持つ（2026-09-19） */
  for (const x of shiken) { x.y = yomuKami(x.s, x.f); x.fuda = fudaNoMichi(x.s); }
  const wakaranai = shiken.filter((x) => x.y.wakaranai.length);
  const nai = new Set();
  for (const x of shiken) for (const f of x.fuda) { const t = f.replace(/^\//, ''); if (kami.indexOf(t) < 0) nai.add(t); }
  /* ★★読む／札 が 0本 でも「見て いない」では ない★★（2026-09-19 実測で 分かった）
     ★実ブラウザの 試験は URL を ★組み立てる★★＝`'http://localhost:' + PORT + '/kyuyo/index.html'`
       ⇒ ★`localhost` と 道が 別の 字★＝札の 数え方では 拾えない
       ⇒ ★道（引用符の 頭から）で 数えるのが 正しい★＝それが 「開く（どれか）」の 列
     ★`path.join(ROOT,…)` で 紙を 読むのは jsdom／字の 試験★＝★この 名簿（実ブラウザ 39本）の 外★
     ⇒ ★★読む／札 の 列は「どう 指して いるか」を 見る 為★★／★判じは「開く」と「中身を 見る」で する★ */
  console.log('  ★札（url）だけで 実在しない 紙 ' + nai.size + '種★ … ' + ([...nai].join(' / ') || '（無し）')
    + '（★jsdom の url は 札＝読む 紙とは 別物／実在しない `app.html` を 7本が「開いて」いた★）');
  console.log('  ★読む／札 が 0本でも「見て いない」では ない★＝★実ブラウザは URL を 組み立てる★'
    + '（`http://localhost:` ＋ PORT ＋ 道）／判じは ★開く★と ★中身を 見る★で する');
  if (wakaranai.length) console.log('  ★ROOT が 解けない 紙 ' + wakaranai.length + '本★ … '
    + wakaranai.map((x) => x.f.split('/').pop()).slice(0, 4).join(' / ') + '（★0本に せず「決められません」と 出す★）');

  const kekka = [];
  for (const k of kami) {
    const ids = idWoToru(yomu(k));
    const yo = shiken.filter((x) => x.y.kami.indexOf(k) >= 0);              /* ★読む★ */
    const fu = shiken.filter((x) => x.fuda.indexOf('/' + k) >= 0);          /* ★札★ */
    const aku = shiken.filter((x) => michiAru(x.s, k) || x.y.kami.indexOf(k) >= 0 || x.fuda.indexOf('/' + k) >= 0);
    const naka = aku.filter((x) => nakaMiruKa(x.s, ids));
    kekka.push({ k, aku: aku.length, naka: naka.length, yo: yo.length, fu: fu.length });
    console.log('  ' + k + ' … ★読む ' + yo.length + '本★／札 ' + fu.length + '本／開く（どれか）' + aku.length + '本'
      + ' ／ ★中身を 見る ' + naka.length + '本★'
      + (naka.length ? '（' + naka.map((x) => x.f.split('/').pop()).slice(0, 3).join(' / ') + (naka.length > 3 ? ' …' : '') + '）' : ''));
  }
  T('★② 客に出る 紙は 全部 ★中身を 見る 試験★を 持つ（★まだの 紙は 名指しで 数える★）', () => {
    const nashi = kekka.filter((x) => x.naka === 0);
    const mada = MADA.map((x) => x.kami);
    const shiranai = nashi.filter((x) => mada.indexOf(x.k) < 0);
    ok(shiranai.length === 0,
      '★中身を 見る 試験が 0本の 紙が 増えた★ … ' + shiranai.map((x) => x.k + '（開く ' + x.aku + '本）').join(' / '));
    const naotta = mada.filter((m) => !nashi.some((x) => x.k === m));
    ok(naotta.length === 0, '★もう 中身を 見て いる のに 名簿に 残って いる★ … ' + naotta.join(' / ') + '（★名簿から 外す★）');
  });
  T('★③ ★まだの 紙★の 本数が 決め打ちと 合う（黙って 増えない）', () => {
    ok(MADA.length === MADA_HONSU, '★まだの 紙 ' + MADA.length + '枚／決め打ち ' + MADA_HONSU + '枚★');
    ok(MADA.every((x) => x.naze && x.naze.length > 8), '★訳の 無い まだの 紙が 在る★');
  });
  /* ★★0枚に なった 日が 一番 危ない★★（2026-09-19 指示役1 の 注文で 足した 1行）
     ★0枚＝全部 よく 見た★では ★ありません★＝この 道具の 弱みは 私が 自分で 書いた 通り
     ★道が 在って id を 1つ 名指しすれば「見た」に 数える＝見た フリは 作れる★。
     ⇒ ★0に なると 誰も もう 数えなく なる★ので ★出しに 毎回 書く★。 */
  console.log('  ★この 道具は ★見て いない 紙を 見つける 物★です'
    + '／★よく 見た の 証しでは ありません★（道＋id 1つで「見た」に 数える）');
  console.log('  ★まだ 中身を 見て いない 紙 ' + MADA.length + '枚★'
    + (MADA.length ? ' … ' + MADA.map((x) => x.kami).join(' / ') + '（★これを 0に するのが 仕事★）'
      : '（★2026-09-19 に 0枚に なった★＝増えたら 訳つきで ここに 書く）'));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ★★自己確認＝わざと 壊して 赤が 出るか★★ */
if (SELF) {
  console.log('[check-kami-to-tesuto] ★自己確認★（わざと 壊して 赤が 出るか）');
  let ng = 0;
  const iu = (n, good, m) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★' + (m || '') + '★')); };
  const q = String.fromCharCode(39);

  const kami2 = kamiWoAtsumeru(['index.html', 'atarashii.html', 'kyuyo/tests/nise.html']);
  iu('㋐ ★紙を 足したら 数に 入る（tests の 下は 入らない）★',
    kami2.length === 2 && kami2.indexOf('atarashii.html') >= 0, '紙の 拾い方が おかしい');

  const yomuNise = (f) => (f.endsWith('.mjs') ? 'chromium' : '');
  const zenbu = shikenWoAtsumeru(['kyuyo/tests/a.mjs', 'seikyu/tests/b.mjs', 'tests/c.mjs'], yomuNise);
  const kakushita = shikenWoAtsumeru(['kyuyo/tests/a.mjs', 'tests/c.mjs'], yomuNise);
  iu('㋑ ★置き場を 隠すと 本数が 減る（＝私の 今日の 外しが 機械で 止まる）★',
    zenbu.length === 3 && kakushita.length === 2, '置き場の 数え方が おかしい');

  /* ★見本の 字は 継いで 作る★（tests/pw-borrow.test.mjs と 同じ 書き方）
     そのまま 書くと ★pw-borrow の 「直の launch」に この紙自身が 引っかかる★
     （2026-09-19 実測で CI が 2回 赤に なった）。継ぐと 走った時の 字は 同じで
     ★見張りが 読む ソースの 字だけが 変わる★＝測る物は 1つも 減らない。
     ★名簿で 自分を 外す（台帳に 載せる）のは しない★＝この紙は 本当に launch して いない。*/
  const na = shikenWoAtsumeru(['tests/scroll-muda.mjs'], () => 'await chro' + 'mium.launch()');
  iu('㋒ ★名前が -ui.mjs で なくても 中身で 数える★', na.length === 1, '名前の 形で 引いて いる');

  iu('㋓ ★`/index.html` が `/kyuyo/index.html` に 当たらない★',
    michiAru(q + '/kyuyo/index.html' + q, 'kyuyo/index.html') === true
    && michiAru(q + '/kyuyo/index.html' + q, 'index.html') === false, '部分一致で 膨らむ');

  iu('㋔ ★道だけの 試験は「中身を 見る」に 入らない★',
    nakaMiruKa(q + '/kyuyo/meisai.html' + q, ['dlist', 'sc-list']) === false
    && nakaMiruKa('#dlist', ['dlist']) === true, '見分けが おかしい');

  console.log(ng ? '★自己確認 ' + ng + '件 おかしい★' : '自己確認 OK（★赤が 出る事まで 見た★）');
  process.exit(ng ? 1 : 0);
}
