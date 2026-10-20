/* sumaho-haba.mjs — ★スマホ幅で 潰れ0・はみ出し0★（給与・請求書 とも）
 * =============================================================================
 * ★なぜ（2026-09-05 司さん）★
 *   「★もう出来とる代行請求書のアプリと比較しろや／同じことやらすな★」
 *   ⇒★司さんに もう一度 実機で 1周させない★。
 *     ★代行請求（daikou-seikyu）が すでに 人の手で 見つけて 機械に 落とした 物差し★を 借りる。
 *
 * ★借り元（測り方だけ・見た目は 借りない）★
 *   Exally-test/tests/e2e/paper-width.spec.js（2026-08-10）
 *     「flex/grid の箱に入った字は ★DOMに在るのに1文字ずつ縦に割れる★ ことがある。
 *       この型で踏むのは ★3回目★なので、幅を変えて 実際に測る 試験にした」
 *   ★測り方★
 *     ①横に 溢れていないか … documentElement.scrollWidth − clientWidth
 *     ②縦に 割れていないか … ★幅が 1文字ぶん程度しか無いのに 背が高い★ 要素を 数える
 *        （子を 持たない＝自分が 字を 描いている 物だけ 見る／4文字以上）
 *
 * ★うちで 何を 見るか★
 *   ★給与★ 明細の 画面／★請求書★ 入口
 *   幅 375（iPhone SE〜）／390（iPhone 14）／412（Android）
 *
 * ★未測定の 言い方★
 *   playwright が 借りられない機械では ★未測定★（0件＝合格 とは 書かない）
 *
 * 使い方: node tests/sumaho-haba.mjs [--self-test] [--bu=1〜4]（段分けは 下の KAKUNIN）
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');

/* ★物差しそのもの★（ブラウザの 中で 走る／自己確認でも 使う）
   ★1文字ずつ 縦に 割れている＝幅が 1文字ぶん程度しか 無いのに 背が高い★

   ★2026-09-05 実測＝境界が ゆれる★（借り元にも 同じ ゆれが 在る）
     JS の 掛け算は ★12 × 1.6 = 19.200000000000003★／★12 × 2.4 = 28.799999999999997★
     ⇒ 幅 ちょうど 19.2／高さ ちょうど 28.8 が ★割れ扱いに なる★（19.2 < 19.2000…3 が true）
     ⇒★見張りが 誤って 鳴る＝人が 見なくなる★＝一番 まずい
   ★直し★＝★ちょうどは 割れに しない★（1e-9 の 余裕を 足す）
     ＝★「1文字ぶんより ★狭い★」「2.4倍より ★高い★」を 字のまま★ */
var YURUSHI = 1e-9;
export function warete(r, fs2) {
  return (r.width < fs2 * 1.6 - YURUSHI) && (r.height > fs2 * 2.4 + YURUSHI);
}
export function hamidashi(scrollWidth, clientWidth) { return scrollWidth - clientWidth; }

/* ★★段を 4つに 分ける（--bu=1〜4）★★（2026-10-20・oseru-ka の 2段分け（10-02）と 同じ 形）
   ★なぜ★ … 押す前の 網の 1段の 上限は 180秒。この 紙は 単独で 167〜229秒＝★網の 中で 走らせられない★（10-20 に 3回）
     中身（10-20 手元で 1行ずつ 秒を 付けて 測った）＝①入口4画面×3幅 約68秒／②給与の中 1幅 約30〜55秒（入り直し 込み）×3幅／③入口の中×4幅 約50秒
     測った 事（10-20・試験の 利用者に 人 153・明細 741枚＝倉庫の data で 約0.3MB＋0.6MB）：
       給与の タブの 切り替えは 0.1〜0.5秒。1幅ごとに ★新しい 面で 入り直す★（WebKit で 入るまで 14.3秒・
       うち 画面の 手が 塞がった 合計 3.8秒＝読み込み込み）。
     ★測っていない 事★＝人数を 減らした時に 秒が 変わるか（比べていない）。人が 溜まる 訳（消した人が 戻る＝給与の 件5）は 別件。
       ⇒ 人が 溜まり続ければ 各段も 伸びる（見立て）。この 分けは 溜まりを 直す 物では ない。
   ⇒ ★中身は 1つも 変えず★ 走る 部分を 分ける。手元で 各段を 1回ずつ 測った 秒（10-20）＝段1 93／段2 44／段3 22／段4 65
     ★段2 は 2幅＝上の内訳（1幅 30〜55秒）から 見積もると 60〜110秒★（混んだ 時の 上の 端・見立て）
   ★この 分けは 手元の 押す前の 網の 為★＝GitHub の CI では WebKit の 本体が 無く 4段とも 未測定（exit 0）で 抜ける
     （webkit.yml にも 入っていない＝前からの 穴・別件）。
   ★ci.yml に 4段が 1回ずつ 載っているかも ★self-test で 見る★（段が 消えると 黙って 見張りの 外に 落ちる為・taiketsu 10-20）
   ★空振り止め（oseru-ka と 同じ）★
     ①--bu の 字が 1〜4 以外なら ★止める★／②各段で 見た 通りが 0 なら ★赤★
     ③確かめは 全部 下の 名簿（KAKUNIN）に ★段の 札付きで★ 載せる。載っていない 確かめを 走らせようと したら ★止める★
       ＋--self-test で「札の 無い 確かめ 0」「4段 どれも 空で ない」を ブラウザ 無しで 見る
   ★--bu 無し★ … 今まで どおり 全部 走る（手元で 人が 打つ 形は 変えない） */
const BU_KAZU = 4;
export const KAKUNIN = [
  { na: '①入口の 4画面', bu: 1 },
  { na: '②給与の中 幅375', bu: 2 },
  { na: '②給与の中 幅390', bu: 2 },
  { na: '②給与の中 幅412', bu: 3 },
  { na: '③入口の中', bu: 4 },
];
export function fudaWoMiru(meibo) {
  const ng = [];
  const nashi = meibo.filter((k) => !(Number.isInteger(k.bu) && k.bu >= 1 && k.bu <= BU_KAZU));
  if (nashi.length) ng.push('札の 無い 確かめ ' + nashi.length + '個（' + nashi.map((k) => k.na).join('／') + '）');
  const na = meibo.map((k) => k.na);
  if (new Set(na).size !== na.length) ng.push('同じ 名前の 確かめが 2つ 在る');
  for (let i = 1; i <= BU_KAZU; i++) if (!meibo.some((k) => k.bu === i)) ng.push('空の 段が 在る（段' + i + '）');
  return ng;
}
const BU = (() => {
  /* ★大文字・ダッシュ1本（--BU=1／-bu=1）も 拾う★＝素通りして 全部 走らせない（taiketsu 10-20） */
  const a = process.argv.filter((x) => /^-+bu/i.test(x));
  if (!a.length) return null;
  const m = a.length === 1 && /^--bu=([1-9])$/.exec(a[0]);
  if (!m || Number(m[1]) > BU_KAZU) {
    console.error('★--bu の 字が 違います（' + a.join(' ') + '）＝何も 走らせずに 止めます★（使えるのは --bu=1〜' + BU_KAZU + ' だけ）');
    process.exit(1);
  }
  return Number(m[1]);
})();
/* ★ci.yml に 段が 1回ずつ 載っているか★（2026-10-20・taiketsu 2回＝段が 消えても／黙らせても 誰も 止めなかった）
   ★段（- で 始まる 塊）ごとに 見る★。sumaho-haba.mjs が 出る 段について：
     ①その段に `if:` か `continue-on-error` が 在れば 赤（走らない・赤を 通す）
     ②run の 中身（1行でも `run: |` の 塊でも）から 行末の `#` 以降を 捨て、`&&` `||` `;` 改行で 切る
     ③`||` が 在れば 赤（`|| true` で 赤が 緑に なる）／echo で 始まる 物は 赤（何も 測らない）
     ④1つの 段に 測る 走り（self-test 以外）が 2つ 以上なら 赤（2段を 1段に まとめると 180秒に また 当たる）
     ⑤--bu=1〜BU_KAZU が ちょうど 1回ずつ・--bu 無しの 走り 0回・--self-test の 走り ちょうど 1回
   ★届かない 所★＝self-test を 呼ぶ 行ごと 消されると この 確かめ 自体が 走らない（ci.yml の どの self-test も 同じ・外の 門は 別件） */
export function ciNoDan(yml) {
  const ng = [], kazu = {};
  let selfKai = 0;
  const L = String(yml).split(/\r?\n/);
  const dan = [];
  let cur = null, ind = -1;
  for (const l of L) {
    const m = /^(\s*)-\s+\S/.exec(l);
    if (m && (cur === null || m[1].length <= ind)) { cur = [l]; ind = m[1].length; dan.push(cur); continue; }
    if (cur && l.trim() && (/^(\s*)/.exec(l)[1].length <= ind)) { cur = null; ind = -1; }
    if (cur) cur.push(l);
  }
  for (const d of dan) {
    const zen = d.join('\n');
    if (!/sumaho-haba\.mjs/.test(zen)) continue;
    const na = (/name:\s*(.*)/.exec(zen) || [, '(名前なし)'])[1].slice(0, 30);
    if (/^\s*(-\s+)?if:/m.test(zen) || /continue-on-error/.test(zen)) ng.push('段「' + na + '」に if:／continue-on-error が 在る');
    const i = d.findIndex((l) => /^\s*(-\s+)?run:/.test(l));
    if (i < 0) { ng.push('段「' + na + '」に run: が 無い'); continue; }
    const ichi = d[i].replace(/^\s*(-\s+)?run:\s*/, '');
    const naka = /^[|>][-+]?\s*$/.test(ichi) ? d.slice(i + 1) : [ichi];
    const kome = naka.map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
    if (/\|\|/.test(kome)) ng.push('段「' + na + '」に || が 在る（赤を 緑に できる）');
    let hakaru = 0;
    for (const seg of kome.split(/&&|\|\||;|\n/)) {
      if (!/sumaho-haba\.mjs/.test(seg)) continue;
      if (/^\s*echo\b/.test(seg)) { ng.push('段「' + na + '」で echo（走らせていない）'); continue; }
      if (/--self-test/.test(seg)) { selfKai++; continue; }
      hakaru++;
      const m = /--bu=(\d+)/.exec(seg);
      const k = m ? m[1] : '無し';
      kazu[k] = (kazu[k] || 0) + 1;
    }
    if (hakaru > 1) ng.push('段「' + na + '」に 測る 走りが ' + hakaru + '本（1段に まとめると 180秒に 当たる）');
  }
  for (let i = 1; i <= BU_KAZU; i++) if (kazu[String(i)] !== 1) ng.push('--bu=' + i + ' が ' + (kazu[String(i)] || 0) + '回');
  Object.keys(kazu).filter((k) => k !== '無し' && !(+k >= 1 && +k <= BU_KAZU)).forEach((k) => ng.push('名簿に 無い --bu=' + k));
  if (kazu['無し']) ng.push('--bu 無しの 走り（全部＝網の 180秒を 越える）が ' + kazu['無し'] + '回');
  if (selfKai !== 1) ng.push('--self-test の 走りが ' + selfKai + '回');
  return ng;
}
function hashiru(na) {
  const k = KAKUNIN.find((x) => x.na === na);
  if (!k) { console.error('★確かめの 名簿（KAKUNIN）に 無い 確かめ「' + na + '」＝段の 札が 無い まま 走らせない★'); process.exit(1); }
  return BU === null || BU === k.bu;
}

if (SELF) {
  console.log('\n[sumaho-haba] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('★1文字ずつ 縦に 割れている（幅16・高さ60・字12）… 見つける★', warete({ width: 16, height: 60 }, 12) === true);
  say('ふつうの 1行（幅200・高さ18・字12）… 見つけない', warete({ width: 200, height: 18 }, 12) === false);
  say('★背が 高くても 幅が 在れば 見つけない★（幅200・高さ60）', warete({ width: 200, height: 60 }, 12) === false);
  say('★幅が 狭くても 背が 低ければ 見つけない★（幅16・高さ18）', warete({ width: 16, height: 18 }, 12) === false);
  say('境界 … 幅ちょうど 19.2（＝12×1.6）は 見つけない', warete({ width: 19.2, height: 60 }, 12) === false);
  say('境界 … 高さちょうど 28.8（＝12×2.4）は 見つけない', warete({ width: 16, height: 28.8 }, 12) === false);
  say('はみ出し … 同じなら 0', hamidashi(390, 390) === 0);
  say('★はみ出し … 12px 溢れている★', hamidashi(402, 390) === 12);
  /* ★通信の失敗と 作りの落ちを 分けられるか★（2026-09-08 足した） */
  say('★倉庫の 通信の 失敗＝通信と 見る★（総なめで 実際に 出た 字）',
    /* ★接続先は js/supa-config.js だけが 持つ★＝ここに 倉庫の 名前を 書かない
       （CIの「向き先を 直書きしていない」見張りが 正しく 捕まえた・2026-09-08）。
       ★見分けに 要るのは「supabase」という 語だけ★＝ホスト名は 要らない。 */
    tsushinKa('supabase.co/auth/v1/token?grant_type=password due to access control checks.') === true);
  say('★網の 切れ＝通信と 見る★', tsushinKa('Load failed') === true);
  say('★作りの 落ちは 通信に しない★（undefined is not an object）',
    tsushinKa("undefined is not an object (evaluating 'a.b')") === false);
  say('★作りの 落ちは 通信に しない★（is not a function）',
    tsushinKa('x.foo is not a function') === false);
  /* ★段の 札★（2026-10-20） */
  const fudaNg = fudaWoMiru(KAKUNIN);
  say('★段の 札＝札の 無い 確かめ 0・4段 どれも 空で ない★' + (fudaNg.length ? '（' + fudaNg.join('／') + '）' : ''), fudaNg.length === 0);
  const waza = KAKUNIN.map((k, i) => (i === 0 ? { na: k.na } : k));
  say('★わざと 札を 1つ 外した 名簿は 捕まる★（' + fudaWoMiru(waza).join('／') + '）', fudaWoMiru(waza).length > 0);
  const waza2 = KAKUNIN.filter((k) => k.bu !== 4);
  say('★わざと 段4を 空にした 名簿は 捕まる★（' + fudaWoMiru(waza2).join('／') + '）', fudaWoMiru(waza2).length > 0);
  /* ★ci.yml に 4段が 1回ずつ★（本物の ci.yml を 読む） */
  const ymlP = path.join(ROOT, '.github', 'workflows', 'ci.yml');
  const yml = fs.existsSync(ymlP) ? fs.readFileSync(ymlP, 'utf8') : '';
  const ciNg = yml ? ciNoDan(yml) : ['ci.yml が 読めない'];
  say('★ci.yml に --bu=1〜' + BU_KAZU + ' が 1回ずつ・--bu 無しの 走り 0★' + (ciNg.length ? '（' + ciNg.join('／') + '）' : ''), ciNg.length === 0);
  const yml3 = yml.split(/\r?\n/).filter((l) => l.indexOf('sumaho-haba.mjs --bu=3') < 0).join('\n');
  say('★わざと 段3を ci.yml から 消した 見本は 捕まる★（' + ciNoDan(yml3).join('／') + '）', ciNoDan(yml3).length > 0);
  const ymlW = yml.replace('sumaho-haba.mjs --bu=3', 'sumaho-haba.mjs --bu=2');
  say('★わざと --bu=3 を --bu=2 と 書き間違えた 見本は 捕まる★（' + ciNoDan(ymlW).join('／') + '）', ciNoDan(ymlW).length > 0);
  const ymlZ = yml.replace('sumaho-haba.mjs --bu=4', 'sumaho-haba.mjs');
  say('★わざと --bu を 外した（全部 走る）見本は 捕まる★（' + ciNoDan(ymlZ).join('／') + '）', ciNoDan(ymlZ).length > 0);
  /* ★黙らせる 形★（taiketsu 2回目 10-20 が 素通りを 見せた 10通り）＝本物の ci.yml の 字を 書き換えて 作る */
  const R4 = 'run: node tests/sumaho-haba.mjs --bu=4', R2 = 'run: node tests/sumaho-haba.mjs --bu=2';
  const ind4 = (yml.split(/\r?\n/).find((l) => l.indexOf(R4) >= 0) || '').replace(R4, '');
  const DAMASHI = [
    ['A 段2と段3を 1行に まとめる', yml.replace(R2, R2 + ' && node tests/sumaho-haba.mjs --bu=3').split(/\r?\n/).filter((l) => l.indexOf('run: node tests/sumaho-haba.mjs --bu=3') < 0).join('\n')],
    ['B self-test の 呼び出しを 消す', yml.replace('node tests/sumaho-haba.mjs --self-test && ', '')],
    ['C2 ; で 全部の 走りを 足す', yml.replace(R4, R4 + '; node tests/sumaho-haba.mjs')],
    ['L2 行末の 注に --bu=4 を 隠す', yml.replace(R4, 'run: node tests/sumaho-haba.mjs  # --bu=4')],
    ['D || true で 赤を 緑に', yml.replace(R4, R4 + ' || true')],
    ['J 段4に if: false', yml.replace(R4, R4 + '\n' + ind4 + 'if: false')],
    ['K 段4に continue-on-error', yml.replace(R4, R4 + '\n' + ind4 + 'continue-on-error: true')],
    ['N echo で 走らせない', yml.replace(R2, 'run: echo node tests/sumaho-haba.mjs --bu=2')],
    ['G run: | の 塊で 全部 走らせる', yml.replace(R4, 'run: |\n' + ind4 + '  node tests/sumaho-haba.mjs')],
    ['E 段の 頭が - run:（名前 無し）で 全部 走らせる', yml.replace(ind4.replace(/  $/, '') + '- name: ★スマホ幅（段4', ind4.replace(/  $/, '') + '- run: node tests/sumaho-haba.mjs\n' + ind4.replace(/  $/, '') + '- name: ★スマホ幅（段4')],
  ];
  for (const [na, y] of DAMASHI) {
    const kawatta = y !== yml, r = ciNoDan(y);
    say('★' + na + '＝捕まる★' + (kawatta ? '（' + r.slice(0, 2).join('／') + '）' : '（★見本を 作れなかった＝字が 当たらない★）'), kawatta && r.length > 0);
  }
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★' + (19 + DAMASHI.length) + '通り ぜんぶ 思った通り★');
  process.exit(0);
}

/* ── ここから 実ブラウザ ───────────────────────────────── */
import { hairu, toziru, osu } from './_hairu.mjs';   /* ★入る手順は 1か所★ */
let borrow, pwLaunch;
try { ({ borrow, launch: pwLaunch } = await import('../scripts/_borrow-playwright.mjs')); }
catch (e) { console.log('🟡 ★未測定★ playwright を 借りる 道具が 読めない … ' + (e && e.message)); process.exit(2); }
/* ★本番の repo では 走らせない（★字で 言ってから 抜ける★）★
   ★本番は 本番の 倉庫を 指す★＝test@test.com は 居ない＝★ログインできない★（実測＝3回とも）。
   ★黙って 緑に しない★＝下の 1行を CIの 記録に 必ず 残す。
   ★測っているのは テスト線★（同じ 画面の コードを 両方の repo が 持っている）。
   ★戻す条件★＝本番の CI に 試験用の 鍵を 置いた日。 */
{
  const { kagiAru } = await import('./_hairu.mjs');
  const _ne = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (!(await kagiAru(_ne))) {
    console.log('  — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★／戻す条件＝本番CIに 鍵を 置いた日）');
    process.exit(0);
  }
}
const wk = await borrow('sumaho-haba', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

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
const b = await pwLaunch('sumaho-haba', wk);

/* ★画面のエラーは 2つに 分ける★（2026-09-08 実測）
   ★総なめで 1回だけ 赤に なった★＝中身は
     「…supabase.co/auth/v1/token?grant_type=password due to access control checks.」
   ＝★倉庫への 通信が その回だけ 断られた★（何本も 同時に ログインしている時に 出る）。
   ★これは 画面の 穴では ない★＝単独で 走らせると 緑（待った 41回／混んだ時 144回）。
   ⇒ ★通信の 失敗は 🟡未測定★（測れていない）／★作りの 落ちは 赤★。
   ★黙って 緑には しない★＝どちらも 字で 出す。 */
function tsushinKa(m) {
  return /supabase|fetch|network|access control|Load failed|NetworkError|ERR_|timed? ?out/i.test(String(m));
}
const HABA = [375, 390, 412];
/* ★押す物の 一覧を 先に 書く★（決まり＝実UIの 押し込みは 一覧を 先に） */
const GAMEN = [
  { nm: '給与（入口）', url: '/kyuyo/index.html', matsu: '#loginEmail, .bn[data-scr]' },
  { nm: '請求書（入口）', url: '/seikyu/index.html', matsu: 'input, button, .bn, [data-scr]' },
  { nm: '従業員の明細（web）', url: '/kyuyo/meisai.html', matsu: 'body > *' },
  /* ★2026-09-08 足した★ 司さん「事業いれるとこの追加が右にはみ出てわからん」
     ＝★入口(index.html)を この見張りは 一度も 見ていなかった★（給与・請求書・明細の3本だけ）。
     ★一番 守りたい物が 見る範囲に 入っているか 名指しで 確かめる★の 通りに 足す。 */
  { nm: 'Rakunally（入口）', url: '/index.html', matsu: '.bn-i[data-go], .tile, button' }
];
/* ★入口の 中の 画面★（ホーム／データ）＝★事業の「追加」は データの 中に 在る★ */
const HUB_NAKA = ['scr-hub', 'scr-data'];
/* ★入口だけ 320 も 見る★（2026-09-08 司さん「事業いれるとこの追加が右にはみ出てわからん」）
   ★実測★ .chip-add input が flex:1（min-width:auto）だと
     320px で 追加ボタンが ★幅62→53・高44→64＝札が「追／加」と 2行に 割れた★。
   ★375以上では 出ない★＝手元の WebKit の 字幅と 実機の 字幅が 違うので、
     司さんの 実機で 起きた 物を 手元で 出すには ★狭い所で 測る★のが 一番 確か。
   ★他の画面の 幅は 変えていない★（別件の 赤を 混ぜない）。 */
const HUB_HABA = [320, 375, 390, 412];
/* ★入口だけでは 足りない★＝★入ってからの 画面★も 見る（2026-09-05）
   ★代行請求は 6画面（設定/入金/入力/一覧/編集/請求）を 1つずつ 押していた★
   ⇒ うちも ★入ってから タブを 1つずつ 押して 測る★（押す物の 一覧を 先に 書く） */
/* ★名前は 実物から 取る★（2026-09-05＝推し量って 6件 空振りした）
     kyuyo/index.html の data-scr を 数えた＝5つ */
const NAKA = ['scr-input', 'scr-list', 'scr-print', 'scr-furikomi', 'scr-settings'];

let akai = 0, mihakari = 0, mita = 0, mattaKei = 0;
if (hashiru('①入口の 4画面')) for (const g of GAMEN) {
  for (const w of HABA) {
    const pg = await (await b.newContext({ viewport: { width: w, height: 820 } })).newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
    await pg.goto('http://localhost:' + PORT + g.url, { waitUntil: 'domcontentloaded' });
    /* ★出た事その物を 待つ★（回数も 出す＝2026-09-04 の 決まり） */
    let matta = 0, deta = false;
    for (let i = 0; i < 60; i++) { matta++; if (await pg.$(g.matsu)) { deta = true; break; } await new Promise((r) => setTimeout(r, 250)); }
    mattaKei += matta;
    if (!deta) { console.log('  🟡 ' + g.nm + ' 幅' + w + ' … ★未測定★（入口の 部品が 出ない・待った ' + matta + '回）'); mihakari++; await pg.close(); continue; }
    await new Promise((r) => setTimeout(r, 400));
    const m = await pg.evaluate(() => {
      const de = document.documentElement;
      const bad = [];
      const all = document.querySelectorAll('body *');
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (el.children.length) continue;                 /* 自分が 字を 描いている 物だけ */
        const t = (el.textContent || '').trim();
        /* ★借り元は 4文字未満を 見ていなかった★（2026-09-05 実測）
           ⇒ うちの タブの 札は「入力」「一覧」「印刷」「振込」「設定」＝★2文字★
           ⇒★日本語の 札が まるごと 見張りの 外に 落ちていた★（わざと 潰しても 赤に ならなかった）
           ⇒★2文字から 見る★（1文字は 「×」「✓」等 の 印なので 見ない） */
        if (t.length < 2) continue;
        const fsz = parseFloat(cs.fontSize) || 12;
        /* ★ちょうどは 割れに しない★（1e-9 の 余裕＝上の 注記） */
        if (r.width < fsz * 1.6 - 1e-9 && r.height > fsz * 2.4 + 1e-9) bad.push({ t: t.slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) });
      }
      return { over: de.scrollWidth - de.clientWidth, bad: bad, kazu: all.length };
    });
    mita++;
    const ng = (m.over > 0) || m.bad.length;
    if (ng) akai++;
    console.log('  ' + (ng ? '✗' : '✓') + ' ' + g.nm + ' 幅' + w
      + ' … はみ出し ' + m.over + 'px ／ 縦に割れ ' + m.bad.length + '件 ／ 見た部品 ' + m.kazu + '個'
      + (matta > 2 ? '（待った ' + matta + '回）' : ''));
    if (m.bad.length) m.bad.slice(0, 3).forEach((x) => console.log('       ★割れ★ 「' + x.t + '」 幅' + x.w + '×高' + x.h));
    if (errs.length) {
      const ts = errs.filter(tsushinKa), hn = errs.filter((x) => !tsushinKa(x));
      if (hn.length) { console.log('       ★画面のエラー（作りの落ち）★ ' + hn.join(' / ')); akai++; }
      if (ts.length) { console.log('       🟡 倉庫への 通信が 断られた（測れていない）… ' + ts.join(' / ')); mihakari++; }
    }
    await pg.close();
  }
}

/* ── ★入ってからの 画面★（給与）──────────────────────────── */
for (const w of HABA) {
  if (!hashiru('②給与の中 幅' + w)) continue;
  const pg = await (await b.newContext({ viewport: { width: w, height: 820 } })).newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  /* ★入る手順は tests/_hairu.mjs 1か所★（3本に 写していた／★1回で 諦めて たまに 未測定★だった）
     ★覆い（はじめかたガイド等）は 本物の 閉じる ボタンで 閉じる★
     ＝★覆ったままだと クリックが 届かない★（2026-09-05 実測＝ui-modal-ov が 邪魔していた） */
  const _h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-list"]');
  await toziru(pg);
  const matta = _h.matta;
  if (_h.kai > 1) console.log('  （入るのに ' + _h.kai + '回 掛かりました＝倉庫の 通信の 気まぐれ）');
  mattaKei += matta;
  const haitta = await pg.evaluate(() => { const e = document.getElementById('loginEmail'); return !(e && e.offsetParent); });
  if (!haitta) { console.log('  🟡 給与（入ってから） 幅' + w + ' … ★未測定★（入れなかった）'); mihakari++; await pg.close(); continue; }
  for (const scr of NAKA) {
    const aru = await pg.$('.bn[data-scr="' + scr + '"]');
    if (!aru) { console.log('  🟡 給与 ' + scr + ' 幅' + w + ' … ★未測定★（そのタブが 無い）'); mihakari++; continue; }
    /* ★覆いは 画面を 移るたびに 出る★（2026-09-05 実測＝ここで 落ちていた）
       ⇒★毎回 本物の 閉じる ボタンで 閉じてから 押す★／押せなければ ★未測定★（黙って 落ちない） */
    const o = await osu(pg, '.bn[data-scr="' + scr + '"]');
    if (!o.oseta) { console.log('  🟡 給与 ' + scr + ' 幅' + w + ' … ★未測定★（' + o.kai + '回 試して タブが 押せない・覆いの 閉じ残り ' + o.nokori + '）'); mihakari++; continue; }
    await new Promise((r) => setTimeout(r, 600));
    const m = await pg.evaluate(() => {
      const de = document.documentElement; const bad = [];
      const all = document.querySelectorAll('body *');
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (el.children.length) continue;
        const t = (el.textContent || '').trim();
        /* ★借り元は 4文字未満を 見ていなかった★（2026-09-05 実測）
           ⇒ うちの タブの 札は「入力」「一覧」「印刷」「振込」「設定」＝★2文字★
           ⇒★日本語の 札が まるごと 見張りの 外に 落ちていた★（わざと 潰しても 赤に ならなかった）
           ⇒★2文字から 見る★（1文字は 「×」「✓」等 の 印なので 見ない） */
        if (t.length < 2) continue;
        const fsz = parseFloat(cs.fontSize) || 12;
        if (r.width < fsz * 1.6 - 1e-9 && r.height > fsz * 2.4 + 1e-9) bad.push({ t: t.slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) });
      }
      return { over: de.scrollWidth - de.clientWidth, bad: bad, kazu: all.length };
    });
    mita++;
    const ng = (m.over > 0) || m.bad.length;
    if (ng) akai++;
    console.log('  ' + (ng ? '✗' : '✓') + ' 給与 ' + scr + ' 幅' + w
      + ' … はみ出し ' + m.over + 'px ／ 縦に割れ ' + m.bad.length + '件 ／ 見た部品 ' + m.kazu + '個');
    if (m.bad.length) m.bad.slice(0, 3).forEach((x) => console.log('       ★割れ★ 「' + x.t + '」 幅' + x.w + '×高' + x.h));
  }
  if (errs.length) {
    const ts = errs.filter(tsushinKa), hn = errs.filter((x) => !tsushinKa(x));
    if (hn.length) { console.log('       ★画面のエラー（作りの落ち）★ ' + hn.join(' / ')); akai++; }
    if (ts.length) { console.log('       🟡 倉庫への 通信が 断られた（測れていない）… ' + ts.join(' / ')); mihakari++; }
  }
  await pg.close();
}

/* ── ★入口(Rakunally)の 中の 画面★ ────────────────────────── */
if (hashiru('③入口の中')) for (const w of HUB_HABA) {
  const pg = await (await b.newContext({ viewport: { width: w, height: 820 } })).newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  /* ★入口は ログインしないと 中身の 幅が 0★（2026-09-08 実測＝
     画面を 切り替えても .app が hidden のままで ★全部 幅0★＝わざと 壊しても 緑だった）。
     ⇒ ★給与と 同じ hairu で 入ってから 測る★（★入れなければ 未測定★・緑に しない）。 */
  const _h2 = await hairu(pg, 'http://localhost:' + PORT + '/index.html', '.bn-i[data-go]');
  mattaKei += _h2.matta;
  await toziru(pg);
  const haitta2 = await pg.evaluate(() => {
    const a = document.getElementById('app');
    const e = document.getElementById('loginEmail');
    return !!(a && !a.hidden) && !(e && e.offsetParent);
  });
  if (!haitta2) { console.log('  🟡 入口（中） 幅' + w + ' … ★未測定★（入れなかった）'); mihakari++; await pg.close(); continue; }
  for (const scr of HUB_NAKA) {
    const oseta = await pg.evaluate((s2) => {
      const b2 = document.querySelector('.bn-i[data-go="' + s2 + '"]');
      if (!b2) return false; b2.click(); return true;
    }, scr);
    if (!oseta) { console.log('  🟡 入口 ' + scr + ' 幅' + w + ' … ★未測定★（その札が 無い）'); mihakari++; continue; }
    await new Promise((r) => setTimeout(r, 600));
    const m = await pg.evaluate(() => {
      const de = document.documentElement; const bad = [];
      const all = document.querySelectorAll('body *');
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (el.children.length) continue;
        const t = (el.textContent || '').trim();
        if (t.length < 2) continue;
        const fsz = parseFloat(cs.fontSize) || 12;
        if (r.width < fsz * 1.6 - 1e-9 && r.height > fsz * 2.4 + 1e-9) bad.push({ t: t.slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) });
      }
      /* ★はみ出しは「押せない物が 在るか」でも 見る★＝画面の 右端より 外に 出た 押す物 */
      const soto = [];
      document.querySelectorAll('button, input, select, a').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        if (r.right > de.clientWidth + 1e-9) soto.push({ t: (el.textContent || el.value || el.id || '').trim().slice(0, 14), r: Math.round(r.right) });
      });
      /* ★測れているかを 自分で 確かめる★＝押す物が 1つも 見えないなら ★未測定★
         （幅0の 画面を「はみ出し0」と 読むのが 2026-09-08 の 偽の緑だった） */
      let mieru = 0;
      document.querySelectorAll('button, input, select').forEach((el) => {
        const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) mieru++;
      });
      /* ★押す物の 札が 折り返していないか★（2026-09-08）
         ＝はみ出し 0px でも ★ボタンが 潰れて「追／加」と 2行に なる★事が 在る。
         司さんが 見たのは これ。★字に 改行が 無いのに 2行ぶんの 高さ★＝潰れている。 */
      const oreta = [];
      document.querySelectorAll('button, .b2, .btn-primary, .btn-ghost').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        const t = (el.textContent || '').trim();
        if (t.length < 2 || t.indexOf(String.fromCharCode(10)) >= 0) return;   /* 元から 2行の 札は 見ない */       /* 元から 2行の 札は 見ない */
        /* ★中に 部品を 持つ ボタンは 見ない★（2026-09-08 実測＝下の札は
           <span>🏠</span>ホーム で ★わざと 2行★＝これを 赤にすると 嘘に なる）。
           見るのは ★字だけの ボタン★（「追加」「保存」など）。 */
        if (el.children.length) return;
        const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 14) * 1.4;
        const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
          + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
        if (r.height > pad + lh * 1.9) oreta.push({ t: t.slice(0, 14), w: Math.round(r.width), h: Math.round(r.height) });
      });
      return { over: de.scrollWidth - de.clientWidth, bad: bad, kazu: all.length, soto: soto, mieru: mieru, oreta: oreta };
    });
    if (!m.mieru) { console.log('  🟡 入口 ' + scr + ' 幅' + w + ' … ★未測定★（押す物が 1つも 見えない＝幅0の 画面を 測っていた）'); mihakari++; continue; }
    mita++;
    const ng = (m.over > 0) || m.bad.length || m.soto.length || m.oreta.length;
    if (ng) akai++;
    console.log('  ' + (ng ? '✗' : '✓') + ' 入口 ' + scr + ' 幅' + w
      + ' … はみ出し ' + m.over + 'px ／ 縦に割れ ' + m.bad.length + '件 ／ 画面の外の 押す物 ' + m.soto.length + '個'
      + ' ／ ★札が 折り返した ボタン ' + m.oreta.length + '個★ ／ 見えた押す物 ' + m.mieru + '個');
    m.soto.slice(0, 3).forEach((x) => console.log('       ★外★ 「' + x.t + '」 右端' + x.r + 'px（画面は ' + w + 'px）'));
    m.oreta.slice(0, 3).forEach((x) => console.log('       ★折り返し★ 「' + x.t + '」 幅' + x.w + '×高' + x.h));
    if (m.bad.length) m.bad.slice(0, 3).forEach((x) => console.log('       ★割れ★ 「' + x.t + '」 幅' + x.w + '×高' + x.h));
  }
  if (errs.length) {
    const ts = errs.filter(tsushinKa), hn = errs.filter((x) => !tsushinKa(x));
    if (hn.length) { console.log('       ★画面のエラー（作りの落ち）★ ' + hn.join(' / ')); akai++; }
    if (ts.length) { console.log('       🟡 倉庫への 通信が 断られた（測れていない）… ' + ts.join(' / ')); mihakari++; }
  }
  await pg.close();
}

await b.close(); srv.close();
console.log('\n  段 ' + (BU === null ? '全部（--bu 無し）' : BU) + ' ／ 見た ' + mita + '通り ／ ★赤 ' + akai + '★ ／ 🟡未測定 ' + mihakari + ' ／ 待った のべ ' + mattaKei + '回');
console.log('  ★借りたのは 測り方だけ★（daikou-seikyu tests/e2e/paper-width.spec.js・2026-08-10）');
/* ★見た 通りが 0 は 赤★（決め2 10-11＝全部 未測定で 緑に しない。oseru-ka と 同じ） */
if (mita === 0) { console.log('  ✗ ★見た 通りが 0（段 ' + (BU === null ? '全部' : BU) + '）＝何も 測って いない★'); akai++; }
process.exit(akai ? 1 : 0);
