/* seikyu-name.test.mjs — ★保存/DL/PDF の推奨ファイル名（中身から作る）★
 *
 * なぜ必要か:
 *   落とした物が「請求書.pdf」「download(3).xlsx」だと、客の手元で どれが何か分からない。
 *   ★中身（日付・相手・種類・金額）から名前を作り、落とす前に人へ見せて直させる★
 *   のが全アプリ共通の決まり。ここはその「作る」側を実物の値で固定する。
 *
 * ここで止めたい事故:
 *   ① 相手や日付が空の時に ★空欄・今日の日付を勝手に埋める★
 *   ② Windows/iOS で落とせない文字（\ / : * ? " < > | 制御文字）が残る
 *   ③ 長い会社名で名前が伸びきって、保存できない／日付や金額が消える
 *   ④ 0円と「金額が取れなかった」を同じ名前にする
 *
 * 使い方: node seikyu/tests/seikyu-name.test.mjs
 *         node seikyu/tests/seikyu-name.test.mjs --self-test
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const N = require_(path.join(ROOT, 'seikyu/lib/seikyu-name.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* ★純関数（self-test で作り物を通せる）★
   「掃除をしない／空を今日で埋める／長さを見ない」＝やってはいけない方の作り方。 */
export function nameNaive(o) {
  const kind = o.docType === 'quote' ? '見積書' : '請求書';
  const d = String(o.issueYmd || '2026-08-10').replace(/-/g, '');
  return d + '_' + String(o.partnerName || '') + '_' + kind + '_' + String(o.grandTotal) + '.' + o.ext;
}

/* ── self-test：わざと壊して赤になるかを先に見せる ───────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[seikyu-name --self-test] わざと壊して赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('① 掃除をしない作り方だと、使えない文字がそのまま残る（＝本物との違いが出る）', () => {
    const bad = nameNaive({ issueYmd: '2026-09-30', partnerName: 'A/B:C社', grandTotal: 100, ext: 'pdf' });
    ok(/[\\/:*?"<>|]/.test(bad), '作り物なのに使えない文字が残っていない＝この検査が空振り');
    const good = N.suggest({ issueYmd: '2026-09-30', partnerName: 'A/B:C社', grandTotal: 100, ext: 'pdf' });
    ok(!/[\\/:*?"<>|]/.test(good), '本物に使えない文字が残っている');
  });

  S('② 空の日付を今日で埋める作り方だと、紙と食い違う（本物は「日付未定」）', () => {
    const bad = nameNaive({ issueYmd: '', partnerName: 'A', grandTotal: 1, ext: 'pdf' });
    ok(/^\d{8}_/.test(bad), '作り物なのに日付が埋まっていない＝この検査が空振り');
    const good = N.suggest({ issueYmd: '', partnerName: 'A', grandTotal: 1, ext: 'pdf' });
    ok(good.startsWith(N.NO_DATE + '_'), '本物が勝手に日付を入れている: ' + good);
  });

  S('③ 長さを見ない作り方だと、上限を超える（本物は収める）', () => {
    const long = 'あ'.repeat(300);
    const bad = nameNaive({ issueYmd: '2026-09-30', partnerName: long, grandTotal: 1, ext: 'pdf' });
    ok(bad.length > N.MAX_LEN, '作り物なのに短い＝この検査が空振り');
    const good = N.suggest({ issueYmd: '2026-09-30', partnerName: long, grandTotal: 1, ext: 'pdf' });
    ok(good.length <= N.MAX_LEN, '本物が上限を超えた: ' + good.length);
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

/* ── 本体 ──────────────────────────────────────────────────────── */
console.log('\n[請求書 推奨ファイル名]');

T('★見本どおりの形（日付_相手_種類_金額.拡張子）', () => {
  eq(N.suggest({ docType: 'invoice', issueYmd: '2026-09-30', partnerName: '藤原建設株式会社', grandTotal: 142660, ext: 'pdf' }),
    '20260930_藤原建設株式会社_請求書_142660.pdf');
});

T('見積書は種類が変わる', () => {
  eq(N.suggest({ docType: 'quote', issueYmd: '2026-09-30', partnerName: 'A社', grandTotal: 1000, ext: 'xlsx' }),
    '20260930_A社_見積書_1000.xlsx');
});

T('★相手が空でも空欄を作らない', () => {
  const n = N.suggest({ issueYmd: '2026-09-30', partnerName: '', grandTotal: 1000, ext: 'pdf' });
  eq(n, '20260930_' + N.NO_PARTNER + '_請求書_1000.pdf');
  ok(!/__/.test(n), '区切りが連続している（空欄が出ている）');
});

T('★日付が読めない時に今日を入れない（空・存在しない日）', () => {
  ok(N.suggest({ issueYmd: '', partnerName: 'A', grandTotal: 1, ext: 'pdf' }).startsWith(N.NO_DATE));
  ok(N.suggest({ issueYmd: '2026-02-30', partnerName: 'A', grandTotal: 1, ext: 'pdf' }).startsWith(N.NO_DATE), '2026-02-30 が通っている');
  ok(N.suggest({ issueYmd: '2026/09/30', partnerName: 'A', grandTotal: 1, ext: 'pdf' }).startsWith(N.NO_DATE), '区切りが / の物が通っている');
  eq(N.ymd8('2024-02-29'), '20240229', 'うるう年が弾かれている');
});

T('★合計がマイナス（返金の請求）は名前で分かる', () => {
  eq(N.suggest({ issueYmd: '2026-09-30', partnerName: 'A社', grandTotal: -142660, ext: 'pdf' }),
    '20260930_A社_請求書_-142660.pdf');
});

T('★0円と「金額が取れなかった」を作り分ける', () => {
  ok(N.suggest({ issueYmd: '2026-09-30', partnerName: 'A社', grandTotal: 0, ext: 'pdf' }).endsWith('_0.pdf'));
  ok(N.suggest({ issueYmd: '2026-09-30', partnerName: 'A社', ext: 'pdf' }).endsWith('_金額不明.pdf'));
  ok(N.suggest({ issueYmd: '2026-09-30', partnerName: 'A社', grandTotal: NaN, ext: 'pdf' }).endsWith('_金額不明.pdf'));
  ok(N.suggest({ issueYmd: '2026-09-30', partnerName: 'A社', grandTotal: 1.5, ext: 'pdf' }).endsWith('_金額不明.pdf'), '円未満が残った額が数として通っている');
});

T('★Windows/iOS で落とせない文字を残さない', () => {
  const n = N.suggest({ issueYmd: '2026-09-30', partnerName: 'A\\B/C:D*E?F"G<H>I|J', grandTotal: 1, ext: 'pdf' });
  ok(!/[\\/:*?"<>|]/.test(n), '使えない文字が残っている: ' + n);
});

T('★制御文字（改行・タブ）も残さない', () => {
  const raw = 'A' + String.fromCharCode(10) + 'B' + String.fromCharCode(9) + 'C' + String.fromCharCode(0);
  const n = N.suggest({ issueYmd: '2026-09-30', partnerName: raw, grandTotal: 1, ext: 'pdf' });
  for (const ch of n) {
    const c = ch.charCodeAt(0);
    ok(!(c < 32 || c === 127), '制御文字が残っている（コード ' + c + '）');
  }
});

T('区切りの「_」が連続しない・末尾に残らない', () => {
  eq(N.sanitize('  A  '), 'A');
  eq(N.sanitize('A//B'), 'A_B');
  eq(N.sanitize('.A.'), 'A');
  const n = N.suggest({ issueYmd: '2026-09-30', partnerName: '///', grandTotal: 1, ext: 'pdf' });
  ok(!/__/.test(n), '「_」が連続している: ' + n);
});

T('★長い会社名でも上限に収める・削るのは相手の名前だけ', () => {
  const long = 'あ'.repeat(300);
  const n = N.suggest({ issueYmd: '2026-09-30', partnerName: long, grandTotal: 142660, ext: 'pdf' });
  ok(n.length <= N.MAX_LEN, '長さ ' + n.length + ' が上限 ' + N.MAX_LEN + ' を超えた');
  ok(n.startsWith('20260930_'), '日付が消えた: ' + n);
  ok(n.endsWith('_請求書_142660.pdf'), '種類か金額が消えた: ' + n);
});

T('★短い上限でも相手の名前を消し切らない（誰宛か分からない名前にしない）', () => {
  // 上限いっぱいまで種類と金額で埋まっても、相手の名前は残る
  const n = N.suggest({ issueYmd: '2026-09-30', partnerName: '株式会社あいうえお', grandTotal: 999999999, ext: 'xlsx' });
  ok(/株/.test(n), '相手の名前が丸ごと消えた: ' + n);
});

T('★落とせない種類のファイル名は作らない（file-out.js の MIME と揃える）', () => {
  let threw = false;
  try { N.suggest({ issueYmd: '2026-09-30', partnerName: 'A', grandTotal: 1, ext: 'exe' }); } catch (e) { threw = true; }
  ok(threw, '知らない拡張子で名前が作れてしまう');
  threw = false;
  try { N.suggest({ issueYmd: '2026-09-30', partnerName: 'A', grandTotal: 1, ext: '' }); } catch (e) { threw = true; }
  ok(threw, '拡張子が空でも名前が作れてしまう');
  // 大文字・先頭の「.」は受ける（人が直した時に落ちない）
  ok(N.suggest({ issueYmd: '2026-09-30', partnerName: 'A', grandTotal: 1, ext: '.PDF' }).endsWith('.pdf'));
});

T('★網羅：日付×相手×金額×拡張子 を全部流して、使えない文字ゼロ・上限内・空欄ゼロ', () => {
  const dates = ['2026-09-30', '', '2026-02-30', '1999-01-01', '2024-02-29'];
  const names = ['藤原建設株式会社', '', 'A/B', 'あ'.repeat(200), '  ', '株式会社　空白入り'];
  const totals = [0, 1, -1, 142660, NaN, undefined, 1.5];
  let n = 0;
  for (const d of dates) for (const nm of names) for (const t of totals) for (const e of N.EXTS) {
    const s = N.suggest({ issueYmd: d, partnerName: nm, grandTotal: t, ext: e });
    n++;
    if (/[\\/:*?"<>|]/.test(s)) throw new Error('使えない文字: ' + s);
    if (s.length > N.MAX_LEN) throw new Error('上限超え: ' + s.length);
    if (/__/.test(s) || /_\./.test(s)) throw new Error('空欄が出ている: ' + s);
    if (!s.endsWith('.' + e)) throw new Error('拡張子が違う: ' + s);
  }
  if (n < 400) throw new Error('組合せが少なすぎる（検査が空振り）: ' + n);
  console.log('     実測: ' + n + '通りを流して違反0件');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
