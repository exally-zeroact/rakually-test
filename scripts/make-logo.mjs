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
 *   絵 1024x1024 ／ 色 #2E7D54 ／ ★ベースライン y=677★ ／ ★文字の中心 x=508★
 *   ★マーク（RAの四角＋チェック）は 1ドットも触らない★＝y<560 は 元のまま
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
export const WORD = 'Rakunally';
export const INK = [46, 125, 84];          // #2E7D54
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

/** 1色の点か（縁の混ざりを 数える為に 使う） */
export function classify(p) {
  if (p[0] === 255 && p[1] === 255 && p[2] === 255) return 'white';
  if (p[0] === INK[0] && p[1] === INK[1] && p[2] === INK[2]) return 'ink';
  /* ★白と #2E7D54 を混ぜた色か★（縁のなめらかさ）。混ぜ具合 t を 3色から出して ずれを見る */
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
    + 'color:#2E7D54;font-size:' + size + 'px;line-height:2;white-space:pre;display:inline-block;padding:60px}'
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
    ok(classify([46, 125, 84]) === 'ink');
    ok(classify([150, 190, 170]) === 'edge', '白と緑の中間を「縁」と読めていない');
    ok(classify([200, 40, 40]) === 'other', '赤を通してしまう＝色の見張りが空振り');
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
export function letterBoxes(im, thr = 200) {
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

/* ④ 貼る（マークの帯 y<560 は 元のまま・下だけ白で消してから置く） */
const TMP = path.join(OUT, 'build.png');
execFileSync('magick', [LOGO, '-fill', 'white', '-draw',
  'rectangle 0,' + MARK_BOTTOM + ' 1023,1023', TMP], { timeout: 60000 });
execFileSync('magick', [TMP, '(', p2.png, '-crop', cropW + 'x' + cropH + '+' + cropX + '+' + cropY, '+repage', ')',
  '-geometry', '+' + putX + '+' + putY, '-composite', '-alpha', 'off', '-strip',
  '-define', 'png:color-type=2', TMP], { timeout: 60000 });

/* ⑤ 出す前に 自分で数える（★描いた物を見る★） */
const made = readRGB(TMP);
const old = readRGB(LOGO);
let markDiff = 0;
for (let y = 0; y < MARK_BOTTOM; y++) for (let x = 0; x < 1024; x++) {
  const a = old.at(x, y), b = made.at(x, y);
  if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) markDiff++;
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
if (markDiff !== 0) NG.push('★マークが変わっている ' + markDiff + '点★');
if (cnt.other !== 0) NG.push('★#2E7D54 でも白でもない色 ' + cnt.other + '点★ ' + others.join(' '));
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
console.log('  ★マークの帯(y<' + MARK_BOTTOM + ')の変わった点 = ' + markDiff + '★');
console.log('  色 … #2E7D54 ' + cnt.ink + '点 ／ 白 ' + cnt.white + '点 ／ 縁(白と混ざり) ' + cnt.edge + '点 ／ ★別の色 ' + cnt.other + '点★');
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
