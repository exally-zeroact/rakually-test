/* own-name.test.mjs — ★この器は Rakually の物★（全画面・全アプリぶんを1本で数える）
 *
 * なぜ要るか（司さん 2026-08-17）:
 *   「★いつまでExallyのこといよんど／Rakuallyは別アプリなんはいつ理解するわけ？★」
 *   請求書だけを見張っていた（seikyu/tests/seikyu-own-name.mjs）。
 *   ★器を立てた日に「入口」と「給与」も客が読む字を持った★ので、
 *   見張りを ★Rakually 全体（配信する5画面）★ に広げる。
 *
 * ここで数える物（★客が読む字だけ★）:
 *   ① <title>（タブの題）
 *   ② 画面に描かれる文字（<script> / <style> / HTMLコメント は数えない＝客は読まない）
 *   ③ manifest の name / short_name / description（ホーム画面に出る字）
 *
 * ★数えない物（客は読まない）★
 *   ファイル名（css/exally-ui.css・js/exally-login.js）／中の名前（ExallyLogin・ExallyEnvBadge）／
 *   コード中のコメント（前科の記録は残す）。名前を替えるのは ★10月のURL切替と同じ塊★。
 *
 * 深い所（取引先を外へ出さない・自社の中身を見せる 等）は
 *   ★seikyu/tests/seikyu-own-name.mjs★ が本物の画面を起動して見る。ここは ★字だけ★を全画面で数える。
 *
 * 使い方: node tests/own-name.test.mjs
 *         node tests/own-name.test.mjs --self-test
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★他のアプリの名前★＝客が読んではいけない字。
   Rakually の中の物（給与・請求書・台帳・集計）は お互いの名前を出してよい（同じ1つのアプリ）。 */
export const OTHER_APPS = ['Exally', 'エクサリー', 'exally', 'Castally', 'キャスタリー', 'ダイコメ', 'アマかせ', 'Timeally'];

/* ★据え置き（理由と期限つき）★
   「Kyually」＝給与の旧製品名。★2026-08-12 に Rakually へ統一すると決まったが、改名は10月★
   （URL切替と同じ塊で替える）。今 字だけ替えると、司さんが知っている画面と食い違う。
   ＝★見た目の変更なので、勝手に替えず「まだ残っている」と数えて出す★。 */
export const PENDING = {
  Kyually: {
    where: 'kyuyo/index.html の題とロゴ',
    reason: '給与の旧製品名。2026-08-12 に Rakually へ統一と決定済みだが、★改名は10月（URL切替と同じ塊）★。'
      + '見た目の変更は 司さんの見た目OKが要る＝勝手に替えない。',
    until: '2026-10-31',
  },
};

const SCREENS = ['index.html', 'kyuyo/index.html', 'kyuyo/admin.html', 'kyuyo/meisai.html', 'seikyu/index.html'];
const MANIFESTS = ['manifest.json', 'kyuyo/manifest.json', 'kyuyo/admin-manifest.json'];

export const sha8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

/** PNGの頭(IHDR)だけ読む＝幅・高さ・透明を持つか */
export function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNGではない');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const colorType = buf[25];                     // 0=灰 2=RGB 3=索引 4=灰+α 6=RGBA
  return { w, h, colorType, alpha: colorType === 4 || colorType === 6 };
}

/** ★画像の「背景でない所」の箱を実測する★（丸く切られて欠けないかを数で言うため）
 *  PNGを自分で開く（IHDR→IDATをinflate→行ごとのフィルタを戻す）。色は角のドットを背景とみなす。 */
export function inkBox(absPath) {
  const buf = fs.readFileSync(absPath);
  const { w, h, colorType } = pngSize(buf);
  if (colorType !== 2) throw new Error(absPath + ': 想定は RGB(色種2) だが ' + colorType);
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 3, stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
  }
  const bg = [px[0], px[1], px[2]];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * stride + x * bpp;
      /* 背景から十分に離れたドットだけ「中身」と数える（滑らかな縁を拾いすぎない） */
      const d = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
      if (d > 30) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) throw new Error(absPath + ': 中身が1ドットも無い（真っ白）');
  return { size: w, w: x1 - x0 + 1, h: y1 - y0 + 1, left: x0, right: w - 1 - x1, top: y0, bottom: h - 1 - y1 };
}

/** 客が読む字だけを残す（script / style / コメント / タグを落とす） */
export function visibleTextOf(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');                       // HTMLコメント＝客は読まない
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');            // 中のJS＝客は読まない
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  /* ★人が読む属性は残す★（title / placeholder / aria-label / alt / content）。
     ここを落とすと「ボタンの説明だけ他アプリの名前」を見逃す。 */
  const attrs = [];
  for (const m of s.matchAll(/\s(?:title|placeholder|aria-label|alt|content)="([^"]*)"/g)) attrs.push(m[1]);
  const title = (s.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
  s = s.replace(/<[^>]+>/g, ' ');
  return { title: title.trim(), text: (s + ' ' + attrs.join(' ')).replace(/\s+/g, ' ').trim() };
}

/** 他アプリの名前を数える。vfs = { 'index.html': '…', … } */
export function findOtherNames(vfs, names = OTHER_APPS, pending = PENDING) {
  const hits = [];
  for (const f of Object.keys(vfs)) {
    if (typeof vfs[f] !== 'string') continue;
    let read;
    if (/\.json$/.test(f)) {
      let j; try { j = JSON.parse(vfs[f]); } catch { hits.push({ file: f, name: '(JSONとして読めない)', where: f }); continue; }
      read = { title: '', text: [j.name, j.short_name, j.description].filter(Boolean).join(' ') };
    } else read = visibleTextOf(vfs[f]);
    for (const n of names) {
      if (pending[n]) continue;                                  // 据え置き（下で別に数える）
      if (read.title.includes(n)) hits.push({ file: f, name: n, where: 'タブの題' });
      if (read.text.includes(n)) hits.push({ file: f, name: n, where: '画面の字' });
    }
  }
  return hits;
}

/** 据え置き（Kyually 等）が今どこに何件 残っているか＝0件に見せない */
export function findPending(vfs, pending = PENDING) {
  const out = {};
  for (const n of Object.keys(pending)) {
    out[n] = [];
    for (const f of Object.keys(vfs)) {
      if (typeof vfs[f] !== 'string') continue;
      const read = /\.json$/.test(f)
        ? { title: '', text: vfs[f] }
        : visibleTextOf(vfs[f]);
      const c = ((read.title + ' ' + read.text).match(new RegExp(n, 'g')) || []).length;
      if (c) out[n].push(f + ' ×' + c);
    }
  }
  return out;
}

function readVfs() {
  const vfs = {};
  for (const f of [...SCREENS, ...MANIFESTS]) vfs[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
  return vfs;
}

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* ═══ 自己テスト：わざと戻して赤になるか ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[own-name --self-test] ★わざと他アプリの名前を戻して赤になるか');
  const base = readVfs();
  const clone = () => JSON.parse(JSON.stringify(base));

  T('壊していない状態では0件（＝空振りしていない）', () => {
    const h = findOtherNames(base);
    ok(h.length === 0, '壊していないのに ' + h.length + '件: ' + JSON.stringify(h.slice(0, 3)));
  });
  T('① タブの題に「Exally」を戻すと赤', () => {
    const m = clone(); m['index.html'] = m['index.html'].replace('<title>Rakually（ラクアリー）</title>', '<title>Exally（エクサリー）</title>');
    ok(findOtherNames(m).some((x) => x.where === 'タブの題'), '題を見ていない');
  });
  T('② 戻るリンクの字を「← Exally」に戻すと赤', () => {
    const m = clone(); m['kyuyo/index.html'] = m['kyuyo/index.html'].replace('← Rakually', '← Exally');
    ok(findOtherNames(m).some((x) => x.file === 'kyuyo/index.html'), '画面の字を見ていない');
  });
  T('③ 人が読む属性(title=)に他アプリの名前を戻すと赤', () => {
    const m = clone(); m['kyuyo/index.html'] = m['kyuyo/index.html'].replace('title="Rakually の入口へ戻る"', 'title="Exally のハブへ戻る"');
    ok(findOtherNames(m).length > 0, '属性の中を見ていない');
  });
  T('④ manifest の名前を「Exally」に戻すと赤', () => {
    const m = clone(); m['manifest.json'] = m['manifest.json'].replace('"name": "Rakually"', '"name": "Exally"');
    ok(findOtherNames(m).some((x) => x.file === 'manifest.json'), 'manifest を見ていない');
  });
  T('⑤ ★コードのコメントは赤にしない★（前科の記録を消させない＝誤検知を作らない）', () => {
    const m = clone(); m['index.html'] = m['index.html'].replace('<body>', '<body>\n<!-- Exally の物なので置かない -->');
    ok(findOtherNames(m).length === 0, 'コメントまで数えている＝誤検知');
  });
  T('⑥ ★<script> の中も赤にしない★（中の名前 ExallyLogin は客が読まない）', () => {
    const m = clone(); m['index.html'] = m['index.html'].replace('</body>', '<script>var x = window.ExallyLogin;</script></body>');
    ok(findOtherNames(m).length === 0, '中のJSまで数えている＝誤検知');
  });
  T('⑦ ★?v= の突き合わせが効いている★（中身を1バイト変えたら別のSHAになる）', () => {
    const b = fs.readFileSync(path.join(ROOT, 'img/icon-192.png'));
    const b2 = Buffer.from(b); b2[b2.length - 1] ^= 0xff;
    ok(sha8(b) !== sha8(b2), '中身を変えても同じSHA＝?v= の見張りは空振り');
  });
  T('⑧ ★中身の箱を本当に測れている★（キャンバス全体を「中身」と言っていない）', () => {
    const box = inkBox(path.join(ROOT, 'img/icon-512-maskable.png'));
    ok(box.size === 512, '幅を読めていない: ' + box.size);
    ok(box.w > 200 && box.w < 400, '中身の幅が ' + box.w + '＝測れていない（実測 330）');
    ok(box.w < box.size - 20 && box.h < box.size - 20, 'キャンバス全体を「中身」と言っている＝空振り');
    console.log('     実測: 中身 ' + box.w + 'x' + box.h + ' / 全 ' + box.size);
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ═══ 本番（実ディスク） ═══ */
console.log('\n[own-name] この器は Rakually の物か（客が読む字を全画面で数える）');
const vfs = readVfs();

T('★数える物が揃っている（1枚でも読めなければ空振り）', () => {
  ok(Object.keys(vfs).length === SCREENS.length + MANIFESTS.length,
    '読めた物 ' + Object.keys(vfs).length + '／' + (SCREENS.length + MANIFESTS.length));
  const total = Object.values(vfs).reduce((a, s) => a + s.length, 0);
  ok(total > 40000, '読めた字が少なすぎる（' + total + 'バイト）＝読めていない');
  console.log('     画面 ' + SCREENS.length + '枚 ／ manifest ' + MANIFESTS.length + '本 ／ 合計 ' + total + 'バイト');
});

T('★他のアプリの名前が、客が読む字に0件（タブの題・画面の字・ホーム画面の名前）', () => {
  const hits = findOtherNames(vfs);
  if (hits.length) {
    throw new Error('★' + hits.length + '件★\n     '
      + hits.map((h) => h.file + ' の ' + h.where + ' に「' + h.name + '」').join('\n     '));
  }
  console.log('     見た名前 ' + OTHER_APPS.length + '個（' + OTHER_APPS.join(' / ') + '）→ 0件');
});

/* ═══ ★ホーム画面／タブのアイコン★（指示役 2026-08-18 ■2）═══════════════
   ★DOMに在る≠出る★ … ここで見るのは「機械で数えられる所」まで:
     ① 3つの manifest に icons が在り、参照先が★実在する★
     ② ★?v= が その画像の中身のSHAと一致★（古い絵が端末に居座らない）
     ③ ★maskable が在る★（Androidは丸く切る）／normal と maskable を混ぜない
     ④ 5画面ぜんぶに apple-touch-icon（iOSは manifest を見ない）と タブの絵
     ⑤ ★透明を持たない★（iOSは透明を黒く塗る）／寸法が名前どおり
   ★実機で本当に出たか★は 私が iPhone と Android で「ホーム画面に追加」して撮る（機械では出せない）。 */
T('★アイコン: 3つの manifest に icons が在り、参照先が実在して ?v= が中身のSHAと一致', () => {
  let total = 0;
  for (const f of MANIFESTS) {
    const j = JSON.parse(vfs[f]);
    ok(Array.isArray(j.icons) && j.icons.length >= 3, f + ': icons が ' + (j.icons || []).length + '個（192/512/maskable の3つが要る）');
    const dir = path.dirname(path.join(ROOT, f));
    for (const ic of j.icons) {
      const [p, q] = String(ic.src).split('?');
      const abs = path.resolve(dir, p);
      ok(fs.existsSync(abs), f + ': 参照先が無い ' + ic.src);
      const v = sha8(fs.readFileSync(abs));
      ok(q === 'v=' + v, f + ': ' + p + ' の ?v= が中身と違う（' + (q || '無し') + ' ≠ v=' + v + '）'
        + ' → node scripts/icon-stamp.mjs');
      const [w] = String(ic.sizes).split('x').map(Number);
      const px = pngSize(fs.readFileSync(abs));
      ok(px.w === w && px.h === w, f + ': ' + p + ' は ' + px.w + 'x' + px.h + ' なのに sizes=' + ic.sizes);
      ok(!px.alpha, f + ': ' + p + ' が透明を持っている（iOSが黒く塗る）');
      total++;
    }
    const purposes = j.icons.map((i) => i.purpose);
    ok(purposes.includes('maskable'), f + ': ★maskable が無い（Androidが丸く切って文字が欠ける）');
    ok(purposes.filter((p) => p === 'any').length >= 2, f + ': 通常(any)が2つ無い（192と512）');
    ok(!purposes.some((p) => p === 'any maskable'), f + ': ★"any maskable" と兼用にしない'
      + '（余白の無い絵を丸く切られて欠ける）');
  }
  console.log('     manifest ' + MANIFESTS.length + '本／アイコンの参照 ' + total + '本（実在・寸法・不透明・?v=一致）');
});

T('★アイコン: 5画面に apple-touch-icon（iOSはmanifestを見ない）とタブの絵が在り ?v= も合っている', () => {
  let n = 0;
  for (const f of SCREENS) {
    const dir = path.dirname(path.join(ROOT, f));
    const apple = [...vfs[f].matchAll(/<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
    ok(apple.length === 1, f + ': apple-touch-icon が ' + apple.length + '個（1個だけ置く）');
    ok(!/^data:/.test(apple[0]), f + ': ★apple-touch-icon が data:（iOSはSVGを読まない＝絵が出ない）');
    const icons = [...vfs[f].matchAll(/<link[^>]+rel="icon"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
    ok(icons.length >= 1, f + ': タブの絵(rel=icon)が無い');
    for (const ref of [apple[0], ...icons]) {
      const [p, q] = ref.split('?');
      const abs = path.resolve(dir, p);
      ok(fs.existsSync(abs), f + ': 参照先が無い ' + ref);
      const v = sha8(fs.readFileSync(abs));
      ok(q === 'v=' + v, f + ': ' + p + ' の ?v= が中身と違う → node scripts/icon-stamp.mjs');
      ok(!pngSize(fs.readFileSync(abs)).alpha, f + ': ' + p + ' が透明を持っている（iOSが黒く塗る）');
      n++;
    }
  }
  console.log('     画面 ' + SCREENS.length + '枚／アイコンの参照 ' + n + '本（実在・不透明・?v=一致）');
});

T('★アイコン: 丸く切られても中身が欠けない（maskable は中央80%の円に収まっている）', () => {
  /* ★実測で確かめる★＝画像の「白でない所」の箱を数えて、円に収まるかを計算する。 */
  const seen = [];
  for (const rel of ['img/icon-512-maskable.png', 'kyuyo/img/admin-512-maskable.png']) {
    const box = inkBox(path.join(ROOT, rel));
    /* ★丸は「画像の中央」で切られる★ので、余白の左右差ではなく
       ★中身のどの角も、中央から 半径0.4×幅 の中に居るか★を見る（これが実際の欠け方）。 */
    const c = box.size / 2, r = box.size * 0.4;
    const xs = [box.left, box.left + box.w - 1], ys = [box.top, box.top + box.h - 1];
    let far = 0, worst = '';
    for (const x of xs) for (const y of ys) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d > far) { far = d; worst = '(' + x + ',' + y + ')'; }
    }
    ok(far <= r, rel + ': 中身の角 ' + worst + ' が中央から ' + Math.round(far)
      + 'px（安全な半径 ' + Math.round(r) + 'px）＝丸く切られると欠ける');
    seen.push(rel + ' 中身 ' + box.w + 'x' + box.h + ' @ (' + box.left + ',' + box.top + ')'
      + '（いちばん遠い角 ' + Math.round(far) + ' ≤ 半径 ' + Math.round(r) + '）');
  }
  ok(seen.length === 2, '数えた maskable が ' + seen.length + '本＝空振り');
  console.log('     ' + seen.join(' ／ '));
});

T('★据え置きの名前は「0件」に見せない（何がいつまで残るかを毎回 出す）', () => {
  const p = findPending(vfs);
  let shown = 0;
  for (const [n, where] of Object.entries(p)) {
    const e = PENDING[n];
    ok(e.reason && e.reason.length > 20, n + ': 理由が無い');
    ok(e.until, n + ': いつまでかが無い');
    ok(new Date(e.until) >= new Date('2026-08-17'), n + ': 期限切れ ' + e.until + '＝替えるか、期限を延ばす判断を仰ぐ');
    ok(where.length > 0, n + ' が0件＝もう無いなら PENDING から外すこと（残したままにしない）');
    console.log('     据え置き「' + n + '」' + where.join(' , ') + '（' + e.until + 'までに替える／' + e.where + '）');
    shown++;
  }
  ok(shown > 0, '据え置きの表が空＝この検査は空振り');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
