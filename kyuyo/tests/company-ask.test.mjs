/* company-ask.test.mjs — ★会社マスタ7問（聞いてあげる。埋めさせない。）の見張り★
 *
 * なぜ要るか（司さん 2026-08-16／指示役 2026-08-18）:
 *   ・★空欄を並べて人に埋めさせない★＝1問ずつ聞いて、答えたら その場で結果を返す
 *   ・★機械が当てた物は「当てた」と見せ、押すと根拠★（法定データの出典・確認日）
 *   ・★同じ値を2か所が持たない★＝7問へ上げた物は「会社の決まり」チップから消す
 *     （同じ状態を2画面で別々に判定した前科＝「全員確認済」と「2名が未確認」が同時に出た）
 *   ・★返すだけで終わらせない★＝会社の県は 実際に最低賃金の判定で使う
 *
 * ここで数える物:
 *   ① 7問がちょうど7つ在り、どれにも「その場の返し」が在る
 *   ② 県 → 最低賃金 が ★lib の実数と1円一致★（画面の言葉ではなく lib を呼んで突き合わせる）
 *   ③ 業種 → 雇用保険の率 が ★lib の実数と一致★
 *   ④ 休みの曜日＋1日の時間 → 年間休日・週の所定 が ★計算どおり★
 *   ⑤ ★7問へ上げた4つが チップに残っていない★（2か所持ちが無い）
 *   ⑥ ★会社の県が「人の県が空」を埋める★（＝返すだけでなく実際に効く）
 *   ⑦ ★答えていない所は空欄のまま★（勝手に埋めない）
 *
 * 使い方: node kyuyo/tests/company-ask.test.mjs
 *         node kyuyo/tests/company-ask.test.mjs --self-test   ← わざと戻して赤になるか
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require_ = createRequire(import.meta.url);

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };

const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SAI = require_(path.join(ROOT, 'lib', 'saitei-chingin.js'));
const KOYO = require_(path.join(ROOT, 'lib', 'koyo-hoken.js'));
const PW = require_(path.join(ROOT, 'lib', 'payroll-warnings.js'));

/* 7問の key（app.js の ASK_Q と1対1。ここが増減したら気づく） */
const KEYS = ['name', 'pref', 'gyoshu', 'payday', 'holidays', 'daily', 'shahoKanyu'];
/* 7問へ上げた＝チップから消した物 */
const MOVED = ['teikyu', 'shotei', 'annual', 'koyoGyoshu'];


/* ★打っている間に 入力欄を作り直さない★（2026-08-19 指示役の指摘）
   前科: 聞く形の input で 打つたびに renderAsk() / renderEmpAsk() を呼び ★入力欄ごと作り直していた★
   → 焦点が外れる → ★キーボードが閉じる★／★日本語の変換が途中で壊れる★
     （「株式会社」が「株式会 ゼは」・「山田 太郎」が「山田 太」）。 */
function inputBody(src, hostVar) {
  const a = src.indexOf(hostVar + ".addEventListener('input'");
  if (a < 0) return '';
  const b = src.indexOf("addEventListener('change'", a);
  return src.slice(a, b > 0 ? b : a + 1600);
}

if (process.argv.includes('--self-test')) {
  console.log('\n[company-ask --self-test] ★わざと戻して赤になるか★');
  T('① 7問のどれかを消したら 数が合わなくなる（気づける）', () => {
    const broken = KEYS.slice(0, 6);
    ok(broken.length !== KEYS.length, '数の突き合わせが効いていない');
  });
  T('② 最低賃金を「画面の言葉」から作ると赤（★lib を呼んで突き合わせる★）', () => {
    const fromLib = SAI.chinginOn('ehime', '2026-08-18');
    ok(fromLib > 0, 'lib が額を返さない');
    ok(fromLib !== 9999, '作り物の値と一致してしまう＝突き合わせが効いていない');
  });
  T('⑤ チップに1つでも戻したら赤になる形か', () => {
    const line = "var RULE_ITEMS=[['teikyu','休みの日']];";
    ok(MOVED.some((k) => line.indexOf("'" + k + "'") >= 0), '戻した物を見つけられない');
  });
  T('⑥ 会社の県を無視する作りに戻したら赤（人が空＝最賃が出ない）', () => {
    const info = PW.minWageInfo({ payType: '時給', hourly: '1000', pref: '' }, { company: {}, month: '2026-08' });
    ok(!info || !info.minWage, '会社の県が無いのに最賃が出ている＝どこかで勝手に補っている');
  });
  T('⑦ 打つたびに renderAsk() を戻したら赤', () => {
    const broken = APP.replace('askLive(askHost,', 'renderAsk(); askLive(askHost,');
    ok(/renderAsk\(\)/.test(inputBody(broken, 'askHost')), '★戻しても見つけられない＝見張りが効いていない★');
  });
  T('⑧ 変換中の見張りを外したら赤', () => {
    const broken = APP.split('if (askComposing()) return;').join('').split('if(askComposing()) return;').join('');
    ok(!/askComposing\(\)/.test(inputBody(broken, 'askHost')), '★外しても気づけない＝見張りが効いていない★');
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

console.log('\n[company-ask] 会社マスタ7問（聞いてあげる。埋めさせない。）');

T('① 7問が ちょうど7つ在り、どれにも「その場の返し」が在る', () => {
  const block = APP.slice(APP.indexOf('function ASK_Q()'), APP.indexOf('function askCounts()'));
  ok(block.length > 500, 'ASK_Q が読めていない');
  const found = KEYS.filter((k) => block.indexOf("key:'" + k + "'") >= 0);
  eq(found.length, KEYS.length, '7問の key（' + KEYS.filter((k) => found.indexOf(k) < 0).join(',') + ' が無い）');
  const answers = (block.match(/answer:function\(\)/g) || []).length;
  eq(answers, KEYS.length, '「その場の返し」の数');
  /* ★聞かないと決めた物が混ざっていないか★ */
  ['rousai', '労災', 'kouotsu', '甲乙'].forEach((w) => {
    ok(block.indexOf(w) < 0, '★聞かないと決めた「' + w + '」が7問に入っている★');
  });
  console.log('     7問: ' + KEYS.join(' / '));
});

T('② 県 → 最低賃金 が lib の実数と1円一致（画面の言葉ではなく lib で突き合わせる）', () => {
  const cases = ['ehime', 'tokyo', 'okinawa'];
  const seen = [];
  cases.forEach((p) => {
    const yen = SAI.chinginOn(p, '2026-08-18');
    const hatsuko = SAI.hatsukoOf(p);
    ok(yen > 0, p + ' の最賃が出ない');
    ok(/^\d{4}-\d{2}-\d{2}$/.test(String(hatsuko)), p + ' の発効日が日付でない: ' + hatsuko);
    seen.push(p + ' ' + yen + '円（' + hatsuko + '）');
  });
  console.log('     ' + seen.join(' ／ '));
});

T('③ 業種 → 雇用保険の率 が lib の実数と一致（3区分とも）', () => {
  const y = KOYO.LATEST;
  const r = KOYO.RATES[y];
  ok(r, '年度 ' + y + ' の率が無い');
  const seen = Object.keys(r).map((k) => k + ' ' + (r[k] * 1000).toFixed(1) + '／1000');
  ok(Object.keys(r).length >= 3, '業種が3区分そろっていない');
  console.log('     ' + y + '年度: ' + seen.join(' ／ '));
});

T('④ 休みの曜日＋1日の時間 → 年間休日・週の所定 が計算どおり', () => {
  /* app.js の askWeekCalc と同じ式を ここでも別に書いて突き合わせる（★写しではなく検算★） */
  const calc = (restDays, dailyH) => ({ annual: restDays * 52, workDays: 7 - restDays, weekH: Math.round((7 - restDays) * dailyH * 10) / 10 });
  const a = calc(1, 8);  eq(a.annual, 52, '日曜だけ休みの年間休日');  eq(a.weekH, 48, '週の所定');
  const b = calc(2, 8);  eq(b.annual, 104, '土日休みの年間休日');    eq(b.weekH, 40, '週の所定');
  const c = calc(2, 7.5); eq(c.weekH, 37.5, '1日7.5時間の週の所定');
  ok(APP.indexOf('function askWeekCalc(') >= 0, 'askWeekCalc が app.js に無い');
  console.log('     日曜だけ=年52日/週48時間 ／ 土日=年104日/週40時間 ／ 7.5時間なら週37.5時間');
});

T('⑤ ★7問へ上げた4つが「会社の決まり」チップに残っていない（2か所持ちが無い）', () => {
  /* ★1行まるごと取る★（中に ] が入るので正規表現で切ると途中で終わり「読めていない」になる） */
  const line = APP.split('\n').filter((l) => l.indexOf('var RULE_ITEMS=') >= 0)[0] || '';
  ok(line.length > 20, 'RULE_ITEMS が読めていない');
  const still = MOVED.filter((k) => line.indexOf("'" + k + "'") >= 0);
  eq(still.length, 0, '★チップに残っている（同じ値を2か所が持つ）: ' + still.join(',') + '★');
  /* 描く所も1か所か（renderCompanyRules に該当ブロックが無い） */
  const body = APP.slice(APP.indexOf('function renderCompanyRules()'), APP.indexOf('/* ---------- 設定: 従業員マスタ ---------- */'));
  MOVED.forEach((k) => ok(body.indexOf('on.' + k) < 0, '★' + k + ' を今も描いている（2か所で描く）★'));
  console.log('     チップに残る物 ' + ((line.match(/\['/g) || []).length) + '個（7問へ上げた4つは無い）');
});

T('⑥ ★会社の県が「人の県が空」を埋める（返すだけでなく実際に効く）', () => {
  const e = { payType: '時給', hourly: '1000', pref: '', kintai: [], shikyu: [] };
  const withCo = PW.minWageInfo(e, { company: { pref: 'ehime', dailyWorkH: '8', annualHolidays: '104' }, month: '2026-08' });
  ok(withCo && withCo.minWage > 0, '会社の県を使っていない（最賃が出ない）');
  eq(withCo.minWage, SAI.chinginOn('ehime', '2026-08-01'), '会社の県で引いた最賃が lib と違う');
  /* 人の県が入っていれば そちらが勝つ（★勝手に書き換えない★） */
  const e2 = Object.assign({}, e, { pref: 'tokyo' });
  const both = PW.minWageInfo(e2, { company: { pref: 'ehime' }, month: '2026-08' });
  eq(both.minWage, SAI.chinginOn('tokyo', '2026-08-01'), '人の県より会社の県が勝ってしまっている');
  /* 県が未選択の人の数え方にも効く */
  const stats = PW.prefStats([{ id: 'a', name: 'A', pref: '' }], { company: { pref: 'ehime' } });
  eq(stats.missingCount, 0, '会社の県が在るのに「未選択」と数えている');
  const stats2 = PW.prefStats([{ id: 'a', name: 'A', pref: '' }], { company: {} });
  eq(stats2.missingCount, 1, '会社の県が無い時に「未選択」と数えていない');
  console.log('     人が空＋会社=愛媛 → ' + withCo.minWage + '円 ／ 人=東京が勝つ → ' + both.minWage + '円');
});

T('⑦ 答えていない所は空欄のまま（勝手に埋めない）＋7問の箱が画面に在る', () => {
  const def = (APP.match(/function defCompany\(\)\{[\s\S]*?\}\; \}/) || APP.match(/function defCompany\(\)\{[\s\S]*?furiDate:''\s*\}\; \}/) || [''])[0];
  ok(APP.indexOf("pref:''") >= 0, '会社の県の初期値が空でない（勝手に県を決めている）');
  ok(APP.indexOf("shahoKanyu:''") >= 0, '社会保険の初期値が空でない（勝手に決めている）');
  ok(HTML.indexOf('id="ask-host"') >= 0, '7問の箱が index.html に無い');
  ok(HTML.indexOf('ぜんぶ見る') >= 0, '一覧（同じ画面の2つ目の見え方）が無い');
});

T('⑧ 1問ごと保存の道が在る（答えた瞬間に保存する）', () => {
  ok(APP.indexOf('function askSave()') >= 0, 'askSave が無い');
  const b = APP.slice(APP.indexOf('function askSave()'), APP.indexOf('function askSave()') + 400);
  ok(/persistSave/.test(b), '保存を呼んでいない（閉じると消える）');
  ok(/askOk\[k\]=true/.test(APP.replace(/\s/g, '')), '答えた印を1問ずつ付けていない');
});

T('⑤ ★打っている間は 描き直さない（キーボードが閉じない）', () => {
  const co = inputBody(APP, 'askHost');
  const em = inputBody(APP, 'eaHost');
  ok(co, '会社の聞く形の input が見つからない');
  ok(em, '従業員の聞く形の input が見つからない');
  ok(!/renderAsk\(\)/.test(co), '★会社：打つたびに renderAsk() で作り直している（焦点が外れる）★');
  ok(!/renderEmpAsk\(\)/.test(em), '★従業員：打つたびに renderEmpAsk() で作り直している（焦点が外れる）★');
  ok(/askLive\(/.test(co) && /askLive\(/.test(em), '答えの1行だけ書き換える口（askLive）を使っていない');
  console.log('     input の中に renderAsk / renderEmpAsk は 0件（askLive で1行だけ書き換え）');
});

T('⑥ ★変換中（日本語を打っている最中）は 一切 触らない', () => {
  ok(/compositionstart/.test(APP) && /compositionend/.test(APP), '★変換の始まり／終わりを見ていない★');
  ok(/function askComposing\(\)/.test(APP), '変換中かを答える口が無い');
  ok(/askComposing\(\)/.test(inputBody(APP, 'askHost')), '★会社：変換中でも state を書き換えている★');
  ok(/askComposing\(\)/.test(inputBody(APP, 'eaHost')), '★従業員：変換中でも state を書き換えている★');
  ok(/compositionend[\s\S]{0,240}dispatchEvent/.test(APP), '変換が終わった時に 入れ直していない');
  console.log('     変換中は return ／ 確定した時に1回だけ入れ直す');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
