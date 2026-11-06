/* meisai.js — 従業員向けWeb給与明細(パスワード方式)。
 * ?t=token → 初回:会社発行の初回コードで本人を縛り自分のパスワード設定 → 以後:パスワード(＋端末記憶deviceToken)。
 * ★電子交付に同意するまで明細データを画面に出さない(所得税法の電子交付要件)★。開封時に openedAt を記録。
 * 生年月日は使わない(同じ誕生日・推測に弱いため)。保存層は store.js(localStorage or Supabase RPC)。描画は render.js。 */
(function(){
  'use strict';
  var $=function(id){ return document.getElementById(id); };
  var SCREENS=['sc-bad','sc-setup','sc-login','sc-consent','sc-list','sc-view','sc-nencho','sc-furikomi'];
  function show(id){ SCREENS.forEach(function(s){ var el=$(s); if(el)el.classList.toggle('hidden', s!==id); });
    /* ★画面が 替わったら PDF の 止めの 札を 下げる★（札は body 直下の fixed＝下げないと 一覧や 別の明細の上に「この紙は…」が 残って 嘘になる・taiketsu 3回目 止1） */
    var ft=document.getElementById('m-pdf-tome'); if(ft){ ft.style.display='none'; } _pdfBan++; }
  var _pdfBan=0;   /* 画面替えの 番号（PDF を 作る 途中で 画面を 替えたら、後から 来た 失敗の 札を 出さない・taiketsu 4回目 止め1） */
  function yen(n){ n=Math.round(Number(n)||0); return '¥'+n.toLocaleString('en-US'); }
  /* ★直しの 日付を ★短く★ 出す★（例：9月22日）
     ★時刻は 出さない★＝従業員に 要るのは「いつ 直ったか」だけ
     ★★空を 返して 黙らない★★（2026-09-22 `silent-catch` に 捕まった）
       ★前★ … ★読めない 時に 空の 字を 返して いた★
              ⇒ ★日付が 紙から 黙って 消える★
       ★今★ … ★読めないと 字で 言う★（★「直しが 入りました」は 必ず 出る★）
       ★受け皿 自体 要りません★＝`new Date(…)` は 投げず `isNaN` で 分かる
     ★★説明に ★本物に 見える 字★を 書かない★★（今日 4回目）
       … 字だけ 見る 門には ★見本と 本物の 別が 付かない★ */
  function hidukeJi(iso){
    var t = new Date(iso);
    if (isNaN(t.getTime())) return '日付が 読めません';
    return (t.getMonth()+1) + '月' + t.getDate() + '日';
  }
  function ymLabel(ym, kind){ var y=(ym||'').slice(0,4), m=parseInt((ym||'').slice(5,7),10)||0; if(kind==='gensen') return '令和'+(y-2018)+'年分';   /* ★下の行が「源泉徴収票」と出すので ここで2回 書かない★ */ return '令和'+(y-2018)+'年'+m+'月'+(kind==='bonus'?'（賞与）':'分'); }

  /* ★つながらない時に 何も出ないまま止めない★（2026-08-21）
     倉庫を呼ぶ所には ★1か所ずつ★ 受け皿を付ける。ここは その知らせ（1か所にまとめる）。
     ★「リンクが正しくありません」は使わない★＝つながらないのとは別の事（嘘になる）。 */
  /* 画面の下に 貼り付く 赤い 知らせ（自分では 消えない）。id ごとに 1つ＝つながらない知らせ（m-oops）と PDF の止め（m-pdf-tome）を 別に持つ */
  function akaiFuda(id){
    var t=document.getElementById(id);
    if(!t){
      t=document.createElement('div'); t.id=id;
      t.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);'
        +'max-width:calc(100vw - 32px);width:max-content;box-sizing:border-box;'
        +'white-space:normal;overflow-wrap:anywhere;line-height:1.6;text-align:center;'
        +'background:#C0392B;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:700;'
        +'box-shadow:0 4px 16px rgba(0,0,0,.22);z-index:9999';
      document.body.appendChild(t);
    }
    return t;
  }
  function oops(what, err){
    var t=akaiFuda('m-oops');
    t.textContent = what + 'ができませんでした（' + ((err && (err.message||err.reason)) || 'つながりません') + '）。電波の良い所で もう一度 開いてください。';
    t.style.display='';
  }

  var token=(function(){ try{ return new URLSearchParams(location.search).get('t'); }catch(e){ return null; } })();
  // QR/リンクに初回コードを埋め込む(?c=)と、初回パスワード設定画面で自動入力=従業員はコード入力不要でパスワードを決めるだけ。
  var initFromUrl=(function(){ try{ return (new URLSearchParams(location.search).get('c')||'').trim(); }catch(e){ return ''; } })();
  var DEVKEY='meisai_dev_'+token;                 // この端末に記憶したdeviceToken
  var cred=null, docs=[];                          // 認証後の資格情報(deviceToken or password)

  // ★試験の口★（kyuyo/tests/gensen-soto-tomeru.mjs が 本物の 描き方を 呼ぶ）＝鍵が 無くて 次の 行で return しても 届く 所に 置く
  window.MeisaiMiseru={ renderPayslip:renderPayslip, sotoWoTomeru:sotoWoTomeru };
  if(!token){ show('sc-bad'); return; }

  // 起動: 端末記憶があれば認証スキップ
  var savedDev=(function(){ try{ return localStorage.getItem(DEVKEY)||null; }catch(e){ return null; } })();
  Store.meisaiAuth(token, savedDev).then(function(r){
    if(!r || !r.found){ show('sc-bad'); return; }
    if(r.remembered){ cred={ deviceToken:savedDev }; afterAuth(r.name); return; }   // 記憶済→パスワード省略
    if(!r.hasPassword){ show('sc-setup'); return; }                                  // 初回=パスワード設定(コードはリンクに内包・従業員は入力不要)
    show('sc-login');                                                                // 2回目以降=パスワード
  }).catch(function(e){ oops('本人の確かめ', e); });

  // 認証後: 同意チェック→明細一覧(or 同意画面)
  function afterAuth(name){
    Store.getMeisaiDocs(token, cred).then(function(r){
      if(!r || r.unauth){ show('sc-login'); return; }
      if(r.needConsent){ show('sc-consent'); return; }
      docs=r.docs||[]; renderList(r.name||name); show('sc-list');
    }).catch(function(e){ oops('明細の読み込み', e); });
  }

  // ① 初回パスワード設定(コードはリンク(?c=)に内包=従業員はパスワードを決めるだけ)
  $('setup-go').addEventListener('click', function(){
    var code=initFromUrl, pw=$('setup-pw').value||'', pw2=$('setup-pw2').value||'';
    $('setup-err').textContent='';
    if(!code){ $('setup-err').textContent='このリンクが正しくありません。会社から届いた最新のリンク（QR）をそのまま開いてください。'; return; }
    if(pw.length<8){ $('setup-err').textContent='パスワードは8文字以上にしてください。'; return; }
    if(pw!==pw2){ $('setup-err').textContent='パスワード(確認)が一致しません。'; return; }
    Store.meisaiSetPassword(token, code, pw).then(function(r){
      if(!r || !r.ok){ $('setup-err').textContent = (r&&r.locked)?'しばらくロックされています。時間をおいて再度お試しください。':(r&&r.weak)?'パスワードは8文字以上にしてください。':(r&&r.badInit)?'このリンクが正しくありません。会社から届いた最新のリンク（QR）をそのまま開いてください。':(r&&r.alreadySet)?'すでにパスワードが設定済みです。ログインしてください。':'設定できませんでした。'; if(r&&r.alreadySet)show('sc-login'); return; }
      // 設定できたらそのままパスワードでログイン→端末記憶
      loginWith(pw);
    }).catch(function(e){ oops('パスワードの登録', e); });
  });

  // ② パスワードでログイン
  $('login-go').addEventListener('click', function(){ loginWith($('login-pw').value||''); });
  $('login-pw').addEventListener('keydown', function(e){ if(e.key==='Enter')$('login-go').click(); });
  function loginWith(pw){
    var errEl=$('login-err'); if(errEl)errEl.textContent='';
    Store.meisaiVerifyPassword(token, pw).then(function(r){
      if(!r || !r.ok){ if(errEl)errEl.textContent = (r&&r.locked)?'パスワードを何度も間違えたため、しばらくロックされています。時間をおいて再度お試しください。':(r&&r.remaining!=null?'パスワードが違います（あと'+r.remaining+'回でロックされます）。':'パスワードが違います。'); return; }
      try{ localStorage.setItem(DEVKEY, r.deviceToken); }catch(e){}   // 端末に記憶(次回からパスワード不要)
      cred={ deviceToken:r.deviceToken };
      afterAuth();
    }).catch(function(e){ oops('パスワードの確かめ', e); });
  }

  // ③ 電子交付の同意(認証済cred必須)
  $('consent-go').addEventListener('click', function(){
    Store.setMeisaiConsent(token, cred).then(function(r){
      if(!r || !r.ok){ show('sc-login'); return; }
      afterAuth();
    }).catch(function(e){ oops('同意の記録', e); });
  });
  $('consent-no').addEventListener('click', function(){ show('sc-login'); });

  // ④ 明細一覧
  function renderList(name){
    $('list-title').textContent = (name?name+' さん の ':'')+'給与明細';
    var host=$('dlist'); host.innerHTML='';
    if(!docs.length){ host.innerHTML='<p class="hint">公開されている明細はまだありません。</p>'; return; }
    docs.forEach(function(d, i){
      var p=(d.data&&d.data.person)||{};
      var isGensen=(d.kind==='gensen');
      var sub=isGensen?'源泉徴収票':(d.kind==='bonus'?'賞与明細':'給与明細');
      var val=isGensen?'<span style="font-size:11px;color:#7aa08c">開いて確認</span>':yen(p.net);
      var row=document.createElement('div'); row.className='drow';
        /* ★★直しが 入った 事を ★字で★ 出す★★（2026-09-22 司さん「気づかんのやったら 気づくように しろや」）
           ★未読の 印だけでは ★なぜ また 未読なのか★ が 分かりません★
           （会社が 確定の 後に 直すと ★中身が 変わって います★）
           ⇒ ★印（気づく）★と ★訳（分かる）★を 並べる */
        var nao = d.data && d.data.naoshi && d.data.naoshi.at;
        var naoJi = nao ? '<span class="naoshi-ji">直しが 入りました（' + hidukeJi(nao) + '）</span>' : '';
      row.innerHTML='<div><div class="dl">'+ymLabel(d.ym,d.kind)+(d.openedAt?'':'<span class="badge-new">未読</span>')+naoJi+'</div><div class="ds">'+sub+'</div></div><div class="dv">'+val+'</div>';
      row.addEventListener('click', function(){ openDoc(i); });
      host.appendChild(row);
    });
  }

  // ⑤ 明細ビュー = 明細を原寸(794px)でiframe描画し、CSS transformで画面幅にフィット。
  //   ベクター描画なのでピンチズームで鮮明。iframeは確実に描画される(html2canvasの画像化はiOSで不安定なため不使用)。
  //   保存/印刷は代行請求書アプリと同じ「新窓に明細HTMLを書いて window.print」方式(A4いっぱいにくっきり)。
  var _isLand=false, _psHtml='', _psW=794, _psH=1123;
  /* ★共有に 添える 字と 名前★（司さん 11-06「B」＝「給与明細 2026年10月分 山田 太郎様」・★金額は 入れない★） */
  var _okuri={ text:'', name:'給与明細.pdf' };
  function okuriOf(d){
    var data=(d&&d.data)||{}, kind=(d&&d.kind==='gensen')?'源泉徴収票':((d&&d.kind==='bonus')?'賞与明細':'給与明細');
    var ym=String((d&&d.ym)||''), y=ym.slice(0,4), m=parseInt(ym.slice(5,7),10)||0;
    var tuki=/^\d{4}$/.test(y)?((d&&d.kind==='gensen')?(y+'年分'):(m?(y+'年'+m+'月分'):'')):'';
    var nm=String((data.person&&data.person.name)||'').trim(), who=nm?(nm+'様'):'';
    var parts=[kind,tuki,who].filter(function(x){ return x; });
    return { text:parts.join(' '), name:parts.join('_').replace(/[\\\/:*?"<>|\s]+/g,'_')+'.pdf' };
  }
  function openDoc(i){
    var d=docs[i]; if(!d) return; var data=d.data||{}; _okuri=okuriOf(d);
    if(d.openedAt==null){ Store.markMeisaiOpened(d.id, token, cred).then(function(){ d.openedAt=new Date().toISOString(); }).catch(function(e){ oops('開いた記録', e); }); }
    var pw=794, ph=1123, html; _isLand=false;
    try{
      if(d.kind==='gensen'){ html=data.gensenHtml||'<!doctype html><html><head><meta charset="UTF-8"></head><body><p style="padding:16px">源泉徴収票を表示できませんでした。</p></body></html>'; }
      else {
        var people=[data.person||{}], doc=data.doc||{month:ymLabel(d.ym,d.kind), kind:d.kind};
        // ★従業員の明細は常に1人=1人用・縦向き(hero)で全幅表示。会社の複数人テンプレ(例:col1_3=3人横)だと
        //   1人分が横幅の1/3しか埋めず両側が白(縮んで見える)ため、data.preferに関わらずcol2_1に固定。
        var out=window.Render.build(people, doc, 'col2_1', data.theme);
        html=out.html; if(out.orientation==='landscape'){ pw=1123; ph=794; _isLand=true; }
      }
    }catch(e){ return; }
    _psHtml=html;
    show('sc-view');
    renderPayslip(html, pw, ph);
    window.scrollTo(0,0);
  }
  /* ★紙の中から 外の物を 一切 読ませない★（2026-11-06）
     倉庫の 源泉徴収票（app.js nenGensenDoc が 11-06 まで 作った 紙）は head に Google Fonts の link が在る。
     返事が 来ない 回線だと iframe は 描かれず（真っ白）onload も 来ない＝「明細を読み込み中…」のまま 止まった
     （chromium・webkit とも 20秒 onload 無し・4秒 真っ白 を 測った）。古い 紙は 倉庫に 残るので 見せる側で 止める。
     字で link を 外す 形は 大文字・一重引用符・@import・@font-face・img を 取りこぼす ⇒ ★<head> の 直後に CSP を 1つ 差す★
     （8形 すべて load が 来るのを 測った）。紙の 中の script も 止まる。meta は doctype より 前に 置くと 描き方が 崩れるので head の 中。 */
  function sotoWoTomeru(html){
    // ★定数も 関数の 中★＝鍵 無しの 時は 上の if(!token){…return;} で 終わる＝それより 後の var は 入らない（試験の口から 呼ばれる 時）
    var SOTO_TOMERU='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:">';
    html=String(html||'');
    // ★<head> と <html> だけに 当てる★（<header>・<html5…> に 当たると meta が body に 入り CSP が 効かない）
    if(/<head(\s[^>]*)?>/i.test(html)) return html.replace(/<head(\s[^>]*)?>/i, function(h){ return h+SOTO_TOMERU; });
    if(/<html(\s[^>]*)?>/i.test(html)) return html.replace(/<html(\s[^>]*)?>/i, function(h){ return h+'<head>'+SOTO_TOMERU+'</head>'; });
    return '<!doctype html><html><head>'+SOTO_TOMERU+'</head><body>'+html+'</body></html>';
  }
  var _psBan=0;
  // 原寸iframeに明細を描画→実際の高さを測り→画面幅にフィットするようtransform:scale。
  function renderPayslip(html, pw, ph){
    var f=$('frame'), load=$('ps-loading');
    _psW=pw; _psH=ph;
    if(load){ load.style.display=''; load.textContent='明細を読み込み中…'; }
    f.style.width=pw+'px'; f.style.height=ph+'px'; f.style.transform='none';
    /* ★onload が 来ない 端末の 受け皿★（seikyu-app.js と 同じ 考え）＝3秒で 合わせて 札を 下げる。
       別の 紙を 開き直したら 前の 受け皿は 何も しない（番号で 見分ける）。 */
    var ban=_psBan=(_psBan|0)+1, sumi=false;   // (_psBan|0)＝試験の口から 呼ばれて var が まだ 入っていない 時も 数になる
    var awaseru=function(kara){
      if(ban!==_psBan) return;                 // 別の 紙を 開いた 後＝何も しない
      if(kara==='matsu' && sumi) return;       // onload が 先に 来た＝受け皿は 要らない（onload は 遅れて 来ても 測り直す）
      sumi=true;
      try{
        var idoc=f.contentDocument||f.contentWindow.document;
        var sheet=idoc.querySelector('.sheet,.page');
        var natH=Math.max(ph, sheet?sheet.scrollHeight:ph);
        _psH=natH; f.style.height=natH+'px';
        fitFrame();
        if(load){ load.style.display='none'; }
        // ★レイアウト確定のタイミングがiOSで遅れることがあるので複数回フィット(幅0で空振りした分を拾う)
        try{ requestAnimationFrame(fitFrame); }catch(e){}
        setTimeout(fitFrame, 250); setTimeout(fitFrame, 600);
      }catch(e){ fitFrame(); if(load){ load.style.display='none'; } }
    };
    f.onload=function(){ setTimeout(function(){ awaseru('load'); }, 120); };
    setTimeout(function(){ awaseru('matsu'); }, 3000);
    f.srcdoc=sotoWoTomeru(html);
  }
  // iframe(原寸_psW×_psH)を preview-wrap の内幅にフィットさせる。
  //   ★transformは「見た目」だけ縮小しレイアウトの箱は原寸のまま=横にはみ出て横スクロール+巨大余白になる。
  //     負マージンで箱ごと縮めて溢れを消す(本体アプリのfitPreviewと同方式・iOSで実績あり)。
  function fitFrame(){
    var f=$('frame'); if(!f) return;
    var wrap=f.parentNode; if(!wrap) return;
    var cw=wrap.clientWidth || Math.round(wrap.getBoundingClientRect().width) || document.documentElement.clientWidth;
    var avail=cw - 24; // padding 12+12
    if(avail<=0) return;
    var s=Math.min(1, avail/_psW);
    f.style.transformOrigin='top left';
    f.style.transform='scale('+s+')';
    f.style.marginRight=(-(_psW*(1-s)))+'px';   // レイアウト箱の幅を縮小分だけ詰める=横スクロール消滅
    f.style.marginBottom=(-(_psH*(1-s)))+'px';  // 高さも詰める=下の巨大余白消滅
    wrap.style.height='';                        // 折り畳んだiframeが高さを決める(明示height不要)
  }
  window.addEventListener('resize', function(){ var v=$('sc-view'); if(v && !v.classList.contains('hidden')) fitFrame(); });
  // ★レイアウト確定/画面回転で確実にフィットさせる(iOSはonload直後に幅が0のことがある対策)
  var _ro=null;
  try{ if(window.ResizeObserver){ _ro=new ResizeObserver(function(){ var v=$('sc-view'); if(v && !v.classList.contains('hidden')) fitFrame(); }); _ro.observe($('frame').parentNode); } }catch(e){}
  $('v-back').addEventListener('click', function(){ renderList(); show('sc-list'); });
  // PDFで保存 = ★jsPDFで自前生成(A4ぴったり1ページ・ブラウザのURL/日付フッター無し)。
  //   iOSのwebページ印刷(window.print)はURL/日付フッターが必ず付き、その余白ぶんで2ページ目(空白)が出るため不使用。
  //   明細をhtml2canvasで高精細(scale3=約288dpi)に焼き、A4 1枚に載せる→doc.save。iOSは標準PDFビューアで開く(戻れる)。
  /* PDF の 止め＝「作成中…」を 下げて 画面の下の 赤い札（自分では 消えない・画面が 替わるか 作れたら 下がる）。
     ★作る途中の 失敗も 同じ札★（前は 明細の上に 小さく 2.2秒＝読めずに「何も起きない」と同じ・taiketsu 3回目 止2） */
  function pdfTome(load, ji, ban){ if(load){ load.style.display='none'; } if(ban!=null && ban!==_pdfBan) return;   /* 押した後に 画面が 替わった＝別の画面に 嘘を 出さない */
    var t=akaiFuda('m-pdf-tome'); t.textContent=ji; t.style.display=''; }
  $('v-pdf').addEventListener('click', function(){
    var load=$('ps-loading');
    var f=$('frame'), idoc=f&&(f.contentDocument||f.contentWindow.document);
    /* ★2026-11-06★ 源泉徴収票（nenGensenDoc）は .sheet/.page でなく body の中の .gensen 1つ＝前は target が null で
       必ず下の window.print()（★外側の頁ごと★ブラウザ印刷）へ落ちていた。.gensen が在る時だけ body を焼く
       （body は padding 込みで 794 幅＝見た通りの A4。kind で決めない＝「表示できませんでした」の頁を PDF にしない）。 */
    var target=idoc&&(idoc.querySelector('.sheet,.page')||(idoc.querySelector('.gensen')?idoc.body:null));
    /* ★ブラウザ印刷へは逃げない★（iOS は URL・日付が紙に付き、白紙の2枚目が出て、戻れない＝上の注）。止めて字で言う。
       字は 画面の下の 赤い 札（oops と 同じ形・自分では 消えない）＝明細の上に 小さく 重ねて 4秒で 消すと 読めずに「何も起きない」になる（taiketsu）。
       紙が無いのは 開き直しても 直らない＝会社へ。部品は ホーム画面の アプリに 読み込み直しの 釦が 無い＝「閉じて 開き直す」。 */
    var nanika=!target ? 'この紙はPDFにできません（紙の中身が読めていません）。会社へお知らせください。'
      : (!(window.html2canvas) || !(window.jspdf&&window.jspdf.jsPDF)) ? 'PDFを作る部品が読み込めていません。アプリ（画面）を閉じて開き直してから、もう一度押してください。' : '';
    var fuda=document.getElementById('m-pdf-tome'), banAtPress=_pdfBan;
    if(nanika){ pdfTome(load, nanika); return; }
    if(fuda){ fuda.style.display='none'; }   // 作れる時は 前の 止めの 札を 下げる
    if(load){ load.style.display=''; load.textContent='PDFを作成中…'; }
    // ★A4寸法を固定で焼く(width/height両方指定)=iOSでも必ずA4比率のcanvasになる(縦潰れ防止)。
    /* ★押した 時の 明細の 向きと 添える 字を 固める★（焼く 数秒の 間に 一覧へ 戻って 別の 明細を 開くと、then の 中で 読む _okuri・_isLand が
       ★後の 明細の 物★に なり、前の 明細の PDF に 後の 人の 名前が 付いた＝会社側 b-print の okuriAtPress と 揃える・taiketsu 11-06 任1） */
    var landAtPress=_isLand, okuriAtPress=_okuri;
    var CW=landAtPress?1123:794, CH=landAtPress?794:1123;
    /* ★焼く間だけ 外の字体の link を 外す★（2026-11-06）＝倉庫の 源泉徴収票（app.js nenGensenDoc）は fonts.googleapis の link を持つ。
       返事が来ないと html2canvas の写しが 読み終わらず「作成中…」のまま 永久に止まる（chromium・webkit とも 20秒 0枚／外すと 0.1〜0.7秒 を測った）。
       古い紙も 倉庫に在る＝作る側でなく 焼く所で外す。焼き終わったら（成功でも失敗でも）元の場所へ戻す。手元の link は触らない。 */
    var sotoLink=[];
    try{ Array.prototype.forEach.call(idoc.querySelectorAll('link[rel~="stylesheet"]'), function(l){
      if(/^\s*(https?:)?\/\//i.test(l.getAttribute('href')||'')){ sotoLink.push([l, l.parentNode, l.nextSibling]); l.parentNode.removeChild(l); } }); }catch(_){}
    var linkModosu=function(){ sotoLink.forEach(function(x){ try{ x[1].insertBefore(x[0], x[2]); }catch(_){} }); sotoLink=[]; };
    var yaki=window.html2canvas(target, { scale:3, backgroundColor:'#ffffff', useCORS:true, width:CW, height:CH, windowWidth:CW, windowHeight:CH });
    yaki.then(linkModosu, linkModosu);   // 先に 登録＝下の 続きより 先に 戻る
    yaki.then(function(canvas){
      try{
        var jsPDF=window.jspdf.jsPDF;
        var pw=landAtPress?842:595, ph=landAtPress?595:842; // ★A4ページ(印刷がちゃんとA4になる)
        var doc=new jsPDF({ orientation:landAtPress?'landscape':'portrait', unit:'pt', format:[pw,ph] });
        // ★A4ページのまま明細を横幅いっぱいに(比率維持=潰さない・左右余白ゼロ)。canvasがA4比より縦長でも
        //   幅いっぱいで載せ、はみ出た下端(明細の空白部分)はA4ページで自然に収まる=環境差でも常に幅いっぱい。
        var iw=canvas.width, ih=canvas.height;
        doc.addImage(canvas.toDataURL('image/jpeg',0.92), 'JPEG', 0, 0, pw, pw*ih/iw);
        // ★PDFの受け渡し=代行請求書アプリと同じ「blobを新しいタブで開く」方式。
        //   doc.save()(ダウンロード)はiOSで WebKitBlobResourceエラー が出るため不使用。ポップアップ不可時のみsaveにフォールバック。
        /* ★2026-11-06 司さん「B」★ iPhone・iPad は 共有に PDF と 字1行を 渡す（url は 付けない＝LINE に 開けない URL を 届けない）。
           他の 端末は 下の 今までの 開き方の まま（hiraku）。 */
        var pdfBlob=doc.output('blob'), okuri=okuriAtPress;
        var hiraku=function(){ try{ var url=URL.createObjectURL(pdfBlob); var w=window.open(url,'_blank'); if(!w){ try{ doc.save(okuri.name); }catch(e){} } setTimeout(function(){ try{ URL.revokeObjectURL(url); }catch(e){} }, 60000); }catch(e){ try{ doc.save(okuri.name); }catch(_){} } return { how:'open' }; };
        if(window.FileOut && window.FileOut.sharePdf){ window.FileOut.sharePdf(pdfBlob, okuri.name, { text:okuri.text, open:hiraku }).catch(function(){ hiraku(); }); } else { hiraku(); }
        if(load){ load.style.display='none'; }
      }catch(e){ pdfTome(load, 'PDFの作成に失敗しました。時間をおいて、もう一度押してください。', banAtPress); }
    }).catch(function(){ pdfTome(load, 'PDFの作成に失敗しました。時間をおいて、もう一度押してください。', banAtPress); });
  });

  // ⑥ 年末調整 従業員セルフ申告(平易な質問→保存。会社が取り込む)
  // 年末調整の対象年: 通常11〜12月に実施。1〜3月に開くのは「前年分」の年調(会社は対象月=前年12月=前年で読む)なので前年に合わせる=年跨ぎでも会社側と一致
  var ND=window.NenchoDecl, _nd=new Date(), nenYear=(_nd.getMonth()<=2)?_nd.getFullYear()-1:_nd.getFullYear(), declState={};
  (function(){ var y=$('nencho-year'); if(y) y.textContent=nenYear+'年'; })();
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function fmtN(v){ v=Number(String(v==null?'':v).replace(/[, ]/g,'')); return isNaN(v)||v===0?'':v.toLocaleString('en-US'); }
  function ynPill(key,on){ return '<span class="nw-yn" data-ynk="'+esc(key)+'"><b class="ynb'+(on?' on':'')+'" data-ynv="1">はい</b><b class="ynb'+(!on?' on':'')+'" data-ynv="0">いいえ</b></span>'; }
  function nenWizHTML(){
    if(!ND) return '<p class="hint">申告フォームを読み込めませんでした。</p>';
    return ND.GROUPS.map(function(g){
      var rows=ND.FIELDS.filter(function(f){ return f.group===g.id && (!f.when || !!declState[f.when]); }).map(function(f){
        var help=f.help?'<div class="nw-help">'+esc(f.help)+'</div>':'', input;
        if(f.type==='bool') input=ynPill(f.key, !!declState[f.key]);
        else if(f.type==='select') input='<select class="finput" data-nk="'+esc(f.key)+'">'+(f.options||[]).map(function(o){ return '<option value="'+esc(o[0])+'"'+((declState[f.key]||'')===o[0]?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>';
        else { var unit=(f.type==='count')?'人':'円'; input='<input class="finput num" data-nk="'+esc(f.key)+'" inputmode="numeric" value="'+esc(fmtN(declState[f.key]))+'" placeholder="0"><span class="nw-unit">'+unit+'</span>'; }
        return '<div class="nw-row"><div class="nw-q">'+esc(f.q)+help+'</div><div class="nw-in">'+input+'</div></div>';
      }).join('');
      return '<div class="nw-group"><div class="nw-gt">'+esc(g.title)+'</div>'+rows+'</div>';
    }).join('');
  }
  function renderNenWiz(){ var host=$('nencho-wiz'); if(host) host.innerHTML=nenWizHTML(); }
  function openNencho(){
    var errEl=$('nencho-err'); if(errEl)errEl.textContent=''; $('nencho-saved').classList.add('hidden');
    Store.getNenchoDecl(token, cred, nenYear).then(function(r){
      declState = (r && r.found && r.decl) ? JSON.parse(JSON.stringify(r.decl)) : (ND?ND.blank():{});
      if(r && r.found){ var sv=$('nencho-saved'); sv.textContent='前回の申告を読み込みました。修正して再提出できます。'; sv.classList.remove('hidden'); }
      renderNenWiz(); show('sc-nencho'); window.scrollTo(0,0);
    }).catch(function(e){ oops('前の申告の読み込み', e); });
  }
  var toN=$('to-nencho'); if(toN) toN.addEventListener('click', openNencho);
  var nBack=$('nencho-back'); if(nBack) nBack.addEventListener('click', function(){ renderList(); show('sc-list'); });
  var wiz=$('nencho-wiz');
  if(wiz){
    wiz.addEventListener('click', function(e){ var b=e.target.closest('.ynb'); if(!b)return; var pill=b.closest('[data-ynk]'); if(!pill)return;
      declState[pill.dataset.ynk]=(b.dataset.ynv==='1'); renderNenWiz(); }); // when依存行(配偶者の所得等)の出し入れ
    wiz.addEventListener('input', function(e){ var f=e.target.closest('[data-nk]'); if(!f||f.tagName==='SELECT')return; declState[f.dataset.nk]=f.value; });
    wiz.addEventListener('change', function(e){ var f=e.target.closest('[data-nk]'); if(!f||f.tagName!=='SELECT')return; declState[f.dataset.nk]=f.value; });
  }
  var nSave=$('nencho-save');
  if(nSave) nSave.addEventListener('click', function(){
    var errEl=$('nencho-err'); if(errEl)errEl.textContent='';
    var decl = ND ? ND.normalize(declState) : declState;
    Store.saveNenchoDecl(token, cred, nenYear, decl).then(function(r){
      if(!r || !r.ok){ if(errEl)errEl.textContent=(r&&r.unauth)?'ログインが必要です。もう一度開き直してください。':'保存できませんでした。通信環境をご確認ください。'; return; }
      declState=JSON.parse(JSON.stringify(decl)); renderNenWiz();
      var sv=$('nencho-saved'); sv.textContent='申告を保存しました。会社が確認して年末調整に反映します。修正があればこの画面から再提出できます。'; sv.classList.remove('hidden');
      window.scrollTo(0,0);
    }).catch(function(e){ oops('申告の送信', e); });
  });

  // ⑦ 従業員セルフ登録: 自分の情報(住所＋振込先)。住所は源泉徴収票に使います。
  // ★軽く★ 形式はラベルに（桁数・ハイフン・カナ）、例はplaceholderに。長い補足は先頭のleadに集約=各項目下の注記は置かない(スマホで濃くならない)。
  var PROFILE_FIELDS=[
    { k:'zip', label:'郵便番号（ハイフンあり）', ph:'150-0001' },
    { k:'address', label:'住所', ph:'東京都渋谷区〇〇1-2-3 〇〇マンション101' },
    { k:'furiBankName', label:'銀行名', ph:'みずほ銀行' },
    { k:'furiBankNo', label:'銀行コード（4桁）', ph:'0001', num:true, max:4 },
    { k:'furiBranchName', label:'支店名', ph:'本店' },
    { k:'furiBranchNo', label:'支店コード（3桁）', ph:'001', num:true, max:3 },
    { k:'furiYokin', label:'預金の種類', sel:['普通','当座','貯蓄'] },
    { k:'furiAccount', label:'口座番号（7桁）', ph:'1234567', num:true, max:7 },
    { k:'furiKana', label:'口座名義（半角カナ）', ph:'ﾔﾏﾀﾞ ﾊﾅｺ' }
  ];
  var profState={};
  function profFieldHTML(f){
    var v=profState[f.k]==null?'':profState[f.k], inner;
    if(f.sel) inner='<select class="finput" data-pk="'+esc(f.k)+'">'+f.sel.map(function(o){ return '<option'+(((v||f.sel[0])===o)?' selected':'')+'>'+esc(o)+'</option>'; }).join('')+'</select>';
    else inner='<input class="finput'+(f.num?' num':'')+'" data-pk="'+esc(f.k)+'" value="'+esc(v)+'"'+(f.num?' inputmode="numeric"':'')+(f.max?' maxlength="'+f.max+'"':'')+' placeholder="'+esc(f.ph||'')+'">';
    return '<div style="margin-bottom:12px"><label class="lbl">'+esc(f.label)+'</label>'+inner+(f.help?'<div class="hint" style="margin-top:3px">'+esc(f.help)+'</div>':'')+'</div>';
  }
  function renderProfForm(){ var host=$('furi-form'); if(host) host.innerHTML=PROFILE_FIELDS.map(profFieldHTML).join(''); }
  function openFurikomi(){
    var errEl=$('furi-err'); if(errEl)errEl.textContent=''; $('furi-saved').classList.add('hidden');
    Store.getEmpProfile(token, cred).then(function(r){
      profState = (r && r.found && r.data) ? JSON.parse(JSON.stringify(r.data)) : {};
      if(r && r.found){ var sv=$('furi-saved'); sv.textContent='前回の登録を読み込みました。修正して再登録できます。'; sv.classList.remove('hidden'); }
      renderProfForm(); show('sc-furikomi'); window.scrollTo(0,0);
    }).catch(function(e){ oops('登録した内容の読み込み', e); });
  }
  var toF=$('to-furikomi'); if(toF) toF.addEventListener('click', openFurikomi);
  var fBack=$('furi-back'); if(fBack) fBack.addEventListener('click', function(){ renderList(); show('sc-list'); });
  var fSave=$('furi-save');
  if(fSave) fSave.addEventListener('click', function(){
    var errEl=$('furi-err'); if(errEl)errEl.textContent='';
    var host=$('furi-form'), data={};
    PROFILE_FIELDS.forEach(function(f){ var el=host.querySelector('[data-pk="'+f.k+'"]'); var v=el?(''+el.value).trim():''; if(f.num) v=v.replace(/[^0-9]/g,''); data[f.k]=v; }); // コード/口座番号は数字のみ
    Store.saveEmpProfile(token, cred, data).then(function(r){
      if(!r || !r.ok){ if(errEl)errEl.textContent=(r&&r.unauth)?'ログインが必要です。もう一度開き直してください。':'保存できませんでした。通信環境をご確認ください。'; return; }
      profState=JSON.parse(JSON.stringify(data)); renderProfForm();
      var sv=$('furi-saved'); sv.textContent='振込先を登録しました。会社が確認して反映します。修正があればこの画面から再登録できます。'; sv.classList.remove('hidden');
      window.scrollTo(0,0);
    }).catch(function(e){ oops('登録の保存', e); });
  });
})();
