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
 *   ファイル名（css/rakually-ui.css・js/rakually-login.js）／中の名前（RakuallyLogin・RakuallyEnvBadge）／
 *   コード中のコメント（前科の記録は残す）。名前を替えるのは ★10月のURL切替と同じ塊★。
 *
 * 深い所（取引先を外へ出さない・自社の中身を見せる 等）は
 *   ★seikyu/tests/seikyu-own-name.mjs★ が本物の画面を起動して見る。ここは ★字だけ★を全画面で数える。
 *
 * 使い方: node tests/own-name.test.mjs
 *         node tests/own-name.test.mjs --self-test
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★他のアプリの名前★＝客が読んではいけない字。
   Rakually の中の物（給与・請求書・台帳・集計）は お互いの名前を出してよい（同じ1つのアプリ）。 */
export const OTHER_APPS = ['Exally', 'エクサリー', 'exally', 'Castally', 'キャスタリー', 'ダイコメ', 'アマかせ', 'Timeally',
  /* ★2026-08-18 Kyually を「据え置き」から禁止語に格上げ★（司さん「ささっと Exally から切り離せ」）
     ＝給与の旧製品名。10月まで待たずに Rakually へ統一した。戻したら赤にする。 */
  'Kyually', 'キュアリー'];

/* ★据え置き（理由と期限つき）★
   「Kyually」＝給与の旧製品名。★2026-08-12 に Rakually へ統一すると決まったが、改名は10月★
   （URL切替と同じ塊で替える）。今 字だけ替えると、司さんが知っている画面と食い違う。
   ＝★見た目の変更なので、勝手に替えず「まだ残っている」と数えて出す★。 */
export const PENDING = {
  /* ★今は0件★（2026-08-18 に Kyually を消したので空になった）。
     ここに足してよいのは ★理由と期限（until）を書ける物だけ★。空のまま＝据え置きゼロ。 */
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
  T('⑥ ★<script> の中も赤にしない★（中の名前 RakuallyLogin は客が読まない）', () => {
    const m = clone(); m['index.html'] = m['index.html'].replace('</body>', '<script>var x = window.RakuallyLogin;</script></body>');
    ok(findOtherNames(m).length === 0, '中のJSまで数えている＝誤検知');
  });
  T('⑥-b ★JSが画面に出す字を戻すと赤★（2026-08-18 これを素通りさせた）', () => {
    const src = "host.innerHTML = '<div>給料明細アプリ（Kyually）で登録すると出ます。</div>';";
    const hit = jsStrings(src).some((t) => OTHER_APPS.some((n) => t.includes(n)));
    ok(hit, 'JSの文字列の中の他アプリ名を拾えていない＝この検査は空振り');
  });
  T('⑥-c ★コメントと識別子は赤にしない★（誤検知を作らない）', () => {
    ok(!jsStrings('/* Kyually の前科の記録 */ var x = 1;').some((t) => t.includes('Kyually')), 'コメントまで数えている');
    ok(!jsStrings('return { fromKyually: true };').some((t) => t.includes('Kyually')), 'キー名まで数えている');
    ok(!jsStrings('global.RakuallyLogin = L;').some((t) => t.includes('Exally')), '識別子まで数えている');
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

/* ★ファイル名にも 他アプリの名前を残さない★（司さん 2026-08-18「ささっと Exally から切り離せ」）
   前は「客は読まないから据え置き」にしていた（css/exally-ui.css・js/exally-login.js）。
   ★その据え置きを全部 取り消した★＝配る物の名前も Rakually にする。
   ★中の名前（window.○○）も一緒に替えた★＝RakuallyLogin / RakuallyEnvBadge / RAKUALLY_EMP_KEYS。
   ★替えない物★＝端末に保存済みの物の鍵（kyuyo/js/store.js の 'kyually-session-backup'）。
     替えると ★前に保存した控えが読めなくなる★＝名前ではなく ★端末に保存されている物の鍵★ なので残す。
     （2026-08-18 訂正: ここに「本番で22人が使っている」と書いていたが ★私の誤り★。
      22人は本番の倉庫を使う全アプリの合計で、給与を使っているのは1人。
      ★人数は残す理由ではない★＝1人でも0人でも「保存済みの鍵は替えない」。） */
const NAME_NG = /(exally|kyually)/i;
const KEEP_INSIDE = {
  'kyuyo/js/store.js': "端末に保存済みの控えの鍵 'kyually-session-backup'（★鍵なので替えない★＝替えると前の控えが読めなくなる。人数は理由ではない）",
};
T('★配信するファイルの名前に exally / kyually が0本（据え置きは全部 取り消した）', () => {
  const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
    .filter((f) => /\.(html|js|mjs|css|json|png)$/.test(f) && !f.startsWith('docs/'));
  ok(files.length > 100, '数えたファイルが ' + files.length + '本＝拾えていない');
  const bad = files.filter((f) => NAME_NG.test(f.split('/').pop()));
  if (bad.length) throw new Error('★' + bad.length + '本★ 名前に他アプリの名前が残っている\n     ' + bad.join('\n     '));
  const shown = Object.entries(KEEP_INSIDE)
    .filter(([f]) => fs.existsSync(path.join(ROOT, f)))
    .map(([f, why]) => f + ' … ' + why);
  ok(shown.length > 0, '★中身に残す物の一覧が空＝この検査は空振り★');
  console.log('     数えたファイル ' + files.length + '本 → 名前に残る他アプリ名 ★0本★'
    + '\n     ★中身にだけ残す物（理由つき）★ ' + shown.join(' / '));
});

/* ★JSが作る字も数える★（2026-08-18 指示役が見つけた穴・同じ形は3回目）
   HTMLとファイル名だけ数えていたので、★js/hub.js が画面に出していた「Kyually」を素通りした★
   （人が0人の時に必ず出る字だった）。＝★見た目(class)で探すな。中身で探せ★ と同じ形。
   ここでは「配信する .js の中の ★文字列リテラル★」を見る:
     ・コメントは数えない（前科の記録は消させない）
     ・識別子・キー名は数えない（RakuallyLogin / fromKyually: は客が読まない）
     ・★端末に保存済みの物の鍵★（'kyually-session-backup'）は 理由つきで外す＝下の KEEP_INSIDE */
export function jsStrings(src) {
  /* コメントを落としてから 文字列だけ取り出す（順番が逆だとコメント内の '…' を拾う） */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const out = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1] || m[2] || m[3] || '');
  return out;
}
/* ★中身にだけ残してよい文字列★＝「客が読む字」ではなく ★物の名前（鍵・棚）★ だけ。
   ★ファイルごと除外しない★（ファイル単位で外すと、その中の新しい違反まで一緒に見逃す）。
   ここに書いた ★その文字列そのもの★ だけを外す。 */
const KEEP_INSIDE_STR = {
  'kyuyo/js/store.js': {
    why: '端末に保存済みの控えの鍵（★替えると前の控えが読めなくなる★・人数は理由ではない）',
    allow: ['kyually-session-backup', 'exally_entitlements'],
  },
  'js/suite-data.js': {
    why: '★倉庫の棚の名前★（替えると本番の棚と合わなくなる＝アプリが読めなくなる）',
    allow: ['exally_entitlements'],
  },
  'kyuyo/js/admin.js': {
    why: '★倉庫の棚の名前★と、★他アプリの利用権を管理する画面★なので他アプリ名を出すのが正しい',
    allow: ['exally_admins', 'exally_entitlements', 'ダイコメ'],
  },
};
T('★JSが作る字にも 他のアプリの名前が0件（HTMLに書いていない字＝画面に出る所）', () => {
  const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
    .filter((f) => /\.js$/.test(f) && !f.startsWith('tests/') && !f.startsWith('scripts/')
      && !f.includes('/tests/') && !f.includes('/scripts/') && !/\.min\.js$/.test(f) && !f.startsWith('docs/'));
  ok(files.length > 20, '数えたJSが ' + files.length + '本＝拾えていない');
  const hits = [];
  let strs = 0, kept = 0;
  for (const f of files) {
    const list = jsStrings(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    strs += list.length;
    const keep = KEEP_INSIDE_STR[f];
    for (const t of list) {
      for (const n of OTHER_APPS) {
        if (!t.includes(n)) continue;
        /* ★その文字列そのものが 台帳に載っている物か★（ファイルごと見逃さない） */
        if (keep && keep.allow.some((a) => t === a || t.indexOf(a) === 0)) { kept++; continue; }
        hits.push(f + ' の文字列「' + t.slice(0, 40) + '」に " ' + n + ' "');
      }
    }
  }
  if (hits.length) throw new Error('★' + hits.length + '件★ JSが画面に出す字に他アプリの名前\n     ' + hits.join('\n     '));
  /* ★台帳に書いた物が1つも当たらなくなったら、それは台帳が腐っている★ */
  ok(kept > 0, '中身に残す物の台帳が1つも当たらない＝もう無いなら台帳から外すこと');
  console.log('     JS ' + files.length + '本 / 文字列 ' + strs + '個 → 他アプリの名前 ★0件★'
    + '（物の名前として残す ' + kept + '件: '
    + Object.entries(KEEP_INSIDE_STR).map(([f, v]) => f + '=' + v.allow.join('/')).join(' , ') + '）');
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

T('★アイコン: 丸く切られても中身が欠けない（maskable は 締めた合格線190の内側に居る）', () => {
  /* ★実測で確かめる★＝画像の「白でない所」の箱を数えて、円に収まるかを計算する。 */
  const seen = [];
  for (const rel of ['img/icon-512-maskable.png', 'kyuyo/img/admin-512-maskable.png']) {
    const box = inkBox(path.join(ROOT, rel));
    /* ★丸は「画像の中央」で切られる★ので、余白の左右差ではなく
       ★中身のどの角も、中央から この半径の中に居るか★を見る（これが実際の欠け方）。
       ★合格線 = 幅×0.371（512なら190）★＝決まりの 0.4（512なら204.8）から ★1割 締めた★物。
       理由（2026-08-18 指示役の実測）: 決まりぴったり（余白1.5%）だと
       ★launcher ごとに丸より内側で切る端末が在り「机の上は緑・実機で欠ける」★になる。
       ここを緩めると「壊しても赤にならない」見張りに戻るので、★締めた線を動かさない★。 */
    const c = box.size / 2, r = box.size * 0.371;
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
  if (!shown) console.log('     据え置き ★0件★（Kyually は 2026-08-18 に Rakually へ統一済み）');
});
/* ═══ ★ホーム画面に追加できる画面は manifest を持つ／絵は本物のロゴ★（2026-08-19）═══ */
T('★ホーム画面に追加する4画面が manifest を持ち、絵が本物のロゴを指す', () => {
  const SCREENS = [
    ['index.html', 'manifest.json'],
    ['kyuyo/index.html', 'kyuyo/manifest.json'],
    ['seikyu/index.html', 'seikyu/manifest.json'],
    ['kyuyo/meisai.html', 'kyuyo/meisai.webmanifest'],
  ];
  const seen = [];
  for (const [page, mf] of SCREENS) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const m = /<link[^>]+rel="manifest"[^>]+href="([^"]+)"/.exec(html);
    ok(m, '★' + page + ' に manifest の link が無い★（ホーム画面から開いても別の窓にならない）');
    ok(!/^data:/.test(m[1]),
      '★' + page + ' の manifest が data: に埋め込まれている★＝中の絵を差し替え忘れる（実際に起きた）');
    const file = path.resolve(path.dirname(path.join(ROOT, page)), m[1].split('?')[0]);
    ok(fs.existsSync(file), '★' + page + ' の manifest ' + m[1] + ' が無い（404）★');
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(j.name && j.short_name, mf + ' に name / short_name が無い');
    ok(Array.isArray(j.icons) && j.icons.length >= 2, mf + ' の絵が足りない');
    j.icons.forEach((ic) => {
      ok(!/^data:/.test(ic.src), '★' + mf + ' の絵が data: の手描き★（本物のロゴを指す）');
      const img = path.resolve(path.dirname(file), ic.src.split('?')[0]);
      ok(fs.existsSync(img), '★' + mf + ' の絵 ' + ic.src + ' が無い★');
    });
    ok(j.icons.some((ic) => ic.purpose === 'maskable'), mf + ' に maskable の絵が無い（Androidで丸く切られる）');
    seen.push(page + '→' + m[1]);
  }
  console.log('     ' + seen.join(' ／ '));
});

/* ═══ ★見本の会社名は このアプリの名前（合同会社Rakually）★（司さん 2026-08-19）═══ */
T('★配る物に 別の会社名の見本を書かない（見本は 合同会社Rakually）', () => {
  /* 客に配る物＝画面のHTMLと 画面のJS（テストと凍結した物は 見ない） */
  const SHIP = [
    'index.html', 'kyuyo/index.html', 'kyuyo/meisai.html', 'kyuyo/admin.html', 'seikyu/index.html',
    'js/hub.js', 'kyuyo/js/app.js', 'seikyu/js/seikyu-app.js',
  ];
  const NG = ['ゼロアクト', 'ZEROact', 'zeroact'];
  const hit = [];
  SHIP.forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    NG.forEach((w) => { if (src.indexOf(w) >= 0) hit.push(f + ' に「' + w + '」'); });
  });
  ok(!hit.length, '★配る物に別の会社名が残っている★ … ' + hit.join(' / '));
  /* 見本そのものは 在る事（既定が空だと「まだ入れていない」が判らなくなる） */
  const app = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
  ok(/name:'合同会社Rakually'/.test(app), '★既定の会社名が 合同会社Rakually でない★');
  ok(/\/\^合同会社Rakually\$\/\.test\(/.test(app), '★「まだ自社に変えていない」の判定が 見本と揃っていない★');
  const n = (app.match(/合同会社Rakually/g) || []).length;
  ok(n >= 3, '見本の3か所（既定・判定・置き字）が揃っていない（' + n + '箇所）');
  console.log('     配る物 ' + SHIP.length + '本に 別の会社名 0件 ／ app.js の見本 ' + n + '箇所');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
