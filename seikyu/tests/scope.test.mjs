/* scope.test.mjs — ★紙の作りを「誰が決めるか」★（写し > その1通 > この相手 > 会社 > 様式）
 * =============================================================================
 * ★なぜ★（司さん 2026-08-29
 *   「これは 取引先ごとに 請求書の様式を ちゃんと設定できてる前提やけど その認識で合ってるか？」）
 *   ★実測では 出来ていなかった★＝明細の列・紙の行数・件名を紙に出すか は ★会社ぜんぶで1つ★。
 *   「八木工業だけ 摘要の列が要る」が 出来なかった。
 *
 * ここで見る物
 *   ① 順番（強い順）が その通りか
 *   ② ★上書きの無い相手は 会社の既定のまま★（今までと1ドットも変えない）
 *   ③ ★空欄と 0 は 別物★（0＝枠を作らず 詰める）
 *   ④ ★どこで決まったか(from)★を 返す（客に「なぜ この紙か」を言える）
 *   ⑤ 出してしまった紙は 写しのまま（後から 会社の設定を変えても 変わらない）
 *
 * 使い方: node seikyu/tests/scope.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const SC = require_(path.join(HERE, '..', 'lib', 'seikyu-scope.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const ORG = { template: 'std1', cols: { items: ['#', '品名・内容', '金額'] }, paperRows: 12, paperStyle: {} };
const spec = (...items) => ({ items });

console.log('\n[scope] 紙の作りを 誰が決めるか（写し > その1通 > この相手 > 会社 > 様式）');

T('★① 上書きの無い相手は 会社の既定のまま（今までと 1ドットも 変えない）', () => {
  const r = SC.resolve({ inv: { partner_id: 'p1' }, partner: { id: 'p1', data: {} }, org: ORG });
  eq(r.template.value, 'std1', '様式');
  eq(r.template.from, 'org', 'どこで決まったか');
  eq(r.cols.value.items.length, 3, '列');
  eq(r.cols.from, 'org', '列の出どころ');
  eq(r.paperRows.value, 12, '行数');
  eq(r.subjectOn.value, null, '件名は 会社も 出さない設定');
  console.log('     様式 ' + r.template.value + '（' + SC.fromWord(r.template.from) + '）');
});

T('★② この相手だけ 変えられる（会社の既定より 強い）', () => {
  const partner = { id: 'p1', data: { paper: { template: 'elegant', cols: spec('#', '品名・内容', '数量', '金額', '摘要'), paperRows: 20, subjectOn: true } } };
  const r = SC.resolve({ inv: { partner_id: 'p1' }, partner, org: ORG });
  eq(r.template.value, 'elegant', '★相手の様式が 効いていない★');
  eq(r.template.from, 'partner', 'どこで決まったか');
  eq(r.cols.value.items.length, 5, '★相手の列が 効いていない★');
  eq(r.paperRows.value, 20, '★相手の行数が 効いていない★');
  eq(r.subjectOn.value, true, '★相手の「件名を出す」が 効いていない★');
  console.log('     ' + SC.overridesOf(partner).filter((x) => x.over).map((x) => x.label).join(' / ') + ' を 上書き');
});

T('★③ その1通だけ 変えたら それが いちばん強い（相手の上書きより 上）', () => {
  const partner = { id: 'p1', data: { paper: { template: 'elegant', paperRows: 20 } } };
  const inv = { partner_id: 'p1', template_id: 'koujo', data: { paperRows: 8 } };
  const r = SC.resolve({ inv, partner, org: ORG });
  eq(r.template.value, 'koujo', '1通の様式');
  eq(r.template.from, 'inv', '出どころ');
  eq(r.paperRows.value, 8, '1通の行数');
});

T('★④ 空欄と 0 は 別物（0＝枠を作らず 詰める）', () => {
  const partner = { id: 'p1', data: { paper: { paperRows: 0 } } };
  const r = SC.resolve({ inv: { partner_id: 'p1' }, partner, org: ORG });
  eq(r.paperRows.value, 0, '★0 を 空欄として 捨てている★');
  eq(r.paperRows.from, 'partner', '出どころ');
  const r2 = SC.resolve({ inv: { partner_id: 'p1' }, partner: { data: { paper: { paperRows: '' } } }, org: ORG });
  eq(r2.paperRows.value, 12, '★空欄なのに 相手の物として 拾っている★');
  console.log('     0 → 0（相手の決め） ／ 空欄 → 12（会社の既定）');
});

T('★⑤ 出してしまった紙は 写しのまま（後から 会社の設定を変えても 変わらない）', () => {
  const inv = { id: 'v1', status: 'issued', partner_id: 'p1', template_id: 'std1',
    snapshot: { cols: spec('#', '品名・内容', '金額', '摘要') } };
  const partner = { id: 'p1', data: { paper: { cols: spec('#', '品名・内容') } } };
  const r = SC.resolve({ inv, partner, org: ORG });
  eq(r.cols.value.items.length, 4, '★出した紙の列が 変わっている★');
  eq(r.cols.from, 'snapshot', '出どころ');
});

T('★⑥ どこで決まったかを 人の言葉で言える（客に「なぜ この紙か」を言う為）', () => {
  ['snapshot', 'inv', 'partner', 'org', 'none'].forEach((k) => {
    ok(SC.fromWord(k).length > 4, k + ' の言い方が 無い');
  });
  ok(/この相手だけ/.test(SC.fromWord('partner')), '相手の言い方: ' + SC.fromWord('partner'));
  ok(/会社の既定/.test(SC.fromWord('org')), '会社の言い方: ' + SC.fromWord('org'));
});

T('★⑦ 上書きの一覧が 出せる（画面が「会社の既定のまま」と言える）', () => {
  eq(SC.hasOverride({ data: {} }), false, '上書きが無いのに 在ると言っている');
  const partner = { data: { paper: { cols: spec('#', '金額') } } };
  eq(SC.hasOverride(partner), true, '上書きが 在るのに 無いと言っている');
  const list = SC.overridesOf(partner);
  eq(list.length, SC.KEYS.length, '一覧の数');
  eq(list.filter((x) => x.over).length, 1, '上書きの数');
  console.log('     上書きできる物 ' + SC.KEYS.length + 'つ … ' + SC.KEYS.map((k) => k.label).join(' / '));
});

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと壊すと 赤になるか★');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  S('★自① 相手の層を 抜くと 会社の既定に 戻ってしまう（＝この検査は 何かを見ている）', () => {
    const partner = { data: { paper: { template: 'elegant' } } };
    const withP = SC.resolve({ inv: {}, partner, org: ORG }).template.value;
    const noP = SC.resolve({ inv: {}, partner: { data: {} }, org: ORG }).template.value;
    ok(withP !== noP, '★相手が在っても無くても 同じ＝上書きが 効いていない★');
  });
  S('★自② 「決めていない」は 空欄だけ（0 と false は 値）', () => {
    /* ★ここを 取り違えると 静かに 事故る★
       0     … 枠を作らず 詰める＝★決めた★
       false … 件名を「出さない」と ★決めた★（会社が「出す」でも 相手は 出さない）
       ''/null/undefined … ★決めていない★（上の層へ 落ちる） */
    ok(SC._hasNum(0) === true, '0 を 空欄と 言っている');
    ok(SC._hasNum('') === false && SC._hasNum(null) === false, '空欄を 値と言っている');
    ok(SC._has('') === false, '空文字を 値と言っている');
    const off = SC.resolve({ inv: {}, partner: { data: { paper: { subjectOn: false } } },
      org: { paperStyle: { subjectOn: true } } });
    ok(off.subjectOn.value === false && off.subjectOn.from === 'partner',
      '★会社が「出す」でも 相手の「出さない」が 勝たない★ ' + JSON.stringify(off.subjectOn));
  });
  S('★自③ 空の列（items 0本）を 値として 拾わない', () => {
    ok(SC._has({ items: [] }) === false, '★空の列を 上書きとして 拾っている★');
    ok(SC._has({ items: ['#'] }) === true, '列を 拾えていない');
  });
  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
