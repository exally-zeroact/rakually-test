/* app.js — 請求書の画面の配線
 * ==============================================================================
 * ★決まりはここに書かない★
 *   消費税 = seikyu/lib/seikyu-tax.js ／ 番号・凍結・入金の状態 = seikyu/lib/seikyu-doc.js
 *   紙      = seikyu/lib/seikyu-paper.js ／ Excelの中身 = seikyu/lib/seikyu-aoa.js
 *   ファイル名 = seikyu/lib/seikyu-name.js ／ 倉庫 = seikyu/js/seikyu-store.js
 *   ここは「押した時に、どれを呼ぶか」だけ。
 *
 * ★税率の数字を1つも書かない★ … 選択肢は SeikyuTax.rates()（唯一の正から）で作る。
 * ★取れなかったを 0 や空にしない★ … 入金が読めない時は「未確認」と出す（0件と作り分ける）。
 * ★押せない時は、押せない理由を出す★ … 黙って無反応にしない。
 */
(function (global) {
  'use strict';

  var DOC = global.SeikyuDoc, TAX = global.SeikyuTax, PAPER = global.SeikyuPaper;
  var NAME = global.SeikyuName, AOA = global.SeikyuAoa, OUT = global.SeikyuOut;
  var COLS = global.SeikyuCols, TPL = global.SeikyuTemplates;
  var GENSEN = global.SeikyuGensen, CARRY = global.SeikyuCarry;

  var TEMPLATE_ID = TPL.DEFAULT_ID;
  var ALIGN_LABEL = { left: '左', center: '中', right: '右' };

  var S = {
    sb: null, store: null, suite: null,
    org: null, partners: [], invoices: [], receipts: null,
    // ★見積は一覧の裏でも持つ★（請求書を開いた時に「どの見積から作ったか」を名前で出すため）
    quotes: [],
    cur: null,            // 今 開いている1通（画面の下書き）
    fil: 'live',      // ★既定は「取り消し以外」＝出した紙が上に来る
    /* ★今 見ている種類（請求書／見積書）★
       見積は 紙も棚も変換も前から在ったのに、どの画面からも作れなかった。ここが入口。
       ★領収書はここに入らない★＝doc_type ではなく、入金1行から出す紙。 */
    docType: 'invoice',
    dirty: false,
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return PAPER.esc(s); }
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }
  function setText(id, t) { var e = $(id); if (e) e.textContent = t || ''; }
  /* 注意書きの箱。★1件1行で出す★
     （2文が続けて流れると「何件 出ているか」が読めない＝控除の赤で実際に読みにくかった）
     中身は textContent で入れる＝打った文字がそのまま出る（HTMLとして解釈しない）。 */
  function box(id, text) {
    var e = $(id); if (!e) return;
    var t = String(text == null ? '' : text);
    e.textContent = '';
    if (t) {
      var lines = t.split('\n').filter(function (x) { return x.trim() !== ''; });
      if (lines.length <= 1) e.textContent = t;
      else lines.forEach(function (ln) {
        var d = document.createElement('div');
        d.className = 'msg-l';
        d.textContent = ln;
        e.appendChild(d);
      });
    }
    show(e, !!t);
  }

  /* ★画面の金額は「1,100 円」（桁区切り＋円）★
     紙は「¥1,100」（¥ 記号）。画面で ¥ と 円 を両方付けると二重になる。
     どちらも同じ関数から作る＝紙と画面で桁区切りがズレない。 */
  function yen(v) { return PAPER.comma(v); }
  function todayYmd() {
    var d = new Date(), z = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  /* ═══ 画面の切り替え ═══ */
  function goScreen(id) {
    ['scr-list', 'scr-edit', 'scr-set'].forEach(function (s) {
      var el = $(s); if (el) el.classList.toggle('active', s === id);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.bn'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-scr') === id);
    });
    try { global.scrollTo(0, 0); } catch (e) { /* 端末によっては動かないが害はない */ }
  }

  /* ═══ 設定（自社の data に同居させる） ═══ */
  function settings() {
    var d = S.org || {};
    var nb = (d.numbering && d.numbering.invoice) || {};
    return {
      format: nb.format || 'ym-seq',
      resetYearly: nb.resetYearly === undefined ? true : !!nb.resetYearly,
      taxMode: d.taxMode === 'inclusive' ? 'inclusive' : 'exclusive',
      rounding: (['floor', 'ceil', 'round'].indexOf(d.taxRounding) >= 0) ? d.taxRounding : 'floor',
      bank: d.bank || '',
      carry: !!d.invoiceCarry,      // ★繰越を紙に出すか（既定は切＝今までどおり）
      template: TPL.get(d.invoiceTemplate) ? d.invoiceTemplate : TPL.DEFAULT_ID,
      cols: (d.invoiceCols && Array.isArray(d.invoiceCols.items) && d.invoiceCols.items.length) ? d.invoiceCols : null,
      /* ★紙の枠の行数（空＝既定。既定の数は紙の側が持っている）★
         0以上の整数だけ受ける。読めない字が入っていたら「決めていない」と同じ扱い。 */
      paperRows: rowsSetting(d.invoicePaperRows),
      deductRows: rowsSetting(d.invoiceDeductRows),
    };
  }
  /* 会社が入れた枠の行数を読む。★空欄と 0 は別物★（0＝枠を作らず詰める） */
  function rowsSetting(v) {
    if (v === undefined || v === null || v === '') return null;
    var n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.trunc(n);
  }

  /* ═══ 列（★どんな項目にも対応する所★） ═══
     発行済み … 写し(snapshot.cols)＝出した紙と同じ並びで刷り直せる
     下書き   … その1通の data.cols ／ 無ければ会社の既定 ／ それも無ければ様式の初期値 */
  function colsOf(inv) {
    var v = inv || {};
    var snap = v.snapshot && v.snapshot.cols;
    if (snap && Array.isArray(snap.items) && snap.items.length) return COLS.normalizeSpec(snap);
    var s = settings();
    // ★もう出してしまった紙（発行済み・取り消し済み）は、会社の「今の列」を当てない★
    //   列を足した日に、去年 出した請求書の紙まで列が増えるのは、控えと紙が食い違うのと同じ。
    //   写しに列が無い＝列を選べるようになる前に出した物 → その様式の既定（＝当時 刷った並び）で刷る。
    if (v.id && v.status && v.status !== 'draft') {
      return COLS.normalizeSpec(TPL.getOrDefault(v.template_id).cols);
    }
    var own = v.data && v.data.cols;
    if (own && Array.isArray(own.items) && own.items.length) return COLS.normalizeSpec(own);
    if (s.cols) return COLS.normalizeSpec(s.cols);
    return COLS.normalizeSpec(TPL.getOrDefault(v.template_id || s.template).cols);
  }
  function themeOf(inv) {
    var v = inv || {};
    var id = v.template_id || settings().template;
    return TPL.getOrDefault(id).theme;
  }

  var ROUND_LABEL = { floor: '切り捨て', ceil: '切り上げ', round: '四捨五入' };

  function fillSelect(el, items, value) {
    if (!el) return;
    el.innerHTML = items.map(function (it) {
      return '<option value="' + esc(it.v) + '">' + esc(it.t) + '</option>';
    }).join('');
    if (value !== undefined && value !== null) el.value = value;
  }

  /* 税率の選択肢。★数字は書かない＝唯一の正から作る★
     ★非課税と対象外(不課税)は別物★（国税庁）。どちらも消費税は付かないが、
     非課税＝本来は課税の取引だが政策で課さない（住宅家賃・保険料など）、
     対象外＝そもそも取引ではない（立替金・寄付など）。紙では別の行に出す。
     選び所は既にあるので、★ここに1つ足すだけ＝聞く回数は増えない★。 */
  var NONTAX_V = '0!nontax';
  function rateOptions() {
    var rs = TAX.rates() || [];
    var out = [];
    rs.forEach(function (p) {
      if (Number(p) === 0) {
        out.push({ v: NONTAX_V, t: '非課税' });
        out.push({ v: String(p), t: '対象外' });
        return;
      }
      out.push({ v: String(p), t: p + '%' });
    });
    return out;
  }
  /** 行が今どれを選んでいるか（選び所の value に直す） */
  function rateValueOf(ln) {
    if (Number(ln.rate) === 0 && ln.nontax) return NONTAX_V;
    return String(ln.rate);
  }

  /* ═══ 取引先 ═══ */
  function partnerById(id) {
    for (var i = 0; i < S.partners.length; i++) if (S.partners[i].id === id) return S.partners[i];
    return null;
  }
  function partnerName(inv) {
    var byId = {};
    S.partners.forEach(function (p) { byId[p.id] = p; });
    return DOC.partnerNameOf(inv, byId);
  }

  /* ═══ 一覧 ═══ */
  /** その1通の入金の状態。★数え方は seikyu-doc.js が唯一の正（画面で数え直さない）★
   *  S.receipts が null＝読めていない → paymentStateOf が 'unknown' を返す（0にしない）。 */
  function payStateOf(inv) {
    return DOC.paymentStateOf(
      { id: inv.id, grand_total: (inv.totals && inv.totals.grandTotal) || 0 },
      S.receipts === null ? null : S.receipts);
  }
  function payLabel(inv) {
    // ★発行していない紙に「未入金」と書かない★（まだ請求していない＝入金の話が無い）
    if (inv.status !== 'issued') return '';
    var st = payStateOf(inv);
    var lb = DOC.PAY_STATE_LABEL[st.state] || '';
    /* ★状態の言葉だけでは督促の判断ができない。いくら残っているかまで出す★ */
    if (st.state === 'partial') lb += '　残り ' + yen(st.remain) + ' 円';
    else if (st.state === 'over') lb += '　' + yen(-st.remain) + ' 円 多い';
    return lb;
  }

  function renderList() {
    var host = $('list-body'); if (!host) return;
    var rows = S.invoices.filter(function (v) {
      if (S.fil === 'live') return v.status !== 'void';   // ★既定は取り消し以外（出した紙が上に来る）
      return S.fil === 'all' || v.status === S.fil;
    });
    if (!rows.length) {
      host.innerHTML = '<div class="card"><div class="empty">'
        + (S.invoices.length ? 'この絞り込みに当てはまる請求書はありません。' : 'まだ請求書がありません。「＋ 新しい請求書」から出せます。')
        + '</div></div>';
      return;
    }
    host.innerHTML = rows.map(function (v) {
      var tag = v.status === 'issued' ? '<span class="tag tag-on">発行済</span>'
        : v.status === 'void' ? '<span class="tag tag-mute">取り消し</span>'
          : '<span class="tag tag-off">下書き</span>';
      var g = (v.totals && v.totals.grandTotal);
      return '<button class="row" type="button" data-open="' + esc(v.id) + '">'
        + '<span class="iv-top">' + tag
        + '<span class="iv-no">' + (esc(v.no) || '（未採番）') + '</span>'
        + '<span class="iv-name">' + esc(partnerName(v)) + '</span></span>'
        + '<span class="iv-sub">' + esc(v.issue_ymd || '請求日なし')
        + (v.due_ymd ? '　期限 ' + esc(v.due_ymd) : '')
        + '　' + esc(payLabel(v)) + '</span>'
        + '<span class="iv-sub"><span class="iv-amt">' + (g === undefined || g === null ? '—' : yen(g) + ' 円') + '</span></span>'
        + '</button>';
    }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('[data-open]'), function (b) {
      b.onclick = function () { openInvoice(b.getAttribute('data-open')); };
    });
  }

  /** 一覧の見出し・ボタンの言葉を、今 見ている種類にそろえる（呼び名は DOC が唯一の正） */
  function drawKind() {
    var lb = DOC.docLabel(S.docType);
    setText('list-h', lb);
    var b = $('b-new'); if (b) b.textContent = '＋ 新しい' + lb;
    setText('list-hint', '発行した' + lb + 'は、あとから中身を直せません（取り消して作り直します）。'
      + '番号は同じ物を二度使いません（' + DOC.docLabel('invoice') + 'と' + DOC.docLabel('quote') + 'は別の系列です）。');
    Array.prototype.forEach.call(document.querySelectorAll('#kind-seg [data-kind]'), function (x) {
      x.classList.toggle('on', x.getAttribute('data-kind') === S.docType);
    });
  }

  function loadList() {
    box('list-err', '');
    return Promise.all([
      S.store.invoices.list(S.docType),
      S.store.receipts.list(),
      // ★見積の一覧も持つ（請求書に「どの見積から作ったか」を番号で出すため）
      S.docType === 'quote' ? Promise.resolve(null) : S.store.invoices.list('quote'),
    ]).then(function (r) {
      S.invoices = r[0] || [];
      S.receipts = r[1];                     // ★null のまま持つ＝「未確認」と「0件」を作り分ける
      S.quotes = (S.docType === 'quote') ? S.invoices : (r[2] || []);
      drawKind();
      renderList();
    }).catch(function (e) {
      box('list-err', '請求書の一覧が読めませんでした（' + ((e && e.message) || 'error') + '）。ネットの状態を確かめて「読み直す」を押してください。');
    });
  }

  /* ═══ 1通の編集 ═══ */
  function blankInvoice(o) {
    var s = settings();
    return {
      // ★今 見ている種類で作る（見積の入口）★
      id: '', doc_type: (o && o.docType) || S.docType || 'invoice', no: '', partner_id: '',
      issue_ymd: todayYmd(), due_ymd: '',
      status: 'draft', tax_mode: s.taxMode, rounding: s.rounding,
      lines: [blankLine()],
      totals: {}, snapshot: {},
      // ★列は作った時に「その1通の物」として写しておく★
      //   あとで会社が列を変えても、作りかけの下書きの並びが勝手に変わらない。
      data: {
        subject: '', memo: '', noMode: 'auto', term: { kind: 'none', n: 0 },
        cols: COLS.normalizeSpec(s.cols || TPL.getOrDefault(s.template).cols),
      },
      template_id: s.template || TEMPLATE_ID, quote_from: '',
    };
  }
  function firstRate() {
    var rs = TAX.rates() || [];
    return rs.length ? String(rs[0]) : '';
  }

  function newInvoice() {
    S.cur = blankInvoice();
    // 取引先が1社だけなら選んでおく（白紙を埋めさせない）
    if (S.partners.length === 1) S.cur.partner_id = S.partners[0].id;
    applyPartnerDefaults();
    fillEdit();
    autoNumber();
    goScreen('scr-edit');
  }

  function openInvoice(id) {
    var v = null;
    for (var i = 0; i < S.invoices.length; i++) if (S.invoices[i].id === id) v = S.invoices[i];
    if (!v) { box('list-err', 'この請求書が見つかりませんでした。「読み直す」を押してください。'); return; }
    S.cur = JSON.parse(JSON.stringify(v));
    if (!S.cur.data) S.cur.data = {};
    if (!Array.isArray(S.cur.lines) || !S.cur.lines.length) S.cur.lines = [blankLine()];
    fillEdit();
    goScreen('scr-edit');
  }

  function locked() { return S.cur && !DOC.canEdit(S.cur); }

  function fillEdit() {
    var v = S.cur; if (!v) return;
    setText('edit-h', v.id ? ((v.no || '（未採番）') + '　' + (v.status === 'issued' ? '発行済' : v.status === 'void' ? '取り消し済' : '下書き')) : '新しい請求書');
    show($('edit-locked'), locked());
    // ★別の1通に切り替えたら、前の紙の下見は消す（違う請求書の紙を出したままにしない）
    show($('pv-wrap'), false);

    fillSelect($('e-partner'), [{ v: '', t: '（選んでください）' }].concat(S.partners.map(function (p) {
      return { v: p.id, t: (p.data && p.data.name) || '(名称未設定)' };
    })), v.partner_id || '');
    /* ★注意書きは「今 困っている時」だけ出す（いつも出ていると読まれない）
       ★外のアプリへ行かせない★（司さん 2026-08-17）
         前は「Exally のハブで追加してください」＝★1通も出さないうちに 外へ出していた★。
         ＝★その場で作れる口を出す★（会社名だけ答えたら 相手が出来て そのまま選ばれる）。 */
    var noPartner = !S.partners.length;
    show($('e-partner-hint'), noPartner);
    if (noPartner) setText('e-partner-hint', '取引先がまだ1社もありません。下に会社名を入れると、その相手を作ってそのまま使えます。');
    show($('pt-new'), noPartner && !locked());

    $('e-issue').value = v.issue_ymd || '';
    var term = (v.data && v.data.term) || { kind: 'none', n: 0 };
    fillSelect($('e-term'), DOC.PAY_TERMS.map(function (t) { return { v: t.key, t: t.label }; }), term.kind);
    $('e-termn').value = term.n || '';
    show($('e-termn'), term.kind === 'days' || term.kind === 'nextDay');
    $('e-due').value = v.due_ymd || '';

    // ★番号はふだん読むだけ（「変える」を押した時だけ直せる）
    setText('e-no-view', v.no || '（自動）');
    $('e-no').value = v.no || '';
    show($('e-no'), ((v.data && v.data.noMode) || 'auto') === 'manual');

    $('e-subject').value = (v.data && v.data.subject) || '';
    $('e-memo').value = (v.data && v.data.memo) || '';
    $('e-gensen').checked = !!(v.data && v.data.gensen);
    drawGensenHint();

    // ★この1通の金額の入れ方（設定の既定を引き継ぐ／取引先ごとに違うので1通だけ変えられる）
    if ($('e-taxmode')) $('e-taxmode').value = (v.tax_mode === 'inclusive') ? 'inclusive' : 'exclusive';
    // ★「◯年◯月分」＝請求日の前月（実物32枚と同じ）。空なら自動で入る
    if ($('e-lead')) $('e-lead').value = (v.data && v.data.lead) || '';
    drawLeadHint();
    renderGuess();
    renderLines();
    renderDeductions();
    recalc();
    lockInputs();
    // ★入金は「発行した1通」にだけ出す（下書きには請求そのものが無い）
    resetPayForm();
    renderPay();
  }

  /* ═══ ★前回から当てて確かめる★ ═══
     空欄を並べて埋めさせない。取引先を選んだら前回の請求から当てて、
     ★「✓ はい、これで」を押すだけ★にする。当てた値には印を出し、押せば直せる。 */
  function prevOf(partnerId) {
    var best = null;
    for (var i = 0; i < S.invoices.length; i++) {
      var v = S.invoices[i];
      if (!v || v.status !== 'issued') continue;
      if ((v.partner_id || '') !== (partnerId || '')) continue;
      if (S.cur && v.id === S.cur.id) continue;
      if (!best) { best = v; continue; }
      var newer = (v.issue_ymd || '') > (best.issue_ymd || '')
        || ((v.issue_ymd || '') === (best.issue_ymd || '') && String(v.no || '') > String(best.no || ''));
      if (newer) best = v;
    }
    return best;
  }

  /** 前回の1通から、この1通に当てる物を作る（★入れるのは押された時だけ★） */
  function guessFrom(prev) {
    if (!prev) return null;
    var d = prev.data || {};
    var snapCols = (prev.snapshot && prev.snapshot.cols) || null;
    return {
      no: prev.no || '',
      term: d.term || { kind: 'none', n: 0 },
      subject: d.subject || '',
      memo: d.memo || '',
      taxMode: prev.tax_mode,
      rounding: prev.rounding,
      gensen: !!(d.gensen),                       // ★源泉あり／なしも前回のまま
      carryOn: !!(prev.snapshot && prev.snapshot.carry),
      templateId: prev.template_id || '',
      cols: (snapCols && snapCols.items && snapCols.items.length) ? snapCols : (d.cols || null),
      lineCount: Array.isArray(prev.lines) ? prev.lines.length : 0,
      total: (prev.totals && prev.totals.grandTotal),
    };
  }

  function termLabel(t) {
    for (var i = 0; i < DOC.PAY_TERMS.length; i++) {
      if (DOC.PAY_TERMS[i].key === (t && t.kind)) {
        return DOC.PAY_TERMS[i].label + ((t.kind === 'days' || t.kind === 'nextDay') && t.n ? '（' + t.n + '）' : '');
      }
    }
    return '決めていない';
  }

  function renderGuess() {
    var card = $('guess-card'); if (!card) return;
    var v = S.cur;
    // 発行済み・すでに決めた1通では出さない（聞くのは新しく作る時だけ）
    if (!v || locked() || v.id || S.guessDone) { show(card, false); return; }
    if (!v.partner_id) { show(card, false); return; }

    var prev = prevOf(v.partner_id);
    var g = guessFrom(prev);
    S.guess = g;

    if (!g) {
      // ★初回は「前回の請求はありません」＝空欄を並べない・0と書かない
      setText('guess-h', '前回の請求はありません');
      $('guess-list').innerHTML = '<p class="hint">この取引先へは初めての請求です。'
        + 'このまま明細を打てば出せます（支払期限や件名は「細かく決める」で足せます）。</p>';
      show($('b-guess-ok'), false);
      show($('b-guess-edit'), false);
      show(card, true);
      return;
    }
    setText('guess-h', '前回と同じで作りますか？');
    var rows = [
      ['前回の請求', 'No.　' + esc(g.no) + (g.total === undefined || g.total === null ? '' : '（' + yen(g.total) + ' 円）')],
      ['支払期限', esc(termLabel(g.term))],
      ['件名', esc(g.subject || '（なし）')],
      ['明細の列', esc((g.cols && g.cols.items ? g.cols.items : colsOf(v).items).join('・'))],
      ['税の入れ方', g.taxMode === 'inclusive' ? '内税' : '外税'],
    ];
    // ★源泉・繰越は「有る時だけ」出す（無い人の画面に増やさない）
    if (g.gensen) rows.push(['源泉徴収', 'する（前回と同じ）']);
    else if (partnerGensen(v.partner_id)) rows.push(['源泉徴収', 'する（この取引先の設定）']);
    if (g.carryOn) rows.push(['繰越', '前回の残りを紙に出す']);
    $('guess-list').innerHTML = '<table class="guess-t"><tbody>'
      + rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('')
      + '</tbody></table>';
    show($('b-guess-ok'), true);
    show($('b-guess-edit'), true);
    show(card, true);
  }

  /** ✓ を押した＝前回の中身をこの1通に入れる（明細の中身は入れない＝毎月 違うので） */
  function applyGuess() {
    var g = S.guess, v = S.cur;
    if (!g || !v) return;
    v.data.term = { kind: (g.term && g.term.kind) || 'none', n: (g.term && g.term.n) || 0 };
    v.data.subject = g.subject;
    v.data.memo = g.memo;
    if (g.taxMode) v.tax_mode = g.taxMode;
    if (g.rounding) v.rounding = g.rounding;
    if (g.templateId) v.template_id = g.templateId;
    if (g.cols) v.data.cols = COLS.normalizeSpec(g.cols);
    /* ★「前回と同じ」で源泉を消さない★
       取引先の設定で「源泉徴収の対象」にしてあるのに、前回（設定より古い1通）が
       源泉なしだと、✓ を押した瞬間に源泉が外れる＝★振り込まれる額が黙って変わる★。
       前回で足す事はあっても、★引く事はしない★（消したい時は畳みの中で自分で外す）。 */
    var wantGensen = !!g.gensen || !!(v.data && v.data.gensen) || partnerGensen(v.partner_id);
    v.data.gensen = wantGensen;
    S.guessApplied = { subject: !!g.subject, term: !!(g.term && g.term.kind !== 'none'), gensen: !!g.gensen };
    S.guessDone = true;
    recalcDue();
    fillEdit();
    show($('tag-subject'), !!S.guessApplied.subject);
    show($('tag-term'), !!S.guessApplied.term);
    show($('tag-gensen'), !!S.guessApplied.gensen);
    box('edit-ok', '前回と同じ内容を入れました。明細を打てば発行できます（直したい所は「細かく決める」から）。');
  }

  /* 発行済み・取り消し済みは触らせない（★押せない理由も出す★） */
  function lockInputs() {
    var ro = locked();
    ['e-partner', 'e-issue', 'e-term', 'e-termn', 'e-due', 'e-no', 'e-subject', 'e-memo'].forEach(function (id) {
      var el = $(id); if (el) el.disabled = ro;
    });
    var noEdit = $('b-no-edit'); if (noEdit) noEdit.disabled = ro;
    Array.prototype.forEach.call(document.querySelectorAll('#lines-body input, #lines-body select, #lines-body button'), function (b) { b.disabled = ro; });
    var add = $('b-addline'); if (add) add.disabled = ro;
    ['e-taxmode', 'e-lead'].forEach(function (id) { var el = $(id); if (el) el.disabled = ro; });
    renderDeductions();

    var v = S.cur || {};
    // ★押せない物は出さない（説明で補わない）★
    show($('b-issue'), !ro);
    show($('b-save'), !ro);
    show($('more-box'), !ro);
    if (!ro) drawIssueButton();

    /* ★出した見積の主役の操作＝「請求書を作る」★（発行するが消えた後のここが次の一手）
       ★存在しない時は出さない／在るのに塞がっている時は灰色＋理由をボタンの中★ */
    var toinv = $('b-toinv');
    if (toinv) {
      var isIssuedQuote = (v.doc_type === 'quote' && v.status === 'issued');
      show(toinv, isIssuedQuote);
      if (isIssuedQuote) drawToInvButton();
    }
    // ★どこから来た紙か（見積 → 請求 のつながり）を出す
    drawFromQuote();

    /* 取り消す／削除は「押せる時だけ」その場に出す */
    var host = $('danger-row');
    if (host) {
      var html = '';
      if (DOC.canVoid(v)) html += '<button class="btn-ghost" type="button" id="b-void">この請求書を取り消す</button>';
      if (DOC.canDelete(v) && v.id) html += '<button class="bdel" type="button" id="b-delete">下書きを削除</button>';
      host.innerHTML = html;
      var bv = $('b-void'); if (bv) bv.onclick = function () { return voidIt(); };
      var bd = $('b-delete'); if (bd) bd.onclick = function () { return removeDraft(); };
      show($('out-box'), ro ? !!html : true);

      /* ★畳みの見出しは「中に本当に在る物」で書く★
         発行済みでは下書き保存が出ていないのに「下書き…」と書いてあると、
         開くまで何が出来るのか分からない（2026-08-11 実機で発生）。
         発行済み・取り消し済みは、ここが唯一の出来る事なので ★開いた状態で出す★。 */
      var can = [];
      if (!ro) can.push('下書き');
      can.push('下見', '印刷', 'Excel');
      if (DOC.canVoid(v)) can.push('取り消し');
      if (DOC.canDelete(v) && v.id) can.push('削除');
      setText('out-sum', (ro ? 'この請求書に出来る事' : 'ほかの出し方') + '（' + can.join('・') + '）');
      $('out-box').open = ro;
    }

    var why = '';
    if (ro && v.status === 'issued') why = 'この請求書は発行済みです。直すには取り消してから作り直します。';
    else if (ro && v.status === 'void') why = 'この請求書は取り消し済みです。新しく作り直してください。';
    setText('act-why', why);
  }

  /* ═══ ★差し引く（控除）★ ═══
     ★引き算は2種類。混ぜると消費税がズレる★（実物の式で確かめた）
       値引き行（明細の中）… 課税の対象が減る＝税額も減る（seikyu-tax.js が数える）
       控除（ここ）        … ★税込の合計から引く＝税額は動かない★
     決まりは seikyu-doc.js が唯一の正。ここは画面の配線だけ。
     置き場所は data の自由枠＝★棚は増やさない★ */
  function deductions() {
    var v = S.cur; if (!v) return [];
    if (!v.data) v.data = {};
    if (!Array.isArray(v.data.deductions)) v.data.deductions = [];
    return v.data.deductions;
  }
  function renderDeductions() {
    var host = $('ded-list'); if (!host) return;
    var v = S.cur;
    var ro = locked();
    var list = deductions();
    show($('ded-card'), !!v && (list.length > 0 || !ro));
    show($('b-ded-add'), !ro);
    /* ★記入ガイドは薄く・先に読ませない★
       行が0本の時は1行だけ。詳しい話は ★足した後★（その時に要る言葉だけ出す）。 */
    setText('ded-why', dedWhyText());
    if (!list.length) {
      host.innerHTML = '<p class="hint">控除はありません。</p>';
    } else {
      host.innerHTML = list.map(function (d, i) {
        return '<div class="ded-row">'
          + '<input class="finput ded-n" data-dn="' + i + '" type="text" placeholder="例：弁当代" value="' + esc(d.name || '') + '"' + (ro ? ' disabled' : '') + '>'
          + '<input class="finput num ded-a" data-da="' + i + '" type="text" inputmode="numeric" placeholder="0" value="' + esc(d.amount === undefined || d.amount === null ? '' : d.amount) + '"' + (ro ? ' disabled' : '') + '>'
          + (ro ? '' : '<button class="l-del" type="button" data-dd="' + i + '" aria-label="この行を消す">×</button>')
          + '</div>';
      }).join('');
      Array.prototype.forEach.call(host.querySelectorAll('[data-dn]'), function (el) {
        el.oninput = function () { deductions()[+el.getAttribute('data-dn')].name = el.value; S.dirty = true; recalc(); };
      });
      Array.prototype.forEach.call(host.querySelectorAll('[data-da]'), function (el) {
        el.oninput = function () { deductions()[+el.getAttribute('data-da')].amount = el.value; S.dirty = true; recalc(); };
      });
      Array.prototype.forEach.call(host.querySelectorAll('[data-dd]'), function (b) {
        b.onclick = function () { deductions().splice(+b.getAttribute('data-dd'), 1); S.dirty = true; renderDeductions(); recalc(); };
      });
    }
    drawDedErr();
  }
  /* ★赤い印だけを塗り直す★（行を作り直さない＝打っている途中で欄が飛ばない）
     ★古い文を残さない★＝名前や金額を打った瞬間に赤が消える。
     （2026-08-15 実測：足した直後の「名前がありません」が、埋めても残ったままだった＝
       同じ状態を2か所で別々に出していた） */
  /* ふだんの説明（行が0本の時は出さない＝先に読ませない） */
  function dedWhyText() {
    return deductions().length
      ? '税込の合計から引きます（消費税は動きません）。値引き（税も一緒に減る物）は 明細にマイナスの行で。'
      : '';
  }
  function drawDedErr() {
    if (!$('ded-err')) return;
    var chk = DOC.validateDeductions(S.cur || {});
    box('ded-err', chk.ok ? '' : chk.errors.join('\n'));
    drawDedOver();
  }
  /* ★端（差し引く額が合計を超える）★
     ★止めない★＝前に多く貰っている分の返金など、本当にマイナスになる月がある。
     ただし ★黙って マイナスの請求書を出さない★＝画面で1回 言う。
     （2026-08-15 実測：控除 11,340 ／ 合計 10,450 で 紙に「¥-890」と刷れた） */
  function drawDedOver() {
    if (!$('ded-why')) return;
    var t = lastTax;
    var d = currentDeduct();
    var base = (t && t.ok) ? Number(t.grandTotal) : null;
    /* ★出しっぱなしにしない★＝金額を下げたら すぐ ふだんの説明に戻す
       （同じ状態を2か所で別々に出すと「直したのに赤が残る」になる） */
    /* ★ふだんの説明は薄く・注意は目に入る色★（皮の .warn を借りる＝色を新しく作らない） */
    var el = $('ded-why');
    if (base === null || d === null || d <= base) {
      el.className = 'hint';
      setText('ded-why', dedWhyText());
      return;
    }
    el.className = 'warn';
    setText('ded-why', '控除の額（' + yen(d) + ' 円）が 合計（' + yen(base)
      + ' 円）より大きいので、請求額は マイナス ' + yen(d - base)
      + ' 円になります。このまま出せますが、多く貰っている分の返金でなければ 金額を確かめてください。');
  }
  /** 控除の合計。★読めない行が1つでもあれば null（0にしない）★ */
  function currentDeduct() {
    var v = S.cur; if (!v) return null;
    var list = deductions();
    if (!list.length) return 0;
    var t = 0;
    for (var i = 0; i < list.length; i++) {
      var n = DOC.receiptAmountOf(list[i].amount);
      if (n === null) return null;      // ★読めない＝0にしない（引き忘れた紙を出さない）
      t += n;
    }
    return t;
  }

  /* ═══ ★見積 → 請求 のつながり★ ═══
     見積で決めた物を、請求で もう一度 打たせない（引き継ぎの中身は seikyu-doc.js が唯一の正）。
     ★どこから来た紙かを画面に出す★＝あとから見て辿れるようにする。 */
  function quoteById(id) {
    for (var i = 0; i < S.quotes.length; i++) if (S.quotes[i].id === id) return S.quotes[i];
    return null;
  }
  function drawFromQuote() {
    var v = S.cur, el = $('from-quote');
    if (!el) return;
    var qid = (v && v.quote_from) || '';
    if (!qid) { show(el, false); return; }
    var q = quoteById(qid);
    // ★見積が見つからなくても「無い」で済ませない（元が消えた事も言う）★
    setText('from-quote', 'この' + DOC.docLabel('invoice') + 'は '
      + DOC.docLabel('quote') + ' ' + (q ? ('No.　' + (q.no || '（未採番）')) : '（元の見積が見つかりません）')
      + ' から作りました。');
    show(el, true);
  }

  /** 「この見積から請求書を作る」が押せない理由（★理由はボタンの中★） */
  function toInvBlockReason() {
    var v = S.cur;
    if (!v || v.doc_type !== 'quote') return 'この紙は見積ではありません';
    if (v.status !== 'issued') return '見積を発行してから作れます';
    var made = null;
    for (var i = 0; i < S.invoices.length; i++) if (S.invoices[i].quote_from === v.id) made = S.invoices[i];
    // ★同じ見積から2通目を作るのは止めない（作り直しは在る）が、在る事は言う★
    if (made) return null;
    return null;
  }
  function drawToInvButton() {
    var b = $('b-toinv'); if (!b) return;
    var why = toInvBlockReason();
    b.disabled = !!why;
    b.textContent = why ? ('この見積から請求書を作る（' + why + '）') : 'この見積から請求書を作る';
    b.title = why || '';
  }

  /** 見積 → 請求（★品目・数量・単価・税区分・件名・備考・源泉・列をそのまま持っていく★） */
  function toInvoice() {
    var q = S.cur;
    var why = toInvBlockReason();
    if (why) { box('edit-err', why); return Promise.resolve(); }
    var draft = DOC.convertQuoteToInvoice(q);
    draft.issue_ymd = todayYmd();
    S.docType = 'invoice';
    drawKind();
    S.cur = Object.assign(blankInvoice({ docType: 'invoice' }), draft);
    S.cur.data = Object.assign({}, draft.data || {});
    if (!S.cur.data.cols) S.cur.data.cols = COLS.normalizeSpec(settings().cols || TPL.getOrDefault(settings().template).cols);
    S.guessDone = true;              // ★見積から当てたので「前回と同じで作りますか？」は出さない
    S.dirty = true;
    return loadList().then(function () {
      fillEdit();
      return autoNumber();
    }).then(function () {
      goScreen('scr-edit');
      box('edit-ok', DOC.docLabel('quote') + ' ' + (q.no || '') + ' の中身をそのまま写しました。'
        + '請求日と番号は新しく取り直しています。中身を確かめて「発行する」を押してください。');
    });
  }

  /* ═══ ★請求 → 領収（入金1行から出す紙）★ ═══
     ★棚を増やさない★＝①で作った pay_receipts の1行が、そのまま1枚の領収書になる。
     ★番号は請求番号＋枝番。消した入金も席を占める★（同じ番号の紙を2枚 外に出さない）。 */
  /** その請求に付いた入金の全部（★消した物も含む★＝枝番のため） */
  function receiptsAllOf(id) {
    if (S.receipts === null) return null;
    return S.receipts.filter(function (r) { return r.invoice_id === id; });
  }
  function receiptById(id) {
    if (S.receipts === null) return null;
    for (var i = 0; i < S.receipts.length; i++) if (S.receipts[i].id === id) return S.receipts[i];
    return null;
  }
  /** 領収書の紙の材料。作れない時は null（理由は box に出す） */
  function receiptPaperInput(rcId) {
    var v = S.cur, rc = receiptById(rcId);
    if (!rc) { box('pay-err', 'この入金が見つかりません。「読み直す」を押してください。'); return null; }
    var chk = DOC.canReceipt(rc, v);
    if (!chk.ok) { box('pay-err', chk.reason); return null; }
    var all = receiptsAllOf(v.id) || [];
    var no = DOC.receiptNoOf(v.no, DOC.receiptBranchOf(all, rc.id));
    var pi = paperInput();
    if (!pi) return null;
    /* ★消費税額を区分して書けるのは「請求の全額を受け取った時」だけ★
       一部だけの紙で按分すると、★紙に嘘の消費税額が載る★（国税庁 No.7124 は
       「区分して記載されている」時の扱いなので、書けない物を書かない）。 */
    var total = (v.totals && Number(v.totals.grandTotal)) || 0;
    var taxTotal = (v.totals && Number(v.totals.taxTotal)) || 0;
    var whole = (total > 0 && Number(rc.amount) === total && taxTotal > 0);
    return Object.assign({}, pi, {
      docKind: 'receipt',
      receipt: {
        no: no, ymd: rc.ymd, amount: Number(rc.amount), method: rc.method || '',
        note: (v.data && v.data.subject) || '',
        taxTotal: taxTotal, taxSeparate: whole,
      },
    });
  }
  function receiptFileName(rcId) {
    var v = S.cur, rc = receiptById(rcId);
    if (!rc) return null;
    var pi = paperInput();
    return NAME.suggest({
      docType: 'receipt', issueYmd: rc.ymd,
      partnerName: (pi && pi.partner && pi.partner.name) || '',
      grandTotal: Number(rc.amount), ext: 'pdf',
    });
  }
  function doReceipt(rcId, name) {
    var pi = receiptPaperInput(rcId);
    if (!pi) return;
    var built = PAPER.build(Object.assign({}, pi, { title: name }));
    var r = OUT.print(built.html, name);
    if (!r.ok) { box('pay-err', r.reason); return; }
    box('pay-ok', '領収書 ' + pi.receipt.no + ' を、紙だけの新しい窓で開きました。'
      + 'PDFにする時は、送信先を「PDFに保存」にしてください。');
  }

  /* ═══ ★入金（1回＝1行。上書きしない）★ ═══
     ・決まり（0円・日付・桁）は seikyu-doc.validateReceipt が唯一の正
     ・数え方（合計・残り・過入金）は seikyu-doc.paymentStateOf が唯一の正
       ＝ここでは1つも数え直さない（2か所で数えると必ずどこかで食い違う）
     ・★取れなかったを0にしない★ … S.receipts === null は「未確認」。0円と書き分ける
     ・★記録しても、すでに出した紙は変わらない★
       紙に出る繰越は発行時に写し（snapshot.carry）へ固まっている。ここは次に出す紙に効く。 */

  /** この1通に付いている入金（新しく足した順ではなく日付順）。★読めていない時は null★ */
  function receiptsOf(id) {
    if (S.receipts === null) return null;
    return S.receipts.filter(function (r) {
      return !r.deleted_at && r.invoice_id === id;
    }).sort(function (a, b) {
      if ((a.ymd || '') !== (b.ymd || '')) return (a.ymd || '') < (b.ymd || '') ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;      // 同じ日は id で並びを固定する
    });
  }

  /* ★「入金を記録」が押せない理由★
     入金カードの主役の操作なので ★隠さず、灰色にして理由をボタンの中★（発行するボタンと同じ流儀）。
     理由の言葉は DOC.validateReceipt が持つ物をそのまま使う＝押す前と押した後で別々に書かない。 */
  function payBlockReason() {
    var v = S.cur;
    if (!v || !v.id) return '先に発行してください';
    if (v.status === 'void') return '取り消した請求書には記録できません';
    if (v.status !== 'issued') return '発行してから記録できます';
    var chk = DOC.validateReceipt({
      ymd: $('pay-ymd').value, amount: $('pay-amt').value,
      method: $('pay-method').value, memo: $('pay-memo').value,
    });
    return chk.ok ? null : (chk.errors[0] || '記録できません');
  }
  function drawPayButton() {
    var b = $('b-pay-add'); if (!b) return;
    var why = payBlockReason();
    b.disabled = !!why;
    b.textContent = why ? ('入金を記録（' + why + '）') : '入金を記録';
    b.title = why || '';
  }

  /** 打ち込む欄を初期に戻す（日付は今日・方法は前回と同じ・金額と備考は空） */
  function resetPayForm(keepMethod) {
    var m = $('pay-method');
    if (m && (!m.options.length || !keepMethod)) {
      fillSelect(m, DOC.PAY_METHODS.map(function (k) { return { v: k, t: k }; }), keepMethod || DOC.PAY_METHODS[0]);
    }
    if ($('pay-ymd')) $('pay-ymd').value = todayYmd();
    if ($('pay-amt')) $('pay-amt').value = '';
    if ($('pay-memo')) $('pay-memo').value = '';
    box('pay-err', ''); box('pay-ok', '');
  }

  function renderPay() {
    var card = $('pay-card'); if (!card) return;
    var v = S.cur;
    /* 下書きには「請求」がまだ無いので、この箱ごと出さない
       （押せない操作を灰色で並べるより、その状態に存在しない物は出さない） */
    var on = !!(v && v.id && v.status !== 'draft');
    show(card, on);
    if (!on) return;

    var st = payStateOf(v);
    var rows = '<div class="tot-r"><span class="tot-l">請求額</span><span class="tot-v">' + yen(st.total) + ' 円</span></div>';
    if (st.paid === null) {
      // ★読めなかった＝0円と書かない★
      rows += '<div class="tot-r"><span class="tot-l">入っている合計</span><span class="tot-v">（未確認）</span></div>'
        + '<div class="tot-r tot-g"><span class="tot-l">残り</span><span class="tot-v">（未確認）</span></div>';
    } else {
      rows += '<div class="tot-r"><span class="tot-l">入っている合計</span><span class="tot-v">'
        + yen(st.paid) + ' 円' + (st.count ? '（' + st.count + '回）' : '') + '</span></div>';
      rows += st.remain < 0
        ? '<div class="tot-r tot-g"><span class="tot-l">過入金</span><span class="tot-v">' + yen(-st.remain) + ' 円</span></div>'
        : '<div class="tot-r tot-g"><span class="tot-l">残り</span><span class="tot-v">' + yen(st.remain) + ' 円</span></div>';
    }
    $('pay-sum').innerHTML = rows;

    var list = receiptsOf(v.id);
    var host = $('pay-list');
    if (list === null) {
      host.innerHTML = '<p class="hint">入金の記録が読めませんでした（＝0件ではありません）。'
        + '一覧の「読み直す」を押すと、もう一度 取りにいきます。</p>';
    } else if (!list.length) {
      host.innerHTML = '<p class="hint">まだ入金の記録がありません。下の欄から1回ぶんずつ足します（'
        + '分けて払われた時は、そのぶん行が増えます）。</p>';
    } else {
      host.innerHTML = list.map(function (r) {
        var neg = Number(r.amount) < 0;
        return '<div class="pay-row"><span class="pay-main">'
          + '<span class="pay-l1">'
          + '<span class="pay-d">' + esc(r.ymd || '日付なし') + '</span>'
          + '<span class="pay-v">' + (neg ? '− ' : '') + yen(Math.abs(Number(r.amount) || 0)) + ' 円</span>'
          + (r.method ? '<span class="pay-w">' + esc(r.method) + '</span>' : '')
          + (neg ? '<span class="pay-w">返金</span>' : '')
          + '</span>'
          + (r.memo ? '<span class="pay-memo">' + esc(r.memo) + '</span>' : '')
          + '</span>'
          /* ★この1回ぶんの領収書★（棚は増やさない＝この行がそのまま1枚になる）
             返金の行には出さない（受け取っていない物の領収書を作らせない）。 */
          + (neg ? '' : '<button class="mini" type="button" data-rcp="' + esc(r.id) + '">領収書</button>')
          + '<button class="l-del" type="button" data-rc="' + esc(r.id) + '" aria-label="この入金の記録を消す">×</button>'
          + '</div>';
      }).join('');
      Array.prototype.forEach.call(host.querySelectorAll('[data-rc]'), function (b) {
        b.onclick = function () { return removeReceipt(b.getAttribute('data-rc')); };
      });
      /* ★落とす前に「中身から作った名前」を出して直させる★（うちの決まり・全アプリ共通） */
      Array.prototype.forEach.call(host.querySelectorAll('[data-rcp]'), function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-rcp');
          var chk = DOC.canReceipt(receiptById(id), S.cur);
          if (!chk.ok) { box('pay-err', chk.reason); return; }
          var n = receiptFileName(id);
          if (!n) { box('pay-err', '中身がまだ整っていないので、領収書が出せません。'); return; }
          askNameWith(n, 'pdf', function (name) { doReceipt(id, name); });
        };
      });
    }

    /* ★金額を打たずに入れる近道★（代行請求の「全額／残額／半額」から採った）。
       ただし ★残りが読めていない時は出さない★＝当てずっぽうの金額を入れさせない。 */
    var q = $('pay-quick');
    var qh = '';
    if (st.paid !== null && st.remain > 0) {
      qh += '<button class="mini" type="button" data-fill="' + st.remain + '">残り全部（' + yen(st.remain) + '）</button>';
      var half = Math.floor(st.remain / 2);
      if (half > 0 && half !== st.remain) qh += '<button class="mini" type="button" data-fill="' + half + '">半分（' + yen(half) + '）</button>';
    }
    q.innerHTML = qh;
    Array.prototype.forEach.call(q.querySelectorAll('[data-fill]'), function (b) {
      b.onclick = function () { $('pay-amt').value = b.getAttribute('data-fill'); drawPayButton(); };
    });

    setText('pay-why', v.status === 'void'
      ? 'この請求書は取り消し済みです。入金は記録できません（すでに記録した分はそのまま残ります）。'
      : '記録しても、すでに出した紙は変わりません（紙の繰越は発行した時の入金で固まっています）。'
        + 'ここに足した分は、次にこの取引先へ出す請求書の「前回の残り」に効きます。');
    drawPayButton();
  }

  /** 入金を1件 足す。★足すだけ＝前の記録を書き換えない★ */
  function addReceipt() {
    var v = S.cur;
    var why = payBlockReason();
    if (why) { box('pay-err', why); box('pay-ok', ''); return Promise.resolve(); }
    var rc = {
      invoice_id: v.id, invoice_no: v.no || '',
      ymd: $('pay-ymd').value, amount: $('pay-amt').value,
      method: $('pay-method').value, memo: $('pay-memo').value.trim(),
    };
    box('pay-err', '');
    return S.store.receipts.add(rc).then(function (r) {
      if (!r.ok) { box('pay-err', '記録できませんでした（' + r.reason + '）'); return; }
      var keep = rc.method;
      return reloadReceipts().then(function () {
        resetPayForm(keep);
        renderPay();
        // ★行の書き方とそろえる（行は「− 2,000 円 返金」なので、ここも「返金」と言う）
        box('pay-ok', r.amount < 0
          ? (rc.ymd + ' に ' + yen(-r.amount) + ' 円 の返金を記録しました。')
          : (rc.ymd + ' に ' + yen(r.amount) + ' 円 の入金を記録しました。'));
      });
    });
  }

  function removeReceipt(id) {
    if (!global.confirm('この入金の記録を消しますか？\n（合計と残りは その場で数え直します）')) return Promise.resolve();
    box('pay-err', ''); box('pay-ok', '');
    return S.store.receipts.remove(id, new Date().toISOString()).then(function (r) {
      if (!r.ok) { box('pay-err', '消せませんでした（' + r.reason + '）'); return; }
      return reloadReceipts().then(function () {
        renderPay();
        box('pay-ok', '入金の記録を1件 消しました。');
      });
    });
  }

  /** 入金を取り直して、入金に依るもの（一覧の状態・繰越）を塗り直す。
   *  ★S.receipts が唯一の正★（null＝読めていない／[]＝読めた上で0件） */
  function reloadReceipts() {
    return S.store.receipts.list().then(function (rs) {
      S.receipts = rs;
      renderList();
      return rs;
    });
  }

  /* ── 明細（★列は会社が決めた items のとおりに作る★） ── */
  function renderLines() {
    var v = S.cur, host = $('lines-body'), head = $('lines-head'); if (!host || !head) return;
    var spec = colsOf(v);
    var rates = rateOptions();
    var role = function (k) { return COLS.roleOfIn(spec, k); };
    /* ★税率は「紙に出す列」とは別に、入力では必ず選べる★
       うちの実物32枚は ★税率の列を持たず、消費税（税額）の列を持つ★。
       紙をそれに合わせた結果、★税率を選ぶ所が消えた★（＝軽減税率も非課税も入れられない）。
       税率は ★計算に要る入力★なので、紙に出さなくても ★入力の表には必ず出す★。
       （適用税率そのものは 紙の「（内訳）」に必ず出るので、適格請求書の要件は落ちない） */
    var hasRate = spec.items.some(function (k) { return role(k) === 'rate'; });
    var rateHead = hasRate ? '' : '<th class="l-md">税率<span class="l-only">入力だけ</span></th>';

    head.innerHTML = spec.items.map(function (k) {
      var r = role(k);
      var cls = (r === 'name') ? 'l-name' : (r === 'rate') ? 'l-md' : 'l-sm';
      return '<th class="' + cls + '">' + esc(k) + '</th>';
    }).join('') + rateHead + '<th class="l-x"></th><th class="l-x"></th>';

    var list = v.lines;
    host.innerHTML = list.map(function (ln, i) {
      var rateCell = function (cls) {
        return '<td class="' + cls + ' l-c-rate" data-label="税率"><select class="finput" data-f="rate">'
          + rates.map(function (x) { return '<option value="' + esc(x.v) + '"' + (rateValueOf(ln) === x.v ? ' selected' : '') + '>' + esc(x.t) + '</option>'; }).join('')
          + '</select></td>';
      };
      var tds = spec.items.map(function (k) {
        var r = role(k);
        var cls = (r === 'name') ? 'l-name' : (r === 'rate') ? 'l-md' : 'l-sm';
        if (r === 'index') return '<td class="l-x l-c-index" data-label="#">' + (i + 1) + '</td>';
        if (r === 'rate') return rateCell(cls);
        /* ★行ごとの税額は「打つ物」ではなく「出る物」★
           打てるようにすると ★行ごとに丸めた数を足す道★ ができる＝
           国税庁 Q&A 問57 で認められていない形になる。★読むだけで出す★。 */
        if (r === 'tax') {
          var tx = lineTaxOf(i);
          return '<td class="' + cls + ' l-ro l-c-tax" data-label="' + esc(k) + '">'
            + (tx === null ? '—' : yen(tx)) + '</td>';
        }
        var val, mode = '', extra = '';
        if (r === 'name') { val = ln.name; extra = ' placeholder="品名"'; }
        else if (r === 'unit') { val = ln.unit; extra = ' placeholder="式"'; }
        else if (r === 'qty') { val = ln.qty; mode = ' inputmode="decimal"'; }
        else if (r === 'price') { val = ln.price; mode = ' inputmode="decimal"'; }
        else if (r === 'amount') { val = ln.amount; mode = ' inputmode="numeric"'; }
        else if (r === 'memo') { val = ln.memo; }
        else { val = (ln.extra || {})[k]; }         // ★会社が足した列＝自由枠に入れる
        var num = (r === 'qty' || r === 'price' || r === 'amount') ? ' num' : '';
        var f = r ? ('data-f="' + r + '"') : ('data-x="' + esc(k) + '"');
        /* ★狭い幅では表の見出しが消える★ので、欄そのものに名前を持たせる
           （CSSが ::before で出す＝広い画面では出さない） */
        return '<td class="' + cls + ' l-c-' + (r || 'x') + '" data-label="' + esc(k) + '">'
          + '<input class="finput' + num + '" ' + f + mode + extra
          + ' value="' + esc(val === undefined || val === null ? '' : val) + '"></td>';
      }).join('');
      /* ★並べ替え★ 打ち直させないための物（消して打ち直すと必ず写し間違いが出る）。
         ★端の行では、その向きのボタンを出さない★（押しても何も起きない物を置かない）。 */
      var up = i > 0 ? '<button class="l-mv" type="button" data-up="' + i + '" aria-label="この行を上へ">▲</button>' : '';
      var dn = i < list.length - 1 ? '<button class="l-mv" type="button" data-down="' + i + '" aria-label="この行を下へ">▼</button>' : '';
      return '<tr data-i="' + i + '">' + tds
        + (hasRate ? '' : rateCell('l-md'))
        + '<td class="l-x l-ord">' + up + dn + '</td>'
        + '<td class="l-x"><button class="l-del" type="button" data-del="' + i + '" aria-label="この行を消す">×</button></td></tr>';
    }).join('');

    Array.prototype.forEach.call(host.querySelectorAll('input,select'), function (el) {
      el.oninput = el.onchange = function () {
        var tr = el.closest('tr'), i = +tr.getAttribute('data-i');
        var f = el.getAttribute('data-f');
        if (f === 'rate') {
          // ★非課税は「税率0＋非課税の印」の2つで表す（0だけでは対象外と見分けが付かない）
          var non = el.value === NONTAX_V;
          S.cur.lines[i].rate = non ? '0' : el.value;
          S.cur.lines[i].nontax = non;
        } else if (f) S.cur.lines[i][f] = el.value;
        else {
          if (!S.cur.lines[i].extra) S.cur.lines[i].extra = {};
          S.cur.lines[i].extra[el.getAttribute('data-x')] = el.value;
        }
        S.dirty = true;
        recalc();
      };
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-del]'), function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-del');
        S.cur.lines.splice(i, 1);
        if (!S.cur.lines.length) S.cur.lines.push(blankLine());
        S.dirty = true;
        renderLines(); recalc(); lockInputs();
      };
    });
    /* ★並べ替え★（消して打ち直させない）。★金額は1円も動かない★＝順番を入れ替えるだけ。 */
    function move(from, to) {
      var L = S.cur.lines;
      if (to < 0 || to >= L.length) return;
      var x = L[from]; L[from] = L[to]; L[to] = x;
      S.dirty = true;
      renderLines(); recalc(); lockInputs();
    }
    Array.prototype.forEach.call(host.querySelectorAll('[data-up]'), function (b) {
      b.onclick = function () { var i = +b.getAttribute('data-up'); move(i, i - 1); };
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-down]'), function (b) {
      b.onclick = function () { var i = +b.getAttribute('data-down'); move(i, i + 1); };
    });
  }
  function blankLine() {
    return { name: '', qty: '', unit: '', price: '', amount: '', rate: firstRate(), nontax: false, memo: '', extra: {} };
  }



  /* 画面の文字を、計算に渡せる形に直す（★空は空のまま＝0にしない★） */
  function cleanLines(lines) {
    return (lines || []).map(function (ln) {
      var o = { name: ln.name || '', unit: ln.unit || '', rate: ln.rate, memo: ln.memo || '' };
      // ★非課税の印は必ず持って回る（落とすと非課税が対象外に化けて、紙の区分が変わる）
      if (ln.nontax) o.nontax = true;
      // ★源泉の対象か（1通の入/切から、報酬の行にだけ立てる。立替＝対象外の行には立てない）
      if (gensenOn() && !(Number(ln.rate) === 0 && !ln.nontax)) o.gensen = true;
      if (ln.qty !== '' && ln.qty !== undefined && ln.qty !== null) o.qty = Number(ln.qty);
      if (ln.price !== '' && ln.price !== undefined && ln.price !== null) o.price = Number(ln.price);
      if (ln.amount !== '' && ln.amount !== undefined && ln.amount !== null) o.amount = Number(ln.amount);
      // ★会社が足した列の中身も落とさずに持つ（空文字だけの物は捨てる＝空欄を保存しない）
      var ex = {};
      var src = ln.extra || {};
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k) && String(src[k] == null ? '' : src[k]).trim() !== '') ex[k] = src[k];
      }
      o.extra = ex;
      return o;
    }).filter(function (o) {
      // ★何も入っていない行は数えない（空行で「明細0行」の赤を出さない）
      return (o.name || o.qty !== undefined || o.price !== undefined || o.amount !== undefined
        || Object.keys(o.extra).length > 0);
    });
  }

  /* ★この1通は源泉徴収するか★
     決まり方は3段： ① この1通の入/切（畳みの中）
                     ② 無ければ 取引先の既定（設定 ▸ 取引先ごと）
                     ③ 発行済みは写しに固まっている
     ★入力の画面に新しい設問は出さない★（既定で入るので、ふつうは触らない）。 */
  function gensenOn() {
    var v = S.cur; if (!v) return false;
    return !!(v.data && v.data.gensen);
  }
  function partnerGensen(partnerId) {
    var p = partnerById(partnerId);
    return !!(p && p.data && p.data.gensen);
  }
  /* ★源泉の説明は1か所で作る★（画面の数字と説明が食い違わないように、
     数え直した結果 g をそのまま渡す。ここで数え直さない＝二度数えて違う答えを出さない） */
  function gensenHintText(g, c) {
    if (!$('e-gensen-hint')) return;
    if (!gensenOn()) { setText('e-gensen-hint', '相手（払う側）が源泉徴収する時に入れます。取引先ごとの既定は「設定」で決められます。'); return; }
    if (!g || !g.on) { setText('e-gensen-hint', '源泉の対象になる行がまだありません（立替など対象外だけの時は掛かりません）。'); return; }
    var t = null;
    try { t = currentTax(); } catch (e) { t = null; }
    var pay = (t && t.ok) ? DOC.payableOf(t, c || null, g) : null;
    setText('e-gensen-hint', '対象額 ' + yen(g.base) + ' 円 → ' + g.label + ' ' + yen(g.amount) + ' 円 → '
      + g.netLabel + ' ' + (pay === null ? '（未確認）' : yen(pay) + ' 円'));
  }
  function drawGensenHint() { gensenHintText(currentGensen(), currentCarry()); }
  function currentGensen() {
    var v = S.cur; if (!v) return null;
    if (v.snapshot && v.snapshot.gensen) return GENSEN.fromSnapshot(v.snapshot.gensen, v.totals && v.totals.grandTotal);
    if (!gensenOn()) return null;
    var t;
    try { t = currentTax(); } catch (e) { return null; }
    if (!t || !t.ok) return null;
    return GENSEN.compute({ lines: cleanLines(v.lines), tax: t, taxMode: v.tax_mode, rounding: v.rounding });
  }

  /* ★繰越★ 会社ごとの入/切。入力の画面では聞かない（前回と入金から機械が出す）。 */
  function carryOn() { return !!settings().carry; }
  function currentCarry() {
    var v = S.cur; if (!v) return null;
    if (v.snapshot && v.snapshot.carry) return CARRY.fromSnapshot(v.snapshot.carry);
    if (!carryOn()) return null;
    var t;
    try { t = currentTax(); } catch (e) { return null; }
    if (!t || !t.ok) return null;
    var prev = CARRY.prevOf(S.invoices, v);
    /* ★入金が読めていない時は null のまま渡す（0にしない＝紙に「未確認」と出る）★
       S.receipts が唯一の正：null＝読めていない／[]＝読めた上で0件。作り分けを2か所に持たない。 */
    return CARRY.compute({ thisTotal: t.grandTotal, prev: prev, receipts: S.receipts });
  }

  /** 「◯年◯月分」の説明。★空なら 請求日の前月から自動で入る事を言う★ */
  function drawLeadHint() {
    var v = S.cur; if (!v || !$('e-lead-hint')) return;
    var auto = DOC.periodLabelOf(v.issue_ymd);
    setText('e-lead-hint', ($('e-lead') && $('e-lead').value)
      ? '打った言葉をそのまま紙に出します。'
      : (auto ? '空のままなら「' + auto + '」と出ます（請求日の前月）。' : '請求日が読めないので、この行は出ません。'));
  }
  /** 金額の入れ方を、打つ人の言葉で言う（★数字の意味を取り違えさせない★） */
  function drawTaxModeNote() {
    var v = S.cur; if (!v || !$('taxmode-note')) return;
    var inc = v.tax_mode === 'inclusive';
    setText('taxmode-note', inc
      ? '金額は税込で入れています（中から消費税を出します）。変えるときは「細かく決める」から。'
      : '金額は税抜で入れています（消費税を足します）。変えるときは「細かく決める」から。');
    if ($('e-taxmode-hint')) {
      setText('e-taxmode-hint', inc
        ? '税込でいくら、が先に決まっている相手はこちら。入れた税込と合計は1円もずれません。'
        : '単価や金額を税抜で持っている相手はこちら。');
    }
  }

  /** 倉庫に残す合計。★grandTotal は「請求額」＝控除を引いた後★
   *  理由＝入金の残り(paymentStateOf)も繰越(CARRY)も この数を見る。
   *        ここが控除前だと ★全額 払っても「残り」が残る★。
   *  紙に出る「合計＝小計＋消費税」は gross（控除前）。恒等式は両方 残す。 */
  function totalsOf(t) {
    var ded = currentDeduct();
    var gross = t.grandTotal;
    var billed = (ded === null) ? gross : (gross - ded);
    return {
      subtotal: t.subtotal, taxTotal: t.taxTotal,
      gross: gross,                    // 小計＋消費税（控除前）
      deduct: (ded === null) ? 0 : ded,
      deductLines: DOC.deductionsOf(S.cur).map(function (d) {
        return { name: String(d.name || ''), amount: DOC.receiptAmountOf(d.amount) };
      }),
      grandTotal: billed,              // ★請求額（控除を引いた後）★
      byRate: t.byRate, exempt: t.exempt, nontaxable: t.nontaxable, hasReduced: t.hasReduced,
    };
  }

  /** その行の税額（★seikyu-tax.js が出した物をそのまま読む★・数え直さない）
   *  数え直すと ★端数の寄せ★ が効かず、足しても消費税の合計に一致しなくなる。 */
  var lastTax = null;
  function lineTaxOf(i) {
    if (!lastTax || !lastTax.ok) return null;
    for (var k = 0; k < lastTax.lines.length; k++) if (lastTax.lines[k].index === i) return lastTax.lines[k].tax;
    return null;   // 計算に入らなかった行（空行）＝0にしない
  }
  /** その行の金額（数量×単価から出た物も含む）。読めない時は null */
  function lineAmountOf(i) {
    if (!lastTax || !lastTax.ok) return null;
    for (var k = 0; k < lastTax.lines.length; k++) if (lastTax.lines[k].index === i) return lastTax.lines[k].amount;
    return null;
  }

  function currentTax() {
    var v = S.cur;
    return TAX.compute({ lines: cleanLines(v.lines), taxMode: v.tax_mode, rounding: v.rounding });
  }

  /** 明細の表の「消費税」の欄を塗り直す（★行を作り直さない＝打っている途中で欄が飛ばない★） */
  function paintLineTax() {
    var host = $('lines-body'); if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('tr'), function (tr) {
      var i = +tr.getAttribute('data-i');
      var cell = tr.querySelector('.l-ro');
      if (cell) {
        var tx = lineTaxOf(i);
        cell.textContent = (tx === null) ? '—' : yen(tx);
      }
      /* ★数量×単価の行でも、その行の金額が読める★
         打っていない時は ★出た金額を薄く出す★（打てば その字が勝つ）。
         ＝空欄を並べて人に埋めさせない／★一番 見たい金額が空のまま★にしない。
         （2026-08-15 実測：狭い幅の札にしたら、数量×単価の行の金額が空で見えなかった） */
      var amt = tr.querySelector('[data-f="amount"]');
      if (amt) {
        var v = lineAmountOf(i);
        var typed = String(amt.value || '').trim() !== '';
        amt.setAttribute('placeholder', (!typed && v !== null && v !== 0) ? yen(v) : '');
        amt.classList.toggle('l-calc', !typed && v !== null && v !== 0);
      }
    });
  }

  function recalc() {
    var v = S.cur; if (!v) return null;
    var t;
    try { t = currentTax(); }
    catch (e) { box('edit-err', (e && e.message) || '計算できませんでした'); return null; }
    var host = $('tot-box');
    if (!t.ok) {
      box('edit-err', t.errors.join('\n'));
      if (host) host.innerHTML = '<div class="hint">合計は、明細が直ったら出ます。</div>';
      return t;
    }
    box('edit-err', '');
    lastTax = t;                 // ★行ごとの税額はここから読む（数え直さない）
    drawDedErr();                // ★古い赤を残さない（同じ状態を2か所で別々に出さない）
    paintLineTax();
    drawTaxModeNote();
    /* ★同じ数字を2回 言わない★
       税率が1種類しか無い紙では「◯%対象 …（消費税 …）」の行が、
       すぐ下の「小計／消費税」と ★まったく同じ数字★になる。画面では出さない。
       ★税率が2種類 以上になった時だけ 内訳として出す★
       （税率ごとの区分は適格請求書の要件なので、混ざれば必ず出す）。
       ★紙は今までどおり（内訳）を必ず出す★＝変えたのは入力の画面だけ。
       ★率の数字はここに書かない★（唯一の正は kyuyo/lib/shouhizei-ritsu.js）。 */
    var rows = (t.byRate.length >= 2) ? t.byRate.map(function (b) {
      return '<div class="tot-r"><span class="tot-l">' + esc(b.pct) + '% 対象</span><span class="tot-v">'
        + yen(b.base) + ' 円（消費税 ' + yen(b.tax) + ' 円）</span></div>';
    }).join('') : '';
    /* ★非課税と対象外は別の行に出す（同じ0円でも意味が違う）★ */
    if (t.nontaxable && t.nontaxable.base) {
      rows += '<div class="tot-r"><span class="tot-l">非課税</span><span class="tot-v">' + yen(t.nontaxable.base) + ' 円</span></div>';
    }
    if (t.exempt && t.exempt.base) {
      rows += '<div class="tot-r"><span class="tot-l">消費税の対象外</span><span class="tot-v">' + yen(t.exempt.base) + ' 円</span></div>';
    }
    if (host) {
      var g = currentGensen();
      var c = currentCarry();
      var ded = currentDeduct();
      /* ★払う金額は1つだけ 一番 大きく★
         合計・控除・源泉は ★その上に小さく★ 並べ、★一番 下の1行だけ大きくする★。
         （大きい数字が2つ並ぶと、どれを振り込むのか一目で決まらない） */
      var lines = [
        /* ★画面と紙で同じ言葉★（紙は「明細の合計」）＝突き合わせる時に迷わない */
        ['明細の合計', yen(t.subtotal) + ' 円'],
        ['消費税', yen(t.taxTotal) + ' 円'],
        ['合計', yen(t.grandTotal) + ' 円'],
      ];
      /* ★控除（明細の外・税込から引く）★ 税額は動かさない。
         ★読めない控除は 0 にしない★＝「（未確認）」と出して、引き忘れた紙を出さない。 */
      if (ded === null || ded > 0) {
        lines.push(['控除', ded === null ? '（未確認）' : '− ' + yen(ded) + ' 円']);
        /* ★控除が読めない時は 請求額も数字にしない★
           0として計算した額を「請求額」と一番 大きく出すと、★引き忘れた紙★ になる
           （2026-08-15 スクショで実際に「控除（未確認）／請求額 292,600」と出ていた）。 */
        var billed = (ded === null) ? null : DOC.billedOf(t, null, ded);
        lines.push(['請求額', billed === null ? '（未確認）' : yen(billed) + ' 円']);
      }
      /* ★源泉があるなら、画面にも「引いたあと」まで出す★
         紙にだけ出して画面に出さないと、見ている数字と振り込まれる額が食い違う。 */
      if (g && g.on) {
        /* ★差引は「合計請求額（繰越こみ）− 源泉」★ 順番は seikyu-doc.js が唯一の正 */
        var pay = DOC.payableOf(t, c, g, ded);
        lines.push([g.label, '− ' + yen(g.amount) + ' 円']);
        lines.push([g.netLabel, pay === null ? '（未確認）' : yen(pay) + ' 円']);
      }
      var last = lines.length - 1;
      var html = rows + lines.map(function (x, i) {
        return '<div class="tot-r' + (i === last ? ' tot-g' : '') + '"><span class="tot-l">'
          + esc(x[0]) + '</span><span class="tot-v">' + esc(x[1]) + '</span></div>';
      }).join('');
      /* ★1円の端数を最後の行に寄せた時は 黙らない★
         （税率ごとに1回だけ端数処理する＝国税庁 Q&A 問57。行ごとに丸めて足す道は作らない） */
      if (t.spread && t.spread.length) {
        html += '<div class="hint">' + t.spread.map(function (x) {
          return esc(x.pct) + '% の消費税の端数 ' + yen(x.residual) + ' 円を、'
            + x.line + '行目' + (x.name ? '「' + esc(x.name) + '」' : '') + 'に寄せました'
            + '（税率ごとに1回だけ端数処理するため）。';
        }).join('<br>') + '</div>';
      }
      gensenHintText(g, c);   // ★明細を打つたびに説明も直す（古い文を残さない）
      /* ★繰越があるなら、前回の残りを足したあとまで出す★ */
      if (c && c.state === 'first') {
        // ★初回は1行だけ言う（「未確認」と書かない＝読めなかったのと作り分ける）
        html += '<div class="hint">' + esc(c.label) + '</div>';
      } else if (c) {
        CARRY.ROWS.forEach(function (r) {
          if (r.key === 'thisTotal') return;                       // 今回請求額＝上の「合計」と同じ
          var val = c[r.key];
          var txt = (val === null || val === undefined) ? '（未確認）' : yen(val) + ' 円';
          html += '<div class="tot-r' + (r.key === 'grandTotal' ? ' tot-g' : '') + '"><span class="tot-l">'
            + esc(r.label) + '</span><span class="tot-v">' + txt + '</span></div>';
        });
        if (c.label) html += '<div class="hint">' + esc(c.label) + (c.prevNo ? '（前回 No.　' + esc(c.prevNo) + '）' : '') + '</div>';
      }
      host.innerHTML = html;
    }
    drawPagesNote(t);      // ★2枚目に入る前に言う★
    drawIssueButton();     // ★打つたびに「発行する」の押せる/押せないを塗り直す★
    return t;
  }

  /* ★何枚になるかは 紙の lib に聞く（画面で数え直さない）★
     画面と紙で別々に数えると「画面は1枚・紙は2枚」が出る。
     ★『あと何行で2枚目』まで言う★＝出してから気づく物にしない。 */
  function drawPagesNote(t) {
    var v = S.cur;
    if (!v || !t || !t.ok) { setText('pages-note', ''); return; }
    /* ★区分（内訳）の数でも 載る行数は変わる★＝紙と同じ数を使う（画面で数え直さない） */
    var pi = { deduct: currentDeduct(), deductLines: DOC.deductionsOf(v), rateRows: PAPER.rateRowsOf(t) };
    var st = settings();
    var own = (v.data && v.data.paperRows);
    var rows = (own === undefined || own === null || own === '') ? st.paperRows : own;
    if (rows !== null && rows !== undefined && rows !== '') pi.paperRows = rows;
    var n = (t.lines || []).length;
    /* ★枚数は紙の lib が決めた物をそのまま使う★（画面で ceil し直さない）
       ＝締めがページ数で伸びる分まで数えているのは planOf だけ。 */
    pi.lineCount = n;
    var laid = PAPER.planOf(v, pi);
    var frame = laid.frameRows;
    var pages = laid.plan ? laid.plan.length : PAPER.pagesOf(n, frame);
    /* ★1枚に収まっている間は 何も言わない★（司さん 2026-08-16 ⑤）
       既定は ★A4 1枚に収まるように測って決めてある★ので、ふだんは案内が要らない。
       毎回 出すと「読まなくていい字」が増えて、本当に読ませたい時に効かなくなる。 */
    if (!laid.plan || pages <= 1) { setText('pages-note', ''); show($('pages-note'), false); return; }
    show($('pages-note'), true);
    /* ★枠が0＝最後の紙は締めだけ★（控除や区分が多くて A4 を使い切っている）
       この時に「1枚の枠は 0 行」と出すと意味が通らないので、起きている事をそのまま書く。 */
    setText('pages-note', frame
      ? ('明細 ' + n + ' 行 ＝ 紙は ' + pages + ' 枚になります（1枚の枠は ' + frame
        + ' 行）。1枚に収めたい時は 枠を増やしてください。')
      : ('明細 ' + n + ' 行 ＝ 紙は ' + pages + ' 枚になります。控除や区分が多いので '
        + '★最後の紙は 締めと振込先だけ★ になります。'));
    /* ★その場から飛べる★＝設定のどこを触ればよいか探させない */
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn-ghost'; b.id = 'b-goto-rows';
    b.textContent = '枠を増やす';
    b.onclick = function () { openRowsSetting(); };
    $('pages-note').appendChild(document.createElement('br'));
    $('pages-note').appendChild(b);
  }

  /* 「枠を増やす」→ 設定を開いて、畳んである所を開いて、その欄へ連れて行く */
  function openRowsSetting() {
    fillSettings();
    goScreen('scr-set');
    var box = $('set-more');
    if (box) box.open = true;
    var el = $('s-rows');
    if (el) { try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* 端末による */ } el.focus(); }
  }

  /* ── 番号 ── */
  function autoNumber() {
    var v = S.cur;
    if (!v || locked()) return Promise.resolve();
    if (((v.data && v.data.noMode) || 'auto') !== 'auto') { setText('e-no-hint', '自分で決めた番号も「使用済み」として数えます。同じ番号は倉庫が受け付けません。'); return Promise.resolve(); }
    var s = settings();
    var p = partnerById(v.partner_id);
    var code = (p && p.data && p.data.code) || '';
    var errs = DOC.validateNumbering({ format: s.format, resetYearly: s.resetYearly, partnerCode: code });
    if (errs.length) {
      $('e-no').value = '';
      v.no = '';
      setText('e-no-view', '（作れません）');
      setText('e-no-hint', errs.join(' '));
      return Promise.resolve();
    }
    return S.store.invoices.usedNos(v.doc_type || 'invoice').then(function (used) {
      var no = DOC.nextNo({ format: s.format, resetYearly: s.resetYearly, ymd: v.issue_ymd, partnerCode: code, existing: used });
      v.no = no;
      $('e-no').value = no;
      // ★ふだん読むだけの欄にも入れる（番号は非同期に決まるので、ここで入れないと「（自動）」のまま）
      setText('e-no-view', no || '（作れません）');
      setText('e-no-hint', no
        ? '「設定」で決めた形から作りました。同じ番号を二度使わないことは倉庫が守ります。'
        : '番号が作れませんでした（請求日か取引先コードを確かめてください）。');
      /* ★番号は後から（非同期で）決まる★
         ここで塗り直さないと「発行する」が ★『請求番号が空です』と言ったまま灰色★ で残る。
         番号は入っているのに押せない＝人には ★壊れているようにしか見えない★。
         （2026-08-15 実測：見積から請求書を作った直後に発生。取引先を選んだ直後も同じ形） */
      drawIssueButton();
    }).catch(function () {
      setText('e-no-hint', '使用済みの番号が読めませんでした。番号は手で入れてください。');
      drawIssueButton();
    });
  }

  /* ── 支払期限 ── */
  function recalcDue() {
    var v = S.cur; if (!v) return;
    var term = (v.data && v.data.term) || { kind: 'none', n: 0 };
    var d = DOC.dueDateFrom(v.issue_ymd, term);
    if (d) { v.due_ymd = d; $('e-due').value = d; }
  }

  /* 取引先を選んだ時、その相手の「いつまでにもらう約束」を既定にする */
  function applyPartnerDefaults() {
    var v = S.cur; if (!v) return;
    var p = partnerById(v.partner_id);
    var t = p && p.data && p.data.payTerm;
    if (t && t.kind) {
      v.data.term = { kind: t.kind, n: t.n || 0 };
      recalcDue();
    }
    // ★源泉の対象かは相手が決める＝取引先の既定を入れておく（打つ前に聞かない）
    if (!v.id) v.data.gensen = partnerGensen(v.partner_id);
  }

  /* ── 紙・Excel ── */
  function paperInput() {
    var v = S.cur;
    var t = recalc();
    if (!t || !t.ok) return null;
    var snap = v.snapshot && v.snapshot.partner ? v.snapshot : null;
    var p = partnerById(v.partner_id);
    var partner = snap ? snap.partner : ((p && p.data) || {});
    var org = snap ? snap.org : (S.org || {});
    // ★下書きの下見では、まだ保存していない角印も出す（押してから保存できる）
    if (!snap && S.org) org = Object.assign({}, S.org, { bank: settings().bank },
      sealPending ? { sealDataUrl: sealPending } : {});
    var inv = Object.assign({}, v, { lines: cleanLines(v.lines) });
    /* ★控除も紙へ渡す★
       渡し忘れると ★画面は 281,260 なのに 紙は 292,600★ と書く（実際に起きた）。
       発行済みは写しの数（あとで控除を直しても 出した紙は変わらない）。 */
    var ded = (v.status && v.status !== 'draft' && v.totals && v.totals.deduct !== undefined)
      ? Number(v.totals.deduct) : currentDeduct();
    var dedLines = (v.status && v.status !== 'draft' && v.totals && v.totals.deductLines)
      ? v.totals.deductLines
      : DOC.deductionsOf(v).map(function (d) { return { name: String(d.name || ''), amount: DOC.receiptAmountOf(d.amount) }; });
    /* ★枠の行数★ その1通が持っていればそれ、無ければ会社の設定、それも無ければ紙の既定。
       ★発行済みは写しの数★（あとで行数を変えても、出した紙は同じ顔のまま）。 */
    var st = settings();
    var own = (v.data && v.data.paperRows), ownD = (v.data && v.data.deductRows);
    var rows = (own === undefined || own === null || own === '') ? st.paperRows : own;
    var dRows = (ownD === undefined || ownD === null || ownD === '') ? st.deductRows : ownD;
    return {
      inv: inv, tax: t, partner: partner, org: org, cols: colsOf(v), theme: themeOf(v),
      gensen: currentGensen(), carry: currentCarry(),
      deduct: ded, deductLines: dedLines,
      paperRows: (rows === null ? undefined : rows),
      deductRows: (dRows === null ? undefined : dRows),
    };
  }

  function suggestName(ext) {
    var pi = paperInput();
    if (!pi) return null;
    return NAME.suggest({
      docType: pi.inv.doc_type, issueYmd: pi.inv.issue_ymd,
      partnerName: pi.partner.name, grandTotal: pi.tax.grandTotal, ext: ext,
    });
  }

  /* ★落とす前に名前を出して直させる★ */
  var fnPending = null;
  function askName(ext, run) {
    var n = suggestName(ext);
    if (!n) { box('edit-err', '中身がまだ整っていないので、この形では出せません。上の赤い印を直してください。'); return; }
    askNameWith(n, ext, run);
  }
  /** 名前を先に決めてある時（領収書など）。★小窓の出し方は1か所★ */
  function askNameWith(n, ext, run) {
    var base = n.replace(new RegExp('\\.' + ext + '$'), '');
    $('fn-input').value = base;
    setText('fn-ext', '拡張子は . ' + ext + ' が付きます');
    fnPending = { ext: ext, run: run };
    $('fn-ov').classList.add('open');
  }
  function fnClose() { $('fn-ov').classList.remove('open'); fnPending = null; }

  /* ★紙はA4の幅で組んである。スマホの幅にそのまま入れると右が切れて金額が見えない。
       だから紙は縮めず、まるごと縮小して全体を見せる（実物と同じ形のまま小さくする）。 */
  function fitPreview() {
    var f = $('pv'), wrap = $('pv-wrap');
    if (!f || !wrap || wrap.style.display === 'none') return;
    var d = f.contentDocument;
    if (!d || !d.documentElement) return;
    var pw = Math.max(320, d.documentElement.scrollWidth);
    var ph = Math.max(320, d.documentElement.scrollHeight);
    f.style.width = pw + 'px';
    f.style.height = ph + 'px';
    var avail = wrap.clientWidth || pw;
    var k = Math.min(1, avail / pw);
    f.style.transform = 'scale(' + k + ')';
    wrap.style.height = Math.ceil(ph * k) + 'px';
  }

  function doPreview() {
    var pi = paperInput();
    if (!pi) { box('edit-err', '中身がまだ整っていないので、下見が出せません。上の赤い印を直してください。'); return; }
    var built = PAPER.build(pi);
    var f = $('pv');
    f.onload = fitPreview;
    f.srcdoc = built.html;
    show($('pv-wrap'), true);
    // srcdoc は端末によって load が来ないことがあるので、時間でも1度合わせる
    global.setTimeout(fitPreview, 260);
    box('edit-ok', '下の枠が、そのまま刷られる紙です（画面に収まるよう小さくして出しています）。');
  }

  function doPrint(name) {
    var pi = paperInput(); if (!pi) return;
    var built = PAPER.build(Object.assign({}, pi, { title: name }));
    var r = OUT.print(built.html, name);
    if (!r.ok) box('edit-err', r.reason);
    else box('edit-ok', '紙だけの新しい窓を開きました。PDFにする時は、送信先を「PDFに保存」にしてください。');
  }

  function doExcel(name) {
    var pi = paperInput(); if (!pi) return;
    var sheet = AOA.build(pi);
    OUT.excel(sheet, name)
      .then(function () { box('edit-ok', name + ' を保存しました。'); })
      .catch(function (e) { box('edit-err', 'Excelが出せませんでした（' + ((e && e.message) || 'error') + '）'); });
  }

  /* ── 保存・発行 ── */
  function collect() {
    var v = S.cur;
    v.data.subject = $('e-subject').value;
    v.data.memo = $('e-memo').value;
    v.data.gensen = $('e-gensen').checked;
    v.no = $('e-no').value.trim();
    v.issue_ymd = $('e-issue').value || '';
    v.due_ymd = $('e-due').value || '';
    return v;
  }

  function saveDraft() {
    var v = collect();
    var t = recalc();
    v.lines = cleanLines(v.lines);
    v.totals = (t && t.ok) ? totalsOf(t) : {};
    if (!v.issue_ymd) { box('edit-err', '請求日を入れてください（下書きでも日付は要ります）。'); return Promise.resolve(); }
    if (!v.no) { box('edit-err', '請求番号が空です。「自動」に戻すか、自分で番号を入れてください。'); return Promise.resolve(); }
    box('edit-err', '');
    return S.store.invoices.saveDraft(v).then(function (r) {
      if (!r.ok) {
        box('edit-err', r.dup
          ? 'この番号（' + v.no + '）は既に使われています。別の番号にしてください。'
          : '保存できませんでした（' + r.reason + '）');
        return;
      }
      S.cur.id = r.id;
      S.dirty = false;
      box('edit-ok', '下書きを保存しました。');
      return loadList().then(function () { fillEdit(); });
    });
  }

  /* ═══ ★「発行する」が押せない理由★ ═══
     うちの決まり（2026-08-12・指示役が書き直した物）:
       ・その画面の ★主役の操作★ が塞がっている → ★出す。灰色にして理由をボタンの中★
         （隠すと「機能が消えた」と見える）
       ・その状態に ★存在しない操作★（下書きに「取り消す」等） → ★出さない★
     発行するは この画面の主役なので ★隠さず、押せない理由を中に入れる★。

     ★理由の言葉は DOC.validateInvoice が持っている物をそのまま使う★
     （押す前と押した後で違う言い方をしない＝同じ状態を2か所で別々に判定しない）。
     戻り: null（押せる）／ 短い理由の文字列 */
  function issueBlockReason() {
    var v = S.cur;
    if (!v) return '中身がありません';
    if (locked()) return null;                    // 発行済み＝この操作は「存在しない」＝出さない側
    if (S.orgReadOk === false) return '自社情報が読めません';
    var t;
    try { t = currentTax(); } catch (e) { return '計算できません'; }
    if (!t || !t.ok) return '明細を直してください';
    var chk = DOC.validateInvoice({
      inv: Object.assign({}, v, { lines: cleanLines(v.lines) }),
      /* ★打たれたそのままの行も渡す★＝品名だけ空の行を「黙って捨てる」のをやめる */
      rawLines: v.lines,
      partner: partnerById(v.partner_id),
      org: { data: S.org || {} },
    });
    if (chk.ok) return null;
    return chk.errors[0] || '発行できません';     // ★1つ目だけ★（ボタンに全部は入らない）
  }

  /** 「発行する」の見た目を、押せるか押せないかで塗り直す */
  function drawIssueButton() {
    var b = $('b-issue'); if (!b) return;
    var why = issueBlockReason();
    b.disabled = !!why;
    b.textContent = why ? ('発行する（' + why + '）') : '発行する';
    b.title = why || '';
  }

  function issue() {
    /* ★押せない時は何もしない（歯止め。見た目＝灰色だけで守らない）★
       ここで断る時の言葉は ★下の元の検査がそのまま出す★。
       ボタンの中の短い理由と、押した後の長い説明を ★別々に書かない★
       （同じ状態を2か所で別々に判定すると、必ずどこかで食い違う）。 */
    if (issueBlockReason()) { /* 下の検査が理由を出す */ }
    var v = collect();
    var t = recalc();
    if (!t || !t.ok) { box('edit-err', '計算が通らないので発行できません。上の赤い印を直してください。'); return Promise.resolve(); }
    // ★自社情報が読めていないまま発行しない（写しに空の自社が固まる＝直せない紙になる）
    if (S.orgReadOk === false) {
      box('edit-err', '会社の情報が読めていないので発行できません。一覧の「読み直す」を押してから、もう一度お試しください。');
      return Promise.resolve();
    }
    var p = partnerById(v.partner_id);
    var chk = DOC.validateInvoice({ inv: Object.assign({}, v, { lines: cleanLines(v.lines) }), rawLines: v.lines, partner: p, org: { data: S.org || {} } });
    if (!chk.ok) { box('edit-err', chk.errors.join('\n')); box('edit-warn', ''); return Promise.resolve(); }
    box('edit-warn', chk.warnings.join('\n'));
    box('edit-err', '');

    var at = new Date().toISOString();
    var orgData = Object.assign({}, S.org || {}, { bank: settings().bank });
    var tplId = v.template_id || settings().template;
    var spec = colsOf(v);
    var snap = DOC.snapshotOf({
      at: at, partner: p, org: { data: orgData }, tax: t, templateId: tplId, cols: spec,
    });
    /* ★源泉と繰越も写しに固める★
       繰越は「その時 読めていた入金」で出した数字。あとで入金が入っても、
       出してしまった紙は変わってはいけない（＝写しから読む）。
       源泉も同じ。率が将来変わっても、出した紙の金額は動かない。 */
    var gen = currentGensen();
    var car = currentCarry();
    if (gen && gen.on) snap.gensen = GENSEN.snapshotOf(gen);
    if (car) snap.carry = CARRY.snapshotOf(car);
    var row = Object.assign({}, v, {
      lines: cleanLines(v.lines),
      totals: totalsOf(t),
      snapshot: snap, template_id: tplId,
    });
    return S.store.invoices.issue(row, at).then(function (r) {
      if (!r.ok) { box('edit-err', '発行できませんでした（' + r.reason + '）'); return; }
      S.cur.id = r.id; S.cur.no = r.no; S.cur.status = 'issued'; S.cur.issued_at = at;
      S.cur.snapshot = snap; S.cur.totals = row.totals;
      box('edit-ok', '請求書 ' + r.no + ' を発行しました。'
        + (r.bumped ? '（同じ番号が先に使われていたので ' + r.bumped + ' つ進めました）' : '')
        + ' これで中身は固まります。');
      return loadList().then(function () { fillEdit(); });
    });
  }

  function voidIt() {
    var v = S.cur;
    if (!DOC.canVoid(v)) return Promise.resolve();
    if (!global.confirm('請求書 ' + (v.no || '') + ' を取り消しますか？\n（中身は残ります。番号は他で使えません）')) return Promise.resolve();
    return S.store.invoices.voidIt(v.id, new Date().toISOString()).then(function (r) {
      if (!r.ok) { box('edit-err', '取り消せませんでした（' + r.reason + '）'); return; }
      S.cur.status = 'void';
      box('edit-ok', '取り消しました。');
      return loadList().then(function () { fillEdit(); });
    });
  }

  function removeDraft() {
    var v = S.cur;
    if (!(DOC.canDelete(v) && v.id)) return Promise.resolve();
    if (!global.confirm('この下書きを削除しますか？')) return Promise.resolve();
    return S.store.invoices.removeDraft(v.id).then(function (r) {
      if (!r.ok) { box('edit-err', '削除できませんでした（' + r.reason + '）'); return; }
      return loadList().then(function () { goScreen('scr-list'); });
    });
  }

  /* ═══ 様式（テンプレ）を選ぶ ═══
     ★変わるのは見た目だけ。金額は1円も動かない（seikyu-templates.js が守る）★ */
  function renderTplSeg(hostId, noteId, current, onPick, disabled) {
    var host = $(hostId); if (!host) return;
    host.innerHTML = TPL.list().map(function (t) {
      return '<button class="seg-b' + (t.id === current ? ' on' : '') + '" type="button" data-tpl="'
        + esc(t.id) + '"' + (disabled ? ' disabled' : '') + '>' + esc(t.label) + '</button>';
    }).join('');
    var cur = TPL.getOrDefault(current);
    /* ★同じ事を2回 言わない★
       「見た目だけ・金額は変わらない」は 画面に固定の1行として書いてある。
       ここは ★選んだ様式が どういう形か★ だけを言う。 */
    if (noteId) setText(noteId, cur.note);
    Array.prototype.forEach.call(host.querySelectorAll('[data-tpl]'), function (b) {
      b.onclick = function () { onPick(b.getAttribute('data-tpl')); };
    });
  }

  /* ═══ 列の編集（★どんな項目にも対応する所★） ═══ */
  function editCols() {
    // 編集できるのは下書きだけ。発行済みは写しの並びを見せるだけ。
    var v = S.cur;
    if (v && !locked()) {
      if (!v.data.cols) v.data.cols = COLS.normalizeSpec(colsOf(v));
      return v.data.cols;
    }
    var s = settings();
    if (!S.org) S.org = {};
    if (!S.org.invoiceCols) S.org.invoiceCols = COLS.normalizeSpec(s.cols || TPL.getOrDefault(s.template).cols);
    return S.org.invoiceCols;
  }

  function renderColEditor() {
    var host = $('col-list'); if (!host) return;
    var spec = COLS.normalizeSpec(editCols());
    var w = COLS.widthsOf(spec.items, spec.widths);
    host.innerHTML = spec.items.map(function (k, i) {
      var role = COLS.roleOf(k);
      var raw = Number(spec.widths[k]);
      if (!Number.isFinite(raw)) raw = COLS.BASE_W[k] || 80;
      var al = COLS.alignOf(spec, k);
      return '<div class="col-row" data-col="' + esc(k) + '">'
        + '<span class="col-name">' + esc(k)
        + '<span class="col-role">' + (role ? '（計算に使う）' : '（自由な列）') + '</span></span>'
        + '<button class="mini" type="button" data-mv="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="左へ">←</button>'
        + '<button class="mini" type="button" data-mv="1"' + (i === spec.items.length - 1 ? ' disabled' : '') + ' aria-label="右へ">→</button>'
        + '<span class="col-gap"></span>'
        + '<button class="mini" type="button" data-w="-8" aria-label="幅を狭く">−</button>'
        + '<span class="col-w">' + Math.round(raw) + '</span>'
        + '<button class="mini" type="button" data-w="8" aria-label="幅を広く">＋</button>'
        + '<span class="col-w" style="color:#7AA08C">' + w[i].toFixed(1) + '%</span>'
        + '<span class="col-gap"></span>'
        + ['left', 'center', 'right'].map(function (a) {
          return '<button class="mini' + (al === a ? ' on' : '') + '" type="button" data-al="' + a + '">' + ALIGN_LABEL[a] + '</button>';
        }).join('')
        + '<span class="col-gap"></span>'
        + '<button class="l-del" type="button" data-cdel="1" aria-label="この列を消す">×</button>'
        + '</div>';
    }).join('');

    Array.prototype.forEach.call(host.querySelectorAll('.col-row'), function (row) {
      var col = row.getAttribute('data-col');
      Array.prototype.forEach.call(row.querySelectorAll('[data-mv]'), function (b) {
        b.onclick = function () { moveCol(col, +b.getAttribute('data-mv')); };
      });
      Array.prototype.forEach.call(row.querySelectorAll('[data-w]'), function (b) {
        b.onclick = function () { widthCol(col, +b.getAttribute('data-w')); };
      });
      Array.prototype.forEach.call(row.querySelectorAll('[data-al]'), function (b) {
        b.onclick = function () { alignCol(col, b.getAttribute('data-al')); };
      });
      var del = row.querySelector('[data-cdel]');
      if (del) del.onclick = function () { removeCol(col); };
    });

    var errs = COLS.validate(spec.items);
    box('col-err', errs.join(' '));
    setText('col-why', '幅は ' + COLS.MIN_W + '〜' + COLS.MAX_W + ' の間だけ。並べた幅の比率で紙に割り付けるので、'
      + '列を何本足しても紙からはみ出しません（今 ' + spec.items.length + ' 本／最大 ' + COLS.MAX_COLS + ' 本）。');
  }

  function afterColChange() {
    box('col-ok', '');
    renderColEditor();
    if (S.cur && !locked()) { renderLines(); recalc(); lockInputs(); }
  }
  function moveCol(col, d) {
    var spec = editCols();
    var i = spec.items.indexOf(col);
    var j = i + d;
    if (i < 0 || j < 0 || j >= spec.items.length) return;
    spec.items.splice(j, 0, spec.items.splice(i, 1)[0]);
    afterColChange();
  }
  function widthCol(col, d) {
    var spec = editCols();
    spec.widths = COLS.bumpWidth(spec.widths, col, d);
    afterColChange();
  }
  function alignCol(col, a) {
    var spec = editCols();
    spec.aligns[col] = a;
    afterColChange();
  }
  function removeCol(col) {
    var spec = editCols();
    if (spec.items.length <= 1) { box('col-err', '列を全部は消せません（1本は残ります）。'); return; }
    spec.items = spec.items.filter(function (k) { return k !== col; });
    delete spec.widths[col]; delete spec.aligns[col];
    afterColChange();
  }
  function addCol() {
    var name = String($('col-new').value || '').trim();
    var spec = editCols();
    var next = spec.items.concat([name]);
    var errs = COLS.validate(next);
    if (errs.length) { box('col-err', errs.join(' ')); return; }
    spec.items = next;
    $('col-new').value = '';
    box('col-err', '');
    afterColChange();
    box('col-ok', '「' + name + '」の列を足しました。金額と消費税は変わっていません。');
  }
  function resetCols() {
    var s = settings();
    var t = TPL.getOrDefault(s.template);
    var spec = editCols();
    var fresh = COLS.normalizeSpec(t.cols);
    spec.items = fresh.items; spec.widths = fresh.widths; spec.aligns = fresh.aligns;
    box('col-err', '');
    afterColChange();
    box('col-ok', '「' + t.label + '」の既定の列に戻しました。');
  }

  /* ═══ 角印（会社の印） ═══
     ★決まりは seikyu-doc.js（使える種類・上限・大きさ）★。ここは画面の配線だけ。
     ★画像は data URL で持つ＝Blob を作らない（落とす口は js/file-out.js の1本だけ）★ */
  var sealPending = null;   // 選んだばかりでまだ保存していない画像

  function fillSeal() {
    var d = S.org || {};
    var url = sealPending || d.sealDataUrl || '';
    var pv = $('seal-pv');
    if (url) { pv.src = url; show(pv, true); show($('seal-none'), false); }
    else { pv.removeAttribute('src'); show(pv, false); show($('seal-none'), true); }
    $('seal-mm').value = DOC.sealSizeMm(d.sealSizeMm);
    setText('seal-why', '大きさは ' + DOC.SEAL_MIN_MM + '〜' + DOC.SEAL_MAX_MM + 'mm の間だけ（既定 '
      + DOC.SEAL_DEFAULT_MM + 'mm）。画像は ' + Math.round(DOC.SEAL_MAX_BYTES / 1024) + 'KB まで。'
      + '発行した時の印は写しに残るので、あとで印を替えても出した紙は変わりません。');
    $('b-seal-clear').disabled = !(d.sealDataUrl || sealPending);
  }

  function pickSeal(file) {
    box('seal-err', ''); box('seal-ok', '');
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      var url = String(fr.result || '');
      var chk = DOC.validateSeal(url);
      if (!chk.ok) { box('seal-err', chk.reason); sealPending = null; fillSeal(); return; }
      sealPending = url;
      fillSeal();
      box('seal-ok', '下見に出しました。「保存」を押すと紙に出ます。');
    };
    fr.onerror = function () { box('seal-err', 'この画像は読めませんでした。別の画像でお試しください。'); };
    fr.readAsDataURL(file);
  }

  function saveSeal() {
    var mm = DOC.sealSizeMm($('seal-mm').value);
    var patch = { sealSizeMm: mm };
    if (sealPending) {
      var chk = DOC.validateSeal(sealPending);
      if (!chk.ok) { box('seal-err', chk.reason); return Promise.resolve(); }
      patch.sealDataUrl = sealPending;
    }
    box('seal-err', '');
    return S.store.org.save(patch).then(function (r) {
      if (!r.ok) { box('seal-err', '保存できませんでした（' + r.reason + '）'); return; }
      S.org = r.data;
      sealPending = null;
      fillSeal();
      box('seal-ok', '保存しました。次に発行する紙から この印で刷ります。');
    });
  }

  function clearSeal() {
    if (!global.confirm('角印を消しますか？\n（これから出す紙に印が付かなくなります。すでに出した紙は変わりません）')) return Promise.resolve();
    sealPending = null;
    return S.store.org.save({ sealDataUrl: '' }).then(function (r) {
      if (!r.ok) { box('seal-err', '消せませんでした（' + r.reason + '）'); return; }
      S.org = r.data;
      fillSeal();
      box('seal-ok', '角印を消しました。');
    });
  }

  /* ═══ 設定の画面 ═══ */
  /* ★今 紙に刷られる自社の情報を そのまま見せる★（司さん 2026-08-17）
     ★置き場所の説明ではなく 中身を出す★＝この画面で「何が刷られるか」が分かる。
     ★入っていない物は「（未入力）」と字で置く★＝空欄を黙って飛ばさない。 */
  function drawOrgView() {
    var box2 = $('org-view'); if (!box2) return;
    var g = S.org || {};
    var rows = [
      ['会社名', g.yago], ['住所', g.addr], ['電話', g.tel], ['インボイス登録番号', g.invoiceNo],
    ];
    box2.innerHTML = rows.map(function (r) {
      var v = String(r[1] == null ? '' : r[1]).trim();
      return '<div class="ov-row"><span class="ov-k">' + esc(r[0]) + '</span>'
        + '<span class="ov-v' + (v ? '' : ' ov-none') + '">' + esc(v || '（未入力）') + '</span></div>';
    }).join('');
  }

  function fillSettings() {
    var s = settings();
    drawOrgView();
    fillSelect($('s-format'), DOC.NUMBER_FORMATS.map(function (f) {
      return { v: f.key, t: f.label + '（' + f.sample + '）' };
    }), s.format);
    $('s-reset').checked = s.resetYearly;
    $('s-taxmode').value = s.taxMode;
    fillSelect($('s-round'), TAX.ROUNDINGS.map(function (k) { return { v: k, t: ROUND_LABEL[k] }; }), s.rounding);
    $('s-bank').value = s.bank;
    $('s-carry').checked = s.carry;
    $('s-rows').value = (s.paperRows === null ? '' : s.paperRows);
    $('s-dedrows').value = (s.deductRows === null ? '' : s.deductRows);
    rowsHint();
    settingsHint();

    fillSelect($('s-partner'), [{ v: '', t: '（選んでください）' }].concat(S.partners.map(function (p) {
      return { v: p.id, t: (p.data && p.data.name) || '(名称未設定)' };
    })), '');
    fillSelect($('s-pterm'), DOC.PAY_TERMS.map(function (t) { return { v: t.key, t: t.label }; }), 'none');
    fillPartnerForm('');

    // 様式と列（★会社の既定★。作りかけの1通ではなく、これから作る物に効く）
    drawSetTpl(s.template);
    renderColEditor();
    fillSeal();
  }

  function drawSetTpl(id) {
    renderTplSeg('s-tpl', 's-tpl-note', id, function (pick) {
      if (!S.org) S.org = {};
      S.org.invoiceTemplate = pick;
      // 列をまだ自分で決めていない会社は、選んだ様式の既定に合わせる
      if (!settings().cols) S.org.invoiceCols = COLS.normalizeSpec(TPL.getOrDefault(pick).cols);
      drawSetTpl(pick);
      box('col-ok', '');
      renderColEditor();
    }, false);
  }

  /* ★既定の数は紙の lib が持ち主★（画面に書き写すと、片方だけ直した時に食い違う） */
  function rowsHint() {
    var r = rowsSetting($('s-rows').value);
    var d = rowsSetting($('s-dedrows').value);
    var txt = '空のままなら 既定（控除を出さない紙 ' + PAPER.PAPER_ROWS + ' 行 ／ 出す紙 '
      + PAPER.PAPER_ROWS_DED + ' 行 ／ 控除の枠 ' + PAPER.DEDUCT_ROWS + ' 行）で刷ります。'
      + 'この数は A4 1枚に載るところまで実際に測った数です。';
    /* ★1枚に載る数には 物理の上限がある★（紙は A4 固定）。
       大きい数を入れても そこで頭打ちにして、残りは2枚目に送る（黙って切らない）。 */
    if (r !== null && r > PAPER.PAPER_ROWS) {
      txt += ' 明細の枠は 1枚に ' + PAPER.PAPER_ROWS + ' 行までしか載りません（控除を出す紙は '
        + PAPER.PAPER_ROWS_DED + ' 行）。それより多い分は 2枚目に送ります。';
    }
    if (d !== null && d > PAPER.DEDUCT_ROWS) {
      txt += ' 控除の枠を増やすと、その分 明細に載る行が減ります。';
    }
    if (r === 0) txt += ' 明細の枠 0 ＝ 枠を作らず、打った行の数だけ刷ります。';
    setText('s-rows-note', txt);
  }

  function settingsHint() {
    var f = $('s-format').value, reset = $('s-reset').checked;
    var errs = DOC.validateNumbering({ format: f, resetYearly: reset, partnerCode: 'A001' });
    setText('s-format-hint', errs.length ? errs.join(' ')
      : '「取引先＋年月＋連番」を選ぶ時は、下の欄で取引先コードを入れてください（空のままだと番号を作りません）。');
  }

  function fillPartnerForm(id) {
    var p = partnerById(id);
    var d = (p && p.data) || {};
    $('s-pcode').value = d.code || '';
    $('s-phonor').value = d.honor || d.keisho || '御中';
    $('s-pperson').value = d.person || '';
    $('s-pzip').value = d.zip || '';
    $('s-ptel').value = d.tel || '';
    var t = d.payTerm || { kind: 'none', n: 0 };
    $('s-pterm').value = t.kind || 'none';
    $('s-ptermn').value = t.n || '';
    show($('s-ptermn'), t.kind === 'days' || t.kind === 'nextDay');
    $('s-pgensen').checked = !!d.gensen;
    var on = !!p;
    ['s-pcode', 's-phonor', 's-pperson', 's-pzip', 's-ptel', 's-pterm', 's-ptermn', 's-pgensen'].forEach(function (x) { $(x).disabled = !on; });
    $('b-pt-save').disabled = !on;
  }

  function saveSettings() {
    var patch = {
      numbering: Object.assign({}, (S.org && S.org.numbering) || {}, {
        invoice: { format: $('s-format').value, resetYearly: $('s-reset').checked },
      }),
      taxMode: $('s-taxmode').value,
      taxRounding: $('s-round').value,
      bank: $('s-bank').value,
      invoiceCarry: $('s-carry').checked,
      invoicePaperRows: rowsSetting($('s-rows').value),
      invoiceDeductRows: rowsSetting($('s-dedrows').value),
      invoiceTemplate: settings().template,
      invoiceCols: COLS.normalizeSpec((S.org && S.org.invoiceCols) || TPL.getOrDefault(settings().template).cols),
    };
    var errs = DOC.validateNumbering({ format: patch.numbering.invoice.format, resetYearly: patch.numbering.invoice.resetYearly, partnerCode: 'A001' });
    var cerrs = COLS.validate(patch.invoiceCols.items);
    if (cerrs.length) errs = errs.concat(cerrs);
    if (errs.length) { box('set-err', errs.join(' ')); box('set-ok', ''); return Promise.resolve(); }
    box('set-err', '');
    return S.store.org.save(patch).then(function (r) {
      if (!r.ok) { box('set-err', '保存できませんでした（' + r.reason + '）'); return; }
      S.org = r.data;
      box('set-ok', '保存しました。');
    });
  }

  /* ★その場で相手を作る★（司さん 2026-08-17「Rakually は別アプリ」）
     ＝★他のアプリへ行かせない★。聞くのは ★会社名 1つだけ★。
       残り（敬称・住所・登録番号・支払いの約束…）は ★使う時に聞く★＝ここでは聞かない。
     ★答えたら その場で結果を返す★＝作った相手が すぐ選ばれた状態になる。 */
  function newPartner() {
    var name = String($('pt-new-name').value || '').trim();
    show($('pt-new-msg'), false);
    if (!name) { box('pt-new-msg', '会社名を入れてください。'); show($('pt-new-msg'), true); return Promise.resolve(); }
    return S.store.partners.create({ name: name }).then(function (r) {
      if (!r.ok) { setText('pt-new-msg', '作れませんでした（' + r.reason + '）'); show($('pt-new-msg'), true); return; }
      return S.store.partners.list().then(function (list) {
        S.partners = list;
        if (S.cur) S.cur.partner_id = r.id;          // ★作った相手を そのまま使う★
        $('pt-new-name').value = '';
        fillEdit();
        recalc();
        setText('pt-new-msg', r.already
          ? '「' + name + '」は もう在ったので、その相手を選びました。'
          : '「' + name + '」を作って、この請求書の相手にしました。敬称は「御中」にしています（設定で変えられます）。');
        show($('pt-new-msg'), true);
      });
    });
  }

  function savePartner() {
    var id = $('s-partner').value;
    if (!id) { box('pt-err', '先に取引先を選んでください。'); return Promise.resolve(); }
    var kind = $('s-pterm').value;
    var add = {
      code: $('s-pcode').value.trim(),
      honor: $('s-phonor').value,
      keisho: $('s-phonor').value,   // ★ハブの取引先画面が読むキー。片方だけ直すと画面で食い違う
      person: $('s-pperson').value.trim(),
      zip: $('s-pzip').value.trim(),
      tel: $('s-ptel').value.trim(),
      payTerm: { kind: kind, n: Math.trunc(Number($('s-ptermn').value) || 0) },
      gensen: $('s-pgensen').checked,   // ★源泉の対象かは相手が決める（この相手の既定）
    };
    box('pt-err', '');
    return S.store.partners.patch(id, add).then(function (r) {
      if (!r.ok) { box('pt-err', '保存できませんでした（' + r.reason + '）'); return; }
      box('pt-ok', '保存しました。');
      return S.store.partners.list().then(function (list) { S.partners = list; });
    });
  }

  /* ═══ 配線 ═══ */
  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('.bn'), function (b) {
      b.onclick = function () {
        var t = b.getAttribute('data-scr');
        if (t === 'scr-edit' && !S.cur) { newInvoice(); return; }
        if (t === 'scr-set') fillSettings();
        /* ★設定を変えて戻ってきた時、古い案内を残さない★
           （紙の行数を20行にしたのに「紙は2枚になります」と言ったまま＝
             人は「直っていない」と見る。2026-08-15 実UIで実際に出た） */
        if (t === 'scr-edit' && S.cur) recalc();
        goScreen(t);
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('#fil-seg [data-fil]'), function (b) {
      b.onclick = function () {
        S.fil = b.getAttribute('data-fil');
        Array.prototype.forEach.call(document.querySelectorAll('#fil-seg [data-fil]'), function (x) { x.classList.toggle('on', x === b); });
        renderList();
      };
    });
    /* ★種類の切替（請求書／見積書）★ 見積の入口はここ1つ。番号も棚も前から在る。 */
    Array.prototype.forEach.call(document.querySelectorAll('#kind-seg [data-kind]'), function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-kind');
        if (k === S.docType) return;
        S.docType = k;
        drawKind();
        /* ★作りかけを黙って捨てない★＝打ちかけの下書きが在る時は、そのまま残して一覧だけ切替える */
        return loadList();
      };
    });
    $('b-new').onclick = function () { newInvoice(); };
    $('b-toinv').onclick = function () { return toInvoice(); };
    // ★「読み直す」は共有マスタも取り直す（自社が読めなかった時の直し方がこれ）
    $('b-reload').onclick = function () { return loadMasters().then(loadList); };

    $('e-partner').onchange = function () {
      S.cur.partner_id = $('e-partner').value;
      S.guessDone = false;          // 相手を変えたら、また前回から当て直す
      applyPartnerDefaults();
      /* ★取引先の既定（源泉の対象か・支払期限）を画面へ戻す★
         ここを忘れると、中では源泉ありなのにチェックが外れて見える＝
         人が「入れ直す」ために1回 余計に押すことになる（2026-08-11 検査で発生）。 */
      $('e-gensen').checked = !!(S.cur.data && S.cur.data.gensen);
      var term = (S.cur.data && S.cur.data.term) || { kind: 'none', n: 0 };
      $('e-term').value = term.kind || 'none';
      $('e-termn').value = term.n || '';
      show($('e-termn'), term.kind === 'days' || term.kind === 'nextDay');
      $('e-due').value = S.cur.due_ymd || '';
      recalc();
      drawGensenHint();
      renderGuess();
      return autoNumber();
    };
    $('e-issue').onchange = function () {
      S.cur.issue_ymd = $('e-issue').value;
      recalcDue();
      drawLeadHint();          // ★「◯年◯月分」は請求日から作る＝日付を変えたら言い直す
      return autoNumber();
    };
    $('e-term').onchange = function () {
      var k = $('e-term').value;
      S.cur.data.term = { kind: k, n: Math.trunc(Number($('e-termn').value) || 0) };
      show($('e-termn'), k === 'days' || k === 'nextDay');
      recalcDue();
    };
    $('e-termn').oninput = function () {
      S.cur.data.term = { kind: $('e-term').value, n: Math.trunc(Number($('e-termn').value) || 0) };
      recalcDue();
    };
    $('e-due').onchange = function () { S.cur.due_ymd = $('e-due').value; };
    /* ★税の入れ方・円未満の丸め方・紙の様式は「設定」で1回 決める★
       ＝入力の画面では聞かない（打つ前に選ばせない）。
       番号も ふだんは読むだけ。「変える」を押した時だけ自分で決める形にする。 */
    $('b-no-edit').onclick = function () {
      var open = $('e-no').style.display !== 'none';
      if (open) {
        S.cur.data.noMode = 'auto';
        show($('e-no'), false);
        return autoNumber().then(function () { setText('e-no-view', S.cur.no || '（自動）'); });
      }
      S.cur.data.noMode = 'manual';
      show($('e-no'), true);
      try { $('e-no').focus(); } catch (e) { /* 端末によっては動かないが害はない */ }
    };
    $('e-no').oninput = function () { S.cur.no = $('e-no').value; setText('e-no-view', S.cur.no || '（自動）'); };
    $('e-subject').oninput = function () { S.cur.data.subject = $('e-subject').value; };
    $('e-memo').oninput = function () { S.cur.data.memo = $('e-memo').value; };
    $('b-addline').onclick = function () {
      S.cur.lines.push(blankLine());
      renderLines(); recalc(); lockInputs();
    };

    $('e-gensen').onchange = function () {
      S.cur.data.gensen = $('e-gensen').checked;
      S.dirty = true;
      recalc();
      drawGensenHint();
    };
    $('s-carry').onchange = function () { settingsHint(); };
    $('b-guess-ok').onclick = function () { applyGuess(); };
    $('b-guess-edit').onclick = function () {
      S.guessDone = true;
      renderGuess();
      var m = $('more-box'); if (m) m.open = true;
      box('edit-ok', '');
    };
    $('b-preview').onclick = function () { doPreview(); };
    $('b-print').onclick = function () { askName('pdf', doPrint); };
    $('b-xlsx').onclick = function () { askName('xlsx', doExcel); };
    $('fn-ok').onclick = function () {
      if (!fnPending) return;
      var ext = fnPending.ext, run = fnPending.run;
      var base = NAME.sanitize($('fn-input').value) || 'seikyu';
      fnClose();
      run(base + '.' + ext);
    };
    $('fn-cancel').onclick = fnClose;

    $('b-save').onclick = function () { return saveDraft(); };
    $('b-issue').onclick = function () { return issue(); };

    /* ★入金★ 打つたびに「押せる/押せない」を塗り直す（黙って無反応にしない） */
    /* ★差し引く（控除）★ 明細の外・税込から引く。値引き（税も減る物）は明細のマイナス行。 */
    $('b-ded-add').onclick = function () {
      deductions().push({ name: '', amount: '' });
      S.dirty = true; renderDeductions(); recalc();
    };
    /* ★この1通の金額の入れ方★（設定の既定を、この1通だけ変える） */
    $('e-taxmode').onchange = function () {
      S.cur.tax_mode = $('e-taxmode').value === 'inclusive' ? 'inclusive' : 'exclusive';
      S.dirty = true;
      renderLines(); recalc();
    };
    /* ★「◯年◯月分」★ 空なら請求日の前月から自動で入る */
    $('e-lead').oninput = function () {
      S.cur.data.lead = $('e-lead').value;
      S.dirty = true; drawLeadHint();
    };
    $('b-pay-add').onclick = function () { return addReceipt(); };
    ['pay-ymd', 'pay-amt', 'pay-memo'].forEach(function (id) {
      var el = $(id); if (el) el.oninput = el.onchange = drawPayButton;
    });
    $('pay-method').onchange = drawPayButton;

    $('b-seal-save').onclick = function () { return saveSeal(); };
    $('b-seal-clear').onclick = function () { return clearSeal(); };
    $('seal-file').onchange = function (e) { pickSeal(e.target.files && e.target.files[0]); };
    $('b-col-add').onclick = function () { addCol(); };
    $('b-col-reset').onclick = function () { resetCols(); };
    $('col-new').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addCol(); } };
    $('s-format').onchange = settingsHint;
    $('s-rows').oninput = rowsHint;
    $('s-dedrows').oninput = rowsHint;
    $('s-reset').onchange = settingsHint;
    $('s-partner').onchange = function () { fillPartnerForm($('s-partner').value); };
    $('s-pterm').onchange = function () {
      var k = $('s-pterm').value;
      show($('s-ptermn'), k === 'days' || k === 'nextDay');
    };
    $('b-set-save').onclick = function () { return saveSettings(); };
    $('b-pt-save').onclick = function () { return savePartner(); };
    $('b-pt-new').onclick = function () { return newPartner(); };
    /* Enter でも作れる（打ってから ボタンを探させない） */
    $('pt-new-name').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); newPartner(); } };

    // 画面を回した・幅が変わった時も、下見が切れないように合わせ直す
    global.addEventListener('resize', fitPreview);
  }

  /* ログインが済んでから呼ばれる（seikyu/js/auth.js） */
  function attach(sb) {
    S.sb = sb;
    S.suite = global.SuiteData.create({ client: sb });
    S.store = global.SeikyuStore.create({ client: sb, suite: S.suite });
    bind();
    return loadMasters().then(function () { return loadList(); }).then(function () {
      /* ★開いた所が「入力」なので、白紙の1通をここで作っておく★
         これが無いと、初めて開いた人の画面は
         請求日も明細の行も取引先も空のまま＝どこも押せない（2026-08-11 実機で発生）。
         一覧から開いた1通を作りかけで持っている時は、そのままにする。 */
      if (!S.cur) newInvoice();
      return S.store;
    });
  }

  /* ★共有マスタ（自社・取引先）を読む★
     ここで失敗したのを空っぽ扱いにすると、自社情報が入っているのに
     「（自社情報が未入力）」の紙が出る（2026-08-10 実機で発生：ログイン直後の1回だけ401）。
     ・1回だけ間を置いて取り直す（トークンが乗る前の1発目で落ちることがある）
     ・それでも読めなければ ★読めなかったと言う★（空と作り分ける）。発行も止める。 */
  function loadMasters(retried) {
    return Promise.all([
      S.suite.org.get().then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; }),
      S.suite.partners.list().then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; }),
    ]).then(function (r) {
      var bad = r.filter(function (x) { return !x.ok; });
      if (bad.length && !retried) {
        return new Promise(function (res) { global.setTimeout(res, 500); }).then(function () { return loadMasters(true); });
      }
      S.orgReadOk = r[0].ok;
      S.org = r[0].ok ? (r[0].v || {}) : null;      // ★読めなかったら null。{} にしない
      S.partners = r[1].ok ? (r[1].v || []) : [];
      S.partnersReadOk = r[1].ok;
      if (bad.length) {
        box('list-err', '会社の情報（自社・取引先）が読めませんでした（'
          + ((bad[0].e && bad[0].e.message) || 'error') + '）。'
          + 'このまま発行すると紙に自社情報が出ません。「読み直す」を押してください。');
      }
      return r;
    });
  }

  global.SeikyuApp = {
    attach: attach,
    _state: S,          // テストから中を見るため（画面の外からは使わない）
    _go: goScreen,
    _new: newInvoice,
    _fillSettings: fillSettings,
    _loadMasters: function () { return loadMasters(true); },   // テストから1回だけ読ませる
    _recalcForTest: function () { return recalc(); },          // テスト用: 数え直しだけ走らせる
    _renderPayForTest: function () { return renderPay(); },    // テスト用: 入金の箱だけ描き直す
    _pickSealUrl: function (url) {           // テスト用: ファイル選択の代わりに data URL を渡す
      var chk = DOC.validateSeal(url);
      if (!chk.ok) { box('seal-err', chk.reason); sealPending = null; fillSeal(); return chk; }
      sealPending = url; fillSeal(); return chk;
    },
  };
})(window);
