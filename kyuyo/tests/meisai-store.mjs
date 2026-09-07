// meisai-store.mjs — Web明細の公開一覧フィルタ(必須1)＋削除時リンク失効(必須2)。ローカル(localStorage)モードで検証。
//  依存: jsdom。使い方: node tests/meisai-store.mjs (jsdom未導入なら SKIP=exit0)。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
async function T(name, fn) { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); } }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); }

// SUPA未設定=ローカル(localStorage)モードで store.js を読む
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
const win = dom.window;
const el = win.document.createElement('script'); el.textContent = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8'); win.document.body.appendChild(el);
const Store = win.Store;
function seed() {
  win.localStorage.setItem('payslip_meisai_pub_v1', JSON.stringify([
    { token: 'tA', employeeId: 'A', initCode: '1234', pwHash: 'hashA', deviceTokens: ['d1'], consentAt: '2026-06-01' },
    { token: 'tB', employeeId: 'B', initCode: '5678', pwHash: 'hashB', deviceTokens: ['d2'], consentAt: '2026-06-02' } // B=削除済みの幽霊
  ]));
  win.localStorage.setItem('payslip_meisai_docs_v1', JSON.stringify([
    { token: 'tA', ym: '2026-06', kind: 'monthly', name: 'Aさん' },
    { token: 'tB', ym: '2026-06', kind: 'monthly', name: 'Bさん' },
    /* ★別の月・別の種類も 置く★＝「その月だけ 下げる」が 本当に その月だけかを 見る為 */
    { token: 'tA', ym: '2026-07', kind: 'monthly', name: 'Aさん7月' },
    { token: 'tA', ym: '2026-06', kind: 'bonus', name: 'Aさん賞与' }
  ]));
}

console.log('\n[meisai-store] Web明細 公開一覧フィルタ＋削除時失効');
// ★共有 localStorage/Store のため必ず逐次実行(並行だと seed が競合する)。
await T('必須1: 名簿(empIds)にいる人だけ一覧に出る=削除済みの幽霊は消える', async function () {
  seed();
  const list = await Store.listMeisaiPub(['A']); // 名簿=Aのみ(B=削除済み)
  eq(list.length, 1, 'Aだけ');
  eq(list[0].employeeId, 'A', 'A');
  ok(!list.some(x => x.employeeId === 'B'), 'B(幽霊)は出ない');
});
await T('必須1: empIds未指定は全件(後方互換)', async function () {
  seed();
  const all = await Store.listMeisaiPub();
  eq(all.length, 2, '全件');
});
await T('必須1: 退職者も名簿(empIds)に残っていれば出る=消さない', async function () {
  seed();
  const list = await Store.listMeisaiPub(['A', 'B']); // AもBも名簿に居る(退職者含む想定)
  eq(list.length, 2, '名簿に居れば両方出る');
});
await T('必須2: unpublishMeisai=認証情報クリアでリンク死・docsは物理削除しない', async function () {
  seed();
  await Store.unpublishMeisai('A');
  const pubs = JSON.parse(win.localStorage.getItem('payslip_meisai_pub_v1'));
  const pa = pubs.find(p => p.employeeId === 'A');
  ok(pa, 'A行は残る(cascadeでdocsを消さないため行自体は保持)');
  ok(pa.initCode === null && pa.pwHash === null && pa.deviceTokens.length === 0 && pa.consentAt === null, 'Aの認証情報が全クリア=リンク死');
  const pb = pubs.find(p => p.employeeId === 'B');
  ok(pb && pb.pwHash === 'hashB', 'B(他人)は無傷');
  const docs = JSON.parse(win.localStorage.getItem('payslip_meisai_docs_v1'));
  ok(docs.some(d => d.token === 'tA'), '★Aのdocs(お金の記録)は物理削除されず残る');
});
await T('必須2: 空/未指定は安全に no-op', async function () {
  seed();
  const r = await Store.unpublishMeisai('');
  eq(r.ok, false, '空=ok:false');
  const pubs = JSON.parse(win.localStorage.getItem('payslip_meisai_pub_v1'));
  ok(pubs.length === 2, '何も壊さない');
});
/* ★「この月の確定を取り消す」の 中身★（2026-09-07 司さん「やって」）
   前は 確定の 確認に「あとから 月ごとに 取り消す方法は ありません」と 書いてあり、
   ★知り合いに 渡すと 練習で押した月が 永久に 従業員に 見えたまま★だった。
   ここで 見るのは ★その月だけ 下がる／リンクは 生きたまま★の2つ。 */
await T('★取り消し: その月の 明細だけ 下がる（他の月・他の人は 残る）', async function () {
  seed();
  const r = await Store.unpublishMonth('2026-06');
  eq(r.ok, true, 'ok');
  eq(r.n, 3, '2026-06 の 3件（Aの月次・Bの月次・Aの賞与）を 下げた');
  const docs = JSON.parse(win.localStorage.getItem('payslip_meisai_docs_v1'));
  ok(!docs.some(d => d.ym === '2026-06'), '★2026-06 は 1件も 残らない');
  ok(docs.some(d => d.ym === '2026-07'), '★別の月(2026-07)は 残る');
  eq(docs.length, 1, '残るのは 別の月の 1件だけ');
});
await T('★取り消し: 従業員の リンクと パスワードは そのまま（配り直さなくてよい）', async function () {
  seed();
  await Store.unpublishMonth('2026-06');
  const pubs = JSON.parse(win.localStorage.getItem('payslip_meisai_pub_v1'));
  eq(pubs.length, 2, '公開の入口は 2件のまま');
  const pa = pubs.find(p => p.employeeId === 'A');
  ok(pa && pa.pwHash === 'hashA' && pa.deviceTokens.length === 1, '★Aの パスワードも 端末も 無傷');
});
await T('★取り消し: 種類を 指せば その種類だけ（賞与だけ 下げる）', async function () {
  seed();
  const r = await Store.unpublishMonth('2026-06', 'bonus');
  eq(r.n, 1, '賞与 1件だけ');
  const docs = JSON.parse(win.localStorage.getItem('payslip_meisai_docs_v1'));
  ok(docs.some(d => d.ym === '2026-06' && d.kind === 'monthly'), '★同じ月の 月次は 残る');
});
await T('★取り消し: 月を 指さなければ 何も しない（黙って 全部 消さない）', async function () {
  seed();
  const r = await Store.unpublishMonth('');
  eq(r.ok, false, '空=ok:false');
  const docs = JSON.parse(win.localStorage.getItem('payslip_meisai_docs_v1'));
  eq(docs.length, 4, '★1件も 消えていない');
});
await T('★取り消し: 無い月を 指しても 壊れない（0件と 言う）', async function () {
  seed();
  const r = await Store.unpublishMonth('1999-01');
  eq(r.ok, true, 'ok');
  eq(r.n, 0, '0件');
  const docs = JSON.parse(win.localStorage.getItem('payslip_meisai_docs_v1'));
  eq(docs.length, 4, '何も 消えていない');
});
/* ★アプリの 言う事が 食い違っていないか★（同じ画面で 逆の事を 言わない）
   ＝「取り消す方法は ありません」は もう 嘘なので 残っていては いけない。 */
await T('★アプリの中に「取り消す方法はありません」が 残っていない（言う事を 揃える）', async function () {
  /* ★お客さんに 出る 字だけを 見る★＝コメントの 中の 引用を 拾わない。
     （2026-09-07 に 私が 踏んだ＝直した経緯を コメントに 書いたら 自分の 見張りに 捕まった。
       ★探す字を 決めた時点で 答えが 決まる★の 型＝字だけで 探すと コメントを 拾う。） */
  const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')          /* 段のコメントを 落とす */
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
  ok(!/取り消す方法はありません/.test(src), '★古い 文が 残っている＝同じアプリで 逆の事を 言う');
  ok(/この月の確定を取り消す/.test(src), '★取り消しの 道が 無い');
  ok(/data-undo-month/.test(src), '★取り消しの ボタンが 無い');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
