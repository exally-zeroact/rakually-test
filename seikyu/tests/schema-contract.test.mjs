/* schema-contract.test.mjs — ★設計図(SQL)と lib が同じ事を言っているか★
 *
 * なぜ必要か:
 *   「発行したら固まる」は ★倉庫のトリガ★ と ★画面が使う lib★ の2か所に書いてある。
 *   片方だけ直すと、画面は止めないのに倉庫が弾く（またはその逆）＝一番たちの悪いズレになる。
 *   ★2つを機械で突き合わせて、ズレたら赤にする。★
 *
 * ついでに、設計の「効かせたい所」が設計図から消えていないかも見る:
 *   ・番号の一意制約に ★where が付いていない★（取り消した番号を再利用させない）
 *   ・発行済みは ★消せない★（check と before delete の2枚）
 *   ・窓口は ★security_invoker = true★
 *   ・RLS が両方の棚で有効
 *   ・★取引先/自社の棚を新設していない★（既にある pay_partners / pay_org を使う）
 *
 * 使い方: node seikyu/tests/schema-contract.test.mjs
 *         node seikyu/tests/schema-contract.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { stripComments } from '../../scripts/seikyu-sql-guard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const DOC = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const SQL_PATH = path.join(ROOT, 'supabase/schema-seikyu.sql');

/* ★純関数：設計図から「何が書いてあるか」を読み取る（self-test で作り物を通せる）★ */
export function contractOf(sql) {
  // ★コメントを外してから読む。説明文に「new.X is distinct from old.X」と書いただけで
  //   固まる列に 'x' が混ざる事故を実際に踏んだ（2026-08-10）。
  const s = stripComments(String(sql));
  const fn = /create\s+or\s+replace\s+function\s+kyuyo\.pay_invoices_freeze\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(s);
  const frozen = fn
    ? [...fn[1].matchAll(/new\.([a-z_]+)\s+is\s+distinct\s+from\s+old\.\1\b/gi)].map(m => m[1].toLowerCase())
    : [];
  const uq = /create\s+unique\s+index[^;]*?uq_pay_invoices_no([\s\S]*?);/i.exec(s);
  const ckOf = (name) => {
    const m = new RegExp('constraint\\s+' + name + '\\s+check\\s*\\(([\\s\\S]*?)\\)\\s*(?:,|\\n)', 'i').exec(s);
    return m ? m[1] : '';
  };
  const listOf = (col) => {
    const m = new RegExp(col + '\\s+in\\s*\\(([^)]*)\\)', 'i').exec(s);
    return m ? m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')) : [];
  };
  return {
    frozen,
    uniqueIndex: uq ? uq[0] : '',
    uniqueHasWhere: uq ? /\bwhere\b/i.test(uq[1]) : null,
    hasDeleteGuard: /create\s+trigger\s+trg_pay_invoices_no_delete\s+before\s+delete/i.test(s),
    hasFreezeTrigger: /create\s+trigger\s+trg_pay_invoices_freeze\s+before\s+update/i.test(s),
    delCheck: ckOf('pay_invoices_del_ck'),
    linesCheck: ckOf('pay_invoices_lines_ck'),
    receiptAmountCheck: ckOf('pay_receipts_amount_ck'),
    statuses: listOf('status'),
    docTypes: listOf('doc_type'),
    taxModes: listOf('tax_mode'),
    roundings: listOf('rounding'),
    rlsTables: [...s.matchAll(/alter\s+table\s+kyuyo\.([a-z_]+)\s+enable\s+row\s+level\s+security/gi)].map(m => m[1]),
    views: [...s.matchAll(/create\s+or\s+replace\s+view\s+public\.([a-z_]+)\s+with\s*\(\s*security_invoker\s*=\s*(true|false)\s*\)/gi)]
      .map(m => ({ name: m[1], invoker: m[2] === 'true' })),
    createdTables: [...s.matchAll(/create\s+table\s+if\s+not\s+exists\s+kyuyo\.([a-z_]+)/gi)].map(m => m[1]),
    fkToInvoices: /foreign\s+key\s*\(\s*account_id\s*,\s*invoice_id\s*\)\s*references\s+kyuyo\.pay_invoices\s*\(\s*account_id\s*,\s*id\s*\)/i.test(s),
  };
}

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eqSet = (a, b, m) => {
  const A = [...a].sort().join(','), B = [...b].sort().join(',');
  if (A !== B) throw new Error((m || '') + ' 一致しない\n     SQL側: ' + A + '\n     lib側: ' + B);
};

// ★行末を LF にそろえてから読む★
//   Windows で checkout すると CRLF になり、CI(Linux) は LF。そろえないと
//   「手元では作り物が効かないのに CI では効く」というズレが出る（2026-08-10 実際に踏んだ）。
//   scripts/stamp-build.mjs が刻印の前に正規化しているのと同じ理由。
const SQL = fs.readFileSync(SQL_PATH, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
// ★コメントの文字で判断しない（説明文に他の棚の名前が出るのは当たり前）。
//   「実際に流れるSQL」だけを見る。sql-guard と同じ考え方。
const CODE = stripComments(SQL);

/* ── self-test：わざとズレさせて赤になるか ─────────────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[schema-contract --self-test] わざとズレさせて赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('★読み取りが空振りしていない（本物から実際に列を拾えている）', () => {
    const c = contractOf(SQL);
    if (!c.frozen.length) throw new Error('固まる列を1つも拾えていない＝この検査は何も見ていない');
    if (c.frozen.length !== DOC.FROZEN_FIELDS.length) throw new Error('本物同士が既にズレている');
  });

  S('★トリガから1列 抜くと赤になる', () => {
    const broken = SQL.replace(/\s*or new\.lines\s+is distinct from old\.lines\n/i, '\n');
    const c = contractOf(broken);
    if (c.frozen.includes('lines')) throw new Error('壊せていない（テストの作り物が効いていない）');
    if (c.frozen.length === DOC.FROZEN_FIELDS.length) throw new Error('抜いたのに数が同じ＝赤にならない');
  });

  S('★一意制約に where を付けると赤になる（取り消した番号の再利用）', () => {
    const broken = SQL.replace(
      /(create unique index if not exists uq_pay_invoices_no\s*\n\s*on kyuyo\.pay_invoices \(account_id, doc_type, no\))/i,
      '$1 where deleted_at is null');
    const c = contractOf(broken);
    if (c.uniqueHasWhere !== true) throw new Error('where を足したのに気づけない');
  });

  S('★窓口の security_invoker を false にすると赤になる', () => {
    // ★説明文ではなく「実際に流れる view の定義」を壊す（コメントを壊しても意味が無い）
    const broken = SQL.replace(
      /(create or replace view public\.pay_invoices with \(security_invoker = )true/i, '$1false');
    if (broken === SQL) throw new Error('壊せていない（作り物が効いていない）');
    const c = contractOf(broken);
    if (c.views.every(v => v.invoker)) throw new Error('false にしたのに気づけない');
  });

  S('★窓口から with(...) ごと外すと、窓口の数が減って赤になる', () => {
    const broken = SQL.replace(/ with \(security_invoker = true\)/i, '');
    if (broken === SQL) throw new Error('壊せていない');
    if (contractOf(broken).views.length === 2) throw new Error('外したのに2つのまま＝気づけない');
  });

  S('★消せない仕掛けを外すと赤になる', () => {
    const broken = SQL.replace(/create trigger trg_pay_invoices_no_delete before delete/i, '-- removed');
    if (contractOf(broken).hasDeleteGuard) throw new Error('外したのに気づけない');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  process.exit(sf ? 1 : 0);
}

/* ── 本番の検査 ───────────────────────────────────────────────── */
console.log('\n[schema-contract] 設計図(SQL) と lib が同じ事を言っているか');
const C = contractOf(SQL);
console.log('     実測: 固まる列 ' + C.frozen.length + '個 / 作る棚 ' + C.createdTables.join(',') + ' / 窓口 ' + C.views.length + '個');

T('★「発行したら固まる列」が 倉庫のトリガ と lib で完全に一致する', () => {
  ok(C.frozen.length > 0, 'トリガから列を1つも読めていない（検査が空振り）');
  eqSet(C.frozen, DOC.FROZEN_FIELDS, '固まる列が');
});

T('★status / sent_at は固めない（取り消しと「送った記録」は後から入る）', () => {
  ok(!C.frozen.includes('status'), 'status を固めると取り消せなくなる');
  ok(!C.frozen.includes('sent_at'), 'sent_at を固めると送った記録が残せない');
  ok(!C.frozen.includes('deleted_at'));
});

T('★番号の一意制約に where が付いていない（取り消した番号を二度と使わない）', () => {
  ok(C.uniqueIndex, '一意制約が見つからない');
  ok(C.uniqueIndex.includes('account_id, doc_type, no'), '鍵の組み合わせが違う: ' + C.uniqueIndex);
  ok(C.uniqueHasWhere === false, '★where が付いている＝消した/取り消した番号が再利用できてしまう');
});

T('★発行済みは消せない（ソフト削除の check と 物理削除の見張りの2枚）', () => {
  ok(C.delCheck.includes("status = 'draft'"), 'ソフト削除の check が無い: ' + C.delCheck);
  ok(C.hasDeleteGuard, '物理削除の見張り(before delete)が無い');
  ok(!DOC.canDelete({ status: 'issued' }), 'lib 側が消せると言っている');
  ok(DOC.canDelete({ status: 'draft' }), 'lib 側が下書きを消せないと言っている');
});

T('★選べる値が SQL と lib で一致する（状態・書類の種類・内外税・丸め方）', () => {
  eqSet(C.statuses, DOC.STATUSES, '状態が');
  eqSet(C.docTypes, DOC.DOC_TYPES, '書類の種類が');
  eqSet(C.taxModes, TAX.TAX_MODES, '内外税が');
  eqSet(C.roundings, TAX.ROUNDINGS, '丸め方が');
});

T('★1通の行数の蓋が SQL と lib で同じ数（黙って切らない）', () => {
  ok(C.linesCheck.includes(String(TAX.MAX_LINES)), 'SQL の蓋が lib と違う: ' + C.linesCheck + ' / lib=' + TAX.MAX_LINES);
});

T('★0円の入金は記録させない（「入っていない」と作り分けない）', () => {
  ok(C.receiptAmountCheck.includes('<> 0'), '0円を弾く決まりが無い: ' + C.receiptAmountCheck);
});

T('★入金は「同じアカウントの請求」にしか紐づけられない（account_id ごと結ぶ）', () => {
  ok(C.fkToInvoices, '入金→請求の結びつきが account_id を含んでいない');
});

T('★窓口は2つとも security_invoker = true（★命綱★）', () => {
  ok(C.views.length === 2, '窓口が2つでない: ' + C.views.length);
  for (const v of C.views) ok(v.invoker, v.name + ' に security_invoker=true が無い');
});

T('★RLS が両方の棚で有効', () => {
  eqSet(C.rlsTables, ['pay_invoices', 'pay_receipts'], 'RLS の対象が');
});

T('★新しく作る棚は2つだけ（取引先/自社は既にある物を使う＝二重管理を作らない）', () => {
  eqSet(C.createdTables, ['pay_invoices', 'pay_receipts'], '作る棚が');
  ok(!/create\s+table[^;]*pay_partners/i.test(CODE), 'pay_partners を作ろうとしている（既にある）');
  ok(!/create\s+table[^;]*pay_org/i.test(CODE), 'pay_org を作ろうとしている（既にある）');
});

T('★部屋は kyuyo（給与と同じ部屋）', () => {
  ok(/create schema if not exists kyuyo/i.test(CODE), '部屋の宣言が無い');
  const other = CODE.match(/\b(daikou|castally|amakase|daikome)\./g);
  ok(!other, '他の部屋の名前が出てくる: ' + (other || []).join(','));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
