/* shot-fuyo-idou.mjs — ★被扶養者(異動)届の「増えた／減った／変わった」の 画面を 撮る★
 * =============================================================================
 * ★なぜ（2026-09-14）★
 *   これまで 出せたのは ★増えた（該当）だけ★。土台（fuyoRow）は 3つとも 作れたのに
 *   ★画面が 無かった★（kyuyo/docs/fuyo-2202700.md に そう 書いてある）。
 *   画面を 足したので ★字だけで OK を 出さず、絵を 開いて 目で 見る★。
 *
 * ★本体は 1文字も 変えていない★＝アプリの CSS と 実物の 家族カードの 形を そのまま 使い、
 *   「この人の 届出」を 3通りに した 時に ★出る欄が 変わる★所を 撮る。
 *
 * 使い方: node scripts/shot-fuyo-idou.mjs [出し先フォルダ]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, '.shot-fuyo');
fs.mkdirSync(OUT, { recursive: true });
const CSS = fs.readFileSync(path.join(ROOT, 'kyuyo', 'css', 'app.css'), 'utf8');

/* ★選択肢の 表は アプリと 同じ 出どころ★＝原文（項番48/52/92/95/99）の 写し */
const IDOU_T = [['1', '増えた（扶養に 入った）'], ['2', '減った（扶養から 外れた）'], ['3', '変わった（中身を 直す）']];
const YAME_SONO = [['', '（選んでください）'], ['1', '死亡'], ['2', '就職'], ['3', '収入増加'], ['4', '75歳到達'], ['5', '障害認定'], ['6', 'その他']];
const RIYU_SONO = [['', '（選んでください）'], ['1', '出生'], ['2', '離職'], ['3', '収入減'], ['4', '同居'], ['5', 'その他']];

const opt = (tbl, ima) => tbl.map((z) =>
  '<option value="' + z[0] + '"' + (String(ima || '') === z[0] ? ' selected' : '') + '>' + z[1] + '</option>').join('');

function card(idou) {
  return '<div class="card" style="padding:10px;margin:0 0 8px">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
    + '<b style="font-size:13px">年金　一郎</b>'
    + '<button class="b-del m-del" style="margin-left:auto">×</button></div>'
    + '<div class="frow2"><div class="frow"><div class="flabel">姓（漢字）</div>'
    + '<input class="finput" value="年金"></div>'
    + '<div class="frow"><div class="flabel">名（漢字）</div>'
    + '<input class="finput" value="一郎"></div></div>'
    + '<div class="frow2"><div class="frow"><div class="flabel">姓（カナ）<span class="hint2">半角カナ</span></div>'
    + '<input class="finput" value="ﾈﾝｷﾝ"></div>'
    + '<div class="frow"><div class="flabel">名（カナ）<span class="hint2">半角カナ</span></div>'
    + '<input class="finput" value="ｲﾁﾛｳ"></div></div>'
    + '<div class="frow2"><div class="frow"><div class="flabel">続柄<span class="hint2">届出の区分</span></div>'
    + '<select class="finput"><option>子（実子・養子）</option></select></div>'
    + '<div class="frow"><div class="flabel">郵便番号<span class="hint2">同居でも要る</span></div>'
    + '<input class="finput" value="100-8580"></div></div>'
    + '<div class="frow"><div class="flabel">住所<span class="hint2">同居でも要る・都道府県から</span></div>'
    + '<input class="finput" value="東京都千代田区霞が関1-2-2"></div>'
    + '<div class="ri-note" style="margin:10px 2px 6px;font-weight:700">この人の 届出</div>'
    + '<div class="frow"><div class="flabel">今回は どれですか<span class="hint2">選ぶと 下の 欄が 変わります</span></div>'
    + '<select class="finput">' + opt(IDOU_T, idou) + '</select></div>'
    + (idou === '1'
      ? '<div class="frow2"><div class="frow"><div class="flabel">同居／別居</div>'
        + '<select class="finput"><option>同居</option></select></div>'
        + '<div class="frow"><div class="flabel">年間収入（見込み）<span class="hint2">円</span></div>'
        + '<input class="finput num" value="0"></div></div>'
        + '<div class="frow2"><div class="frow"><div class="flabel">職業</div>'
        + '<select class="finput"><option>小・中学生以下</option></select></div>'
        + '<div class="frow"><div class="flabel">扶養に入った日</div>'
        + '<input class="finput" type="date" value="2026-04-01"></div></div>'
        + '<div class="frow"><div class="flabel">扶養に入った理由</div>'
        + '<select class="finput">' + opt(RIYU_SONO, '1') + '</select></div>'
      : '')
    + (idou === '2'
      ? '<div class="frow2"><div class="frow"><div class="flabel">扶養から 外れた日</div>'
        + '<input class="finput" type="date" value="2026-08-31"></div>'
        + '<div class="frow"><div class="flabel">外れた理由</div>'
        + '<select class="finput">' + opt(YAME_SONO, '2') + '</select></div></div>'
      : '')
    + (idou === '3'
      ? '<div class="frow"><div class="flabel">何を 変えたか<span class="hint2">変更前の 中身も 書く（届出に そのまま 出ます）</span></div>'
        + '<input class="finput" value="氏名変更（旧：年金　一朗）"></div>'
      : '')
    + '</div>';
}

const page = (idou) => '<!doctype html><meta charset="utf-8"><style>' + CSS
  + 'body{margin:0;padding:10px}#ha{font:700 12px/1.6 "Noto Sans JP",sans-serif;color:#555;padding:2px 2px 8px}</style>'
  + '<body><div id="ha"></div>' + card(idou)
  + '<script>document.getElementById("ha").textContent='
  + '"実測 幅 "+document.documentElement.clientWidth+"px（この絵の中で 測った数）";<\/script>';

const ch = await borrow('shot-fuyo-idou', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const br = await pwLaunch('shot-fuyo-idou', ch, undefined, 'chromium');
for (const [idou, na] of [['1', '1-増えた'], ['2', '2-減った'], ['3', '3-変わった']]) {
  const pg = await br.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  await pg.setContent(page(idou), { waitUntil: 'load' });
  await pg.waitForTimeout(250);
  const f = path.join(OUT, 'fuyo-' + na + '.png');
  await pg.screenshot({ path: f, fullPage: true });
  await pg.close();
  const b = fs.readFileSync(f);
  console.log('  ' + na.padEnd(10) + f + '  ' + b.length + 'バイト  sha256:' + createHash('sha256').update(b).digest('hex').slice(0, 12));
}
await br.close();
