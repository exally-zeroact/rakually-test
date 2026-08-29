/* kaisha-ask.test.mjs — ★会社のことを「聞いてあげる」★（入口・欄11/聞く形0 だった所）
 * =============================================================================
 * ★なぜ★ 実測（2026-08-29）… 入口 index.html は ★欄11・聞く形0★＝
 *   屋号・住所・登録番号を ★空欄で並べて 埋めさせていた★（08-16の決定違反）。
 *
 * ここで見る物
 *   ① 聞く順（★後の質問が減る順★／★今 使わない物は 聞かない★＝電話は聞かない）
 *   ② 登録番号は ★形だけ 機械で見る★（T＋13桁・検査用数字）／★外に出ない★
 *   ③ ★当てられない物は 当てない★（屋号・住所は 人にしか分からない）
 *   ④ 答えたら その場で 結果を返す（何が どこに 出るか）
 *   ⑤ 中身が入っていれば 答えたうち（★何度も 同じ事を 聞かない★）
 *   ⑥ ★同じ入力なら 同じ答え★（決定論・AIを呼んでいない）
 *
 * 使い方: node tests/kaisha-ask.test.mjs [--self-test]
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const K = require_(path.join(HERE, '..', 'lib', 'kaisha-ask.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const ctx = (o) => Object.assign({ org: {}, businesses: [], answered: {} }, o);

console.log('\n[kaisha-ask] 会社のことを 聞いてあげる（入口）');

T('★① 聞く順（屋号→住所→登録番号→仕事）と、電話は 聞かない', () => {
  const keys = K.questions(ctx()).map((q) => q.key);
  eq(keys.join(' → '), 'yago → addr → invoiceNo → business', '聞く順');
  ok(keys.indexOf('tel') < 0, '★今 使わない物（電話）を 聞いている★');
  console.log('     ' + keys.join(' → ') + '（電話は 使う時に 初めて聞く）');
});

T('★② 登録番号は 形だけ 機械で見る（T＋13桁・検査用数字）', () => {
  eq(K.checkToroku('T3500003003293').level, 'ok', '正しい番号を はじいている');
  eq(K.checkToroku('T3500003003294').level, 'warn', '★最後の1桁が 違っても 通している★');
  eq(K.checkToroku('T35000030032').level, 'short', '途中を 完成として 扱っている');
  eq(K.checkToroku('あいう').level, 'bad', '字を 通している');
  eq(K.checkToroku('').level, 'empty', '空を 何かと言っている');
  /* ★止めるのは 形が違う時だけ★（検査用数字は 注意に留める） */
  ok(K.checkToroku('T3500003003294').ok === true, '★検査用数字の違いで 止めている★');
  ok(K.checkToroku('あいう').ok === false, '形が違うのに 通している');
  console.log('     T3500003003293 → ' + K.checkToroku('T3500003003293').msg);
});

T('★③ 当てられない物は 当てない（屋号・住所）', () => {
  K.questions(ctx()).forEach((q) => {
    if (q.key === 'yago' || q.key === 'addr') eq(q.guess, null, q.key + ' を 当てている');
  });
});

T('★④ 答えたら その場で 何が どこに 出るかを 返す', () => {
  const qs = K.questions(ctx());
  const yago = qs.filter((q) => q.key === 'yago')[0];
  ok(/紙の右上に「合同会社Rakunally」と 出ます/.test(yago.result('合同会社Rakunally')), yago.result('合同会社Rakunally'));
  ok(/合同会社/.test(yago.result('合同会社Rakunally')), '法人格を 見ていない');
  ok(/あとで入れます/.test(yago.result('')), '空の時の返し: ' + yago.result(''));
  const inv = qs.filter((q) => q.key === 'invoiceNo')[0];
  ok(/紙に「登録番号　T3500003003293」と 出ます/.test(inv.result('T3500003003293')), inv.result('T3500003003293'));
  ok(/紙にも 出ません/.test(inv.result('')), '持っていない時の返し: ' + inv.result(''));
  const biz = qs.filter((q) => q.key === 'business')[0];
  ok(/「物販」ごとに 売上を まとめます/.test(biz.result('物販')), biz.result('物販'));
});

T('★⑤ 中身が入っていれば 答えたうち（何度も 同じ事を 聞かない）', () => {
  const p0 = K.progress(ctx());
  eq(p0.done, 0, '空なのに 答えた事にしている');
  eq(p0.next.key, 'yago', '1問目');
  const p1 = K.progress(ctx({ org: { yago: '合同会社Rakunally' } }));
  eq(p1.done, 1, '入っているのに 数えていない');
  eq(p1.next.key, 'addr', '2問目へ 進んでいない');
  const all = K.progress(ctx({ org: { yago: 'A', addr: 'B', invoiceNo: 'T3500003003293' }, businesses: ['物販'] }));
  eq(all.next, null, '★答え終わったのに まだ 聞いている★');
  console.log('     0問 → 1問 → 全部（' + all.done + '/' + all.total + '）で 箱が 消える');
});

T('★⑥ 「飛ばす」も 答えたうち（空のまま 何度も 聞かない）', () => {
  const p = K.progress(ctx({ answered: { yago: true } }));
  eq(p.next.key, 'addr', '飛ばしたのに まだ 屋号を 聞いている');
});

T('★⑦ 仕事の札は 使っていない言葉だけ（同じ物を 2回 出さない）', () => {
  const c = K.bizChips(['物販']);
  ok(c.indexOf('物販') < 0, '★もう在る言葉を 札に出している★');
  ok(c.length >= 3, '札が ' + c.length + '個');
  console.log('     物販が在る時の札 … ' + c.join(' / '));
});

T('★⑧ 同じ入力なら 同じ答え（決定論・AIを呼んでいない）', () => {
  const src = fs.readFileSync(path.join(HERE, '..', 'lib', 'kaisha-ask.js'), 'utf8');
  ['fetch(', 'XMLHttpRequest', 'Math.random', 'Date.now', 'new Date('].forEach((w) => {
    ok(src.indexOf(w) < 0, '★外へ出る／その時の運で変わる書き方が 混じっている: ' + w + '★');
  });
  const a = JSON.stringify(K.questions(ctx({ org: { yago: 'A' } })).map((q) => q.key + ':' + q.now));
  const b = JSON.stringify(K.questions(ctx({ org: { yago: 'A' } })).map((q) => q.key + ':' + q.now));
  eq(a, b, '2回 呼ぶと 別の答え');
});

T('★⑨ 画面に出る字に 中の言葉（★）を 混ぜない', () => {
  const bad = [];
  K.questions(ctx()).forEach((q) => {
    [q.q, q.hint, q.skipLabel, q.placeholder].forEach((t) => { if (t && /★/.test(t)) bad.push(t); });
    ['', 'あ', 'T3500003003294'].forEach((v) => { const r = q.result(v); if (/★/.test(r)) bad.push(r); });
  });
  ok(!bad.length, '★画面に出る字に 印が 混ざっている★ ' + bad.slice(0, 2).join(' / '));
});

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと壊すと 赤になるか★');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  S('★自① 検査用数字を 見ていない作り物は この検査で 落ちる', () => {
    const naive = (v) => /^T\d{13}$/.test(v) ? 'ok' : 'bad';
    eq(naive('T3500003003294'), 'ok', '作り物が 作れていない');
    ok(K.checkToroku('T3500003003294').level !== 'ok', '★本物も 検査用数字を 見ていない★');
  });
  S('★自② 電話を 聞く形に 戻したら 気づける', () => {
    const keys = K.questions(ctx()).map((q) => q.key);
    ok(keys.indexOf('tel') < 0, '★電話を 聞いている★');
    /* 形の検査そのものは 残してある（使う時に 使う） */
    eq(K.checkTel('0898-00-0000').level, 'ok', '電話の形を 見る道具が 死んでいる');
    eq(K.checkTel('あいう').ok, false, '字を 通している');
  });
  S('★自③ 「答えた」の数えが 空振りしていない', () => {
    const p = K.progress(ctx({ org: { yago: 'A', addr: 'B', invoiceNo: 'T3500003003293' }, businesses: ['物販'] }));
    eq(p.done, p.total, '全部 入れても 終わらない');
    const q = K.progress(ctx());
    eq(q.done, 0, '空でも 答えた事になっている');
  });
  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
