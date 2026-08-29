/* make-logo.mjs — ★ロゴの文字を DM Mono で 打ち直す★（司さん 2026-08-28 の決定）
 *
 * ★なぜ この形か★
 *   ・元のロゴの文字は ★どの字体か 分からない★（このPCの365本と突き合わせて 一致0本／
 *     Canva にも元データ無し＝指示役が確認）。＝★再現できない物を 追いかけない★。
 *   ・全アプリの決まりは 前から ★ロゴ＝DM Mono / weight500 / letter-spacing -0.5px★
 *     （zeroact-memory/projects/daikome/rules.md 17行・各repoの CLAUDE.md）。
 *     ★絵のロゴだけ 別の字体だった★ので、★画面のヘッダーと同じ字体に 揃える★。
 *   ・字は ★画面(index.html)が読んでいるのと 同じURL・同じ版★を 本物のChromeに読ませて出す
 *     （別の所から拾わない）。読めなかった時は ★止まる★（別の字体で刷らない）。
 *
 * ★合わせ先（指示役が画素で実測した値）★
 *   絵 1024x1024 ／ ★ベースライン y=677★ ／ ★文字の中心 x=508★
 *   ★マークの形は 1ドットも触らない★＝y<560 は 元絵のまま（★色だけ 入れ替える★・下を見る）
 *   大きさ … ★R の高さ 68px★（＝文字幅495px＝★元のロゴと同じ 釣り合い★。下の CAP の説明を見る）
 *   字間 … ★-0.025em★＝画面の「20pxで -0.5px」と ★同じ見た目★（大きさが変わっても崩れない）
 *
 * ★字間は 詰めない（司さん 2026-08-29「Exallyと合わせろ」）★
 *   司さんの見立ては 数字でも 正しかった:
 *     字と字の白の広さ（実測）R-a 18 / a-k 16 / k-u 23 / u-n 13 / n-a 17 /
 *     ★a-l 24 / l-l 36 / l-y 31★ … ★lly だけ 広い★（ばらつき 13〜36px）
 *   ★原因は 等幅★＝どの字も 同じ幅の枠に入るので ★細い l の左右が 空く★。
 *   ★Exally も 同じ字体・同じ癖★（`.hd-logo` の決まりは ★1文字も違わない★＝機械で突き合わせ済み）。
 *   ⇒ ★司さんの決定＝Exally と 合わせる★＝★詰めない★。
 *   ★詰める仕掛けを 作ってはいけない★（2026-08-29 に作って ★字がぶつかった★＝-2px。取り消した）。
 *   ★戻す条件★＝「全アプリ DM Mono」を やめると 司さんが決めた日。
 *
 * ★色は 入れ替えた（司さん 2026-08-29「全部ミントでチェックだけ変えろや」）★
 *   前 … 枠・RA・字 #2E7D54（濃い）／チェック #52B788（ミント）
 *   今 … ★枠・RA・字 #52B788（ミント）／チェック #3D9E72（濃ミント）★
 *   ★チェックは 枠から 離しすぎない★（2026-08-29 に 2回 外した）
 *     #2E7D54（浮き2.03・濃い）… 司さん差し戻し「チェックにしか目がいかん」＝★一番 重い物になる★
 *     #C8ECD8（浮き1.94・薄い）… ★32pxで ほぼ 消える★（自分で 切り出して 見た）
 *     ★#3D9E72（浮き1.34）★  … 枠と 一体に見える。小さくしても 残る。
 *   ＝★「明るい方/濃い方」ではなく『枠から どれだけ 離れているか』が 効いていた★。
 *     ⇒ 下の自己確認で ★浮き 1.5 未満★を 決まりにした。
 *   ★理由★＝画面の頭のロゴは 前から #52B788。同じ名前が ★場所で 2色★だった。
 *   ★形は 1ドットも 変えていない★（塗り替えた元絵と 出来上がりを 1点ずつ 突き合わせる）。
 *   ★白の上での 読みやすさ（実測・WCAG）★ #2E7D54=5.03 ／ #52B788=2.47。
 *     字としての線(4.50)を 下回るのは 承知の上（★司さんの決定★）。
 *     ★枠と RA も ミント★なので、小さい所（favicon 16px）で 薄く見える。
 *     ★戻す条件★＝司さんが「濃い方に戻す」と 言った日。
 *
 * 使い方: node scripts/make-logo.mjs         … 刷り直す（Chrome と ネットが要る）
 *         node scripts/make-logo.mjs --check … 今の物と 同じ物が作れるか
 *         node scripts/make-logo.mjs --self-test
 * ※ CI では走らせない（ネットに出るため）。代わりに ★tests/own-name.test.mjs★ が
 *   「アイコンの寸法・不透明・?v=一致」を毎回 見る。
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOGO = path.join(ROOT, 'docs/logo/rakunally-logo.png');
/* ★元絵（マークだけ）★ … 出来上がりを 元絵にすると 刷るたび 色が回ってしまうので、
   ★塗り替える前のマーク★を 別に置く。字の帯(y>=560)は 真っ白＝旧名は 1文字も入っていない。
   （作り方: magick rakunally-logo.png -fill white -draw 'rectangle 0,560 1023,1023' …
     ＝★今のロゴの マークの帯と 1ドットも違わない★／改名前の元絵とも 一致：実測済み） */
export const MARK_SRC = path.join(ROOT, 'docs/logo/rakunally-mark-src.png');
export const WORD = 'Rakunally';
/* ★色（司さん 2026-08-29「全部ミントでチェックだけ変えろや」）★
     前は 枠・RA・字が #2E7D54（濃い）／チェックだけ #52B788（ミント）。
     ★画面の頭のロゴは 前から #52B788★なので ★同じ名前が 場所で 2色★になっていた。
     ⇒ 枠・RA・字 → ミント ／ チェック → ★濃ミント★。
     ★チェックを 濃い色にしては いけない★（2026-08-29 に #2E7D54 でやって 司さん差し戻し
       「チェックにしか目がいかん」）。★元の姿は「濃い枠に 明るいチェック」★＝
       チェックは ★地より 明るい方★に 逃がす物。濃い方に置くと ★一番 重い物★になる。
     ★2色とも 元から在るブランドの色★
       #52B788 … css/hub.css 2行目「ブランド: ミント #52B788」
       #C8ECD8 … 全画面の 枠の色（.card ／ .btn-ghost ／ .chip-btn の border）
     ＝★新しい色を 作っていない★。 */
export const WORD_INK = [82, 183, 136];    // #52B788 ミント … 枠・RA・字（＝画面の頭と同じ色）
export const CHECK_INK = [61, 158, 114];   // #3D9E72 濃ミント … チェックだけ
/** 元絵の色 → 新しい色。★この2本だけ★（他の色が混ざっていたら 赤にする） */
export const SWAP = [
  { from: [46, 125, 84], to: WORD_INK, why: '枠・RA（元は濃い）→ ミント' },
  { from: [82, 183, 136], to: CHECK_INK, why: 'チェック（元はミント）→ 濃ミント' },
];
export const INK = WORD_INK;               // 字の色（下の「色の見分け」が使う）
export const BASELINE = 677;               // 字の下端（実測・元のロゴと同じ）
export const CENTER_X = 508;               // 文字の中心（実測・元のロゴと同じ）
export const CAP = 68;                     // ★R の高さ★（指示役 2026-08-28 の判定＝B案）
/* ★なぜ 97 ではなく 68 か★
     元のロゴの R は 97px。同じ 97px で DM Mono を打つと ★文字幅が 704px★になり、
     ★マーク408px : 文字704px ＝ 1.7倍★で 釣り合いが崩れる（等幅で 字が1つ増えた為）。
     68px なら ★文字幅 495px★＝★元のロゴ（マーク408 : 文字495）と 同じ釣り合い★。
   ★既定をこれにする理由★＝--cap を打ち忘れた人が ★別の大きさのロゴを作ってしまう★のを防ぐ。 */
export const MARK_BOTTOM = 560;            // ここより上は ★1ドットも触らない★
export const FONT_URL = 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@500&display=swap';
const OUT = path.join(os.tmpdir(), 'rakunally-logo-build');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));

export const sha8 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 8);
/** [46,125,84] → '#2E7D54'（色を 2か所に書かない為） */
export const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
/** ★使ってよい色★（どこで 使われている色かも 書く＝勝手な色を 増やさない為） */
export const BRAND_COLORS = {
  '#52B788': 'ミント（css/hub.css 2行目・画面の頭のロゴ）',
  '#3D9E72': '濃ミント（押すボタンの地）',
  '#2E7D54': '主色（本文・見出し）',
  '#C8ECD8': '枠の色（.card ／ .btn-ghost ／ .chip-btn）',
  '#F0FAF4': '地の色',
};
/** 2色の 浮き（WCAG コントラスト比）… 1.0=同じ色・大きいほど 目立つ */
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** 明るさ（WCAG）… 0=真っ黒 1=真っ白 */
export const lum = (c) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};

/** 1色の点か（縁の混ざりを 数える為に 使う） */
export function classify(p) {
  if (p[0] === 255 && p[1] === 255 && p[2] === 255) return 'white';
  if (p[0] === INK[0] && p[1] === INK[1] && p[2] === INK[2]) return 'ink';
  /* ★白と 字の色を混ぜた色か★（縁のなめらかさ）。混ぜ具合 t を 3色から出して ずれを見る */
  const t = (255 - p[0]) / (255 - INK[0]);
  const g = 255 - t * (255 - INK[1]), b = 255 - t * (255 - INK[2]);
  if (t >= -0.01 && t <= 1.01 && Math.abs(p[1] - g) <= 2 && Math.abs(p[2] - b) <= 2) return 'edge';
  return 'other';
}

/** Chrome に DM Mono を読ませて 文字だけ刷る。★字が読めなければ 例外★ */
export function renderWord(size) {
  if (!CHROME) throw new Error('Chrome が見つかりません（★刷れていません★）');
  fs.mkdirSync(OUT, { recursive: true });
  const html = '<!doctype html><html><head><meta charset="utf-8">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link href="' + FONT_URL + '" rel="stylesheet">'
    + '<style>html,body{margin:0;background:#fff}'
    + '#w{font-family:\'DM Mono\',ui-monospace,monospace;font-weight:500;letter-spacing:-0.025em;'
    + 'color:' + hex(WORD_INK) + ';font-size:' + size + 'px;line-height:2;white-space:pre;display:inline-block;padding:60px}'
    + '#w span{display:inline-block}</style></head><body>'
    + '<div id="w">' + [...WORD].map((c) => '<span>' + c + '</span>').join('') + '</div>'
    + '<script>document.fonts.ready.then(function(){'
    + 'var ok=document.fonts.check("500 ' + size + 'px \'DM Mono\'");'
    + 'var ws=[].map.call(document.querySelectorAll("#w span"),function(s){'
    + 'return Math.round(s.getBoundingClientRect().width*100)/100;});'
    + 'document.title=(ok?"OK":"NG")+"|"+ws.join(",");});<\/script></body></html>';
  const page = path.join(OUT, 'w' + size + '.html');
  fs.writeFileSync(page, html, 'utf8');
  const png = path.join(OUT, 'w' + size + '.png');
  const dom = execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars',
    '--window-size=' + Math.ceil(size * 12 + 200) + ',' + Math.ceil(size * 5 + 200),
    '--virtual-time-budget=20000', '--screenshot=' + png, '--dump-dom', pathToFileURL(page).href],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, timeout: 120000 });
  const m = /<title>([^<]*)<\/title>/.exec(dom);
  if (!m) throw new Error('★字を刷れていません★（枠から答えが返らない）');
  const [ok, ws] = m[1].split('|');
  if (ok !== 'OK') throw new Error('★DM Mono を読めていません★（別の字体で刷らずに止めました）');
  return { png, advances: ws.split(',').map(Number) };
}

/* ═══ 自己確認 ═══ */
if (process.argv.includes('--self-test')) {
  let p = 0, f = 0;
  const T = (n, fn) => { try { fn(); p++; console.log('  ✓ ' + n); } catch (e) { f++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  const ok = (v, m) => { if (!v) throw new Error(m); };
  console.log('\n[make-logo --self-test]');
  T('★色の見分けが効いている★', () => {
    ok(classify([255, 255, 255]) === 'white');
    ok(classify(WORD_INK) === 'ink', '字の色を 字と読めていない');
    ok(classify([168, 219, 195]) === 'edge', '白と字の色の中間を「縁」と読めていない');
    ok(classify([200, 40, 40]) === 'other', '赤を通してしまう＝色の見張りが空振り');
    ok(classify(CHECK_INK) === 'other', '★字の帯に チェックの色が 混ざっても 気づける★');
  });
  T('★使う色は ブランドの色だけ（新しい色を 作っていない）★', () => {
    ok(SWAP.length === 2, '塗り替えの決まりは 2本だけ');
    ok(hex(WORD_INK) === '#52B788', '枠・RA・字が ' + hex(WORD_INK) + '（画面の頭と同じ #52B788 のはず）');
    ok(BRAND_COLORS[hex(CHECK_INK)], '★チェックが ' + hex(CHECK_INK)
      + '＝ブランドに 無い色★（使ってよいのは ' + Object.keys(BRAND_COLORS).join(' , ') + '）');
  });
  T('★チェックは 枠から 離れすぎない（浮き 1.5 未満）★', () => {
    /* ★2026-08-29 に 2回 外した所★
         濃い #2E7D54（浮き2.03）… 司さん「チェックにしか目がいかん」＝一番 重い物になった
         薄い #C8ECD8（浮き1.94）… 32pxで ほぼ 消えた
       ⇒ ★濃い/薄い ではなく「枠から どれだけ 離れているか」★を 決まりにする。 */
    const r = contrast(CHECK_INK, WORD_INK);
    ok(r < 1.5, '★チェック(' + hex(CHECK_INK) + ')が 枠(' + hex(WORD_INK) + ')から 浮き '
      + r.toFixed(2) + '＝離れすぎ（1.5未満にする）★');
    console.log('     浮き ' + r.toFixed(2) + '（' + hex(WORD_INK) + ' → ' + hex(CHECK_INK) + '）');
  });
  T('★塗り替えは 縁の混ざりも 同じ割合で 移す★', () => {
    const half = [46, 125, 84].map((v) => Math.round(255 - 0.5 * (255 - v)));
    const r = blendT(half, [46, 125, 84]);
    ok(r && Math.abs(r.t - 0.5) < 0.02, '半分の混ざりを 半分と 読めていない');
    ok(!blendT([200, 40, 40], [46, 125, 84]) || blendT([200, 40, 40], [46, 125, 84]).err > 3, '赤を 混ざりと 言っている');
  });
  T('★元絵（マークだけ）が 在る★', () => {
    ok(fs.existsSync(MARK_SRC), 'マークの元絵が 無い: ' + MARK_SRC);
  });
  T('★決めた数字が 指示役の実測と合っている★', () => {
    ok(BASELINE === 677 && CENTER_X === 508 && CAP === 68, '合わせ先が違う（B案＝R68px・文字幅495）');
    ok(MARK_BOTTOM === 560, 'マークの帯が違う');
  });
  T('★読めなかったら止まる（別の字体で刷らない）★', () => {
    ok(/DM Mono を読めていません/.test(renderWord.toString()), '止める道が無い');
  });
  console.log('\n' + p + ' passed, ' + f + ' failed');
  process.exit(f ? 1 : 0);
}

/* ═══ PNGを自分で開く（外の道具に頼らず 画素で数える＝「描いた物」を見る） ═══ */
import zlib from 'node:zlib';
export function readRGB(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(file + ': PNGではない');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), ct = buf[25];
  if (ct !== 2 && ct !== 6) throw new Error(file + ': 想定はRGB/RGBAだが 色種' + ct);
  const bpp = ct === 2 ? 3 : 4;
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    if (buf.toString('ascii', off + 4, off + 8) === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, px = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], line = raw.subarray(p, p + stride); p += stride;
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0;
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, bpp, at: (x, y) => [px[y * stride + x * bpp], px[y * stride + x * bpp + 1], px[y * stride + x * bpp + 2]] };
}
/** 墨のある列の塊＝1字ずつの箱（白い縦の切れ目で分ける） */
/* ═══ PNGを自分で書く（塗り替えた元絵を 次の道具へ渡す為だけ。出来上がりは magick が書く） ═══ */
export function writeRGB(file, w, h, at) {
  const stride = w * 3, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;                       // フィルタ無し
    for (let x = 0; x < w; x++) {
      const c = at(x, y), o = y * (stride + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
/** zlib.crc32 が無い版の Node 用（自分で表を作る） */
function crc32(buf) {
  let c, t = crc32.t;
  if (!t) { t = crc32.t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 白と base を 混ぜた点か。混ぜ具合 t と ずれ err を返す（違えば null） */
export function blendT(p, base) {
  if (base[0] === 255) return null;
  const t = (255 - p[0]) / (255 - base[0]);
  if (t < -0.01 || t > 1.01) return null;
  let err = 0;
  for (const k of [1, 2]) err = Math.max(err, Math.abs((255 - t * (255 - base[k])) - p[k]));
  return { t, err };
}

/* ★元絵のマークを 塗り替える★（司さん 2026-08-29「全部ミントでチェックだけ変えろや」）
     ・★1点ずつ 見る★＝縁のなめらかさ（白との混ざり）も ★同じ混ぜ具合のまま★ 移す。
       べた塗りだけ替えると ★縁に 前の色が 残って 汚くなる★。
     ・SWAP の2色の どちらの混ざりでも ない点が 1点でも 在れば ★止まる★
       （＝知らない色を 黙って 通さない）。 */
export function recolorMark(outFile) {
  const im = readRGB(MARK_SRC);
  const cnt = { white: 0, other: 0 };
  SWAP.forEach((s, i) => { cnt['c' + i] = 0; });
  const bad = [];
  const at = (x, y) => {
    const p = im.at(x, y);
    if (p[0] === 255 && p[1] === 255 && p[2] === 255) { cnt.white++; return p; }
    let best = null;
    SWAP.forEach((s, i) => {
      const r = blendT(p, s.from);
      if (r && r.err <= 3 && (!best || r.err < best.r.err)) best = { i, s, r };
    });
    if (!best) {
      cnt.other++;
      if (bad.length < 5) bad.push('(' + x + ',' + y + ')=' + p.join(','));
      return p;
    }
    cnt['c' + best.i]++;
    const t = best.r.t;
    return best.s.to.map((v) => Math.round(255 - t * (255 - v)));
  };
  writeRGB(outFile, im.w, im.h, at);
  if (cnt.other) throw new Error('★元絵に 知らない色が ' + cnt.other + '点★ ' + bad.join(' ')
    + '（塗り替えの決まりは ' + SWAP.map((s) => hex(s.from) + '→' + hex(s.to)).join(' , ') + ' の2本だけ）');
  return cnt;
}

/* ★どこから「墨」と数えるか★
     緑の値が この線より小さい点を 墨と見る。★色を変えたら 線も動かす★＝
     「白と 字の色の 真ん中」より濃い点＝★半分より 塗られている点★を 墨と数える。
     （濃い #2E7D54 なら 190／ミント #52B788 なら 219。線を固定にすると
       ★薄い色にした時に 下端が 1px ずれて 見張りが 嘘を言う★） */
export const THR = Math.round((255 + WORD_INK[1]) / 2);
export function letterBoxes(im, thr = THR) {
  const isInk = (x, y) => im.at(x, y)[1] < thr;
  const cols = [];
  for (let x = 0; x < im.w; x++) { let c = false; for (let y = 0; y < im.h && !c; y++) if (isInk(x, y)) c = true; cols.push(c); }
  const out = []; let s = null;
  for (let x = 0; x <= im.w; x++) {
    if (x < im.w && cols[x] && s === null) s = x;
    if ((x === im.w || !cols[x]) && s !== null) {
      let top = im.h, bot = -1;
      for (let y = 0; y < im.h; y++) for (let xx = s; xx < x; xx++) if (isInk(xx, y)) { if (y < top) top = y; if (y > bot) bot = y; break; }
      out.push({ x0: s, x1: x - 1, w: x - s, top, bot, h: bot - top + 1 }); s = null;
    }
  }
  return out;
}

/* ═══ 本番 ═══ */
const CHECK = process.argv.includes('--check');
/* ★見せる為の下書き★ … --preview=<出す先> で ロゴ本体を触らずに1枚 作る（大きさ比べ用）。
   --cap=<px> で「R の高さ」を変えられる（既定は 元と同じ 97）。 */
const PREVIEW = (process.argv.find((a) => a.startsWith('--preview=')) || '').slice(10);
const CAP_ARG = Number((process.argv.find((a) => a.startsWith('--cap=')) || '').slice(6)) || CAP;
console.log('\n[make-logo] ロゴの文字を ★DM Mono★ で打ち直す（マークは1ドットも触らない）');

/* ① まず 200px で刷って、R の高さ（キャップ）を測る → 元と同じ 97px になる大きさを出す */
const p1 = renderWord(200);
const b1 = letterBoxes(readRGB(p1.png));
if (b1.length !== WORD.length) throw new Error('★' + WORD.length + '字のはずが ' + b1.length + '個しか見えない（測れていません）');
const cap200 = b1[0].h;                              // #0 = R
const SIZE = Math.round(200 * CAP_ARG / cap200);
console.log('  200pxで R の高さ ' + cap200 + 'px → ★字の大きさ ' + SIZE + 'px★（R を ' + CAP_ARG + 'px に合わせる）');

/* ② その大きさで刷り直して、1字ずつ測る */
const p2 = renderWord(SIZE);
const im2 = readRGB(p2.png);
const B = letterBoxes(im2);
if (B.length !== WORD.length) throw new Error('★' + B.length + '個しか見えない（測れていません）');
/* ★字ごとの下端の決まり（活字の作法・実測で確かめた）★
     ・y … 下に伸びる（ベースラインより下）
     ・a u … ★丸い字は 1px 下へ出る（オーバーシュート）＝字体が そう作られている★
       （平らな字と ぴったり同じにすると 目には 浮いて見える）
     ⇒ ★平らな字(R k l n)の下端＝ベースライン★ とし、丸い字は +1px まで 許す。
       それ以外のズレは ★赤★（＝置き方を間違えている）。 */
const DESC = new Set(['y']);
const ROUND = new Set(['a', 'u']);
const bases = B.map((b, i) => ({ ch: WORD[i], bot: b.bot, desc: DESC.has(WORD[i]), round: ROUND.has(WORD[i]) }));
const flat = bases.filter((b) => !b.desc && !b.round).map((b) => b.bot);
const base2 = flat[0];
if (new Set(flat).size !== 1) throw new Error('★平らな字の下端が 揃っていない★ ' + JSON.stringify(bases));
for (const b of bases) {
  if (b.desc) continue;
  if (b.bot < base2 || b.bot > base2 + 1) throw new Error('★' + b.ch + ' の下端が ' + b.bot + '（' + base2 + '±0/+1 でない）★');
}
const inkX0 = Math.min(...B.map((b) => b.x0)), inkX1 = Math.max(...B.map((b) => b.x1));
const inkTop = Math.min(...B.map((b) => b.top)), inkBot = Math.max(...B.map((b) => b.bot));

/* ③ 置く場所＝ベースライン677・中心508 に合わせる */
const dx = Math.round(CENTER_X - (inkX0 + inkX1) / 2);
const dy = BASELINE - base2;
const cropX = inkX0 - 40, cropY = inkTop - 20;        // 少し余白ごと切る（縁を切らない）
const cropW = (inkX1 - inkX0 + 1) + 80, cropH = (inkBot - inkTop + 1) + 40;
const putX = cropX + dx, putY = cropY + dy;
console.log('  文字の墨 幅 ' + (inkX1 - inkX0 + 1) + 'px ／ 置く所 x=' + (inkX0 + dx) + '..' + (inkX1 + dx)
  + ' ／ ベースライン y=' + (base2 + dy));

/* ④ 貼る（マークの帯は ★元絵を塗り替えた物★／下は白にしてから 字を置く） */
const TMP = path.join(OUT, 'build.png');
const BASE = path.join(OUT, 'mark.png');
fs.mkdirSync(OUT, { recursive: true });
const mc = recolorMark(BASE);
console.log('  マークを塗り替えた … '
  + SWAP.map((s, i) => hex(s.from) + '→' + hex(s.to) + ' ' + mc['c' + i] + '点').join(' ／ ')
  + ' ／ 白 ' + mc.white + '点');
execFileSync('magick', [BASE, '-fill', 'white', '-draw',
  'rectangle 0,' + MARK_BOTTOM + ' 1023,1023', TMP], { timeout: 60000 });
execFileSync('magick', [TMP, '(', p2.png, '-crop', cropW + 'x' + cropH + '+' + cropX + '+' + cropY, '+repage', ')',
  '-geometry', '+' + putX + '+' + putY, '-composite', '-alpha', 'off', '-strip',
  '-define', 'png:color-type=2', TMP], { timeout: 60000 });

/* ⑤ 出す前に 自分で数える（★描いた物を見る★） */
const made = readRGB(TMP);
/* ★合わせ先は 塗り替えた元絵★（出来上がりと 突き合わせると 何を変えても 緑になる） */
const base = readRGB(BASE);
let markDiff = 0;
for (let y = 0; y < MARK_BOTTOM; y++) for (let x = 0; x < 1024; x++) {
  const a = base.at(x, y), b = made.at(x, y);
  if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) markDiff++;
}
/* ★マークに 2色とも 残っているか★（チェックが 溶けて 消えていないか を 数で見る） */
const markC = [0, 0];
for (let y = 0; y < MARK_BOTTOM; y++) for (let x = 0; x < 1024; x++) {
  const p = made.at(x, y);
  if (p[0] === WORD_INK[0] && p[1] === WORD_INK[1] && p[2] === WORD_INK[2]) markC[0]++;
  if (p[0] === CHECK_INK[0] && p[1] === CHECK_INK[1] && p[2] === CHECK_INK[2]) markC[1]++;
}
const cnt = { white: 0, ink: 0, edge: 0, other: 0 };
const others = [];
for (let y = MARK_BOTTOM; y < 1024; y++) for (let x = 0; x < 1024; x++) {
  const k = classify(made.at(x, y)); cnt[k]++;
  if (k === 'other' && others.length < 5) others.push('(' + x + ',' + y + ')=' + made.at(x, y).join(','));
}
const F = letterBoxes({ w: 1024, h: 1024 - MARK_BOTTOM, at: (x, y) => made.at(x, y + MARK_BOTTOM) });
const fb = F.map((b, i) => ({ ch: WORD[i], x0: b.x0, w: b.w, bot: b.bot + MARK_BOTTOM }));
const fx0 = Math.min(...F.map((b) => b.x0)), fx1 = Math.max(...F.map((b) => b.x1));
const center = (fx0 + fx1) / 2;
const flatBots = fb.filter((b) => !DESC.has(b.ch) && !ROUND.has(b.ch)).map((b) => b.bot);
const roundBots = fb.filter((b) => ROUND.has(b.ch)).map((b) => b.bot);

const NG = [];
if (markDiff !== 0) NG.push('★マークが 塗り替えた元絵と 違う ' + markDiff + '点★');
if (markC[0] < 1000) NG.push('★マークの ミント(' + hex(WORD_INK) + ') が ' + markC[0] + '点しかない★');
if (markC[1] < 1000) NG.push('★チェックの ' + hex(CHECK_INK) + ' が ' + markC[1] + '点しかない＝溶けて消えた★');
if (cnt.other !== 0) NG.push('★' + hex(WORD_INK) + ' でも白でもない色 ' + cnt.other + '点★ ' + others.join(' '));
if (new Set(flatBots).size !== 1 || flatBots[0] !== BASELINE) NG.push('★平らな字の下端が ' + [...new Set(flatBots)].join('/') + '（' + BASELINE + 'に揃っていない）★');
if (roundBots.some((b) => b < BASELINE || b > BASELINE + 1)) NG.push('★丸い字の下端が ' + roundBots.join('/') + '（' + BASELINE + '〜' + (BASELINE + 1) + 'でない）★');
if (Math.abs(center - CENTER_X) > 1) NG.push('★中心が ' + center + '（' + CENTER_X + '±1 でない）★');
if (fb.length !== WORD.length) NG.push('★' + fb.length + '字しか見えない★');
const adv = p2.advances;
if (new Set(adv.map((a) => Math.round(a * 100))).size !== 1) NG.push('★等幅でない（送り幅がばらばら）★ ' + adv.join('/'));

console.log('\n── 実測 ──');
console.log('  1字ずつ … ' + fb.map((b) => b.ch + ':幅' + b.w + '/下端' + b.bot).join(' '));
console.log('  ★送り幅（等幅の証拠）★ ' + adv.join(' / ') + ' px');
console.log('  ★文字の中心 x = ' + center + '★（狙い ' + CENTER_X + '）');
console.log('  ★下端★ 平らな字(R k l n) = ' + [...new Set(flatBots)].join(',') + '（狙い ' + BASELINE + '）'
  + ' ／ 丸い字(a u) = ' + [...new Set(roundBots)].join(',') + '（★字体の作法で 1px 下へ出る★）'
  + ' ／ y = ' + fb.filter((b) => DESC.has(b.ch)).map((b) => b.bot).join(','));
console.log('  ★マークの帯(y<' + MARK_BOTTOM + ')が 塗り替えた元絵と 違う点 = ' + markDiff + '★');
console.log('  ★マークの色★ ミント' + hex(WORD_INK) + ' ' + markC[0] + '点 ／ チェック' + hex(CHECK_INK) + ' ' + markC[1] + '点');
console.log('  色 … ' + hex(WORD_INK) + ' ' + cnt.ink + '点 ／ 白 ' + cnt.white + '点 ／ 縁(白と混ざり) ' + cnt.edge + '点 ／ ★別の色 ' + cnt.other + '点★');
if (PREVIEW) {
  /* 下書きは 大きさ比べが目的なので ★R=97 の縛りは外す★（下端と中心と色は そのまま見る） */
  fs.copyFileSync(TMP, PREVIEW);
  console.log('\n★下書きを出しました（ロゴ本体は 触っていません）★ ' + PREVIEW
    + (NG.length ? '\n★気になる所★ ' + NG.join(' / ') : ''));
  process.exit(0);
}
if (NG.length) { console.log('\n★赤★\n  ' + NG.join('\n  ')); process.exit(1); }

if (CHECK) {
  const same = sha8(fs.readFileSync(TMP)) === sha8(fs.readFileSync(LOGO));
  console.log('\n' + (same ? '★同じ物が作れた★' : '★今のロゴと違う（node scripts/make-logo.mjs で刷り直す）★'));
  process.exit(same ? 0 : 1);
}
fs.copyFileSync(TMP, LOGO);
console.log('\n★刷り直しました★ ' + path.relative(ROOT, LOGO) + ' sha ' + sha8(fs.readFileSync(LOGO)));
console.log('★次に必ず★ node scripts/make-icons.mjs --check（マークが同じならアイコンは変わりません）');
