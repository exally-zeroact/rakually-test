/* furikomi-date.test.mjs — ★振込指定日が 対象月に追従するか★（指示役 2026-08-27 D＝今週の優先1位）
 * =============================================================================
 * ここで止めたい事故（重い順）
 *   ① ★先月の日付で 銀行に振込を出す★（前は 会社の設定に1個の日付を持っていて 動かなかった）
 *   ② ★取組日 0000 が 銀行へ行く★（空を 0 と読んで4桁に詰めていた）
 *   ③ ★紙に刷った支給日と 銀行へ出す日が 食い違う★
 *   ④ 銀行が休みの日を 指定してしまう（土日・祝日・年末年始）
 *
 * ★根拠（法律・一次情報を当たって確かめた）★
 *   ・銀行の休み … 銀行法 第十五条第一項／銀行法施行令 第五条第一項（1号 祝日／2号 12/31〜1/3／3号 土曜）
 *     出典 e-Gov 法令検索（356AC0000000059 ／ 357CO0000000040）★確かめた日 2026-08-27★
 *   ・★寄せる向き（前倒し／後ろ倒し）は 法律で決まっていない★＝会社の設定（焼き付けない）
 *
 * 使い方: node kyuyo/tests/furikomi-date.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const PM = require_(path.join(ROOT, 'kyuyo/lib/payroll-monthly.js'));
const B = require_(path.join(ROOT, 'kyuyo/lib/bank-holidays.js'));
const Z = require_(path.join(ROOT, 'kyuyo/lib/zengin.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + '欲しい ' + JSON.stringify(b) + ' / 出た ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

const co = (o) => Object.assign({ paydayDay: '25', paydayRel: 'next' }, o || {});
const ymdOf = (o) => o.y + '-' + String(o.m).padStart(2, '0') + '-' + String(o.d).padStart(2, '0');
const mm = (month, c) => PM.furikomiMMDD({ month: month, company: c });

/* 全銀を実際に作って ★ヘッダーの取組日の4文字を 目で読む★（中の値どうしで閉じない） */
const TR = [{ name: 'ﾔﾏﾀﾞ ﾀﾛｳ', bankNo: '0001', branchNo: '001', yokin: '普通', account: '1234567', amount: 250000 }];
const COMMITTER = { code: '1234567890', name: 'ｾﾞﾛｱｸﾄ', bankNo: '0001', bankName: 'ｲﾖ', branchNo: '001', branchName: 'ｲﾏﾊﾞﾘ', yokin: '普通', account: '4160657' };
const TORIKUMI_AT = 1 + 2 + 1 + 10 + 40;   /* 種別1＋種別コード2＋コード区分1＋委託者コード10＋委託者名40 */
function torikumiInFile(month, c) {
  const r = Z.build(Object.assign({}, COMMITTER, { torikumiMMDD: mm(month, c) }), TR, {});
  return r.records[0].slice(TORIKUMI_AT, TORIKUMI_AT + 4);
}

if (process.argv.includes('--self-test')) {
  console.log('\n[振込指定日 --self-test] わざと壊して 赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('① 昔の姿（会社の1個の日付を そのまま使う）に戻すと 月を変えても動かない＝捕まえられる', () => {
    const old = (c) => (c.furiDate && /^\d{4}-\d{2}-\d{2}$/.test(c.furiDate)) ? c.furiDate.slice(5, 7) + c.furiDate.slice(8, 10) : '';
    const c = co({ furiDate: '2026-08-25' });
    eq(old(c), '0825', '作り物が昔の姿になっていない＝この検査が空振り');
    eq(old(c), old(c), '');
    /* ★本物は 月ごとに変わる★ */
    ok(mm('2026-08', co()) !== mm('2026-09', co()), '★本物が 月を変えても同じ日を返している★');
  });

  S('② 取組日の門番を外すと 空が 0000 になる＝捕まえられる', () => {
    /* padN の素の振る舞い（門番を通さない）＝0000 になる事を見せる */
    eq(Z.padN('', 4), '0000', '作り物が0000になっていない＝この検査が空振り');
    /* ★本物は 作らない★ */
    let threw = 0;
    try { Z.build(Object.assign({}, COMMITTER, { torikumiMMDD: '' }), TR, {}); } catch (_) { threw = 1; }
    eq(threw, 1, '★本物が 空の取組日で ファイルを作っている★');
  });

  S('③ 銀行の休みを見ない作りに戻すと 土日に指定してしまう＝捕まえられる', () => {
    /* 2026-10-25 は日曜。寄せなければ 1025 のまま */
    const naive = '1025';
    eq(B.reasonOf(2026, 10, 25), '日曜', '作り物の日が 日曜でない＝この検査が空振り');
    ok(mm('2026-09', co()) !== naive, '★本物が 日曜を指定している★');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

console.log('\n[振込指定日が 対象月に追従するか]');

/* ═══ ① 対象月を変えたら 付いてくる（12通り・実物の月で押す） ═══ */
T('★① 12か月ぜんぶ 対象月に追従する（毎月25日・翌月払い）★', () => {
  const c = co();
  const want = {
    '2026-01': '0225', '2026-02': '0325', '2026-03': '0424', '2026-04': '0525',
    '2026-05': '0625', '2026-06': '0724', '2026-07': '0825', '2026-08': '0925',
    '2026-09': '1023', '2026-10': '1125', '2026-11': '1225', '2026-12': '0125',
  };
  const got = {};
  Object.keys(want).forEach((m) => { got[m] = mm(m, c); });
  Object.keys(want).forEach((m) => eq(got[m], want[m], '対象月 ' + m));
  /* ★同じ日が2回出ていない＝本当に動いている★（空振り検査） */
  const uniq = new Set(Object.values(got));
  ok(uniq.size === 12, '12か月なのに ' + uniq.size + '通りしか出ていない（動いていない疑い）');
  console.log('     実測 ' + Object.keys(want).map((m) => m.slice(5) + '→' + got[m]).join(' '));
});

/* ═══ ② 年をまたぐ ═══ */
T('★② 年をまたぐ（2026-12 → 2027-01-25 → 0125）★', () => {
  eq(ymdOf(PM.furikomiDateObj({ month: '2026-12', company: co() })), '2027-01-25');
  eq(mm('2026-12', co()), '0125');
});

/* ═══ ③ 末日・うるう年 ═══ */
T('★③ 末日／うるう年（2月28日・29日）★', () => {
  const c = co({ paydayDay: '末' });
  eq(ymdOf(PM.furikomiDateObj({ month: '2026-09', company: c })), '2026-10-30', '10/31は土曜→前の営業日');
  eq(ymdOf(PM.furikomiDateObj({ month: '2027-01', company: c })), '2027-02-26', '2027/2/28は日曜→前の営業日');
  eq(ymdOf(PM.furikomiDateObj({ month: '2028-01', company: c })), '2028-02-29', '★うるう年の2/29（火）はそのまま★');
  eq(mm('2028-01', c), '0229');
});

/* ═══ ④ 土曜・日曜・祝日・振替休日・年末年始 ═══ */
T('★④ 銀行が休みの日は 寄せる（土・日・祝・振替・年末年始）★', () => {
  eq(B.reasonOf(2026, 10, 31), '土曜');
  eq(B.reasonOf(2026, 10, 25), '日曜');
  eq(B.reasonOf(2027, 1, 1), '元日');
  eq(B.reasonOf(2026, 12, 31), '年末年始');
  eq(B.reasonOf(2027, 1, 2), '土曜');
  eq(B.reasonOf(2027, 1, 3), '日曜');
  eq(B.reasonOf(2027, 1, 4), '', '1/4は営業日');
  /* ★振替休日★（祝日が日曜→次の平日）… 2026-05-06（みどりの日5/4・こどもの日5/5の後） */
  ok(B.isBankHoliday(2026, 5, 6), '2026-05-06 が休みになっていない（振替休日）');
  /* ★続けて休みでも 抜けるまで動く★ … 元日は 前へ寄せると 12/30 まで戻る */
  eq(ymdOf(B.prevBusinessDay(2027, 1, 1)), '2026-12-30');
  eq(ymdOf(B.nextBusinessDay(2027, 1, 1)), '2027-01-04');
});

T('★④-b 寄せる向きは 会社が選べる（法律で決まっていない）★', () => {
  const prev = co({ paydayDay: '25' });
  const next = co({ paydayDay: '25', paydayShift: 'next' });
  eq(mm('2026-09', prev), '1023', '前の営業日');
  eq(mm('2026-09', next), '1026', '次の営業日');
  eq(PM.furikomiShiftOf({ company: co() }), 'prev', '★既定は 前の営業日★');
  eq(PM.furikomiShiftOf({ company: co({ paydayShift: 'next' }) }), 'next');
  eq(PM.furikomiShiftOf({ company: co({ paydayShift: 'なんとか' }) }), 'prev', '知らない値は 既定へ倒す');
});

/* ═══ ⑤ 作れない時は 1バイトも出さない ═══ */
T('★⑤ 取組日が作れない時は 全銀ファイルを1バイトも作らない★', () => {
  ['', '0000', '09', '1332', '0132', 'abcd', null].forEach((v) => {
    let threw = 0;
    try { Z.build(Object.assign({}, COMMITTER, { torikumiMMDD: v }), TR, {}); } catch (_) { threw = 1; }
    eq(threw, 1, '取組日 ' + JSON.stringify(v) + ' で 作ってしまった');
  });
  eq(Z.checkTorikumi('0925'), '', '正しい取組日を止めてしまう');
});

/* ═══ ⑥ 全銀データに実際に書き出して 日付の欄を 1文字ずつ読む ═══ */
T('★⑥ 全銀データの取組日を 実際に書き出して 目で読む（中の値で閉じない）★', () => {
  const c = co();
  const cases = [['2026-08', '0925'], ['2026-09', '1023'], ['2026-12', '0125']];
  cases.forEach(([m, want]) => {
    const s = torikumiInFile(m, c);
    eq(s.length, 4, '取組日の欄が4文字でない');
    eq(s, want, '対象月 ' + m + ' の 全銀ヘッダー ' + (TORIKUMI_AT + 1) + '文字目から4文字');
  });
  /* ★1文字ずつ★ 読んで、その月の日付と 同じか */
  const s = torikumiInFile('2026-09', c);
  const o = PM.furikomiDateObj({ month: '2026-09', company: c });
  eq(s[0] + s[1], String(o.m).padStart(2, '0'), '月の2文字');
  eq(s[2] + s[3], String(o.d).padStart(2, '0'), '日の2文字');
  console.log('     実測 2026-09 → 紙の日 ' + ymdOf(o) + ' ／ 全銀の4文字 「' + s + '」');
});

/* ═══ ⑦ 紙の支給日と 全銀の取組日 ═══ */
T('★⑦ 紙に刷る支給日と 全銀の取組日が 同じ日から出ている★', () => {
  const c = co();
  ['2026-08', '2026-09', '2026-12'].forEach((m) => {
    const pay = PM.payDateObj({ month: m, company: c });
    const fur = PM.furikomiDateObj({ month: m, company: c });
    /* 銀行が休みで寄せた時は ★寄せた理由が入っている★＝黙って違う日にならない */
    if (!fur.moved) eq(ymdOf(fur), ymdOf(pay), m + ' … 寄せていないのに 日が違う');
    else {
      ok(fur.reason, m + ' … 寄せたのに 理由が空');
      eq(fur.from, ymdOf(pay), m + ' … 寄せる前の日が 支給日と違う');
    }
  });
});

/* ═══ ⑧ 法律の出典を 持っているか ═══ */
T('★⑧ 銀行の休みの根拠（条文と 確かめた日）を 持っている★', () => {
  ok(/銀行法/.test(B.SOURCE.law), '法律の名前が無い');
  ok(/施行令/.test(B.SOURCE.order), '政令の名前が無い');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(B.SOURCE.checkedOn), '確かめた日が無い');
  eq(B.YEAR_END.fromMonth, 12); eq(B.YEAR_END.fromDay, 31);
  eq(B.YEAR_END.toMonth, 1); eq(B.YEAR_END.toDay, 3);
  console.log('     ' + B.SOURCE.law + ' ／ ' + B.SOURCE.order + ' ／ ' + B.SOURCE.where + ' ／ 確かめた日 ' + B.SOURCE.checkedOn);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
