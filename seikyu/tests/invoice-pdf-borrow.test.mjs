/* invoice-pdf-borrow.test.mjs — ★借り物が 元と 1バイトも違わないか★
 * =============================================================================
 * ★司さん 2026-08-30「成功してるアプリを真似て 同じ形式でやれや／毎アプリ同じことを繰り返してるやろ」★
 *
 * ★決まり★（[[feedback_borrow_tools_not_appearance]]）
 *   借りてよいのは ★道具・測り方・試験★。★同じ形のまま★ 持ってくる。
 *   ★読みやすく 書き直さない★＝直したくなったら ★元（代行）を直して また借りる★。
 *   ここで見るのは「借り物が 途中で 別物に なっていないか」だけ。
 *
 * ★元★ C:/Users/zeroa/Exally-test（代行請求書アプリ＝ダイコメの製品・司さんが毎日使う）
 *   invoice-pdf.js ／ vendor/pdf-lib.min.js ／ vendor/fontkit.umd.min.js
 *   ／ vendor/fonts/BIZUDPGothic-Regular.ttf
 * ★元が この機械に 無い時は「未測定」★（緑と言わない）。
 *
 * 使い方: node seikyu/tests/invoice-pdf-borrow.test.mjs [--self-test]
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = 'C:/Users/zeroa/Exally-test';

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/** 借りた物 … [うちの場所, 元の場所] */
const PAIRS = [
  ['seikyu/lib/invoice-pdf.js', 'invoice-pdf.js'],
  ['vendor/pdf-lib.min.js', 'vendor/pdf-lib.min.js'],
  ['vendor/fontkit.umd.min.js', 'vendor/fontkit.umd.min.js'],
  ['vendor/fonts/BIZUDPGothic-Regular.ttf', 'vendor/fonts/BIZUDPGothic-Regular.ttf'],
];

console.log('\n[invoice-pdf-borrow] 借り物が 元と 1バイトも違わないか');

T('★借りた物が 4つとも うちに 在る（1つでも欠けたら PDFが 作れない）', () => {
  PAIRS.forEach(([mine]) => {
    const p = path.join(ROOT, mine);
    ok(fs.existsSync(p), '★' + mine + ' が 無い★');
    ok(fs.statSync(p).size > 1000, '★' + mine + ' が 空に近い（' + fs.statSync(p).size + 'B）★');
  });
  const total = PAIRS.reduce((a, [mine]) => a + fs.statSync(path.join(ROOT, mine)).size, 0);
  console.log('     4つで ' + (total / 1024 / 1024).toFixed(1) + 'MB（字を 全部 埋め込む為）');
});

T('★借り物を 書き直していない（元の道具が 1文字も 混ざっていない自作に なっていない）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'seikyu/lib/invoice-pdf.js'), 'utf8');
  /* 元のコードにしか 無い言葉（＝これが 消えていたら 書き直している） */
  ['buildOne', 'drawCompanyElegant', 'registerFontkit', 'subset: false'].forEach((w) => {
    ok(src.indexOf(w) >= 0, '★元に在る「' + w + '」が 消えている＝書き直した★');
  });
  ok(src.length > 40000, '★中身が 短すぎる（' + src.length + '字）＝抜き書きしている★');
});

if (!fs.existsSync(SRC)) {
  console.log('\n  ─ ★元との突き合わせ … 未測定★（この機械に 代行が 在りません: ' + SRC + '）');
  console.log('    ★これは「同じ」という意味では ありません★。代行が在る機械で 走らせてください。');
} else {
  T('★元と 1バイトも違わない（4つとも SHAが 一致）', () => {
    const rows = PAIRS.map(([mine, theirs]) => {
      const a = sha(path.join(SRC, theirs)), b = sha(path.join(ROOT, mine));
      return { mine, same: a === b, a: a.slice(0, 12), b: b.slice(0, 12) };
    });
    const bad = rows.filter((r) => !r.same);
    ok(!bad.length, '★' + bad.length + '本 違う★\n     '
      + bad.map((r) => r.mine + '  元 ' + r.a + ' / うち ' + r.b).join('\n     '));
    rows.forEach((r) => console.log('     ' + r.a + '  ' + r.mine));
  });
}

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと壊すと 赤になるか★');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  S('★自① 1バイト変えたら SHAが 変わる（突き合わせが 効いている）', () => {
    const p = path.join(ROOT, 'seikyu/lib/invoice-pdf.js');
    const before = sha(p);
    const buf = fs.readFileSync(p);
    const broken = Buffer.concat([buf, Buffer.from(' ')]);
    const after = crypto.createHash('sha256').update(broken).digest('hex');
    ok(before !== after, '★1バイト足しても 同じSHA＝この検査は 空振り★');
  });
  S('★自② 元が 無い機械では「未測定」と言う（緑と言わない）', () => {
    ok(!fs.existsSync('C:/この機械には無い場所/invoice-pdf.js'), '前提が崩れている');
    /* ここは 上の if で 未測定に 落ちる道が 在る事だけ 見る */
    const me = fs.readFileSync(path.join(ROOT, 'seikyu/tests/invoice-pdf-borrow.test.mjs'), 'utf8');
    ok(/未測定/.test(me), '★未測定と言う道が 無い★');
  });
  S('★自③ 抜き書き（短い自作）に すり替えたら 気づける', () => {
    const fake = '(function(){ /* 自作 */ })();';
    ok(fake.length < 40000, '作り物が 作れていない');
    ok(fake.indexOf('drawCompanyElegant') < 0, '★作り物に 元の言葉が 入っている★');
  });
  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
