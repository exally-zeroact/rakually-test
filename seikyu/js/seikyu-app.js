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
  /* ★紙の作りを「誰が決めるか」は 1か所★（写し > その1通 > ★この相手★ > 会社 > 様式）
     司さん 2026-08-29「取引先ごとに 請求書の様式を ちゃんと設定できてる前提やけど？」 */
  var SCOPE = global.SeikyuScope;
  var GENSEN = global.SeikyuGensen, CARRY = global.SeikyuCarry;
  /* ★登録番号は当てない。打ち間違いだけ弾く（通信なし）★ 判定は lib/toroku-no.js が持ち主 */
  var TOROKU = global.TorokuNo;

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
      /* ★紙の書き方（会社が選べる・焼き付けない）★（指示役 2026-08-28「カスタム性」）
         ★焼き付けてよいのは 法律だけ★＝ここは 全部 見た目と言い方の話。
         空（未設定）なら ★様式の既定★ が効く（何も選ばなければ 今までどおり）。 */
      paperStyle: (d.invoiceStyle && typeof d.invoiceStyle === 'object') ? d.invoiceStyle : {},
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
    /* ★この相手だけの列★（会社の既定より 強い・無ければ 素通り＝今までどおり） */
    var pc = SCOPE && SCOPE.partnerPaper(partnerById(v.partner_id)).cols;
    if (pc && Array.isArray(pc.items) && pc.items.length) return COLS.normalizeSpec(pc);
    if (s.cols) return COLS.normalizeSpec(s.cols);
    return COLS.normalizeSpec(TPL.getOrDefault(v.template_id || s.template).cols);
  }
  /** ★この相手の 紙の行数★（無ければ 会社の既定）。空欄と 0 は 別物 */
  function rowsForPartner(pid, orgRows) {
    var pr = SCOPE && SCOPE.partnerPaper(partnerById(pid)).paperRows;
    return (pr === undefined || pr === null || pr === '') ? orgRows : pr;
  }
  /** ★この相手が 件名を紙に出すか★（相手の決めが 会社の既定より 強い） */
  function subjectOnFor(pid) {
    var ps = SCOPE && SCOPE.partnerPaper(partnerById(pid)).subjectOn;
    if (ps === true || ps === false) return ps;
    return !!((settings().paperStyle || {}).subjectOn);
  }

  function themeOf(inv) {
    var v = inv || {};
    var id = v.template_id || templateForPartner(v.partner_id);
    return TPL.getOrDefault(id).theme;
  }
  /** ★この相手の様式★（無ければ 会社の既定）＝様式を決める所は ここ1つ */
  function templateForPartner(pid) {
    var pt = SCOPE && SCOPE.partnerPaper(partnerById(pid)).template;
    return (pt && TPL.get(pt)) ? pt : settings().template;
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

  /* ═══ ★よく使う品目★ ═══
     ・数え方は seikyu-items.learn が唯一の正（ここでは数えない）
     ・★出す物が無い時は 候補の箱ごと 出さない★（空の候補は「壊れている」に見える） */
  var itemsCache = null, itemsKey = '';
  function itemList() {
    var IT = global.SeikyuItems; if (!IT) return [];
    var list = S.invoices || [];
    var key = list.length + ':' + (S.kind || 'invoice');
    if (itemsCache && itemsKey === key) return itemsCache;
    itemsKey = key;
    itemsCache = IT.learn(list, { kind: S.kind || 'invoice' });
    return itemsCache;
  }
  function drawItemList() {
    var host = $('items-dl'); if (!host) return;
    host.innerHTML = itemList().map(function (it) {
      return '<option value="' + esc(it.name) + '"></option>';
    }).join('');
  }

  /* ═══ ★集計★（司さん 2026-08-30「競合が当たり前にしてる事は こちらも当たり前に」）═══
     ・数え方は seikyu-report.js（その中も seikyu-doc.paymentStateOf を呼ぶ）＝★ここでは1つも数え直さない★
     ・★入金が読めていない時は「未確認」と書く★（0円と書かない）
     ・★見積の時は 集計を出さない★（見積は 請求ではない） */
  var repMonth = null;                       // null＝まだ人が選んでいない（＝いちばん新しい月）

  function reportOf(month) {
    var REP = global.SeikyuReport;
    if (!REP) return null;
    return REP.summarize({ invoices: S.invoices || [], receipts: S.receipts,
      partners: S.partners || [], month: month, kind: S.kind || 'invoice', doc: DOC });
  }
  function renderReport() {
    var REP = global.SeikyuReport, sumEl = $('rep-sum'), box = $('rep-box');
    if (!sumEl || !box || !REP) return;
    var isInv = (S.kind || 'invoice') === 'invoice';
    show(sumEl, isInv); show(box, isInv);
    if (!isInv) return;

    var months = REP.monthsOf((S.invoices || []).filter(function (v) {
      return (v.doc_type || 'invoice') === 'invoice' && v.status === 'issued';
    }));
    var sel = $('rep-month');
    if (repMonth === null || (repMonth && months.indexOf(repMonth) < 0)) repMonth = months[0] || '';
    sel.innerHTML = '<option value="">ぜんぶ</option>'
      + months.map(function (m) {
        return '<option value="' + esc(m) + '"' + (m === repMonth ? ' selected' : '') + '>'
          + esc(m.slice(0, 4) + '年' + String(Number(m.slice(5, 7))) + '月') + '</option>';
      }).join('');
    sel.value = repMonth;

    var s2 = reportOf(repMonth);
    var lb = repMonth ? (repMonth.slice(0, 4) + '年' + Number(repMonth.slice(5, 7)) + '月') : 'ぜんぶ';
    var unk = (s2.totals.paid === null);
    if (!s2.seen) {
      sumEl.innerHTML = '<span class="rep-c">' + esc(lb) + ' … 出した請求書は まだありません</span>';
      $('rep-body').innerHTML = '<p class="hint">この月に 発行した請求書がありません。'
        + '（下書きと 取り消した紙は 数えません）</p>';
      return;
    }
    var cell = function (t, v) { return '<span class="rep-c"><span class="rep-l">' + t
      + '</span><span class="rep-v">' + v + '</span></span>'; };
    sumEl.innerHTML = '<span class="rep-c"><span class="rep-l">' + esc(lb) + '</span>'
      + '<span class="rep-v">' + s2.totals.count + '通</span></span>'
      + cell('請求', yen(s2.totals.total) + ' 円')
      + cell('入金', unk ? '（未確認）' : yen(s2.totals.paid) + ' 円')
      + cell('残り', unk ? '（未確認）' : yen(s2.totals.remain) + ' 円');

    $('rep-body').innerHTML = s2.rows.map(function (r) {
      var tag = unk ? '' : '<span class="tag ' + (r.state === 'paid' ? 'tag-on'
        : r.state === 'unpaid' ? 'tag-off' : 'tag-mute') + '">'
        + (DOC.PAY_STATE_LABEL[r.state] || '') + '</span>';
      return '<div class="rep-row"><span class="rep-n">' + tag + esc(r.name)
        + '<span class="rep-k">' + r.count + '通</span></span>'
        + '<span class="rep-a">' + yen(r.total) + ' 円'
        + (unk ? '' : '<span class="rep-k">入金 ' + yen(r.paid) + ' ／ 残り ' + yen(r.remain) + '</span>')
        + '</span></div>';
    }).join('')
      + (unk ? '<p class="hint">入金が読めていないので、入金と残りは出していません（0円ではありません）。</p>' : '');
  }

  /* ═══ ★毎月の請求（今月まだの相手）★ ═══
     ・見つけ方は seikyu-recurring.js が唯一の正（ここでは数えない）
     ・★勝手に作らない★＝出すのは「まだですよ」の1行と 押す物だけ
     ・押したら ★前回の紙を 複製する★（複製の決まりは seikyu-doc.duplicateDoc） */
  function renderRecurring() {
    var host = $('rec-box'); if (!host) return;
    var RC = global.SeikyuRecurring;
    var isInv = (S.kind || 'invoice') === 'invoice';
    if (!RC || !isInv) { host.innerHTML = ''; return; }
    var due = RC.dueList({ invoices: S.invoices || [], partners: S.partners || [],
      ym: RC.ymOf(todayYmd()) });
    if (!due.length) { host.innerHTML = ''; return; }
    var ym = RC.ymOf(todayYmd());
    var lb = ym.slice(0, 4) + '年' + Number(ym.slice(5, 7)) + '月';
    host.innerHTML = '<div class="card rec-card">'
      + '<p class="rec-h">毎月 出している相手で、' + esc(lb) + 'ぶんが まだの人がいます。</p>'
      + due.map(function (d) {
        return '<div class="rec-row"><span class="rec-n">' + esc(d.name)
          + '<span class="rec-k">' + esc(d.lastYm.slice(0, 4)) + '年'
          + Number(d.lastYm.slice(5, 7)) + '月まで ' + d.run + 'か月つづけて 出しています'
          + (d.lastTotal ? '（前回 ' + yen(d.lastTotal) + ' 円）' : '') + '</span></span>'
          + '<button class="mini" type="button" data-rec="' + esc(d.lastId) + '">前回と同じ内容で作る</button>'
          + '</div>';
      }).join('')
      + '<p class="hint">押すと 前回の中身を 写した下書きが 出来ます（番号と請求日は 取り直します）。'
      + 'この画面が 勝手に 請求書を 作る事は ありません。</p>'
      + '</div>';
    Array.prototype.forEach.call(host.querySelectorAll('[data-rec]'), function (b) {
      b.onclick = function () { return recurFrom(b.getAttribute('data-rec')); };
    });
  }
  /** 前回の紙から 今月ぶんを 作る（＝複製と 同じ道を通る） */
  function recurFrom(id) {
    var src = null, list = S.invoices || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) src = list[i];
    if (!src) { box('list-err', 'もとの請求書が 見つかりません。「読み直す」を押してください。'); return Promise.resolve(); }
    S.cur = src;
    return duplicateCur();
  }

  /* ★探す条件★（画面から読むだけ。数え方は 何も触らない） */
  function findQuery() {
    return { text: ($('q-text') || {}).value, from: ($('q-from') || {}).value,
      to: ($('q-to') || {}).value, min: ($('q-min') || {}).value, max: ($('q-max') || {}).value };
  }

  function renderList() {
    renderRecurring();
    renderReport();
    var host = $('list-body'); if (!host) return;
    var rows = S.invoices.filter(function (v) {
      if (S.fil === 'live') return v.status !== 'void';   // ★既定は取り消し以外（出した紙が上に来る）
      return S.fil === 'all' || v.status === S.fil;
    });
    /* ★探す★（相手・番号・件名／請求日の範囲／金額の範囲。決まりは seikyu-find が唯一の正）
       ★何件から 何件に 絞ったかを 必ず出す★＝「消えた」と 思わせない。 */
    var FIND = global.SeikyuFind, before = rows.length, q = findQuery();
    if (FIND && !FIND.isEmpty(q)) {
      rows = FIND.filter(rows, q, { partnerName: partnerName });
      setText('q-hint', before + '通のうち ' + rows.length + '通が 当てはまりました。'
        + (rows.length ? '' : '（言葉を減らすか、範囲を広げてみてください）'));
      var fb = $('find-box'); if (fb) fb.open = true;
    } else {
      setText('q-hint', '');
    }
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
      /* ★「まだ金額を入れていない下書き」を 0円と 見せない★（司さん 2026-08-30
         「項目だけ入れて金額入れずに保存もしとける？」＝★出来る★。だが 一覧では
          ★0円★と出ていて ★入れ忘れと 本当の0円が 見分けられなかった★）。
         ★数え方は DOC.rowIssuesOf 1本★＝発行の時に止める判定と 同じ物を使う
         （2か所で 別々に数えると 片方だけ直った時に 食い違う）。 */
      var waiting = 0;
      if (v.status === 'draft') {
        try { waiting = DOC.rowIssuesOf(v.lines || []).noAmount.length; } catch (e) { waiting = 0; }
      }
      return '<button class="row" type="button" data-open="' + esc(v.id) + '">'
        + '<span class="iv-top">' + tag
        + '<span class="iv-no">' + (esc(v.no) || '（未採番）') + '</span>'
        + '<span class="iv-name">' + esc(partnerName(v)) + '</span></span>'
        + '<span class="iv-sub">' + esc(v.issue_ymd || '請求日なし')
        + (v.due_ymd ? '　期限 ' + esc(v.due_ymd) : '')
        + '　' + esc(payLabel(v)) + '</span>'
        + '<span class="iv-sub"><span class="iv-amt">'
        + (waiting
          ? '金額まだ ' + waiting + '行'
          : (g === undefined || g === null ? '—' : yen(g) + ' 円'))
        + '</span></span>'
        + '</button>';
    }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('[data-open]'), function (b) {
      b.onclick = function () { openInvoice(b.getAttribute('data-open')); };
    });
  }

  /** 一覧の見出し・ボタンの言葉を、今 見ている種類にそろえる（呼び名は DOC が唯一の正） */
  function drawKind() {
    var lb = DOC.docLabel(S.docType);
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

    /* ★いつでも新しい相手を作れる★（2026-08-18 DB-testの1周で判明）
       前は「その場で作る」を ★0社の時だけ★出していたので、1社でも在ると
       2社目からは ★外のアプリへ行くしかなかった★＝司さんの決定と食い違う。 */
    fillSelect($('e-partner'), [{ v: '', t: '（選んでください）' }].concat(S.partners.map(function (p) {
      return { v: p.id, t: (p.data && p.data.name) || '(名称未設定)' };
    })), v.partner_id || '');
    /* ★注意書きは「今 困っている時」だけ出す（いつも出ていると読まれない）
       ★外のアプリへ行かせない★（司さん 2026-08-17）
         前は「Exally のハブで追加してください」＝★1通も出さないうちに 外へ出していた★。
         ＝★その場で作れる口を出す★（会社名だけ答えたら 相手が出来て そのまま選ばれる）。 */
    /* 「＋ 新しい相手を作る」を いつでも一番下に置く */
    var selEl = $('e-partner');
    if (selEl && !locked()) {
      var o = document.createElement('option');
      o.value = '__new__';
      o.textContent = '＋ 新しい相手を作る';
      selEl.appendChild(o);
    }
    var noPartner = !S.partners.length;
    show($('e-partner-hint'), noPartner);
    if (noPartner) setText('e-partner-hint', '取引先がまだ1社もありません。下に会社名を入れると、その相手を作ってそのまま使えます。');
    /* ★0社なら最初から開けておく★（1社でも在れば「＋」を選んだ時に開く） */
    show($('pt-new'), (noPartner || S.ptNewOpen) && !locked());

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
    renderTplAsk();
    renderGuess();
    renderPtAsk();
    renderInvAsk();      /* ★この1通のこと（件名・支払期限）も 1問ずつ聞く★ */
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

  /* ── ★どの紙で出しますか★（司さん 2026-08-17／2026-08-24） ─────────────
     ・★何を書くかより先に テンプレを決めさせる★
     ・★見本も一緒に見せる★＝★本物の紙を そのまま小さくして出す★（作り物の絵を置かない）
     ・★答えたら その場で畳んで1行に★／★[変える]で いつでも戻って 続きから★
     ・★1問ごと保存★（下書きなら その場で保存する）
     ★別ウィザードは作らない★＝この画面のまま 1問だけ増やす。 */
  function tplGuess() {
    /* ★当てて見せる★＝この相手に 前に出した紙が在れば それを勧める（根拠つき） */
    var v = S.cur; if (!v || !v.partner_id) return null;
    var mine = S.invoices.filter(function (x) {
      return x.partner_id === v.partner_id && x.id !== v.id && x.template_id;
    }).sort(function (a, b) { return String(b.issue_ymd || '').localeCompare(String(a.issue_ymd || '')); });
    if (!mine.length) return null;
    var t = TPL.get(mine[0].template_id); if (!t) return null;
    /* ★名前は 今 選んでいる相手から取る★（古い1通から引くと、その相手が消えている時に
       ★「（消えた取引先）には 前回…」という字が 客に出る★＝2026-08-26 実配信で踏んだ） */
    var pNow = partnerById(v.partner_id);
    var nm = (pNow && pNow.data && pNow.data.name) || '';
    return { id: t.id, why: (nm || 'この相手') + ' には 前回 「' + t.label + '」 で出しています（'
      + (mine[0].issue_ymd || '日付なし') + '）' };
  }

  /* ★見本は 自分で 枠の幅に合わせる★（親のJSに頼らない）
     ＝A4(794px幅)で作った紙を、枠の幅ぶんだけ縮める。枠は A4縦と同じ形なので ★下も切れない★。
     ★2026-08-26 司さんの指摘★…前は 親が決め打ちの縮尺で縮めていたので、
     枠が横長＋紙が下から はみ出して ★紙が横に見えた★。 */
  function fitInFrame(html) {
    /* ★紙の実寸を 測ってから縮める★（794px と決めつけない）
       ★2026-08-26 司さん「見切れとるやないか」★
         私は ★html（枠と同じ幅131pxの入れ物）★ を縮めていた。
         中の紙(794px)は 131pxで切られ、それをさらに0.165倍＝★紙の左上21pxぶんしか出ていなかった★。
       ⇒ ★縮めるのは 紙そのもの（.sheet）★／★縮尺は 幅と高さの小さい方＝全部 入る方★
         （代行請求が canvas に object-fit: contain でやっているのと 同じ意味）。 */
    var js = '<script>(function(){'
      + 'var s=document.querySelector(".sheet")||document.body;'
      + 'var w=s.scrollWidth,h=s.scrollHeight; if(!w||!h) return;'
      + 'var k=Math.min(window.innerWidth/w, window.innerHeight/h);'
      + 's.style.transformOrigin="0 0"; s.style.transform="scale("+k+")";'
      + 'document.documentElement.style.overflow="hidden";'
      + 'document.body.style.margin="0"; document.body.style.overflow="hidden";'
      + '})();<' + '/script>';
    var i = html.lastIndexOf('</body>');
    return (i < 0) ? (html + js) : (html.slice(0, i) + js + html.slice(i));
  }

  function tplSampleHtml(id) {
    /* ★本物の紙を作る★。まだ中身が整っていない時だけ 見本の中身で描く（見本と分かる字を入れる）。 */
    /* ★紙は inv.template_id を見る★（o.templateId ではない）。
       ここを間違えると ★見本2枚が 同じ絵★になる（2026-08-24 に実際に踏んだ＝★見本が嘘★）。
       列も その様式の物へ差し替える（様式ごとに列が違う）。 */
    var pi = paperInput();
    if (pi) return fitInFrame(PAPER.build(Object.assign({}, pi, {
      inv: Object.assign({}, pi.inv, { template_id: id }),
      templateId: id,
      cols: COLS.normalizeSpec(TPL.getOrDefault(id).cols),
    })).html);
    /* ★作り物の見本を置かない★（司さん 2026-08-18 代行請求で同じ事を言われている:
       「他のアプリは実際の見せとんのに なんでこれだけ意味わからんやり方なんど」）
       ⇒ 紙が作れない時は ★何をすれば出るか★ を書く（代行請求と同じ言い方）。 */
    return '<!doctype html><meta charset="utf-8"><body style="margin:0;font:12px sans-serif;'
      + 'color:#555555;display:flex;align-items:center;justify-content:center;height:100%;'
      + 'text-align:center;padding:8px;box-sizing:border-box">'
      + '明細を1件 入れると<br>ここに実際の紙が出ます</body>';
  }

  function renderTplAsk() {
    var card = $('tpl-card'), strip = $('tpl-strip'), list = $('tpl-list');
    if (!card || !strip || !list) return;
    var v = S.cur;
    if (!v || locked()) { show(card, false); show(strip, false); return; }
    var cur = v.template_id || settings().template || TPL.DEFAULT_ID;
    var asked = !!(v.data && v.data.tplAsked);
    show(card, !asked); show(strip, asked);
    if (asked) {
      var t = TPL.getOrDefault(cur);
      setText('tpl-strip-v', t.label);
      return;
    }
    var g = tplGuess();
    show($('tpl-guess'), !!g);
    if (g) setText('tpl-guess', '当てました。' + g.why + '。ちがう紙にもできます。');
    list.innerHTML = '';
    TPL.list().forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tpl-pick' + ((g ? g.id : cur) === t.id ? ' on' : '');
      b.setAttribute('data-tpl', t.id);
      /* ★選ばれている物には ✓ を出す★（代行請求の見せ方に合わせた・2026-08-26 司さん）
         枠の色だけだと ★どれが選ばれているか 一目で分からない★ */
      var bg = document.createElement('div'); bg.className = 'tpl-badge'; bg.textContent = '✓';
      b.appendChild(bg);
      var shot = document.createElement('div'); shot.className = 'tpl-shot';
      var f = document.createElement('iframe');
      f.setAttribute('title', t.label + ' の見本');
      f.setAttribute('tabindex', '-1');
      f.style.width = '100%'; f.style.height = '100%';    /* 枠いっぱい。★縮尺は 見本の中で決まる★ */
      f.srcdoc = tplSampleHtml(t.id);
      shot.appendChild(f);
      var nm = document.createElement('div'); nm.className = 'tpl-nm'; nm.textContent = t.label;
      var no = document.createElement('div'); no.className = 'tpl-note'; no.textContent = t.note || '';
      b.appendChild(shot); b.appendChild(nm); b.appendChild(no);
      b.onclick = function () { chooseTpl(t.id); };
      list.appendChild(b);
    });
  }

  function chooseTpl(id) {
    var v = S.cur; if (!v) return;
    v.template_id = id;
    v.data = v.data || {}; v.data.tplAsked = true;
    if (!v.data.cols) v.data.cols = COLS.normalizeSpec(TPL.getOrDefault(id).cols);
    renderTplAsk();
    renderLines();
    recalc();
    /* ★1問ごと保存★（下書きだけ。発行済みは触らない） */
    /* 日付と番号がそろっている下書きだけ その場で保存する
       （そろう前に保存を呼ぶと「請求日を入れてください」の赤が出る＝まだ聞いていない事で怒らない） */
    if (DOC.canEdit(v) && v.issue_ymd && v.no) { try { saveDraft(); } catch (e) { /* 知らせは画面に出る */ } }
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
      /* ★複製★（司さん 2026-08-30「競合が当たり前にしてる事は こちらも当たり前に」）
         ＝毎月 同じ相手に 似た内容を出すのが 商売の普通の形。どの1通からでも 写せる。
         ★中身が空の紙からは 写さない★（写す物が無い＝押せる意味が無い） */
      if (v.id && (v.lines || []).length) {
        html += '<button class="btn-ghost" type="button" id="b-copy">この'
          + esc(DOC.docLabel(v.doc_type || 'invoice')) + 'を複製</button>';
      }
      if (DOC.canVoid(v)) html += '<button class="btn-ghost" type="button" id="b-void">この請求書を取り消す</button>';
      if (DOC.canDelete(v) && v.id) html += '<button class="bdel" type="button" id="b-delete">下書きを削除</button>';
      host.innerHTML = html;
      var bc = $('b-copy'); if (bc) bc.onclick = function () { return duplicateCur(); };
      var bv = $('b-void'); if (bv) bv.onclick = function () { return voidIt(); };
      var bd = $('b-delete'); if (bd) bd.onclick = function () { return removeDraft(); };
      show($('out-box'), ro ? !!html : true);

      /* ★畳みの見出しは「中に本当に在る物」で書く★
         発行済みでは下書き保存が出ていないのに「下書き…」と書いてあると、
         開くまで何が出来るのか分からない（2026-08-11 実機で発生）。
         発行済み・取り消し済みは、ここが唯一の出来る事なので ★開いた状態で出す★。 */
      var can = [];
      if (!ro) can.push('下書き');
      /* ★PDFを 見出しに書く★（司さん 2026-08-30「知り合いに使ってもらう」）
         中に「PDFで保存」が在るのに 見出しに無いと、★開くまで PDFが出せると分からない★。
         ここは この畳みの決まり（中に在る物だけを 見出しに書く）を そのまま守る。 */
      can.push('下見', 'PDF', '送る', '印刷', '納品書', 'Excel');
      if (v.id && (v.lines || []).length) can.push('複製');
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

  /** ★この紙と同じ物を もう1通★（写す物・写さない物の決まりは seikyu-doc.duplicateDoc が唯一の正）
   *  ★入金は 付いてこない★（元の紙の物＝付けたら 二重に数える）。 */
  function duplicateCur() {
    var src = S.cur;
    if (!src || !src.id || !(src.lines || []).length) {
      box('edit-err', 'この紙には 写す中身がありません。'); return Promise.resolve();
    }
    var from = src.no || '';
    var draft = DOC.duplicateDoc(src);
    draft.issue_ymd = todayYmd();
    S.docType = draft.doc_type;
    drawKind();
    S.cur = Object.assign(blankInvoice({ docType: draft.doc_type }), draft);
    S.cur.data = Object.assign({}, draft.data || {});
    S.guessDone = true;               // 中身は もう写してある＝「前回と同じで作りますか」は出さない
    S.dirty = true;
    return loadList().then(function () {
      fillEdit();
      return autoNumber();
    }).then(function () {
      goScreen('scr-edit');
      box('edit-ok', (from ? from + ' ' : '') + 'の中身を そのまま写しました。'
        + '番号と請求日は 新しく取り直しています。'
        + '入金は 写していません（元の紙のままです）。'
        + '中身を直してから「発行する」を押してください。');
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
  /** ★領収書を 自作PDFで★（紙は 今の紙のまま／落とし口は 1本／出せない時は 黙らない） */
  function doReceiptPdf(rcId, name, how) {
    /* ★止めた理由は receiptPaperInput が もう出している★＝ここで上書きしない
       （2か所で言うと 後の方の 当たりさわりのない字が 本当の理由を 消す） */
    var pi = receiptPaperInput(rcId);
    if (!pi) return;
    var PDF = global.SeikyuPdf;
    if (!PDF) { box('pay-err', 'PDFを作る部品が読めていません。画面を開き直してください。'); return; }
    var built = PAPER.build(Object.assign({}, pi, { title: name }));
    var open = (how === 'open');
    box('pay-ok', '領収書のPDFを作っています…（字を紙に埋め込むので 少し待ちます）');
    PDF.build(built.html, { base: '../' }).then(function (bytes) {
      var miss = PDF.lastMissing ? PDF.lastMissing() : [];
      return (open ? OUT.pdfOpen(bytes, name) : OUT.pdf(bytes, name)).then(function (r) {
        box('pay-ok', (open
          ? ((r && r.fellBack)
            ? '新しい窓が開けなかったので、領収書 ' + pi.receipt.no + ' のPDFを 落としました。'
            : '領収書 ' + pi.receipt.no + ' のPDFを 別の窓で 開きました。'
              + 'その画面の 共有ボタンから メールなどで 送れます。')
          : '領収書 ' + pi.receipt.no + ' のPDFを作りました。')
          + (miss.length ? 'この字は 字体に無いので 〓 で出しました：' + miss.join('') : ''));
      });
    }).catch(function (e) {
      box('pay-err', '領収書のPDFが作れませんでした（' + (e && e.message) + '）。'
        + '「領収書」なら 印刷から 出せます。');
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
          /* ★領収書も 自作PDFで 出せる★（司さん 2026-08-30）
             ＝印刷だけだと ★iPhoneで 紙の下に URLと日付が 付く★ */
          + (neg ? '' : '<button class="mini" type="button" data-rcpdf="' + esc(r.id) + '">領収書PDF</button>')
          /* ★送る★＝PDFを その場で開く → iPhoneの共有ボタンから メールに乗る（代行と同じ道） */
          + (neg ? '' : '<button class="mini" type="button" data-rcsend="' + esc(r.id) + '">送る</button>')
          + '<button class="l-del" type="button" data-rc="' + esc(r.id) + '" aria-label="この入金の記録を消す">×</button>'
          + '</div>';
      }).join('');
      Array.prototype.forEach.call(host.querySelectorAll('[data-rc]'), function (b) {
        b.onclick = function () { return removeReceipt(b.getAttribute('data-rc')); };
      });
      /* ★領収書を 自作PDFで★（落とす＝data-rcpdf ／ 開いて送る＝data-rcsend）
         名前を先に決めさせるのは 下と同じ。中身は 同じ1本（doReceiptPdf）。 */
      Array.prototype.forEach.call(host.querySelectorAll('[data-rcsend]'), function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-rcsend');
          var chk = DOC.canReceipt(receiptById(id), S.cur);
          if (!chk.ok) { box('pay-err', chk.reason); return; }
          var n = receiptFileName(id);
          if (!n) { box('pay-err', '中身がまだ整っていないので、領収書が出せません。'); return; }
          askNameWith(n, 'pdf', function (name) { doReceiptPdf(id, name, 'open'); });
        };
      });
      Array.prototype.forEach.call(host.querySelectorAll('[data-rcpdf]'), function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-rcpdf');
          var chk = DOC.canReceipt(receiptById(id), S.cur);
          if (!chk.ok) { box('pay-err', chk.reason); return; }
          var n = receiptFileName(id);
          if (!n) { box('pay-err', '中身がまだ整っていないので、領収書が出せません。'); return; }
          askNameWith(n, 'pdf', function (name) { doReceiptPdf(id, name); });
        };
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
    var rateHead = hasRate ? '' : '<th class="l-md">税率<span class="l-only">紙には出ません</span></th>';

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
        /* ★よく使う品目★（司さん 2026-08-30「競合が当たり前にしてる事は…」）
           ＝過去の紙から覚えた品名を 候補に出す。選ぶと 単位・単価・税率が 入る。
           ★登録させない★＝もう出した紙に 答えが書いてある（うちの「聞いてあげる」の形）。 */
        if (r === 'name') { val = ln.name; extra = ' placeholder="品名" list="items-dl"'; }
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

    drawItemList();

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
    /* ★品名が決まった時だけ★ 埋める（1文字打つたびに 動かさない＝打っている最中に 邪魔しない）。
       ★人が打った物は 1文字も 上書きしない★（決まりは seikyu-items.fill が唯一の正）。 */
    Array.prototype.forEach.call(host.querySelectorAll('[data-f="name"]'), function (el) {
      el.addEventListener('change', function () {
        var IT = global.SeikyuItems; if (!IT) return;
        var tr = el.closest('tr'), i = +tr.getAttribute('data-i');
        var item = IT.find(itemList(), el.value);
        if (!item) return;
        var r = IT.fill(S.cur.lines[i], item);
        if (!r.filled.length) return;
        S.cur.lines[i] = r.line;
        S.dirty = true;
        renderLines(); recalc(); lockInputs();
        box('edit-ok', '前に出した「' + item.name + '」から ' + r.filled.join('・')
          + ' を入れました（違うときは そのまま直せます）。');
      });
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

  /* ── ★紙が出せない時は 押せなくして 理由を出す★（指示役 2026-08-24 ■④） ──────
     前は doPrint/doExcel が ★if (!pi) return;★ で ★黙って何も起きなかった★。
     ＝★押したのに 何も起きない★＝いちばん困る形（給与で「下絵0枚の白紙ダイアログ」を踏んだ型）。
     ⇒ ★出せない間は ボタンを押せなくして、なぜ出せないかを1行 出す★。 */
  function paperGate() {
    var v = S.cur;
    if (!v) return { ok: false, why: '請求書を開いてから 出せます。' };
    var t = null;
    try { t = currentTax(); } catch (e) { t = null; }
    if (!t || !t.ok) {
      return { ok: false, why: '中身がまだ整っていないので 紙は出せません。'
        + ((t && t.errors && t.errors.length) ? '（' + t.errors[0] + '）' : '（明細を入れてください）') };
    }
    if (!v.partner_id) return { ok: false, why: '「だれに」を選ぶと 紙が出せます。' };
    if (!v.issue_ymd) return { ok: false, why: '請求日を入れると 紙が出せます。' };
    return { ok: true };
  }
  /* ★紙から作る物は ぜんぶ ここに書く★（1つでも 書き忘れると
     ★出せない中身なのに 押せる★＝押した後で 赤い字を出す形に 戻ってしまう）。
     ★b-pdf（自作PDF）は 2026-08-30 に足した時 ここに書き忘れていた★ */
  var PAPER_BTNS = ['b-preview', 'b-print', 'b-pdf', 'b-pdfopen', 'b-delivery', 'b-xlsx'];
  function applyPaperGate() {
    var g = paperGate();
    PAPER_BTNS.forEach(function (id) {
      var b = $(id); if (b) b.disabled = !g.ok;
    });
    var p = $('paper-gate');
    if (p) { show(p, !g.ok); if (!g.ok) p.textContent = g.why; }
    return g;
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
      applyPaperGate();          /* ★出せない間は 押せなくする★ */
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
         （税率ごとに1回だけ端数処理する＝国税庁 Q&A 問57。行ごとに丸めて足す道は作らない）

         ★これは 画面にだけ出す。紙には出さない★（決めた事・2026-08-28 指示役へ回答）
           理由① 適格請求書の記載事項（国税庁 No.6625 の6つ）に ★行ごとの税額は 入っていない★。
                 紙に要るのは「★税率ごとに区分した消費税額等★」だけ。
           理由② 寄せた話は ★作る人が確かめる為の物★で、★受け取る人には要らない★。
                 紙に出すと「1円を どこかへ寄せた」と読めて 逆に不安にさせる。
           理由③ 紙は ★1枚に収める★のが決まり（行が増えると 明細が押し出される）。
         ★出さないと決めた★＝出したくなった日は ここを読んでから決める。 */
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
    applyPaperGate();      /* ★紙が出せない間は 出す物のボタンを押せなくする★ */
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
    var rows = (own === undefined || own === null || own === '')
      ? rowsForPartner(v.partner_id, st.paperRows) : own;
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
    if (((v.data && v.data.noMode) || 'auto') !== 'auto') { setText('e-no-hint', '自分で決めた番号も「使用済み」として数えます。同じ番号は 二度 受け付けません。'); return Promise.resolve(); }
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
        ? '「設定」で決めた形から作りました。同じ番号は 二度 出しません。'
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
    var rows = (own === undefined || own === null || own === '')
      ? rowsForPartner(v.partner_id, st.paperRows) : own;
    var dRows = (ownD === undefined || ownD === null || ownD === '') ? st.deductRows : ownD;
    return {
      inv: inv, tax: t, partner: partner, org: org, cols: colsOf(v), theme: themeOf(v),
      gensen: currentGensen(), carry: currentCarry(),
      deduct: ded, deductLines: dedLines,
      /* ★件名を紙に出すか★も この相手の決めが 強い（会社の既定は そのまま残る） */
      style: Object.assign({}, st.paperStyle, { subjectOn: subjectOnFor(v.partner_id) }),
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

  /* ★自作PDF★（司さん 2026-08-30「自作PDFのやり方しか指示してないわ」）
     ・紙の形は ★今の紙のまま★（同じ PAPER.build を通す）
     ・落とすのは ★渡し口1本（FileOut.deliver）★＝ここで 自前に 落とさない
     ・★出せない時は 黙らない★（なぜ出せないかを 1行 出す） */
  /** ★PDFを 落とす／開く★（作り方は 1つ。最後の1歩だけ 違う）
   *  how = 'save'（落とす）／'open'（iPhoneのビューアで開く→共有からメール） */
  function doPdf(name, how, docKind) {
    var pi = paperInput();
    if (!pi) { box('edit-err', '中身がまだ整っていないので、PDFが作れません。上の赤い印を直してください。'); return; }
    var PDF = global.SeikyuPdf;
    if (!PDF) { box('edit-err', 'PDFを作る部品が読めていません。画面を開き直してください。'); return; }
    /* ★納品書は 同じ1通を 別の顔で出すだけ★（棚は増やさない） */
    var built = PAPER.build(Object.assign({}, pi, { title: name },
      docKind ? { docKind: docKind } : {}));
    var open = (how === 'open');
    var kindName = docKind === 'delivery' ? '納品書' : 'PDF';
    box('edit-ok', kindName + 'を作っています…（字を紙に埋め込むので 少し待ちます）');
    PDF.build(built.html, { base: '../' }).then(function (bytes) {
      var bad = PDF.lastBadImages ? PDF.lastBadImages() : [];
      var miss = PDF.lastMissing ? PDF.lastMissing() : [];
      return (open ? OUT.pdfOpen(bytes, name) : OUT.pdf(bytes, name)).then(function (r) {
        box('edit-ok', (open
          ? ((r && r.fellBack)
            ? 'この端末では 新しい窓が開けなかったので、' + kindName + 'を 落としました。'
              + '（ブラウザの ポップアップの設定を 見てください）'
            : kindName + 'を 別の窓で 開きました。その画面の 共有ボタンから メールなどで 送れます。')
          : kindName + 'を作りました。')
          + (miss.length ? 'この字は 字体に無いので 〓 で出しました：' + miss.join('') : '')
          + (bad.length ? '出せなかった絵が ' + bad.length + '件 あります' : ''));
      });
    }).catch(function (e) {
      box('edit-err', 'PDFが作れませんでした（' + (e && e.message) + '）。'
        + '「印刷 / PDF保存」なら 今すぐ出せます。');
    });
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
    /* ★この相手だけの列★を 作ってあれば、取引先の画面では そちらを直す
       （★2か所に 同じ列を持たない★＝直した先が どこか 画面に書いてある） */
    var pid = $('s-partner') && $('s-partner').value;
    var pOwn = pid ? SCOPE.partnerPaper(partnerById(pid)) : {};
    if (pOwn.cols && pOwn.cols.items && pOwn.cols.items.length
      && $('scr-set') && $('scr-set').classList.contains('active')) {
      return pOwn.cols;
    }
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
        + '<span class="col-w" style="color:#6E6E6E">' + w[i].toFixed(1) + '%</span>'
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
  /* ★入れた判子の形から 当てた大きさ★（司さん 2026-08-30
     「個人の苗字の判子の大きさと 角印の判子の大きさも 自動で選別してるか？」）
     ＝★当てて見せるだけ★。人が その場で 直せる（うちの決まり「聞いてあげる。埋めさせない」）。 */
  var sealGuess = null;

  function fillSeal() {
    var d = S.org || {};
    var url = sealPending || d.sealDataUrl || '';
    var pv = $('seal-pv');
    if (url) { pv.src = url; show(pv, true); show($('seal-none'), false); }
    else { pv.removeAttribute('src'); show(pv, false); show($('seal-none'), true); }
    /* ★当てた大きさが在る時は それを出す★（保存前の下見の間だけ） */
    $('seal-mm').value = DOC.sealSizeMm(sealGuess ? sealGuess.mm : d.sealSizeMm);
    /* ★印の場所★（司さん 2026-08-30「ハンコの位置は変えれるようにしてる？」） */
    var sp = $('seal-pos');
    if (sp) {
      var cur = DOC.sealPos(d.sealPos);
      sp.innerHTML = DOC.SEAL_POS.map(function (x) {
        return '<option value="' + esc(x.v) + '"' + (x.v === cur ? ' selected' : '') + '>'
          + esc(x.t) + '</option>';
      }).join('');
      sp.value = cur;
    }
    if ($('seal-dx')) $('seal-dx').value = DOC.sealNudgeMm(d.sealDx);
    if ($('seal-dy')) $('seal-dy').value = DOC.sealNudgeMm(d.sealDy);
    drawSealDemo();
    setText('seal-why', (sealGuess ? sealGuess.why + '（違う時は 上の数を 直してください）' : '')
      + '大きさは ' + DOC.SEAL_MIN_MM + '〜' + DOC.SEAL_MAX_MM + 'mm の間だけ（既定 '
      + DOC.SEAL_DEFAULT_MM + 'mm）。画像は ' + Math.round(DOC.SEAL_MAX_BYTES / 1024) + 'KB まで。'
      + '発行した時の印は写しに残るので、あとで印を替えても出した紙は変わりません。');
    $('b-seal-clear').disabled = !(d.sealDataUrl || sealPending);
  }

  /** ★印の場所を その場で見せる★（紙を出さないと分からない、を作らない）
   *  ★紙と同じ並び★＝自社の4行を 右揃えで置き、印を 同じ決め方（PAPER.sealStyle）で 重ねる。
   *  ★ここで 場所を 決め直さない★＝紙と 2つの正が 生まれる。 */
  function drawSealDemo() {
    var host = $('seal-demo'); if (!host) return;
    var d = S.org || {};
    var url = sealPending || d.sealDataUrl || '';
    if (!url) { host.innerHTML = ''; show(host, false); return; }
    show(host, true);
    var g = {
      sealDataUrl: url,
      sealSizeMm: DOC.sealSizeMm($('seal-mm') ? $('seal-mm').value : d.sealSizeMm),
      sealPos: DOC.sealPos($('seal-pos') ? $('seal-pos').value : d.sealPos),
      sealDx: DOC.sealNudgeMm($('seal-dx') ? $('seal-dx').value : d.sealDx),
      sealDy: DOC.sealNudgeMm($('seal-dy') ? $('seal-dy').value : d.sealDy),
    };
    /* 下見は 画面の幅（mmではない）なので、紙と同じ ★比★ で縮める。
       紙の自社の箱＝80mm ぶん。下見の箱の幅を それに見立てる。 */
    /* ★画面に出ていない時 clientWidth は 0★＝0で割ると 印が 0点になって 動かなく見える
       （2026-08-30 実際に そうなった）。★測れない時は 決め打ちの幅で 描く★。 */
    var box = host.clientWidth || Math.round(host.getBoundingClientRect().width) || 320;
    var per = box / 80;                       // 1mm あたりの点
    var st = PAPER.sealStyle(g).replace(/([-\d.]+)mm/g, function (m0, n) {
      return (Number(n) * per).toFixed(1) + 'px';
    }).replace('calc(50% + ', 'calc(50% + ');
    host.innerHTML = '<div class="sd-in">'
      + '<div class="sd-name">' + (esc(d.yago) || '（自社情報が未入力）')
      + '<img class="sd-seal" style="' + st + '" src="' + esc(url) + '" alt=""></div>'
      + (d.addr ? '<div class="sd-sub">' + esc(d.addr) + '</div>' : '<div class="sd-sub">（住所）</div>')
      + (d.tel ? '<div class="sd-sub">TEL ' + esc(d.tel) + '</div>' : '<div class="sd-sub">TEL （電話）</div>')
      + (d.invoiceNo ? '<div class="sd-sub">登録番号 ' + esc(d.invoiceNo) + '</div>' : '')
      + '</div>';
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
      sealGuess = null;
      fillSeal();
      box('seal-ok', '下見に出しました。「保存」を押すと紙に出ます。');
      applySealTools(url);
    };
    fr.onerror = function () { box('seal-err', 'この画像は読めませんでした。別の画像でお試しください。'); };
    fr.readAsDataURL(file);
  }

  /** ★入れた判子を そろえて、形から 大きさを当てる★（司さん 2026-08-30「ハンコの情報あるんやけんやれや」）
   *  ① 白抜き・余白切り・大きすぎたら縮める（道具は 借りた hanko.js）
   *  ② その結果で 角印か 丸い印かを 見分けて mm を入れる
   *  ★やった事は ぜんぶ 画面で言う（黙って いじらない）★
   *  ★絵を読むのに 少し時間が要るので、下見は 先に出してある★ */
  function applySealTools(url) {
    var SEAL = global.SeikyuSeal;
    if (!SEAL) return Promise.resolve();
    /* ★返す★＝呼ぶ側（と 見張り）が「終わったか」を 待てる（待てない物は 測れない） */
    return SEAL.prepare(url).then(function (r) {
      if (sealPending !== url) return null;         // 途中で 別の画像に替えられていたら 捨てる
      var next = (r && r.dataUrl) || url;
      var did = (r && r.did) || [];
      if (next !== url) {
        /* ★そろえた物が 上限を超える事が ある★（写真をPNGにすると 太る）
           ＝その時は ★元の画像のまま★にして、なぜ そのままかを 言う（黙って通さない）。 */
        var chk = DOC.validateSeal(next);
        if (!chk.ok) {
          box('seal-ok', '判子をそろえてみましたが、' + chk.reason
            + '。入れた画像を そのまま使います。');
          next = url;
          did = [];
        } else {
          sealPending = next;
          fillSeal();
        }
      }
      if (did.length) box('seal-ok', did.join('／') + '。「保存」を押すと紙に出ます。');
      return SEAL.guessFromUrl(next).then(function (g) {
        if (sealPending !== next && sealPending !== url) return;
        sealGuess = g;
        fillSeal();
      });
    }).catch(function () { /* そろえられなくても 下見は出ている＝入れた画像のまま */ });
  }

  function saveSeal() {
    var mm = DOC.sealSizeMm($('seal-mm').value);
    sealGuess = null;                     // 保存したら「当てた値」ではなく「決まった値」
    var patch = { sealSizeMm: mm,
      sealPos: DOC.sealPos($('seal-pos') ? $('seal-pos').value : ''),
      sealDx: DOC.sealNudgeMm($('seal-dx') ? $('seal-dx').value : 0),
      sealDy: DOC.sealNudgeMm($('seal-dy') ? $('seal-dy').value : 0) };
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
    sealGuess = null;
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
    /* ★紙の書き方（会社ごと）★＝空なら 様式の既定（何も選ばなければ 今までどおり） */
    (function () {
      var st = s.paperStyle || {};
      $('s-sumsorder').value = (st.sumsOrder === 'B') ? 'B' : '';
      $('s-yen').value = (st.yenMark === false) ? 'off' : '';
      $('s-zeikomi').value = (st.zeikomiTag === false) ? 'off' : '';
      $('s-bankline').value = (st.bankOneLine === true) ? 'one' : '';
      $('s-subject').value = (st.subjectOn === true) ? 'on' : '';
      $('s-taxnote').value = st.taxNote || '';
      /* ★率は lib が唯一の正★＝画面の見本の文にも 数字を直書きしない
         （法が変わった日に ★画面の文だけ 取り残される★のを止める） */
      (function () {
        var rs = (TAX.rates ? TAX.rates() : []) || [];
        var top = rs.length ? Math.max.apply(null, rs.map(Number)) : null;
        $('s-taxnote').placeholder = top ? ('例：消費税は' + top + '%となっております。') : '例：消費税について ひとこと';
      })();
      $('s-dedhead').value = st.dedHead || '';
      $('s-dedsum').value = st.dedSum || '';
    })();
    rowsHint();
    settingsHint();

    fillSelect($('s-partner'), [{ v: '', t: '（選んでください）' }].concat(S.partners.map(function (p) {
      return { v: p.id, t: (p.data && p.data.name) || '(名称未設定)' };
    })), '');
    fillSelect($('s-pterm'), DOC.PAY_TERMS.map(function (t) { return { v: t.key, t: t.label }; }), 'none');
    fillPartnerForm('');
    renderPtAsk();

    // 様式と列（★会社の既定★。作りかけの1通ではなく、これから作る物に効く）
    drawSetTpl(s.template);
    renderColEditor();
    fillSeal();
    renderPaperAsk();   /* ★紙の作り（列・行数）の聞く形も 一緒に描き直す★ */
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

  /* ═══ ★取引先を1問ずつ聞く★（司さん 2026-08-16「聞いてあげる。埋めさせない。」）═══
     ・問いの中身と ★当てと その根拠★ は seikyu/lib/seikyu-partner-ask.js が持ち主
       （画面で当て直すと、画面と lib が別々の答えを出す）
     ・★1問 答えるたびに倉庫へ書く★（まとめて保存を待たせない）
     ・出る場所は2つ ＝ 入力（作った直後）と 設定。★同じ描き手・同じ配線★
     ・★答え終われば 自分で消える★（答えた人の画面に空欄を残さない） */
  var PTASK = global.SeikyuPartnerAsk;

  function ptAskPartner(where) {
    var id = (where === 'set') ? ($('s-partner') && $('s-partner').value) : (S.cur && S.cur.partner_id);
    return partnerById(id);
  }
  function ptQs(p) {
    return PTASK.questions({
      partner: p, partners: S.partners, invoices: S.invoices,
      terms: DOC.PAY_TERMS, numberFormat: settings().format,
    });
  }
  /** ★答えたら その場で返す言葉★（日付の計算は seikyu-doc が持ち主） */
  function ptResultOf(q, d) {
    if (q.key === 'payTerm') {
      var t = d.payTerm || { kind: 'none', n: 0 };
      if (!t.kind || t.kind === 'none') return '支払期限は 紙に出しません。';
      var due = DOC.dueDateFrom(todayYmd(), t);
      return due
        ? '今日（' + todayYmd() + '）出すと お支払期限は ' + due + ' になります。'
        : 'この約束では 期限を作れませんでした（日数を入れてください）。';
    }
    if (typeof q.result === 'function') {
      var v = (q.key === 'gensen') ? (d.gensen ? 'yes' : 'no') : d[q.key];
      return q.result(v) || '';
    }
    return '';
  }
  function ptNowLabel(q, d) {
    if (q.key === 'gensen') return (d.gensen === true) ? 'する' : (d.gensen === false) ? 'しない' : '';
    if (q.key === 'payTerm') {
      var t = d.payTerm || {}; if (!t.kind || t.kind === 'none') return '決めていない';
      return termLabel(t);
    }
    if (q.key === 'honor') return String(d.honor || d.keisho || '');
    var v = String(d[q.key] == null ? '' : d[q.key]);
    /* ★空の時は 聞いた言葉で返す★（「出しますか？」に「（入れない）」だと 噛み合わない） */
    return v || (q.skipLabel ? '（' + q.skipLabel + '）' : '（決めていない）');
  }

  function ptAskHTML(where) {
    var p = ptAskPartner(where);
    if (!p) {
      return where === 'set'
        ? '<p class="hint">上で相手を選ぶと、決まっていない事だけを 1問ずつ聞きます。</p>'
        : '';
    }
    var d = (p.data || {});
    var r = ptQs(p);
    var name = String(d.name || '(名称未設定)');
    var h = '<div class="pask" data-pask-where="' + esc(where) + '">';
    h += '<div class="pask-prog">' + esc(name) + '　<b>' + r.total + '問のうち ' + r.done + '問 答えました</b></div>';

    var q = r.next;
    if (!q) {
      h += '<p class="pask-fin">この相手のことは ぜんぶ決まっています。</p>';
    } else {
      h += '<div class="pask-q"><div class="pask-qt">' + esc(q.q) + '</div>';
      if (q.hint) h += '<p class="pask-hint">' + q.hint.replace(/★/g, '') + '</p>';
      if (q.guess) {
        h += '<div class="pask-guess">当てました：<b>' + esc(ptGuessLabel(q)) + '</b>'
          + '<button class="pask-why btn-ghost" type="button" data-pask-why="' + esc(q.key) + '">なぜ？</button></div>';
      }
      if (q.kind === 'pick') {
        h += '<div class="pask-opts">' + q.options.map(function (o) {
          var on = (String(q.now) === String(o.v));
          return '<button class="pask-o ' + (on ? 'on btn-primary' : 'btn-ghost') + '" type="button" data-pask-pick="'
            + esc(q.key) + '" data-v="' + esc(o.v) + '">' + esc(o.t) + '</button>';
        }).join('') + '</div>';
        if (q.key === 'payTerm' && (q.now === 'days' || q.now === 'nextDay')) {
          h += '<div class="pask-n"><input class="finput num" id="pask-n" type="text" inputmode="numeric" '
            + 'placeholder="日数" value="' + esc((d.payTerm && d.payTerm.n) || '') + '">'
            + '<button class="pask-ok btn-primary" type="button" data-pask-ok="payTerm">これで</button></div>';
        }
      } else if (q.kind === 'yesno') {
        h += '<div class="pask-opts">'
          + '<button class="pask-o ' + (q.now === 'yes' ? 'on btn-primary' : 'btn-ghost') + '" type="button" data-pask-pick="' + esc(q.key) + '" data-v="yes">する</button>'
          + '<button class="pask-o ' + (q.now === 'no' ? 'on btn-primary' : 'btn-ghost') + '" type="button" data-pask-pick="' + esc(q.key) + '" data-v="no">しない</button>'
          + '</div>';
      } else {
        var val = q.now || (q.guess ? q.guess.value : '');
        h += '<input class="finput" id="pask-t" type="text" value="' + esc(val) + '">';
        if (q.chips && q.chips.length) {
          h += '<div class="pask-chips">' + q.chips.map(function (c) {
            return '<button class="pask-c btn-ghost" type="button" data-pask-chip="' + esc(c.v) + '">' + esc(c.t) + '</button>';
          }).join('') + '</div>';
        }
        h += '<div class="pask-row"><button class="pask-ok btn-primary" type="button" data-pask-ok="' + esc(q.key) + '">これで</button>';
        if (q.skipLabel) h += '<button class="pask-skip btn-ghost" type="button" data-pask-skip="' + esc(q.key) + '">' + esc(q.skipLabel) + '</button>';
        h += '</div>';
      }
      h += '</div>';
    }

    var answered = r.list.filter(function (x) { return x.done; });
    if (answered.length) {
      h += '<div class="pask-done"><div class="pask-done-h">答えた物（押すと直せます）</div>'
        + answered.map(function (x) {
          var res = ptResultOf(x, d);
          return '<button class="pask-d" type="button" data-pask-again="' + esc(x.key) + '">'
            + '<span class="pask-d-k">' + esc(ptQTitle(x)) + '</span>'
            + '<span class="pask-d-v">' + esc(ptNowLabel(x, d)) + '</span>'
            + (res ? '<span class="pask-d-r">' + esc(res) + '</span>' : '')
            + '</button>';
        }).join('') + '</div>';
    }
    h += '</div>';
    return h;
  }

  var PT_TITLE = {
    name: '会社名', honor: '敬称', person: '担当者', payTerm: '支払いの約束',
    gensen: '源泉徴収', addr: '住所', code: '取引先コード',
  };
  function ptQTitle(q) { return PT_TITLE[q.key] || q.key; }
  function ptGuessLabel(q) {
    var g = q.guess; if (!g) return '';
    if (q.key === 'gensen') return g.value === 'yes' ? 'する' : 'しない';
    if (q.key === 'payTerm') return termLabel({ kind: g.value, n: 0 });
    return String(g.value);
  }

  /* ═══ ★この1通のことを 1問ずつ聞く★（件名・支払期限）════════════════════
     ★別ウィザードを作らない★＝下の「細かく決める」と ★同じ値の 2つの見え方★。
     ★見た目は 取引先の聞く形（pask）と同じ物を使う★＝作り直さない。
     ★1問ごと保存★／★答えたら その場で返す★／★当てた物は 根拠を見せる★。 */
  var IASK = (typeof window !== 'undefined' && window.SeikyuInvoiceAsk) || null;

  function invAskCtx() {
    var v = S.cur; if (!v || !IASK) return null;
    var all = (S.list || []).filter(function (x) { return x && x.id !== v.id; });
    var prev = all.filter(function (x) { return x.partner_id && x.partner_id === v.partner_id; })
      .sort(function (a, b) { return String(b.issue_ymd || '').localeCompare(String(a.issue_ymd || '')); })[0] || null;
    return {
      inv: v, issue: v.issue_ymd || '', prev: prev, others: all,
      partner: (S.partners || []).filter(function (x) { return x.id === v.partner_id; })[0] || null,
      dueFrom: function (ymd, term) { return DOC.dueDateFrom(ymd, term); },
      payTerms: DOC.PAY_TERMS,
      answered: (v.data && v.data.askOk) || {},
      /* ★今の設定で 紙に出るか★（返しの言葉を 設定に追わせる＝言い切らない） */
      subjectOnPaper: subjectOnFor(v.partner_id),
    };
  }

  function invAskHTML() {
    var c = invAskCtx(); if (!c) return '';
    var r = IASK.progress(c);
    var h = '<div class="pask" data-iask="1">';
    h += '<div class="pask-prog"><b>' + r.total + '問のうち ' + r.done + '問 答えました</b></div>';
    var q = r.next;
    if (!q) { h += '<p class="pask-fin">この1通のことは ぜんぶ決まっています。</p>'; }
    else {
      h += '<div class="pask-q"><div class="pask-qt">' + esc(q.q) + '</div>';
      if (q.hint) h += '<p class="pask-hint">' + esc(q.hint) + '</p>';
      if (q.guess) {
        h += '<div class="pask-guess">当てました：<b>' + esc(q.guess.value) + '</b>'
          + '<button class="pask-why btn-ghost" type="button" data-iask-why="' + esc(q.key) + '">なぜ？</button></div>';
      }
      var val = q.now || (q.guess ? q.guess.value : '');
      h += '<input class="finput" id="iask-t" type="' + (q.kind === 'date' ? 'date' : 'text') + '" value="' + esc(val) + '">';
      /* ★もう欄に入っている物は 札に出さない★（同じ字が2つ並ぶと 押す意味が無い） */
      var chips = (q.chips || []).filter(function (c2) { return String(c2.v) !== String(val); });
      if (chips.length) {
        h += '<div class="pask-chips">' + chips.map(function (c2) {
          return '<button class="pask-c btn-ghost" type="button" data-iask-chip="' + esc(c2.v) + '">' + esc(c2.v) + '</button>';
        }).join('') + '</div>';
      }
      h += '<div class="pask-row"><button class="pask-ok btn-primary" type="button" data-iask-ok="' + esc(q.key) + '">これで</button>'
        + '<button class="pask-skip btn-ghost" type="button" data-iask-skip="' + esc(q.key) + '">' + esc(q.skipLabel || '飛ばす') + '</button></div>';
      h += '</div>';
    }
    /* 答えた物＝押すと 聞き直せる（その場の返しも 出す） */
    var done = r.list.filter(function (x) { return x.done; });
    if (done.length) {
      h += '<div class="pask-done"><div class="pask-done-h">答えた物（押すと直せます）</div>'
        + done.map(function (x) {
          var now = (x.key === 'subject') ? ((S.cur.data && S.cur.data.subject) || '') : (S.cur.due_ymd || '');
          var res = x.q.result ? x.q.result(now) : '';
          return '<button class="pask-d" type="button" data-iask-again="' + esc(x.key) + '">'
            + '<span class="pask-d-k">' + esc(x.key === 'subject' ? '件名' : '支払期限') + '</span>'
            + '<span class="pask-d-v">' + esc(now || '（入れていません）') + '</span>'
            + (res ? '<span class="pask-d-r">' + esc(res) + '</span>' : '')
            + '</button>';
        }).join('') + '</div>';
    }
    h += '</div>';
    return h;
  }

  /* 押した時（★取引先の聞く形とは 別のハンドラ★＝混ぜると どちらの答えか 分からなくなる） */
  function bindInvAsk() {
    var host = $('inv-ask'); if (!host || host.dataset.bound) return;
    host.dataset.bound = '1';
    host.addEventListener('click', function (ev) {
      var t = ev.target;
      var why = t.closest && t.closest('[data-iask-why]');
      if (why) {
        var c = invAskCtx(); if (!c) return;
        var q = IASK.progress(c).list.filter(function (x) { return x.key === why.dataset.iaskWhy; })[0];
        var qq = (q && q.q) || IASK.questions(c).filter(function (x) { return x.key === why.dataset.iaskWhy; })[0];
        if (qq && qq.guess) {
          uiNote('どうして そう当てたか', esc(qq.q) + '：<b>' + esc(qq.guess.value) + '</b><br>'
            + esc(qq.guess.why) + '<br><span class="pask-note">当てただけです。直せば そのまま変わります。</span>');
        }
        return;
      }
      var chip = t.closest && t.closest('[data-iask-chip]');
      if (chip) { var i = $('iask-t'); if (i) { i.value = chip.dataset.iaskChip; i.focus(); } return; }
      var okb = t.closest && t.closest('[data-iask-ok]');
      if (okb) { invAskAnswer(okb.dataset.iaskOk, ($('iask-t') && $('iask-t').value) || ''); return; }
      var skip = t.closest && t.closest('[data-iask-skip]');
      if (skip) { invAskAnswer(skip.dataset.iaskSkip, ''); return; }
      var again = t.closest && t.closest('[data-iask-again]');
      if (again) {
        var v = S.cur; if (!v) return;
        var okm = Object.assign({}, (v.data && v.data.askOk) || {});
        delete okm[again.dataset.iaskAgain];
        /* ★聞き直す＝今の中身も 空に戻す★（でないと「入っている＝済み」で また出ない） */
        if (again.dataset.iaskAgain === 'subject') { v.data.subject = ''; }
        else if (again.dataset.iaskAgain === 'period') { v.data.lead = ''; }
        else { v.due_ymd = ''; }
        v.data.askOk = okm;
        fillEdit();
        renderInvAsk();
      }
    });
  }

  /* ═══ ★紙の作りを 1問ずつ聞く★（⑤明細の列・⑥紙の行数）════════════════
     ★聞く前に 数える★＝出した請求書を数えて「使っていない列」「足りる行数」を当てる。
     ★見た目は 取引先・この1通の聞く形（pask）と同じ物★＝作り直さない。
     ★1問ごと保存★（答えた瞬間に 会社の設定へ書く）。 */
  var PASK2 = (typeof window !== 'undefined' && window.SeikyuPaperAsk) || null;

  function paperAskCtx() {
    if (!PASK2 || !S.org) return null;
    var st = settings();
    var spec = COLS.normalizeSpec((S.org && S.org.invoiceCols) || TPL.getOrDefault(st.template).cols);
    /* ★出した紙だけ 数える★（下書きは 実績ではない） */
    var issued = (S.list || []).filter(function (v) { return v && v.status && v.status !== 'draft'; });
    var def = TPL.getOrDefault(st.template);
    return {
      cols: spec, invoices: issued,
      rows: st.paperRows, defaultRows: (def && def.rows) || PAPER.ROWS_FIRST || 0,
      answered: (S.org && S.org.paperAskOk) || {},
      cellOf: function (ln, col, i, sp) { return COLS.cellOf(ln, col, i, sp); },
      roleOf: function (sp, col) { return COLS.roleOfIn(sp, col); },
    };
  }

  function paperAskHTML() {
    var c = paperAskCtx(); if (!c) return '';
    var r = PASK2.progress(c);
    var h = '<div class="pask" data-paskp="1">';
    h += '<div class="pask-prog"><b>' + r.total + '問のうち ' + r.done + '問 答えました</b></div>';
    var q = r.next;
    if (!q) { h += '<p class="pask-fin">紙の作りは ぜんぶ決まっています。</p>'; }
    else {
      h += '<div class="pask-q"><div class="pask-qt">' + esc(q.q) + '</div>';
      if (q.hint) h += '<p class="pask-hint">' + esc(q.hint) + '</p>';
      if (q.guess) {
        h += '<div class="pask-guess">当てました：<b>' + esc(String(q.guess.value)) + '</b>'
          + '<button class="pask-why btn-ghost" type="button" data-paskp-why="' + esc(q.key) + '">なぜ？</button></div>';
      }
      if (q.kind === 'yesno') {
        h += '<div class="pask-opts">'
          + '<button class="pask-o btn-ghost" type="button" data-paskp-pick="' + esc(q.key) + '" data-v="yes">消す</button>'
          + '<button class="pask-o btn-ghost" type="button" data-paskp-pick="' + esc(q.key) + '" data-v="no">このまま残す</button>'
          + '</div>';
      } else {
        h += '<div class="pask-opts">' + (q.options || []).map(function (o) {
          return '<button class="pask-o btn-ghost" type="button" data-paskp-pick="' + esc(q.key) + '" data-v="' + esc(o.v) + '">' + esc(o.t) + '</button>';
        }).join('') + '</div>';
      }
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderPaperAsk() {
    var card = $('paper-ask-card'), host = $('paper-ask');
    if (!card || !host) return;
    var c = paperAskCtx();
    var on = !!(c && PASK2.progress(c).next);
    show(card, on);
    host.innerHTML = on ? paperAskHTML() : '';
    bindPaperAsk();
  }

  /** ★1問ごと保存★（会社の設定へ書く。答えた印も 会社の設定に持つ） */
  function paperAskAnswer(key, val) {
    var c = paperAskCtx(); if (!c) return;
    var q = PASK2.questions(c).filter(function (x) { return x.key === key; })[0];
    if (!q) return;
    if (/^col:/.test(key)) {
      if (val === 'yes') {
        var spec = COLS.normalizeSpec((S.org && S.org.invoiceCols) || TPL.getOrDefault(settings().template).cols);
        var next = spec.items.filter(function (x) { return x !== q.col; });
        var errs = COLS.validate(next);
        if (errs.length) { box('col-err', errs.join(' ')); return; }   /* ★消せない時は 消さない★ */
        spec.items = next;
        S.org = Object.assign({}, S.org || {}, { invoiceCols: spec });
      }
    } else if (key === 'rows') {
      S.org = Object.assign({}, S.org || {}, { invoicePaperRows: rowsSetting(val) });
    }
    var okm = Object.assign({}, (S.org && S.org.paperAskOk) || {});
    okm[key] = true;
    S.org = Object.assign({}, S.org || {}, { paperAskOk: okm });
    box('col-ok', q.result ? q.result(val) : '');
    fillSettings();
    renderPaperAsk();
    savePaperAsk();
  }
  /** ★保存できない時は 何もしない（「保存しました」と嘘を言わない）★ */
  function savePaperAsk() {
    if (!(S.store && S.store.org)) return;
    S.store.org.save({
      invoiceCols: S.org.invoiceCols, invoicePaperRows: S.org.invoicePaperRows, paperAskOk: S.org.paperAskOk,
    }).then(function (r) {
      if (!r || !r.ok) box('set-err', '保存できませんでした（' + ((r && r.reason) || '') + '）');
      else if (r.data) S.org = r.data;
    });
  }

  function bindPaperAsk() {
    var host = $('paper-ask'); if (!host || host.dataset.bound) return;
    host.dataset.bound = '1';
    host.addEventListener('click', function (ev) {
      var t = ev.target;
      var why = t.closest && t.closest('[data-paskp-why]');
      if (why) {
        var c = paperAskCtx(); if (!c) return;
        var q = PASK2.questions(c).filter(function (x) { return x.key === why.dataset.paskpWhy; })[0];
        if (q && q.guess) {
          uiNote('どうして そう当てたか', esc(q.q) + '<br>' + esc(q.guess.why).replace(/★/g, '')
            + '<br><span class="pask-note">当てただけです。ちがう物を押せば そのまま変わります。</span>');
        }
        return;
      }
      var pick = t.closest && t.closest('[data-paskp-pick]');
      if (pick) { paperAskAnswer(pick.dataset.paskpPick, pick.dataset.v); }
    });
  }

  function renderInvAsk() {
    var card = $('inv-ask-card'), host = $('inv-ask');
    if (!card || !host) return;
    var c = invAskCtx();
    var on = !!(c && !locked() && IASK.progress(c).next);
    show(card, on);
    host.innerHTML = on ? invAskHTML() : '';
    bindInvAsk();
  }

  /** ★1問ごと保存★（答えた瞬間に この1通へ書く。最後まで行かないと保存されない、にしない） */
  function invAskAnswer(key, val) {
    var v = S.cur; if (!v) return;
    v.data = v.data || {};
    if (key === 'subject') { v.data.subject = String(val == null ? '' : val).trim(); }
    else if (key === 'due') { v.due_ymd = String(val == null ? '' : val).trim(); }
    /* ★対象期間は 紙の頭の1行(lead)そのもの★＝★値の持ち主を 2つにしない★
       （聞く形と 編集画面の「◯年◯月分」の欄が 同じ物を 指す） */
    else if (key === 'period') { v.data.lead = String(val == null ? '' : val).trim(); }
    var okm = Object.assign({}, v.data.askOk || {});
    okm[key] = true;                                  // ★「飛ばす」も 答えたうち★（空のまま 何度も聞かない）
    v.data.askOk = okm;
    fillEdit();
    renderInvAsk();
    /* ★1問ごと保存★（最後まで行かないと保存されない、にしない）。
       ★下書きにできない時（請求日や番号が空）は 黙って何もしない★＝
       「保存しました」と嘘を言わない。その時は 下の「下書き保存」で残る。 */
    if (v.issue_ymd && v.no && S.store && S.store.invoices) { saveDraft(); }
  }

  function renderPtAsk() {
    var setHost = $('pt-ask-set');
    if (setHost) setHost.innerHTML = ptAskHTML('set');
    var card = $('pt-ask-card'), editHost = $('pt-ask-edit');
    if (card && editHost) {
      var p = ptAskPartner('edit');
      var r = p ? ptQs(p) : null;
      /* ★出すのは まだ答えていない事が在る時だけ★（答えた人の画面に空欄を残さない） */
      var on = !!(p && r && r.next && !locked());
      show(card, on);
      editHost.innerHTML = on ? ptAskHTML('edit') : '';
    }
    /* ★同じ値を2か所で別々に持たない★＝「ぜんぶ見る」も同時に描き直す */
    if ($('s-partner')) fillPartnerForm($('s-partner').value);
  }

  /** ★1問ごとに保存★（倉庫へ書けなければ 画面の値も戻す＝嘘の成功を出さない） */
  function ptAskSave(id, add, ok) {
    var p = partnerById(id); if (!p) return Promise.resolve();
    var askOk = Object.assign({}, (p.data && p.data.askOk) || {});
    if (ok) askOk[ok] = true;
    var patch = Object.assign({}, add, { askOk: askOk });
    /* 先に手元へ入れて すぐ描く（返事を待たせない）。書けなければ読み直して戻す */
    p.data = Object.assign({}, p.data || {}, patch);
    renderPtAsk();
    if (S.cur) { recalc(); fillEdit(); }
    box('pt-err', '');
    return S.store.partners.patch(id, patch).then(function (r) {
      if (!r || !r.ok) {
        box('pt-err', '保存できませんでした（' + ((r && r.reason) || '理由不明') + '）。もう一度 押してください。');
        return S.store.partners.list().then(function (list) { S.partners = list; renderPtAsk(); });
      }
      return S.store.partners.list().then(function (list) { S.partners = list; renderPtAsk(); });
    }).catch(function (e) {
      box('pt-err', '保存できませんでした（' + ((e && e.message) || 'error') + '）。もう一度 押してください。');
    });
  }

  function ptAskAnswer(where, key, v) {
    var p = ptAskPartner(where); if (!p) return Promise.resolve();
    var d = p.data || {};
    var add = {}, markOk = key;
    if (key === 'honor') { add.honor = v; add.keisho = v; }
    else if (key === 'gensen') { add.gensen = (v === 'yes'); }
    else if (key === 'payTerm') {
      var n = Math.trunc(Number(($('pask-n') && $('pask-n').value) || (d.payTerm && d.payTerm.n) || 0));
      add.payTerm = { kind: v, n: n };
      /* ★日数が要る約束は 日数を聞くまで「答えた」にしない★（0日後の期限を黙って作らない） */
      if ((v === 'days' || v === 'nextDay') && !(n > 0)) markOk = null;
    } else { add[key] = String(v == null ? '' : v).trim(); }
    return ptAskSave(p.id, add, markOk);
  }

  function bindPtAsk() {
    ['pt-ask-set', 'pt-ask-edit'].forEach(function (hostId) {
      var host = $(hostId); if (!host) return;
      host.addEventListener('click', function (ev) {
        var t = ev.target;
        var box_ = t.closest && t.closest('[data-pask-where]');
        var where = (box_ && box_.dataset.paskWhere) || (hostId === 'pt-ask-set' ? 'set' : 'edit');
        var p = ptAskPartner(where); if (!p) return;

        var why = t.closest && t.closest('[data-pask-why]');
        if (why) {
          var q = ptQs(p).list.filter(function (x) { return x.key === why.dataset.paskWhy; })[0];
          if (q && q.guess) {
            box('pt-ok', '');
            uiNote('どうして そう当てたか', esc(ptQTitle(q)) + '：<b>' + esc(ptGuessLabel(q)) + '</b><br>'
              + esc(q.guess.why) + '<br><span class="pask-note">当てただけです。ちがう物を押せば そのまま変わります。</span>');
          }
          return;
        }
        var pick = t.closest && t.closest('[data-pask-pick]');
        if (pick) { ptAskAnswer(where, pick.dataset.paskPick, pick.dataset.v); return; }
        var chip = t.closest && t.closest('[data-pask-chip]');
        if (chip) { var i = $('pask-t'); if (i) { i.value = chip.dataset.paskChip; i.focus(); } return; }
        var okb = t.closest && t.closest('[data-pask-ok]');
        if (okb) {
          var k = okb.dataset.paskOk;
          if (k === 'payTerm') { ptAskAnswer(where, 'payTerm', (p.data && p.data.payTerm && p.data.payTerm.kind) || 'none'); return; }
          ptAskAnswer(where, k, ($('pask-t') && $('pask-t').value) || '');
          return;
        }
        var skip = t.closest && t.closest('[data-pask-skip]');
        if (skip) { ptAskAnswer(where, skip.dataset.paskSkip, ''); return; }
        var again = t.closest && t.closest('[data-pask-again]');
        if (again) {
          var key = again.dataset.paskAgain;
          var askOk = Object.assign({}, (p.data && p.data.askOk) || {});
          delete askOk[key];
          p.data = Object.assign({}, p.data || {}, { askOk: askOk });
          renderPtAsk();
          S.store.partners.patch(p.id, { askOk: askOk });
        }
      });
    });
  }

  /** 小さな知らせ（★知らせの出口は1つ★＝alert は使わない） */
  function uiNote(title, html) {
    var d = $('pask-note-box');
    if (!d) {
      d = document.createElement('div');
      d.id = 'pask-note-box';
      d.className = 'pask-note-box';
      d.innerHTML = '<div class="pask-note-in"><h3 id="pask-note-t"></h3><div id="pask-note-b"></div>'
        + '<button class="btn-primary" type="button" id="pask-note-x">閉じる</button></div>';
      document.body.appendChild(d);
      d.addEventListener('click', function (ev) {
        if (ev.target.id === 'pask-note-x' || ev.target === d) d.style.display = 'none';
      });
    }
    $('pask-note-t').textContent = title;
    $('pask-note-b').innerHTML = html;
    d.style.display = '';
  }

  /* ══ ★この相手だけの紙★（司さん 2026-08-29）════════════════════════
     ★何も選ばなければ 会社の既定のまま★＝今までと 1ドットも 変わらない。
     決める順番は seikyu-scope.js が 1か所で持っている（画面で 別の判定をしない）。 */
  /* ★押した時の配線は 描く時に する★（画面の他の所と 同じやり方）
     ＝ログインの後だけ縛る形にすると ★試験で 1回も押せない★（2026-08-29 に踏んだ）。 */
  function bindPartnerPaper() {
    var box2 = $('s-ptpl'); if (!box2 || box2.dataset.bound) return;
    box2.dataset.bound = '1';
    ['s-ptpl', 's-prows', 's-psubject'].forEach(function (id) {
      var el = $(id); if (!el) return;
      /* ★選んだ その場で 効かせる★（保存を押すまで 何も変わらない、にしない） */
      var run = function () {
        var pp = partnerById($('s-partner') && $('s-partner').value);
        if (!pp) return;
        pp.data = pp.data || {};
        pp.data.paper = partnerPaperFromForm(pp.id);
        fillPartnerPaper(pp);
        renderColEditor();
      };
      el.addEventListener('change', run);
      el.addEventListener('input', run);
    });
    if ($('b-pcols-own')) $('b-pcols-own').addEventListener('click', function () { partnerColsOwn(true); });
    if ($('b-pcols-clear')) $('b-pcols-clear').addEventListener('click', function () { partnerColsOwn(false); });
  }

  function fillPartnerPaper(p) {
    var sel = $('s-ptpl'); if (!sel) return;
    bindPartnerPaper();
    var pp = SCOPE.partnerPaper(p);
    var st = settings();
    var defLabel = (TPL.getOrDefault(st.template).label || st.template);
    sel.innerHTML = '<option value="">会社の既定のまま（' + esc(defLabel) + '）</option>'
      + TPL.list().map(function (t) {
        return '<option value="' + esc(t.id) + '">' + esc(t.label) + '</option>';
      }).join('');
    sel.value = pp.template || '';
    $('s-prows').value = (pp.paperRows === undefined || pp.paperRows === null || pp.paperRows === '')
      ? '' : String(pp.paperRows);
    $('s-psubject').value = (pp.subjectOn === true) ? 'on' : ((pp.subjectOn === false) ? 'off' : '');
    var own = !!(pp.cols && pp.cols.items && pp.cols.items.length);
    show($('b-pcols-own'), !own);
    show($('b-pcols-clear'), own);
    setText('s-pcols-hint', own
      ? ('この相手だけの列です（' + pp.cols.items.length + '本）。下の「明細の列」で 直せます。')
      : '今は 会社の既定の列です。');
  }
  /** この相手だけの列を 作る（★会社の今の列を 写してから 直す★＝白紙から作らせない） */
  function partnerColsOwn(on) {
    var id = $('s-partner') && $('s-partner').value;
    var p = partnerById(id); if (!p) return;
    p.data = p.data || {};
    p.data.paper = Object.assign({}, p.data.paper || {});
    if (on) {
      var st = settings();
      p.data.paper.cols = COLS.normalizeSpec(st.cols || TPL.getOrDefault(st.template).cols);
    } else {
      delete p.data.paper.cols;
    }
    fillPartnerPaper(p);
    renderColEditor();
  }

  function fillPartnerForm(id) {
    var p = partnerById(id);
    var d = (p && p.data) || {};
    $('s-pcode').value = d.code || '';
    $('s-phonor').value = d.honor || d.keisho || '御中';
    $('s-pperson').value = d.person || '';
    $('s-paddr').value = d.addr || '';
    $('s-pzip').value = d.zip || '';
    $('s-ptel').value = d.tel || '';
    $('s-pinvoice').value = d.invoiceNo || '';
    ptInvoiceHint();
    var t = d.payTerm || { kind: 'none', n: 0 };
    $('s-pterm').value = t.kind || 'none';
    $('s-ptermn').value = t.n || '';
    show($('s-ptermn'), t.kind === 'days' || t.kind === 'nextDay');
    $('s-pgensen').checked = !!d.gensen;
    fillPartnerPaper(p);
    var on = !!p;
    ['s-pcode', 's-phonor', 's-pperson', 's-paddr', 's-pzip', 's-ptel', 's-pinvoice', 's-pterm', 's-ptermn', 's-pgensen',
      's-ptpl', 's-prows', 's-psubject'].forEach(function (x) { if ($(x)) $(x).disabled = !on; });
    ['b-pcols-own', 'b-pcols-clear'].forEach(function (x) { if ($(x)) $(x).disabled = !on; });
    $('b-pt-save').disabled = !on;
  }

  /** ★打った その場で 形を見る★（通信しない・国税庁のサイトは叩かない） */
  function ptInvoiceHint() {
    var el = $('s-pinvoice'), h = $('s-pinvoice-hint'); if (!el || !h) return;
    var base = '紙には出ません（適格請求書に要るのは 出す側＝自社の登録番号です）。控えとして持っておく欄です。';
    var chk = TOROKU.check(el.value);
    h.textContent = (chk.level === 'empty') ? base : (chk.msg + '　' + base);
    h.className = 'hint' + (chk.ok ? '' : ' bad-t');
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
      /* ★選ばなかった物は 持たない★＝様式の既定が効く（空の値を保存して 既定を上書きしない） */
      invoiceStyle: (function () {
        var o = {};
        if ($('s-sumsorder').value === 'B') o.sumsOrder = 'B';
        if ($('s-yen').value === 'off') o.yenMark = false;
        if ($('s-zeikomi').value === 'off') o.zeikomiTag = false;
        if ($('s-bankline').value === 'one') o.bankOneLine = true;
        if ($('s-subject').value === 'on') o.subjectOn = true;
        if (String($('s-taxnote').value || '').trim()) o.taxNote = String($('s-taxnote').value).trim();
        if (String($('s-dedhead').value || '').trim()) o.dedHead = String($('s-dedhead').value).trim();
        if (String($('s-dedsum').value || '').trim()) o.dedSum = String($('s-dedsum').value).trim();
        return o;
      })(),
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
        S.ptNewOpen = false;              // 作れたら 欄は閉じる（空欄を残さない）
        fillEdit();
        recalc();
        setText('pt-new-msg', r.already
          ? '「' + name + '」は もう在ったので、その相手を選びました。'
          : '「' + name + '」を作って、この請求書の相手にしました。あとは下で 1問ずつ聞きます。');
        show($('pt-new-msg'), true);
      });
    });
  }

  /** 画面の3つ＋列 を ひとまとめに（★空欄は 入れない＝会社の既定のまま★） */
  function partnerPaperFromForm(id) {
    var now = SCOPE.partnerPaper(partnerById(id));
    var out = {};
    var tpl = $('s-ptpl') ? $('s-ptpl').value : '';
    if (tpl && TPL.get(tpl)) out.template = tpl;
    var rows = $('s-prows') ? String($('s-prows').value).trim() : '';
    if (rows !== '') {
      var n = Number(rows);
      if (Number.isFinite(n) && n >= 0) out.paperRows = Math.trunc(n);
    }
    var sj = $('s-psubject') ? $('s-psubject').value : '';
    if (sj === 'on') out.subjectOn = true;
    else if (sj === 'off') out.subjectOn = false;
    /* 列は ボタンで作る物（フォームの欄ではない）＝今の物を そのまま持ち越す */
    if (now.cols && now.cols.items && now.cols.items.length) out.cols = now.cols;
    return out;
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
      addr: $('s-paddr').value.trim(),
      zip: $('s-pzip').value.trim(),
      tel: $('s-ptel').value.trim(),
      invoiceNo: TOROKU.check($('s-pinvoice').value).no,
      payTerm: { kind: kind, n: Math.trunc(Number($('s-ptermn').value) || 0) },
      gensen: $('s-pgensen').checked,   // ★源泉の対象かは相手が決める（この相手の既定）
      /* ★この相手だけの紙★（空＝会社の既定のまま） */
      paper: partnerPaperFromForm(id),
    };
    /* ★「ぜんぶ見る」で自分で入れた物も『答えた』にする★
       ＝ここで入れたのに あとから同じ事を聞かれる（＝2度 聞く）のを止める。 */
    var askOk = Object.assign({}, ((partnerById(id) || {}).data || {}).askOk || {});
    ['honor', 'person', 'addr', 'code', 'payTerm', 'gensen'].forEach(function (k) { askOk[k] = true; });
    add.askOk = askOk;
    /* ★登録番号は当てない★＝形が違う時だけ止める（検査用数字の違いは注意に留める） */
    var chk = TOROKU.check($('s-pinvoice').value);
    if (!chk.ok) { box('pt-err', chk.msg); return Promise.resolve(); }
    box('pt-err', '');
    return S.store.partners.patch(id, add).then(function (r) {
      if (!r.ok) { box('pt-err', '保存できませんでした（' + r.reason + '）'); return; }
      box('pt-ok', '保存しました。' + (chk.level === 'digit' ? '（' + chk.msg + '）' : ''));
      return S.store.partners.list().then(function (list) { S.partners = list; renderPtAsk(); });
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
      /* ★「＋ 新しい相手を作る」を選んだら その場で作る欄を開く★（外のアプリへ行かせない） */
      if ($('e-partner').value === '__new__') {
        S.ptNewOpen = true;
        $('e-partner').value = S.cur.partner_id || '';
        show($('pt-new'), true);
        var nm = $('pt-new-name'); if (nm) nm.focus();
        return;
      }
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
      /* ★相手を変えたら 聞く形も描き直す★
         （実UIの押し込みで見つけた：変えても聞かれない＝設定へ行かせていた） */
      renderPtAsk();
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
    /* ★[変える]＝1問目へ戻る（続きから）★（司さん 2026-08-24）
       ★中身は消さない★＝戻っても 相手も明細も そのまま。紙だけ選び直せる。 */
    var tplCh = $('b-tpl-change');
    if (tplCh) tplCh.onclick = function () {
      if (!S.cur) return;
      S.cur.data = S.cur.data || {};
      S.cur.data.tplAsked = false;
      renderTplAsk();
    };
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
    if ($('b-pdf')) $('b-pdf').onclick = function () { askName('pdf', function (n) { doPdf(n, 'save'); }); };
    /* ★開く★＝iPhoneのビューアへ渡す（そこの共有ボタンで メールに乗る） */
    if ($('b-pdfopen')) $('b-pdfopen').onclick = function () { askName('pdf', function (n) { doPdf(n, 'open'); }); };
    /* ★納品書★＝同じ1通を 納品書の顔で PDFにして 開く（送るところまで 同じ道） */
    if ($('b-delivery')) $('b-delivery').onclick = function () {
      askName('pdf', function (n) { doPdf(n, 'open', 'delivery'); });
    };
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

    /* ★集計する月を 変える★（選んだ月は 覚えておく＝押すたびに 戻らない） */
    /* ★探す★＝打つたびに 絞る（押させない）。★やめる は 1押しで 元に戻す★ */
    ['q-text', 'q-from', 'q-to', 'q-min', 'q-max'].forEach(function (id) {
      var el = $(id); if (!el) return;
      el.oninput = function () { renderList(); };
    });
    if ($('b-q-clear')) $('b-q-clear').onclick = function () {
      ['q-text', 'q-from', 'q-to', 'q-min', 'q-max'].forEach(function (id) {
        var el = $(id); if (el) el.value = '';
      });
      renderList();
    };
    if ($('rep-month')) $('rep-month').onchange = function () {
      repMonth = $('rep-month').value; renderReport();
    };
    /* ★動かしたら その場で 下見が変わる★（押さないと分からない、を作らない） */
    ['seal-mm', 'seal-dx', 'seal-dy'].forEach(function (id) {
      var el = $(id); if (el) el.oninput = function () { drawSealDemo(); };
    });
    if ($('seal-pos')) $('seal-pos').onchange = function () { drawSealDemo(); };
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
    $('s-partner').onchange = function () { fillPartnerForm($('s-partner').value); renderPtAsk(); };
    $('s-pinvoice').oninput = ptInvoiceHint;
    bindPtAsk();
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
    _fillEdit: fillEdit,          // テスト用: 入力の画面を描き直す（★見られない物は 見張れない★）
    _invAskAnswer: function (k, v) { return invAskAnswer(k, v); },   // テスト用: 聞く形に答える
    _saveDraftForTest: function () { return saveDraft(); },          // テスト用: 下書き保存を そのまま走らせる
    _renderListForTest: function () { return renderList(); },        // テスト用: 一覧を 描き直す
    _reportForTest: function (m) { return reportOf(m); },            // テスト用: 集計の数だけ取る
    /* テスト用: ★本物の紙★を そのまま返す（見張りが 紙の中身を数える為。
       ★画面と同じ道を通す★＝紙だけ別の作り方をしない） */
    _paperHtml: function () {
      var pi = paperInput();
      if (!pi) return '';
      var built = PAPER.build(pi);
      return (typeof built === 'string') ? built : ((built && built.html) || '');
    },
    _renderPayForTest: function () { return renderPay(); },    // テスト用: 入金の箱だけ描き直す
    _itemsForTest: function () { itemsCache = null; return itemList(); },  // テスト用: 覚えた品目
    _duplicateForTest: function () { return duplicateCur(); }, // テスト用: 複製を そのまま走らせる
    /* テスト用: ★ボタンに 手を紐づける所だけ★ 走らせる（attach は倉庫に つなぎに行くので
       倉庫の無い試験からは 押せない＝「ボタンが在る」で 終わらせない為の 穴） */
    _bindForTest: function () { return bind(); },
    _paperBtnsForTest: function () { return PAPER_BTNS.slice(); },   // テスト用: 門を掛ける相手の一覧
    _sealDemoForTest: function () { return drawSealDemo(); },   // テスト用: 下見を描き直す
    _saveSealForTest: function () { return saveSeal(); },       // テスト用: 保存を そのまま走らせる
    _pickSealUrl: function (url) {           // テスト用: ファイル選択の代わりに data URL を渡す
      var chk = DOC.validateSeal(url);
      if (!chk.ok) { box('seal-err', chk.reason); sealPending = null; sealGuess = null; fillSeal(); return chk; }
      sealPending = url; sealGuess = null; fillSeal();
      var SEAL = global.SeikyuSeal;
      if (!SEAL) return chk;
      /* ★そろえて 当て終わるのを 待てる形で返す★（見張りが「その後」を見られるように） */
      return Object.assign({}, chk, {
        guessed: Promise.resolve(applySealTools(url)).then(function () { return sealGuess; }),
      });
    },
  };
})(window);
