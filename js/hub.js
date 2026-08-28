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
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function showTab(tab) {
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === tab); });
    $$('.pane').forEach(function (p) { p.classList.toggle('active', p.id === 'pane-' + tab); });
  }

  /* ★登録番号は当てない。打ち間違いだけ弾く（通信なし）★（指示役 2026-08-18）
     判定は lib/toroku-no.js が持ち主。★同じ判定を2か所に書かない★ */
  var TOROKU = global.TorokuNo;
  function torokuNote(inputId, noteId, base) {
    var el = $(inputId), n = $(noteId); if (!el || !n) return { ok: true, no: '' };
    var chk = TOROKU.check(el.value);
    n.textContent = (chk.level === 'empty') ? base : (chk.msg + '　' + base);
    n.style.color = chk.ok ? '' : '#B3261E';
    return chk;
  }
  var ORG_NOTE = '請求書の紙に そのまま刷られます。';
  var PT_NOTE = '相手の番号です。請求書の紙には出ません（控えです）。';

  /* ═══ 会社(pay_org) ═══ */
  function fillOrg() {
    var o = state.org || {};
    $('org-yago').value = o.yago || '';
    $('org-addr').value = o.addr || '';
    $('org-tel').value = o.tel || '';
    $('org-invoice').value = o.invoiceNo || '';
    torokuNote('org-invoice', 'org-invoice-note', ORG_NOTE);
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
      invoiceNo: TOROKU.check($('org-invoice').value).no
    };
    /* ★形が違う時だけ止める★（検査用数字の違いは 個人の事業者では効かないので注意に留める） */
    var chk = torokuNote('org-invoice', 'org-invoice-note', ORG_NOTE);
    if (!chk.ok) { msg('org-msg', chk.msg, true); return Promise.resolve(); }
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
  /* ★どこで登録するかは 入口のタイルの字から取る★（この配信に無い物の名前を書かない） */
  function whereToAdd() {
    var t = document.querySelector('#tile-payslip .tile-t');
    var s = t ? (t.textContent || '').trim() : '';
    return s ? s + 'で' : '';
  }
  function renderEmps() {
    var host = $('emp-rows'); if (!host) return;
    if (!state.employees.length) {
      host.innerHTML = '<div class="empty"><div class="empty-ic">🙂</div>'
        + '<div class="empty-t">まだ人が登録されていません</div>'
        /* ★この配信に在る物だけ 名前を出す★（2026-08-26 本番で実測して見つけた）
           本番(rakually)には給与が無い＝「給与で登録すると」は ★行けない所への案内★。
           ⇒ ★名前を ここに書かない★。入口のタイルの字を そのまま使う
              （if で切り替えるだけだと 使わない方の名前が この中に残る）。 */
        + '<div class="empty-s">' + whereToAdd() + '従業員を登録すると、ここに出ます。</div></div>';
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
    torokuNote('pt-invoice', 'pt-invoice-note', PT_NOTE);
    $('pt-del').style.display = id ? '' : 'none';
    $('pt-edit').style.display = '';
    msg('pt-edit-msg', '');
  }
  function closePt() { state.editPtId = null; $('pt-edit').style.display = 'none'; }
  function savePt() {
    if (!SD) { msg('pt-edit-msg', 'ログインしてください', true); return Promise.resolve(); }
    var name = $('pt-name').value.trim();
    if (!name) { msg('pt-edit-msg', '名称を入れてください', true); return Promise.resolve(); }
    var data = { name: name, keisho: $('pt-keisho').value, addr: $('pt-addr').value.trim(), invoiceNo: TOROKU.check($('pt-invoice').value).no };
    var chk = torokuNote('pt-invoice', 'pt-invoice-note', PT_NOTE);
    if (!chk.ok) { msg('pt-edit-msg', chk.msg, true); return Promise.resolve(); }
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

  /* ★2026-08-18 集計(E5)と日次台帳(E2)は この入口から外した★（司さん「ささっと Exally から切り離せ」）
     ・どちらも Exally の物。Rakunally の入口が出す物は ★給与／請求書／共有データ★ の3つ。
     ・外したのは renderAgg / paintAgg / renderCross / paintCross と その繋ぎ（121行）。
     ・戻す条件＝Rakunally に台帳/集計を置くと決めた日（git に残っている）。 */

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
    /* ★打っている その場で 形を見せる★（保存を押すまで黙っていない） */
    $('org-invoice').addEventListener('input', function () { torokuNote('org-invoice', 'org-invoice-note', ORG_NOTE); });
    $('pt-invoice').addEventListener('input', function () { torokuNote('pt-invoice', 'pt-invoice-note', PT_NOTE); });

  }

  /* ═══ 起動 ═══ */
  /* ═══ ★会社の設定（第3の場所）★（司さん 2026-08-28）═══════════════════════
     ★決めた事★
       会社の情報（屋号・住所・電話・インボイス番号・事業）は
       ★給与でも 請求書でもない ここ★ が持ち主。★2か所で別々に持たない★。
     ★なぜ 新しい画面を作らなかったか★
       ここに ★もう在る★（共有データ ▸ 会社）。★同じ物を3枚目として作らない★
       （作る前に skill find-existing を回す決まり）。足したのは ★行き方と 帰り道★だけ。
     ★行き方★ index.html#kaisha … 開いた時に 共有データ▸会社 を出す
       戻り先つき … #kaisha?back=seikyu ／ #kaisha?back=kyuyo
     ★帰り道★ 上に「← 請求書へ戻る」を出す（★飛んだ先から 元の画面へ戻れる★）。 */
  var BACK_TO = {
    seikyu: { label: '← 請求書へ戻る', href: 'seikyu/' },
    kyuyo: { label: '← 給与へ戻る', href: 'kyuyo/' },
  };
  function openFromHash() {
    var h = String(location.hash || '').replace(/^#/, '');
    if (!h) return false;
    var name = h.split('?')[0];
    if (name !== 'kaisha') return false;
    var q = h.indexOf('?') >= 0 ? h.slice(h.indexOf('?') + 1) : '';
    var back = (q.split('&').map(function (kv) { return kv.split('='); })
      .filter(function (kv) { return kv[0] === 'back'; })[0] || [])[1] || '';
    show('scr-data'); showTab('org');
    showBack(BACK_TO[back] || null);
    return true;
  }
  function showBack(to) {
    var el = $('kaisha-back'); if (!el) return;
    if (!to) { el.hidden = true; el.textContent = ''; el.removeAttribute('href'); return; }
    el.hidden = false;
    el.textContent = to.label;
    el.setAttribute('href', to.href);
  }

  function init() {
    // ★state.today は入れない＝毎回その時の日付を使う(アプリを開きっぱなしで日が変わっても「今月」がズレない)。
    //   テストだけ state.today に固定値を入れて時刻依存を外す。
    bind();
    renderEmps(); renderPts(); renderBizChips();
    openFromHash();
    global.addEventListener('hashchange', openFromHash);
  }

  // auth.js がログイン成功後に呼ぶ（会社・人・取引先を読む）
  function attach(client) {
    SD = global.SuiteData ? global.SuiteData.create({ client: client }) : null;
    return loadAll().then(function () { return SD; });
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
    openFromHash: openFromHash, showBack: showBack, BACK_TO: BACK_TO,
    loadAll: loadAll,
    state: state,
    _setSuiteData: function (sd) { SD = sd; },     // テスト用の差し込み口
    _toast: toast, _jpFail: jpFail,
    _modal: modal, _modalClose: modalClose
  };
  global.Hub = Hub;
  global.__RAKUNALLY_TEST = Hub;                       // ★UIテスト(jsdom/実機)から中を見る

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window);
