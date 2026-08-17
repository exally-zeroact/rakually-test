/* live-roundtrip.mjs — ★実機往復テスト★ 本物のSupabase(倉庫Exally)に本物のログインで往復する
 *   node tests/live-roundtrip.mjs
 *
 * 目的: 偽クライアントで緑でも「実DB＋実RLS＋実PostgREST」で通るとは限らない。
 *       DDL適用後の実棚に対して、E0の契約(docs/SPEC_shared_schema.md v2)が本当に成り立つかを確認する。
 *
 * ★安全★
 *   - 触るのは「このテスト専用アカウント」の行だけ(RLSで他アカウントには物理的に手が届かない)。
 *   - 司さんの本番データ(pay_employees/pay_companies の実データ)には一切触らない。
 *   - 作った行は最後に自分で片付ける(何を作って何を消したかは全部出力する)。
 *   - 認証情報は tests/ に置かない(scratchpadのローカル一時ファイル)。
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const SuiteData = require('../js/suite-data.js');

// ★接続先は【このリポジトリの js/supa-config.js】から取る(直書きをやめた・2026-08-01)★
//   直書きだと、本番からスナップショットを持ってきたテストリポジトリで走らせた時に
//   本番倉庫を触ってしまう。リポジトリ由来にすれば 本番repo→本番 / stagingのrepo→DB-test にしかならない。
import { repoSupa } from './repo-supa.mjs';
const { url: URL, key: ANON } = repoSupa();
console.log('接続先(このリポジトリの js/supa-config.js 由来): ' + URL);
const CRED_FILE = process.env.EXALLY_TEST_CRED || path.join(process.env.TEMP || '/tmp', 'exally-e0-test-cred.json');
// ★このメール以外のアカウントでは絶対に走らせない（本番データを消さない最後の砦）
const TEST_EMAIL = 'exally.supoort+e0test@gmail.com';

let pass = 0, fail = 0;
const created = { employees: [], companies: [], org: [], partners: [], ledger: [], entitlements: [] };
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  NG   ' + name + (detail ? '\n       ' + detail : '')); }
}

async function login() {
  const sb = createClient(URL, ANON);
  let cred = null;
  try { cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8')); } catch {}
  if (cred) {
    const { data, error } = await sb.auth.signInWithPassword({ email: cred.email, password: cred.password });
    if (!error && data.session) { console.log('既存のテストアカウントでログイン: ' + cred.email); return { sb, email: cred.email, uid: data.user.id }; }
    console.log('既存の認証情報で入れませんでした（作り直します）: ' + (error && error.message));
  }
  // 新規作成(テスト専用)。★司さんの受信箱に届く plus エイリアス＝素性が分かる形にする★
  const email = TEST_EMAIL;
  const password = 'E0test-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error || !data.session) {
    // 既にそのメールで登録済み＝パスワードが分からない → 司さん手番
    throw new Error('テストアカウントを用意できません: ' + ((error && error.message) || 'セッションが返らない(メール確認が必要な設定)') +
      '\n  → 司さんへ: ' + email + ' のパスワードを教えてもらうか、別のテスト用ログインを作ってください。');
  }
  fs.writeFileSync(CRED_FILE, JSON.stringify({ email, password }, null, 2));
  console.log('テストアカウントを新規作成: ' + email + '（認証情報は ' + CRED_FILE + ' に保存・リポジトリ外）');
  return { sb, email, uid: data.user.id };
}

const run = async () => {
  const { sb, email, uid } = await login();
  const sd = SuiteData.create({ client: sb });
  console.log('account_id = ' + uid + '\n');

  /* ═══ 0. 安全確認 → 前回の残骸を掃除（テスト専用アカウントのみ） ═══ */
  // ★これがテスト専用アカウントである事をメールで確認してから掃除する。
  //   本番アカウントで走らせたら何も消さずに即中止する（司さんのデータを消さない最後の砦）。
  if (email !== TEST_EMAIL) {
    console.log('\n★中止: テスト専用アカウント(' + TEST_EMAIL + ')以外では走らせません。今のログイン: ' + email);
    process.exit(1);
  }
  // 前回が途中で落ちた等の残骸を掃除して、毎回同じ前提から始める（何度実行しても同じ結果になる）
  for (const t of ['pay_ledger', 'pay_partners', 'pay_employees', 'pay_companies', 'pay_org']) {
    await sb.from(t).delete().eq('account_id', uid);
  }
  const pre = await sb.from('pay_employees').select('id');
  ok('0. テスト専用アカウントで、開始時点は空（本番データに触っていない）', (pre.data || []).length === 0,
    '従業員が ' + (pre.data || []).length + ' 件見えた');

  /* ═══ 1. 利用権 ═══ */
  // ★exally_entitlements は authenticated に delete 権限が無い（既存テーブル・触らない方針）＝後片付けで消せない。
  //   そのため「初回作成」の検証は行が無い実行の時だけ。飛ばした時は緑と偽らず、飛ばしたと出す。
  const preEnt = await sb.from('exally_entitlements').select('plan').eq('account_id', uid).eq('app', 'suite').maybeSingle();
  const firstRun = !preEnt.data;
  const e1 = await sd.entitlements.ensure('suite');
  created.entitlements.push('suite');
  if (firstRun) ok('1. entitlements.ensure で trial が1行できる', e1 && e1.plan === 'trial' && e1.existed === false, JSON.stringify(e1));
  else console.log('  skip 1. 初回作成の検証（前回実行の行が残っており消せないため）。初回実行時に確認済み');
  const e2 = await sd.entitlements.ensure('suite');
  ok('1. 2回目は作らない（既存を返す）', e2 && e2.existed === true, JSON.stringify(e2));
  const g1 = await sd.entitlements.get('suite');
  ok('1. get で plan が読める', g1 && g1.plan === 'trial', JSON.stringify(g1));

  /* ═══ 2. 自社情報 pay_org ═══ */
  ok('2. 未作成なら null（空を捏造しない）', (await sd.org.get()) === null);
  const o1 = await sd.org.save({ yago: 'ゼロアクト', addr: '愛媛県今治市' });
  created.org.push(uid);
  ok('2. org.save が実DBに通る', o1 && o1.ok === true, JSON.stringify(o1));
  await sd.org.save({ invoiceNo: 'T1234567890123' });
  const org = await sd.org.get();
  ok('2. 差分マージ（既存キーが消えない）', org && org.yago === 'ゼロアクト' && org.addr === '愛媛県今治市' && org.invoiceNo === 'T1234567890123', JSON.stringify(org));

  /* ═══ 3. 取引先 pay_partners ═══ */
  const p1 = await sd.partners.upsert({ sort: 5, data: { name: 'A社', keisho: '御中' } });
  const p2 = await sd.partners.upsert({ sort: 1, data: { name: 'B社' } });
  created.partners.push(p1.id, p2.id);
  ok('3. 取引先を2件追加できる', p1.ok && p2.ok, JSON.stringify([p1, p2]));
  let plist = await sd.partners.list();
  ok('3. sort順に並ぶ', plist.map(x => x.data.name).join(',') === 'B社,A社', JSON.stringify(plist.map(x => x.data.name)));
  await sd.partners.upsert({ id: p1.id, data: { name: 'A社(改名)' } });      // sort を渡さない
  plist = await sd.partners.list();
  ok('3. sortを渡さない更新でも並び順が壊れない', plist.map(x => x.data.name).join(',') === 'B社,A社(改名)', JSON.stringify(plist.map(x => x.data.name)));
  await sd.partners.remove(p2.id);
  plist = await sd.partners.list();
  const p2raw = await sb.from('pay_partners').select('id,deleted_at').eq('id', p2.id).maybeSingle();
  ok('3. ソフト削除で一覧から消える', plist.length === 1 && plist[0].id === p1.id, JSON.stringify(plist.map(x => x.id)));
  ok('3. 物理削除はされていない（deleted_atが入る）', !!(p2raw.data && p2raw.data.deleted_at), JSON.stringify(p2raw.data));

  /* ═══ 4. 日次台帳 pay_ledger ═══ */
  const l1 = await sd.ledger.upsert({ employeeId: 'e_test1', ymd: '2026-07-01', data: { uriage: 4200, business: '代行' } });
  const l2 = await sd.ledger.upsert({ employeeId: 'e_test1', ymd: '2026-07-01', data: { uriage: 3800, business: '代行' } });
  const l3 = await sd.ledger.upsert({ employeeId: 'e_test1', ymd: '2026-07-11', data: { uriage: 1000 } });
  const l4 = await sd.ledger.upsert({ employeeId: 'e_test2', ymd: '2026-07-05', data: { uriage: 500 } });
  created.ledger.push(l1.id, l2.id, l3.id, l4.id);
  ok('4. 同じ人・同じ日に2行入る（1日に何本も＝代行の実態）', l1.ok && l2.ok && l1.id !== l2.id, JSON.stringify([l1, l2]));
  // 1人分の期間締め（＝Kyuallyへ渡す支給額の元）。人を絞らないと他の人の行も入るのが正しい挙動。
  const per1 = await sd.ledger.list({ from: '2026-07-01', to: '2026-07-10', employeeId: 'e_test1' });
  ok('4. 1〜10日で締めると その人だけで 8000円', per1.length === 2 && per1.reduce((s, r) => s + r.data.uriage, 0) === 8000,
    JSON.stringify(per1.map(r => [r.ymd, r.data.uriage])));
  // 人を絞らなければ全員ぶん返る（期間だけの絞り込み＝横断集計の元）
  const per1all = await sd.ledger.list({ from: '2026-07-01', to: '2026-07-10' });
  ok('4. 人を絞らなければ全員ぶん返る（横断集計の元）', per1all.length === 3 && per1all.reduce((s, r) => s + r.data.uriage, 0) === 8500,
    JSON.stringify(per1all.map(r => [r.employeeId, r.ymd, r.data.uriage])));
  const per2 = await sd.ledger.list({ from: '2026-07-01', to: '2026-07-31', employeeId: 'e_test2' });
  ok('4. 従業員で絞れる', per2.length === 1 && per2[0].data.uriage === 500, JSON.stringify(per2));
  await sd.ledger.upsert({ id: l3.id, employeeId: 'e_test1', ymd: '2026-07-11', data: { uriage: 2500 } });
  const per3 = await sd.ledger.list({ from: '2026-07-11', to: '2026-07-20' });
  ok('4. 同じidで直すと重複せず更新される', per3.length === 1 && per3[0].data.uriage === 2500, JSON.stringify(per3.map(r => [r.id, r.data.uriage])));
  await sd.ledger.remove(l4.id);
  const per4 = await sd.ledger.list({ from: '2026-07-01', to: '2026-07-31' });
  const l4raw = await sb.from('pay_ledger').select('id,deleted_at').eq('id', l4.id).maybeSingle();
  ok('4. ソフト削除で集計から外れる', per4.every(r => r.id !== l4.id), JSON.stringify(per4.map(r => r.id)));
  ok('4. 台帳は物理削除されない（お金の記録）', !!(l4raw.data && l4raw.data.deleted_at), JSON.stringify(l4raw.data));

  /* ═══ 5. 従業員マスタ（Kyually形の行を作って allowlist / read-modify-write を実DBで） ═══ */
  const kyuallyEmp = {
    id: 'e_test1', name: 'テスト 太郎', birthYmd: '1980-05-15', dept: '営業部', role: '一般',
    payType: '月給', base: '250000', fuyou: '1', pref: 'tokyo',
    shikyu: [{ label: '基本給', value: '250000' }], apply: { kenko: true }, taxClass: 'ko'
  };
  const insEmp = await sb.from('pay_employees').upsert({ id: 'e_test1', account_id: uid, sort: 0, data: kyuallyEmp, updated_at: new Date().toISOString() });
  created.employees.push('e_test1');
  ok('5. テスト用の従業員(Kyually形)を用意できた', !insEmp.error, JSON.stringify(insEmp.error));

  let threw = null;
  try { await sd.employees.patch('e_test1', { base: '999999' }); } catch (e) { threw = e.message; }
  ok('5. 給与キー(base)は実DBに書けない（allowlistで止まる）', !!threw && /base/.test(threw), String(threw));
  const empAfterReject = await sb.from('pay_employees').select('data').eq('id', 'e_test1').maybeSingle();
  ok('5. 弾かれた時にDBの値が変わっていない', empAfterReject.data.data.base === '250000', empAfterReject.data.data.base);

  const pr = await sd.employees.patch('e_test1', { employmentType: '業務委託', business: '代行' });
  ok('5. employmentType / business は書ける', pr && pr.ok === true, JSON.stringify(pr));
  const empRow = (await sb.from('pay_employees').select('sort,data').eq('id', 'e_test1').maybeSingle()).data;
  const lostKeys = Object.keys(kyuallyEmp).filter(k => JSON.stringify(empRow.data[k]) !== JSON.stringify(kyuallyEmp[k]));
  ok('5. Kyuallyの給与キーが1つも消えていない（read-modify-write）', lostKeys.length === 0, '消えた/変わったキー: ' + lostKeys.join(','));
  ok('5. sort が保持されている', empRow.sort === 0, String(empRow.sort));
  ok('5. 追加した2キーが実DBに入っている', empRow.data.employmentType === '業務委託' && empRow.data.business === '代行', JSON.stringify([empRow.data.employmentType, empRow.data.business]));
  const list = await sd.employees.list();
  ok('5. list で読める', list.length === 1 && list[0].employmentType === '業務委託' && list[0].business === '代行', JSON.stringify(list.map(e => [e.id, e.employmentType, e.business])));

  /* ═══ 6. §2-2 pay_companies.updated_at の空更新 ═══ */
  const coData = { company: { name: 'テスト会社' }, confirmed: { '2026-06': true } };
  await sb.from('pay_companies').upsert({ account_id: uid, data: coData, updated_at: new Date().toISOString() });
  created.companies.push(uid);
  const coBefore = (await sb.from('pay_companies').select('data,updated_at').eq('account_id', uid).maybeSingle()).data;
  await new Promise(r => setTimeout(r, 1100));
  await sd.employees.patch('e_test1', { business: '空調' });
  const coAfter = (await sb.from('pay_companies').select('data,updated_at').eq('account_id', uid).maybeSingle()).data;
  ok('6. 従業員更新で pay_companies.updated_at が進む（Kyuallyの競合検知が発火する）',
    coAfter.updated_at !== coBefore.updated_at, coBefore.updated_at + ' → ' + coAfter.updated_at);
  ok('6. pay_companies.data には一切触っていない',
    JSON.stringify(coAfter.data) === JSON.stringify(coData), JSON.stringify(coAfter.data));

  /* ═══ 7. ★§10-A(b) Kyuallyの楽観ロックの疑いを実DBで検証★ ═══ */
  const jsIso = new Date().toISOString();                       // Kyuallyが store.js:104 で基準にする形
  await sb.from('pay_companies').upsert({ account_id: uid, data: coData, updated_at: jsIso });
  const readBack = (await sb.from('pay_companies').select('updated_at').eq('account_id', uid).maybeSingle()).data.updated_at;
  const identical = readBack === jsIso;                          // store.js:83 がやっている比較そのもの
  console.log('\n  ── Kyually 楽観ロックの実測 ──');
  console.log('    JSが送って基準に持つ形 : ' + jsIso);
  console.log('    DBから読み返される形   : ' + readBack);
  console.log('    store.js:83 の比較結果 : ' + (identical ? '一致（誤発火しない）' : '不一致 → conflict と判定される'));
  ok('7. 【判定】Kyuallyは自分が書いた値を読み返しても一致しない＝2回目以降の保存が毎回 conflict',
    identical === false, '一致してしまった＝この疑いは外れ（良いこと）');

  /* ═══ 後片付け ═══ */
  console.log('\n  ── 後片付け（このテストアカウントの行だけ） ──');
  for (const id of created.ledger) await sb.from('pay_ledger').delete().eq('id', id);
  for (const id of created.partners) await sb.from('pay_partners').delete().eq('id', id);
  for (const id of created.employees) await sb.from('pay_employees').delete().eq('id', id);
  await sb.from('pay_companies').delete().eq('account_id', uid);
  await sb.from('pay_org').delete().eq('account_id', uid);
  const left = {
    ledger: (await sb.from('pay_ledger').select('id')).data?.length,
    partners: (await sb.from('pay_partners').select('id')).data?.length,
    employees: (await sb.from('pay_employees').select('id')).data?.length,
    companies: (await sb.from('pay_companies').select('account_id')).data?.length,
    org: (await sb.from('pay_org').select('account_id')).data?.length,
    entitlements: (await sb.from('exally_entitlements').select('app')).data?.length
  };
  console.log('    削除後にこのアカウントに残る行: ' + JSON.stringify(left));
  console.log('    ※ exally_entitlements(suite/trial) は authenticated に delete 権限が無いため残ります（1行・plan=trial）');
  console.log('    ※ auth ユーザー ' + email + ' は残します（次回の実機テストで再利用するため）');

  console.log('\n実機往復: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
};

run().catch(e => { console.error('\n★実行できませんでした:\n' + (e && e.message)); process.exit(2); });
