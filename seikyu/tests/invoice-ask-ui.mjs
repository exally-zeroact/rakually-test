/* invoice-ask-ui.mjs — ★この1通の「聞く形」を 実際に押す★（字を読むだけにしない）
 * =============================================================================
 * lib の中身は `invoice-ask.test.mjs` が見る。ここは ★本物の画面で 押した時★を見る:
 *   ① まだ答えていない事が在る時だけ 箱が出る／答え終われば ★自分で消える★
 *   ② 「これで」を押すと ★その1通に入る★（1問ごと保存の中身）
 *   ③ 「飛ばす」を押しても ★もう聞かない★（空のまま 何度も聞かれない）
 *   ④ 押した物は ★「細かく決める」の欄にも 同じ値★（★同じ画面の2つの見え方★）
 *   ⑤ 「なぜ？」に 根拠が在る（当てた物は 根拠を見せる）
 *   ⑥ ★別ウィザードを作っていない★＝画面（.screen）の数が 増えていない
 *   ⑦ 発行済み（触れない1通）では 出さない
 *
 * 使い方: node seikyu/tests/invoice-ask-ui.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + rel });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.scrollTo = () => {}; win.print = () => {};
win.URL.createObjectURL = () => 'blob:fake';
win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
const errs = [];
win.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e)));
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0];
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js'].indexOf(src.split('/').pop()) >= 0) continue;
  const p = path.resolve(path.dirname(file), src);
  if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(p, 'utf8');
  doc.body.appendChild(el);
}
await new Promise((r) => setTimeout(r, 500));
doc.getElementById('app').hidden = false;

const A = win.SeikyuApp, S = A._state;
/* ★偽の倉庫★（1問ごと保存が 本当に走ったかを 数える）。
   本物は使わない＝★テストが 倉庫を触らない★。 */
const saved = [];
S.store = {
  invoices: {
    saveDraft: (v) => { saved.push({ no: v.no, subject: (v.data || {}).subject, due: v.due_ymd }); return Promise.resolve({ ok: true, id: v.id }); },
    list: () => Promise.resolve(S.list),
    usedNos: () => Promise.resolve([]),
  },
  partners: { list: () => Promise.resolve(S.partners), patch: () => Promise.resolve({ ok: true }) },
};
const $ = (id) => doc.getElementById(id);
const shown = () => $('inv-ask-card').style.display !== 'none';
const txt = () => $('inv-ask').textContent.replace(/\s+/g, ' ');
const click = (sel) => { const b = $('inv-ask').querySelector(sel); ok(b, '押す物が無い: ' + sel); b.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };

/** 相手＋前回の1通が在る状態を 作り直す（★毎回 同じ所から始める★） */
function reset(cur) {
  S.partners = [{ id: 'p1', data: { name: '○○建設株式会社', honor: '御中', payTerm: { kind: 'nextEom', n: 0 } } }];
  S.list = [{ id: 'v0', partner_id: 'p1', no: 'A-0009', issue_ymd: '2026-09-05', due_ymd: '2026-10-31',
    data: { subject: '9月分 運転代行ご利用料金', term: { kind: 'nextEom', n: 0 } }, lines: [], totals: {} }];
  S.cur = Object.assign({ id: 'v1', partner_id: 'p1', no: 'A-0010', issue_ymd: '2026-10-05',
    due_ymd: '', data: {}, lines: [], totals: {}, status: 'draft' }, cur || {});
  A._go('scr-edit');
  A._fillEdit();
}

console.log('\n[invoice-ask-ui] この1通の「聞く形」を 実際に押す');

/* ★別ウィザードを作っていない★ … 画面の数を 先に数えておく */
const SCREENS0 = doc.querySelectorAll('.screen').length;

T('★① まだ答えていない時だけ 出る（当てた物と 根拠つき）', () => {
  reset();
  ok(shown(), '★聞く形が 出ていない★');
  ok(/2問のうち 0問 答えました/.test(txt()), '進み具合が出ていない：' + txt().slice(0, 40));
  ok(/この請求書の件名は？/.test(txt()), '最初の問いが 違う');
  ok(/当てました/.test(txt()) && /9月分 運転代行ご利用料金/.test(txt()),
    '★前回から当てていない★：' + txt().slice(0, 90));
  console.log('     ' + txt().slice(0, 60) + '…');
});

T('★② 「これで」を押すと その1通に入る（1問ごと保存の中身）', () => {
  reset();
  click('[data-iask-ok="subject"]');
  eq(S.cur.data.subject, '9月分 運転代行ご利用料金', '★押しても 入っていない★');
  ok(S.cur.data.askOk && S.cur.data.askOk.subject, '答えた印が 付いていない');
  ok(/この請求書の件名は？/.test(txt()) === false, '★答えたのに まだ同じ事を聞いている★');
  ok(/いつまでに もらう約束ですか？/.test(txt()), '次の問いへ 進んでいない：' + txt().slice(0, 60));
  console.log('     件名「' + S.cur.data.subject + '」／次＝支払期限');
});

T('★②-b 支払期限も 押すと入る（取引先の型から当てた日）', () => {
  reset();
  click('[data-iask-ok="subject"]');
  click('[data-iask-ok="due"]');
  eq(S.cur.due_ymd, '2026-11-30', '★翌月末が 入っていない★');
  ok(!shown(), '★答え終わったのに 箱が残っている★（空欄を残さない）');
  console.log('     支払期限 ' + S.cur.due_ymd + '／答え終わったら 箱は消えた');
});

T('★②-c ★1問ごと 保存が 本当に走る★（最後まで行かないと保存されない、にしない）', () => {
  reset();
  saved.length = 0;
  click('[data-iask-ok="subject"]');
  ok(saved.length >= 1, '★1問目を答えても 保存が走っていない★');
  eq(saved[saved.length - 1].subject, '9月分 運転代行ご利用料金', '保存した中身が違う');
  click('[data-iask-ok="due"]');
  ok(saved.length >= 2, '★2問目で 保存が走っていない★');
  eq(saved[saved.length - 1].due, '2026-11-30', '保存した期限が違う');
  console.log('     保存 ' + saved.length + '回（1問ごと）／最後 ' + JSON.stringify(saved[saved.length - 1]));
});

T('★③ 「飛ばす」を押したら もう聞かない（空のまま 何度も聞かない）', () => {
  reset();
  click('[data-iask-skip="subject"]');
  eq(S.cur.data.subject, '', '飛ばしたのに 何か入っている');
  ok(S.cur.data.askOk.subject, '飛ばした印が 付いていない');
  ok(/いつまでに もらう約束ですか？/.test(txt()), '★飛ばしたのに まだ件名を聞いている★');
  console.log('     件名は空のまま／次の問いへ進んだ');
});

T('★④ 押した物は「細かく決める」の欄にも 同じ値（同じ画面の2つの見え方）', () => {
  reset();
  click('[data-iask-ok="subject"]');
  eq($('e-subject').value, '9月分 運転代行ご利用料金', '★聞く形と 欄が 別の値★');
  click('[data-iask-ok="due"]');
  eq($('e-due').value, '2026-11-30', '★聞く形と 欄が 別の値（期限）★');
  console.log('     e-subject「' + $('e-subject').value + '」／e-due「' + $('e-due').value + '」');
});

T('★⑤ 「なぜ？」で 根拠が出る（当てただけ、と分かる）', () => {
  reset();
  click('[data-iask-why="subject"]');
  const box = $('pask-note-box');
  ok(box && box.style.display !== 'none', '★根拠の箱が 出ない★');
  const t = box.textContent.replace(/\s+/g, ' ');
  ok(/前回（A-0009）と同じ件名/.test(t), '根拠が「' + t.slice(0, 80) + '」');
  ok(/当てただけです/.test(t), '★「当てただけ」と言っていない★');
  console.log('     ' + t.slice(0, 70) + '…');
});

T('★⑥ 別ウィザードを作っていない（画面の数が 増えていない）', () => {
  eq(doc.querySelectorAll('.screen').length, SCREENS0, '★画面が増えている＝別ウィザードを作った★');
  ok($('inv-ask-card').closest('.screen') === $('scr-edit'),
    '★聞く形が 入力の画面の外に居る★');
  console.log('     画面 ' + SCREENS0 + '枚のまま／聞く形は 入力の画面の中');
});

T('★⑦ 発行済み（触れない1通）では 出さない', () => {
  reset({ status: 'issued' });
  ok(!shown(), '★触れない1通なのに 聞いている★');
  console.log('     発行済み → 出ない');
});

/* ★対象期間★（司さん・指示役 ④の残り）＝★実際に 押して 入る所まで 見る★
   （lib が緑でも 画面につながっていなければ 客には 何も起きない） */
function withRanges() {
  reset();
  /* 出した紙 2通に 期間が入っている状態（★2通 揃わないと 当てない★決まり） */
  S.list = S.list.concat([
    { id: 'v8', partner_id: 'p1', no: 'A-0007', issue_ymd: '2026-08-05', status: 'issued',
      data: { lead: '対象期間 2026/6/21 〜 2026/7/20' }, lines: [], totals: {} },
    { id: 'v9', partner_id: 'p1', no: 'A-0008', issue_ymd: '2026-09-05', status: 'issued',
      data: { lead: '対象期間 2026/7/21 〜 2026/8/20' }, lines: [], totals: {} },
  ]);
  A._fillEdit();
}

T('★⑨ 対象期間は 出した紙から 当てて 聞く（材料が無い時は 聞かない）', () => {
  reset();
  ok(!/対象期間/.test(txt()), '★材料が無いのに 聞いている★：' + txt().slice(0, 60));
  withRanges();
  click('[data-iask-ok="subject"]');
  click('[data-iask-ok="due"]');
  ok(/対象期間は これで合っていますか？/.test(txt()), '★当てられるのに 聞いていない★：' + txt().slice(0, 80));
  /* ★請求日 10/05 は 締め日20より前★＝まだ 10/20 は締まっていない。
     ⇒ 締まったばかりは ★8/21〜9/20★（ここを 10月ぶんにすると 出していない月を 請求する）。 */
  ok(/2026\/8\/21 〜 2026\/9\/20/.test(txt()), '★当てた期間が 出ていない★：' + txt().slice(0, 120));
  console.log('     ' + txt().slice(txt().indexOf('対象期間'), txt().indexOf('対象期間') + 60) + '…');
});

T('★⑩ 「これで」を押すと 紙の頭の1行に そのまま入る（値の持ち主は 1つ）', () => {
  withRanges();
  click('[data-iask-ok="subject"]');
  click('[data-iask-ok="due"]');
  click('[data-iask-ok="period"]');
  eq(S.cur.data.lead, '2026/8/21 〜 2026/9/20', '★押しても 入っていない★');
  ok(S.cur.data.askOk && S.cur.data.askOk.period, '答えた印が 付いていない');
  /* ★同じ物を 2か所に持たない★＝編集画面の欄も 同じ値になっている */
  eq($('e-lead') ? $('e-lead').value : '(欄が無い)', '2026/8/21 〜 2026/9/20',
    '★聞く形と 編集画面の欄が 別の値★');
  console.log('     紙の頭「' + S.cur.data.lead + '」／編集画面の欄も 同じ');
});

T('★⑪ 「期間は 出さない」を押しても もう聞かない（空のまま 何度も聞かない）', () => {
  withRanges();
  click('[data-iask-ok="subject"]');
  click('[data-iask-ok="due"]');
  click('[data-iask-skip="period"]');
  eq(S.cur.data.lead, '', '飛ばしたのに 何か入っている');
  ok(S.cur.data.askOk.period, '飛ばした印が 付いていない');
  ok(!/対象期間は これで合っていますか？/.test(txt()), '★飛ばしたのに まだ同じ事を聞いている★');
});

T('★⑫ ★相手ごとに 違う期間を出す★（司さん「八木工業だけやし 代行や空調系は また違う」）', () => {
  withRanges();
  /* 2人目の相手＝★末日締め★（八木の 21〜20 とは 別の型） */
  S.partners = S.partners.concat([{ id: 'p2', data: { name: '△△空調株式会社', honor: '御中' } }]);
  S.list = S.list.concat([
    { id: 'w1', partner_id: 'p2', no: 'B-0001', issue_ymd: '2026-08-31', status: 'issued',
      data: { lead: '対象期間 2026/8/1 〜 2026/8/31' }, lines: [], totals: {} },
    { id: 'w2', partner_id: 'p2', no: 'B-0002', issue_ymd: '2026-09-30', status: 'issued',
      data: { lead: '対象期間 2026/9/1 〜 2026/9/30' }, lines: [], totals: {} },
  ]);
  /* 同じ会社のまま ★相手だけ 2人目に する★ */
  S.cur.partner_id = 'p2';
  S.cur.data = {};
  A._fillEdit();
  click('[data-iask-ok="subject"]');
  click('[data-iask-ok="due"]');
  ok(/2026\/9\/1 〜 2026\/9\/30/.test(txt()),
    '★2人目の相手に 1人目の型（21日〜20日）が 出ている★：' + txt().slice(0, 140));
  ok(!/9\/21/.test(txt()), '★よその相手の型が 混ざっている★');
  console.log('     相手p1（21〜20）→ 2026/8/21 〜 2026/9/20 ／ 相手p2（末日締め）→ 2026/9/1 〜 2026/9/30');
});

T('★⑧ ここまで JSの落ちが0', () => {
  ok(!errs.length, errs.join(' / '));
});

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと壊して 赤になるか★');
  T('★自① 答えた印を消すと また聞く（＝印が 効いている）', () => {
    reset();
    click('[data-iask-ok="subject"]');
    ok(/いつまでに/.test(txt()), '前提が崩れている');
    delete S.cur.data.askOk.subject;
    S.cur.data.subject = '';
    A._fillEdit();
    ok(/この請求書の件名は？/.test(txt()), '★印を消しても 聞き直さない＝印が 効いていない★');
  });
  T('★自② 「押すと直せます」で 聞き直せる', () => {
    reset();
    click('[data-iask-ok="subject"]');
    click('[data-iask-ok="due"]');
    ok(!shown(), '前提が崩れている');
    /* 全部 答えた後は 箱が消えるので、印を消して もう一度 出す道を 確かめる */
    A._invAskAnswer('subject', '');
    ok(S.cur.data.subject === '', '空に戻せていない');
  });
  T('★自③ 当てられない相手では 当てない（作り話をしない）', () => {
    S.partners = [{ id: 'p9', data: { name: 'はじめての相手' } }];
    S.list = [];
    S.cur = { id: 'v9', partner_id: 'p9', no: 'A-1', issue_ymd: '2026-10-05', due_ymd: '', data: {}, lines: [], totals: {}, status: 'draft' };
    A._go('scr-edit'); A._fillEdit();
    ok(shown(), '聞く形が 出ていない');
    ok(!/当てました/.test(txt()), '★材料が無いのに 当てている★：' + txt().slice(0, 60));
    console.log('     はじめての相手 → 当てずに 聞くだけ');
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
