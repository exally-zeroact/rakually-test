/* pages-hosting.test.mjs — ★GitHub Pages のサブパス配信で壊れる書き方を機械で止める★
 *
 * なぜ必要か:
 *   exally-staging は https://exally-zeroact.github.io/exally-staging/ に配信される＝【サブパスの下】。
 *   一方、本番 exally は Vercel のルート(/)配信。だから本番で正しい `href="/kyuyo/"` は、
 *   staging では github.io の直下を指してしまい 404 になる。
 *   2026-08-01 の合わせ直しでは、実際に次の4種類が見つかった:
 *     ① hub.html の給与タイル href="/kyuyo/"
 *     ② kyuyo/index.html の「← Exally」 href="/"
 *     ③ manifest.json / kyuyo/manifest.json の start_url・scope・icons(先頭 "/")
 *     ④ kyuyo/admin.html の navigator.serviceWorker.register('/sw.js')
 *   ①だけを手で直す運用にすると、次の合わせ直しで必ず貼り忘れる（②③④は今回も人の目では見落としかけた）。
 *   だから【1つでもあれば赤】にする。
 *
 *   さらに、テスト環境で最悪の事故＝「本番倉庫を向いたまま staging を動かす」も同時に見張る。
 *   接続先は js/supa-config.js ただ1つが決める、という約束を機械で守らせる。
 *
 * 見る物:
 *   A. 配信HTML(直下 *.html ＋ kyuyo/*.html)に href="/…" / src="/…" / action="/…" が無い
 *   B. manifest.json の start_url / scope / icons[].src が "/" 始まりでない
 *   C. 配信JS(インライン含む)に serviceWorker.register('/…') / fetch('/…') が無い
 *   D. 本番SupabaseのURLが、例外表に無いファイルに出てこない
 *   F. 例外表が腐っていない(理由・戻す条件・ファイルの実在)
 *
 * ★2026-08-17 Rakually（rakually-test）へ運んだ時に替えた所★
 *   ・配信は ★Vercel のルート★（github.io のサブパスではない）。それでも この見張りは残す:
 *       ①絶対パス "/…" は 配信の置き方が変わると必ず壊れる（相対なら両方で正しい）
 *       ②★テスト線が本番倉庫を向く★のが一番の事故＝D/D2 はここでしか止められない
 *   ・★E（index.html が hub.html と1バイト違わない）は消した★
 *       ＝Rakually の入口は ★index.html の1枚だけ★（hub.html は Exally の物なので持って来ていない）。
 *         写しが2枚無いので「写しが古くなる」事故は起きえない。戻す条件＝入口を2枚にする時。
 *
 * 使い方: node tests/pages-hosting.test.mjs
 *         node tests/pages-hosting.test.mjs --self-test   ... ★わざと壊して赤になるかを確かめる★
 *           （緑を信じるには「壊した時に赤くなる」ことの確認が要る。ハーネスの compare.mjs と同じ考え方）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// 本番 Supabase（＝staging から向いてはいけない倉庫）
const PROD_SUPA_RE = /(?:https:\/\/|db\.)tnfwipbgfgjaymlszeid\.supabase\.co/;
// DB-test（＝staging が向くべき倉庫）
const DBTEST_REF = 'khawdrnvssdenumbiwfg';

/* ★例外★ ここに載っていない違反は全部赤。載せるには「理由」と「戻す条件」が要る。
   （tests/ci-coverage.test.mjs と同じやり方＝外すこと自体は認めるが、必ず一覧に出す） */
const EXCEPTIONS = {
  //  ★book.html（グリッドのチャットが fetch('/api/claude')）の例外は 2026-08-17 に消した。
  //    ＝book.html を Rakually に持って来ていない（Exally の物）。持っていない物の例外は残さない。
  //  ★statutory-hydrate.js の例外は 2026-08-02 に消した。
  //    削除済み5枚の残骸12本を本番(abcc812)とstagingの両方から実際に削除したため。
  //    本番の実配信でも12本とも404になっていることを確認済み。
  'kyuyo/scripts/verify-statutory.mjs': {
    what: '中央statutory(法定データ)の読取URL',
    reason: 'statutory は健保料率・最賃・所得税表などの法定データで、全国で1つの表。'
      + '会社ごとのデータ(テナントデータ)ではないので、本番/テストで分ける物ではない。'
      + 'anon の GET だけ＝ここから書く経路は無い。'
      + '実測(2026-08-01): DB-test の statutory は空(0行)で、向けると全kindが「中央に無し」になり、'
      + 'ドリフトが無いのにCIが赤くなる＝ガードとして機能しなくなる。',
    restoreWhen: 'DB-test の statutory に本番と同じ行を入れた時。'
      + 'その時 js/supa-config.js 由来（tests/repo-supa.mjs と同じやり方）に切り替える。',
  },
  'kyuyo/scripts/check-source-urls.mjs': {
    what: '中央statutory(法定データ)の読取URL',
    reason: '★2026-08-03 新設。中央が持つ出典URLを叩いて、まだ生きているかを見る道具。'
      + '中央の source_url を読む必要があるので中央そのものを見る（verify-statutory と同じ理由・同じ表）。'
      + 'anon の GET だけ＝ここから書く経路は無い。'
      + '★通常CIには入れず、週1＋手動の別ワークフロー(.github/workflows/source-urls.yml)で回す'
      + '（外部サイトの都合でCIが赤くなると、自分のせいでない赤で push が止まり、赤が信用されなくなるため）。',
    restoreWhen: 'verify-statutory.mjs と同じ。DB-test の statutory に本番と同じ行を入れた時に、'
      + 'まとめて js/supa-config.js 由来へ切り替える。',
  },
  'kyuyo/scripts/pull-statutory.mjs': {
    what: '中央statutory(法定データ)の読取URL',
    reason: '★2026-08-03 新設。出典・確認日・指紋と最賃47県を【中央から機械で作り直す】道具。'
      + '中央を唯一の正にするため、中央そのものを読む必要がある（verify-statutory と同じ理由・同じ表）。'
      + 'anon の GET だけ＝ここから書く経路は無い。中央へ書くのは seed-statutory.mjs（DBパスワードが要る）だけ。',
    restoreWhen: 'verify-statutory.mjs と同じ。DB-test の statutory に本番と同じ行を入れた時に、'
      + '両方まとめて js/supa-config.js 由来へ切り替える。',
  },
};

/* 検査しない物（配信されないか、絶対パスが正しい物）。ここも理由つきで明示する。 */
const NOT_SCANNED = {
  'vercel.json': '本番Vercelのルーティング設定。source/destination は絶対パスで書くのが正しい（Pagesでは読まれない）',
  'docs/': '設計書。配信物ではない',
  'supabase/': 'DDL(SQL)。配信物ではない',
  'CLAUDE.md': '作業者向けの説明。配信物ではない',
  'tests/pages-hosting.test.mjs': 'このテスト自身（違反の見本を文字列で持っているため）',
  'tests/dbtest-seed.mjs': 'DB-test固定の道具。本番refは「そこに向いていたら中止する」ための番人として持っている',
};

// ───────────────────────────────────────────────────────────────
// 判定は全部「ファイル名→中身」の地図(vfs)に対する純関数にする。
//   ＝ 本番は実ディスクを読んだ地図を渡し、自己テストはそこに違反を混ぜた地図を渡すだけで
//      「わざと壊した時に赤くなるか」を実際に確かめられる（目視や勘に頼らない）。
// ───────────────────────────────────────────────────────────────
const ABS_ATTR_RE = /\s(?:href|src|action|poster|data)="\/(?!\/)[^"]*"/g;   // ="//…"(外部)は対象外
const ABS_CALL_RE = /(?:serviceWorker\.register|fetch|import|open)\(\s*'\/(?!\/)[^']*'/g;

// ★アプリを足したらここにも足す（2026-08-10 請求書 seikyu/ を追加）。
//   足すまで、そのアプリのHTMLは「サブパス配信で壊れる書き方」の見張りの外に居る。
const isShippedHtml = (rel) => /^(?:[^/]+|(?:kyuyo|seikyu)\/[^/]+)\.html$/.test(rel);
const isScannableJs = (rel) => /\.(js|mjs|html)$/.test(rel) && !/\.min\.js$/.test(rel)
  && !rel.startsWith('tests/') && !rel.startsWith('tools/') && !rel.startsWith('scripts/') && !rel.includes('/scripts/');

/** 違反を全部集めて返す（空配列＝合格）。vfs = { 'hub.html': '…中身…', … } */
export function findViolations(vfs, exceptions = EXCEPTIONS) {
  const v = { absAttr: [], manifest: [], absCall: [], prodSupa: [], dbtest: [] };
  const names = Object.keys(vfs).sort();

  for (const f of names) {
    const src = vfs[f];
    if (typeof src !== 'string') continue;             // 画像などは中身を持たせない
    const excused = !!exceptions[f];

    if (isShippedHtml(f) && !excused) {
      for (const m of src.match(ABS_ATTR_RE) || []) v.absAttr.push(f + ' … ' + m.trim());
    }
    // ★manifestは名前で拾わない★ 「manifest.json」だけを見ていたら kyuyo/admin-manifest.json を
    //   取りこぼした(2026-08-01 実際に起きた)。中身に start_url / scope を持つ .json は全部 manifest 扱いにする。
    if (/\.json$/.test(f) && /"(?:start_url|scope)"\s*:/.test(src)) {
      let m; try { m = JSON.parse(src); } catch (_e) { v.manifest.push(f + ' … JSONとして読めない'); continue; }
      for (const k of ['start_url', 'scope']) {
        if (typeof m[k] === 'string' && m[k].startsWith('/')) v.manifest.push(f + ' … ' + k + '=' + m[k]);
      }
      for (const ic of m.icons || []) {
        if (typeof ic.src === 'string' && ic.src.startsWith('/')) v.manifest.push(f + ' … icons[].src=' + ic.src);
      }
    }
    if (isScannableJs(f) && !excused) {
      for (const m of src.match(ABS_CALL_RE) || []) v.absCall.push(f + ' … ' + m);
    }
    if (!excused && PROD_SUPA_RE.test(src)) v.prodSupa.push(f);
  }

  // 接続先が DB-test であること
  const conf = vfs['js/supa-config.js'];
  if (typeof conf === 'string') {
    const url = (conf.slice(conf.indexOf('window.SUPA')).match(/url:\s*'([^']+)'/) || [])[1] || '';
    if (!url.includes(DBTEST_REF)) v.dbtest.push('js/supa-config.js が DB-test を向いていない: ' + url);
  } else v.dbtest.push('js/supa-config.js が無い');

  return v;
}

// ── 実ディスクを地図にする ──
function walk(rel, out = []) {
  const dir = path.join(ROOT, rel || '.');
  for (const f of fs.readdirSync(dir)) {
    if (f === '.git' || f === 'node_modules' || f === 'tmp') continue;
    const r = rel ? rel + '/' + f : f;
    if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r, out);
    else out.push(r);
  }
  return out;
}
const notScanned = (rel) => Object.keys(NOT_SCANNED).some(k => k.endsWith('/') ? rel.startsWith(k) : rel === k);

function readVfs() {
  const vfs = {};
  for (const r of walk('').filter(x => !notScanned(x))) {
    if (/\.(png|jpg|jpeg|gif|ico|woff2?|xlsx|tar)$/i.test(r)) { vfs[r] = null; continue; }
    try { vfs[r] = fs.readFileSync(path.join(ROOT, r), 'utf8'); } catch (_e) { vfs[r] = null; }
  }
  return vfs;
}

let pass = 0, fail = 0;
function T(n, fn) { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } }
const list = (a) => '\n   - ' + a.join('\n   - ');

// ═══════════════ 自己テスト ═══════════════
if (process.argv.includes('--self-test')) {
  console.log('\n[pages-hosting --self-test] ★わざと壊して、ちゃんと赤くなるか★');
  const base = readVfs();
  const clone = () => JSON.parse(JSON.stringify(base));
  const cases = [
    ['① 入口のHTMLに href="/kyuyo/" を戻す', (m) => { m['index.html'] = m['index.html'].replace('href="kyuyo/"', 'href="/kyuyo/"'); }, 'absAttr'],
    ['② 給与の「← Rakually」を href="/" に戻す', (m) => { m['kyuyo/index.html'] = m['kyuyo/index.html'].replace('href="../index.html"', 'href="/"'); }, 'absAttr'],
    ['③ manifest の scope を "/" に戻す', (m) => { m['manifest.json'] = m['manifest.json'].replace('"scope": "./"', '"scope": "/"'); }, 'manifest'],
    // ★名前が manifest.json でない物(admin-manifest.json)も拾えるか＝2026-08-01に実際に取りこぼした穴
    ['③b admin-manifest.json の icons を "/kyuyo/…" に戻す', (m) => { m['kyuyo/admin-manifest.json'] = m['kyuyo/admin-manifest.json'].replace('"src": "img/admin-192.png"', '"src": "/kyuyo/img/admin-192.png"'); }, 'manifest'],
    ['④ serviceWorker.register(\'/sw.js\') に戻す', (m) => { m['kyuyo/admin.html'] = m['kyuyo/admin.html'].replace("register('../sw.js')", "register('/sw.js')"); }, 'absCall'],
    ['⑤ 配信JSに本番SupabaseのURLを混ぜる', (m) => { m['js/hub.js'] += "\nvar X='https://tnfwipbgfgjaymlszeid.supabase.co';\n"; }, 'prodSupa'],
    // ⑥（入口の写しが古くなる）は 2026-08-17 に消した＝入口が index.html の1枚だけになったため
    ['⑥ 接続設定を本番倉庫に向ける', (m) => { m['js/supa-config.js'] = m['js/supa-config.js'].replace(/url:\s*'[^']+'/, "url: 'https://tnfwipbgfgjaymlszeid.supabase.co'"); }, 'dbtest'],
  ];
  T('壊していない状態では違反ゼロ（＝空振りしていない）', () => {
    const v = findViolations(base);
    const n = Object.values(v).reduce((s, a) => s + a.length, 0);
    if (n) throw new Error('壊していないのに違反 ' + n + '件: ' + JSON.stringify(v));
  });
  for (const [name, breakIt, expectKey] of cases) {
    T(name + ' → ' + expectKey + ' で赤くなる', () => {
      const m = clone(); breakIt(m);
      const v = findViolations(m);
      if (!v[expectKey].length) throw new Error('壊したのに ' + expectKey + ' が検知しませんでした（このガードは効いていない）');
    });
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

// ═══════════════ 本番（実ディスク） ═══════════════
console.log('\n[pages-hosting] サブパス配信で壊れる書き方＋本番倉庫への誤接続を見張る');
const vfs = readVfs();
const V = findViolations(vfs);
const names = Object.keys(vfs);
const shippedHtml = names.filter(isShippedHtml).sort();

T('A. ★配信HTMLに href="/…" / src="/…" のドメイン直下参照が無い（あるとPagesのサブパスで404）', () => {
  if (V.absAttr.length) throw new Error('ドメイン直下の絶対パス:' + list(V.absAttr)
    + '\n   → 相対に直す（例: href="/kyuyo/" → href="kyuyo/"、href="/" → href="hub.html" / "../hub.html"）');
});
T('B. ★manifest の start_url / scope / icons が "/" 始まりでない（Pagesでは scope 不一致でPWAが入らない）', () => {
  if (V.manifest.length) throw new Error('絶対パス:' + list(V.manifest) + '\n   → "./" や "img/…" の相対に直す');
});
T("C. ★JSに serviceWorker.register('/…') / fetch('/…') のドメイン直下参照が無い", () => {
  if (V.absCall.length) throw new Error('ドメイン直下の絶対パス:' + list(V.absCall)
    + "\n   → 相対に直す（例: register('/sw.js') → register('../sw.js')）");
});
T('D. ★★本番SupabaseのURLが、例外表に無いファイルに出てこない（テスト環境で本番倉庫を触らない）★★', () => {
  if (V.prodSupa.length) throw new Error('本番倉庫(tnfwipbgfgjaymlszeid)を指しています:' + list(V.prodSupa)
    + '\n   → 接続先は js/supa-config.js ただ1つ。道具は tests/repo-supa.mjs 経由で取ること。');
});
T('D2. 接続設定 js/supa-config.js が DB-test を向いている', () => {
  if (V.dbtest.length) throw new Error(V.dbtest.join(' / '));
});
/* ★E（入口の写しが古くならないか）は 2026-08-17 に消した★
   Rakually の入口は index.html の1枚だけ（hub.html は Exally の物＝持って来ていない）。
   写しが2枚無いので この事故は起きえない。★代わりに「入口が2枚に戻っていないか」を見る★
   ＝写しを作った日に、上の E を書き戻す事を思い出せる形にしておく。 */
T('E. ★入口は index.html の1枚だけ（写しを増やしていない＝古い写しが配られる事故を作らない）', () => {
  const extra = Object.keys(vfs).filter((f) => /^(hub|home|top)\.html$/.test(f));
  if (extra.length) throw new Error('入口の写しが増えています: ' + extra.join(', ')
    + ' → 写しを持つなら「1バイト違わない」検査(旧E)を書き戻すこと');
});
T('F. 例外表の各項目に「理由」と「戻す条件」があり、ファイルが実在する', () => {
  for (const [f, e] of Object.entries(EXCEPTIONS)) {
    if (!e.reason || e.reason.length < 20) throw new Error(f + ': reason が不十分');
    if (!e.restoreWhen || e.restoreWhen.length < 10) throw new Error(f + ': restoreWhen(戻す条件)が無い');
    if (!fs.existsSync(path.join(ROOT, f))) throw new Error(f + ': 例外表にあるがファイルが無い（消したなら例外表からも消す）');
  }
});
T('検査が空振りしていない（配信HTMLを実際に読めている）', () => {
  if (shippedHtml.length < 4) throw new Error('配信HTMLが少なすぎます: ' + shippedHtml.length + '本');
  if (names.length < 200) throw new Error('走査したファイルが少なすぎます: ' + names.length + '本');
});

console.log('\n── 実測 ──');
console.log('  走査したファイル: ' + names.length + '本（うち配信HTML ' + shippedHtml.length + '本: ' + shippedHtml.join(', ') + '）');
console.log('  検査しない物: ' + Object.keys(NOT_SCANNED).length + '件');
Object.entries(NOT_SCANNED).forEach(([k, v]) => console.log('   - ' + k + ' … ' + v));
console.log('  例外(理由つきで許している物): ' + Object.keys(EXCEPTIONS).length + '件');
Object.entries(EXCEPTIONS).forEach(([f, e]) => {
  console.log('   - ' + f + ' … ' + e.what);
  console.log('     理由    : ' + e.reason);
  console.log('     戻す条件: ' + e.restoreWhen);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
