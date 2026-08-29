/* kaisha-ask-ui.mjs — ★会社の「聞く形」を 実際に押す★（字を読むだけにしない）
 * =============================================================================
 * lib は `tests/kaisha-ask.test.mjs` が見る。ここは ★本物の画面で 押した時★:
 *   ① まだ答えていない事が在る時だけ 箱が出る／答え終われば ★自分で消える★
 *   ② 「これで」を押すと ★欄にも 入る★（★同じ画面の2つの見え方★）
 *   ③ ★1問ごと保存★（最後まで行かないと保存されない、にしない）
 *   ④ 「飛ばす」でも ★もう聞かない★
 *   ⑤ ★別ウィザードを作っていない★（画面の数が 増えていない）
 *   ⑥ 打った その場で 登録番号の形を 言う
 *
 * 使い方: node tests/kaisha-ask-ui.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])
  .map((s) => s.split('?')[0])
  .filter((s) => !/^https?:/.test(s) && !/supa-config|auth\.js/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.scrollTo = () => {};
const errs = [];
win.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e)));
win.addEventListener('unhandledrejection', (e) => errs.push('unhandledrejection: ' + ((e.reason && e.reason.message) || e.reason)));
for (const src of srcs) {
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
  doc.body.appendChild(el);
}
const H = win.__RAKUNALLY_TEST;
ok(H, '__RAKUNALLY_TEST が 出ていない');

/* ★偽の倉庫★（1問ごと保存が 本当に走ったかを 数える） */
const saved = [];
H._setSuiteData({
  org: { save: (patch) => { saved.push(patch); H.state.org = Object.assign({}, H.state.org, patch); return Promise.resolve({ ok: true, data: H.state.org }); } },
});

const $ = (id) => doc.getElementById(id);
const txt = () => ($('kaisha-ask') || {}).textContent || '';
const shown = () => $('kaisha-ask-card') && $('kaisha-ask-card').style.display !== 'none';
const click = (sel) => { const b = $('kaisha-ask').querySelector(sel); ok(b, '押す物が無い: ' + sel); b.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };

function reset() {
  H.state.org = {};
  H.state.businesses = [];
  H._fillOrg();
}

console.log('\n[kaisha-ask-ui] 会社の「聞く形」を 実際に押す');
const SCREENS0 = doc.querySelectorAll('.scr').length;

T('★① まだ答えていない時だけ 出る（1問目＝会社の名前）', () => {
  reset();
  ok(shown(), '★聞く形が 出ていない★');
  ok(/4問のうち 0問 答えました/.test(txt()), '進み具合：' + txt().slice(0, 40));
  ok(/会社（お店）の 名前は？/.test(txt()), '1問目が 違う：' + txt().slice(0, 60));
  console.log('     ' + txt().replace(/\s+/g, ' ').slice(0, 56) + '…');
});

await (async () => {
  T('★② 「これで」を押すと 欄にも 入る（同じ画面の2つの見え方）', () => {
    reset();
    $('kask-t').value = '合同会社Rakunally';
    click('[data-kask-ok="yago"]');
    eq($('org-yago').value, '合同会社Rakunally', '★押しても 欄に 入っていない★');
    eq(H.state.org.yago, '合同会社Rakunally', '★中の値に 入っていない★');
    ok(/住所は？/.test(txt()), '次の問いへ 進んでいない：' + txt().slice(0, 40));
  });

  T('★③ 1問ごと 保存が 本当に走る', () => {
    ok(saved.length >= 1, '★1問目を答えても 保存が走っていない★');
    eq(saved[saved.length - 1].yago, '合同会社Rakunally', '保存した中身が違う');
    console.log('     保存 ' + saved.length + '回（1問ごと）');
  });

  T('★④ 「あとで入れる」でも もう聞かない', () => {
    click('[data-kask-skip="addr"]');
    ok(!/住所は？/.test(txt()), '★飛ばしたのに まだ 住所を 聞いている★');
    ok(/インボイスの登録番号は？/.test(txt()), '次へ 進んでいない：' + txt().slice(0, 40));
  });

  T('★⑤ 打った その場で 登録番号の形を 言う（外に出ない）', () => {
    const el = $('kask-t');
    el.value = 'T350000300329';          // ★数字12桁＝あと1桁★
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    ok(/あと 1桁です/.test($('kask-live').textContent), '★途中で 何も言わない★：' + $('kask-live').textContent);
    el.value = 'T3500003003293';
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    ok(/形は 合っています/.test($('kask-live').textContent), '★合っていると 言わない★：' + $('kask-live').textContent);
    console.log('     ' + $('kask-live').textContent);
  });

  T('★⑥ 最後まで答えると 箱が 自分で消える', () => {
    click('[data-kask-ok="invoiceNo"]');
    eq($('org-invoice').value, 'T3500003003293', '登録番号が 欄に 入っていない');
    $('kask-t').value = '運転代行';
    click('[data-kask-ok="business"]');
    eq((H.state.businesses || [])[0], '運転代行', '★仕事が 入っていない★');
    ok(!shown(), '★答え終わったのに 箱が 残っている★');
    console.log('     4問 答えたら 消えた／事業「' + H.state.businesses[0] + '」');
  });

  T('★⑦ 別ウィザードを作っていない（画面の数が 増えていない）', () => {
    eq(doc.querySelectorAll('.scr').length, SCREENS0, '★画面が 増えている★');
    ok($('kaisha-ask-card').closest('.scr') === $('scr-data'), '★聞く形が 共有データの画面の外に 居る★');
  });

  await sleep(30);
  T('★⑧ ここまで JSの落ちが0', () => { ok(!errs.length, errs.join(' / ')); });
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
