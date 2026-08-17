/* suite-data.test.js — 共有データ層(E0)の契約テスト
 * 契約の一次情報 = docs/SPEC_shared_schema.md v2
 * ここで守らせる事:
 *   §2-1 Exallyが従業員dataに書けるキーは allowlist のみ・"_"始まり禁止・read-modify-write
 *   §2-2 従業員を更新したら pay_companies.updated_at を空更新(dataは触らない)
 *   §3   自社情報は pay_org(pay_companies に書かない)
 *   §4/§5 ソフト削除・人×日付は複数行OK
 *   §6-2 Exally は pay_payslips に書かない(法定帳簿を壊さない)
 *   RLS  他アカウントの行は見えない・書けない
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createFakeSupa } = require('./fake-supa.js');
const SuiteData = require('../js/suite-data.js');

const T = [];
function test(name, fn) { T.push({ name, fn }); }
const ROOT = path.join(__dirname, '..');

// テスト用の実データ相当: Kyuallyが保存した従業員1人(給与キーが詰まっている)
function kyuallyEmp(id, name) {
  return {
    id, name, no: '', birthYmd: '1980-05-15', dept: '営業部', role: '一般',
    payType: '月給', base: '250000', hourly: '1200', fuyou: '1', pref: 'tokyo',
    commute: '8400', residentTax: '12500',
    shikyu: [{ label: '基本給', value: '250000' }, { label: '住宅手当', value: '10000' }],
    kintai: [{ label: '出勤日数', value: '21' }],
    apply: { kenko: true, kosei: true }, taxClass: 'ko',
    shaho: { mode: 'auto', months: [{ pay: '', days: '30' }], mikomi: '', manual: '' }
  };
}
function setup(over) {
  over = over || {};
  const tables = {
    pay_employees: [
      { id: 'e1', account_id: 'u1', sort: 0, data: kyuallyEmp('e1', '山田 太郎'), updated_at: '2026-07-01T00:00:00.000Z' },
      { id: 'e2', account_id: 'u1', sort: 1, data: kyuallyEmp('e2', '鈴木 花子'), updated_at: '2026-07-01T00:00:00.000Z' },
      { id: 'x9', account_id: 'u2', sort: 0, data: kyuallyEmp('x9', '他人 太郎'), updated_at: '2026-07-01T00:00:00.000Z' }
    ],
    pay_companies: [
      { account_id: 'u1', data: { company: { name: '株式会社 ゼロアクト' }, confirmed: { '2026-06': true }, nencho: { 2026: {} } }, updated_at: '2026-07-01T00:00:00.000Z' }
    ],
    pay_org: [], pay_partners: [], pay_ledger: [], exally_entitlements: [],
    ...over
  };
  const sb = createFakeSupa({ uid: 'u1', tables, pk: { pay_companies: 'account_id', pay_org: 'account_id', exally_entitlements: ['account_id', 'app'] } });
  const sd = SuiteData.create({ client: sb, newId: (p) => p + '_fixed' + (tables[p === 'lg' ? 'pay_ledger' : 'pay_partners'].length + 1) });
  return { sb, sd, tables };
}

/* ═══ §2-1 従業員dataのキー空間 ═══ */

test('§2-1 allowlist外のキーは書けない(Kyuallyの給与キーを壊さない)', async () => {
  const { sd } = setup();
  await assert.rejects(() => sd.employees.patch('e1', { base: '999999' }), /base/);
  await assert.rejects(() => sd.employees.patch('e1', { shikyu: [] }), /shikyu/);
  await assert.rejects(() => sd.employees.patch('e1', { name: '改名' }), /name/);
});

test('§2-1 "_"始まりのキーは書けない(Kyuallyの保存で静かに消えるため)', async () => {
  const { sd } = setup();
  await assert.rejects(() => sd.employees.patch('e1', { _tmp: 1 }), /_tmp/);
});

test('§2-1 allowlistのキーは書ける', async () => {
  const { sd, tables } = setup();
  const r = await sd.employees.patch('e1', { employmentType: '業務委託', business: '代行' });
  assert.strictEqual(r.ok, true);
  const row = tables.pay_employees.find(x => x.id === 'e1');
  assert.strictEqual(row.data.employmentType, '業務委託');
  assert.strictEqual(row.data.business, '代行');
});

test('§2-1 read-modify-write: Kyuallyの既存キーが1つも消えない', async () => {
  const { sd, tables } = setup();
  const before = JSON.parse(JSON.stringify(tables.pay_employees.find(x => x.id === 'e1').data));
  await sd.employees.patch('e1', { employmentType: '業務委託' });
  const after = tables.pay_employees.find(x => x.id === 'e1').data;
  Object.keys(before).forEach(k => {
    assert.deepStrictEqual(after[k], before[k], 'キー ' + k + ' が変わった/消えた');
  });
  assert.strictEqual(tables.pay_employees.find(x => x.id === 'e1').sort, 0, 'sort が保持されていない');
});

test('§2-1 存在しない従業員のpatchは失敗を返す(黙って新規作成しない)', async () => {
  const { sd } = setup();
  const r = await sd.employees.patch('nope', { business: '空調' });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /not-found/);
});

test('§2 employmentType未設定の既存従業員は「従業員」として読める(既定値)', async () => {
  const { sd } = setup();
  const list = await sd.employees.list();
  assert.strictEqual(list.length, 2, '自分のアカウントの2人だけ');
  assert.strictEqual(list[0].employmentType, '従業員');
  assert.strictEqual(list[0].business, '');
  assert.strictEqual(list[0].name, '山田 太郎');
});

test('§2 employmentTypeは既定値を「保存」しない(未設定のまま=Kyuallyの行を触らない)', async () => {
  const { sd, tables } = setup();
  const upd = tables.pay_employees.find(x => x.id === 'e1').updated_at;
  await sd.employees.list();
  assert.strictEqual(tables.pay_employees.find(x => x.id === 'e1').updated_at, upd, 'listが行を書き換えた');
  assert.strictEqual('employmentType' in tables.pay_employees.find(x => x.id === 'e1').data, false);
});

/* ═══ §2-2 pay_companies の updated_at 空更新 ═══ */

test('§2-2 従業員patchで pay_companies.updated_at が進む(Kyuallyの競合検知が発火する)', async () => {
  const { sd, tables } = setup();
  const before = tables.pay_companies[0].updated_at;
  await sd.employees.patch('e1', { business: '代行' });
  const after = tables.pay_companies[0].updated_at;
  assert.notStrictEqual(after, before, 'updated_at が進んでいない=Kyuallyが静かに巻き戻す');
  assert.ok(after > before);
});

test('§2-2 pay_companies.data には一切触らない', async () => {
  const { sd, tables } = setup();
  const before = JSON.parse(JSON.stringify(tables.pay_companies[0].data));
  await sd.employees.patch('e1', { business: '代行' });
  assert.deepStrictEqual(tables.pay_companies[0].data, before, 'Kyuallyの設定を壊した');
});

test('§2-2 pay_companies 行が無いアカウントでもエラーにならない', async () => {
  const { sd, tables } = setup({ pay_companies: [] });
  const r = await sd.employees.patch('e1', { business: '代行' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(tables.pay_companies.length, 0, '勝手に pay_companies を作った');
});

/* ═══ 締め方は Kyually の会社設定を「読むだけ」(E2) ═══ */

test('E2 締め方: Kyuallyの会社設定から読める', async () => {
  const { sd, tables } = setup();
  tables.pay_companies[0].data.company = { name: 'テスト', shimeMethod: 'ten', shimeN: '10' };
  const s = await sd.company.getShime();
  assert.deepStrictEqual(s, { method: 'ten', n: 10, fromKyually: true });
});

test('E2 締め方: 任意N日のNも読める', async () => {
  const { sd, tables } = setup();
  tables.pay_companies[0].data.company = { shimeMethod: 'ndays', shimeN: '7' };
  const s = await sd.company.getShime();
  assert.strictEqual(s.method, 'ndays');
  assert.strictEqual(s.n, 7);
});

test('E2 締め方: 未設定/行なしは月まとめ(分割なし)として返す', async () => {
  const a = setup();
  assert.deepStrictEqual(await a.sd.company.getShime(), { method: 'monthly', n: 10, fromKyually: false });
  const b = setup({ pay_companies: [] });
  assert.deepStrictEqual(await b.sd.company.getShime(), { method: 'monthly', n: 10, fromKyually: false });
});

test('E2 締め方: 知らない値は月まとめに倒す(勝手な期間を作らない)', async () => {
  const { sd, tables } = setup();
  tables.pay_companies[0].data.company = { shimeMethod: 'weekly' };
  assert.strictEqual((await sd.company.getShime()).method, 'monthly');
});

test('E2 締め方: 読むだけで pay_companies を書き換えない', async () => {
  const { sd, tables } = setup();
  const before = JSON.stringify(tables.pay_companies[0]);
  await sd.company.getShime();
  assert.strictEqual(JSON.stringify(tables.pay_companies[0]), before, '読むだけのはずが書き換えた');
});

/* ═══ §3 自社情報 = pay_org ═══ */

test('§3 org.save は pay_org に書く(pay_companies には絶対に書かない)', async () => {
  const { sd, tables } = setup();
  const coBefore = JSON.parse(JSON.stringify(tables.pay_companies[0]));
  await sd.org.save({ yago: 'ゼロアクト', invoiceNo: 'T1234567890123' });
  assert.strictEqual(tables.pay_org.length, 1);
  assert.strictEqual(tables.pay_org[0].data.yago, 'ゼロアクト');
  assert.deepStrictEqual(tables.pay_companies[0], coBefore, 'pay_companies を触った');
});

test('§3 org.save は差分マージ(既存キーを消さない)', async () => {
  const { sd, tables } = setup();
  await sd.org.save({ yago: 'ゼロアクト', addr: '愛媛県今治市' });
  await sd.org.save({ invoiceNo: 'T1234567890123' });
  const d = tables.pay_org[0].data;
  assert.strictEqual(d.yago, 'ゼロアクト');
  assert.strictEqual(d.addr, '愛媛県今治市');
  assert.strictEqual(d.invoiceNo, 'T1234567890123');
});

test('§3 org.get は未作成なら null(空オブジェクトを捏造しない)', async () => {
  const { sd } = setup();
  assert.strictEqual(await sd.org.get(), null);
});

/* ═══ §4 取引先 ═══ */

test('§4 partners: 追加・sort順・ソフト削除で一覧から消える', async () => {
  const { sd, tables } = setup();
  await sd.partners.upsert({ id: 'pt_b', sort: 2, data: { name: 'B社' } });
  await sd.partners.upsert({ id: 'pt_a', sort: 1, data: { name: 'A社' } });
  let list = await sd.partners.list();
  assert.deepStrictEqual(list.map(p => p.data.name), ['A社', 'B社']);
  await sd.partners.remove('pt_a');
  list = await sd.partners.list();
  assert.deepStrictEqual(list.map(p => p.data.name), ['B社']);
  assert.strictEqual(tables.pay_partners.length, 2, 'ソフト削除なのに物理削除された');
  assert.ok(tables.pay_partners.find(p => p.id === 'pt_a').deleted_at, 'deleted_at が入っていない');
});

/* ═══ §5 日次台帳 ═══ */

test('§5 ledger: 同じ人・同じ日に複数行を入れられる(1日に何本も=代行の実態)', async () => {
  const { sd } = setup();
  await sd.ledger.upsert({ employeeId: 'e1', ymd: '2026-07-01', data: { uriage: 4200 } });
  await sd.ledger.upsert({ employeeId: 'e1', ymd: '2026-07-01', data: { uriage: 3800 } });
  const rows = await sd.ledger.list({ from: '2026-07-01', to: '2026-07-01' });
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows.reduce((s, r) => s + r.data.uriage, 0), 8000);
});

test('§5 ledger: 期間で絞れる(境界を含む)', async () => {
  const { sd } = setup();
  for (const d of ['2026-06-30', '2026-07-01', '2026-07-10', '2026-07-11']) {
    await sd.ledger.upsert({ employeeId: 'e1', ymd: d, data: { uriage: 1000 } });
  }
  const rows = await sd.ledger.list({ from: '2026-07-01', to: '2026-07-10' });
  assert.deepStrictEqual(rows.map(r => r.ymd), ['2026-07-01', '2026-07-10']);
});

// ★実機テストで暴かれた盲点: 台帳に「他の人の行」が居る状態で期間だけ絞ったらどうなるか。
//   人を絞らない=全員ぶん(横断集計の元)、人を絞る=その人の期間締め(Kyuallyへ渡す支給額の元)。
test('§5 ledger: 複数人が居る時 期間だけの絞り込みは全員ぶん・人を絞れば1人ぶん', async () => {
  const { sd } = setup();
  await sd.ledger.upsert({ employeeId: 'e1', ymd: '2026-07-01', data: { uriage: 4200 } });
  await sd.ledger.upsert({ employeeId: 'e1', ymd: '2026-07-01', data: { uriage: 3800 } });
  await sd.ledger.upsert({ employeeId: 'e2', ymd: '2026-07-05', data: { uriage: 500 } });
  const all = await sd.ledger.list({ from: '2026-07-01', to: '2026-07-10' });
  assert.strictEqual(all.length, 3);
  assert.strictEqual(all.reduce((s, r) => s + r.data.uriage, 0), 8500, '横断集計は全員ぶん');
  const mine = await sd.ledger.list({ from: '2026-07-01', to: '2026-07-10', employeeId: 'e1' });
  assert.strictEqual(mine.length, 2);
  assert.strictEqual(mine.reduce((s, r) => s + r.data.uriage, 0), 8000, '1人の期間締めは その人だけ');
});

test('§5 ledger: 従業員で絞れる', async () => {
  const { sd } = setup();
  await sd.ledger.upsert({ employeeId: 'e1', ymd: '2026-07-01', data: { uriage: 100 } });
  await sd.ledger.upsert({ employeeId: 'e2', ymd: '2026-07-01', data: { uriage: 200 } });
  const rows = await sd.ledger.list({ from: '2026-07-01', to: '2026-07-31', employeeId: 'e2' });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].data.uriage, 200);
});

test('§5 ledger: ソフト削除(お金の記録を物理削除しない)', async () => {
  const { sd, tables } = setup();
  const r = await sd.ledger.upsert({ employeeId: 'e1', ymd: '2026-07-01', data: { uriage: 100 } });
  await sd.ledger.remove(r.id);
  assert.strictEqual((await sd.ledger.list({ from: '2026-07-01', to: '2026-07-31' })).length, 0);
  assert.strictEqual(tables.pay_ledger.length, 1, '物理削除された');
  assert.ok(tables.pay_ledger[0].deleted_at);
});

test('§5 ledger: 不正な入力は書かずに弾く(捏造・壊れた行を残さない)', async () => {
  const { sd, tables } = setup();
  await assert.rejects(() => sd.ledger.upsert({ ymd: '2026-07-01', data: {} }), /employeeId/);
  await assert.rejects(() => sd.ledger.upsert({ employeeId: 'e1', data: {} }), /ymd/);
  await assert.rejects(() => sd.ledger.upsert({ employeeId: 'e1', ymd: '2026/07/01', data: {} }), /ymd/);
  await assert.rejects(() => sd.ledger.upsert({ employeeId: 'e1', ymd: '2026-13-01', data: {} }), /ymd/);
  assert.strictEqual(tables.pay_ledger.length, 0);
});

test('§5 ledger: 既存idを渡すと更新(重複行を作らない)', async () => {
  const { sd, tables } = setup();
  const r = await sd.ledger.upsert({ employeeId: 'e1', ymd: '2026-07-01', data: { uriage: 100 } });
  await sd.ledger.upsert({ id: r.id, employeeId: 'e1', ymd: '2026-07-01', data: { uriage: 250 } });
  assert.strictEqual(tables.pay_ledger.length, 1);
  assert.strictEqual(tables.pay_ledger[0].data.uriage, 250);
});

/* ═══ 対立監査で見つけた穴(再発防止) ═══ */

test('監査: 台帳が件数上限を超えても、全ページ取り切って1件も落とさない', async () => {
  // ★以前は「上限で切れたら失敗させ、期間を短く区切らせる」設計だったが、最適解＝全件ページング。
  //   サーバ上限(maxRows)がページ幅より小さくても、実受信数で offset を進めて取りこぼさない。
  const tables = { pay_employees: [], pay_companies: [], pay_org: [], pay_partners: [], pay_ledger: [], exally_entitlements: [] };
  for (let i = 1; i <= 12; i++) {
    tables.pay_ledger.push({ id: 'lg' + i, account_id: 'u1', employee_id: 'e1', ymd: '2026-07-' + ('0' + i).slice(-2), data: { uriage: 1000 }, deleted_at: null });
  }
  const sb = createFakeSupa({ uid: 'u1', tables, maxRows: 10 });   // 1応答=最大10件しか返らない状況
  const sd = SuiteData.create({ client: sb });
  const rows = await sd.ledger.list({ from: '2026-07-01', to: '2026-07-31' });
  assert.strictEqual(rows.length, 12, '上限10で頭打ち＝ページングが効いていない');
  assert.strictEqual(rows[11].id, 'lg12', '最後の1件まで取れている');
});

test('監査: 従業員/取引先も件数上限を超えて全件読む(ページング)', async () => {
  const tables = { pay_employees: [], pay_companies: [], pay_org: [], pay_partners: [], pay_ledger: [], exally_entitlements: [] };
  for (let i = 1; i <= 25; i++) {
    tables.pay_employees.push({ id: 'e' + i, account_id: 'u1', sort: i, data: { name: '従業員' + i }, updated_at: '2026-07-01T00:00:00Z' });
    tables.pay_partners.push({ id: 'pt' + i, account_id: 'u1', sort: i, data: { name: '取引先' + i }, deleted_at: null, updated_at: '2026-07-01T00:00:00Z' });
  }
  const sd = SuiteData.create({ client: createFakeSupa({ uid: 'u1', tables, maxRows: 10 }) });
  assert.strictEqual((await sd.employees.list()).length, 25, '従業員が上限10で切れている');
  assert.strictEqual((await sd.partners.list()).length, 25, '取引先が上限10で切れている');
});

test('監査: 取引先を直す時 sort を渡さなくても並び順が0に戻らない', async () => {
  const { sd } = setup();
  await sd.partners.upsert({ id: 'pt_a', sort: 5, data: { name: 'A社' } });
  await sd.partners.upsert({ id: 'pt_b', sort: 1, data: { name: 'B社' } });
  await sd.partners.upsert({ id: 'pt_a', data: { name: 'A社(改名)' } });   // sort を渡さない
  const list = await sd.partners.list();
  assert.deepStrictEqual(list.map(p => p.data.name), ['B社', 'A社(改名)'], '並び順が壊れた');
  assert.strictEqual(list.find(p => p.id === 'pt_a').sort, 5);
});

test('監査: 実経路で採番したidが重複しない(1000件連続投入)', async () => {
  const sd2 = SuiteData.create({ client: createFakeSupa({ uid: 'u1', tables: { pay_ledger: [] } }) });
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const r = await sd2.ledger.upsert({ employeeId: 'e1', ymd: '2026-07-01', data: { uriage: 1 } });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(seen.has(r.id), false, 'id が重複した: ' + r.id);
    seen.add(r.id);
  }
});

test('監査: 利用権の作成に失敗したら成功を返さない', async () => {
  const { sb, sd } = setup();
  sb._failNext('exally_entitlements', 'insert');
  const r = await sd.entitlements.ensure('suite');
  assert.strictEqual(r.plan, null);
  assert.ok(r.error, 'エラーが返っていない');
});

/* ═══ 利用権 ═══ */

test('利用権: 行が無ければ trial を1行だけ作る(2回目は作らない)', async () => {
  const { sd, tables } = setup();
  const a = await sd.entitlements.ensure('suite');
  assert.strictEqual(a.plan, 'trial');
  assert.strictEqual(a.existed, false);
  const b = await sd.entitlements.ensure('suite');
  assert.strictEqual(b.existed, true);
  assert.strictEqual(tables.exally_entitlements.length, 1);
  assert.strictEqual(tables.exally_entitlements[0].app, 'suite');
  assert.strictEqual(tables.exally_entitlements[0].plan, 'trial');
});

test('利用権: 既存planを ensure が trial に書き戻さない(有料客を無料に落とさない)', async () => {
  const { sd, tables } = setup({ exally_entitlements: [{ account_id: 'u1', app: 'suite', plan: 'paid', email: 'a@b.c' }] });
  await sd.entitlements.ensure('suite');
  assert.strictEqual(tables.exally_entitlements[0].plan, 'paid');
  assert.strictEqual((await sd.entitlements.get('suite')).plan, 'paid');
});

test('利用権: アプリ毎に独立(payslipの行はsuiteに影響しない)', async () => {
  const { sd, tables } = setup({ exally_entitlements: [{ account_id: 'u1', app: 'payslip', plan: 'paid' }] });
  assert.strictEqual(await sd.entitlements.get('suite'), null);
  await sd.entitlements.ensure('suite');
  assert.strictEqual(tables.exally_entitlements.length, 2);
  assert.strictEqual(tables.exally_entitlements.find(e => e.app === 'payslip').plan, 'paid');
});

/* ═══ RLS / 他アカウント ═══ */

test('RLS: 他アカウントの従業員は見えない・patchできない', async () => {
  const { sd, tables } = setup();
  assert.strictEqual((await sd.employees.list()).some(e => e.id === 'x9'), false);
  const r = await sd.employees.patch('x9', { business: '乗っ取り' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(tables.pay_employees.find(e => e.id === 'x9').data.business, undefined);
});

test('RLS: 他アカウントの台帳は見えない', async () => {
  const { sd } = setup({ pay_ledger: [{ id: 'lg_other', account_id: 'u2', employee_id: 'x9', ymd: '2026-07-01', data: { uriage: 99999 }, deleted_at: null }] });
  assert.strictEqual((await sd.ledger.list({ from: '2026-07-01', to: '2026-07-31' })).length, 0);
});

/* ═══ 失敗を握り潰さない ═══ */

test('DB失敗を「保存できた」と嘘をつかない', async () => {
  const { sb, sd, tables } = setup();
  sb._failNext('pay_employees', 'upsert');
  const r = await sd.employees.patch('e1', { business: '代行' });
  assert.strictEqual(r.ok, false, '失敗なのに ok:true を返した');
  assert.ok(r.reason);
  assert.strictEqual(tables.pay_employees.find(e => e.id === 'e1').data.business, undefined);
});

test('未ログイン(uid無し)では書かずに失敗を返す', async () => {
  const { sb, sd, tables } = setup();
  sb._uid(null);
  const r = await sd.employees.patch('e1', { business: '代行' });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /no-user/);
  assert.strictEqual(tables.pay_employees.find(e => e.id === 'e1').data.business, undefined);
});

/* ═══ §6-2 法定帳簿を壊さない(ソース検査) ═══ */

test('§6-2 suite-data は pay_payslips に書かない(合算がKyuallyに入るまで禁止)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'suite-data.js'), 'utf8');
  const writes = src.match(/from\(\s*'pay_payslips'\s*\)\s*\.\s*(upsert|insert|update|delete)/g);
  assert.strictEqual(writes, null, 'pay_payslips への書き込みがある: ' + writes);
});

test('§2-2以外で pay_companies を書き換えていない(読み取りはOK・書くのは updated_at のみ)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'suite-data.js'), 'utf8');
  const ops = src.match(/from\(\s*'pay_companies'\s*\)\s*\.\s*\w+\([^)]*\)/g) || [];
  assert.ok(ops.length > 0, 'pay_companies を触る箇所が見つからない(検査が空振り)');
  ops.forEach(op => {
    if (/\.select\(/.test(op)) return;                       // 読み取りは許可(E2で締め方を読む)
    assert.ok(/\.update\(/.test(op), 'pay_companies に update 以外の書き込み: ' + op);
    assert.ok(!/data/.test(op), 'pay_companies の data を書き換えている: ' + op);
  });
  // 行を作る/消す系が1つも無いこと(Kyuallyの設定を勝手に作らない・消さない)
  ['upsert', 'insert', 'delete'].forEach(bad => {
    assert.strictEqual(new RegExp("from\\(\\s*'pay_companies'\\s*\\)\\s*\\.\\s*" + bad).test(src), false,
      'pay_companies に ' + bad + ' がある');
  });
});

/* ═══ 全件ページングが消えていないか（巻き戻り防止） ═══
 * ★2026-07-31 に危うくやりかけた: 別セッションが入れた「1000件超の全件ページング(fetchAllQ)」を、
 *   それより古い枝から本番へ出して消しかけた。お金の記録が黙って欠ける事故になるので、テストで居座らせる。
 */
test('★全件ページング(fetchAllQ)が消えていない=1000件超が黙って欠けない', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'suite-data.js'), 'utf8');
  assert.ok(/function\s+fetchAllQ/.test(src), 'fetchAllQ(全件ページング)が消えている＝1000件超が欠落する');
  const uses = (src.match(/fetchAllQ\(/g) || []).length;
  assert.ok(uses >= 4, 'fetchAllQ の利用が少なすぎる(' + uses + '箇所)＝どこかが素の select に戻っている');
});

test('★台帳の読みが件数上限で黙って切れない仕掛けが残っている', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'suite-data.js'), 'utf8');
  // 「全件取り切る」か「切れたら検知する」か、どちらかは必ず有ること
  const guarded = /fetchAllQ/.test(src) || /count:\s*'exact'/.test(src);
  assert.ok(guarded, '台帳の読みに「全件取得」も「切れ検知」も無い＝合計が静かに過少になる');
});

/* ═══ DDL の安全性(既存を壊さない) ═══ */

test('DDL: 新規3テーブルの作成のみ・既存への ALTER/DROP TABLE が無い', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema-exally.sql'), 'utf8');
  const body = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  const creates = (body.match(/create table if not exists (\w+)/g) || []).map(s => s.split(' ').pop());
  assert.deepStrictEqual(creates.sort(), ['pay_ledger', 'pay_org', 'pay_partners']);
  assert.strictEqual(/drop\s+table/i.test(body), false, 'DROP TABLE がある');
  assert.strictEqual(/truncate/i.test(body), false, 'TRUNCATE がある');
  assert.strictEqual(/delete\s+from/i.test(body), false, 'DELETE FROM がある');
  const alters = body.match(/alter table (\w+)/gi) || [];
  alters.forEach(a => {
    const t = a.split(/\s+/).pop();
    assert.ok(['pay_org', 'pay_partners', 'pay_ledger'].includes(t), '既存テーブルを ALTER している: ' + t);
  });
  // 全テーブルに RLS が付いている
  ['pay_org', 'pay_partners', 'pay_ledger'].forEach(t => {
    assert.ok(new RegExp('alter table ' + t + '\\s+enable row level security').test(body), t + ' に RLS が無い');
    assert.ok(new RegExp("create policy own_" + t + " on " + t).test(body), t + ' にポリシーが無い');
  });
  // 冪等
  assert.strictEqual((body.match(/create table (?!if not exists)/g) || []).length, 0, '冪等でない create table');
  assert.strictEqual((body.match(/create index (?!if not exists)/g) || []).length, 0, '冪等でない create index');
});

test('DDL: pay_ledger の列名は ymd(dateは型名と衝突するので使わない)', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema-exally.sql'), 'utf8');
  const block = sql.slice(sql.indexOf('create table if not exists pay_ledger'));
  const cols = block.slice(0, block.indexOf(');'));
  assert.ok(/\bymd\s+date\s+not null/.test(cols), 'ymd 列が無い');
  assert.strictEqual(/^\s{2}date\s/m.test(cols), false, 'date という列名を使っている');
});

/* ═══ 実行 ═══ */
(async () => {
  let ng = 0;
  for (const t of T) {
    try { await t.fn(); console.log('  ok   ' + t.name); }
    catch (e) { ng++; console.log('  NG   ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log('\nsuite-data: ' + (T.length - ng) + '/' + T.length + ' passed');
  if (ng) process.exit(1);
})();
