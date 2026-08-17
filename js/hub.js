/* hub.js — Exally スイートの器(E1): 画面制御と描画
 * 契約 = docs/SPEC_E1_hub.md
 *   ハブ(タイル4つ) / 共有データ(会社・人・取引先) / 集計(事業別)
 * データは js/suite-data.js(E0)経由。計算は lib/aggregate.js(純関数)。
 *
 * ★守る事★
 *   ・人は「雇用形態」と「事業」だけ書く(E0のallowlist)。給与項目は表示もしない。
 *   ・人の追加/削除はしない(従業員マスタの源は給料明細アプリ側)。
 *   ・準備中の物は準備中と出す。中身の無い画面や偽の数字を出さない。
 *   ・保存の成否は必ず画面に出す(失敗を握り潰さない)。
 */
(function (global) {
  'use strict';

  var SD = null;                       // SuiteData インスタンス(ログイン後に入る)
  var state = {
    org: null,                         // pay_org の data
    businesses: [],                    // 事業の一覧
    employees: [],                     // 従業員(読み)
    partners: [],
    editEmpId: null,
    editPtId: null,
    aggKind: 'thisMonth',
    today: null                        // 'YYYY-MM-DD'(起動時に決める＝純関数には毎回渡す)
  };

  function $(id) { return document.getElementById(id); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function yen(n) { return '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP'); }
  function todayYmd() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function msg(id, text, isErr) {
    var el = $(id); if (!el) return;
    el.textContent = text || '';
    el.className = 'msg' + (isErr ? ' err' : '');
  }
  var _toastT = null;
  function toast(text) {
    var el = $('toast'); if (!el) return;
    el.textContent = text; el.classList.add('on');
    if (_toastT) clearTimeout(_toastT);
    _toastT = setTimeout(function () { el.classList.remove('on'); }, 3600);
  }
  // 保存失敗の理由を、そのまま英語で出さずに一言で伝える
  function jpFail(reason) {
    var s = String(reason || '');
    if (/no-user/.test(s)) return 'ログインし直してください';
    if (/not-found/.test(s)) return '対象が見つかりませんでした（画面を更新してください）';
    if (/Failed to fetch|NetworkError|network/i.test(s)) return 'ネットに繋がりませんでした';
    return s || '保存できませんでした';
  }

  /* ═══ 画面切替 ═══ */
  function show(id) {
    $$('.scr').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    $$('.bn-i').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-go') === id); });
    if (id === 'scr-agg') { renderAgg(); renderCross(); }
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function showTab(tab) {
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === tab); });
    $$('.pane').forEach(function (p) { p.classList.toggle('active', p.id === 'pane-' + tab); });
  }

  /* ═══ 会社(pay_org) ═══ */
  function fillOrg() {
    var o = state.org || {};
    $('org-yago').value = o.yago || '';
    $('org-addr').value = o.addr || '';
    $('org-tel').value = o.tel || '';
    $('org-invoice').value = o.invoiceNo || '';
    renderBizChips();
  }
  function renderBizChips() {
    var host = $('org-biz-chips'); if (!host) return;
    if (!state.businesses.length) {
      host.innerHTML = '<span class="note" style="margin:0">まだありません。下から追加してください。</span>';
      return;
    }
    host.innerHTML = state.businesses.map(function (b, i) {
      return '<span class="chip">' + esc(b) + '<button class="chip-x" type="button" data-biz-del="' + i + '" aria-label="' + esc(b) + ' を削除">×</button></span>';
    }).join('');
  }
  function saveOrg() {
    if (!SD) { msg('org-msg', 'ログインしてください', true); return Promise.resolve(); }
    // ★businesses はここでは送らない(事業の追加/削除が専用に保存する)。
    //   会社情報の保存で事業一覧まで上書きすると、別タブでの事業追加を巻き戻す。
    var patch = {
      yago: $('org-yago').value.trim(),
      addr: $('org-addr').value.trim(),
      tel: $('org-tel').value.trim(),
      invoiceNo: $('org-invoice').value.trim()
    };
    msg('org-msg', '保存中...');
    return SD.org.save(patch).then(function (r) {
      if (r && r.ok) { state.org = r.data; msg('org-msg', '保存しました'); }
      else msg('org-msg', jpFail(r && r.reason), true);
    }).catch(function (e) { msg('org-msg', jpFail(e && e.message), true); });
  }
  function addBiz() {
    var v = $('org-biz-new').value.trim();
    if (!v) { msg('org-biz-msg', '事業の名前を入れてください', true); return Promise.resolve(); }
    if (state.businesses.indexOf(v) >= 0) { msg('org-biz-msg', 'もうあります', true); return Promise.resolve(); }
    state.businesses.push(v);
    $('org-biz-new').value = '';
    renderBizChips(); fillEmpBizOptions();
    msg('org-biz-msg', '保存中...');
    return saveOrgBusinesses();
  }
  function delBiz(i) {
    state.businesses.splice(i, 1);
    renderBizChips(); fillEmpBizOptions();
    return saveOrgBusinesses();
  }
  function saveOrgBusinesses() {
    if (!SD) { msg('org-biz-msg', 'ログインしてください', true); return Promise.resolve(); }
    return SD.org.save({ businesses: state.businesses.slice() }).then(function (r) {
      if (r && r.ok) { state.org = r.data; msg('org-biz-msg', '保存しました'); }
      else msg('org-biz-msg', jpFail(r && r.reason), true);
    }).catch(function (e) { msg('org-biz-msg', jpFail(e && e.message), true); });
  }

  /* ═══ 人(pay_employees・読み中心) ═══ */
  function renderEmps() {
    var host = $('emp-rows'); if (!host) return;
    if (!state.employees.length) {
      host.innerHTML = '<div class="empty"><div class="empty-ic">🙂</div>'
        + '<div class="empty-t">まだ人が登録されていません</div>'
        + '<div class="empty-s">給料明細アプリ（Kyually）で従業員を登録すると、ここに出ます。</div></div>';
      return;
    }
    host.innerHTML = state.employees.map(function (e) {
      var isOut = e.employmentType === '業務委託';
      return '<button class="row" type="button" data-emp="' + esc(e.id) + '">'
        + '<span class="row-main"><span class="row-t">' + esc(e.name || '(名前未設定)') + '</span>'
        + '<span class="row-s">'
        + '<span class="pill ' + (isOut ? 'pill-out' : 'pill-emp') + '">' + esc(e.employmentType) + '</span>'
        + (e.business ? '<span class="pill pill-biz">' + esc(e.business) + '</span>' : '<span style="color:#B7CFC3">事業なし</span>')
        + '</span></span><span class="row-ar">›</span></button>';
    }).join('');
  }
  function fillEmpBizOptions() {
    var sel = $('emp-biz'); if (!sel) return;
    var cur = sel.value;
    var opts = ['<option value="">（未設定）</option>'].concat(state.businesses.map(function (b) {
      return '<option value="' + esc(b) + '">' + esc(b) + '</option>';
    }));
    sel.innerHTML = opts.join('');
    if (cur) sel.value = cur;
  }
  function openEmp(id) {
    var e = state.employees.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    state.editEmpId = id;
    $('emp-edit-name').textContent = e.name || '(名前未設定)';
    fillEmpBizOptions();
    $('emp-type').value = e.employmentType || '従業員';
    // 事業一覧に無い値でも消えないよう、その値を足してから選ぶ
    if (e.business && state.businesses.indexOf(e.business) < 0) {
      $('emp-biz').insertAdjacentHTML('beforeend', '<option value="' + esc(e.business) + '">' + esc(e.business) + '（一覧に無い）</option>');
    }
    $('emp-biz').value = e.business || '';
    $('emp-edit').style.display = '';
    msg('emp-edit-msg', '');
  }
  function closeEmp() { state.editEmpId = null; $('emp-edit').style.display = 'none'; }
  function saveEmp() {
    if (!SD) { msg('emp-edit-msg', 'ログインしてください', true); return Promise.resolve(); }
    var id = state.editEmpId; if (!id) return Promise.resolve();
    var patch = { employmentType: $('emp-type').value, business: $('emp-biz').value };
    msg('emp-edit-msg', '保存中...');
    return SD.employees.patch(id, patch).then(function (r) {
      if (r && r.ok) {
        var e = state.employees.filter(function (x) { return x.id === id; })[0];
        if (e) { e.employmentType = patch.employmentType; e.business = patch.business; }
        renderEmps(); closeEmp(); toast('保存しました');
      } else msg('emp-edit-msg', jpFail(r && r.reason), true);
    }).catch(function (e) { msg('emp-edit-msg', jpFail(e && e.message), true); });
  }

  /* ═══ 取引先(pay_partners) ═══ */
  function renderPts() {
    var host = $('pt-rows'); if (!host) return;
    if (!state.partners.length) {
      host.innerHTML = '<div class="empty"><div class="empty-ic">🗂</div>'
        + '<div class="empty-t">まだ取引先がありません</div>'
        + '<div class="empty-s">下の「＋ 取引先を追加」から入れられます。</div></div>';
      return;
    }
    host.innerHTML = state.partners.map(function (p) {
      var d = p.data || {};
      return '<button class="row" type="button" data-pt="' + esc(p.id) + '">'
        + '<span class="row-main"><span class="row-t">' + esc(d.name || '(名称未設定)') + '</span>'
        + '<span class="row-s">' + esc(d.addr || '住所なし') + '</span></span>'
        + '<span class="row-ar">›</span></button>';
    }).join('');
  }
  function openPt(id) {
    var p = id ? state.partners.filter(function (x) { return x.id === id; })[0] : null;
    var d = (p && p.data) || {};
    state.editPtId = id || null;
    $('pt-edit-t').textContent = id ? '取引先を直す' : '取引先を追加';
    $('pt-name').value = d.name || '';
    $('pt-keisho').value = d.keisho || '御中';
    $('pt-addr').value = d.addr || '';
    $('pt-invoice').value = d.invoiceNo || '';
    $('pt-del').style.display = id ? '' : 'none';
    $('pt-edit').style.display = '';
    msg('pt-edit-msg', '');
  }
  function closePt() { state.editPtId = null; $('pt-edit').style.display = 'none'; }
  function savePt() {
    if (!SD) { msg('pt-edit-msg', 'ログインしてください', true); return Promise.resolve(); }
    var name = $('pt-name').value.trim();
    if (!name) { msg('pt-edit-msg', '名称を入れてください', true); return Promise.resolve(); }
    var data = { name: name, keisho: $('pt-keisho').value, addr: $('pt-addr').value.trim(), invoiceNo: $('pt-invoice').value.trim() };
    msg('pt-edit-msg', '保存中...');
    return SD.partners.upsert({ id: state.editPtId || undefined, data: data }).then(function (r) {
      if (r && r.ok) { closePt(); toast('保存しました'); return loadPartners(); }
      msg('pt-edit-msg', jpFail(r && r.reason), true);
    }).catch(function (e) { msg('pt-edit-msg', jpFail(e && e.message), true); });
  }
  function delPt() {
    if (!SD || !state.editPtId) return Promise.resolve();
    var p = state.partners.filter(function (x) { return x.id === state.editPtId; })[0];
    var nm = (p && p.data && p.data.name) || 'この取引先';
    if (!global.confirm(nm + ' を削除しますか？\n（一覧から消えますが、記録は残ります）')) return Promise.resolve();
    msg('pt-edit-msg', '削除中...');
    return SD.partners.remove(state.editPtId).then(function (r) {
      if (r && r.ok) { closePt(); toast('削除しました'); return loadPartners(); }
      msg('pt-edit-msg', jpFail(r && r.reason), true);
    }).catch(function (e) { msg('pt-edit-msg', jpFail(e && e.message), true); });
  }

  /* ═══ 集計 ═══ */
  function currentRange() {
    var kind = state.aggKind;
    if (kind === 'custom') {
      return { from: $('agg-from').value, to: $('agg-to').value };
    }
    return global.Aggregate.periodOf(kind, state.today || todayYmd());
  }
  function renderAggRange(r) {
    $('agg-range').textContent = (r.from && r.to) ? (r.from + ' 〜 ' + r.to) : '期間を選んでください';
  }
  function renderAgg() {
    var body = $('agg-body'); if (!body) return;
    var r;
    try { r = currentRange(); } catch (e) { renderAggRange({}); body.innerHTML = ''; msg('agg-msg', '期間が正しくありません', true); return; }
    renderAggRange(r);
    if (!r.from || !r.to) { body.innerHTML = ''; msg('agg-msg', '開始日と終了日を入れてください', true); return; }
    if (r.from > r.to) { body.innerHTML = ''; msg('agg-msg', '終了日が開始日より前になっています', true); return; }
    if (!SD) { body.innerHTML = ''; msg('agg-msg', 'ログインしてください', true); return; }

    msg('agg-msg', '読み込み中...');
    SD.ledger.list({ from: r.from, to: r.to }).then(function (rows) {
      msg('agg-msg', '');
      paintAgg(global.Aggregate.byBusiness({ ledgerRows: rows, employees: state.employees }));
    }).catch(function (e) {
      body.innerHTML = '';
      // 件数上限で切れた時は「合計を出さずに」期間を短くと出す(嘘の合計を出さない)
      msg('agg-msg', (e && e.message) || '読み込めませんでした', true);
    });
  }
  function paintAgg(a) {
    var body = $('agg-body');
    if (a.empty) {
      body.innerHTML = '<div class="empty"><div class="empty-ic">📒</div>'
        + '<div class="empty-t">この期間の記録はまだありません</div>'
        + '<div class="empty-s">日次台帳は準備中です。<br>使えるようになったら、ここに事業ごとの合計が出ます。</div></div>';
      return;
    }
    var unit = a.basis === 'amount' ? '金額' : '売上';
    var html = '<div class="agg-head"><span>事業</span><span class="agg-n">件数</span><span class="agg-n">' + unit + '</span></div>';
    a.rows.forEach(function (b) {
      var v = a.basis ? b[a.basis] : 0;
      html += '<div class="agg-row">'
        + '<span class="agg-b">' + esc(b.business) + (a.basis ? ' <span class="agg-pct">' + b.pct + '%</span>' : '') + '</span>'
        + '<span class="agg-n">' + b.count + '</span>'
        + '<span class="agg-m">' + (a.basis ? yen(v) : '—') + '</span>'
        + (a.basis ? '<span class="agg-bar"><i style="width:' + (b.bar * 100).toFixed(1) + '%"></i></span>' : '')
        + '</div>';
    });
    var tv = a.basis ? a.total[a.basis] : 0;
    html += '<div class="agg-total"><span>合計</span><span class="agg-n">' + a.total.count + '</span>'
      + '<span class="agg-m">' + (a.basis ? yen(tv) : '—') + '</span></div>';
    if (!a.basis) html += '<p class="note" style="margin-top:12px">金額の記録がないため、件数だけ出しています。</p>';
    body.innerHTML = html;
  }

  /* ═══ E5 横断集計(事業のまとめ・月をまたいで見る) ═══ */
  //  E1の集計は「1つの期間の事業別」。ここは「月をまたいだ推移」と「動いていない事業」を見せる。
  //  ★支給額(円)は出さない(E2と同じ。決め方はKyuallyのpay-rule.jsが唯一の源)
  function crossSpan() {
    var n = parseInt(($('x-span') && $('x-span').value) || '3', 10);
    var t = state.today || todayYmd();
    var y = +t.slice(0, 4), m = +t.slice(5, 7);
    var to = global.Aggregate.periodOf('thisMonth', t).to;      // 今月末
    var sm = m - (n - 1), sy = y;
    while (sm <= 0) { sm += 12; sy -= 1; }
    return { from: sy + '-' + ('0' + sm).slice(-2) + '-01', to: to };
  }
  function renderCross() {
    var body = $('x-body'); if (!body) return;
    if (!SD) { body.innerHTML = ''; msg('x-msg', 'ログインしてください', true); return; }
    var sp = crossSpan();
    $('x-range').textContent = sp.from + ' 〜 ' + sp.to;
    msg('x-msg', '読み込み中...');
    SD.ledger.list({ from: sp.from, to: sp.to }).then(function (rows) {
      msg('x-msg', '');
      paintCross(global.CrossAgg.crossByBusiness({
        businesses: state.businesses, employees: state.employees,
        ledgerRows: rows, from: sp.from, to: sp.to
      }));
    }).catch(function (e) {
      body.innerHTML = '';
      msg('x-msg', (e && e.message) || '読み込めませんでした', true);   // 件数上限で切れた時も合計を出さない
    });
  }
  function paintCross(x) {
    var body = $('x-body');
    if (!x.rows.length) {
      body.innerHTML = '<div class="empty"><div class="empty-ic">🗂</div>'
        + '<div class="empty-t">まだ事業がありません</div>'
        + '<div class="empty-s">「共有データ ▸ 会社」で事業を足すと、ここに事業ごとのまとめが出ます。</div></div>';
      return;
    }
    var moLabel = x.months.map(function (m) { return m.slice(5) + '月'; });
    var maxMo = 0;
    x.rows.forEach(function (b) { x.months.forEach(function (m) { if (b.byMonth[m] > maxMo) maxMo = b.byMonth[m]; }); });

    var html = x.rows.map(function (b) {
      var v = x.basis === 'amount' ? b.amount : b.sales;
      var zero = b.rows === 0;
      return '<div class="x-row' + (zero ? ' x-zero' : '') + '">'
        + '<div class="x-h"><span class="x-b">' + esc(b.business) + '</span>'
        + (x.basis && !zero ? '<span class="x-pct">' + b.pct + '%</span>' : '')
        + (zero ? '<span class="x-zero-tag">記録なし</span>' : '')
        + '<span class="x-m">' + (x.basis ? yen(v) : b.rows + '件') + '</span></div>'
        + (x.basis ? '<div class="x-bar"><i style="width:' + (b.bar * 100).toFixed(1) + '%"></i></div>' : '')
        + '<div class="x-months">' + x.months.map(function (m, i) {
            var h = maxMo > 0 ? Math.round((b.byMonth[m] / maxMo) * 28) : 0;
            return '<span class="x-mo" title="' + m + ' ' + yen(b.byMonth[m]) + '">'
              + '<i style="height:' + h + 'px"></i><span>' + esc(moLabel[i]) + '</span></span>';
          }).join('') + '</div>'
        + '</div>';
    }).join('');

    html += '<div class="x-total"><span>合計</span><span class="x-m">'
      + (x.basis ? yen(x.basis === 'amount' ? x.total.amount : x.total.sales) : x.total.rows + '件') + '</span></div>';
    if (!x.basis) html += '<p class="note" style="margin-top:10px">金額の記録がないため、件数だけ出しています。</p>';
    if (x.empty) html += '<p class="note" style="margin-top:10px">この期間の記録はまだありません（事業は登録済みのものを並べています）。</p>';
    body.innerHTML = html;
  }

  /* ═══ 読み込み ═══ */
  function loadPartners() {
    if (!SD) return Promise.resolve();
    return SD.partners.list().then(function (list) { state.partners = list || []; renderPts(); })
      .catch(function (e) { msg('pt-msg', jpFail(e && e.message), true); });
  }
  function loadAll() {
    if (!SD) return Promise.resolve();
    return Promise.all([
      SD.org.get().then(function (o) {
        state.org = o;
        state.businesses = (o && Array.isArray(o.businesses)) ? o.businesses.slice() : [];
        fillOrg();
      }).catch(function (e) { msg('org-msg', jpFail(e && e.message), true); }),
      SD.employees.list().then(function (list) { state.employees = list || []; renderEmps(); fillEmpBizOptions(); })
        .catch(function (e) { msg('emp-msg', jpFail(e && e.message), true); }),
      loadPartners()
    ]);
  }

  /* ═══ 配線 ═══ */
  function bind() {
    // 画面移動(タイル・下部タブ)
    document.addEventListener('click', function (ev) {
      var go = ev.target.closest('[data-go]');
      if (go) { show(go.getAttribute('data-go')); return; }

      var tab = ev.target.closest('[data-tab]');
      if (tab) { showTab(tab.getAttribute('data-tab')); return; }

      var bd = ev.target.closest('[data-biz-del]');
      if (bd) { delBiz(+bd.getAttribute('data-biz-del')); return; }

      var er = ev.target.closest('[data-emp]');
      if (er) { openEmp(er.getAttribute('data-emp')); return; }

      var pr = ev.target.closest('[data-pt]');
      if (pr) { openPt(pr.getAttribute('data-pt')); return; }
    });

    $('mo-x').addEventListener('click', modalClose);
    $('mo').addEventListener('click', function (ev) { if (ev.target === $('mo')) modalClose(); }); // 外側タップで閉じる

    $('org-save').addEventListener('click', saveOrg);
    $('org-biz-add').addEventListener('click', addBiz);
    $('org-biz-new').addEventListener('keydown', function (e) { if (e.key === 'Enter') addBiz(); });

    $('emp-save').addEventListener('click', saveEmp);
    $('emp-cancel').addEventListener('click', closeEmp);

    $('pt-add').addEventListener('click', function () { openPt(null); });
    $('pt-save').addEventListener('click', savePt);
    $('pt-cancel').addEventListener('click', closePt);
    $('pt-del').addEventListener('click', delPt);

    $('agg-kind').addEventListener('change', function () {
      state.aggKind = $('agg-kind').value;
      $('agg-custom').classList.toggle('on', state.aggKind === 'custom');
      if (state.aggKind !== 'custom') renderAgg();
    });
    $('agg-reload').addEventListener('click', renderAgg);
    $('x-reload').addEventListener('click', renderCross);
    $('x-span').addEventListener('change', renderCross);
  }

  /* ═══ 起動 ═══ */
  function init() {
    // ★state.today は入れない＝毎回その時の日付を使う(アプリを開きっぱなしで日が変わっても「今月」がズレない)。
    //   テストだけ state.today に固定値を入れて時刻依存を外す。
    // 期間指定の初期値=今月(空欄のまま押されないように)
    var p = global.Aggregate.periodOf('thisMonth', todayYmd());
    if ($('agg-from')) { $('agg-from').value = p.from; $('agg-to').value = p.to; }
    bind();
    renderEmps(); renderPts(); renderBizChips();
  }

  // auth.js がログイン成功後に呼ぶ。従業員を読んでから台帳(E2)を起こす（台帳は人の一覧を使うため順番が要る）
  function attach(client) {
    SD = global.SuiteData ? global.SuiteData.create({ client: client }) : null;
    return loadAll()
      .then(function () { return (global.Ledger && global.Ledger.attach) ? global.Ledger.attach(SD) : null; })
      .catch(function () { /* 台帳が起きなくてもハブ自体は使える */ })
      .then(function () { return SD; });
  }

  /* ═══ モーダル（その人の記録の一覧など） ═══ */
  function modal(title, html) {
    var mo = $('mo'); if (!mo) return;
    $('mo-t').textContent = title || '';
    $('mo-b').innerHTML = html || '';
    mo.classList.add('on');
  }
  function modalClose() { var mo = $('mo'); if (mo) mo.classList.remove('on'); }

  var Hub = {
    init: init, attach: attach, show: show, showTab: showTab,
    loadAll: loadAll, renderAgg: renderAgg, paintAgg: paintAgg,
    renderCross: renderCross, paintCross: paintCross, crossSpan: crossSpan,
    state: state,
    _setSuiteData: function (sd) { SD = sd; },     // テスト用の差し込み口
    _toast: toast, _jpFail: jpFail,
    _modal: modal, _modalClose: modalClose
  };
  global.Hub = Hub;
  global.__EXALLY_TEST = Hub;                       // ★UIテスト(jsdom/実機)から中を見る

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window);
