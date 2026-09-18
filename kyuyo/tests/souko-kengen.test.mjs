/* souko-kengen.test.mjs — ★給与の 画面が 叩く 棚は 全部「他人に 見えない」形か★
 * ============================================================================
 * ★なぜ 作ったか（2026-09-18）★
 *   「他人の データが 見えないか」を 見る 物は `kyuyo/tests/rls-tanin.mjs` 1本 だけだった。
 *   それは ★行が 在る 棚★しか 測れない（★行が 0 の 棚は 黄＝測れて いない★）。
 *   ⇒ ★行が 1つも 無い 棚は、誰も 守りを 見て いない★。
 *
 * ★★そして 窓（view）に 穴が 在り得る（2026-09-18 実測で 気づいた）★★
 *   `public.pay_ledger` などは ★表では なく 窓★。
 *   ★窓は 既定だと『作った人の 鍵』で 中を 見る★＝★棚に RLS が ON でも 窓から 全部 見える★。
 *   今日 引いたら ★security_invoker=on（見る人の 鍵）＝安全側★だった。
 *   ⇒ ★★安全なのは たまたま 見た から 分かっただけ★★
 *     ＝★明日 誰かが 落としても 誰も 赤に しない★（指示役1 の 指摘）。
 *
 * ★既に 在る 物との すみ分け（★作る前に 探した★）★
 *   `seikyu/tests/warehouse-perms.test.mjs` … ★請求書の 画面が 叩く 棚★を 名前で 固定して 見る。
 *     ・そちらは ★repo の SQL（字）★を 読む 作り＋実倉庫を 数えた 日の 表を 書き写す 形。
 *     ・★給与の 棚を そこへ 足すのは 筋が 違う★（見る 範囲の 名前が「請求書が触る棚」）。
 *   ⇒ ★給与側に 同じ 形で 1本 作る★。★ただし こちらは ★実物の 倉庫を 引く★★
 *     ＝「書き写した 表」では なく ★毎回 倉庫に 聞く★（★紙と 実物が ずれない★）。
 *
 * ★ここで見る事★
 *   ① ★画面が 叩く 棚の 一覧を 機械で 拾う★（人の 記憶に 頼らない）
 *   ② その 1本ずつ … ★表なら RLS が ON か／決まりが 1本以上 在るか★
 *   ③ ★窓なら security_invoker が 立って いるか★（★落ちたら 他人の データが 見える★）
 *   ④ ★書く 側の 縛り（with check）が 在るか★（読めない だけでは 足りない）
 *   ⑤ ★名簿の 本数を 門に する★＝★棚が 増えたら 赤★（数を 決め打つ＝黙って 増えない）
 *
 * ★鍵が 無い 所では 測らない★（本番の repo／CI）＝`_souko-kazoeru.mjs` の 門を 通す。
 * 使い方: node kyuyo/tests/souko-kengen.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

export function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* ★① 画面が 叩く 棚を 機械で 拾う★（覚書の 字は 拾わない＝今日 何度も 踏んだ 型） */
export function tanaWoHirou(srcs) {
  const s = new Set();
  for (const src of srcs) {
    for (const m of strip(src).matchAll(/from\(\s*'([a-z_][a-z0-9_]*)'\s*\)/g)) s.add(m[1]);
  }
  return [...s].sort();
}

/* ★★名簿の 本数を 決め打つ★★＝棚が 増えたら 赤（黙って 増えない） */
const HONSU = 14;

const YOMU = ['kyuyo/js/store.js', 'kyuyo/js/app.js', 'kyuyo/js/admin.js', 'js/suite-data.js']
  .filter((f) => fs.existsSync(path.join(ROOT, f)));
const TANA = tanaWoHirou(YOMU.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')));

console.log('\n[souko-kengen] 給与の 画面が 叩く 棚は 全部「他人に 見えない」形か（2026-09-18）');
console.log('  見る 範囲 … 読んだ 紙 ' + YOMU.length + '本 ／ ★拾った 棚 ' + TANA.length + '本★（決め打ち ' + HONSU + '本）');

T('★① 拾った 棚の 本数が 決め打ちと 合う（棚が 増えたら 赤）', () => {
  ok(TANA.length === HONSU,
    '★' + TANA.length + '本／決め打ち ' + HONSU + '本★＝'
    + '★棚が 増えた なら この紙の HONSU も 直す（＝差分に 出る）／減った なら 訳を 書く★ … ' + TANA.join(' '));
});

if (SELF) {
  console.log('\n[souko-kengen] ★自己確認★（わざと 壊して 赤が 出るか）');
  let ng = 0;
  const iu = (n, good, m) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★' + (m || '') + '★')); };

  iu('① ★棚を 1つ 足したら 本数が ずれる★',
    tanaWoHirou(["sb.from('pay_x')"]).length === 1, '拾えない');
  iu('② ★覚書に 書いた 棚は 拾わない★',
    tanaWoHirou(["/* sb.from('pay_nise') と 書いた 覚書 */"]).length === 0, '覚書を 拾って いる');
  iu('③ ★同じ 棚を 2回 書いても 1本と 数える★',
    tanaWoHirou(["sb.from('pay_a'); sb.from('pay_a')"]).length === 1, '重ねて 数えて いる');
  iu('④ ★窓が 安全でない と 分かる 形（invoker が 落ちた）★',
    ((v) => v.invoker === false)({ invoker: false }), '見分けられない');

  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK（★赤が 出る事まで 見た★）');
  if (ng) process.exit(1);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ── ここから 実物の 倉庫を 引く ── */
const { kankyoKa, kankyoIu, toiawase } = await import('./_souko-kazoeru.mjs');

const q = "select n.nspname as heya, c.relname as na, c.relkind as shurui,"
  + " c.relrowsecurity as rls_on,"
  + " (select count(*) from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname) as kimari,"
  + " (select count(*) from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname"
  + "   and p.with_check is not null) as kaku_shibari,"
  + " (select count(*) from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname"
  + "   and p.cmd in ('ALL','INSERT','UPDATE')) as kaku_michi,"
  + " (case when c.reloptions::text like '%security_invoker=on%'"
  + "        or c.reloptions::text like '%security_invoker=true%' then true else false end) as invoker"
  + " from pg_class c join pg_namespace n on n.oid=c.relnamespace"
  + " where c.relkind in ('r','v') and c.relname in ('" + TANA.join("','") + "')"
  + " and n.nspname not in ('pg_catalog','information_schema') order by 2,1";

const r = await toiawase(q);
if (!r.ok) {
  if (kankyoKa(r.naze)) { kankyoIu('棚の 権限を 数えて いません'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
  console.log('  🟡 ★はかれない★ 倉庫に 聞けない … ' + r.naze);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(2);
}
const gyo = r.gyo || [];
const hyou = {};
for (const x of gyo) (hyou[x.na] || (hyou[x.na] = [])).push(x);

T('★② 拾った 棚が 全部 倉庫に 在る（名前の 打ち間違いが 無い）', () => {
  const nai = TANA.filter((t) => !hyou[t]);
  ok(nai.length === 0, '★倉庫に 無い★ … ' + nai.join(' ') + '（★字を 間違えたか／別の 場所の 棚★）');
});

T('★③ 表は RLS が ON・決まりが 1本以上', () => {
  const warui = [];
  for (const t of TANA) for (const x of (hyou[t] || [])) {
    if (x.shurui !== 'r') continue;
    if (!x.rls_on) warui.push(x.heya + '.' + t + '（RLS OFF）');
    else if (Number(x.kimari) < 1) warui.push(x.heya + '.' + t + '（決まり 0本）');
  }
  ok(warui.length === 0, '★' + warui.join(' / ') + '＝★他人に 見えます★');
});

T('★④ ★書ける 棚は 書く 側も 縛って いる★（書く道が 無い 棚は そもそも 書けない）', () => {
  /* ★★「書く 縛りが 無い」＝「書き放題」では ない（2026-09-18 実測で 直した）★★
     ★最初の 作り★ … `with_check` が 0本なら 赤に して いた
     ⇒ ★exally.exally_admins と kyuyo.statutory が 赤に なった★
     ★中を 読んだら★ … どちらも ★決まりが SELECT の 1本だけ★
       ・exally_admins … 読む＝自分の 行だけ（`account_id = auth.uid()`）
       ・kyuyo.statutory … 読む＝`true`（★法定の 数値＝みんなが 読む 物★）
       ⇒ ★★書く 決まりが 1本も 無い＝RLS は 既定で 拒む＝★誰も 書けない★★★
       ＝★一番 きつい 締め方★であって ★穴では ない★。
     ⇒ ★★見る所を 直す★★＝「★書く道（ALL/INSERT/UPDATE）が 在る 棚★だけ、
         ★with check が 付いて いるか★を 見る」。
     ＝★「0件」と「該当なし」は 別★（今日 何度も 出た 形）。 */
  const warui = [], kakenai = [];
  for (const t of TANA) for (const x of (hyou[t] || [])) {
    if (x.shurui !== 'r') continue;
    if (Number(x.kaku_michi) < 1) { kakenai.push(x.heya + '.' + t); continue; }
    if (Number(x.kaku_shibari) < 1) warui.push(x.heya + '.' + t);
  }
  if (kakenai.length) console.log('     ★書く道が 無い 棚 ' + kakenai.length + '本（＝誰も 書けない）★ … ' + kakenai.join(' '));
  ok(warui.length === 0,
    '★' + warui.join(' / ') + '＝★書く道は 在るのに 縛りが 無い＝他人の 名義で 書けます★');
});

T('★⑤ ★窓は security_invoker が 立って いる★（落ちたら 他人の データが 見える）', () => {
  const warui = [];
  for (const t of TANA) for (const x of (hyou[t] || [])) {
    if (x.shurui !== 'v') continue;
    if (!x.invoker) warui.push(x.heya + '.' + t);
  }
  ok(warui.length === 0,
    '★' + warui.join(' / ') + '＝★★窓が「作った人の 鍵」で 開く＝棚の RLS を すり抜けて 他人の データが 見えます★★');
});

/* ★★⑥ ★消すと 道連れに なる 親★を 名簿に する（2026-09-18 に 実害を 出してから 足した）★★
   ★何が 起きたか★
     `pay_meisai_pub` を 消したら ★CASCADE で 3本が 道連れ★に なった
       pay_meisai_docs（★公開された 明細＝お金の 記録★）
       pay_nencho_decl（★年末調整の 申告＝家族・保険料・所得★）
       pay_emp_profile（★本人が 入れた 振込先★）
     ⇒ ★私は「紙は 消さない」と 書いた 当人なのに 紙を 13枚 消した★（テスト線）。
     ⇒ ★本番に 出て いたら お客さんが 入れた 物が 黙って 消えて 戻せない★。
   ★ここで 見る 事★
     ⑴ kyuyo の 中で ★親に なって いる 棚★（auth.users からの 分は 別＝口ごと 消す 時の 話）
     ⑵ その 親を ★店の コードが 消して いる★なら、★子の 名前が 全部 店の コードに 在る★
        ＝★守りが 子 1本でも 抜けたら 赤★（棚が 増えた 日に 気付く）
   ★決め打ち★＝★親 1本／子 3本★（2026-09-18 実測）。増えたら 赤。 */
const OYA_HONSU = 1, KO_HONSU = 3;
const ck = await toiawase(
  "select sn.nspname||'.'||src.relname as ko, tn.nspname||'.'||tgt.relname as oya"
  + ' from pg_constraint c'
  + ' join pg_class src on src.oid=c.conrelid join pg_namespace sn on sn.oid=src.relnamespace'
  + ' join pg_class tgt on tgt.oid=c.confrelid join pg_namespace tn on tn.oid=tgt.relnamespace'
  + " where c.contype='f' and c.confdeltype='c' and tn.nspname='kyuyo'");
if (!ck.ok) {
  if (kankyoKa(ck.naze)) console.log('  ' + kankyoIu('道連れ（CASCADE）を 数えていません'));
  else { fail++; console.log('  ✗ ★⑥ 道連れの 名簿を 数えられない — ' + ck.naze); }
} else {
  const oyako = {};
  for (const g of ck.gyo) (oyako[g.oya] = oyako[g.oya] || []).push(g.ko);
  const oyaRa = Object.keys(oyako).sort();
  console.log('  ★消すと 道連れに なる 親 … ' + oyaRa.length + '本★');
  for (const o of oyaRa) console.log('     ' + o + ' を 消すと … ' + oyako[o].join(' / '));

  T('★⑥ 道連れの 親子の 本数が 決め打ちと 合う（棚が 増えたら 赤）', () => {
    ok(oyaRa.length === OYA_HONSU,
      '★親 ' + oyaRa.length + '本／決め打ち ' + OYA_HONSU + '本★＝増えたなら この紙も 直す … ' + oyaRa.join(' '));
    const ko = oyaRa.reduce((a, o) => a + oyako[o].length, 0);
    ok(ko === KO_HONSU, '★子 ' + ko + '本／決め打ち ' + KO_HONSU + '本★＝増えたなら 守りも 直す');
  });

  T('★⑦ ★道連れの 親を 消す 所は 子を 全部 見てから 消す★（守りの 抜けが 無い）', () => {
    const q = String.fromCharCode(39);
    const src = YOMU.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join(String.fromCharCode(10));
    for (const o of oyaRa) {
      const na = o.split('.')[1];
      /* ★その親を 店が 消して いるか★（消していない なら 守りは 要らない）
         ★★逆斜線を 使わない★★＝2026-09-18 に この段で 2回 踏んだ
           （heredoc で ★\( や [\s\S] が 黙って 落ちて★ 別の 字に なり、
             ★わざと 壊しても 赤に ならなかった★＝★見張りが 元から 動いて いなかった★）。 */
      const kagi = 'from(' + q + na + q + ')';
      let kesu = false;
      for (let at = src.indexOf(kagi); at >= 0; at = src.indexOf(kagi, at + 1)) {
        if (src.slice(at, at + 90).indexOf('.delete()') >= 0) { kesu = true; break; }
      }
      if (!kesu) continue;
      /* ★★「どこかに 名前が 在る」では 数えない★★（2026-09-18 … それで ★抜いても 赤に ならなかった★
           ＝別の 所で 同じ 棚を 読んで いた／store.js:716）。
         ⇒ ★守りの 名簿 1か所（MICHIZURE_<親>）だけを 見る★。 */
      const meibo = 'MICHIZURE_' + na;
      const at0 = src.indexOf(meibo);
      ok(at0 >= 0, '★' + na + ' を 消しているのに 守りの 名簿（' + meibo + '）が 無い★');
      const at1 = src.indexOf(']', at0);
      ok(at1 > at0, '★守りの 名簿の 形が 違う（' + meibo + '）★');
      const seg = src.slice(at0, at1);
      const kaita = (seg.match(/'[^']+'/g) || []).map((x) => x.split(q).join('')).sort();
      const hontou = oyako[o].map((k) => k.split('.')[1]).sort();
      ok(kaita.join(',') === hontou.join(','),
        '★守りの 名簿と 実物の 子が 合わない★'
        + '＝書いて ある ' + (kaita.join(' ') || '（空）') + ' ／ 倉庫の 実物 ' + hontou.join(' ')
        + '＝★足りない 分が 道連れで 消えます（お客さんの 物が 黙って 消えます）★');
    }
  });
}

/* ★数を 出す（分母つき）★ */
{
  const hyo = gyo.filter((x) => x.shurui === 'r').length;
  const mado = gyo.filter((x) => x.shurui === 'v').length;
  const madoOk = gyo.filter((x) => x.shurui === 'v' && x.invoker).length;
  console.log('  ★数★ … 棚（表）' + hyo + '本 ／ 窓（view）' + mado + '本（うち 安全側 ' + madoOk + '本）'
    + ' ／ 拾った 名前 ' + TANA.length + '本');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
