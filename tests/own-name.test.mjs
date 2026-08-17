/* own-name.test.mjs — ★この器は Rakually の物★（全画面・全アプリぶんを1本で数える）
 *
 * なぜ要るか（司さん 2026-08-17）:
 *   「★いつまでExallyのこといよんど／Rakuallyは別アプリなんはいつ理解するわけ？★」
 *   請求書だけを見張っていた（seikyu/tests/seikyu-own-name.mjs）。
 *   ★器を立てた日に「入口」と「給与」も客が読む字を持った★ので、
 *   見張りを ★Rakually 全体（配信する5画面）★ に広げる。
 *
 * ここで数える物（★客が読む字だけ★）:
 *   ① <title>（タブの題）
 *   ② 画面に描かれる文字（<script> / <style> / HTMLコメント は数えない＝客は読まない）
 *   ③ manifest の name / short_name / description（ホーム画面に出る字）
 *
 * ★数えない物（客は読まない）★
 *   ファイル名（css/exally-ui.css・js/exally-login.js）／中の名前（ExallyLogin・ExallyEnvBadge）／
 *   コード中のコメント（前科の記録は残す）。名前を替えるのは ★10月のURL切替と同じ塊★。
 *
 * 深い所（取引先を外へ出さない・自社の中身を見せる 等）は
 *   ★seikyu/tests/seikyu-own-name.mjs★ が本物の画面を起動して見る。ここは ★字だけ★を全画面で数える。
 *
 * 使い方: node tests/own-name.test.mjs
 *         node tests/own-name.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★他のアプリの名前★＝客が読んではいけない字。
   Rakually の中の物（給与・請求書・台帳・集計）は お互いの名前を出してよい（同じ1つのアプリ）。 */
export const OTHER_APPS = ['Exally', 'エクサリー', 'exally', 'Castally', 'キャスタリー', 'ダイコメ', 'アマかせ', 'Timeally'];

/* ★据え置き（理由と期限つき）★
   「Kyually」＝給与の旧製品名。★2026-08-12 に Rakually へ統一すると決まったが、改名は10月★
   （URL切替と同じ塊で替える）。今 字だけ替えると、司さんが知っている画面と食い違う。
   ＝★見た目の変更なので、勝手に替えず「まだ残っている」と数えて出す★。 */
export const PENDING = {
  Kyually: {
    where: 'kyuyo/index.html の題とロゴ',
    reason: '給与の旧製品名。2026-08-12 に Rakually へ統一と決定済みだが、★改名は10月（URL切替と同じ塊）★。'
      + '見た目の変更は 司さんの見た目OKが要る＝勝手に替えない。',
    until: '2026-10-31',
  },
};

const SCREENS = ['index.html', 'kyuyo/index.html', 'kyuyo/admin.html', 'kyuyo/meisai.html', 'seikyu/index.html'];
const MANIFESTS = ['manifest.json', 'kyuyo/manifest.json', 'kyuyo/admin-manifest.json'];

/** 客が読む字だけを残す（script / style / コメント / タグを落とす） */
export function visibleTextOf(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');                       // HTMLコメント＝客は読まない
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');            // 中のJS＝客は読まない
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  /* ★人が読む属性は残す★（title / placeholder / aria-label / alt / content）。
     ここを落とすと「ボタンの説明だけ他アプリの名前」を見逃す。 */
  const attrs = [];
  for (const m of s.matchAll(/\s(?:title|placeholder|aria-label|alt|content)="([^"]*)"/g)) attrs.push(m[1]);
  const title = (s.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
  s = s.replace(/<[^>]+>/g, ' ');
  return { title: title.trim(), text: (s + ' ' + attrs.join(' ')).replace(/\s+/g, ' ').trim() };
}

/** 他アプリの名前を数える。vfs = { 'index.html': '…', … } */
export function findOtherNames(vfs, names = OTHER_APPS, pending = PENDING) {
  const hits = [];
  for (const f of Object.keys(vfs)) {
    if (typeof vfs[f] !== 'string') continue;
    let read;
    if (/\.json$/.test(f)) {
      let j; try { j = JSON.parse(vfs[f]); } catch { hits.push({ file: f, name: '(JSONとして読めない)', where: f }); continue; }
      read = { title: '', text: [j.name, j.short_name, j.description].filter(Boolean).join(' ') };
    } else read = visibleTextOf(vfs[f]);
    for (const n of names) {
      if (pending[n]) continue;                                  // 据え置き（下で別に数える）
      if (read.title.includes(n)) hits.push({ file: f, name: n, where: 'タブの題' });
      if (read.text.includes(n)) hits.push({ file: f, name: n, where: '画面の字' });
    }
  }
  return hits;
}

/** 据え置き（Kyually 等）が今どこに何件 残っているか＝0件に見せない */
export function findPending(vfs, pending = PENDING) {
  const out = {};
  for (const n of Object.keys(pending)) {
    out[n] = [];
    for (const f of Object.keys(vfs)) {
      if (typeof vfs[f] !== 'string') continue;
      const read = /\.json$/.test(f)
        ? { title: '', text: vfs[f] }
        : visibleTextOf(vfs[f]);
      const c = ((read.title + ' ' + read.text).match(new RegExp(n, 'g')) || []).length;
      if (c) out[n].push(f + ' ×' + c);
    }
  }
  return out;
}

function readVfs() {
  const vfs = {};
  for (const f of [...SCREENS, ...MANIFESTS]) vfs[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
  return vfs;
}

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* ═══ 自己テスト：わざと戻して赤になるか ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[own-name --self-test] ★わざと他アプリの名前を戻して赤になるか');
  const base = readVfs();
  const clone = () => JSON.parse(JSON.stringify(base));

  T('壊していない状態では0件（＝空振りしていない）', () => {
    const h = findOtherNames(base);
    ok(h.length === 0, '壊していないのに ' + h.length + '件: ' + JSON.stringify(h.slice(0, 3)));
  });
  T('① タブの題に「Exally」を戻すと赤', () => {
    const m = clone(); m['index.html'] = m['index.html'].replace('<title>Rakually（ラクアリー）</title>', '<title>Exally（エクサリー）</title>');
    ok(findOtherNames(m).some((x) => x.where === 'タブの題'), '題を見ていない');
  });
  T('② 戻るリンクの字を「← Exally」に戻すと赤', () => {
    const m = clone(); m['kyuyo/index.html'] = m['kyuyo/index.html'].replace('← Rakually', '← Exally');
    ok(findOtherNames(m).some((x) => x.file === 'kyuyo/index.html'), '画面の字を見ていない');
  });
  T('③ 人が読む属性(title=)に他アプリの名前を戻すと赤', () => {
    const m = clone(); m['kyuyo/index.html'] = m['kyuyo/index.html'].replace('title="Rakually の入口へ戻る"', 'title="Exally のハブへ戻る"');
    ok(findOtherNames(m).length > 0, '属性の中を見ていない');
  });
  T('④ manifest の名前を「Exally」に戻すと赤', () => {
    const m = clone(); m['manifest.json'] = m['manifest.json'].replace('"name": "Rakually"', '"name": "Exally"');
    ok(findOtherNames(m).some((x) => x.file === 'manifest.json'), 'manifest を見ていない');
  });
  T('⑤ ★コードのコメントは赤にしない★（前科の記録を消させない＝誤検知を作らない）', () => {
    const m = clone(); m['index.html'] = m['index.html'].replace('<body>', '<body>\n<!-- Exally の物なので置かない -->');
    ok(findOtherNames(m).length === 0, 'コメントまで数えている＝誤検知');
  });
  T('⑥ ★<script> の中も赤にしない★（中の名前 ExallyLogin は客が読まない）', () => {
    const m = clone(); m['index.html'] = m['index.html'].replace('</body>', '<script>var x = window.ExallyLogin;</script></body>');
    ok(findOtherNames(m).length === 0, '中のJSまで数えている＝誤検知');
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ═══ 本番（実ディスク） ═══ */
console.log('\n[own-name] この器は Rakually の物か（客が読む字を全画面で数える）');
const vfs = readVfs();

T('★数える物が揃っている（1枚でも読めなければ空振り）', () => {
  ok(Object.keys(vfs).length === SCREENS.length + MANIFESTS.length,
    '読めた物 ' + Object.keys(vfs).length + '／' + (SCREENS.length + MANIFESTS.length));
  const total = Object.values(vfs).reduce((a, s) => a + s.length, 0);
  ok(total > 40000, '読めた字が少なすぎる（' + total + 'バイト）＝読めていない');
  console.log('     画面 ' + SCREENS.length + '枚 ／ manifest ' + MANIFESTS.length + '本 ／ 合計 ' + total + 'バイト');
});

T('★他のアプリの名前が、客が読む字に0件（タブの題・画面の字・ホーム画面の名前）', () => {
  const hits = findOtherNames(vfs);
  if (hits.length) {
    throw new Error('★' + hits.length + '件★\n     '
      + hits.map((h) => h.file + ' の ' + h.where + ' に「' + h.name + '」').join('\n     '));
  }
  console.log('     見た名前 ' + OTHER_APPS.length + '個（' + OTHER_APPS.join(' / ') + '）→ 0件');
});

T('★据え置きの名前は「0件」に見せない（何がいつまで残るかを毎回 出す）', () => {
  const p = findPending(vfs);
  let shown = 0;
  for (const [n, where] of Object.entries(p)) {
    const e = PENDING[n];
    ok(e.reason && e.reason.length > 20, n + ': 理由が無い');
    ok(e.until, n + ': いつまでかが無い');
    ok(new Date(e.until) >= new Date('2026-08-17'), n + ': 期限切れ ' + e.until + '＝替えるか、期限を延ばす判断を仰ぐ');
    ok(where.length > 0, n + ' が0件＝もう無いなら PENDING から外すこと（残したままにしない）');
    console.log('     据え置き「' + n + '」' + where.join(' , ') + '（' + e.until + 'までに替える／' + e.where + '）');
    shown++;
  }
  ok(shown > 0, '据え置きの表が空＝この検査は空振り');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
