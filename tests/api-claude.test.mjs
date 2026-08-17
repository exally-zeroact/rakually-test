/* api-claude.test.mjs — チャットのサーバ側が返す【基準数値】を実数で固定する。
 *
 * なぜ必要か（2026-08-02の事故から）:
 *   ・api/claude.js は、法定の料率を kyuyo/lib/ から読んで、システムプロンプトに埋め込んでいる。
 *   ・読み先が消えた時は 500 で【派手に】落ちたので気づけた（refs-resolve.test.mjs が根を止めた）。
 *   ・しかしこの手の埋め込みは、libのAPIが変わった時に **NaN や undefined が静かに入る** 方が怖い。
 *     画面は普通に出るし、AIも普通に喋る。ただ「健康保険料率: NaN%」と客に言うだけ。
 *   ★だから数値そのものを機械が見る。
 *
 * 判定:
 *   ① 対象月を固定した時に、実際の官公値がそのまま出る（実数リテラルで固定）
 *   ② 年度が変わる境界（社保=3月起算 / 労働保険=4月起算）で、ちゃんと切り替わる
 *   ③ ★「今日」で組み立てても NaN / undefined / Infinity が混ざらない
 *
 * 使い方: node tests/api-claude.test.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);

if (!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = 'test-dummy-key';
const handler = require_(path.join(ROOT, 'api/claude.js'));
const build = handler.__buildStatutoryPrompt;

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const has = (s, sub) => { if (s.indexOf(sub) < 0) throw new Error('出てこない: ' + sub + '\n--- 実際 ---\n' + s); };

console.log('\n[api-claude] チャットが客に言う「基準数値」が本物か');

T('★令和8年度(2026-08)の実数 — 健保(東京)4.925% / 厚年9.15% / 雇用0.50% / 消費税10%・8%', () => {
  const s = build('2026-08');
  has(s, '健康保険料率（東京）: 4.925%');   // 協会けんぽ R8 東京 9.85% の折半
  has(s, '令和8年度');
  has(s, '厚生年金保険料率: 9.15%');        // 18.3% の折半（全国一律）
  has(s, '雇用保険料率: 0.50%');            // R8 一般の事業 5.0/1000（R7の5.5から引下げ）
  has(s, '消費税: 10%（標準）/ 8%（軽減）');
});

T('★令和7年度(2025-08)の実数 — 健保(東京)4.955% / 雇用0.55%', () => {
  const s = build('2025-08');
  has(s, '健康保険料率（東京）: 4.955%');   // 協会けんぽ R7 東京 9.91% の折半
  has(s, '令和7年度');
  has(s, '雇用保険料率: 0.55%');            // R7 一般の事業 5.5/1000
});

T('社保年度は3月起算で切り替わる（2026-02は令和7・2026-03は令和8）', () => {
  has(build('2026-02'), '令和7年度');
  has(build('2026-03'), '令和8年度');
});

T('労働保険年度は4月起算で切り替わる（2026-03は0.55%・2026-04は0.50%）', () => {
  has(build('2026-03'), '雇用保険料率: 0.55%');
  has(build('2026-04'), '雇用保険料率: 0.50%');
});

T('★「今日」で組み立てても NaN / undefined が混ざらない', () => {
  const s = build();
  for (const bad of ['NaN', 'undefined', 'Infinity', 'null']) {
    if (s.indexOf(bad) >= 0) throw new Error('プロンプトに ' + bad + ' が入っています:\n' + s);
  }
  if (!/健康保険料率（東京）: \d+\.\d{3}%/.test(s)) throw new Error('健保料率が数字になっていません:\n' + s);
  if (!/雇用保険料率: \d+\.\d{2}%/.test(s)) throw new Error('雇用保険料率が数字になっていません:\n' + s);
});

T('検査が空振りしていない（テスト用の窓が実際に生えている）', () => {
  if (typeof build !== 'function') throw new Error('__buildStatutoryPrompt が無い');
  if (typeof handler !== 'function') throw new Error('api/claude.js が関数を export していない（Vercelが呼べない）');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
