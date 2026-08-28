/* partner-ask.test.mjs — ★取引先を1問ずつ聞く★の見張り
 * =============================================================================
 * これが守る事（司さん 2026-08-16／指示役 2026-08-18）:
 *   ①★空欄を並べない★＝前に出た値が ★よく出る順★で候補に出る
 *   ②★当てた物には 根拠が付く★（なぜそう当てたかが空でない）
 *   ③★答えたら その場で結果を返す★（返す言葉が作られる）
 *   ④★1問ごと保存★（画面が1問ごとに倉庫を叩く）
 *   ⑤★登録番号は当てない★＝T＋13桁の検査だけ・★通信しない★
 *   ⑥★使わない物は聞かない★（紙にもExcelにも出ない欄を並べない）
 *   ⑦★同じ値を2か所が別々に持たない★（判定は lib、画面は呼ぶだけ）
 *
 * 走らせ方: node seikyu/tests/partner-ask.test.mjs
 *           node seikyu/tests/partner-ask.test.mjs --self-test   ← わざと壊して赤になるか
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const require_ = createRequire(import.meta.url);

const ASK = require_(path.join(ROOT, 'seikyu/lib/seikyu-partner-ask.js'));
const DOC = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));
const TOROKU = require_(path.join(ROOT, 'lib/toroku-no.js'));
const APP = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8');
const HUB = fs.readFileSync(path.join(ROOT, 'js/hub.js'), 'utf8');
const PAPER = fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'), 'utf8');
const AOASRC = fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-aoa.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (!c) throw new Error(m || '違う'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || '違う') + '：' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); }
function T(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  NG  ' + name + '\n      ' + e.message); }
}

/* ═══ 使う人の形（ほかの取引先が3社ある） ═══ */
const OTHERS = [
  { id: 'p2', data: { name: 'A株式会社', honor: '御中', addr: '愛媛県今治市1-1', payTerm: { kind: 'nextEom', n: 0 }, gensen: false, code: 'A007' } },
  { id: 'p3', data: { name: 'B工務店', keisho: '御中', addr: '愛媛県今治市2-2', payTerm: { kind: 'nextEom', n: 0 }, gensen: false, code: 'A003' } },
  { id: 'p4', data: { name: '山田 太郎', honor: '様', addr: '愛媛県松山市3-3', payTerm: { kind: 'eom', n: 0 }, gensen: true, code: 'A004' } },
];
const ME = { id: 'p1', data: { name: '藤原建設株式会社' } };
const ALL = OTHERS.concat([ME]);
const ctx = (over) => Object.assign({
  partner: ME, partners: ALL, invoices: [], terms: DOC.PAY_TERMS, numberFormat: 'ym-seq',
}, over || {});

console.log('\n★取引先を1問ずつ聞く★');

T('① 聞くのは 6問（番号の形が {取引先} を使う時だけ 7問）', () => {
  const r = ASK.questions(ctx());
  eq(r.total, 6, '問の数');
  eq(r.list.map((q) => q.key).join(','), 'name,honor,person,payTerm,gensen,addr', '聞く順（使う順）');
  const r2 = ASK.questions(ctx({ numberFormat: 'p-ym-seq' }));
  eq(r2.total, 7, '取引先コードを使う形の問の数');
  ok(r2.list.some((q) => q.key === 'code'), 'コードを聞いていない');
  console.log('     ' + r.list.map((q) => q.key).join(' → '));
});

T('② ★空欄を並べない★＝前に出た値が よく出る順で候補に出る', () => {
  const tc = ASK.termCandidates(DOC.PAY_TERMS, OTHERS);
  eq(tc[0].key, 'nextEom', 'いちばん多い約束が先頭でない');
  eq(tc[0].n, 2, '数え方');
  eq(tc[1].key, 'eom', '2番目');
  const heads = ASK.addrHeads(OTHERS);
  eq(heads[0].head, '愛媛県今治市', '住所の頭の候補');
  eq(heads[0].n, 2, '住所の頭の数');
  const q = ASK.questions(ctx()).list.filter((x) => x.key === 'addr')[0];
  ok(q.chips.length > 0 && /今治市/.test(q.chips[0].t), '住所の候補が画面へ渡っていない');
  console.log('     支払期限=' + tc.map((t) => t.label + ':' + t.n).join(' ') + ' ／ 住所=' + heads.map((h) => h.head + ':' + h.n).join(' '));
});

T('③ ★当てた物には 必ず根拠が付く★（空の根拠を出さない）', () => {
  const r = ASK.questions(ctx());
  const guessed = r.list.filter((q) => q.guess);
  ok(guessed.length >= 2, '当てている物が少なすぎる');
  guessed.forEach((q) => {
    ok(q.guess.why && String(q.guess.why).trim().length >= 6, q.key + ' の根拠が空か短い');
    ok(q.guess.value !== undefined && q.guess.value !== null, q.key + ' の当てが無い');
  });
  const h = ASK.honorGuess('藤原建設株式会社', OTHERS);
  eq(h.value, '御中', '会社名に株式会社が入るのに御中でない');
  ok(/株式会社/.test(h.why), '根拠に手がかりが書いていない');
  const h2 = ASK.honorGuess('山田 太郎', OTHERS);
  eq(h2.value, '御中', 'ほかで いちばん多い敬称を当てていない');
  ok(/2社|いちばん多い/.test(h2.why), '数えた根拠が書いていない');
  console.log('     ' + guessed.map((q) => q.key + '=' + q.guess.value).join(' ／ '));
});

T('④ ★源泉は「この相手への過去の請求」を先に見る★（他社の多数決より優先）', () => {
  const inv = [
    { status: 'issued', partner_id: 'p1', data: { gensen: true } },
    { status: 'issued', partner_id: 'p1', data: { gensen: true } },
    { status: 'draft', partner_id: 'p1', data: { gensen: false } },
  ];
  const g = ASK.gensenGuess('p1', inv, OTHERS);
  eq(g.value, true, '過去に源泉ありなのに「しない」と当てた');
  eq(g.kind, 'past', '根拠の種類');
  ok(/2通/.test(g.why), '何通 見たかを書いていない：' + g.why);
  const g2 = ASK.gensenGuess('p9', [], OTHERS);
  eq(g2.value, false, '他社は 2社が「しない」1社が「する」＝しない');
  eq(g2.kind, 'freq', '根拠の種類（多数決）');
  const g3 = ASK.gensenGuess('p9', [], []);
  eq(g3.kind, 'none', '手がかりが無い時は「無い」と言う');
  ok(/払う側/.test(g3.why), '誰が決めるかを言っていない');
  console.log('     過去2通→する ／ 他社の多数決→しない ／ 手がかり0→しない（理由つき）');
});

T('⑤ ★答えたら その場で結果を返す★（返す言葉が作られる）', () => {
  const r = ASK.questions(ctx({ partner: { id: 'p1', data: { name: '藤原建設株式会社', honor: '御中' } } }));
  const honor = r.list.filter((q) => q.key === 'honor')[0];
  ok(/藤原建設株式会社　御中/.test(honor.result('御中')), 'あて名を返していない：' + honor.result('御中'));
  const gen = r.list.filter((q) => q.key === 'gensen')[0];
  ok(/源泉徴収する/.test(gen.result('yes')), '源泉の結果を返していない');
  ok(/引きません/.test(gen.result('no')), '源泉なしの結果を返していない');
  /* 支払期限だけは ★日付の計算を持たない★（seikyu-doc が持ち主）＝画面が呼ぶ */
  const term = r.list.filter((q) => q.key === 'payTerm')[0];
  eq(term.result, null, '支払期限の日付を lib が別に持っている（2か所が別々に答える）');
  ok(/dueDateFrom\(todayYmd\(\)/.test(APP), '画面が seikyu-doc の期限計算を呼んでいない');
  console.log('     敬称→あて名／源泉→次の1通／期限→doc.dueDateFrom で日付');
});

T('⑥ ★1問ごとに保存する★（まとめて保存を待たせない）', () => {
  ok(/function ptAskSave\(/.test(APP), '1問ごとの保存が無い');
  ok(/S\.store\.partners\.patch\(id, patch\)/.test(APP), '倉庫へ書いていない');
  ok(/function ptAskAnswer\(/.test(APP) && /return ptAskSave\(p\.id, add, markOk\)/.test(APP), '答え→保存が繋がっていない');
  /* ★嘘の成功を出さない★＝書けなかったら そう言う */
  ok(/保存できませんでした/.test(APP.slice(APP.indexOf('function ptAskSave('), APP.indexOf('function ptAskAnswer('))), '書けなかった時に黙っている');
  /* ★日数が要る約束は 日数を聞くまで「答えた」にしない★ */
  ok(/if \(\(v === 'days' \|\| v === 'nextDay'\) && !\(n > 0\)\) markOk = null;/.test(APP), '0日後の期限を黙って作る');
  console.log('     答える→倉庫へ patch→失敗は画面に出す／日数0では答えた事にしない');
});

T('⑦ ★登録番号は当てない・打ち間違いだけ弾く・通信しない★', () => {
  /* 実在の法人番号（うちのテストに前から在る物）で 検査用数字の計算を確かめる */
  eq(TOROKU.check('T3500003003293').level, 'ok', '実在の番号を弾いた');
  eq(TOROKU.checkDigitOf('500003003293'), 3, '検査用数字の計算が違う');
  /* ★自分で作った値を真値にしない★（前科：読み取りライブラリの値を正にして 706件の逆さま）
     ＝作った番号を 同じ関数で確かめても、式を間違えたら 一緒に間違える（自己確認④で実際に素通りした）。
     杭にできるのは この2本だけ:
       ①実在の法人番号（上の T3500003003293。うちの棚に前から在る物）
       ②決まりそのもの「Σ を 9 で割った ★余りが 0 の時は 9★（0ではない）」 */
  eq(TOROKU.checkDigitOf('000000000000'), 9, '★余り0の時に 9 を返していない★（0 を返す式になっている）');
  eq(TOROKU.digitsOk('9000000000000'), true, '余り0の番号を弾いた');
  eq(TOROKU.digitsOk('0000000000000'), false, '検査用数字 0 を通した');
  /* 1桁ずらすと必ず落ちる（並びの重み 1,2,1,2… が効いているか） */
  eq(TOROKU.digitsOk('3500003003239'), false, '★下2桁を入れ替えても通る＝重みが効いていない★');
  eq(TOROKU.check('T123').ok, false, '形が違うのに通した');
  eq(TOROKU.check('1234567890123').ok, false, 'T が無いのに通した');
  /* ★検査用数字が合わなくても止めない★（個人の事業者の番号には この決まりが無い） */
  const d = TOROKU.check('T1234567890123');
  eq(d.level, 'digit', '検査用数字の違いを見ていない');
  eq(d.ok, true, '★個人の番号かもしれないのに 止めている★');
  eq(TOROKU.check('Ｔ３５００００３００３２９３').level, 'ok', '全角で打つと弾かれる');
  /* ★通信しない★ */
  const src = fs.readFileSync(path.join(ROOT, 'lib/toroku-no.js'), 'utf8');
  ok(!/fetch\(|XMLHttpRequest|https?:\/\//.test(src.replace(/^\s*\*.*$/gm, '')), '★登録番号の判定が外へ出ている★');
  /* ★同じ判定を2か所に書かない★＝画面は lib を呼ぶだけ */
  ok(/TorokuNo/.test(APP) && /TOROKU\.check\(/.test(APP), '請求書の画面が lib を使っていない');
  ok(/TorokuNo/.test(HUB) && /TOROKU\.check\(/.test(HUB), '共有データの画面が lib を使っていない');
  ok(!/[0-9]{12}/.test(APP.replace(/\?v=[0-9a-f]+/g, '')), '画面に13桁の数字が書いてある（判定を書き写した疑い）');
  console.log('     実在の番号=通る ／ 形違い=弾く ／ 検査数字違い=注意だけ ／ 通信0');
});

T('⑧ ★使わない物は聞かない★（紙にもExcelにも出ない欄を並べない）', () => {
  const keys = ASK.questions(ctx({ numberFormat: 'p-ym-seq' })).list.map((q) => q.key);
  ok(keys.indexOf('zip') < 0, '郵便番号を聞いている（紙0箇所・Excel0箇所）');
  ok(keys.indexOf('tel') < 0, '電話番号を聞いている（紙0箇所・Excel0箇所）');
  ok(keys.indexOf('invoiceNo') < 0, '相手の登録番号を聞いている（紙0箇所・法定の記載事項でもない）');
  /* ★測った事実そのものを見張る★＝紙とExcelが これらを使い始めたら この見張りが赤になる */
  eq(/p\.zip|partner\.zip/.test(PAPER), false, '紙が取引先の郵便番号を使い始めた（なら聞く物に戻す）');
  eq(/p\.tel|partner\.tel/.test(PAPER), false, '紙が取引先の電話を使い始めた（なら聞く物に戻す）');
  eq(/p\.invoiceNo/.test(PAPER), false, '紙が取引先の登録番号を使い始めた（なら聞く物に戻す）');
  eq(/p\.zip|p\.tel|p\.invoiceNo/.test(AOASRC), false, 'Excelが使い始めた（なら聞く物に戻す）');
  /* 住所は Excel が使う＝聞く */
  ok(/p\.addr/.test(AOASRC), 'Excelが住所を使っていない（なら住所も聞かない）');
  ok(keys.indexOf('addr') >= 0, '住所を聞いていない（Excelに出るのに）');
  /* ★聞く順から外すだけ。画面から消さない★（指示役 2026-08-18 の条件）
     ＝入れてある会社が「無くなった」と思う／郵送・電話に使う人が居る。
     ★「ぜんぶ見る」の畳みの中に在る事★ を機械で見張る（外に出ていても赤）。 */
  const foldAt = HTML.indexOf('<details class="pt-all"');
  ok(foldAt > 0, '「ぜんぶ見る」の畳みが無い');
  /* ★終わりは その畳みの終わり★（先頭から数えると 別の畳みで切れて 中身が空になる） */
  const fold = HTML.slice(foldAt, HTML.indexOf('</details>', foldAt));
  ['s-pzip', 's-ptel', 's-pinvoice'].forEach((id) => {
    ok(new RegExp('id="' + id + '"').test(fold), '★' + id + ' が「ぜんぶ見る」から消えている（消すなと言われている）★');
  });
  /* 聞く順の外＝畳みの外に 出していない事（一度に見せる数を増やさない） */
  const outside = HTML.replace(fold, '');
  ['s-pzip', 's-ptel', 's-pinvoice'].forEach((id) => {
    ok(!new RegExp('id="' + id + '"').test(outside), '★' + id + ' を畳みの外に出している（一度に見せる数が増える）★');
  });
  console.log('     聞く=' + keys.join(',') + ' ／ 郵便番号・電話・相手の登録番号は 紙もExcelも0箇所');
});

T('⑨ ★画面そのものが対話★（別ウィザードを作らない・ぜんぶ見るは残す）', () => {
  ok(/id="pt-ask-set"/.test(HTML), '設定の取引先が対話になっていない');
  ok(/id="pt-ask-card"/.test(HTML) && /id="pt-ask-edit"/.test(HTML), '入力の画面で聞けない（設定へ行かせている）');
  ok(/id="pt-all"/.test(HTML) && /ぜんぶ見る/.test(HTML), '「ぜんぶ見る」を消した（直せなくなる）');
  /* ★見える字だけを見る★（説明の書き込みは客に見えない＝数えると自分の注意書きで赤くなる） */
  const seen = HTML.replace(/<!--[\s\S]*?-->/g, '');
  ok(!/wizard|ウィザード|ステップ1|STEP/.test(seen), '別ウィザードを作っている');
  /* ★答え終われば 自分で消える★ */
  const rp = APP.slice(APP.indexOf('function renderPtAsk('), APP.indexOf('function ptAskSave('));
  ok(/r\.next/.test(rp) && /show\(card, on\)/.test(rp), '答え終わっても入力画面に空欄が残る');
  /* ★ぜんぶ見るで入れた物を もう一度 聞かない★ */
  ok(/\['honor', 'person', 'addr', 'code', 'payTerm', 'gensen'\]\.forEach\(function \(k\) \{ askOk\[k\] = true; \}\)/.test(APP),
    'ぜんぶ見るで入れた物が「答えた」にならない＝同じ事を2度 聞く');
  console.log('     設定＋入力の2か所で同じ描き手／ぜんぶ見るは残す／答え終われば消える');
});

T('⑩ ★読ませる字は薄い黒・色は押せる物だけ★（全アプリの決まり）', () => {
  const css = fs.readFileSync(path.join(ROOT, 'seikyu/css/app.css'), 'utf8');
  const block = css.slice(css.indexOf('.pask {'));
  ok(block.length > 200, '聞く形の見た目が入っていない');
  /* ★皮に在る色だけ★（勝手な緑を増やすと 3アプリでバラける＝前科）
     ＋★本文には色を足さない★＝読ませる字は 皮から受け継ぐ */
  const skin = fs.readFileSync(path.join(ROOT, 'css/rakunally-ui.css'), 'utf8');
  const inSkin = new Set((skin.match(/#[0-9A-Fa-f]{6}\b/g) || []).map((c) => c.toUpperCase()));
  const used = (block.match(/#[0-9A-Fa-f]{6}\b/g) || []).map((c) => c.toUpperCase());
  used.forEach((c) => ok(inSkin.has(c), '★皮に無い色 ' + c + ' を足している★'));
  const colors = used;
  /* ★読ませる字は「薄い黒」を必ず書く★
     ここは前は「色を書かない＝皮から受け継ぐ」にしていた。本物のブラウザで実測したら
     ★この画面は body の字の色が主色の緑（#2E7D54）★で、受け継いだ字が ★全部 緑★になっていた
     （押す物は受け継がず 真っ黒 rgb(0,0,0)）。＝★受け継ぐ★では決まりを守れない。
     使う黒は ★#333333★（司さんの決定・代行請求が本番へ入れた値／指示役 2026-08-18 裁定）。
     ★2つの「薄い黒」を作らない★＝皮の側も同じ値にした（css/rakunally-ui.css）。 */
  const BLACK = '#333333';
  ['.pask', '.pask-qt', '.pask-hint', '.pask-prog', '.pask-guess', '.pask-o', '.pask-c',
    '.pask-skip', '.pask-d', '.pask-d-k', '.pask-d-v', '.pask-d-r', '.pask-fin', '.pask-note-in > div',
  ].forEach((sel) => {
    const esc2 = sel.replace(/[.>]/g, (c) => '\\' + c).replace(/ /g, '\\s*');
    const rule = (new RegExp(esc2 + '\\s*\\{([^}]*)\\}').exec(block) || [])[1] || '';
    ok(rule, '★' + sel + ' の見た目が無い★');
    const c = (/color:\s*(#[0-9A-Fa-f]{6})/.exec(rule) || [])[1];
    ok(c && c.toUpperCase() === BLACK, '★' + sel + ' の読ませる字が 薄い黒でない（' + (c || '色を書いていない＝この画面では緑になる') + '）★');
  });
  /* ★主色で本文を書かない★（色は押せる物と選ばれている物だけ） */
  ['.pask-qt', '.pask-hint', '.pask-d-v'].forEach((sel) => {
    const esc2 = sel.replace(/[.>]/g, (c) => '\\' + c);
    const rule = (new RegExp(esc2 + '\\s*\\{([^}]*)\\}').exec(block) || [])[1] || '';
    ok(!/#2E7D54/i.test(rule), '★' + sel + ' を主色の緑で書いている★');
  });
  /* ★禁じている濃い緑は tests/no-dark-green.test.mjs が repo 全体で見張る★
     ここに その色の文字を書くと、その見張り自身が赤くなる（実際に赤くした）＝二重に書かない。 */
  ok(inSkin.has('#2E7D54'), '皮に主色が無い（皮を読み違えている）');
  /* ★入力欄は16px★（iOSが勝手に拡大する） */
  ok(/\.pask-q \.finput \{[^}]*font-size:\s*16px/.test(block), '入力欄が16pxでない（iOSで画面が飛ぶ）');
  /* ★flexの箱で1文字ずつ縦に割れる前科★＝縮む側に min-width:0 */
  ok(/\.pask-n \.finput \{[^}]*min-width:\s*0/.test(block), 'flexの箱で字が縦に割れる');
  console.log('     色=' + Array.from(new Set(colors)).join(' ') + ' ／ 入力欄16px ／ min-width:0');
});

T('⑪ ★「決めていない」を先頭に置かない★（急いで押した人を 期限なしにしない）', () => {
  /* 2026-08-18 DB-test の本物の1周で判明：
     手がかり（他の取引先の約束）が0だと 元の並びの先頭＝「決めていない」が候補の先頭に来て、
     ★押した瞬間に 支払期限の無い請求書★になっていた。 */
  const none = ASK.termCandidates(DOC.PAY_TERMS, []);
  eq(none[0].key !== 'none', true, '★手がかり0で 先頭が「決めていない」★');
  eq(none[none.length - 1].key, 'none', '「決めていない」が最後でない');
  /* 数が在る時の並びは 変えない（よく出る順が勝つ） */
  const some = ASK.termCandidates(DOC.PAY_TERMS, OTHERS);
  eq(some[0].key, 'nextEom', 'よく出る順が壊れた');
  eq(some[some.length - 1].key, 'none', '数が同じ物の中で「決めていない」が最後でない');
  console.log('     手がかり0 → ' + none.map((t) => t.label).join(' / '));
});

/* ═══ ★自己確認★ わざと壊して 赤になるか ═══
   ★見せかけの自己確認にしない★＝作り物を見て赤くするのではなく、
   ★本物の lib のソースを その場で書き換えて読み直し★、本番と同じ判定にかける。
   （ファイルには一切 書かない。読み直した物だけを壊す） */
if (process.argv.includes('--self-test')) {
  console.log('\n★自己確認（本物のソースを その場で壊して 赤になるか）★');
  let sp = 0, sf = 0;
  function reload(file, from, to) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (src.split(from).length - 1 !== 1) throw new Error('壊す目印が1件でない: ' + from.slice(0, 30));
    const m = { exports: {} };
    new Function('module', 'exports', src.replace(from, to))(m, m.exports);
    return m.exports;
  }
  const S = (name, fn) => {
    let red = false, why = '';
    try { fn(); } catch (e) { red = true; why = e.message; }
    if (red) { sp++; console.log('  ok  ' + name + '（赤：' + why.slice(0, 44) + '）'); }
    else { sf++; console.log('  NG  ' + name + '（★壊しても赤にならない＝見張りが効いていない★）'); }
  };

  S('①根拠を空にする', () => {
    const bad = reload('seikyu/lib/seikyu-partner-ask.js',
      "why: '会社名に「' + hit + '」が入っています＝組織あての紙なので「御中」'", "why: ''");
    const g = bad.honorGuess('藤原建設株式会社', OTHERS);
    ok(g.why && String(g.why).trim().length >= 6, '根拠が空');
  });
  S('②よく出る順をやめて 元の並びのままにする', () => {
    const bad = reload('seikyu/lib/seikyu-partner-ask.js',
      'return (b.n - a.n) || (a.i - b.i);', 'return a.i - b.i;');
    const tc = bad.termCandidates(DOC.PAY_TERMS, OTHERS);
    eq(tc[0].key, 'nextEom', 'いちばん多い約束が先頭でない');
  });
  S('③検査用数字の違いで 止めてしまう', () => {
    const bad = reload('lib/toroku-no.js', "ok: true, level: 'digit'", "ok: false, level: 'digit'");
    eq(bad.check('T1234567890123').ok, true, '個人の番号かもしれないのに 止めている');
  });
  S('④「余りが0なら9」を 0 にしてしまう（実在の1件だけでは 気づけない壊し方）', () => {
    const bad = reload('lib/toroku-no.js', 'return 9 - r;', 'return (9 - r) % 9;');
    eq(bad.checkDigitOf('000000000000'), 9, '余り0の時に 9 を返していない');
  });
  S('④-b 重みの 1,2,1,2… を ぜんぶ 1 にする', () => {
    const bad = reload('lib/toroku-no.js', 'var q = (n % 2 === 1) ? 1 : 2;', 'var q = 1;');
    eq(bad.check('T3500003003293').level, 'ok', '実在の番号を弾いた');
  });
  S('⑦「決めていない」を先頭に戻す', () => {
    /* ★並べ替えを丸ごと止める★（1行だけ戻しても もう1行が効いてしまう＝壊し方が弱かった） */
    const bad = reload('seikyu/lib/seikyu-partner-ask.js',
      "      if (a.v === 'none' && b.v !== 'none') return 1;\n      if (b.v === 'none' && a.v !== 'none') return -1;",
      '      return 0;');
    const none = bad.termCandidates(DOC.PAY_TERMS, []);
    eq(none[0].key !== 'none', true, '手がかり0で 先頭が「決めていない」');
  });
  S('⑤郵便番号を 聞く物に戻す', () => {
    const bad = reload('seikyu/lib/seikyu-partner-ask.js', '    if (usesCode) {',
      "    list.push({ key: 'zip', q: '郵便番号は？', kind: 'text', now: '', done: false });\n    if (usesCode) {");
    const keys = bad.questions(ctx()).list.map((q) => q.key);
    ok(keys.indexOf('zip') < 0, '郵便番号を聞いている');
  });
  S('⑥「ぜんぶ見る」で入れた物を 答えた事にしない（同じ事を2度 聞く）', () => {
    const rx = /\['honor', 'person', 'addr', 'code', 'payTerm', 'gensen'\]\.forEach\(function \(k\) \{ askOk\[k\] = true; \}\);/;
    const broken = APP.replace(rx, '/* 消した */');
    ok(rx.test(broken), 'ぜんぶ見るで入れた物が「答えた」にならない');
  });
  console.log('\n自己確認: ' + sp + ' 通り 赤になった / ' + sf + ' 通り 効いていない');
  if (sf) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
