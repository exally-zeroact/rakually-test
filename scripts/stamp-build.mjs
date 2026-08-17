// stamp-build.mjs — 全ローカルアセット(js/*.js・lib/*.js・css/*.css)の src/href に ?v=<内容ハッシュ> を付与。
//   目的: GitHub Pages / Vercel が JS を max-age でキャッシュ→デプロイしても端末が旧コードのまま、を根絶。
//   ★実際に踏んだ: 2026-07-29 staging で CSS を直したのにブラウザが旧版を読み、
//     「配信ファイルには入っているのに実行中コードに無い」状態になった。手で ?v= を貼る運用は必ず貼り忘れる。
//
//   ★方式=コンテンツハッシュ: 全JS/CSSの内容から短いハッシュを作り、全URLに ?v=<hash> を付ける。
//     コードが変わればハッシュが変わる→URLが変わる→端末は必ず新規取得。変わらなければ同じ=無駄なバスト無し。
//     決定論的なので CI が「貼り忘れ/古い?v」を --check で検知できる。
//   ★外部CDN(https://... の supabase-js 等)はバージョン固定URL=対象外(相対 js/|lib/|css/ だけ書換)。
//   ★OS非依存: rel は常にスラッシュ・行末は LF に正規化してからハッシュ
//     (Windows の \ と CRLF、CI(Linux) の / と LF でハッシュがブレると --check が永久に赤になる)。
//
//   使い方: node scripts/stamp-build.mjs         ... HTMLに ?v=<hash> を書き込む(push前)
//           node scripts/stamp-build.mjs --check ... 全HTMLが現在の内容ハッシュで貼られているか検証(ズレてたら exit 1)
//   参照: payslip-app/scripts/stamp-build.mjs（Kyuallyで根治済みの方式をそのまま移植）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// '.' = リポジトリ直下の .js も対象。book.html が読む exally-formula.js / hyperformula.full.min.js 等が
//   ここに居るため（グリッドをハブから使えるようにした 2026-07-29）。
// kyuyo/ = 給与アプリ(payslip-app から統合)。1リポジトリになったので版は【全体で1つ】にする。
// ★アプリを1つ足したら【この2つ】に足す（APP_DIRS だけで済むようにしてある）。
//   足さないと、そのアプリのHTMLには ?v= が付かず、GitHub Pages の古いJSを掴む。
//   2026-08-10: 請求書(seikyu/)を足した。足すまで /seikyu/ は見張りの視界の外だった。
const APP_DIRS = ['kyuyo', 'seikyu'];
const ASSET_DIRS = ['.', 'js', 'lib', 'css']
  .concat(APP_DIRS.flatMap(a => [a + '/js', a + '/lib', a + '/css', a + '/ops']));
// 対象 = ローカルの js|lib|css/ 配下、または直下の .js/.css。
//   直下は「/ を含まない」ので https://... の外部CDNには当たらない。
// 対象 = js|lib|css|ops 配下（kyuyo/ からの `../js/...`、請求書からの `../kyuyo/lib/...` も拾う）、
//   または直下の .js/.css。先頭の `../` は任意。https://... の外部CDNには当たらない（`//` を含まないため）。
const APP_RE = APP_DIRS.join('|');
const ASSET_RE = new RegExp(
  '((?:src|href)=")((?:\\.\\./)?(?:(?:' + APP_RE + ')/)?(?:js|lib|css|ops)/[^"?\\s]+\\.(?:js|css)'
  + '|[^"?\\s/:]+\\.(?:js|css))(\\?v=[^"]*)?(")', 'g');

// 対象HTML = リポジトリ直下の *.html 全部 ＋ 各アプリ直下の *.html（貼り忘れに強い。
//   js/|lib/|css/ を参照していないHTMLは正規表現に当たらないので無害）
function htmlFiles() {
  const out = fs.readdirSync(ROOT).filter(f => /\.html$/i.test(f)).map(f => f);
  for (const a of APP_DIRS) {
    const sub = path.join(ROOT, a);
    if (!fs.existsSync(sub)) continue;
    for (const f of fs.readdirSync(sub)) if (/\.html$/i.test(f)) out.push(a + '/' + f);
  }
  return out.sort();
}

// 全ローカルアセットの内容から決定論的な短いハッシュ(8桁)を作る。ファイル名でソート=順序非依存。
export function buildHash(root = ROOT) {
  const hash = crypto.createHash('sha256');
  const files = [];
  for (const d of ASSET_DIRS) {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!/\.(js|css)$/.test(f)) continue;
      // ★relは常にスラッシュ=OS差でハッシュがブレない。直下('.')は 'name.js' の形にする
      files.push(d === '.' ? f : d + '/' + f);
    }
  }
  files.sort();
  for (const rel of files) {
    hash.update(rel + '\n');
    // ★行末を LF に正規化してからハッシュ=CRLF(Windows)/LF(CI Linux)でブレない(決定論)
    const body = fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    hash.update(body, 'utf8');
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 8);
}

// 1つのHTMLに対して、現在のハッシュで貼り直した文字列を返す(書き込みはしない)
export function stampHtml(html, v) {
  return html.replace(ASSET_RE, '$1$2?v=' + v + '$4');
}

// このファイルが直接実行された時だけ動く(テストから import しても副作用なし)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const V = buildHash();
  const check = process.argv.includes('--check');
  let changed = 0; const stale = [];

  for (const f of htmlFiles()) {
    const p = path.join(ROOT, f);
    const html = fs.readFileSync(p, 'utf8');
    const next = stampHtml(html, V);
    if (check) {
      if (next !== html) stale.push(f);
    } else if (next !== html) {
      fs.writeFileSync(p, next); changed++;
    }
  }

  if (check) {
    if (stale.length) {
      console.error('✗ stamp-build --check: 以下が現在の内容ハッシュ(?v=' + V + ')で貼られていません: ' + stale.join(', '));
      console.error('  → `node scripts/stamp-build.mjs` を実行して commit してください(JS/CSSを変えたら毎回)。');
      process.exit(1);
    }
    console.log('✓ stamp-build --check: 全HTMLが ?v=' + V + ' で最新です。');
  } else {
    console.log('stamped ?v=' + V + ' (' + changed + ' HTML files updated)');
  }
}
