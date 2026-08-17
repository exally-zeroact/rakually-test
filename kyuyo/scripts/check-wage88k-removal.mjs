/* check-wage88k-removal.mjs — ★社保 適用拡大の「賃金要件(月88,000円)」が法令から消えたかを、機械で確かめる★
 *
 * なぜ必要か（2026-08-08・K2 の宿題）:
 *   賃金要件は【令和8年10月に撤廃予定】。施行日は政令で決まる＝★まだ動く★。
 *   ・年金機構のページは「撤廃予定です」としか書かない（＝人が読んでも確定か分からない）
 *   ・二次情報（社労士ブログ等）は「2026年10月から撤廃」と断言しているが、★根拠法の番号すら間違っている記事がある★
 *   だから ★法令そのもの（e-Gov 法令データ）を叩いて、条文が消えているかを数える。★
 *   条文が消えた版の【施行日】が、そのまま WAGE_88K_REMOVED_YM に入れる値になる。
 *
 * 何を見るか:
 *   厚生年金保険法(329AC0000000115) 第12条5号ロ / 健康保険法(211AC0000000070) の
 *   「八万八千円未満であること。」という条文が、各【施行日ごとの版】に有るか無いか。
 *   ★2026-08-08 実測: 現行版=有り / 2026-10-01施行版=★まだ有り★（＝撤廃は法令データに未反映）
 *
 * どこで回すか:
 *   ★通常のCIには入れない★（外のサイトを叩くので、向こうの都合で赤が出ると赤を無視する癖がつく）。
 *   .github/workflows/source-urls.yml（週1・月曜9時JST＋手動）に相乗り。落ちても push は止まらない。
 *   ★期限 2026-09-15★ までに必ず1回、人が見て切替を判断する。
 *
 * 使い方: node kyuyo/scripts/check-wage88k-removal.mjs           … 一覧を出す
 *         node kyuyo/scripts/check-wage88k-removal.mjs --json
 *         node kyuyo/scripts/check-wage88k-removal.mjs --self-test … 判定そのものを作り物で確かめる
 * 終了コード: 0=今のままでよい / 3=★切替が要る（法令から消えた／libと食い違う）★ / 0=ネットが無い(赤くしない)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);

const API = 'https://laws.e-gov.go.jp/api/2';
const LAWS = [
  { key: 'kosei', label: '厚生年金保険法', id: '329AC0000000115' },
  { key: 'kenko', label: '健康保険法', id: '211AC0000000070' },
];
const NEEDLE = '八万八千円';       // 第12条5号ロ「…八万八千円未満であること。」
const MAX_FETCH = 6;              // 1法令あたり取りに行く版の上限（e-Govに優しく）

/* ══ ★判定そのもの（純関数・ネットに触らない）═══════════════════════════
   版の一覧 [{ enforce:'YYYY-MM-DD', hasWage:true/false }] から
   「撤廃された最初の施行日」と「libに入れるべき値」を決める。 */
export function decide(versions, libValue) {
  const sorted = versions.slice().sort((a, b) => (a.enforce < b.enforce ? -1 : 1));
  const removed = sorted.find(v => v.hasWage === false);
  const should = removed ? removed.enforce.slice(0, 7) : null;      // 'YYYY-MM'
  const lib = libValue === undefined ? null : libValue;
  return {
    removedFrom: removed ? removed.enforce : null,
    should,
    lib,
    agree: should === lib,
    // 条文が1つも見つからない＝条文の書き方が変わった可能性。★勝手に「撤廃された」と決めない★
    suspicious: sorted.length > 0 && sorted.every(v => v.hasWage === false) && lib === null,
  };
}

/* ══ self-test ═══════════════════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  let pass = 0, fail = 0;
  const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + `expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
  console.log('\n[check-wage88k-removal --self-test] 判定が正しいか（作り物で）');

  T('★まだ条文が残っている（今の状態）→ 切替は要らない・libのnullと一致', () => {
    const d = decide([{ enforce: '2026-08-01', hasWage: true }, { enforce: '2026-10-01', hasWage: true }], null);
    eq(d.should, null); eq(d.agree, true); eq(d.removedFrom, null);
  });
  T('★2026-10-01施行版から条文が消えた → 入れるべき値は 2026-10・libがnullなら不一致(=切替が要る)', () => {
    const d = decide([{ enforce: '2026-08-01', hasWage: true }, { enforce: '2026-10-01', hasWage: false }], null);
    eq(d.should, '2026-10'); eq(d.agree, false); eq(d.removedFrom, '2026-10-01');
  });
  T('★消えた版が2つ以上あっても【最初の施行日】を採る', () => {
    const d = decide([{ enforce: '2027-04-01', hasWage: false }, { enforce: '2026-10-01', hasWage: false }, { enforce: '2026-08-01', hasWage: true }], null);
    eq(d.should, '2026-10');
  });
  T('切替済み（lib=2026-10）で法令も一致 → 何もしなくてよい', () => {
    const d = decide([{ enforce: '2026-10-01', hasWage: false }], '2026-10');
    eq(d.agree, true);
  });
  T('★どの版にも条文が無い＝条文の書き方が変わった疑い（勝手に撤廃と決めない）', () => {
    const d = decide([{ enforce: '2026-08-01', hasWage: false }], null);
    eq(d.suspicious, true);
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ══ 本番（e-Gov を実際に叩く）═════════════════════════════════════════ */
const JSON_OUT = process.argv.includes('--json');
const SK = require_(path.join(ROOT, 'lib/shaho-kanyu.js'));

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
}

// その法令の「現行 + これから施行される版」を、施行日の早い順に返す（上限つき）
async function revisionsOf(lawId) {
  const j = await getJson(`${API}/law_revisions/${lawId}`);
  const list = (j.revisions || [])
    .filter(r => r.amendment_enforcement_date)
    .filter(r => r.current_revision_status === 'CurrentEnforced' || r.current_revision_status === 'UnEnforced')
    .sort((a, b) => (a.amendment_enforcement_date < b.amendment_enforcement_date ? -1 : 1));
  const seen = new Set(), out = [];
  for (const r of list) {                       // 同じ施行日の版は1つでよい
    if (seen.has(r.amendment_enforcement_date)) continue;
    seen.add(r.amendment_enforcement_date);
    out.push({ enforce: r.amendment_enforcement_date, revId: r.law_revision_id, status: r.current_revision_status });
    if (out.length >= MAX_FETCH) break;
  }
  return out;
}

// その版の本文に「八万八千円」が何回出るか（0回=条文が消えた）＋その版の施行日
async function fetchVersion(revIdOrLawId) {
  const j = await getJson(`${API}/law_data/${revIdOrLawId}`);
  const s = JSON.stringify(j.law_full_text != null ? j.law_full_text : j);
  const hits = (s.match(new RegExp(NEEDLE, 'g')) || []).length;
  const ri = j.revision_info || {};
  return { hits, enforce: ri.amendment_enforcement_date || '', status: ri.current_revision_status || '' };
}

const report = { checkedAt: new Date().toISOString().slice(0, 10), lib: SK.WAGE_88K_REMOVED_YM, laws: [] };
let netError = null;
for (const law of LAWS) {
  try {
    // ★まず「今 効いている版」を必ず見る（未施行の版しか見ないと、現行の姿が report から抜ける）
    const cur = await fetchVersion(law.id);
    const versions = [{ enforce: cur.enforce, status: 'CurrentEnforced', hits: cur.hits, hasWage: cur.hits > 0, now: true }];
    if (cur.hits > 0) {
      for (const r of await revisionsOf(law.id)) {
        if (r.enforce <= cur.enforce) continue;  // 現行と同じ/前の版は見なくてよい
        const v = await fetchVersion(r.revId);
        versions.push({ enforce: r.enforce, status: r.status, hits: v.hits, hasWage: v.hits > 0 });
        if (v.hits === 0) break;                 // 消えた版が見つかったら、それ以降は見なくてよい
      }
    }
    report.laws.push({ ...law, versions, decision: decide(versions, SK.WAGE_88K_REMOVED_YM) });
  } catch (e) {
    netError = e;
    report.laws.push({ ...law, error: String(e && e.message || e) });
  }
}

if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); }
else {
  console.log('\n[check-wage88k-removal] 賃金要件(月' + SK.WAGE_88K.toLocaleString('en-US') + '円)の条文が法令から消えたか  ' + report.checkedAt);
  console.log('  lib(kyuyo/lib/shaho-kanyu.js) の切替点: ' + (report.lib === null ? 'null（まだ切り替えていない）' : report.lib));
  for (const l of report.laws) {
    console.log('\n  ── ' + l.label + '（' + l.id + '）');
    if (l.error) { console.log('    × 取得できませんでした: ' + l.error); continue; }
    for (const v of l.versions) {
      console.log('    ' + (v.enforce || '(施行日不明)') + ' 施行版 … 「' + NEEDLE + '」' + (v.hasWage ? v.hits + '件 → 賃金要件あり' : '★0件 → 撤廃されている★')
        + (v.now ? '（今 効いている版）' : ''));
    }
    const d = l.decision;
    if (d.suspicious) console.log('    ⚠ どの版にも条文が無い＝条文の書き方が変わった疑い。人が中身を見ること（勝手に撤廃と決めない）');
    else if (!d.removedFrom) console.log('    → まだ撤廃されていない＝★今のまま(null)でよい★');
    else console.log('    → ★' + d.removedFrom + ' から撤廃。WAGE_88K_REMOVED_YM = \'' + d.should + '\' にする★');
  }
}

const ok = report.laws.filter(l => !l.error);
if (!ok.length) { console.log('\n（e-Govに繋がりませんでした。ネットが無いだけなので赤にしません）'); process.exit(0); }
const needSwitch = ok.some(l => l.decision && !l.decision.agree && !l.decision.suspicious);
const odd = ok.some(l => l.decision && l.decision.suspicious);
if (needSwitch || odd) {
  console.log('\n★人がやること: kyuyo/lib/shaho-kanyu.js の WAGE_88K_REMOVED_YM を直し、'
    + 'tests/shaho-kanyu.test.js の境界（前月/当月/翌月）を実物で測り直す。期限 2026-09-15。');
  process.exit(3);
}
console.log('\n今のままでよい（法令と lib が一致）。次に見る日: 2026-09-15 まで');
if (netError) console.log('（一部だけ取得できませんでした: ' + netError.message + '）');
process.exit(0);
