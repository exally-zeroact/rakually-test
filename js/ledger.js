/* ledger.js — 日次台帳(E2)。hub.js の後に読み込む。
 * 契約 = docs/SPEC_E2_ledger.md
 *
 * ★守る事★
 *   ・書き先は pay_ledger だけ（pay_payslips には書かない＝E0 §6-2）。
 *   ・人×日付に「何行でも」入れられる（1日1行に縛らない＝代行の実態）。
 *   ・締め方は Kyually の会社設定が唯一の源＝ここでは「読んで表示するだけ」。設定UIを作らない。
 *   ・期間の割り方は lib/periods.js（Kyuallyと同一・突合テストで守る）。
 *   ・★支給額(円)は計算しない★。出すのは生の実績値(ctx)だけ。金額は Kyually の仕事(K4)。
 *   ・削除はソフト削除。保存の成否は必ず画面に出す。
 */
(function (global) {
  'use strict';

  var SD = null;
  var st = {
    ym: null,                 // 'YYYY-MM'
    shime: { method: 'monthly', n: 10, fromKyually: false },
    periodKey: null,          // 今見ている期間
    rows: [],                 // その月の台帳行
    agg: null,                // LedgerAgg.byPeriod の結果
    // その会社が使う欄。★既定は4つ全部★（絞り込みUIはまだ無いので、既定を絞ると
    //   日額で払う会社が「金額」を入れられなくなる＝台帳として片手落ちになる。実機で確認）
    fields: ['uriage', 'minutes', 'count', 'amount'],
    edit: null                // 編集中 {id?, employeeId, name}
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function yen(n) { return '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP'); }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
  function todayYmd() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function ymOf(ymd) { return String(ymd || '').slice(0, 7); }
  function addDays(ymd, n) {
    var y = +ymd.slice(0, 4), m = +ymd.slice(5, 7), d = +ymd.slice(8, 10);
    var dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.getUTCFullYear() + '-' + ('0' + (dt.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + dt.getUTCDate()).slice(-2);
  }
  // "1:30"/"90"/"1.5" → 分。空は0
  function hmToMin(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return 0;
    if (s.indexOf(':') >= 0) { var p = s.split(':'); return Math.max(0, num(p[0]) * 60 + num(p[1])); }
    return Math.max(0, Math.round(num(s)));
  }
  function minToHm(m) { m = Math.max(0, Math.round(num(m))); return m ? (Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2)) : ''; }
  function msg(id, t, err) { var e = $(id); if (!e) return; e.textContent = t || ''; e.className = 'msg' + (err ? ' err' : ''); }
  function fail(r) {
    var s = String((r && r.reason) || r || '');
    if (/no-user/.test(s)) return 'ログインし直してください';
    if (/not-found/.test(s)) return '見つかりませんでした（更新してください）';
    if (/Failed to fetch|NetworkError|network/i.test(s)) return 'ネットに繋がりませんでした';
    return s || '保存できませんでした';
  }

  /* ═══ 月の選択肢（今月から12か月ぶん遡る） ═══ */
  function fillYmOptions() {
    var sel = $('lg-ym'); if (!sel) return;
    var t = todayYmd(), y = +t.slice(0, 4), m = +t.slice(5, 7), out = [];
    for (var i = 0; i < 12; i++) {
      var yy = y, mm = m - i;
      while (mm <= 0) { mm += 12; yy -= 1; }
      var ym = yy + '-' + ('0' + mm).slice(-2);
      out.push('<option value="' + ym + '">' + yy + '年' + mm + '月</option>');
    }
    sel.innerHTML = out.join('');
    sel.value = st.ym || ymOf(t);
  }

  /* ═══ 読み込み ═══ */
  function load() {
    if (!SD) { msg('lg-msg', 'ログインしてください', true); return Promise.resolve(); }
    st.ym = $('lg-ym').value || ymOf(todayYmd());
    var P = global.Periods.buildPeriods(st.ym, st.shime.method, st.shime.n);
    if (!P.length) { msg('lg-msg', '月が正しくありません', true); return Promise.resolve(); }
    msg('lg-msg', '読み込み中...');
    return SD.ledger.list({ from: P[0].from, to: P[P.length - 1].to })
      .then(function (rows) {
        st.rows = rows || [];
        recompute();
        msg('lg-msg', '');
      })
      .catch(function (e) { $('lg-body').innerHTML = ''; msg('lg-msg', (e && e.message) || '読み込めませんでした', true); });
  }
  function recompute() {
    st.agg = global.LedgerAgg.byPeriod({
      ledgerRows: st.rows,
      employees: (global.Hub && global.Hub.state.employees) || [],
      ym: st.ym, method: st.shime.method, n: st.shime.n
    });
    if (!st.periodKey || !st.agg.byPeriod[st.periodKey]) {
      // 既定＝今日が入る期間。今日がその月でなければ最初の期間
      var k = global.Periods.periodKeyOf(todayYmd(), st.ym, st.shime.method, st.shime.n);
      st.periodKey = k || (st.agg.periods[0] && st.agg.periods[0].key);
    }
    renderShime(); renderTabs(); renderBody();
  }

  /* ═══ 描画 ═══ */
  function renderShime() {
    var m = { monthly: '月まとめ（分けない）', half: '半月（1〜15／16〜末）', ten: '10日締め（月3回）', ndays: st.shime.n + '日締め' }[st.shime.method] || '';
    $('lg-shime').innerHTML = '締め方：<b>' + esc(m) + '</b>'
      + (st.shime.fromKyually ? '<span class="lg-shime-s">（給料明細アプリの会社設定より）</span>'
                              : '<span class="lg-shime-s">（未設定のため月まとめ。給料明細アプリの会社設定で変えられます）</span>');
  }
  function renderTabs() {
    var host = $('lg-ptabs'); if (!host) return;
    if (!st.agg || st.agg.periods.length <= 1) { host.innerHTML = ''; return; }
    host.innerHTML = st.agg.periods.map(function (p) {
      return '<button class="ptab' + (p.key === st.periodKey ? ' active' : '') + '" type="button" data-pkey="' + p.key + '">' + esc(p.label) + '</button>';
    }).join('');
  }
  function renderBody() {
    var host = $('lg-body'); if (!host || !st.agg) return;
    var p = st.agg.byPeriod[st.periodKey];
    if (!p) { host.innerHTML = ''; return; }

    var emps = (global.Hub && global.Hub.state.employees) || [];
    if (!emps.length) {
      host.innerHTML = '<div class="empty"><div class="empty-ic">🙂</div>'
        + '<div class="empty-t">先に人を登録してください</div>'
        + '<div class="empty-s">給料明細アプリ（Kyually）で従業員を登録すると、ここに出ます。</div></div>';
      return;
    }

    var done = {};
    p.employees.forEach(function (e) { done[e.employeeId] = e; });
    var html = '<p class="lg-range">' + esc(p.period.from) + ' 〜 ' + esc(p.period.to) + '</p>';

    // 記録がある人を先に、その後まだ入れていない人
    html += emps.map(function (m) {
      var e = done[m.id];
      var biz = e ? e.businesses.join('・') : (m.business || '');
      var sum = e
        ? '<span class="lg-sum">' + (e.ctx.sales ? yen(e.ctx.sales) : '')
            + (e.ctx.count ? '<span class="lg-sep">／</span>' + e.ctx.count + '件' : '')
            + (e.ctx.workMin ? '<span class="lg-sep">／</span>' + esc(global.LedgerAgg.hm(e.ctx.workMin)) : '')
            + (e.ctx.commission ? '<span class="lg-sep">／</span>' + yen(e.ctx.commission) : '')
            + (e.hikazeiAmount ? '<span class="lg-sep">／</span>非課税' + yen(e.hikazeiAmount) : '')
            + '</span><span class="lg-rows">' + e.rowCount + '件の記録</span>'
        : '<span class="lg-none">まだ入れていません</span>';
      return '<div class="lg-card">'
        + '<div class="lg-card-h"><span class="lg-name">' + esc(m.name || '(名前未設定)') + '</span>'
        + (biz ? '<span class="pill pill-biz">' + esc(biz) + '</span>' : '') + '</div>'
        + '<div class="lg-card-b">' + sum + '</div>'
        + '<div class="acts">'
        + (e ? '<button class="b2" type="button" data-lg-list="' + esc(m.id) + '">中身を見る</button>' : '')
        + '<button class="b1" type="button" data-lg-add="' + esc(m.id) + '">＋ 入れる</button>'
        + '</div></div>';
    }).join('');

    // 期間の合計（実績値だけ・支給額は出さない）
    if (p.total.rows) {
      html += '<div class="lg-total">'
        + '<div class="lg-total-t">この期間の合計（' + p.total.people + '人・' + p.total.rows + '件）</div>'
        + '<div class="lg-total-b">'
        + (p.total.sales ? '<span>売上 ' + yen(p.total.sales) + '</span>' : '')
        + (p.total.count ? '<span>' + p.total.count + '件</span>' : '')
        + (p.total.workMin ? '<span>' + esc(global.LedgerAgg.hm(p.total.workMin)) + '</span>' : '')
        + (p.total.commission ? '<span>金額 ' + yen(p.total.commission) + '</span>' : '')
        + (p.total.hikazeiAmount ? '<span>非課税 ' + yen(p.total.hikazeiAmount) + '</span>' : '')
        + '</div>'
        + '<p class="lg-note">この数字をもとに、給料明細アプリが支給額を計算します。'
        + '<br>（金額の決め方は給料明細アプリ側の設定です）</p>'
        + '</div>';
    }
    if (st.agg.outOfRange) {
      html += '<p class="lg-note">※ この月の外の記録が ' + st.agg.outOfRange + ' 件あります（月を切り替えると見えます）。</p>';
    }
    host.innerHTML = html;
  }

  /* ═══ その人の中身（1日複数行が見える） ═══ */
  function showList(empId) {
    var p = st.agg && st.agg.byPeriod[st.periodKey];
    var e = p && p.employees.filter(function (x) { return x.employeeId === empId; })[0];
    if (!e) return;
    var byDay = {}, order = [];
    e.rows.forEach(function (r) { if (!byDay[r.ymd]) { byDay[r.ymd] = []; order.push(r.ymd); } byDay[r.ymd].push(r); });
    var html = order.map(function (d) {
      var list = byDay[d].map(function (r) {
        var v = r.data || {};
        var parts = [];
        if (num(v.uriage)) parts.push('売上 ' + yen(v.uriage));
        if (num(v.count)) parts.push(num(v.count) + '件');
        if (num(v.minutes)) parts.push(global.LedgerAgg.hm(v.minutes));
        if (num(v.amount)) parts.push((v.hikazei ? '非課税 ' : '') + yen(v.amount));
        if (v.business) parts.push(esc(v.business));
        return '<button class="row" type="button" data-lg-edit="' + esc(r.id) + '">'
          + '<span class="row-main"><span class="row-t">' + (parts.join(' ／ ') || '（空の記録）') + '</span>'
          + (v.memo ? '<span class="row-s">' + esc(v.memo) + '</span>' : '') + '</span><span class="row-ar">›</span></button>';
      }).join('');
      return '<div class="lg-day"><div class="lg-day-h">' + esc(d) + '（' + byDay[d].length + '件）</div>' + list + '</div>';
    }).join('');
    global.Hub._modal('' + e.name + ' の記録', html
      + '<div class="acts" style="margin-top:14px"><button class="b1" type="button" data-lg-add="' + esc(empId) + '">＋ もう1件</button></div>');
  }

  /* ═══ 1件の入力 ═══ */
  function openEntry(empId, rowId) {
    var emps = (global.Hub && global.Hub.state.employees) || [];
    var m = emps.filter(function (x) { return x.id === empId; })[0];
    var row = rowId ? st.rows.filter(function (r) { return r.id === rowId; })[0] : null;
    st.edit = { id: rowId || null, employeeId: empId, name: (m && m.name) || (row && '（未登録の人）') || '' };

    $('lge-title').textContent = (st.edit.name || '') + (rowId ? ' の記録を直す' : ' に入れる');
    var p = st.agg && st.agg.byPeriod[st.periodKey];
    $('lge-sub').textContent = p ? (p.period.label + '（' + p.period.from + ' 〜 ' + p.period.to + '）') : '';

    var d = (row && row.data) || {};
    var ymd = (row && row.ymd) || defaultYmd();
    $('lge-ymd').value = ymd;
    $('lge-ymd').min = p ? p.period.from : '';
    $('lge-ymd').max = p ? p.period.to : '';
    renderDayChips(ymd);
    renderBizChips((d.business) || (m && m.business) || '');

    $('lge-uriage').value = d.uriage != null ? String(d.uriage) : '';
    $('lge-hm').value = minToHm(d.minutes);
    $('lge-count').value = d.count != null ? String(d.count) : '';
    $('lge-amount').value = d.amount != null ? String(d.amount) : '';
    $('lge-hikazei').checked = !!d.hikazei;
    $('lge-memo').value = d.memo || '';
    applyFields();
    $('lge-del').style.display = rowId ? '' : 'none';
    $('lge-save').textContent = rowId ? '直す' : '入れる';
    msg('lge-msg', '');
    global.Hub.show('scr-lg-entry');
  }
  // 既定の日＝今日（その期間の中なら）。外なら期間の最終日
  function defaultYmd() {
    var p = st.agg && st.agg.byPeriod[st.periodKey]; var t = todayYmd();
    if (!p) return t;
    if (t >= p.period.from && t <= p.period.to) return t;
    return p.period.to;
  }
  function renderDayChips(sel) {
    var p = st.agg && st.agg.byPeriod[st.periodKey]; if (!p) return;
    var t = todayYmd(), y = addDays(t, -1), out = [];
    function chip(v, label) {
      if (v < p.period.from || v > p.period.to) return '';
      return '<button class="chip chip-btn' + (v === sel ? ' on' : '') + '" type="button" data-lg-day="' + v + '">' + label + '</button>';
    }
    out.push(chip(t, '今日'));
    out.push(chip(y, 'きのう'));
    $('lge-day-chips').innerHTML = out.filter(Boolean).join('');
  }
  function renderBizChips(sel) {
    var list = (global.Hub && global.Hub.state.businesses) || [];
    var wrap = $('lge-biz-wrap');
    if (!list.length) { wrap.style.display = 'none'; $('lge-biz-chips').innerHTML = ''; return; }
    wrap.style.display = '';
    $('lge-biz-chips').innerHTML = list.map(function (b) {
      return '<button class="chip chip-btn' + (b === sel ? ' on' : '') + '" type="button" data-lg-biz="' + esc(b) + '">' + esc(b) + '</button>';
    }).join('') + '<button class="chip chip-btn' + (!sel ? ' on' : '') + '" type="button" data-lg-biz="">指定しない</button>';
  }
  // その会社が使う欄だけ出す（項目を増やしすぎない）
  function applyFields() {
    var f = st.fields || [];
    [['uriage', 'lge-f-uriage'], ['minutes', 'lge-f-minutes'], ['count', 'lge-f-count'], ['amount', 'lge-f-amount']]
      .forEach(function (x) { var el = $(x[1]); if (el) el.style.display = (f.indexOf(x[0]) >= 0) ? '' : 'none'; });
  }

  function saveEntry() {
    if (!SD) { msg('lge-msg', 'ログインしてください', true); return Promise.resolve(); }
    var e = st.edit; if (!e) return Promise.resolve();
    var ymd = $('lge-ymd').value;
    if (!ymd) { msg('lge-msg', '日を選んでください', true); return Promise.resolve(); }
    var p = st.agg && st.agg.byPeriod[st.periodKey];
    if (p && (ymd < p.period.from || ymd > p.period.to)) {
      msg('lge-msg', 'この期間（' + p.period.from + '〜' + p.period.to + '）の日を選んでください', true); return Promise.resolve();
    }
    var biz = $('lge-biz-chips').querySelector('.chip-btn.on');
    var data = {};
    if (num($('lge-uriage').value)) data.uriage = num($('lge-uriage').value);
    var mins = hmToMin($('lge-hm').value); if (mins) data.minutes = mins;
    if (num($('lge-count').value)) data.count = num($('lge-count').value);
    if (num($('lge-amount').value)) { data.amount = num($('lge-amount').value); if ($('lge-hikazei').checked) data.hikazei = true; }
    // ★実績値が1つも無い記録は作らせない。
    //   事業チップは開いた時点で既定が選ばれているので、business/memo だけで「入れた」ことにすると
    //   売上も時間も件数も無い空の記録が積もる(集計の件数だけ増えて中身が無い)。
    var hasValue = ['uriage', 'minutes', 'count', 'amount'].some(function (k) { return data[k]; });
    if (!hasValue) { msg('lge-msg', '売上・時間・件数・金額のどれか1つは入れてください', true); return Promise.resolve(); }

    if (biz && biz.getAttribute('data-lg-biz')) data.business = biz.getAttribute('data-lg-biz');
    if ($('lge-memo').value.trim()) data.memo = $('lge-memo').value.trim();

    msg('lge-msg', '保存中...');
    return SD.ledger.upsert({ id: e.id || undefined, employeeId: e.employeeId, ymd: ymd, data: data })
      .then(function (r) {
        if (!(r && r.ok)) { msg('lge-msg', fail(r), true); return; }
        return load().then(function () {
          global.Hub._toast(e.id ? '直しました' : '入れました');
          if (e.id) { global.Hub.show('scr-ledger'); return; }
          // 続けてもう1件（同じ人・同じ日）＝1日に何本も入れる現場のため
          openEntry(e.employeeId, null);
          $('lge-ymd').value = ymd; renderDayChips(ymd);
          msg('lge-msg', '入れました。続けてもう1件どうぞ');
        });
      })
      .catch(function (err) { msg('lge-msg', fail(err && err.message), true); });
  }
  function delEntry() {
    if (!SD || !st.edit || !st.edit.id) return Promise.resolve();
    if (!global.confirm('この記録を削除しますか？\n（一覧から消えますが、記録そのものは残ります）')) return Promise.resolve();
    msg('lge-msg', '削除中...');
    return SD.ledger.remove(st.edit.id).then(function (r) {
      if (!(r && r.ok)) { msg('lge-msg', fail(r), true); return; }
      return load().then(function () { global.Hub._toast('削除しました'); global.Hub.show('scr-ledger'); });
    }).catch(function (err) { msg('lge-msg', fail(err && err.message), true); });
  }

  /* ═══ 配線 ═══ */
  function bind() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      var pk = t.closest && t.closest('[data-pkey]');
      if (pk) { st.periodKey = pk.getAttribute('data-pkey'); renderTabs(); renderBody(); return; }
      var add = t.closest && t.closest('[data-lg-add]');
      if (add) { global.Hub._modalClose(); openEntry(add.getAttribute('data-lg-add'), null); return; }
      var lst = t.closest && t.closest('[data-lg-list]');
      if (lst) { showList(lst.getAttribute('data-lg-list')); return; }
      var ed = t.closest && t.closest('[data-lg-edit]');
      if (ed) {
        var id = ed.getAttribute('data-lg-edit');
        var row = st.rows.filter(function (r) { return r.id === id; })[0];
        global.Hub._modalClose();
        if (row) openEntry(row.employeeId, id);
        return;
      }
      var dc = t.closest && t.closest('[data-lg-day]');
      if (dc) { var v = dc.getAttribute('data-lg-day'); $('lge-ymd').value = v; renderDayChips(v); return; }
      var bc = t.closest && t.closest('[data-lg-biz]');
      if (bc) {
        var chips = $('lge-biz-chips').querySelectorAll('.chip-btn');
        Array.prototype.forEach.call(chips, function (c) { c.classList.toggle('on', c === bc); });
        return;
      }
      var hmb = t.closest && t.closest('[data-hm]');
      if (hmb) {
        var add2 = +hmb.getAttribute('data-hm');
        $('lge-hm').value = add2 ? minToHm(hmToMin($('lge-hm').value) + add2) : '';
        return;
      }
    });

    $('lg-ym').addEventListener('change', function () { st.periodKey = null; load(); });
    $('lg-reload').addEventListener('click', load);
    $('lge-save').addEventListener('click', saveEntry);
    $('lge-del').addEventListener('click', delEntry);
    $('lge-cancel').addEventListener('click', function () { global.Hub.show('scr-ledger'); });
    $('lge-cnt-minus').addEventListener('click', function () { $('lge-count').value = String(Math.max(0, num($('lge-count').value) - 1)); });
    $('lge-cnt-plus').addEventListener('click', function () { $('lge-count').value = String(num($('lge-count').value) + 1); });
  }

  /* ═══ 起動 ═══ */
  function init() { fillYmOptions(); bind(); }
  // ログイン後に Hub から呼ばれる
  function attach(sd) {
    SD = sd;
    if (!SD) return Promise.resolve();
    return SD.company.getShime()
      .then(function (s) { st.shime = s; })
      .catch(function () { st.shime = { method: 'monthly', n: 10, fromKyually: false }; })
      .then(function () { return SD.org.get(); })
      .then(function (o) { if (o && Array.isArray(o.ledgerFields) && o.ledgerFields.length) st.fields = o.ledgerFields; })
      .catch(function () {})
      .then(function () { return load(); });
  }

  var Ledger = {
    init: init, attach: attach, load: load, state: st,
    openEntry: openEntry, showList: showList, recompute: recompute,
    _hmToMin: hmToMin, _minToHm: minToHm
  };
  global.Ledger = Ledger;
  if (global.__EXALLY_TEST) global.__EXALLY_TEST.Ledger = Ledger;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window);
