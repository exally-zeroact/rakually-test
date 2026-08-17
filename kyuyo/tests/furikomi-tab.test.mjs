/* furikomi-tab.test.mjs — ★「振込」を印刷タブから切り離す★
 *
 * なぜやるか（2026-08-04・指示役）:
 *   印刷タブが「明細を刷る」「銀行に送るデータを作る」の2つを抱えていて長い。
 *   別の仕事なので、下のタブを5つにして分ける。
 *   ★機能は消さない。移すだけ。★
 *
 * ここで固定すること:
 *   ① 下のタブが5つ（設定 / 入力 / 一覧・集計 / 印刷 / 振込）
 *   ② 振込の中身（委託者情報・全銀ファイル・振込一覧Excel）が★1つも減っていない★
 *   ③ 印刷タブから振込が消えている（両方に出しっぱなしにしない）
 *   ④ ★0件のときボタンを押せない★＋理由が横に出る
 *   ⑤ ★0件で空のファイルを作らない★（押せてしまった時の最後の砦）
 *   ⑥ 入力済みの値が消えない（委託者情報は state.company に入る＝画面を移しても同じ場所）
 *
 * 使い方: node tests/furikomi-tab.test.mjs
 *         node tests/furikomi-tab.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };

/* ★純関数: 振込の対象から「押せるか／なぜ押せないか」を決める。
 *   画面もライブラリも触らないので self-test で作り物を通せる。 */
export function furikomiGate(transfers) {
  const rows = transfers || [];
  const ready = rows.filter(t => t.ready && t.amount > 0);
  const listed = rows.filter(t => t.amount > 0);          // 振込一覧Excelに載る分
  return {
    zengin: { enabled: ready.length > 0, count: ready.length,
      reason: ready.length ? '' : (listed.length ? '振込先(銀行・支店・口座)が入っていません' : '対象月に振込む人がいません'),
      // ★短い理由＝ボタンの中に入れる用（下まで読ませない）
      short: ready.length ? '' : (listed.length ? '振込先なし' : '対象者なし') },
    xlsx: { enabled: listed.length > 0, count: listed.length,
      reason: listed.length ? '' : '対象月に振込む人がいません',
      short: listed.length ? '' : '対象者なし' },
  };
}

/* HTMLから下タブを読む（人が書き写さない） */
function navTabs() {
  const nav = (/<nav class="botnav">([\s\S]*?)<\/nav>/.exec(HTML) || [])[1] || '';
  return [...nav.matchAll(/data-scr="([^"]+)"[\s\S]*?<span class="bn-l">([^<]*)<\/span>/g)]
    .map(m => ({ scr: m[1], label: m[2] }));
}
/* 指定したセクションの中身を切り出す。
   ★閉じタグまでで止める。★ 次のセクションの手前までにすると、間に書いた説明文
   （「furi-card を移した」等）まで拾ってしまい、★移したのに「残っている」と嘘の赤を出す★。 */
function section(id) {
  const re = new RegExp('<section[^>]*id="' + id + '"[\\s\\S]*?\\n  </section>');
  return (re.exec(HTML) || [''])[0];
}

/* ══ self-test ═══════════════════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  console.log('\n[furikomi-tab --self-test] 押せる／押せないの判定が正しいか');
  T('★誰もいなければ両方とも押せない＋理由が出る', () => {
    const g = furikomiGate([]);
    if (g.zengin.enabled || g.xlsx.enabled) throw new Error('押せてしまう');
    if (!g.zengin.reason || !g.xlsx.reason) throw new Error('理由が空');
  });
  T('★振込先が未入力なら 全銀は押せない／一覧Excelは押せる（理由も違う）', () => {
    const g = furikomiGate([{ amount: 250000, ready: false }]);
    if (g.zengin.enabled) throw new Error('全銀が押せてしまう');
    if (!g.xlsx.enabled) throw new Error('一覧Excelまで止めている（機能を消している）');
    if (!/振込先/.test(g.zengin.reason)) throw new Error('理由が「振込先が無い」になっていない: ' + g.zengin.reason);
  });
  T('揃っていれば両方押せる（誤って止めない）', () => {
    const g = furikomiGate([{ amount: 250000, ready: true }]);
    if (!g.zengin.enabled || !g.xlsx.enabled) throw new Error('押せない');
    eq(g.zengin.count, 1, '件数');
  });
  T('★金額0の人は数えない（0円を銀行に送らない）', () => {
    const g = furikomiGate([{ amount: 0, ready: true }]);
    if (g.zengin.enabled || g.xlsx.enabled) throw new Error('0円だけなのに押せる');
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ══ 本番（実物を見る） ═══════════════════════════════════════════════ */
console.log('\n[furikomi-tab] 振込を印刷から切り離す');

const TABS = navTabs();

T('★① 下のタブが5つ（設定 / 入力 / 一覧・集計 / 印刷 / 振込）', () => {
  eq(TABS.length, 5, '下タブの数（' + TABS.map(t => t.label).join(' / ') + '）');
  if (!TABS.some(t => t.scr === 'scr-furikomi')) throw new Error('振込のタブ(scr-furikomi)が無い');
  if (!/振込/.test((TABS.find(t => t.scr === 'scr-furikomi') || {}).label || '')) throw new Error('振込タブの名前が「振込」でない');
});

T('★② 振込の中身が1つも減っていない（機能は消さず移すだけ）', () => {
  const furi = section('scr-furikomi');
  if (!furi) throw new Error('scr-furikomi の画面が無い');
  for (const need of ['furi-card', 'furi-box']) {
    if (furi.indexOf(need) < 0) throw new Error('振込画面に ' + need + ' が無い');
  }
  // 中身を作るのは app.js の renderFuri。委託者情報・全銀・一覧Excelが全部そろっているか。
  for (const need of ['furiCode', 'furiName', 'furiBankName', 'furiBankNo', 'furiBranchName',
    'furiBranchNo', 'furiYokin', 'furiAccount', 'furiDate', 'b-zengin', 'b-furixlsx']) {
    if (APP.indexOf(need) < 0) throw new Error('振込の項目 ' + need + ' が消えている');
  }
});

T('★③ 印刷タブから振込が消えている（両方に出しっぱなしにしない）', () => {
  const pr = section('scr-print');
  if (!pr) throw new Error('scr-print が読めない＝この検査が空振り');
  if (/furi-card|furi-box/.test(pr)) throw new Error('印刷タブに振込が残っています');
  // 空振り検知: 印刷タブ本来の中身は残っていること
  if (!/b-print/.test(pr)) throw new Error('印刷タブの中身まで消えています');
});

T('★④ 0件のときボタンを押せない＋理由が【ボタンの中】に出る（下まで読ませない）', () => {
  if (!/furikomiGate|b-zengin[^>]*disabled|disabled/.test(APP)) throw new Error('押せなくする作りが無い');
  if (APP.indexOf('furikomiGate') < 0) throw new Error('押せるかの判定(furikomiGate)を面が使っていない');
  if (!/gate\.zengin\.short/.test(APP)) throw new Error('理由を画面に出していない');
  // ★理由はボタンの中（b-zengin のタグから閉じタグまで）に入っていること
  const btn = (/<button[^>]*id="b-zengin[\s\S]{0,400}?<\/button>/.exec(APP) || [''])[0];
  if (!/gate\.zengin\.short/.test(btn)) throw new Error('★理由がボタンの中に入っていない: ' + btn.slice(0, 120));
  // ★下の小さい説明2行は消えていること（読まれない場所に理由を置かない）
  if (/全銀ファイル：'\+esc\(gate\.zengin\.reason\)/.test(APP)) throw new Error('★下の説明行が残っている');
});

T('★⑤ 0件で空のファイルを作らない（押せてしまった時の最後の砦）', () => {
  const zg = (/function downloadZengin\(\)[\s\S]*?\n  \}/.exec(APP) || [''])[0];
  const xl = (/function downloadFuriExcel\(\)[\s\S]*?\n  \}/.exec(APP) || [''])[0];
  if (!zg || !xl) throw new Error('渡す処理を読めない＝この検査が空振り');
  if (!/if\s*\(\s*!\s*\w+\.length\s*\)/.test(zg)) throw new Error('全銀: 0件で止めていない（空ファイルが落ちる）');
  if (!/if\s*\(\s*!\s*\w+\.length\s*\)/.test(xl)) throw new Error('振込一覧Excel: 0件で止めていない（空ファイルが落ちる）');
});

T('★⑥ 入力済みの値が消えない（委託者情報は会社の設定に入る＝画面を移しても同じ場所）', () => {
  if (!/data-fc=/.test(APP)) throw new Error('委託者情報の入力(data-fc)が無い');
  // data-fc を拾って state.company に書く配線が、振込画面でも生きていること
  if (!/#furi-box/.test(APP)) throw new Error('振込の入れ物(#furi-box)への配線が無い');
});

/* ★⑦〜⑩ 改行コード（2026-08-08）
   全銀の改行は銀行ごとに違う。★1つに固定すると、今 通っている銀行が明日 弾かれる。★
   実際に押して測るのは tests/integration.mjs（jsdomで実物のボタン→渡されたバイト列）。
   ここでは「面が lib に渡す形になっているか」「一次情報の表があるか」を見る。 */
T('★⑦ 改行は【折りたたみの中】。普段は見せない／中身は lib から作る', () => {
  if (!/data-fc="furiNewline"/.test(APP)) throw new Error('行の終わりの選択が無い');
  if (!/data-fc="furiBank"/.test(APP)) throw new Error('★銀行の選択が無い（人に改行を選ばせる作りのまま）');
  if (!/銀行に取り込めなかった時/.test(APP)) throw new Error('★折りたたみの見出しが「いつ使うか」になっていない');
  if (!/Zengin\.NEWLINES/.test(APP) || !/Zengin\.BANKS/.test(APP)) throw new Error('選択肢を lib から作っていない＝二重に持っている');
  // ★折りたたみは既定で閉じている（開いた状態を保存しない）
  if (!/var furiFoldOpen\s*=\s*false/.test(APP)) throw new Error('★既定で開いている');
  // ★「CR+LFとは…」の解説を画面に書かない
  if (/CR\+LF\s*(とは|は改行)/.test(APP)) throw new Error('★解説文を書いている（読まれない）');
});

T('★⑪ 未確認の銀行は改行を動かさない（libで担保）', () => {
  const Z = fs.readFileSync(path.join(ROOT, 'lib/zengin.js'), 'utf8');
  if (!/b\.confirmed/.test(Z)) throw new Error('★確認済みかどうかを見ずに銀行の形を使っている');
  const rows = [...Z.matchAll(/confirmed:\s*false[^}]*/g)];
  if (rows.length < 4) throw new Error('未確認の行が少なすぎる＝この検査が空振り');
});

T('★⑫ 委託者情報が空なら先に案内を出す（埋める順番を伝える）', () => {
  if (!/まず下の「委託者情報」を埋めてください/.test(APP)) throw new Error('★案内が無い');
  if (!/needBasics/.test(APP)) throw new Error('空かどうかを見ていない＝常に出る/常に出ない');
});

T('★⑧ 押した時、その会社の設定を lib に渡している（渡し忘れ＝銀行で弾かれる）', () => {
  const zg = (/function downloadZengin\(\)[\s\S]*?\n  \}/.exec(APP) || [''])[0];
  if (!zg) throw new Error('downloadZengin を読めない＝この検査が空振り');
  if (!/Zengin\.build\([^)]*,\s*\{[^}]*newline/.test(zg)) throw new Error('★Zengin.build に改行の設定を渡していない');
  if (!/furiNewline/.test(zg)) throw new Error('★会社の設定(furiNewline)を見ていない');
});

T('★⑨ 一次情報の対応表がある（推測で表を埋めない・出典URL付き）', () => {
  const p = path.join(ROOT, 'docs/zengin-newline-banks.md');
  if (!fs.existsSync(p)) throw new Error('docs/zengin-newline-banks.md が無い');
  const md = fs.readFileSync(p, 'utf8');
  const urls = md.match(/https?:\/\/[^\s)]+/g) || [];
  if (urls.length < 8) throw new Error('出典URLが少なすぎる（' + urls.length + '本）＝表が推測で埋まっている疑い');
  for (const bank of ['大分銀行', '楽天銀行', 'JAバンク']) {
    if (md.indexOf(bank) < 0) throw new Error('対応表に ' + bank + ' が無い');
  }
  if (!/未確認/.test(md) || !/未測定/.test(md)) throw new Error('★測れていない所を「未確認/未測定」と書いていない（0件・異常なしにしている）');
});

T('★⑩ 既定は CRLF のまま（今 通っている形を1バイトも変えていない）', () => {
  const Z = fs.readFileSync(path.join(ROOT, 'lib/zengin.js'), 'utf8');
  if (!/NEWLINE_DEFAULT\s*=\s*'CRLF'/.test(Z)) throw new Error('★既定が CRLF でなくなっている');
});

console.log('\n── 実測 ──');
console.log('  下タブ: ' + TABS.map(t => t.label).join(' / '));
const g0 = furikomiGate([]), g1 = furikomiGate([{ amount: 250000, ready: false }]);
console.log('  0件      : 全銀=' + (g0.zengin.enabled ? '押せる' : '押せない（' + g0.zengin.reason + '）')
  + ' / 一覧Excel=' + (g0.xlsx.enabled ? '押せる' : '押せない（' + g0.xlsx.reason + '）'));
console.log('  振込先未入力: 全銀=' + (g1.zengin.enabled ? '押せる' : '押せない（' + g1.zengin.reason + '）')
  + ' / 一覧Excel=' + (g1.xlsx.enabled ? '押せる' : '押せない'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
