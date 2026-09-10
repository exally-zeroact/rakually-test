/* shirase-iro.test.mjs — ★知らせの 箱を 濃い色で 塗らない★（2026-09-10）
 *
 *  ★司さん（電話の 絵つき）★
 *    「全アプリで こんな 濃い色 使うなって 言うてなかったか？」
 *    「色が 濃いすぎるし ★背景ボックスの 使い方★が 悪くないか？」
 *    直した 形を 見て →「★絶対 これが ええ★」
 *    「Exally や 他の アプリで ★前みたいな 重たい感じに なってる所★ あったら ★先に 直せ★」
 *    「★アプリごとに 色分け 使い分けろよ★」
 *
 *  ★何を 守るか★
 *    ★お客さんの 画面に かぶせる 知らせは ★白地★★（濃い色は ★左の 帯★だけ）
 *    ⇒★色を 禁じて いません＝★大きく 塗る のを 禁じて います★★
 *
 *  ★実測（Exally の 同じ 箱で ★絵を 撮って 点を 数えた★）★
 *    箱の 中 330×148 の うち 暗い 点 … ★88% → 6%★（★14.8分の1★）
 *    手本＝exally `book.html` の `#toast`（PR #64・入り済 c3b0c36）
 *
 *  ★★この repo は 2つの 製品が 同居して います★★
 *    `css/hub.css`      … ★Rakunally★ … 帯 #3D9E72（この 画面で 一番 使われて いる 色）
 *    `kyuyo/admin.html` … ★Kyually（給与）★ … 帯 #52B788（Kyually の ロゴ色）
 *    ⇒★色は 作って いません★＝★数えて／記録から 選びました★
 *
 *  ★★見て いない 範囲（★書かない 見張りは「全部 守った」と 読まれる★）★★
 *    ・★ボタン・選ばれている タブは 見て いません★（小さい／実Excel も 塗る）
 *    ・★請求（seikyu/）は 見て いません★＝この 見張りの 範囲外
 *    ・★紙（刷る物）は 1色も 触って いません★
 *
 *  ★★わざと壊した 記録★★
 *    ①★前の 塗りに 戻した★（写しを 壊す＝ファイルは 1バイトも 触らない）
 *        css/hub.css → #2E7D54 ／ kyuyo/admin.html → #3D9E72
 *      ⇒★2本とも 赤に なりました★
 *    ②★薄い 覆い（alpha 0.4）を 食わせた★ ⇒★赤に なりません★＝狼少年に なって いない
 *    ③★色の 書き方を 4通り★ ⇒★4通り とも 捕まえました★
 *    ④★写しを 壊せて いない 時も 赤に する★＝壊したつもりで 壊せて いないを 見つける為
 *
 *  使い方: node tests/shirase-iro.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ここ = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(ここ, '..');
const 直に走った = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
const 自己試験 = 直に走った && process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const 改行と字下げ = String.fromCharCode(10) + '      ';

/* ★見る 範囲を 先に 数えて 書く★（★写しでは なく この repo を 数えた★）
   ★★2026-09-10 Rakunally が 広げました★★
     もとは ['css/hub.css', 'kyuyo/admin.html'] の ★2本を 名指し★でした。
     ★Exally が 同じ日に 3回 落としています★
       ①代行請求の .toast-undo ②staging の kyuyo/admin.html ③手前の 見落とし
     ＝「★手で 探すと 必ず 漏れる★」は 例外なし。
   ⇒ ★repo の 中の css/html を 機械で 全部 拾う★（node_modules と .git は 除く）。
     ★拾えた 本数も 出す★＝0本で 緑に しない。 */
function 集める(根, 出) {
  for (const e of fs.readdirSync(根, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.sweep-red') continue;
    const p2 = path.join(根, e.name);
    if (e.isDirectory()) { 集める(p2, 出); continue; }
    if (/\.(css|html)$/i.test(e.name)) 出.push(path.relative(ROOT, p2).split(path.sep).join('/'));
  }
  return 出;
}
const 見る = 集める(ROOT, []);
if (!見る.length) {
  console.log('★見る ファイルが 0本＝この 見張りは 何も 見て いない★');
  process.exit(1);
}
console.log('  見た ファイル … css/html ' + 見る.length + '本'
  + '（★手で 名指しせず 機械で 拾った★）');

/* ══ ★免除（★理由つきで 名指し★／黙って 見逃さない）★ ══ */
const 免除 = [
  {
    当たる: (名) => /btn|button/i.test(名),
    訳: '★箱の 中の 押す物（ボタン）★＝知らせの 箱では ない。'
      + '実Excel も ボタンは 塗る／小さい／字は その 上に 載る',
  },
];
const 免除か = (名) => 免除.find((x) => x.当たる(名)) || null;

function 明るさ(c) { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }

/* ★色は ★文字で 探さず 値に 直す★★（2026-08-10 の 決まり）
   ①#RRGGBB ②#RGB（3桁）③rgb()/rgba() の 3通り
   ※★3桁も 見る★＝prettier が #ffffff を #fff に 縮める（2026-09-10 に 踏んだ） */
function 色に直す(v) {
  const h6 = /#([0-9a-fA-F]{6})\b/.exec(v);
  if (h6) {
    const x = h6[1];
    return { c: [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)], a: 1 };
  }
  const h3 = /#([0-9a-fA-F]{3})\b/.exec(v);
  if (h3) {
    const x = h3[1];
    return { c: [parseInt(x[0] + x[0], 16), parseInt(x[1] + x[1], 16), parseInt(x[2] + x[2], 16)], a: 1 };
  }
  const r = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/.exec(v);
  if (r) return { c: [+r[1], +r[2], +r[3]], a: r[4] === undefined ? 1 : parseFloat(r[4]) };
  return null;
}

function 知らせの規則(文) {
  const 出 = [];
  const re = /(^|[\s}])((?:#toast|\.toast)[^{}]{0,60})\{([^{}]{0,900})\}/g;
  let m;
  while ((m = re.exec(文)) !== null) {
    出.push({ 名: m[2].trim(), 中: m[3], 位置: 文.slice(0, m.index).split(String.fromCharCode(10)).length });
  }
  return 出;
}

function 塗り(中) {
  const m = /background(?:-color)?\s*:\s*([^;}]+)/.exec(中);
  if (!m) return null;
  const v = 色に直す(m[1]);
  /* ★薄い 覆い（alpha 0.5 未満）は 別の 話＝狼少年に しない★ */
  if (!v || v.a < 0.5) return null;
  return v.c;
}

const 全 = 見る.map((f) => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) throw new Error('★見る はずの ' + f + ' が 無い★');
  return { 名: f, 字: fs.readFileSync(p, 'utf-8') };
});

console.log('\n[shirase-iro] ★知らせの 箱を 濃い色で 塗らない★');
console.log('  ★見る 範囲★ … ' + 見る.join(' / '));

T('★知らせの 箱を 見つけて いる（★空振りして いない★）★', () => {
  const n = 全.reduce((s, f) => s + 知らせの規則(f.字).length, 0);
  if (n < 2) throw new Error('★知らせの 規則が ' + n + '本しか 見つからない★');
  console.log('      … ' + n + '本の 規則');
});

T('★★知らせの 箱を 濃い色で 塗って いない（★これが 本体★）★★', () => {
  const 悪い = [], 免除した = [];
  for (const f of 全) {
    for (const r of 知らせの規則(f.字)) {
      if (免除か(r.名)) { 免除した.push(f.名 + ' ' + r.名); continue; }
      const c = 塗り(r.中);
      if (!c) continue;
      if (明るさ(c) < 170) 悪い.push(f.名 + ':' + r.位置 + ' ' + r.名 + ' → rgb(' + c.join(',') + ')');
    }
  }
  if (免除した.length) console.log('      ★免除（理由つき）★ ' + 免除した.join(' / '));
  if (悪い.length) {
    throw new Error('★' + 悪い.length + 'か所が 濃い色で 塗って いる★' + 改行と字下げ + 悪い.join(改行と字下げ)
      + 改行と字下げ + '⇒★白地に して 濃い色は ★左の 帯★だけに★');
  }
  console.log('      … 濃く 塗って いる 箱 0か所');
});

T('★★塗りを 持つ 知らせは 左の 帯も 持つ（★色を 消した わけでは ない★）★★', () => {
  /* ★★数を 焼き込みません★★＝「◯か所」では なく ★塗りと 帯が 対★かを 見る
     （2026-09-10 に Exally の 数 2 を 焼き込んで 給与で ★中身は 正しいのに 赤★に した） */
  const 悪い = [];
  let 帯 = 0;
  for (const f of 全) {
    for (const r of 知らせの規則(f.字)) {
      if (免除か(r.名)) continue;
      if (!/background(?:-color)?\s*:/.test(r.中)) continue;
      const b = /border-left\s*:\s*(\d+)px\s+solid\s+([^;}]+)/.exec(r.中);
      if (!b) { 悪い.push(f.名 + ':' + r.位置 + ' ★帯が 無い★'); continue; }
      if (Number(b[1]) > 8) { 悪い.push(f.名 + ' ★帯が 太すぎる ' + b[1] + 'px★'); continue; }
      if (!色に直す(b[2])) { 悪い.push(f.名 + ' 帯の 色が 読めない'); continue; }
      帯++;
    }
  }
  if (悪い.length) throw new Error('★' + 悪い.length + 'か所★' + 改行と字下げ + 悪い.join(改行と字下げ));
  if (!帯) throw new Error('★帯が 1つも 無い★＝★色が 消えて しまって いる★');
  console.log('      … 塗りを 持つ 知らせ ' + 帯 + 'か所 とも 帯つき');
});

T('★★アプリごとに 色を 分けて いる（司さん「色分け 使い分けろよ」）★★', () => {
  /* ★この repo には 2つの 製品が 同居★＝★同じ 色に しない★ */
  const 帯の色 = {};
  for (const f of 全) {
    for (const r of 知らせの規則(f.字)) {
      if (免除か(r.名)) continue;
      const b = /border-left\s*:\s*\d+px\s+solid\s+([^;}]+)/.exec(r.中);
      if (!b) continue;
      const v = 色に直す(b[1]);
      if (v) 帯の色[f.名] = v.c;
    }
  }
  const 名 = Object.keys(帯の色);
  if (名.length < 2) throw new Error('★帯の 色を ' + 名.length + '本しか 読めない★');
  const a = 帯の色[名[0]], b = 帯の色[名[1]];
  const 差 = Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) * (x - b[i]), 0));
  if (差 < 1) {
    throw new Error('★2つの 製品が ★同じ 色★（差 ' + 差.toFixed(1) + '）★'
      + 改行と字下げ + 名.map((n) => n + ' … rgb(' + 帯の色[n].join(',') + ')').join(改行と字下げ));
  }
  console.log('      … ' + 名[0] + ' と ' + 名[1] + ' の 差 ' + 差.toFixed(1) + '（0 なら 赤）');
});

T('★白地に 薄い 字を 置いて いない（★読めなく なって いない★）★', () => {
  const 悪い = [];
  for (const f of 全) {
    for (const r of 知らせの規則(f.字)) {
      const bg = 塗り(r.中);
      const cm = /(?:^|[;\s])color\s*:\s*([^;}]+)/.exec(r.中);
      if (!bg || !cm) continue;
      const fg = 色に直す(cm[1]);
      if (!fg) continue;
      if (明るさ(bg) > 200 && 明るさ(fg.c) > 200) 悪い.push(f.名 + ':' + r.位置 + ' ' + r.名);
    }
  }
  if (悪い.length) throw new Error('★白地に 薄い 字が ' + 悪い.length + 'か所★' + 改行と字下げ + 悪い.join(改行と字下げ));
  console.log('      … 白地に 薄い 字 0か所');
});

T('★免除は 全部 理由つき／★免除に 逃げて いない★★', () => {
  for (const x of 免除) {
    if (!x.訳 || x.訳.trim().length < 20) throw new Error('★理由が 無い 免除★');
  }
  if (免除か('.toast')) throw new Error('★箱そのものを 免除に して いる★');
  if (免除か('#toast')) throw new Error('★箱そのものを 免除に して いる★');
  if (!免除か('.toast-btn')) throw new Error('★ボタンが 免除に なって いない★');
  console.log('      … 免除 ' + 免除.length + '件（理由つき）／箱そのものは 免除に して いない');
});

/* ══ ★自己試験（★壊すのは 写し★＝ファイルは 1バイトも 触らない）★ ══ */
if (自己試験) {
  console.log('\n★自己試験（★壊すのは 写し★＝ファイルは 1バイトも 触らない）★');

  const 判じ = (字) => 知らせの規則(字).some((r) => {
    if (免除か(r.名)) return false;
    const c = 塗り(r.中);
    return c !== null && 明るさ(c) < 170;
  });

  T('★★前の 塗りに 戻すと 赤に なる（知らせの規則を持つ 全部）★★', () => {
    /* ★字そのものに 寄りかからない★＝規則の 中の 塗りを ★形で★ 見つけて 差し替える
       （2026-09-10 … prettier が #ffffff を #fff に 縮めて 探す 字が 消えた） */
    /* ★★2026-09-10 Rakunally が 直しました★★
       もとは ★見る ファイルの 先頭2本★を 番号で 指していました（[0] と [1]）。
       見る 範囲を repo 全体（css/html 9本）に 広げたので、
       ★3本目は 知らせの 規則を 持たない★＝赤に なりました。
       ⇒ ★知らせの 規則を 持つ ファイルだけ★を 相手に する（番号で 指さない）。
       ★0本なら 赤★＝壊す 相手が 無いのに 緑と 言わない。 */
    const 持つ = 全.filter((f) => 知らせの規則(f.字).filter((r) => !免除か(r.名)).length);
    if (!持つ.length) throw new Error('★知らせの 規則を 持つ ファイルが 1本も 無い＝壊せない★');
    const 前の色 = { 'css/hub.css': '#2E7D54', 'kyuyo/admin.html': '#3D9E72' };
    for (const f of 持つ) {
      const 前 = 前の色[f.名] || '#2E7D54';
      const 規則 = 知らせの規則(f.字).filter((r) => !免除か(r.名));
      const r = 規則[0];
      const 壊した = r.中.replace(/background(-color)?\s*:\s*[^;}]+/, 'background: ' + 前);
      if (壊した === r.中) throw new Error('★写しを 壊せて いない★＝★この 試験は 何も 見て いない★');
      if (!判じ(f.字.replace(r.中, 壊した))) throw new Error('★' + f.名 + ' で 戻しても 赤に ならない★');
    }
    console.log('      … ' + 持つ.length + '本とも 戻すと 赤（' + 持つ.map((f) => f.名).join(' / ') + '）');
  });

  T('★★帯を 外すと 赤に なる（★見逃す側★を 塞いだ 証拠）★★', () => {
    const 二本 = '.toast{position:fixed;background:#fff;border-left:5px solid #3D9E72;}'
      + ' #toast{position:fixed;background:#fff;border-left:5px solid #52B788;}';
    const 数える = (字) => 知らせの規則(字).filter((r) => !免除か(r.名)
      && /background(?:-color)?\s*:/.test(r.中)
      && !/border-left\s*:\s*\d+px\s+solid/.test(r.中)).length;
    if (数える(二本)) throw new Error('★正しい 2本を 悪いと 言って いる★');
    const 三本目 = 二本 + ' .toast-shirase{position:fixed;background:#2E7D54;color:#fff;}';
    if (!数える(三本目)) throw new Error('★帯の 無い 知らせを 足しても 赤に ならない★');
    console.log('      … 帯の 無い 知らせを 1本 混ぜると 赤');
  });

  T('★★薄い 覆い（alpha 0.4）は 赤に しない（★狼少年に しない★）★★', () => {
    if (判じ('.toast{position:fixed;background:rgba(0,0,0,0.4);color:#fff;}')) {
      throw new Error('★薄い 覆いまで 赤に して いる★');
    }
    console.log('      … 薄い 覆いは 通す');
  });

  T('★★色を 文字で 探して いない（値に 直して いる）★★', () => {
    for (const 書き方 of ['#2E7D54', '#2e7d54', 'rgb(46,125,84)', 'rgba(46, 125, 84, 0.94)', '#333']) {
      if (!判じ('.toast{position:fixed;background:' + 書き方 + ';color:#fff;}')) {
        throw new Error('★' + 書き方 + ' を 見落とした★');
      }
    }
    /* ★3桁の 白は 通す（prettier が #ffffff を #fff に 縮めても 誤って 赤に しない）★ */
    if (判じ('.toast{position:fixed;background:#fff;color:#333;}')) throw new Error('★白を 赤に して いる★');
    console.log('      … 5通り とも 捕まえ、白（3桁）は 通す');
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
