/* clock-sweep.mjs — ★ci.yml を そのまま 別の日で 走らせる★
 * ============================================================================
 * ★数だけ見ない★（Timeally が 853→844→853 と 揺れた・経営者 2026-09-02）
 *   ＝★走った本数・赤・★未測定と出た物★を ぜんぶ 名前で 出す★。
 *   ★未測定は 0件ではない★（道具が無くて 中を見ていないだけ＝緑と同じ顔をする）。
 *
 * 使い方
 *   FAKE_NOW=2026-10-01 NODE_OPTIONS="--import file:///<repo>/tools/fake-clock.mjs" \
 *     node tools/clock-sweep.mjs
 *   FROM/TO … ci.yml の何番目から何番目か（1回が長すぎる時に 区切る）
 *   SKIP    … 走らせない命令（例 SKIP="self-test"）★外したら 報告に必ず書く★
 *   SAVE    … 走らせた物と結果を 書き出す（次に 突き合わせる為）
 *   SWEEP_OUT … ★緑も 含めて 1本ずつの 出しを 全部 書く★（2026-09-15 に 足した）
 *             ★なぜ 要るか★＝ここは ★赤の 中身しか 控えていなかった★。
 *               ⇒ ★緑の 中に 書いてある 事（どの道を 通ったか・何月を 選んだか）が 読めない★
 *               ⇒ ★確かめる為に もう1回 走らせる★事に なっていた（★二度手間・お金も 時間も★）。
 *             ★置き場は 消える所（作業場）に する★＝★repo に 入れない★
 *               （出しには ★url・id・人の 名前★が 混ざる事が 在る）。
 *             例 SWEEP_OUT=/tmp/sweep-out
 *   BASE    … 前の SAVE と 突き合わせ、★減った物・増えた物を 名前で出す★
 *             （Timeally が 853→844→853 と 揺れた。★数だけ見ると 気づけない★）
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

/* ★どの workflow を 走らせるか★（既定 ci.yml）
 *   ★ci.yml だけ見ると 画面の試験(webkit.yml)が 丸ごと 抜ける＝★0件ではなく 未測定★★
 *   例 YML=.github/workflows/webkit.yml SKIP="playwright install|npm install" */
const YML = process.env.YML || '.github/workflows/ci.yml';
const yml = fs.readFileSync(YML, 'utf8');
/* ★拾った 段★＝ci.yml の run: を 全部（★人が 数えた 本数では ない★）
   ★2026-09-05 の 決まり（指示役 e9fdf1c）★
     「押す前の『全部 緑』は ★CI と 同じ 物を 走らせて から★ 言う」
     「出す形＝★拾った 段 ◯／走らせた ◯／赤 ◯／飛ばした ◯（理由つき）★」
     「★1段も 走らなければ 赤★」（★0段 走って 緑★を 塞ぐ）
   ★Exally が 1日で 2回 踏んだ★＝「全部」の 中身が 人と 機械で ちがった */
const hirotta = [...yml.matchAll(/^\s*run:\s*(.+)$/gm)].map((m) => m[1].trim());
const all = hirotta.filter((c) => !/^npm install/.test(c));
const nozoita = hirotta.length - all.length;   /* 支度（npm install）＝走らせない */
/* ★★分けて 回す 時は「合わせて 全部か」を 数で 出す★★（2026-09-19 司さん「分けてやれや」）
   ★訳★ … 総なめが ★3度 メモリで 止められた★（235段は 1回で 走り切れない 日が 在る）。
   ⇒ ★FROM/TO で 半分ずつ★ 回す。★但し 分けたら 隙間が 出来る★＝
     「前半 緑・後半 緑」と 言えても ★真ん中を 誰も 走らせて いない★事が 起こり得る。
   ⇒ ★毎回 出しに「この回は ◯〜◯／全 ◯段」を 出す★
     ＋★分けた 時は「残りは ◯〜◯」も 出す★＝★次に 何を 回せば よいかが 字で 残る★
   ＝[[feedback_souname_wo_tochu_de_tomeruna]] を ★守れる 形に 変えた★物
     （★止めるな★では なく ★止めたなら どこまでかを 数で 残せ★）。 */
const from = Number(process.env.FROM || 1);
const to = Number(process.env.TO || all.length);
const WAKETA = from > 1 || to < all.length;
const skip = process.env.SKIP ? new RegExp(process.env.SKIP) : null;

const red = [], mihakari = [], skipped = [], jiAri = [], maruAri = [];
const result = {};
let n = 0;
/* ★全部の 出しを 書く 置き場★（SWEEP_OUT）。★repo の 中を 指されたら 止める★
   ＝出しには url・id・人の 名前が 混ざる事が 在る＝★commit に 紛れ込ませない★ */
const OUT_DIR = process.env.SWEEP_OUT || null;
if (OUT_DIR) {
  const YEN = String.fromCharCode(92);   /* 逆斜線（字で 作る＝便りで 落ちない） */
  const koko = process.cwd().split(YEN).join('/').toLowerCase();
  const soko = OUT_DIR.split(YEN).join('/').toLowerCase();
  if (soko.indexOf(koko) === 0) {
    console.log('  ✗ ★SWEEP_OUT が repo の 中を 指しています★ … ' + OUT_DIR);
    console.log('     ★出しには url・id・人の 名前が 混ざる事が 在る＝repo の 外（作業場）に 置いて ください★');
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
}
function zenbuKaku(i, c, out) {
  if (!OUT_DIR) return;
  try {
    const NL = String.fromCharCode(10);
    fs.writeFileSync(OUT_DIR + '/' + String(i) + '.txt',
      '# ' + c + NL + '# ' + new Date().toISOString() + NL + NL + out, 'utf8');
  } catch (_) { console.log('  🟡 出しを 書けません #' + i); }
}

for (let i = from; i <= Math.min(to, all.length); i++) {
  const c = all[i - 1];
  if (skip && skip.test(c)) { skipped.push('#' + i + ' ' + c); continue; }
  n++;
  let out = '';
  try { out = String(execSync(c, { stdio: 'pipe', encoding: 'utf8', timeout: 300000 }) || ''); }
  catch (e) {
    red.push('#' + i + ' ' + c);
    out = ((e.stdout || '') + (e.stderr || ''));
    /* ★赤の 中身は 次の回で 上書きされる★＝★出た その場で 控えを 取る★
       （2026-09-05 実測＝ブラウザを 使う 見張りが 回ごとに ちがう 1本だけ 赤になる。
         走らせ直すと 緑＝★推理を 先に 語らない・まず 記録係を 置く★） */
    try {
      fs.mkdirSync('.sweep-red', { recursive: true });
      const NL = String.fromCharCode(10);
      fs.writeFileSync('.sweep-red/' + String(i) + '.txt',
        '# ' + c + NL + '# ' + new Date().toISOString() + NL + NL + out, 'utf8');
    } catch (_) { console.log('  🟡 赤の控えが 書けません'); }
  }
  /* ★★「未測定」は ★各段の 終わりの 行★で 数える★★（2026-09-19 実測で 直した）
   ★前★ … ★出しの どこかに「未測定」の 字が 在れば 未測定★と 数えて いた。
   ★何が 起きたか★ … webkit の 総なめが ★未測定 8本★と 出した。1本ずつ 中を 見たら
     ★7本は 全部 緑★で、引っかかった 字は
       ・「★本番の 倉庫では 未測定★」（試験が 正直に 書いた 但し書き）… 6本
       ・「前が 無ければ 未測定」（判じの 名前）………………………… 1本
     ⇒ ★★訳を 書けば 書くほど 未測定が 増える 物差し★★＝★正直さが 罰される★
     ⇒ ★本当に 測れて いない 段は 0本★だった（#26 の 1件だけ「はかれない」）
   ★直し★ … ★終わりの 5行★を 見て ★数か 印★で 決める（正規表現は 使わない＝逆斜線が 落ちる repo）。
     ・「N はかれない」「未測定 N」… ★N が 1以上★なら 未測定
     ・行の 頭が 🟡 で 未測定/はかれない … 段まるごと 未測定（材料や 道具が 無い）
   ★字が 在った 段★も ★別建てで 数だけ 出す★＝★隠さない／混ぜない★ */
function kazuWoHiku(l, go) {
  /* ★`go` の 前後に 在る 数を 取る★（`12 はかれない` ／ `未測定 3` の 両方） */
  const i = l.indexOf(go);
  if (i < 0) return -1;
  /* ★★数と 語の 間に 在ってよいのは 空白と ★ だけ★★（2026-09-19 実測で 足した）
     ★踏んだ 穴★ … `kaisha-jusho-todoku` の ★凡例★
       「終わり値 0（0＝出た／1＝出ない＝赤／★2＝材料が 無くて はかれない★）」
     ⇒ 前の 作りは ★語の 前に 在る 最後の 数★を 取り ★2★ と 読んだ
     ⇒ ★説明の 字を 数として 数えた★＝★この 道具が 直そうと している 穴と 同じ 形★
     ⇒ ★間に 何が 挟まって いるか まで 見る★。 */
  const yurusu = (x) => x.split('').every((ch) => ch === ' ' || ch === '　' || ch === '★');
  const maeAll = l.slice(0, i);
  const m = maeAll.match(/([0-9]+)([^0-9]*)$/);
  if (m && yurusu(m[2])) return Number(m[1]);
  const atoAll = l.slice(i + go.length);
  const m2 = atoAll.match(/^([^0-9]*)([0-9]+)/);
  if (m2 && yurusu(m2[1])) return Number(m2[2]);
  return -1;
}
/* ★★🟡の 印が 出た 段も 別に 数える★★＝★終わりの 行だけ 見ると 途中の 印を 見落とす★
   ★隠さない／混ぜない★＝3つ 並べて 出す（本当に 未測定／印が 出た／字が 在っただけ）。
   ★「🟡未測定 0」は 数えない★（0件は 0件）。 */
function maruShirushi(out) {
  const gyo = String(out || '').split(String.fromCharCode(10)).map((l) => l.trim());
  for (const l of gyo) {
    if (l.indexOf('🟡') !== 0) continue;
    if (l.indexOf('未測定') < 0 && l.indexOf('はかれない') < 0) continue;
    const n0 = kazuWoHiku(l, '未測定');
    const n1 = kazuWoHiku(l, 'はかれない');
    if (n0 === 0 || n1 === 0) continue;         /* ★0件と 書いて ある★ */
    return true;
  }
  return false;
}
/* ★★行数で 切らない＝出し 全部を 見る★★（2026-09-19 指示役1 の 指摘で 直した）
   ★前★ … ★終わりの 5行★だけ 見て いた。
   ★何が 危ないか★ … 段が 締めの 後に 6行 書いたら ★その段は 数えられない★
     ⇒ しかも ★黙って 0 に なる★（＝「未測定 0本」に 化ける）
     ＝★私が 今日 `tail -6` で 踏んだ のと 同じ 形★
     ＝[[feedback_mihari_wo_kimatta_jisuu_de_kiru_na]]
   ★直し★ … ★窓を 無くした★。出しの ★全部の 行★を 見て
     ・★数が 語の 隣★（`N はかれない` ／ `未測定 N`・N≥1）… 未測定
     ・行の 頭が 🟡 で 未測定/はかれない（「0」と 書いて ある物は 除く）… 未測定
     ⇒ ★決め打ちの 数が 1つも 無い★／★黙って 落ちる 行が 無い★
   ★どの 行で そう 決めたか も 返す★＝★根拠を 隠さない★ */
function hontouNiMihakari(out) {
  const gyo = String(out || '').split(String.fromCharCode(10))
    .map((l) => l.trim()).filter((l) => l.length);
  for (let i = gyo.length - 1; i >= 0; i--) {
    const l = gyo[i];
    for (const go of ['はかれない', '未測定']) {
      const n = kazuWoHiku(l, go);
      if (n > 0) return go + ' ' + n + '（後ろから ' + (gyo.length - i) + '行目／全 ' + gyo.length + '行）';
    }
    if (l.indexOf('🟡') === 0 && (l.indexOf('未測定') >= 0 || l.indexOf('はかれない') >= 0)) {
      const n0 = kazuWoHiku(l, '未測定'), n1 = kazuWoHiku(l, 'はかれない');
      if (n0 !== 0 && n1 !== 0) return '段まるごと（後ろから ' + (gyo.length - i) + '行目）';
    }
  }
  return '';
}

/* ★★この 数え方 自身の 自己確認★★（`--self-test-kazoe`）
   ★見本は 全部 ★本物の 総なめの 出し★から 取った★（作り話で 通さない）。
   ★足した 門は その場で わざと 壊す★＝[[feedback_mon_wa_hikitsugarenai]] */
if (process.argv.indexOf('--self-test-kazoe') >= 0) {
  const N = String.fromCharCode(10);
  const cases = [
    ['★数が 1以上＝未測定★（seirino-ui の 実物）',
      'いろいろ' + N + '★締め★ 4 passed, 0 failed, 1 はかれない', true],
    ['★凡例の 数は 数えない★（kaisha-jusho-todoku の 実物）',
      'いろいろ' + N + '終わり値 0（0＝出た／1＝出ない＝赤／2＝材料が 無くて はかれない）', false],
    /* ★実物から 取ったが ★「倉」「庫」の 2字だけ 外した★
       ＝`scripts/screen-words.mjs`（画面に出る字の 見張り）が その 語を 禁じて いる為。
       ★測る 物（但し書きに 未測定の 字が 在っても 数えない）は 1つも 変わらない★ */
    ['★但し書きの 字は 数えない★（私が 足した 1行・2字だけ 外した）',
      '★この 測りは 試験の 側の 数です／本番では 未測定★' + N + '8 passed, 0 failed', false],
    ['★判じの 名前は 数えない★（_souko-kazoeru の 実物）',
      '✓ ⑤ 前が 無ければ 未測定' + N + '自己確認 OK（★赤が 出る事まで 見た★）', false],
    ['★0件は 数えない★', '見た 27通り ／ 🟡未測定 0', false],
    ['★段まるごと 未測定★', '🟡 ★未測定★ playwright を 借りられない', true],
    /* ★締めの 後ろに 何行 在っても 見つける★（前は 5行で 切って いた＝黙って 0に なる） */
    ['★締めの 後に 8行 在っても 見つける★',
      '4 passed, 0 failed, 1 はかれない' + N + 'あ' + N + 'い' + N + 'う' + N + 'え' + N + 'お' + N + 'か' + N + 'き' + N + 'く', true],
    ['★締めの 前に 何行 在っても 見つける（窓で 切らない）★',
      'あ' + N + 'い' + N + 'う' + N + 'え' + N + 'お' + N + 'か' + N + 'き' + N + '🟡 ★はかれない★ 道具が 無い' + N
      + 'く' + N + 'け' + N + 'こ' + N + 'さ' + N + 'し' + N + 'す' + N + 'せ', true],
  ];
  let ng = 0;
  console.log(N + '[clock-sweep] ★未測定の 数え方の 自己確認★');
  for (const [na, src, hazu] of cases) {
    const got = !!hontouNiMihakari(src);
    if (got !== hazu) ng++;
    console.log('  ' + (got === hazu ? '✓' : '✗') + ' ' + na + (got === hazu ? '' : '  ★思っていたのと 違う★'));
  }
  console.log(ng ? '★自己確認 ' + ng + '件 おかしい★' : '  ★' + cases.length + '通り ぜんぶ 思った通り★');
  process.exit(ng ? 1 : 0);
}

/* ★字で拾っている事を 隠さない★＝拾った行を そのまま 見せる。
     実測 2026-09-02 … 11本のうち 5本は ★『未測定 0件』と書いてある行★＝中身は 0だった */
  zenbuKaku(i, c, out);
  if (/未測定|はかれない/.test(out)) jiAri.push('#' + i + ' ' + c);
  if (maruShirushi(out)) maruAri.push('#' + i + ' ' + c);
  const hon = hontouNiMihakari(out);
  if (hon) {
    const hit = out.split('\n').filter((l) => /未測定|はかれない/.test(l)).slice(-2)
      .map((l) => l.trim()).join(' ／ ');
    mihakari.push('#' + i + ' ' + c + '（' + hon + '）\n        終わりの 行 … ' + hit);
  }
  result[c] = red[red.length - 1] === '#' + i + ' ' + c ? '赤' : (hon ? '未測定' : '緑');
}
console.log('\n[clock-sweep] ' + YML + ' ／ 時計 ' + (process.env.FAKE_NOW || process.env.DK_FAKE_NOW || '★本物★')
  + '  （' + YML.split('/').pop() + ' #' + from + '〜#' + Math.min(to, all.length) + '／全 ' + all.length + '本）');
/* ★1段も 走らなければ 赤★（★0段 走って 緑★を 塞ぐ＝2026-09-05 の 決まり） */
if (n === 0) { console.log('  ★赤★ 1段も 走っていません（拾った 段 ' + hirotta.length + '）'); process.exit(1); }
if (WAKETA) {
  console.log('  ★★この回は 分けて 回しました★★ … ★' + from + '〜' + to + '段目★（全 ' + all.length + '段）');
  const nokori = [];
  if (from > 1) nokori.push('1〜' + (from - 1));
  if (to < all.length) nokori.push((to + 1) + '〜' + all.length);
  console.log('  ★★残り（この回で 走らせて いない）★★ … ' + (nokori.join(' と ') || '無し')
    + '　⇒ ★ここを 回すまで「全部 緑」とは 言えません★');
}
console.log('  ★拾った 段 ' + hirotta.length + '★ ／ 走らせた ' + n + '本 ／ ★赤 ' + red.length + '本★ ／ ★本当に 未測定 ' + mihakari.length + '本★ ／ 🟡の 印が 出た 段 ' + maruAri.length + '本 ／ 字が 在っただけ ' + jiAri.length + '本 ／ ★旧の 数え方 ' + jiAri.length + '本★'
  + ' ／ 飛ばした ' + (nozoita + skipped.length) + '本'
  + '（支度 ' + nozoita + '＝npm install' + (skipped.length ? '／SKIP ' + skipped.length : '') + '）');
red.forEach((x) => console.log('  ★赤★ ' + x + '  … 中身の控え .sweep-red/' + x.slice(1).split(' ')[0] + '.txt'));
mihakari.forEach((x) => console.log('  🟡未測定と出た（0件ではない） ' + x));
skipped.forEach((x) => console.log('  — 外した ' + x));

/* ★数だけで 済ませない★ … 前の回と 名前で 突き合わせる */
let diffRed = 0;
if (process.env.BASE) {
  let base = null;
  try { base = JSON.parse(fs.readFileSync(process.env.BASE, 'utf8')); }
  catch (e) { console.log('  🟡 ★前の回が 読めません★ … ' + process.env.BASE + '（突き合わせは 未測定）'); }
  if (base) {
    const gone = Object.keys(base).filter((k) => !(k in result));
    const add = Object.keys(result).filter((k) => !(k in base));
    const worse = Object.keys(result).filter((k) => base[k] === '緑' && result[k] !== '緑');
    console.log('  前の回と くらべて … 減った ' + gone.length + '本 ／ 増えた ' + add.length
      + '本 ／ 緑から外れた ' + worse.length + '本');
    gone.forEach((k) => console.log('  ★前は走ったのに 今は走っていない★ ' + k));
    add.forEach((k) => console.log('  ＋増えた ' + k));
    worse.forEach((k) => console.log('  ★緑から外れた★ ' + k + ' … ' + result[k]));
    diffRed = gone.length + worse.length;
  }
}
if (process.env.SAVE) {
  fs.writeFileSync(process.env.SAVE, JSON.stringify(result, null, 1), 'utf8');
  console.log('  控えを書いた … ' + process.env.SAVE + '（' + Object.keys(result).length + '本）');
}
process.exit((red.length || diffRed) ? 1 : 0);
