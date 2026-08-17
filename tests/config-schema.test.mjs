/* config-schema.test.mjs — ★規格が決まっている設定ファイルに、知らない項目を混ぜさせない★
 *
 * なぜ必要か（2026-08-04・指示役／全セッション共通の決まり）:
 *   vercel.json に「なぜこうしたか」の説明を "//" というキーで書き足した。
 *   ★Vercel は知らない項目を見つけると、組み立てを始める前に止める。★
 *   すると ★前のデプロイがそのまま配信され続ける★ ので、
 *   画面は正常に見えたまま、直しだけが入らない。
 *   ＝「pushした」と「直しが入った」が別物になる。一番気づきにくい壊れ方。
 *
 *   ★同じ事故が 2026-08-02 にダイコメでも起きている（"_comment" を足してデプロイ2回失敗）。
 *     別のセッションが同じ日に同じ間違いを踏んだ＝人の記憶では防げない。だから機械で止める。
 *
 * 決まり:
 *   ・設定ファイルに説明文やメモを書かない。書きたい事は docs/ へ。
 *   ・知らない項目が混ざったら★赤★。
 *   ・PWA の manifest.json も同じ（知らない項目は無視されるだけだが、
 *     ★「書いたのに効かない」★という別の嘘を生むので同じ扱いにする）。
 *
 * ★「知らない項目」を足したくなったら、この一覧に足す前に「本当に規格にあるか」を確かめること。
 *   一覧に足せば赤は消えるが、Vercelは止まったままになる（＝一覧はごまかしに使えない）。
 *
 * 使い方: node tests/config-schema.test.mjs
 *         node tests/config-schema.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* 規格にある項目（トップレベル）。出どころを併記する。 */
const ALLOWED = {
  'vercel.json': {
    doc: 'https://vercel.com/docs/project-configuration',
    keys: ['$schema', 'buildCommand', 'cleanUrls', 'crons', 'devCommand', 'framework', 'functions',
      'headers', 'ignoreCommand', 'images', 'installCommand', 'outputDirectory', 'public',
      'redirects', 'regions', 'rewrites', 'routes', 'trailingSlash', 'git'],
  },
  'manifest.json': {
    doc: 'https://developer.mozilla.org/docs/Web/Manifest',
    keys: ['background_color', 'categories', 'description', 'display', 'display_override',
      'file_handlers', 'icons', 'id', 'lang', 'launch_handler', 'name', 'orientation',
      'prefer_related_applications', 'protocol_handlers', 'related_applications', 'scope',
      'screenshots', 'share_target', 'short_name', 'shortcuts', 'start_url', 'theme_color', 'dir'],
  },
};
/* package.json は道具ごとに独自の項目が正しく入るので、★説明用のキーだけ★を見る。 */
const COMMENT_LIKE = /^(\/\/|_comment|comment|#|note|memo|説明|メモ)$/i;

/* ★純関数: 1つの設定ファイルの中身を見て、問題を返す。self-testで作り物を通せる。 */
export function checkConfig(name, obj) {
  const bad = [];
  const spec = ALLOWED[name];
  for (const k of Object.keys(obj)) {
    if (COMMENT_LIKE.test(k)) {
      bad.push({ key: k, why: '★説明文・メモを設定ファイルに書いている（デプロイが止まる／黙って無視される）' });
    } else if (spec && !spec.keys.includes(k)) {
      bad.push({ key: k, why: '規格に無い項目（' + spec.doc + ' に載っていない）' });
    }
  }
  return bad;
}

/* ══ self-test ═══════════════════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  let pass = 0, fail = 0;
  const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  console.log('\n[config-schema --self-test] わざと混ぜて赤になるか');
  T('★"//" で説明を書いたら赤（今回の事故そのもの）', () => {
    if (!checkConfig('vercel.json', { '//': 'なぜこうしたか', redirects: [] }).length) throw new Error('赤にならない');
  });
  T('★"_comment" でも赤（ダイコメで起きた形）', () => {
    if (!checkConfig('vercel.json', { _comment: 'メモ', rewrites: [] }).length) throw new Error('赤にならない');
  });
  T('★規格に無い項目は赤（打ち間違いも捕まる）', () => {
    if (!checkConfig('vercel.json', { redirect: [] }).length) throw new Error('赤にならない');
  });
  T('規格どおりなら緑（誤検知を出さない）', () => {
    const r = checkConfig('vercel.json', { $schema: 'x', redirects: [], rewrites: [], trailingSlash: false });
    if (r.length) throw new Error('誤検知: ' + JSON.stringify(r));
  });
  T('manifest も同じ目で見る（規格にある物は通す）', () => {
    if (checkConfig('manifest.json', { name: 'a', icons: [], start_url: '/' }).length) throw new Error('誤検知');
  });
  T('★manifest に説明を書いても赤', () => {
    if (!checkConfig('manifest.json', { name: 'a', note: 'メモ' }).length) throw new Error('赤にならない');
  });
  T('package.json は道具ごとの独自項目を通す（誤検知を出さない）', () => {
    const pkg = { name: 'x', scripts: {}, 'lint-staged': {}, devDependencies: {} };
    if (checkConfig('package.json', pkg).length) throw new Error('誤検知');
  });
  T('★package.json でも説明用のキーは赤', () => {
    if (!checkConfig('package.json', { name: 'x', _comment: 'メモ' }).length) throw new Error('赤にならない');
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ══ 本番（実物を見る） ═══════════════════════════════════════════════ */
const FILES = ['vercel.json', 'package.json', 'manifest.json', 'kyuyo/manifest.json', 'kyuyo/admin-manifest.json'];

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + e.message); } };

console.log('\n[config-schema] 設定ファイルに知らない項目が混ざっていないか');

let seen = 0;
for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  seen++;
  T(rel, () => {
    let obj;
    try { obj = JSON.parse(fs.readFileSync(abs, 'utf8')); }
    catch (e) { throw new Error('JSONとして読めない（コメントを書くと必ずこうなる）: ' + e.message); }
    const bad = checkConfig(path.basename(rel), obj);
    if (bad.length) {
      throw new Error('知らない項目があります:\n'
        + bad.map(b => `      「${b.key}」 … ${b.why}`).join('\n')
        + '\n      → ★説明文は docs/ に書いてください。設定ファイルには書けません。★');
    }
  });
}

T('検査が空振りしていない（設定ファイルを実際に読めている）', () => {
  if (seen < 3) throw new Error('読めた設定ファイルが ' + seen + ' 件しかない＝この検査が空振り');
});

console.log('\n── 実測 ──');
console.log('  見た設定ファイル: ' + seen + '件（' + FILES.filter(f => fs.existsSync(path.join(ROOT, f))).join(' / ') + '）');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
