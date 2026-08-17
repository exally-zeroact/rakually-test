/* seikyu-paper.js — ★請求書の紙を刷る唯一の場所★
 * ==============================================================================
 * ★焼き付けてよい型は「法律」だけ★（2026-08-10 指示役の方向の訂正）
 *   国税庁 適格請求書の記載事項6つ ＝ 業種に関係なく必ず要る＝ここは動かさない。
 *     ①発行する側の名称と登録番号 ②取引年月日 ③取引の内容（軽減税率の対象である旨）
 *     ④税率ごとの対価の額と適用税率 ⑤税率ごとの消費税額 ⑥受け取る側の名称
 *   ★これ以外の言い回し（挨拶文・ラベルの字間・和暦・¥・ページ送りの言葉）は
 *     「出せる」ようにしてあるだけで、「出さなければ赤」にはしていません。★
 *   理由: 代行請求アプリは ★源泉なし・繰越なし・非課税なし・1税率★＝一番 単純な1業種の紙。
 *         見本としては良いが、そこに錠を掛けると 士業（源泉）・掛け売り（繰越）・
 *         不動産（非課税）の客が全部 落ちる。★見本は写す相手ではない。★
 *
 * ★見た目の決めごと（うちの家の作り。理由は「他所がそうだから」ではない）★
 *   ・金額は ★枠で囲まず、大きく出して下に細い線★
 *     ＝紙の主役は金額。塗った箱に入れると「囲みの中の一情報」に見えて主役が下がる。
 *   ・お振込先・備考も ★囲まない★。囲みが増えるほど、どこを読めばよいか分からなくなる。
 *   ・明細は ★縦の罫を引かず、横の細い罫だけ★。列を会社が足せるので、
 *     縦罫があると列を増やすたびに紙が檻のようになる。
 *   ・色は Exally／Kyually と同じ緑（css/exally-ui.css と同じ13色から）。
 *     ※代行請求（ダイコメの製品）は今 事務所の青(#007AFF)ですが、それは別の家の色です。
 *
 * ★税率の数字を1つも書かない★（区分は seikyu-tax.js が出した物を並べるだけ）
 * ★画面に依らない（DOMを1つも触らない）／時計も乱数も持たない★
 *
 * 見本として読んだ物（写してはいない）: daikou-seikyu-test/invoice-pdf.js
 *
 * 【利用】ブラウザ window.SeikyuPaper ／ Node require('./seikyu-paper.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./seikyu-cols.js'), require('./seikyu-carry.js'), require('./seikyu-doc.js'));
  else root.SeikyuPaper = factory(root.SeikyuCols, root.SeikyuCarry, root.SeikyuDoc);
})(typeof self !== 'undefined' ? self : this, function (COLS, CARRY, DOC) {
  'use strict';
  if (!COLS) throw new Error('seikyu-cols.js を先に読んでください');
  if (!CARRY) throw new Error('seikyu-carry.js を先に読んでください');
  if (!DOC) throw new Error('seikyu-doc.js を先に読んでください');

  /* ★繰越の行の名前は「繰越 lib」が持ち主★
     紙の側に書き写すと、片方だけ直した時に画面と紙で名前が食い違う。 */
  var CARRY_ROWS = CARRY.ROWS;

  var TEMPLATE_ID = 'std1';

  /* 1枚に載る明細の行数。★ここを超えたら次の紙へ送る（黙って切らない）★
     1枚目は 宛名・挨拶・御請求金額 が乗るぶん少ない。 */
  /* ★項目が少なくても 紙の顔を同じにする★
     うちの実物が すでにそうなっている（実測 2026-08-15）:
       黒田空調 … 入っているのは6行／枠は ★12〜41行＝30行★
       ENEOS   … 入っているのは2行／枠は ★同じ30行★
       八木工業 … 控除の枠は ★E17:H20＝4行★（1行しか使っていない）
     ＝★中身が2行でも6行でも、毎月 同じ場所に同じ物が来る★。
       経理の人は「いつも同じ場所」を見るので、動くと毎回 探し直しになる。
     ★足りない行は空の枠のまま残す（罫線は消さない）★
     ★固定にするのは「紙」だけ★＝入力の画面は今までどおり可変（空欄を並べて埋めさせない）。 */
  /* ★行の高さは1か所で決める★＝左（明細）と右（控除）の罫線がずれない
     （2026-08-15 司さんの指摘：右の空の枠の横線が左と合っていなかった） */
  /* ★行の高さは実物に合わせる★（2026-08-15 実物32枚を機械で読んだ数字）
       xlsx の row/@ht ＝ 中央値 ★17.85pt＝6.3mm★（最小 5.29mm ／ 最大 6.35mm・32枚全部）
       上下の余白も32枚 全部 ★0.748in＝19mm★
     ★前は 7.2mm と書いてあったのに 実際は 8.1mm で刷れていた★
       ＝ height は「最低の高さ」でしかなく、中身（9.5pt×1.55＋上下1.4mm＝30.2px）の方が高くて
         ROW_H が ★一度も効いていなかった★。だから余白と行間も ここで決める。 */
  /* ★罫の太さは1か所★（濃さは THEME.line）＝紙の中に太さの違う線を作らない */
  var HAIR = '0.5pt';
  /* ★表の外側の余白は1つ★（司さん 2026-08-16「左揃えか中央か右かきっちりやれ」）
     明細・締め・控除・（内訳）で バラバラ（1.2mm と 3mm）だったので、
     ★数字の右端が表ごとに違う位置★に来ていた。ここで1つに決める。 */
  var EDGE = '1.2mm';
  var ROW_H = '6.3mm';
  var ROW_PAD = '0.9mm 1.2mm';
  var ROW_LH = '1.35';
  /* ★A4 1枚に載る行数★（★実測して決めた数★）
     ★紙は A4 そのもの（297mm 固定）★になったので、入れすぎると ★黙って切れる★。
     ＝★ここが物理の上限★。会社が これより大きい数を入れても ここで頭打ちにして、
       残りは2枚目に送る（★黙って切らない★）。画面はその事を人に言う。

     ★実測（Chromium・1行ずつ26行まで総当たり／2026-08-16）★
       紙 A4 297mm＝1123px − 上下の余白 10mm×2 ＝ ★使える高さ 1047px★
       足元（締め＋振込先）＝ ★280px★（控除あり）／ ★222px★（控除なし）
       → 載る最大 ＝ ★21行★（控除なし・余り0px）／ ★10行★（控除あり・余り0px）
         ＋1行で −3px ＝ ★足元に食い込む★ ので ここが上限。

     ★数字が動いた履歴（★紙に何か足した日／並べ替えた日に 必ず測り直す★）★
       30/21/14（当てずっぽう・全部はみ出し）→ 16/7（行の高さを実物6.3mmに）
       → 16/6（締めに控除の行）→ 20/10（紙の頭を詰めた）→ 22/12（A4固定＋足元を下端に）
       → 21/11（振込先の名義を次の行に）→ 21/10（箱に字の余白）
       → 19/9（頭の並びを どの紙も同じにした＝挨拶と ページ番号が明細の上に来た）
       → ★18/8（振込先の高さを 3行ぶんで固定＝名義が長い会社でも 行数が変わらない）★
         ・1枚物 … 控除あり ★9行★／控除なし ★19行★（実測・余り0px）
         ・複数ページの最後の紙は もう少し入るが、★1枚物に合わせる★（毎月おなじ顔）

     ★実物（32枚）との突き合わせ★
       黒田空調/ENEOS ＝ 30行 ／ ★八木（控除あり）＝ 3行★（控除枠は4行）
       実物が30行 入るのは頭が小さいから。うちは 21行まで来た（差は
       「ご請求金額を大きく」「振込先を枠で囲う」＝★うちが決めて残した所★）。 */
  var PAPER_ROWS = 18;        // 控除を出さない紙（★実測＝物理の上限★）
  var PAPER_ROWS_DED = 8;    // 控除を出す紙（★実測＝物理の上限★）
  var DEDUCT_ROWS = 4;        // 控除の枠 ★会社が変えられる★（実物 八木＝E17:H20＝4行）
  var ROWS_FIRST = 12;
  var ROWS_REST = 24;

  /* 色は★直hex★。★禁止色（濃い緑）は使わない＝緑は #2E7D54★ */
  /* ★色は役割で持つ／読ませる字は「薄い黒」★（司さん 2026-08-16）
     見本＝代行請求の invoice-pdf.js（クラシック）を読んで、そこの役割分けに合わせた:
       inkStrong #0d0d0d 主役 ／ ink #1a1a1a 本文 ／ muted #6b6b6b 補助
       ruleHairline #b0b0b0 罫（★FAX/白黒で消えないよう一段濃く★ と註がある）
     うちは 全アプリの決まり「読ませる字は #333 前後の薄い黒」に寄せて ink=#333333。
     ★紙に「押せる物」は無い＝色で強弱を作らない。強弱は 大きさ と 太さ で作る。★
     ★線は1種類だけ★（前は 薄い罫 0.7pt と 濃い緑 0.9pt が混ざっていて、
       「明細の合計」だけ線が濃く見えた＝司さんの指摘①） */
  var THEME = {
    ink: '#333333',       // 本文・数字・金額（★薄い黒★）
    sub: '#6B6B6B',       // 補助文（挨拶・ラベル）
    line: '#B0B0B0',      // ★罫は1種類（この1色・この太さ）★
    accent: '#B0B0B0',    // 飾り線も同じ罫（色で強弱を作らない）
    headBg: '#F2F2F2',    // 表の見出しの地（無彩色の面）
    headInk: '#333333',
    grandInk: '#333333',
    rule: 'rows',
    titleSpacing: '.32em',
    grandGo: 'ご',        // 「ご請求金額（税込）」（様式で「御」にもできる）
  };
  function themeOf(t) { return Object.assign({}, THEME, t || {}); }

  var DEFAULT_COLS = {
    items: ['#', '品名・内容', '数量', '単位', '単価', '金額', '消費税'],
    widths: { '#': 28, '品名・内容': 220, '数量': 56, '単位': 44, '単価': 80, '金額': 100, '消費税': 72 },
    aligns: {},
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ★人が読む文として使えるか★
     String() は 物 を渡されると "[object Object]" を作る。それを紙に刷ると、
     客の手元に [object Object] と書かれた請求書が届く
     （2026-08-11 実機で発生：お振込先に 物 が入っていた）。
     ★読めない物は紙に出さない★（ここは法定の項目ではなく、書いてあれば読む物）。 */
  function textOf(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    return '';
  }

  /* ★紙の金額は ¥ 記号（画面は「1,100 円」。二重に付けない）★
     数にならない物は 0 にしない（取れなかったを 0 と作り分ける）。 */
  function yen(v) {
    var n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }
  /* 表の中の数（¥ を付けない・桁区切りだけ。桁が詰まって読みにくくなるため） */
  function comma(v) {
    if (v === undefined || v === null || v === '') return '';
    var n = Number(v);
    if (!Number.isFinite(n)) return esc(v);
    return n.toLocaleString('ja-JP');
  }
  function num(v) { return comma(v); }

  /* ★日付＝和暦か西暦を選べる（既定は西暦）★
     era='reiwa' … 令和8年9月30日 ／ それ以外 … 2026/9/30
     読めない日付は空（勝手に今日を入れない）。 */
  function dateStr(ymd, era) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return '';
    var y = +m[1], mo = +m[2], d = +m[3];
    if (era === 'reiwa') return '令和' + (y - 2018) + '年' + mo + '月' + d + '日';
    return y + '/' + mo + '/' + d;
  }
  /* 昔の紙との読み合わせ用（残す）。和暦なしの長い形。 */
  function jpDate(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return '';
    return +m[1] + '年' + (+m[2]) + '月' + (+m[3]) + '日';
  }

  /* 敬称。★取引先マスタは hub が `keisho` で書いている★ ので両方を見る。 */
  function honorOf(p) {
    var h = (p && (p.honor || p.keisho)) || '';
    if (!h || h === '（なし）' || h === '(なし)' || h === 'なし') return '';
    return h;
  }

  /* 消費税のラベル。★率の数字は書かない＝区分から作る★
     1種類だけ … 消費税（10%）／内税なら 消費税（10%・内税）
     2種類以上 … 消費税（内訳は下に出す） */
  function taxLabel(tax, taxMode) {
    var by = (tax && tax.byRate) || [];
    var inTax = (taxMode === 'inclusive') ? '・内税' : '';
    if (by.length === 1) return '消費税（' + comma(by[0].pct) + '%' + inTax + '）';
    return '消費税' + (inTax ? '（内税）' : '');
  }

  /* 角印の大きさ（mm）。10〜40に収める＝紙からはみ出す印を作らない */
  function sealMm(v) {
    var n = Number(v);
    if (!Number.isFinite(n)) return 21;
    return Math.max(10, Math.min(40, Math.round(n)));
  }

  function hasRole(items, role) {
    for (var i = 0; i < items.length; i++) if (COLS.roleOf(items[i]) === role) return true;
    return false;
  }

  /* 明細を紙ごとに分ける（★黙って切らない・次の紙へ送る★） */
  function paginate(lines, o) {
    var first = (o && o.rowsFirst) || ROWS_FIRST;
    var rest = (o && o.rowsRest) || ROWS_REST;
    if (!lines.length) return [[]];
    if (lines.length <= first) return [lines.slice()];
    var pages = [lines.slice(0, first)];
    for (var i = first; i < lines.length; i += rest) pages.push(lines.slice(i, i + rest));
    return pages;
  }

  /* ★途中のページには もっと明細が載る★（司さん 2026-08-16
     「控除を最後に持ってくるなら 余白のぶん 項目を増やしてページを減らせ」）
     途中の紙には ★控除も締めも振込先も（内訳）も無い★＝その高さが丸ごと明細に使える。
     実測（Chromium 2026-08-16）：★途中の紙は 30行★（31行で −25px＝足元に食い込む）
       ＝最後の紙（控除あり8行）の ★3.75倍★。前は全ページ同じ8行で刷っていて、
         途中の紙に ★22行ぶんの余白★ ができ、紙が無駄に増えていた。
     ★分け方★：最後の紙に「最後の紙の枠」ぶん残し、残りを途中の紙へ ★均等に★ 配る
       （均等＝途中の紙の顔が揃う。片方だけスカスカにしない） */
  var MID_ROWS = 30;
  function planPages(n, midRows, lastRows) {
    var total = Math.max(0, Math.trunc(Number(n) || 0));
    var mid = Math.max(1, Math.trunc(Number(midRows) || 1));
    /* ★0 も許す＝「最後の紙は締めだけ（明細を1本も載せない）」★
       控除が多い・区分が多い・ページが多い紙は、締めだけで A4 を使い切る。
       そこへ無理に1行 押し込むと ★黙って はみ出す★（実測 −193px）。 */
    var last = Math.max(0, Math.trunc(Number(lastRows) || 0));
    if (total <= last) return [Math.max(total, 0)];          // 1枚で収まる
    var rest = total - last;                                  // 途中の紙へ回す分
    var midPages = Math.ceil(rest / mid);
    var per = Math.ceil(rest / midPages);                     // ★均等に配る★
    var plan = [];
    var left = rest;
    for (var i = 0; i < midPages; i++) {
      var take = Math.min(per, left);
      plan.push(take); left -= take;
    }
    plan.push(total - (rest - left));                         // 最後の紙（残り全部）
    return plan;
  }
  /* 明細を「ページごとの本数」で切り分ける（★黙って切らない★＝全部どこかの紙に載る） */
  function splitByPlan(lines, plan) {
    var out = [], i = 0;
    for (var p = 0; p < plan.length; p++) { out.push(lines.slice(i, i + plan[p])); i += plan[p]; }
    if (i < lines.length) out[out.length - 1] = out[out.length - 1].concat(lines.slice(i));
    return out;
  }

  /* ★「差し引くを出すか」「枠は何行か」「何枚になるか」を決めるのは ここ1か所★
     画面（2枚になりますの案内）と紙が別々に判定すると、
     ★画面は「1枚」・紙は2枚★という食い違いが必ず出る（過去に同じ型の事故あり）。
     ＝画面はこの3つを呼ぶ。自前で数えない。 */
  function showDeductOf(inv, o) {
    o = o || {};
    var dLines = Array.isArray(o.deductLines) ? o.deductLines : [];
    var d = (o.deduct === undefined || o.deduct === null) ? null : Number(o.deduct);
    var has = dLines.length > 0
      || !!(inv && inv.data && inv.data.deductions && inv.data.deductions.length)
      || (d !== null && d !== 0);
    if (has) return true;                       // ★1件でも入れたら自動で出す★
    if (o.showDeduct !== undefined) return !!o.showDeduct;
    return !!(inv && inv.data && inv.data.showDeduct);   // ★既定は出さない★
  }
  function frameRowsOf(inv, o) {
    o = o || {};
    var given = (o.paperRows !== undefined ? o.paperRows : (inv && inv.data && inv.data.paperRows));
    var ded = (o.showDeductResolved !== undefined) ? !!o.showDeductResolved : showDeductOf(inv, o);
    var max = maxRowsOf(ded, o.rateRows, o.dedLines);
    var n = Math.max(0, Math.trunc(Number(given) || max));
    /* ★物理の上限で頭打ち★＝紙は A4 固定なので、これ以上は載せると切れる。
       ★黙って切らない★＝ここで止めて、残りは2枚目に送る。画面はその事を人に言う。 */
    return Math.min(n, max);
  }
  /* 1枚に載る最大（★控除の箱を出すか★と ★（内訳）の区分の数★で変わる）★実測値★
     ★区分が増えると（内訳）が伸びる★＝その分 明細に使える高さが減る。
     実測（2026-08-16 Chromium）：（内訳）の高さ ＝ 区分1で48px、1区分ごとに +24.5px。
       区分3までは 振込先の箱（109px）の方が高いので ★行数は減らない★。
       区分4で内訳122px＝振込先を超える → ★そこから1区分ごとに1行 減らす★。
     ※今の法律の区分は最大4（10%/8%/非課税/対象外）だが、
       ★法が変われば率は増える★（率の一覧は kyuyo/lib が唯一の正）。
       実測：区分6＋明細12行で ★52px はみ出した＝黙って切れた★ので、ここで止める。 */
  var RATE_ROWS_FREE = 3;     // ここまでは（内訳）が振込先より低い＝行数に影響しない
  /* ★控除の件数が枠（DEDUCT_ROWS）を超えたら その分 明細に使える行が減る★
     （司さん 2026-08-16「控除項目が増えたら ちゃんと行が増えるようにもやれよ」）
     ＝控除の箱は 件数ぶん伸びるので、伸びた分だけ 明細の枠を減らして はみ出させない。 */
  function maxRowsOf(showDeduct, rateRows, dedLines) {
    var base = showDeduct ? PAPER_ROWS_DED : PAPER_ROWS;
    var n = Math.max(0, Math.trunc(Number(rateRows) || 0));
    var d = Math.max(0, Math.trunc(Number(dedLines) || 0));
    /* 控除の枠を超えた件数ぶん 明細を減らす。★超えた時は +1行 の保険★
       （実測：ちょうど引くだけだと −2px 超えた紙が出た） */
    var over = 0;
    if (showDeduct && d > DEDUCT_ROWS) over = (d - DEDUCT_ROWS) + 1;
    return Math.max(1, base - Math.max(0, n - RATE_ROWS_FREE) - over);
  }
  /* 紙に出る区分の数（税率ごと＋非課税＋対象外）＝（内訳）の行数 */
  function rateRowsOf(tax) {
    var t = tax || {};
    var n = (Array.isArray(t.byRate) ? t.byRate.length : 0);
    if (t.nontaxable && Number(t.nontaxable.base)) n += 1;
    if (t.exempt && Number(t.exempt.base)) n += 1;
    return n;
  }
  /* 明細が何本で 何枚になるか（枠0＝詰める指定の時は 昔の数え方に任せて1枚と言わない） */
  function pagesOf(lineCount, frameRows) {
    var n = Math.max(0, Math.trunc(Number(lineCount) || 0));
    var f = Math.max(0, Math.trunc(Number(frameRows) || 0));
    if (!f) return paginate(new Array(n).fill(0)).length;
    return Math.max(1, Math.ceil(n / f));
  }

  /* ★何枚になるか・どの紙に何行 載せるか を決める唯一の場所★
     ＝紙（build）も 画面（「2枚になります」の案内）も ★ここを呼ぶ★。
     別々に数えると「画面は2枚・紙は3枚」が出る（同じ型の事故を何度もやっている）。

     ★締めはページ数で伸びる★（司さん 2026-08-16「明細の合計1ページ・2ページ…と増やしていくべき」）
       ページが増える → 締めが伸びる → 最後の紙に載る明細が減る → またページが増える…
       ＝★収まるまで数え直す★。frame は必ず ★減る方向だけ★ に動かすので 必ず止まる。
     ★会社が枠を決めている時（paperRows）は動かさない★＝毎月おなじ顔にする約束。 */
  function planOf(inv, o) {
    o = o || {};
    var n = Math.max(0, Math.trunc(Number(o.lineCount) || 0));
    var given = (o.paperRows !== undefined ? o.paperRows : (inv && inv.data && inv.data.paperRows));
    var fixed = !!(Number(given) > 0);
    var base = frameRowsOf(inv, o);
    if (!base) return { frameRows: 0, midRows: 0, plan: null };
    var mid = fixed ? base : Math.max(base, MID_ROWS);
    var frame = base;
    var plan = planPages(n, mid, frame);
    if (!fixed) {
      for (var k = 0; k < 60; k++) {
        /* ★締めはページ数で伸びない★（全ページの合計を2行 書くだけ）＝1行だけ保険を取る。
           ここを「ページごとに1行」にすると 4枚目以降で必ず はみ出す（実測 −28px）。 */
        var extra = (plan.length > 1) ? 1 : 0;
        var f2 = Math.min(frame, Math.max(0, base - extra));   // ★減る方向だけ★
        if (f2 === frame) break;
        frame = f2;
        plan = planPages(n, mid, f2);
      }
    }
    return { frameRows: frame, midRows: mid, plan: plan };
  }

  /* ★振込先を何行に分けるか＝ここが唯一の正★（司さん 2026-08-16）
     ・1行目 … 銀行名／支店／種別／口座番号
     ・2行目 … ★名義（会社名）★（★長い名義が中途半端な所で折れるのを避ける★）
     ・★会社が自分で改行を入れているなら それに従う★（勝手に組み替えない）
     ・名義が無ければ 1行のまま（空の行を作らない）
     ★紙も Excel も この関数を呼ぶ★＝出し方ごとに書くと片方だけ直る事故になる。 */
  function bankLines(bank) {
    var t = textOf(bank);
    if (!t) return [];
    if (/\n/.test(t)) {
      return t.split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
    }
    var m = /^([\s\S]*?\d{5,8})[ 　]+(\S[\s\S]*)$/.exec(t);
    return m ? [m[1].trim(), m[2].trim()] : [t];
  }

  /* ═══ 紙 ═══
   * build({ inv, tax, partner, org, cols, theme, era, page })
   *   era … 'reiwa' で和暦。既定は西暦（代行請求の既定 dateEra:'seireki' と同じ）
   */
  function build(o) {
    o = o || {};
    var inv = o.inv || {};
    var tax = o.tax || {};
    var p = o.partner || {};
    var g = o.org || {};
    var TH = themeOf(o.theme);
    var era = o.era || (inv.data && inv.data.dateEra) || 'seireki';

    var spec = COLS.normalizeSpec((o.cols && o.cols.items && o.cols.items.length) ? o.cols : DEFAULT_COLS);
    if (COLS.validate(spec.items).length) spec = COLS.normalizeSpec(DEFAULT_COLS);
    var colW = COLS.widthsOf(spec.items, spec.widths);

    /* ★紙の種類は3つ★ 請求書／見積書／★領収書★
       領収書は doc_type ではない（棚を増やさない）＝入金1行から出す紙なので、
       ★呼ぶ側が docKind:'receipt' と receipt:{…} を渡す★。 */
    var rc = o.receipt || null;
    var kind = o.docKind || (inv.doc_type === 'quote' ? 'quote' : 'invoice');
    if (kind === 'receipt' && !rc) kind = 'invoice';        // 中身が無いのに領収書の顔をしない
    var isQuote = (kind === 'quote');
    var isReceipt = (kind === 'receipt');
    var heading = isReceipt ? '領　収　書' : isQuote ? '見　積　書' : '請　求　書';
    /* 金額のラベルは様式が持つ（ご／御）。★どちらでもよい＝縛らない★ */
    var go = TH.grandGo || 'ご';
    var grandLabel = isReceipt ? '領収金額（税込）' : go + (isQuote ? '見積金額（税込）' : '請求金額（税込）');
    var noLabel = 'No.　';
    var headNo = isReceipt ? String((rc && rc.no) || '') : (inv.no || '');
    var docTitle = (o.title || (heading.replace(/　/g, '') + (headNo ? ' ' + headNo : '')));

    var lines = Array.isArray(tax.lines) ? tax.lines : [];
    var byRate = Array.isArray(tax.byRate) ? tax.byRate : [];
    var exemptBase = (tax.exempt && Number(tax.exempt.base)) || 0;
    var nontaxBase = (tax.nontaxable && Number(tax.nontaxable.base)) || 0;
    /* ★控除（明細の外・税込の合計から引く）★
       ★ここを紙に出し忘れると、画面は 281,260 なのに 紙は 292,600 と書く★
       ＝★請求している額と、紙に書いた額が食い違う★（2026-08-15 スクショで実際に見つけた）。
       決め方は seikyu-doc.js が唯一の正（billedOf）。 */
    var deduct = (o.deduct === undefined || o.deduct === null) ? null : Number(o.deduct);
    var deductLines = Array.isArray(o.deductLines) ? o.deductLines : [];
    /* ★枠の本数（固定）★ 会社が変えられる。0以下は「詰める」＝昔の形に戻す道
       ★既定は 控除の枠を出すかで変わる★（下の showDeduct が決まってから入れる）。 */
    var frameRowsGiven = (o.paperRows !== undefined ? o.paperRows : (inv.data && inv.data.paperRows));
    var frameRows = 0;
    var dedRows = Math.max(0, Math.trunc(Number(
      (o.deductRows !== undefined ? o.deductRows : (inv.data && inv.data.deductRows))) || DEDUCT_ROWS));
    /* ★控除の話を渡されたか★
       渡されていない紙（見積・領収・古い呼び方）に「控除計（未確認）」を出さない。
       ★渡された時は 0件でも枠を出す★＝毎月 同じ顔（実物 八木は4行の枠に1行しか使っていない）。
       ★「出さない」も会社が選べる★（控除を使わない会社が多いため）。 */
    /* ★紙は1カラム★（司さん 2026-08-15「2カラムは見にくい」）
         2カラムだと ★明細の幅が狭くなる／控除1件の会社は右が空白だらけ／
         左28行に対して右3行＝紙の右半分が死ぬ★。
       ★col2 のコードは残す★（後で「横に並べたい」会社が出た時に戻せるように）。
       ★ただし 選ぶ所には出さない★＝今は人に見せない。 */
    var layout = String((o.layout !== undefined ? o.layout : (inv.data && inv.data.paperLayout)) || 'col1');
    if (layout !== 'col1' && layout !== 'col2') layout = 'col1';
    /* ★控除を使わない会社の方が多い★（司さん 2026-08-15）
       ・★既定は「使わない」★＝見出しごと出さない（★中身が空の枠だけ出す★のが一番 悪い）
       ・★控除を1件でも入れたら 自動で「使う」★（入れたのに出ない事故を作らない）
       ・使わない紙は ★その分の高さを明細に回す★（入る行数が増える） */
    var showDeduct = showDeductOf(inv, o);
    /* ★税込で打つ紙か★＝金額の列に刷るのが「税込の額」になる。
       ここを見ないと ★列を足した数と その真下の数が食い違う紙★が出る（実測 204通り）。 */
    var inclusive = (inv.tax_mode === 'inclusive');
    /* ★枠の本数は 控除の枠を出すかで変わる★（出すと明細に使える高さが減る） */
    var planInput = { paperRows: frameRowsGiven, showDeductResolved: showDeduct,
      rateRows: rateRowsOf(tax), dedLines: deductLines.length, lineCount: lines.length };
    frameRows = frameRowsOf(inv, planInput);
    var gen = o.gensen || null;     // ★源泉徴収（引く紙だけ）★
    var carry = o.carry || null;    // ★繰越（前回の残り）★
    /* ★ページごとに載る本数が違う★（司さん 2026-08-16）
         最後の紙 … 控除・締め・振込先・（内訳）が乗る＝frameRows（実測して決めた数）
         途中の紙 … それらが無い＝★MID_ROWS（実測30行）★まで載る
       ＝途中の紙の余白ぶん 紙が増えるのをやめる。
       ★会社が枠を決めている時（paperRows）は その数を全ページで使う★（毎月おなじ顔） */
    var laid = planOf(inv, planInput);        // ★数えるのは1か所★（画面もこれを呼ぶ）
    frameRows = laid.frameRows;
    var plan = laid.plan;
    var pages = plan ? splitByPlan(lines, plan) : paginate(lines, o.page);
    if (!pages.length) pages = [[]];
    var multi = pages.length > 1;
    /* そのページの枠（空の行を何本 出すか）＝そのページに配った本数 */
    function frameOfPage(idx, isLast) {
      if (!plan) return frameRows;
      return isLast ? frameRows : (plan[idx] || frameRows);
    }

    /* 明細の見出し（items のとおり・その順） */
    var headHtml = spec.items.map(function (k, c) {
      return '<th class="c-col" style="width:' + colW[c].toFixed(4) + '%;text-align:' + COLS.alignOf(spec, k) + '">' + esc(k) + '</th>';
    }).join('');

    /* ★足りない行は「空の枠」のまま残す★（罫線を消さない・詰めない）
       ここで詰めると ★中身の本数で紙の顔が毎月 変わる★＝経理が毎回 探し直す。 */
    function blankRowsHtml(n) {
      if (n <= 0) return '';
      var tds = spec.items.map(function (k) {
        return '<td class="c-col c-' + COLS.alignOf(spec, k) + ' c-blank">&nbsp;</td>';
      }).join('');
      var out = '';
      for (var i = 0; i < n; i++) out += '<tr class="r-blank">' + tds + '</tr>';
      return out;
    }

    /* ★② 明細の合計は「列の真下」に置く★（司さん 2026-08-15）
       前は 表の外に 2列の小さい表（label|値）で出していたので、
       ★金額の合計が「消費税」の列の真下★に来て、何の合計か分からなかった。
       ＝★表の一番下に合計行を入れて、金額の列には金額の合計・消費税の列には消費税の合計★
         （Timeally の勤務表と同じ作法＝上の行と縦にぴったり重なる）。
       ★列は会社が決める★ので、どこに置くかは ★役割（role）で探す★。 */
    function itemsFootHtml(pageLines, label, amountSum, taxSum) {
      var iAmount = -1, iTax = -1;
      spec.items.forEach(function (k, c) {
        var role = COLS.roleOfIn(spec, k);
        if (role === 'amount' && iAmount < 0) iAmount = c;
        if (role === 'tax' && iTax < 0) iTax = c;
      });
      /* 金額の列も消費税の列も無い様式（会社が全部 消した）＝置き場所が無いので出さない。
         ★その時は締めに同じ数が出る★ので、紙から合計が消える事はない。 */
      if (iAmount < 0 && iTax < 0) return '';
      var firstVal = Math.min.apply(null, [iAmount, iTax].filter(function (x) { return x >= 0; }));
      var cells = '<th class="c-col c-left c-sumlabel"'
        + (firstVal > 1 ? ' colspan="' + firstVal + '"' : '') + '>' + esc(label) + '</th>';
      if (firstVal === 0) cells = '';       // 1列目が金額＝ラベルを置く所が無い（下で値だけ並べる）
      for (var c = (firstVal === 0 ? 0 : firstVal); c < spec.items.length; c++) {
        var v = (c === iAmount) ? comma(amountSum) : (c === iTax) ? comma(taxSum) : '';
        cells += '<td class="c-col c-' + COLS.alignOf(spec, spec.items[c]) + '">' + v + '</td>';
      }
      return '<tfoot><tr class="r-sum">' + cells + '</tr></tfoot>';
    }

    function rowsHtmlOf(pageLines, offset, frame) {
      var fr = (frame === undefined) ? frameRows : frame;
      /* ★1行も無い時は「無い」と言う★（空の枠だけだと、消えたのか元から無いのか分からない）。
         言った上で ★残りは空の枠★＝紙の顔は同じ高さのまま。 */
      if (!pageLines.length) {
        return '<tr><td class="c-empty" colspan="' + spec.items.length + '">明細がまだ1行もありません</td></tr>'
          + blankRowsHtml(Math.max(0, fr - 1));
      }
      return pageLines.map(function (ln, i) {
        return '<tr>' + spec.items.map(function (k) {
          var cell = COLS.cellOf(ln, k, offset + i, spec);
          var al = COLS.alignOf(spec, k);
          var role = COLS.roleOfIn(spec, k);
          var noWrap = (role === 'rate' || role === 'unit' || role === 'index');
          var body = cell.kind === 'money' ? (cell.text === '' ? '' : comma(cell.text))
            : cell.kind === 'num' ? (cell.text === '' ? '' : num(cell.text))
              : esc(cell.text);
          if (role === 'name' && ln.memo && !hasRole(spec.items, 'memo')) {
            body += '<span class="c-memo">' + esc(ln.memo) + '</span>';
          }
          return '<td class="c-col c-' + al + ((cell.kind === 'text' && !noWrap) ? ' c-wrap' : '')
            + (noWrap ? ' c-nowrap' : '') + '">' + body + '</td>';
        }).join('') + '</tr>';
      }).join('') + blankRowsHtml(fr - pageLines.length);
    }

    /* ── 頭（宛名・自社・日付） ★ラベルの後ろは全角スペース★ ── */
    function headBlock(pageIdx) {
      /* 並びは 請求日 → No. → お支払期限。
         ★番号は空でも欄を出す（「（未採番）」と書く）＝取れなかったを空欄にしない★ */
      /* 領収書は ★入金日★ が日付・★領収番号（請求番号＋枝番）★ が番号 */
      var ds = dateStr(isReceipt ? (rc && rc.ymd) : inv.issue_ymd, era);
      var dLabel = isReceipt ? '領収日　' : isQuote ? '見積日　' : '請求日　';
      var meta = '<div class="meta-l">' + dLabel + (ds || '（未入力）') + '</div>';
      meta += '<div class="meta-l">' + esc(noLabel) + (esc(headNo) || '（未採番）') + '</div>';
      // ★もう受け取った紙に「お支払期限」を出さない★
      if (!isReceipt && inv.due_ymd) meta += '<div class="meta-l">お支払期限　' + dateStr(inv.due_ymd, era) + '</div>';

      return '<h1 class="ttl">' + heading + '</h1>'
        + '<div class="meta">' + meta + '</div>'
        + '<table class="party"><tbody><tr>'
        + '<td class="party-to">'
        + '<div class="to-name">' + (esc(p.name) || '（取引先が未選択）') + (honorOf(p) ? '　' + esc(honorOf(p)) : '') + '</div>'
        + (p.person ? '<div class="to-sub">' + esc(p.person) + '　様</div>' : '')
        /* ★宛先の下に住所は出さない★（司さん 2026-08-16「要らんくないか？」）
           ・実物32枚とも ★0枚★（機械で数えた）
           ・適格請求書の記載事項は ★受け取る側の「名称」★ まで＝住所は要らない
           ★データは消していない★（取引先マスタの住所はそのまま。必要になれば戻せる） */
        + '</td>'
        + '<td class="party-from">'
        + '<div class="from-name">' + (esc(g.yago) || '（自社情報が未入力）') + '</div>'
        + (g.addr ? '<div class="from-sub">' + esc(g.addr) + '</div>' : '')
        + (g.tel ? '<div class="from-sub">TEL ' + esc(g.tel) + '</div>' : '')
        + (g.invoiceNo ? '<div class="from-sub">登録番号 ' + esc(g.invoiceNo) + '</div>' : '')
        + (g.sealDataUrl ? '<img class="seal" style="width:' + sealMm(g.sealSizeMm) + 'mm;height:' + sealMm(g.sealSizeMm) + 'mm" src="' + esc(g.sealDataUrl) + '" alt="会社の印">' : '')
        + '</td></tr></tbody></table>'
        /* ★何枚のうちの何枚目か★（司さん 2026-08-16「複数ページになったらどうするんど」）
           「2ページ目」だけだと ★全部で何枚か分からない＝1枚 抜けても気づけない★。
           見本＝代行請求 invoice-pdf.js:748 も ★"1 / 3" を出している★。 */
        ;   /* ★ページ番号はここでは出さない★＝明細のすぐ上（金額の下）に置く */
    }

    /* ── 挨拶（★下記の通り御請求申し上げます。★） ── */
    /* ★「◯年◯月分」＝請求日の★前月★★
       うちの実物32枚の標準様式は全部 =TEXT(EDATE(請求日,-1),"yyyy年m月分")。
       ここが「当月」だと、7月に出す紙に「7月分」と書いてしまう（★実物は6月分★）。
       決め方は seikyu-doc.js が唯一の正。読めない日付なら出さない（でっち上げない）。

       ★頭の並びは どの紙も同じ★（司さん 2026-08-16）
         ◯月分（1枚目）→ 下記の通り…（金額の直上）→ ご請求金額 → ◯/◯ページ → 明細
       ＝★ページ番号は いつも明細のすぐ上★・★挨拶は いつも金額のすぐ上★。 */
    function periodBlock() {
      var lead = (inv.data && inv.data.lead) || '';
      if (!lead) lead = DOC.periodLabelOf(inv.issue_ymd);
      if (!lead) return '';
      return '<div class="lead"><div class="lead-l"><span class="lead-p">' + esc(lead) + '</span></div></div>';
    }
    function greetBlock() {
      var greet = isQuote ? '下記の通り御見積申し上げます。' : '下記の通り御請求申し上げます。';
      return '<div class="lead lead-greet"><div class="lead-l"><span class="lead-g">' + greet + '</span></div></div>';
    }
    /* ★何枚のうち何枚目か★（1枚で収まる紙には出さない） */
    function pagenoBlock(pageIdx) {
      if (!multi) return '';
      return '<div class="pageno">' + (pageIdx + 1) + ' / ' + pages.length + ' ページ</div>';
    }

    /* ── 御請求金額（★枠なし・ラベル＋大きい金額・下に線★） ── */
    /* ★下線は「金額の下」だけ★（司さん 2026-08-16）
       前は 紙の幅いっぱいに線を引いていて、★何に対する線か分からない★。
       ★表で組む★（flex は使わない＝文が1文字ずつ縦に割れる） */
    function grandHtml(v) {
      return '<table class="grand"><tbody><tr>'
        + '<th class="grand-l">' + grandLabel + '</th>'
        + '<td class="grand-v">' + v + '</td>'
        + '<td class="grand-x"></td>'
        + '</tr></tbody></table>';
    }
    function grandBlock() {
      /* ★領収書は「実際に受け取った額」★（請求額ではない）。
         一部だけ受け取った時に請求額を書くと、★受け取っていない金額の領収書★になる。 */
      if (isReceipt) {
        var got = Number(rc && rc.amount);
        return grandHtml(Number.isFinite(got) ? yen(got) : '（未確認）');
      }
      /* ★見出しの額は「実際に請求している額」★＝繰越があれば足し、★控除があれば引いたあと★。
         ここだけ今回分のままにすると、下の 合計請求額／請求額 と食い違う。 */
      /* ★控除の話が在るのに読めない時は 頭の金額も数字にしない★
         （0として計算した額を大きく出すと ★引き忘れた紙★ になる） */
      var billed = (showDeduct && deduct === null) ? null : DOC.billedOf(tax, carry, deduct);
      return grandHtml(billed === null ? '（未確認）' : yen(billed));
    }

    /* ── 小計・消費税・合計（★枠なし・合計の上に線★）
         源泉徴収を引く紙は、合計の下に ★源泉徴収税額★ と ★差引お支払額★ を足す。
         ★足した2行が迷子にならないよう、合計の直下に続けて並べ、
           いちばん下（実際に払う額）を太くする★ */
    /* ★この紙で「実際に振り込む額」は1か所で決める★（司さん 2026-08-16）
       ＝締めの一番 下の行と、振込先の箱に出す金額を ★同じ物から作る★。
       別々に計算すると、片方だけ直した日に ★紙の中で額が食い違う★。 */
    function sumsRows() {
      /* ★表の中は「このページの小計」・締めは「全ページの合計」★（司さん 2026-08-16）
           表の中の合計＝そのページの分。締めの合計＝紙 全部の分。
           ★どちらも 何を足した数かを 字で書く★＝「なぜ数が違うのか」を起こさせない。
         ★ページごとに1行ずつ増やさない★（司さん 2026-08-16
           「全ページ明細合計、全ページ消費税合計にしたら行を増やさなくてもいけるのでは」）
           ＝ページが増えても締めの高さが変わらない。
           実測：ページごとに並べると 明細100行・控除8件で締めが13行＝370px になり
           ★−28px はみ出した★（明細4枚以上で必ず起きる）。この書き方なら 何枚でも2行。 */
      var rows = [];
      var allPfx = multi ? '全ページの ' : '';
      /* ★税込で打つ紙は ここが「税抜」★＝表の中の「（税込）」と同じ言葉にしない。
         同じ「明細の合計」で 62,000 と 56,364 が並ぶと、必ず「なぜ？」になる。 */
      rows.push(['', allPfx + '明細の合計' + (inclusive ? '（税抜）' : ''), yen(tax.subtotal)]);
      rows.push(['', allPfx + taxLabel(tax, inv.tax_mode), yen(tax.taxTotal)]);
      rows.push(['sums-mid', '合計', yen(tax.grandTotal)]);
      var hasRealDeduct = showDeduct && (deduct === null || Number(deduct) !== 0);
      if (hasRealDeduct) {
        var billedNet = (deduct === null) ? null : (tax.grandTotal - deduct);
        rows.push(['sums-minus', '控除', (deduct === null) ? '（未確認）' : '-' + yen(deduct)]);
        rows.push(['', '請求額', (billedNet === null ? '（未確認）' : yen(billedNet))]);
      }
      if (gen && gen.on) {
        var pay = DOC.payableOf(tax, carry, gen, deduct);
        rows.push(['sums-minus', esc(gen.label), '-' + yen(gen.amount)]);
        rows.push(['', esc(gen.netLabel), (pay === null ? '（未確認）' : yen(pay))]);
      }
      rows[rows.length - 1][0] = 'sums-net';
      return rows;
    }
    /* 締めの一番 下の行＝★この紙で実際に払う額★（字のまま返す＝「（未確認）」もそのまま） */
    function payTextOf() {
      var r = sumsRows();
      return r[r.length - 1][2];
    }

    function totalsBlock() {
      /* ★締め★ 明細の合計 → 消費税 → 合計 →（控除）→ 請求額。
         ★大きい数字は紙の頭に1つだけ★なので ここは全部 小さく、
         ★一番 下の行（＝実際に払う額）だけ 線と太さで強く★する。 */
      return '<table class="sums"><tbody>' + sumsRows().map(function (r) {
        return '<tr' + (r[0] ? ' class="' + r[0] + '"' : '') + '><th>' + r[1] + '</th><td>' + r[2] + '</td></tr>';
      }).join('') + '</tbody></table>';
    }

    /* ── 繰越（前回の残り）★紙の頭・箱で囲まない★
         ★取れなかったを0にしない★＝読めなければ「入金は未確認」、初回は「前回の請求はありません」 */
    function carryBlock() {
      if (!carry) return '';
      /* ★「前回が無い」と「前回の入金が読めていない」は別物★
         初回に 前回請求額 — ／ 入金額 — ／ 繰越額 — の表を出すと、
         読めなかったのか元から無いのか、受け取った人に分からない。
         初回は ★1行だけ言う★（表は出さない）。 */
      if (carry.state === 'first') {
        return '<div class="carry"><div class="carry-n">' + esc(carry.label || '前回の請求はありません') + '</div></div>';
      }
      var v = function (x) { return (x === null || x === undefined) ? '（未確認）' : yen(x); };
      var rows = CARRY_ROWS.map(function (r) {
        return '<tr><th>' + r.label + '</th><td>' + v(carry[r.key]) + '</td></tr>';
      }).join('');
      var note = carry.label
        ? '<div class="carry-n">' + esc(carry.label) + (carry.prevNo ? '（前回 No.　' + esc(carry.prevNo) + '）' : '') + '</div>'
        : (carry.prevNo ? '<div class="carry-n">前回 No.　' + esc(carry.prevNo) + '</div>' : '');
      return '<div class="carry"><table class="carry-t"><tbody>' + rows + '</tbody></table>' + note + '</div>';
    }

    /* ── （内訳）＝税率ごとの区分（適格請求書の要件）★枠で囲まない★ ── */
    function breakdownBlock() {
      var rows = byRate.map(function (b) {
        return '<tr><th>' + comma(b.pct) + '% 対象</th>'
          + '<td>' + yen(b.base) + '</td><td>' + yen(b.tax) + '</td></tr>';
      }).join('');
      /* ★非課税と対象外は別の行★（同じ「消費税0」でも意味が違う）
         非課税 … 住宅の家賃・保険料・切手・印紙＝★取引だが消費税がかからない★
         対象外 … 立替金・給与・寄付＝★そもそも消費税の取引でない★
         ★紙にはこの2つのうち「対象外」しか出ていなかった★（Excel には両方 出ていた）
         ＝不動産・保険の会社の紙で ★非課税の区分が消える★（2026-08-16 実測で発見）。
         ★どの業種でも成り立つ紙にする★（うちの実物32枚は全部10%だけ＝1例に過ぎない）。 */
      if (nontaxBase !== 0) {
        rows += '<tr><th>非課税</th><td>' + yen(nontaxBase) + '</td><td>—</td></tr>';
      }
      if (exemptBase !== 0) {
        rows += '<tr><th>消費税の対象外</th><td>' + yen(exemptBase) + '</td><td>—</td></tr>';
      }
      if (!rows) rows = '<tr><td class="r-none" colspan="3">区分はまだありません</td></tr>';
      return '<div class="bd"><div class="bd-h">（内訳）</div>'
        /* ★列の幅を決める★＝見出しと本文が必ず同じ幅で並ぶ（auto だと毎回 幅が動いてずれて見える） */
        + '<table class="rates">'
        + '<colgroup><col class="rc-k"><col class="rc-n"><col class="rc-n"></colgroup>'
        + '<thead><tr><th class="rt-l">区分</th><th class="rt-r">対象額</th><th class="rt-r">消費税</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
    }

    /* ── ★② 差し引く（控除）★ ────────────────────────────────
       ★①の明細と はっきり別の枠★（見出し・罫線で分ける）。
       ★給料明細の「支給／控除／差引支給額」と同じ並び★＝Rakually の中で紙の作法をそろえる。
       ★税の外で引く★（①の中のマイナス行＝値引きは税の中なので、こちらに混ぜない）。
       ★中身が1行でも枠は固定★（実物 八木工業は E17:H20＝4行のうち1行しか使っていない）。 */
    /* ★給料明細と同じ作法★（kyuyo/js/render.js を読んで合わせた・2026-08-15）
         ・「支 給」「控 除」の ★見出しの下に線★（.st）＝左右の1行目が同じ高さから始まる
         ・足りない行は ★高さの決まった空行★ で埋める（rowsHTML の minCells と同じ考え方）
         ・★各ブロックの下にそのブロックの合計★（支給合計／控除合計＝上に線を引いた1行）
         ・★大きい数字は紙の頭に1つだけ★（差引支給額）＝ブロックの合計は小さく
       請求書では 支給→★ご請求の内訳★／控除→★控除★（給料明細と同じ言葉にそろえる）。 */
    function blockHead(t) { return '<div class="st">' + esc(t) + '</div>'; }
    function blockSum(label, value) {
      return '<table class="bsum"><tbody><tr><th>' + esc(label) + '</th><td>' + value + '</td></tr></tbody></table>';
    }

    function deductBlock() {
      if (!showDeduct) return '';
      var used = deductLines.length;
      var rows = deductLines.map(function (d) {
        var dv = Number(d && d.amount);
        return '<tr><th>' + (esc(d && d.name) || '控除') + '</th><td>'
          + (Number.isFinite(dv) ? '-' + yen(dv) : '（未確認）') + '</td></tr>';
      }).join('');
      var blanks = Math.max(0, dedRows - used);
      for (var i = 0; i < blanks; i++) rows += '<tr class="r-blank"><th>&nbsp;</th><td>&nbsp;</td></tr>';
      /* ★このブロックの合計はこのブロックが持つ★（給料明細の「控除合計」と同じ）。
         締めの「請求額」とは役目が違う（ブロックの足し算／払う額）。 */
      return '<div class="blk blk-ded">' + blockHead('控除')
        + '<table class="ded"><tbody>'
        + '<tr class="ded-hd"><th>内容</th><td>金額</td></tr>'
        + rows + '</tbody></table>'
        + blockSum('控除計', (deduct === null) ? '（未確認）' : (deduct ? '-' + yen(deduct) : yen(0)))
        + '</div>';
    }

    /* ── 足元（★左＝お振込先／右＝小計・消費税・合計＋（内訳）★）
         左右に並べるのは、紙の下半分を1列で長くしないため。
         ★2段組みは表で作る★（flex だと文が1文字ずつ縦に割れる） */
    /* ★口座番号だけ 大きく・等幅★（読み間違いが一番 困る所）
       分け方（何行に分けるか）は ★bankLines が唯一の正★＝紙も Excel も同じ形にする。 */
    function bankHtml(bank) {
      return bankLines(bank).map(function (line, i) {
        var t = esc(line).replace(/(\d{5,8})/g, '<span class="bank-no">$1</span>');
        return (i === 0) ? t : '<span class="bank-nm">' + t + '</span>';
      }).join('<br>');
    }
    function footerBlock() {
      var left = '';
      var bank = textOf(g.bank);
      /* ★⑧ 客が一番 使う情報＝ここへ振り込む★（司さん 2026-08-16）
         枠で囲って薄く塗る（★白黒コピーでも枠は残る濃さ★）。 */
      if (bank) left += '<div class="note note-bank"><div class="note-h">お振込先</div>'
        + '<div class="note-b note-bb">' + bankHtml(bank) + '</div></div>';
      var memo = textOf(inv.data && inv.data.memo);
      if (memo) left += '<div class="note"><div class="note-h">備考</div><div class="note-b">' + esc(memo).replace(/\n/g, '<br>') + '</div></div>';
      var right = breakdownBlock();
      /* ★（内訳）が無い時は 右のマスごと出さない★＝振込先が幅いっぱい使える
         （空のマスを残すと 左が狭いままで、長い銀行名が折り返す） */
      if (!right) return '<table class="foot"><tbody><tr><td class="foot-l">' + left + '</td></tr></tbody></table>';
      return '<table class="foot"><tbody><tr>'
        + '<td class="foot-l">' + left + '</td>'
        + '<td class="foot-r">' + right + '</td>'
        + '</tr></tbody></table>';
    }

    var subject = (inv.data && inv.data.subject) || '';
    var caption = subject || (inv.data && inv.data.tableTitle) || '';

    /* ── 領収書の中身 ────────────────────────────────────────────
       ★明細も内訳も出さない★
         受け取ったのは「その1回ぶんのお金」で、明細は請求書の側にある。
         一部だけ受け取った紙に税率ごとの区分を出すと ★按分＝嘘の数字★ になる。
         だから ★どの請求の代金か（但し書き）で紐づける★。
       ★消費税額を区分して書くのは、はっきりしている時だけ★（国税庁 No.7124）
         書けた時は ★印紙の判定でも その分を記載金額から外す★（呼ぶ側が taxSeparate を立てる）。 */
    function receiptBody() {
      var but = textOf(rc.note) || (inv.no ? ('請求書 ' + inv.no + ' の代金として') : '上記代金として');
      var sep = !!rc.taxSeparate && Number(rc.taxTotal) > 0;
      var rows = '';
      if (sep) {
        var base = Number(rc.amount) - Number(rc.taxTotal);
        rows = '<table class="sums"><tbody>'
          + '<tr><th>税抜金額</th><td>' + yen(base) + '</td></tr>'
          + '<tr><th>消費税額等</th><td>' + yen(Number(rc.taxTotal)) + '</td></tr>'
          + '<tr class="sums-g"><th>合計</th><td>' + yen(Number(rc.amount)) + '</td></tr>'
          + '</tbody></table>';
      }
      /* ★印紙の注意は「要る時だけ」出す★。判定は seikyu-doc.js が唯一の正
         （区分して書けた時は、その消費税額を記載金額から外して数える＝No.7124）。 */
      var stamp = DOC.stampNote({ amount: Number(rc.amount), taxTotal: Number(rc.taxTotal), taxSeparate: sep });
      var memo = textOf(inv.data && inv.data.memo);
      return '<div class="rc-but"><span class="rc-but-l">但し　</span>'
        + '<span class="rc-but-b">' + esc(but) + '</span></div>'
        + '<div class="rc-ack">上記正に領収いたしました。</div>'
        + (rows ? '<div class="rc-sums">' + rows + '</div>' : '')
        + (rc.method ? '<div class="rc-way">お支払方法　' + esc(rc.method) + '</div>' : '')
        + (memo ? '<div class="note"><div class="note-h">備考</div><div class="note-b">' + esc(memo).replace(/\n/g, '<br>') + '</div></div>' : '')
        + (stamp ? '<div class="rc-stamp">' + esc(stamp) + '</div>' : '');
    }

    if (isReceipt) {
      var rcHtml = '<div class="sheet">' + headBlock(0) + grandBlock() + receiptBody() + '</div>';
      return {
        html: '<!DOCTYPE html>\n<html lang="ja"><head><meta charset="UTF-8">'
          + '<meta name="viewport" content="width=device-width, initial-scale=1">'
          + '<title>' + esc(docTitle) + '</title>'
          + '<style>' + css(TH) + '</style></head><body>' + rcHtml + '</body></html>',
        title: docTitle, templateId: inv.template_id || TEMPLATE_ID,
        cols: spec, colWidths: colW, pages: 1, docKind: 'receipt',
      };
    }

    /* ── 紙を組む ── */
    var sheets = pages.map(function (pageLines, idx) {
      var last = (idx === pages.length - 1);
      var offset = pages.slice(0, idx).reduce(function (a, x) { return a + x.length; }, 0);
      var body = ''
        + headBlock(idx)
        /* ★繰越は1ページ目の金額のすぐ下★（前回の残りを含む額なので、金額の根拠として先に見せる）
           ここに並べないと carryBlock() は作られるだけで紙に載らない
           （2026-08-11：関数はあるのに1度も呼ばれていなかった＝lib緑でも紙に出ない） */
        /* ★金額（と その根拠の繰越）は「客が振り込む時に見る紙」に置く★
           見本＝代行請求 invoice-pdf.js:777 は
             ★if (!multi) cy = drawGrandBox(page, cy); // 単ページのみ上部に御請求金額★
           ＝複数ページの時は ★1枚目に出さず★、最後の1枚（まとめ）にだけ出している。
           うちも同じにする：
             1枚で収まる紙 … 頭に「ご請求金額」（今までどおり）
             複数ページ    … ★最後の紙（振込先と同じ紙）にだけ★ 出す
           「◯月分＋挨拶」は 1枚目の頭のまま（紙の始まりの挨拶なので）。 */
        /* ★どの紙も同じ並び★（司さん 2026-08-16「統一感でるやろが」）
             ◯月分（1枚目だけ）
             下記の通り御請求申し上げます。 ← ★金額のすぐ上★
             ご請求金額（税込）             ← 1枚物は1枚目／複数ページは ★最後の紙★
             ◯ / ◯ ページ                  ← ★いつも明細のすぐ上★
             （明細） */
        + (idx === 0 ? periodBlock() : '')
        + ((((idx === 0 && !multi) || (last && multi)))
          ? greetBlock() + grandBlock() + carryBlock() : '')
        + pagenoBlock(idx)
        /* ★2カラム★ 左＝①ご請求の内訳（明細）／右＝②差し引く＋③締め
             ★2段組みは表で作る★（flex だと文が1文字ずつ縦に割れる＝前科あり）。
             ★明細の枠が固定★なので、右の「請求額」は ★中身が1行でも28行でも同じ高さ★に来る。
             紙は A4 の幅で組むので ここは常に2カラム。★狭い画面の1カラムは 入力の画面の側★
             （①→②→③の順番は どちらも同じ＝探す場所が変わらない）。 */
        + (function () {
          /* ★① ご請求の内訳★（左／上）＝明細＋★このブロックの合計★
             見出しの下に線を引く＝★左右の1行目が同じ高さから始まる★（給料明細と同じ） */
          var pageSub = pageLines.reduce(function (a2, x) { return a2 + (Number(x.amount) || 0); }, 0);
          var pageTax = pageLines.reduce(function (a2, x) { return a2 + (Number(x.tax) || 0); }, 0);
          /* ★合計行は表の中★（列の真下に来る）。最後の紙は紙ぜんぶの合計、
             途中の紙は そのページの分（★どちらも同じ場所・同じ列★）。 */
          /* ★表の中の合計行は「そのページの合計」★（司さん 2026-08-16
             「そのページの合計やないと なぜ？ってなる」）
             ＝複数ページの時は ★最後の紙も「このページの小計」★（全体の合計は締めに出す）。
             1枚しかない紙は そのページ＝全体なので「明細の合計」と書く。

             ★★合計に出す数は「その列に刷った字を足した数」でなければならない★★
             （司さん 2026-08-17「検算は 描いた文字を1行ずつ足せ」）
             ＝★tax.subtotal を使ってはいけない★。
               ★税込で打つ紙★では 金額の列に ★税込の額★が刷られるのに、
               tax.subtotal は ★税抜★なので、
                 列を足すと 62,000 ／ その真下に 56,364
               という紙が出る（★実測 2026-08-17・936通り中 204通り★）。
               1枚物だけ tax.subtotal を使っていたので、★1枚物ほど狂っていた★。 */
          var footLabel = (last && !multi) ? '明細の合計' : 'このページの小計';
          /* ★税込で打つ紙は「（税込）」と書く★
             ＝締めの「明細の合計」は税抜なので、★同じ言葉で違う数★にしない。 */
          if (inclusive) footLabel += '（税込）';
          var foot = itemsFootHtml(pageLines, footLabel, pageSub, pageTax);
          /* ★明細の上に「件名」の行を出さない★（司さん 2026-08-16）
             紙の頭に「2026年6月分」と書いてあるのに、その下に「7月分 工事代金」と出ていて
             ★同じ紙に2つの「◯月分」★が並んでいた（しかも 前月と当月でズレて見える）。
             ＝★この行は出さない★（件名は控えとしてデータに残す・ファイル名では使う）。
             実物32枚も 明細の上は「項目／金額」の見出しから始まっている。 */
          /* ★締めだけの紙には 明細の表を出さない★（司さん 2026-08-16 の「賢くやれ」の裏側）
             控除が多い／区分が多い／ページが多い紙は、締めだけで A4 を使い切る。
             そこに ★中身0行の表と「このページの小計 ¥0」★ を出すと、
             「なぜ0円のページがあるのか」になる＝表ごと出さない。 */
          if (last && multi && !pageLines.length && !frameOfPage(idx, true)) return '' + deductBlock();
          var itemsBlk = '<div class="blk blk-items">'
            + '<table class="items"><thead><tr>' + headHtml + '</tr></thead>'
            + '<tbody>' + rowsHtmlOf(pageLines, offset, frameOfPage(idx, last)) + '</tbody>' + foot + '</table>'
            /* 金額の列も消費税の列も無い様式だけ、昔どおり表の外に出す（置き場所が無いため） */
            + (foot ? '' : (last ? blockSum('明細の合計', yen(tax.subtotal)) : blockSum('このページの小計', yen(pageSub))))
            + '</div>';
          var rightBlk = last ? deductBlock() : '';
          if (layout === 'col1') {
            /* ★1カラム＝上から ①明細 → ②差し引く → ③締め★（順番は2カラムと同じ） */
            return itemsBlk + rightBlk;
          }
          return '<table class="cols2"><tbody><tr>'
            + '<td class="c2-l">' + itemsBlk + '</td>'
            + '<td class="c2-r">' + rightBlk + '</td>'
            + '</tr></tbody></table>';
        })()
        ;
      /* ★紙の下端に貼る物★＝締め（払う額）と 振込先。
         毎月おなじ場所に来る＝経理が探し直さない（実物のExcelも下に固定で置いてある）。 */
      /* ★複数ページの時は 最後の紙にも「ご請求金額」を出す★（司さん 2026-08-16
         「最後に振込先あるならそこにご請求金額のせるべきでは？」）
         ＝客は ★振込先が在る最後の紙★ を見て振り込む。金額が1枚目にしか無いと
         ★紙をめくり直す（そして間違える）★。
         ★1枚で収まる紙は 今までどおり頭に1回だけ★（同じ紙に2回は出さない）。 */
      var foot = ''
        + (last ? totalsBlock() : '')
        + (last
          ? footerBlock()
          /* ★同じ数字を2回 言わない★
             「このページの小計」は すぐ上の 明細の箱が すでに出している。
             ここで もう一度 出すと、同じ紙の同じ場所に同じ額が2つ並ぶ
             （2026-08-15 スクショで実際に ¥66,500 が2つ並んでいた）。
             ★ここは「続く」ことだけ言う。★ */
          : '<div class="cont"><div class="cont-n">次ページへ続く →</div></div>');
      /* ★1ページ ＝ A4の紙そのもの★（司さん 2026-08-16「中途半端に次のがのる」）
         見本＝代行請求 invoice-pdf.js:753 は ★doc.addPage([595.28, 841.89])★＝
         中身が少なくても ★紙の大きさは A4 固定★。足元（自社情報）は下端から測った位置に置く。
         うちは 中身なりの高さだったので、2枚目が ★1枚目の途中から★ 始まって見えた。
         ＝★上の中身は上から積み・足元は紙の下端に貼る★（表の2行で作る＝flex は使わない）。 */
      return '<div class="sheet"><table class="pg"><tbody>'
        + '<tr class="pg-b"><td>' + body + '</td></tr>'
        + '<tr class="pg-f"><td>' + foot + '</td></tr>'
        + '</tbody></table></div>';
    }).join('');

    var html = ''
      + '<!DOCTYPE html>\n<html lang="ja"><head><meta charset="UTF-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>' + esc(docTitle) + '</title>'
      + '<style>' + css(TH) + '</style></head><body>'
      + sheets
      + '</body></html>';

    return {
      html: html, title: docTitle, templateId: inv.template_id || TEMPLATE_ID,
      cols: spec, colWidths: colW, pages: pages.length,
    };
  }

  /* ── 紙の見た目 ────────────────────────────────────────────
     ★文が入る所に flex/grid を使わない★（1文字ずつ縦に割れる事故を作らない）。
     ★枠で囲まない★（御請求金額・振込先・備考）＝うちの紙の作法。 */
  function css(t) {
    var TH = themeOf(t);
    var INK = TH.ink, SUB = TH.sub, LINE = TH.line, ACCENT = TH.accent;
    var rowsOnly = TH.rule !== 'all';
    var cellBorder = rowsOnly
      ? 'border:0;border-bottom:' + HAIR + ' solid ' + LINE + ';'
      : 'border:' + HAIR + ' solid ' + LINE + ';';
    return [
      '*{box-sizing:border-box;}',
      'html,body{margin:0;padding:0;background:#FFFFFF;color:' + INK + ';',
      "font-family:'Noto Sans JP','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif;",
      '-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
      /* ★1ページ＝A4の紙そのもの★（中身が少なくても紙の大きさは変わらない）
         ＝2枚目が「1枚目の途中」から始まらない。見本＝代行請求 invoice-pdf.js（addPage([A4]）。 */
      '.sheet{width:210mm;min-width:210mm;height:297mm;margin:0 auto;padding:10mm 10mm;',
      'position:relative;overflow:hidden;background:#FFFFFF;}',
      /* 上の中身は上から積み、足元は紙の下端に貼る（★表の2行で作る＝flex を使わない★） */
      '.pg{width:100%;height:100%;border-collapse:collapse;table-layout:fixed;}',
      '.pg>tbody>tr>td{padding:0;}',
      '.pg-b>td{vertical-align:top;}',
      '.pg-f>td{vertical-align:bottom;height:1px;}',
      /* 画面で紙の切れ目が分かるように（印刷では出さない） */
      '.sheet + .sheet{border-top:' + HAIR + ' dashed ' + LINE + ';}',
      '@media print{.sheet{page-break-after:always;break-after:page;border-top:0;}',
      '.sheet:last-child{page-break-after:auto;break-after:auto;}}',

      /* ★日付・No. の塊は題名より上（実物と同じ並び）。題名を少し下げて場所を空ける★ */
      /* ★⑦ 頭を詰める★ 題名の上下を詰める（実測して行数に回す） */
      '.ttl{font-size:20pt;letter-spacing:' + TH.titleSpacing + ';text-align:center;color:' + INK + ';',
      'margin:6mm 0 5mm;font-weight:700;}',

      /* 日付・No.（右上）。★ラベルの後ろは全角スペース＝字間はそれで作る★ */
      '.meta{position:absolute;top:10mm;right:10mm;font-size:9pt;color:' + SUB + ';text-align:right;}',
      '.meta-l{display:block;white-space:nowrap;line-height:1.6;}',

      /* 宛名（左）／自社（右）。★表の2列＝幅が足りなくても文が縦に割れない★
         ★下線は引かない（うちの紙は引いていない）★ */
      '.party{width:100%;border-collapse:collapse;margin:0 0 3mm;table-layout:fixed;}',
      '.party td{vertical-align:top;padding:0;}',
      '.party-to{width:56%;min-width:80mm;}',
      '.party-from{width:44%;min-width:60mm;text-align:right;}',
      '.to-name{font-size:14pt;font-weight:700;display:block;line-height:1.45;',
      'word-break:normal;overflow-wrap:break-word;}',
      '.to-sub{font-size:9.5pt;color:' + SUB + ';line-height:1.55;',
      'word-break:normal;overflow-wrap:break-word;}',
      '.from-name{font-size:11pt;font-weight:700;line-height:1.45;',
      'word-break:normal;overflow-wrap:break-word;}',
      '.from-sub{font-size:9pt;color:' + SUB + ';line-height:1.45;',
      'word-break:normal;overflow-wrap:break-word;}',
      /* ★角印は薄く重ねる（下の文字を隠し切らない）★
         大きさは会社が決める（10〜40mm・既定21mm）。文字の上に少しかかってよい。 */
      '.seal{display:inline-block;object-fit:contain;margin-top:2mm;opacity:.95;}',
      '.pageno{font-size:9.5pt;color:' + SUB + ';margin:0 0 2.4mm;}',
      '.lead-greet{margin:0 0 1.6mm;}',

      /* 挨拶。★block＋十分な幅＝1文字ずつ縦に割れない★ */
      /* ★「◯月分」と挨拶は ひと続きの文★＝間を空けない（司さん 2026-08-16）
         行を2つに分けた時に 両方へ下の余白（3mm）が付いて ★11px ずつ空いていた★。 */
      '.lead{margin:0 0 1mm;}',
      /* ★挨拶は小さく（毎月おなじ文）／「◯月分」は本文の大きさのまま★ */
      '.lead-p{font-size:9.5pt;color:' + INK + ';margin-right:4mm;}',
      '.lead-g{font-size:8.5pt;color:' + SUB + ';}',
      '.lead-l{display:block;width:100%;min-width:80mm;font-size:9.5pt;color:' + SUB + ';',
      'line-height:1.45;white-space:normal;word-break:normal;overflow-wrap:break-word;}',

      /* ★御請求金額＝枠なし。ラベル（小）＋金額（大）＋★金額の下だけ★に細い線★
         （司さん 2026-08-16「下線も金額の下までにしろ」）
         ★表で組む★＝ラベルと金額が離れても 線は金額の幅だけに付く。 */
      '.grand{margin:0 0 4mm;border-collapse:collapse;width:100%;table-layout:auto;}',
      /* ★ラベルと金額の間は td 側で決める★（.grand th,.grand td の一括指定の方が強いので、
         .grand-v だけに padding-left を書いても効かない＝2026-08-16 実測 0px だった） */
      '.grand th,.grand td{padding:0 0 1.5mm;vertical-align:baseline;white-space:nowrap;}',
      /* ★線は「ラベルの左端 → 金額の右端」まで1本★（司さん 2026-08-16）
         ★紙の幅いっぱいには引かない★（何に対する線か分からなくなる）／
         ★金額の下だけにもしない★（線が途中から始まって見える＝私の読み違い）。 */
      '.grand th.grand-l{font-size:12pt;font-weight:700;color:' + INK + ';text-align:left;width:1%;',
      'border-bottom:' + HAIR + ' solid ' + LINE + ';}',
      '.grand td.grand-v{font-size:20pt;font-weight:700;color:' + TH.grandInk + ';',
      'padding:0 0 1.5mm 12mm;text-align:left;width:1%;',
      'border-bottom:' + HAIR + ' solid ' + LINE + ';',
      "font-family:'DM Mono',ui-monospace,monospace;letter-spacing:.02em;}",
      '.grand-x{width:98%;}',

      /* 表の上の小さなキャプション【…】 */
      '.cap{font-size:9pt;color:' + SUB + ';margin:0 0 2mm;',
      'white-space:normal;word-break:normal;overflow-wrap:break-word;}',

      /* 明細。★縦の罫は引かない・見出しは薄い地・表の下を1本で締める★ */
      /* ★② 線は「上」に統一★（司さん 2026-08-16）
         表そのものに下線を引くと、合計行だけ ★上にも下にも線★が付いて、
         締めの行（上線だけ）と作法が違って見える。★線の付け方は1か所★＝合計行の上線だけ。 */
      '.items{width:100%;table-layout:fixed;border-collapse:collapse;font-size:9.5pt;margin:0 0 4mm;}',
      /* ★見出しは切らずに折り返す★
         2カラムにして明細の幅が狭くなり、「数量」が ★「数…」と切れていた★（2026-08-15 実測）。
         ★列の名前は会社が決める＝長い名前も来る★ので、切るのではなく折り返して全部 見せる。 */
      '.items th{background:' + TH.headBg + ';color:' + TH.headInk + ';font-weight:700;font-size:8.5pt;',
      'border:0;padding:' + ROW_PAD + ';line-height:1.35;',
      'white-space:normal;word-break:normal;overflow-wrap:break-word;}',
      '.items td{' + cellBorder + 'padding:' + ROW_PAD + ';vertical-align:top;line-height:' + ROW_LH + ';height:' + ROW_H + ';}',
      '.items .c-left{text-align:left;}',
      '.items .c-center{text-align:center;}',
      '.items .c-right{text-align:right;white-space:nowrap;',
      "font-family:'DM Mono',ui-monospace,monospace;}",
      '.items .c-wrap{word-break:normal;overflow-wrap:break-word;}',
      '.items .c-nowrap{white-space:nowrap;}',
      '.c-memo{display:block;font-size:8.5pt;color:' + SUB + ';line-height:1.6;margin-top:.5mm;}',
      '.c-empty{text-align:center;color:' + SUB + ';padding:6mm 2mm;}',

      /* ★足元＝左に振込先／右に合計（表の2列＝文が縦に割れない）★ */
      /* ★2カラム（左＝①明細／右＝②控除＋③締め）★
         ★表で組む★（flex だと文が1文字ずつ縦に割れる）。上ぞろえ＝締めの位置が動かない。 */
      '.cols2{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 4mm;}',
      '.cols2>tbody>tr>td{vertical-align:top;padding:0;}',
      '.c2-l{width:70%;padding-right:4mm;}',
      '.c2-r{width:30%;}',

      /* ★空の枠★ 罫線は残す（★白黒コピーでも見える濃さ★＝色ではなく濃さで作る） */
      '.r-blank td,.r-blank th{color:transparent;}',
      '.c-blank{background:transparent;}',

      /* ★ブロック（給料明細と同じ作法）★
         見出しの下に線 → 中身（足りない行は高さの決まった空行）→ ★このブロックの合計★（上に線）
         ★左右の行の高さを同じにする★＝同じ番号の行の上端が同じ位置に来る。 */
      '.blk{margin:0 0 4mm;}',
      /* 箱の名前（控除）＝読ませる字なので ★薄い黒★（罫の色で書くと消えかける） */
      '.st{font-size:9.5pt;font-weight:700;color:' + INK + ';letter-spacing:.16em;',
      'padding:0 0 1.6mm;border-bottom:' + HAIR + ' solid ' + LINE + ';margin:0 0 0;}',
      /* ★② 表の中の合計行★（列の真下に来る＝上の行と縦に重なる）
         給料明細の「支給合計」と同じ役目だが、★列がある表では 表の中に置く★。 */
      /* ★見出しの地色を引き継がない★（th なので .items th の薄い地が乗って、
         合計行の左半分だけ塗られて見えた＝2026-08-15 スクショで発見） */
      '.items tfoot .r-sum th,.items tfoot .r-sum td{background:transparent;border-top:' + HAIR + ' solid ' + LINE + ';',
      'border-bottom:0;padding:' + ROW_PAD + ';line-height:' + ROW_LH + ';font-weight:700;color:' + INK + ';}',
      '.items tfoot .r-sum td{' + "font-family:'DM Mono',ui-monospace,monospace;}",
      '.c-sumlabel{text-align:left;white-space:nowrap;}',
      '.bsum{width:100%;border-collapse:collapse;font-size:9.5pt;margin:0;}',
      '.bsum th{text-align:left;font-weight:700;color:' + INK + ';border:0;border-top:' + HAIR + ' solid ' + LINE + ';',
      'padding:1.8mm ' + EDGE + ';white-space:nowrap;}',
      '.bsum td{text-align:right;font-weight:700;color:' + INK + ';border:0;border-top:' + HAIR + ' solid ' + LINE + ';',
      'padding:1.8mm ' + EDGE + ';white-space:nowrap;' + "font-family:'DM Mono',ui-monospace,monospace;}",

      /* ★② 差し引く（控除）★ ★行の高さは明細と同じ★（左右の罫線をそろえる） */
      '.ded{width:100%;border-collapse:collapse;font-size:9.5pt;table-layout:fixed;}',
      '.ded th{text-align:left;font-weight:400;color:' + INK + ';' + cellBorder + 'padding:' + ROW_PAD + ';',
      'height:' + ROW_H + ';line-height:' + ROW_LH + ';',
      'white-space:normal;word-break:normal;overflow-wrap:break-word;}',
      '.ded td{text-align:right;white-space:nowrap;' + cellBorder + 'padding:' + ROW_PAD + ';',
      'height:' + ROW_H + ';line-height:' + ROW_LH + ';',
      "font-family:'DM Mono',ui-monospace,monospace;}",
      /* 右の見出しの行＝左の明細の見出しと同じ高さ・同じ見た目 */
      '.ded-hd th,.ded-hd td{background:' + TH.headBg + ';color:' + TH.headInk + ';font-weight:700;',
      'font-size:8.5pt;border:0;padding:' + ROW_PAD + ';line-height:1.35;height:auto;}',
      '.ded-hd td{text-align:right;font-family:inherit;}',
      '.ded .r-blank th,.ded .r-blank td{color:transparent;}',

      '.foot{width:100%;border-collapse:collapse;table-layout:auto;margin:0;}',
      '.foot td{vertical-align:top;padding:0;}',
      /* ★長い銀行名でも1行に収まる幅を左に回す★（司さん 2026-08-16）
         幅を % で固定すると ★長い銀行名が途中で折り返す★。
         ＝★（内訳）は中身なりの幅だけ取り、残りは全部 振込先に回す★（table-layout:auto）。
         紙の中身幅 718px のうち（内訳）は約200px＝★振込先に約500px★使える
         （「三菱UFJ銀行　丸の内中央支店　当座　1234567」で 224px＝倍以上の余裕）。 */
      '.foot-l{width:auto;padding-right:5mm;}',
      '.foot-r{width:1%;white-space:nowrap;}',

      /* ★小計/消費税/合計＝右下・枠なし・合計の上に線★ */
      '.sums{border-collapse:collapse;font-size:9.5pt;width:100%;margin:0 0 4mm;}',
      '.sums th{text-align:left;color:' + SUB + ';font-weight:400;border:0;',
      'padding:1.4mm ' + EDGE + ';white-space:nowrap;}',
      '.sums td{text-align:right;border:0;padding:1.4mm ' + EDGE + ';white-space:nowrap;',
      "font-family:'DM Mono',ui-monospace,monospace;}",
      /* ★紙の中で一番 大きい金額は 頭の「ご請求金額」1つだけ★（給料明細の差引支給額と同じ）。
         締めの中は ★全部 小さく★＝どれを振り込むのか迷わせない。 */
      '.sums-g th{border-top:' + HAIR + ' solid ' + LINE + ';font-size:12pt;font-weight:700;color:' + INK + ';}',
      '.sums-g td{border-top:' + HAIR + ' solid ' + LINE + ';font-size:14pt;font-weight:700;color:' + TH.grandInk + ';}',
      /* ★途中の「合計」は途中★＝細い線だけ。ここを太くすると
         「合計＝太字／請求額＝細字」になり、★払う額の方が弱く見える★
         （2026-08-15 実物のスクショで見つけた。給料明細も最後の行が主役）。 */
      '.sums-mid th,.sums-mid td{border-top:' + HAIR + ' solid ' + LINE + ';color:' + INK + ';}',
      /* 締めの中の枝（本文より少し小さく・罫は引かない） */
      '.sums-sub th,.sums-sub td{color:' + SUB + ';font-size:9pt;}',
      /* ★締めの最後の1行＝実際に払う額★ 大きさは変えず、線と太さで一番 強くする。 */
      '.sums-net th,.sums-net td{border-top:' + HAIR + ' solid ' + LINE + ';font-weight:700;color:' + INK + ';}',
      '.sums-net td{color:' + TH.grandInk + ';}',

      /* （内訳）★枠で囲まない★ */
      /* ★（内訳）の周りにも余白★（右下にぴったり詰めない） */
      '.bd{margin:0 0 5mm;padding-left:4mm;}',
      '.bd-h{font-size:8.5pt;color:' + SUB + ';margin:0 0 1mm;padding-left:' + EDGE + ';}',
      /* ★出す時は 締めと同じ大きさで読ませる★（前は 9pt で右下に押し込んで小さかった） */
      /* ★（内訳）も 明細の表と同じ寸法で読ませる★（司さん 2026-08-16
         「ごちゃごちゃ小さくて見にくい／行がずれる／余白を取れ」）
         ・字 … 9pt → ★9.5pt（明細と同じ）★
         ・行の高さ・左右の余白 … ★明細と同じ（ROW_H / ROW_PAD）★
         ・★列の幅を決める（fixed）★＝見出しと本文が必ず同じ幅＝ずれて見えない
           （auto だと 見出しの字と中身の数字で列の取り合いになり、毎回 幅が動く） */
      /* ★幅は実寸で決める★（％にすると 親のマスが中身なりなので 50px まで潰れた＝2026-08-16 実測）
         ＝（内訳）は必ず ★70mm★ 取り、残りは全部 振込先に回る（長い銀行名も1行に収まる）。 */
      '.rates{border-collapse:collapse;font-size:9.5pt;width:70mm;table-layout:fixed;}',
      '.rates col.rc-k{width:26mm;}',
      '.rates col.rc-n{width:22mm;}',
      /* ★紙の中の表は 3つとも同じ作法★（司さん 2026-08-16「行がずれとる」の正体）
         明細・控除は「見出し＝薄い地・罫なし／本文＝下罫線」なのに、
         ★（内訳）だけ「見出しも本文と同じ下罫線」★で、見出し行だけ作りが違って見えていた。
         ＝★（内訳）の見出しも 明細の見出しと同じにする★（薄い地・罫なし・8.5pt）。
         ★同じ padding を使う★＝右端の位置が1か所で決まる（別々に書くとまたずれる） */
      '.rates thead th{background:' + TH.headBg + ';color:' + TH.headInk + ';font-weight:700;',
      'font-size:8.5pt;border:0;padding:' + ROW_PAD + ';line-height:1.35;white-space:nowrap;}',
      '.rates th{color:' + SUB + ';border:0;border-bottom:' + HAIR + ' solid ' + LINE + ';',
      'padding:' + ROW_PAD + ';height:' + ROW_H + ';line-height:' + ROW_LH + ';',
      'white-space:nowrap;font-weight:400;}',
      '.rates .rt-l{text-align:left;}',
      '.rates .rt-r{text-align:right;}',
      '.rates td{border:0;border-bottom:' + HAIR + ' solid ' + LINE + ';padding:' + ROW_PAD + ';',
      'height:' + ROW_H + ';line-height:' + ROW_LH + ';text-align:right;',
      "white-space:nowrap;font-family:'DM Mono',ui-monospace,monospace;}",
      /* ★中身の1列目も 見出しと同じ左そろえ★
         th は既定が中央寄せなので、指定を忘れると
         ★「区分」の下の「10% 対象」だけ 27.9px 右にずれる★（2026-08-16 実測・司さんの指摘⑦）。 */
      '.rates tbody th{color:' + INK + ';text-align:left;}',
      '.r-none{text-align:center;color:' + SUB + ';}',

      /* 振込先・備考。★箱で囲まない★（文の幅だけは確保する） */
      '.note{margin:0 0 3mm;}',
      /* ★⑧ 振込先＝客が一番 使う所★ 枠で囲って薄く塗る。
         ★色は うちの緑1色・薄く★／★枠は白黒コピーでも残る濃さ★（色ではなく濃さで作る）。 */
      /* ★塗りは字の幅に合わせる★（司さん 2026-08-16「余白がありすぎ」）
         前は 左の欄いっぱい（幅58%）に広げていたので、
         ★字の右に大きな空きがある箱★になっていた（実測 2026-08-16：右に 150px 以上の空き）。
         ＝★中身なりの幅（inline-block）★。長い名義は 左の欄の幅までで折り返す。 */
      /* ★塗った箱は 字の周りに余白を取る★（司さん 2026-08-16「余白が無いと逆に見にくい」）
         ★幅は中身なり（display:table）★＝字の右に大きな空きは作らない。
         ★border-collapse は継承する★＝足元の表（collapse）の中に display:table を置くと
         ★padding が丸ごと無視される★（実測 2026-08-16：枠と字の間が 1px しか無かった）。
         ＝separate に戻してから余白を付ける。 */
      '.note-bank{display:table;border-collapse:separate;border:' + HAIR + ' solid ' + LINE + ';',
      'background:' + TH.headBg + ';border-radius:1.5mm;padding:2.4mm 4mm;margin:0 0 2.4mm;}',
      '.note-bank .note-h{margin-bottom:1.6mm;}',

      /* 箱の中の字は 中身なりの幅（★最低幅は残す＝1文字ずつ縦に割れない★）
         ※ .note-b とは別のクラスにしている＝「.note-b の決まり」を検査する所と混ざらないため */
      /* ★振込先の高さは いつも同じ★（司さん 2026-08-16 の並びの統一と同じ考え）
         名義が長くて2行になる会社と 1行の会社で ★足元の高さが変わると 載る行数も変わる★
         （実測 2026-08-16：長い名義で +24px＝1行ぶん はみ出した）。
         ＝★2行ぶんの高さを最初から取る★＝どの会社でも 紙の顔が同じ・行数も同じ。 */
      '.note-bb{width:auto;min-width:22mm;min-height:83px;}',
      '.note-bank .note-h{color:' + TH.headInk + ';font-weight:700;}',
      /* 口座番号（続いた数字）だけ 大きく等幅＝読み間違いを減らす */
      /* 名義は次の行（★毎回おなじ形★＝中途半端な所で折れない） */
      '.bank-nm{display:inline-block;margin-top:.6mm;}',
      '.bank-no{font-size:13pt;font-weight:700;letter-spacing:.06em;',
      "font-family:'DM Mono',ui-monospace,monospace;}",
      '.note-h{font-size:8.5pt;color:' + SUB + ';margin-bottom:.8mm;}',
      '.note-b{display:block;width:100%;min-width:60mm;font-size:9.5pt;line-height:1.9;',
      'white-space:normal;word-break:normal;overflow-wrap:break-word;}',

      /* 次の紙へ送る時 */
      '.cont{margin:0 0 4mm;text-align:right;}',
      '.cont-l{display:block;font-size:9.5pt;color:' + SUB + ';white-space:nowrap;}',
      '.cont-v{margin-left:6mm;color:' + INK + ";font-family:'DM Mono',ui-monospace,monospace;}",
      '.cont-n{display:block;font-size:10pt;color:' + INK + ';margin-top:1.5mm;white-space:nowrap;}',

      /* ── 領収書だけの物 ──────────────────────────────────
         ★文が入る所に flex を使わない★（1文字ずつ縦に割れる事故を作らない）＝
         但し書きは「ラベル＋本文」を ★inline で並べ、本文は折り返せる★ 形にする。 */
      '.rc-but{margin:0 0 4mm;font-size:11pt;line-height:1.9;',
      'white-space:normal;word-break:normal;overflow-wrap:break-word;}',
      '.rc-but-l{color:' + SUB + ';white-space:nowrap;}',
      '.rc-but-b{border-bottom:' + HAIR + ' solid ' + LINE + ';padding:0 1mm .6mm;}',
      '.rc-ack{margin:0 0 6mm;font-size:11pt;color:' + INK + ';}',
      '.rc-sums{margin:0 0 4mm;}',
      '.rc-way{margin:0 0 3mm;font-size:9.5pt;color:' + SUB + ';}',
      '.rc-stamp{display:block;width:100%;min-width:60mm;margin:6mm 0 0;font-size:8.5pt;color:' + SUB + ';',
      'line-height:1.9;white-space:normal;word-break:normal;overflow-wrap:break-word;}',

      '@page{size:A4;margin:0;}',
      '@media print{.sheet{width:210mm;min-width:210mm;padding:14mm 12mm;}}',
    ].join('');
  }

  return {
    build: build, css: css, esc: esc, yen: yen, comma: comma,
    dateStr: dateStr, jpDate: jpDate, honorOf: honorOf, taxLabel: taxLabel,
    paginate: paginate, sealMm: sealMm, TEMPLATE_ID: TEMPLATE_ID,
    /* ★振込先の分け方は紙も Excel も同じ物を呼ぶ★ */
    bankLines: bankLines,
    ROWS_FIRST: ROWS_FIRST, ROWS_REST: ROWS_REST,
    /* ★画面が「2枚になります」を出すために呼ぶ（自前で数えない）★ */
    showDeductOf: showDeductOf, frameRowsOf: frameRowsOf, pagesOf: pagesOf,
    maxRowsOf: maxRowsOf, rateRowsOf: rateRowsOf, planPages: planPages, planOf: planOf, MID_ROWS: MID_ROWS,
    PAPER_ROWS: PAPER_ROWS, PAPER_ROWS_DED: PAPER_ROWS_DED, DEDUCT_ROWS: DEDUCT_ROWS,
  };
});
