/* store.js — 給与明細データの保存層
 * 既定はブラウザ(localStorage)。window.SUPA={url,key} があれば Supabase に切替(supabase-js v2 を読み込み済み前提)。
 * データ単位 = 1バッチ(= 会社/支給日/月/従業員配列)。スキーマは supabase/schema.sql 参照。
 */
(function (global) {
  'use strict';
  var LS_KEY = 'payslip_batches_v1';
  var hasSupa = !!(global.SUPA && global.SUPA.url && global.SUPA.key && global.supabase);
  var sb = hasSupa ? global.supabase.createClient(global.SUPA.url, global.SUPA.key, {
    // ログイン状態を端末に保持(iOSホーム画面PWA等でも維持を狙う)。
    // ★detectSessionInUrl=true: メール確認リンク(確認ON時)で戻ると URL に access/refresh トークンが載る→
    //   これを解析してセッションを成立させる為に必要。通常のメール+パスワードのみの利用では URL にトークンが
    //   無いので副作用なし(=既定値true・回帰なし)。確認OFFのままでも安全。
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  // ── 全件ページング(PostgREST既定 max_rows=1000 で"黙って"切れるのを根治) ──
  //  build=(from,to)=>完成クエリ。必ず .select(cols,{count:'exact'}) と .range(from,to) を付けて返す。
  //  count で総数を見て、全ページ取り切るまで .range を回す。返り={ data, error, count }。
  //  count が取れない応答は最初の非空ページで止める(飲み屋 fetchAll と同じ安全側)。
  //  ★これを通さない .select() は1000件超で賃金台帳/年末調整/明細一覧などが黙って過少になる★。
  function fetchAllQ(build){
    var out=[], from=0, size=1000;
    function step(){
      return Promise.resolve(build(from, from+size-1)).then(function(r){
        if(r.error) return { data:null, error:r.error };
        var got=r.data||[]; out=out.concat(got);
        if(!got.length || r.count==null || out.length>=r.count)
          return { data:out, error:null, count:(r.count==null?out.length:r.count) };
        from+=got.length; return step(); // ★size固定でなく実受信数で進める(上限<ページ幅でも漏れない)
      });
    }
    return step();
  }

  /* ★「読めなかった」を「空」と言わない★（2026-08-21）
     前は 壊れていても [] を返し、その [] を そのまま上書きしていた＝
     ★この端末に保存してある物が 黙って全部 消える★。
     ・使えない端末（localStorage を触れない）… ★本当に空★＝[] のままでよい
     ・中身が壊れている … [] は返すが ★書き込みを止める★（消さない・投げて伝える） */
  var _lsBroken = {};
  function readList(key){
    var raw;
    try{ raw = localStorage.getItem(key); }catch(e){ return []; }      /* 使えない端末＝本当に空 */
    if(raw == null || raw === '') { _lsBroken[key] = false; return []; }
    try{ var v = JSON.parse(raw); _lsBroken[key] = false; return Array.isArray(v) ? v : []; }
    catch(e){ _lsBroken[key] = true; return []; }                       /* ★壊れている★ */
  }
  function writeList(key, arr){
    if(_lsBroken[key]) throw new Error('この端末に保存してある物を読めませんでした（壊れています）。消さないように 書き込みを止めました。');
    try{ localStorage.setItem(key, JSON.stringify(arr)); }
    catch(e){ throw new Error('この端末に保存できませんでした（' + ((e&&e.message)||'空き容量など') + '）。'); }
  }
  function lsAll(){ return readList(LS_KEY); }
  function lsWrite(arr){ writeList(LS_KEY, arr); }
  function uid(){ return 'b_'+Math.abs(Date.now()).toString(36)+'_'+Math.floor(performance.now()).toString(36); }

  var Store = {
    mode: hasSupa ? 'supabase' : 'local',

    list: function(){
      if(hasSupa){
        return fetchAllQ(function(a,b){ return sb.from('payslip_batches').select('id,title,month,company,updated_at',{count:'exact'}).order('updated_at',{ascending:false}).range(a,b); })
          .then(function(r){ return r.data||[]; });
      }
      return Promise.resolve(lsAll().map(function(b){ return {id:b.id,title:b.title,month:b.month,company:b.company,updated_at:b.updated_at}; })
        .sort(function(a,b){ return (b.updated_at||'').localeCompare(a.updated_at||''); }));
    },

    get: function(id){
      if(hasSupa){ return sb.from('payslip_batches').select('*').eq('id',id).single().then(function(r){ return r.data; }); }
      return Promise.resolve(lsAll().filter(function(b){ return b.id===id; })[0]||null);
    },

    save: function(batch){
      batch.updated_at = batch.updated_at || ''; // 呼び出し側でISO文字列を入れる(Date.now禁止環境対策)
      if(!batch.id) batch.id = uid();
      if(hasSupa){
        return sb.from('payslip_batches').upsert(batch).select().single().then(function(r){ return r.data; });
      }
      var arr = lsAll(); var i = arr.findIndex(function(b){ return b.id===batch.id; });
      if(i>=0) arr[i]=batch; else arr.push(batch);
      lsWrite(arr); return Promise.resolve(batch);
    },

    remove: function(id){
      if(hasSupa){ return sb.from('payslip_batches').delete().eq('id',id).then(function(){ return true; }); }
      lsWrite(lsAll().filter(function(b){ return b.id!==id; })); return Promise.resolve(true);
    }
  };

  // ── 認証(メール+パスワード) ──
  if(hasSupa){
    // ★iOSホーム画面PWA(standalone)等でSupabase内蔵ストレージが起動間に失われる場合の保険:
    //   セッション(refresh_token)を独自キーにもバックアップし、起動時にgetSessionが空なら復元する。
    // ★保険キーはSupabaseプロジェクト別にする。本番(payslip-app)とテスト(payslip-app-test)は
    //   同一オリジン(exally-zeroact.github.io)でlocalStorageを共有するため、共通キーだと互いの
    //   セッションを上書きし合い、主トークンが飛んだ時に別プロジェクトのトークンで復元失敗→毎回ログインになる。
    var _projRef=(function(){ try{ return (global.SUPA.url.match(/\/\/([^.]+)\./)||[])[1]||''; }catch(e){ return ''; } })();
    var BK = 'kyually-session-backup' + (_projRef ? ('-'+_projRef) : '');
    try{ if(sb.auth && typeof sb.auth.onAuthStateChange==='function'){
      sb.auth.onAuthStateChange(function(ev, s){
        // ★消すのは「明示的サインアウト」時だけ。起動時のINITIAL_SESSION(null)では消さない
        //   =内蔵ストレージが空でも独自バックアップから復元できるようにする(iOS standalone対策の要)。
        if(ev === 'SIGNED_OUT'){ try{ localStorage.removeItem(BK); }catch(e){} return; }
        if(s && s.refresh_token){ try{ localStorage.setItem(BK, JSON.stringify({ a:s.access_token, r:s.refresh_token })); }catch(e){} }
      });
    } }catch(e){}

    Store.auth = {
      session: function(){
        return sb.auth.getSession().then(function(r){
          var s = r.data && r.data.session;
          if(s) return s;
          // 内蔵ストレージが空でも、独自バックアップから復元を試みる(standalone対策)
          var raw=null; try{ raw = localStorage.getItem(BK); }catch(e){}
          if(!raw) return null;
          var b=null; try{ b = JSON.parse(raw); }catch(e){}
          if(!b || !b.r) return null;
          return sb.auth.setSession({ access_token:b.a, refresh_token:b.r })
            .then(function(rr){ return (rr.data && rr.data.session) || null; })
            .catch(function(){ return null; });
        });
      },
      user:    function(){ return sb.auth.getUser().then(function(r){ return r.data && r.data.user; }); },
      signIn:  function(email,pw){ return sb.auth.signInWithPassword({email:email,password:pw}); },
      signUp:  function(email,pw){ return sb.auth.signUp({email:email,password:pw}); },
      signOut: function(){ try{ localStorage.removeItem(BK); }catch(e){} return sb.auth.signOut(); },
      onChange:function(cb){ sb.auth.onAuthStateChange(function(_e,s){ cb(s); }); }
    };
  }
  // ── アプリ状態をクラウドへ(棚分け: pay_companies=会社/設定・pay_employees=従業員) ──
  // RLSで本人(account_id=auth.uid)のみ。未ログイン時はnull/no-op(app.js側はlocalStorageで動作)
  if(hasSupa){
    function curUid(){ return sb.auth.getUser().then(function(r){ return r.data && r.data.user && r.data.user.id; }); }
    // ★このセッションでクラウドと同期できたか(読めた or 書けた)。差分削除はこれがtrueの時だけ許可
    //  =クラウド読込に失敗した古い/空の端末が、本番の従業員を物理削除するのを防ぐ(データ消失対策)。
    var cloudSynced = false;
    // ★cloudLoaded=「クラウドを ★読めた★」だけ true。差分削除(下)は これが true の時だけ許可。
    //  ★cloudSynced(=書けた)では 消してはいけない★: 2026-09-03 実測で、新しい端末が
    //  「読み込みより先に 自動保存が成功→cloudSynced=true→次の保存で 差分削除」で
    //  ★倉庫の従業員が 消えた(6回/10回)★。書けた事は「倉庫の中身を知っている」証拠にならない。
    var cloudLoaded = false;
    // ★saveHold=初回の読み込みが 走っている間、保存を 保留する約束。済んでから ★1回だけ★ 出す。
    //  出す時の中身は ★その時点の新しい状態★(snapshotFn)を取り直す=古い一覧での上書きを防ぐ。
    var saveHold = null, heldOnce = null;
    // ★読み込みが 失敗した理由は 黙って 捨てない★（保留を 解く時に 覚える＝画面が 聞ける）
    var lastLoadErr = null;
    Store.lastLoadError = function(){ return lastLoadErr; };
    Store.setSnapshotFn = function(fn){ Store._snapFn = fn; };
    // ★楽観ロック用: 最後に把握した pay_companies(設定=全置換で最も危険)の updated_at。
    //  読込時・自分の保存成功時に更新。保存前にクラウドの現在値と違えば「別端末が後から更新」=conflictで上書きしない。
    var lastCompanyUpdatedAt = null;
    Store.cloudSaveState = function(state){
      // ★②初回の読み込みが 走っている間は 保存しない★=済んでから 1回だけ 出す(中身は取り直す)
      if(saveHold){
        if(!heldOnce){
          heldOnce = saveHold.then(function(){ return null; }, function(e){
            lastLoadErr = (e && e.message) || '読み込み失敗';   // ★空で 握りつぶさない★
            return null;
          }).then(function(){
            heldOnce = null;
            var fresh = (typeof Store._snapFn==='function') ? Store._snapFn() : null;
            if(fresh) return realSave(fresh);
            // ★新しい中身が もらえない時★: 読めた後なら 手元の状態は もう 入れ替わっている＝
            //  ★保留していた 古い一覧で 上書きしない★(それが 一番 危ない)。読めていない時だけ 出す。
            return cloudLoaded ? { ok:false, reason:'held-skipped' } : realSave(state);
          });
        }
        return heldOnce;
      }
      return realSave(state);
    };
    function realSave(state){
      return curUid().then(function(uid){ if(!uid) return { ok:false, reason:'no-user' }; var now=new Date().toISOString();
        // ★employees以外の全スナップショット項目を保存(確定印/年末調整/賞与/カスタム給テンプレ/onboard等も載せる=端末替えで消えない)
        var settings={}; for(var k in state){ if(Object.prototype.hasOwnProperty.call(state,k) && k!=='employees') settings[k]=state[k]; }
        var emps=(state.employees||[]).map(function(e,i){ return { id:e.id, account_id:uid, sort:i, data:e, updated_at:now }; });
        var ids=emps.map(function(e){ return e.id; });
        // ★競合検知: 一度でも同期していれば(lastCompanyUpdatedAt!=null)、保存直前にクラウドの現在updated_atを確認。
        //  自分が最後に把握した値と違う=別端末が後から書いた→上書きせず conflict を返す(app.js側で再読込を促す)。
        return sb.from('pay_companies').select('updated_at').eq('account_id',uid).maybeSingle().then(function(cur){
          var cloudUA = cur && cur.data && cur.data.updated_at;
          // ★上書きせずconflictにする条件: クラウドに既存データがあり、それが「自分が最後に把握した値」と違う。
          //  別端末が後から書いた場合だけでなく、この端末がまだクラウドを読めていない(lastUA=null)のに本番データがある場合も含む
          //  =古い/新規端末が本番のsettings(確定・年調・会社設定)を静かに巻き戻すのを防ぐ(P0)。空クラウド(cloudUA=null)は新規保存OK。
          if(cloudUA && cloudUA!==lastCompanyUpdatedAt){
            // neverSynced=この端末がまだクラウドを読めていない(別端末の更新でなく"未読込")→app側で文言を分ける(誤解防止)
            return { ok:false, reason:'conflict', cloudUpdatedAt:cloudUA, neverSynced:(lastCompanyUpdatedAt==null) };
          }
          return doSave();
        }).catch(function(){
          // 競合確認クエリ自体が失敗: 同期実績あり(手元が本番の正と確定済み)ならブラインド保存(可用性優先)。
          //  未同期(cloudSynced=false)なら安全側=上書きせず失敗を返す(app側はローカル保持のまま警告=データ消失しない)。
          return cloudSynced ? doSave() : { ok:false, reason:'sync-check-failed' };
        });
        function doSave(){
        var ops=[
          // ★.select('updated_at').single()=DBが実際に保存した updated_at を受け取り、競合基準に使う(下記)。
          sb.from('pay_companies').upsert({ account_id:uid, data:settings, updated_at:now }).select('updated_at').single(),
          emps.length? sb.from('pay_employees').upsert(emps) : Promise.resolve({ error:null })
        ];
        // ★差分削除は「★読み込めた(cloudLoaded)★かつ手元に従業員が居る」時だけ=空/古い端末が本番を消さない
        //  (2026-09-03 変更: cloudSynced=書けた→cloudLoaded=読めた。理由は上の宣言部)
        if(cloudLoaded && emps.length>0){
          ops.push(fetchAllQ(function(a,b){ return sb.from('pay_employees').select('id',{count:'exact'}).eq('account_id',uid).range(a,b); }).then(function(r){ var ex=(r.data||[]).map(function(x){return x.id;}); var rm=ex.filter(function(id){ return ids.indexOf(id)<0; }); return rm.length? sb.from('pay_employees').delete().in('id',rm) : { error:null }; }));
        }
        return Promise.all(ops).then(function(res){
          var bad=res.filter(function(x){ return x && x.error; })[0];
          // ★競合基準は必ず「DBが返した updated_at」にする。JS生成の now(…Z) はDB返却(…+00:00)と書式が違い、
          //  文字列比較で毎回不一致=読込直後や2回目保存(スクロール等の自動保存)で誤conflictが多発する(P0根治)。
          if(!bad){ cloudSynced=true; lastCompanyUpdatedAt=(res[0] && res[0].data && res[0].data.updated_at) || now; }
          return { ok:!bad, reason: bad?((bad.error&&bad.error.message)||'error'):null };
        }).catch(function(e){ return { ok:false, reason:(e&&e.message)||'exception' }; });
        }
      });
    }
    Store.cloudLoadState = function(){
      var p = curUid().then(function(uid){ if(!uid) return null;
        return Promise.all([
          sb.from('pay_companies').select('data,updated_at').eq('account_id',uid).maybeSingle(),
          fetchAllQ(function(a,b){ return sb.from('pay_employees').select('data,sort',{count:'exact'}).eq('account_id',uid).order('sort',{ascending:true}).range(a,b); })
        ]).then(function(res){
          var co=res[0].data && res[0].data.data; var emps=(res[1].data||[]).map(function(r){ return r.data; });
          cloudSynced=true; cloudLoaded=true; // ★読めた★=差分削除を許可(空でも=新規アカウント)=同期済み(空でも=新規アカウントとして差分削除を許可)
          lastCompanyUpdatedAt=(res[0].data && res[0].data.updated_at)||null; // ★競合検知の基準=読込時のクラウドupdated_at
          if(!co && !emps.length) return null; var s=co||{}; s.employees=emps; return s;
        });
      });
      // ★読み込みが 終わる(成功でも 失敗でも)まで 保存を 待たせる★。★必ず 解く★=永久に待たない。
      //  失敗した時は cloudLoaded=false のまま⇒保存はするが ★消しはしない★(安全側)。
      // ★解くのは 呼んだ側が 受け取る約束の 中でやる★:
      //  別チェーン(p.then(…))で 解くと、await cloudLoadState() の ★直後の保存が まだ保留★に
      //  なり、読み込み済みなのに 保存が 飛ぶ(2026-09-03 回帰テスト4本が 赤で 見つかった)。
      var done = p.then(function(v){ if(saveHold===done) saveHold=null; return v; },
                        function(e){ if(saveHold===done) saveHold=null; throw e; });
      saveHold = done;
      return done;
    };
    // ── アカウントのプラン状態(exally_entitlements): 司さんが 使える/停止 を制御する層 ──
    // ★Exally共通テーブル: 1人×1アプリ=1行(account_id,app,plan)。請求書/給料明細/今後のアプリを1箇所で管理。
    //   このアプリの識別子=APP。他アプリは app 値を変えて同じテーブルを読むだけ(DB変更不要でアプリ追加可)。
    //   本人は自分の行を"読むだけ"(RLS)。plan変更は司さん(ダッシュボード/service role)のみ。
    var APP = 'payslip';
    Store.getAccount = function(){
      return curUid().then(function(uid){ if(!uid) return null;
        return sb.from('exally_entitlements').select('plan,expires_at').eq('account_id',uid).eq('app',APP).maybeSingle()
          .then(function(r){ return r.data || null; });
      });
    };
    // 初回ログインで(このアプリの)行が無ければ trial 行を自動作成(insertポリシーで plan='trial' 固定)。
    // 管理画面で「誰か」を表示するため email も入れる(自分の行のみ)。
    Store.ensureAccount = function(){
      return sb.auth.getUser().then(function(r){ var u=r.data&&r.data.user; var uid=u&&u.id; if(!uid) return null; var email=u.email||null;
        return sb.from('exally_entitlements').select('account_id').eq('account_id',uid).eq('app',APP).maybeSingle().then(function(rr){
          if(rr.data) return { plan:'trial', existed:true };
          return sb.from('exally_entitlements').insert({ account_id:uid, app:APP, plan:'trial', email:email }).then(function(){ return { plan:'trial', existed:false }; });
        });
      });
    };
  }
  // ── 月次/賞与明細(pay_payslips): 定時決定の4-6月・年末調整の年集計の素 ──
  // 同じ月×同じ従業員は上書き。月次 id='ps_'+ym+'_'+eid / 賞与 id='psb_'+ym+'_'+eid(同月に給与と賞与が併存しても衝突しない)。
  //  ★kind('monthly'|'bonus')を data.kind に埋め込む→取得側で用途別にフィルタ(定時決定/前月比は賞与を除外・年調は含める)★。
  //  DBスキーマ非変更(kindは既存 data jsonb 内)。未kind=旧データ=monthly扱い。未ログイン/未SUPAはlocalStorage層。
  var PS_KEY = 'payslip_payslips_v1';
  function psAll(){ return readList(PS_KEY); }
  function psWrite(arr){ writeList(PS_KEY, arr); }
  /* ★★保存の 入口は 2本（2026-09-15）★★
     (a) Store.cloudSaveState … 設定・従業員（★2026-09-03 から 保留に 掛かっている★）
     (b) Store.savePayslip    … 明細（★ここが 素通りだった★）
     ⇒ ★作る道が 2本 在るのに 片方だけ 直していた★＝今日 見つけた 害の 元。

     ★何が 起きていたか（実測）★
       ログインの 直後、state は まだ ★初期値の『従業員 1』1人★（app.js の 初期値）。
       そこで persistSave が 走ると、★末尾の saveMonthlyPayslips が 待たずに★ (b) を 呼び、
       ★幻の『従業員 1』の 明細を 倉庫に 書く★。
       後から 読み込みが 着いて state が 入れ替わる → 幻の人は 消える
       → ★書かれた 明細だけ 持ち主を 失う＝孤児★。
       数えた … 試験の 倉庫 ★孤児 3,599行（うち『従業員 1』3,466行・毎回 別 id）★
               ★本番の 倉庫 明細 12行中 9行が 孤児★（＝過去に 起きている）

     ★(a) の 真似を そのまま しては いけない★
       (a) は 解ける時に ★中身を 取り直して★ 書く。
       ところが ★明細は 人を 名指しして 書く★ので、そのまま 書き直すと
       ★幻の人の 明細を 改めて 書く★＝★直すつもりで 同じ物を 作る★。
       ⇒ ★解けた後に「その人が まだ 居るか」を 見てから 書く★。
         ・居る … 書く（★本物を 落とさない★）
         ・居ない … ★書かない★（＝幻＝孤児を 作らない）
         ・読めていない（cloudLoaded=false）… ★書く★（消す より 安全側・(a) と 同じ 決め方） */
  Store.savePayslip = function(ym, employeeId, data, kind){
    kind = (kind==='bonus')?'bonus':'monthly';
    var id = (kind==='bonus'?'psb_':'ps_')+ym+'_'+employeeId;
    var d = data||{}; d.kind = kind; // 取得側フィルタ用に用途を記録
    if(saveHold){
      return saveHold.then(function(){ return null; }, function(){ return null; }).then(function(){
        if(!cloudLoaded) return doSavePayslip(id, ym, employeeId, d);   /* 読めていない＝安全側 */
        var fresh = (typeof Store._snapFn==='function') ? Store._snapFn() : null;
        var iru = !!(fresh && (fresh.employees||[]).some(function(e){ return e && e.id===employeeId; }));
        if(!iru) return { ok:false, reason:'held-skipped-maboroshi' };  /* ★幻＝書かない★ */
        return doSavePayslip(id, ym, employeeId, d);
      });
    }
    return doSavePayslip(id, ym, employeeId, d);
  };
  function doSavePayslip(id, ym, employeeId, d){
    if(hasSupa){
      return sb.auth.getUser().then(function(r){ var uid=r.data&&r.data.user&&r.data.user.id; if(!uid) return null;
        return sb.from('pay_payslips').upsert({ id:id, account_id:uid, ym:ym, employee_id:employeeId, data:d, updated_at:new Date().toISOString() });
      });
    }
    var arr=psAll(); var i=arr.findIndex(function(x){ return x.id===id; }); var row={ id:id, ym:ym, employee_id:employeeId, data:d };
    if(i>=0) arr[i]=row; else arr.push(row); psWrite(arr); return Promise.resolve(row);
  }
  /* ★★消した 従業員の 給与明細を 倉庫からも 消す（2026-09-15 司さん「いらん従業員なら 消せや 倉庫に 残すな」）★★
     ★何が 起きていたか★
       「この従業員を削除」は state.employees から 抜くだけ。
       cloudSaveState の 同期が pay_employees の 行は 消すが、
       ★pay_payslips を 消す 所が 1か所も 無かった★（消していたのは payslip_batches と pay_meisai_docs だけ）。
       ⇒ ★人は 消える／明細は 倉庫に 残る＝孤児★。
       実測（2026-09-15）… 客の道で 1人 消したら ★孤児 3,716→3,717＝+1★。
                          本番の 明細 12行中 ★9行が 孤児★／試験の 倉庫は 3,717行。
     ★消してよい 訳★＝★消せるのは ★確定した 明細が 1か月も 無い人★だけ★（app.js の 門）
       ⇒ ★その人の 明細は 全部 未確定★＝★賃金台帳として 残す 義務が かかる 物では ない★
         （労基法108条で 残すのは ★確定した★ 賃金台帳。2026-08-09 に そう 決めて ある）
       ⇒ 実測でも ★本番の 孤児 9行は 確定済み 0行★。
     ★ここで 消さない 物★
       ・`pay_meisai_docs`（従業員が 見る 紙）… ★物理削除しない★＝既に 在る 決め（store.js の すぐ下）
         ⇒ ★Store.unpublishMeisai で 認証情報だけ 無効化する★（＝リンクを 殺す）
       ・`pay_ledger`（Exally台帳）… 別の 棚・別の 決め
     ★★なぜ account_id で 絞っていないか（2026-09-15 実測・★絞り忘れでは ありません★）★★
       ★倉庫の 側で 絞っています（RLS）★＝実測:
         ・kyuyo.pay_payslips … ★RLS ON★／決まり `own_pay_payslips`＝★cmd ALL・(account_id = auth.uid())★
         ・列 account_id … ★空 不可・既定値 auth.uid()★
       ⇒ ★他の 会社の 行は そもそも 見えない／消せない★＝★家の 作法（絞りは RLS に 任せる）★
       ⇒ ★★ここに account_id を 足さないで ください★★（足しても 害は ないが、
          ★「絞り忘れ」と 思って 直す のを 止める 為に 書いています★）
       ★同じ 作法の 隣★ … Store.unpublishMonth（pay_meisai_docs）も 同じ（実測で RLS ON・同じ 決まり）。
       ★★ただし RLS が 守るのは「別の 口」＝★鍵の 種類で 素通りします★★★
         ・`anon`／`authenticated` の 鍵 … ★守られる★（auth.uid() が 入る）
         ・★`service_role` の 鍵 … ★RLS を 素通り★★＝★auth.uid() が 無い★
           ⇒ ★`employee_id` だけ／`ym` だけ の 絞りが ★全部の 口に 当たる★★
         ★実測（2026-09-15・呼ぶ所を 全部 数えた）★
           ・この道を 呼ぶ所 … ★画面（app.js）1か所だけ★
           ・unpublishMonth を 呼ぶ所 … 画面 1か所＋試験 1本（jsdom の ローカル層＝倉庫に 触らない）
           ・repo 全体で `service_role` を 使う所 … ★0件★（★調べた 0件★／
             出て来た 鍵 3本は 中を 開いて ★role=anon★ と 確かめた）
         ⇒ ★★この道は anon／authenticated からだけ 呼ぶ事★★
           ＝★★道具・バッチ・Edge Function など service_role から 呼ばないで ください★★
           （呼ぶなら ★account_id で 自分で 絞る★＝ここの 絞りでは 足りません）

     ★返り★ { ok, n }。★n は 消した 行数★＝★「消しました」と 言って 消えていない を 作らない★為。
     ★倉庫が 無い（オフライン/未ログイン）★… ★手元の 控えだけ 消して ok:true, souko:false★
       ＝★「次の 同期で 消える」とは 言わない★（★同期は 明細を 消さない★＝嘘に なる）。 */
  Store.deletePayslipsOf = function(employeeId){
    if(!employeeId) return Promise.resolve({ ok:false, n:0, naze:'だれの 分か 分からない' });
    if(hasSupa){
      return sb.from('pay_payslips').delete().eq('employee_id', employeeId).select('id').then(function(r){
        if(r.error) return { ok:false, n:0, naze:r.error.message };
        return { ok:true, n:(r.data||[]).length, souko:true };
      }).catch(function(e){ return { ok:false, n:0, naze:String(e&&e.message||e) }; });
    }
    try{
      var arr=psAll(), mae=arr.length;
      var nokoru=arr.filter(function(x){ return x.employee_id!==employeeId; });
      psWrite(nokoru);
      return Promise.resolve({ ok:true, n:mae-nokoru.length, souko:false });
    }catch(e){ return Promise.resolve({ ok:false, n:0, naze:String(e&&e.message||e) }); }
  };

  /* ★★人を 消したら「その人の Web明細の 鍵」も 消す★★（2026-09-18）
     ★なぜ 要るか（実測）★
       `Store.unpublishMeisai` は ★行を 消さず 認証情報だけ 空に する★
         update({ init_code:null, device_tokens:[], consent_at:null, ... })
       ＝★行は 残る★。
       ★★2026-09-24 に 1つ 変えました★★ … ★`pw_hash` は ★消しません★★
         （司さん「1 見れた方がええやろが」＝★辞めた 人も 自分の 明細を 見られる★）
         ⇒ ★★リンクは もう「死ぬ」とは 言えません★★＝★本人の 合言葉なら 開きます★
         ⇒ ★ここの 字を「リンクは 死ぬ」の まま 残すと ★次に 読む 人が 間違えます★★
       テスト線で 数えた … ★公開 78行 中 ★73行が「もう 居ない 人」★★＝残骸。
       ★店の コードに `pay_meisai_pub` を ★消す★ 字は 1つも 無かった★
         （実測 … select 3か所 ／ insert 1か所 ／ update 2か所 ／ ★delete 0か所★）
       ⇒ 司さん「いらん従業員なら 消せや 倉庫に 残すな」に ★まだ 当たって いなかった★。
     ★紙（pay_meisai_docs）は 消さない★＝★お金の 記録は 残す★の 決めが 先に 在る（463行）。
       ⇒ 鍵だけ 消せば ★紙は 残るが 誰も 開けない★＝辻褄は 合う。
     ★他人の 鍵は そもそも 消せない★＝pay_meisai_pub も `account_id = auth.uid()` で 縛られて いる
       （kyuyo/tests/souko-kengen.test.mjs が 毎回 実物の 倉庫に 聞いて いる）。
     ★この端末だけの 時（倉庫なし）★は ★鍵の 控えを 端末に 置いて いない★ので 消す物が 無い＝0件で 成功。 */
  /* ★★★鍵の 行を 消すと ★ぶら下がって いる 紙も 一緒に 消える★★★（2026-09-18 実測で 踏んだ）
       倉庫の 親子（pg_constraint で 数えた）
         pay_meisai_docs  → pay_meisai_pub … ★CASCADE★（公開された 紙＝★お金の 記録★）
         pay_nencho_decl  → pay_meisai_pub … ★CASCADE★（年末調整の 申告＝★本人が 出した 紙★）
         pay_emp_profile  → pay_meisai_pub … ★CASCADE★（本人が 入れた 振込先など）
       ★私は これを 数えずに 消して、テスト線の 紙を 15行→2行に して しまった★
       ＝★「紙は 消さない」と 書いた 当人が 紙を 消した★。
     ⇒ ★★ぶら下がりが 1つでも 在る 鍵は 消さない★★
        （鍵の 認証情報は `unpublishMeisai` が 先に 空に して いる＝★開けない★／★記録は 残る★）
     ⇒ ★何も ぶら下がって いない 鍵だけ 消す★＝司さんの「倉庫に 残すな」も 満たす。 */
  /* ★★道連れの 名簿（ここだけが 正）★★＝`kyuyo/tests/souko-kengen.test.mjs` が
     ★倉庫に 聞いた 実物の 子★と 1本ずつ 突き合わせる。★1本でも 足りなければ 赤★。
     ★名前は わざと 珍しくして 在る★＝他の 所で 同じ 字を 読んでも 混ざらない
       （2026-09-18 … 「どこかに 名前が 在れば 良い」で 数えたら ★抜いても 赤に ならなかった★
         ＝別の 所（store.js:716 の 年調の 読み出し）が 同じ 名前を 持って いた）。 */
  var MICHIZURE_pay_meisai_pub = ['pay_meisai_docs','pay_nencho_decl','pay_emp_profile'];
  function pubNokosu(tokens){                       /* ★残す 鍵（ぶら下がりが 在る）を 選ぶ★ */
    if(!tokens.length) return Promise.resolve([]);
    var tana=MICHIZURE_pay_meisai_pub;
    return Promise.all(tana.map(function(t){
      return sb.from(t).select('token').in('token', tokens).then(function(r){
        if(r.error) throw new Error(t+'：'+r.error.message);
        return (r.data||[]).map(function(x){ return x.token; });
      });
    })).then(function(aa){
      var m={}; aa.forEach(function(a){ a.forEach(function(t){ m[t]=1; }); });
      return Object.keys(m);
    });
  }
  Store.deleteMeisaiPubOf = function(employeeId){
    if(!employeeId) return Promise.resolve({ ok:false, n:0, naze:'だれの 分か 分からない' });
    if(!hasSupa) return Promise.resolve({ ok:true, n:0, nokoshita:0, souko:false });
    return sb.from('pay_meisai_pub').select('token').eq('employee_id', employeeId).then(function(r){
      if(r.error) throw new Error(r.error.message);
      var toks=(r.data||[]).map(function(x){ return x.token; });
      if(!toks.length) return { ok:true, n:0, nokoshita:0, souko:true };
      return pubNokosu(toks).then(function(nokosu){
        var kesu=toks.filter(function(t){ return nokosu.indexOf(t)<0; });
        if(!kesu.length) return { ok:true, n:0, nokoshita:nokosu.length, souko:true };
        return sb.from('pay_meisai_pub').delete().eq('employee_id', employeeId).in('token', kesu).select('token').then(function(d){
          if(d.error) throw new Error(d.error.message);
          return { ok:true, n:(d.data||[]).length, nokoshita:nokosu.length, souko:true };
        });
      });
    }).catch(function(e){ return { ok:false, n:0, nokoshita:0, naze:String(e&&e.message||e) }; });
  };

  Store.getPayslipsByYm = function(ymFrom, ymTo){
    if(hasSupa){
      return fetchAllQ(function(a,b){ return sb.from('pay_payslips').select('ym,employee_id,data',{count:'exact'}).gte('ym',ymFrom).lte('ym',ymTo).range(a,b); })
        .then(function(r){ return r.data||[]; });
    }
    return Promise.resolve(psAll().filter(function(x){ return x.ym>=ymFrom && x.ym<=ymTo; })
      .map(function(x){ return { ym:x.ym, employee_id:x.employee_id, data:x.data }; }));
  };

  // ── K4: Exally台帳(pay_ledger)を期間で読む。二度手間ゼロの源。RLSで自分のアカウント分のみ・削除済み(deleted_at)は除く ──
  //  ★count:'exact' で全部読めたか検知。count>rows.length なら PostgREST上限(既定1000)で"黙って切れた"=合計が過少→truncated:true。
  //  返り: { rows:[{id,employee_id,ymd,data}], count, truncated }。未ログイン/ローカルは空(台帳はクラウド専用)。
  Store.getLedger = function(fromYmd, toYmd){
    if(hasSupa){
      return fetchAllQ(function(a,b){ return sb.from('pay_ledger').select('id,employee_id,ymd,data', { count:'exact' })
          .is('deleted_at', null).gte('ymd', fromYmd).lte('ymd', toYmd).order('ymd', { ascending:true }).range(a,b); })
        .then(function(r){
          if(r.error) return { rows:[], count:0, truncated:false, error:(r.error.message||'error') };
          var rows=r.data||[]; var count=(r.count==null)?rows.length:r.count;
          return { rows:rows, count:count, truncated:(count > rows.length) }; // 全ページ取得後は基本 false(切れ検知は保険)
        }).catch(function(e){ return { rows:[], count:0, truncated:false, error:(e&&e.message)||'exception' }; });
    }
    return Promise.resolve({ rows:[], count:0, truncated:false }); // 台帳はクラウド専用(未ログイン=空)
  };

  // ── K4: 台帳の「行数だけ」を数える(行は1件も読まない) ──
  //  ★何に使うか★＝「台帳から取り込む」を ★出すか出さないか★ だけ。だから head:true(本文なし・countだけ)。
  //    ＝★問い合わせを増やさない★(行を読む getLedger は 押された時だけ)。
  //  返り: { count:Number } ／ ★読めなかった時は { count:null, error:'…' }★
  //  ★読めない を 0件 にしない★（0件＝本当に無い／null＝分からない）。呼び手はどちらでも「出さない」。
  Store.countLedger = function(fromYmd, toYmd){
    if(hasSupa){
      return Promise.resolve(sb.from('pay_ledger').select('id', { count:'exact', head:true })
          .is('deleted_at', null).gte('ymd', fromYmd).lte('ymd', toYmd))
        .then(function(r){
          if(r && r.error) return { count:null, error:(r.error.message||'error') };
          if(!r || typeof r.count!=='number') return { count:null, error:'no-count' }; // ★数が来ない＝分からない★
          return { count:r.count };
        })
        .catch(function(e){ return { count:null, error:(e&&e.message)||'exception' }; });
    }
    return Promise.resolve({ count:0 }); // 台帳はクラウド専用(未ログイン/ローカル=0件)
  };

  // ── Web明細(従業員向け配布・パスワード方式) ──
  // 会社が月次/賞与明細を「Web公開」→従業員は リンク(?t=token)で開き、初回だけ「会社発行の初回コード」で本人を縛って
  // 自分のパスワードを設定→以後はパスワード(＋端末記憶deviceToken)で閲覧。★電子交付の同意(所得税法)まで明細を1バイトも返さない★。
  // 生年月日PINは廃止(同じ誕生日・推測に弱い)。未読/開封(openedAt)を記録。本番=Supabase(schema/RPC)。ここはlocalStorage実装。
  var MPUB_KEY='payslip_meisai_pub_v1', MDOC_KEY='payslip_meisai_docs_v1';
  function mPub(){ return readList(MPUB_KEY); }
  function mPubW(a){ writeList(MPUB_KEY, a); }
  function mDoc(){ return readList(MDOC_KEY); }
  function mDocW(a){ writeList(MDOC_KEY, a); }
  // 簡易ハッシュ(localStorage用・非暗号)。★本番はSupabase RPCでpgcrypto crypt()/bcryptの適正ハッシュ★。
  function hashOf(s){ s=String(s||''); var h=5381; for(var i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))>>>0; } return 'h'+h.toString(36); }
  function rndToken(){ return 't'+Math.random().toString(36).slice(2,10)+Math.random().toString(36).slice(2,6); }
  function rndCode(){ var c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s=''; for(var i=0;i<8;i++){ s+=c[Math.floor(Math.random()*c.length)]; } return s; } // 紛らわしい文字を除いた8桁
  function findPub(token){ var pubs=mPub(); for(var i=0;i<pubs.length;i++){ if(pubs[i].token===token) return { pubs:pubs, i:i, p:pubs[i] }; } return { pubs:pubs, i:-1, p:null }; }
  // 認証: deviceToken(端末記憶) or password で本人確認。OKならpub返す。
  function authPub(p, cred){ cred=cred||{};
    if(cred.deviceToken && (p.deviceTokens||[]).indexOf(cred.deviceToken)>=0) return true;
    if(cred.password!=null && p.pwHash && p.pwHash===hashOf(cred.password)) return true;
    return false; }

  // 会社: 明細を公開。items=[{employeeId,name,ym,kind('monthly'|'bonus'),data(render.js用)}]。従業員ごとに token/初回コードを確保・doc upsert。返り=[{employeeId,name,token,link}]
  /* ★★`opt.naoshi` … ★確定の 後に 直して 出し直した 時★★
     （2026-09-22 司さん「気づかんのやったら 気づくように しろや」）
     ★前★ … 出し直しは `opened_at` を ★触らない★
       ⇒ ★既に 読んだ 人は 未読に 戻らない★＝★★届いて は いるが 気づけない★★
     ★今★ … ★直しの 時だけ `opened_at` を 空に 戻す★＝★未読の 印が もう一度 出る★
     ★普通の 公開は 今までどおり★（最初から 空なので 変わらない） */
  Store.publishMeisai = function(items, opt){
    opt = opt || {};
    if(hasSupa){ // 会社側=authセッション必須(account_id=auth.uid()・RLS)。既存pub(employee_id)は保持し無ければinit_code付きで作成→doc upsert
      return Promise.all((items||[]).map(function(it){
        return sb.from('pay_meisai_pub').select('token').eq('employee_id', it.employeeId).limit(1).then(function(r){
          var ex=(r.data&&r.data[0]);
          var pubP = ex ? Promise.resolve(ex.token)
            : sb.from('pay_meisai_pub').insert({ employee_id:it.employeeId, init_code:rndCode() }).select('token').single().then(function(ir){ return ir.data&&ir.data.token; });
          return pubP.then(function(token){
            if(!token) return null;
            var id='md_'+token+'_'+it.ym+'_'+it.kind;
            var _row = { id:id, token:token, ym:it.ym, kind:it.kind, data:it.data };
            if(opt.naoshi){ _row.opened_at = null; }   /* ★直し＝未読に 戻す★ */
            return sb.from('pay_meisai_docs').upsert(_row).then(function(){
              return { employeeId:it.employeeId, name:it.name, token:token, link:'meisai.html?t='+token };
            });
          });
        });
      })).then(function(arr){ return arr.filter(Boolean); });
    }
    var pubs=mPub(), docs=mDoc(), now=new Date().toISOString(), out=[];
    (items||[]).forEach(function(it){
      var p=pubs.filter(function(x){ return x.employeeId===it.employeeId; })[0];
      if(!p){ p={ token:rndToken(), employeeId:it.employeeId, initCode:rndCode(), pwHash:null, deviceTokens:[], consentAt:null, createdAt:now }; pubs.push(p); }
      // 既発行は token/初回コード/パスワード/同意 を保持(再公開で消さない)
      var id='md_'+p.token+'_'+it.ym+'_'+it.kind;
      var d={ id:id, token:p.token, ym:it.ym, kind:it.kind, name:it.name, data:it.data, publishedAt:now, openedAt:null };
      var di=docs.findIndex(function(x){ return x.id===id; }); if(di>=0){ d.openedAt=opt.naoshi?null:docs[di].openedAt; docs[di]=d; } else docs.push(d);
      out.push({ employeeId:it.employeeId, name:it.name, token:p.token, link:'meisai.html?t='+p.token });
    });
    mPubW(pubs); mDocW(docs); return Promise.resolve(out);
  };
  // 会社: 公開一覧。返り=[{employeeId,name,token,link,hasPassword,initCode(パスワード未設定の間だけ),consentAt,docs:[{ym,kind,openedAt}]}]
  // empIds(現在の名簿=在籍+退職者のemployee_id配列)を渡すと、名簿に居る人だけに絞る。
  //  ★削除済み(名簿に無い)employee_idの公開行は一覧に出さない=既存の幽霊も即消える。empIds未指定なら従来どおり全件。
  Store.listMeisaiPub = function(empIds){
    var keep = Array.isArray(empIds) ? function(id){ return empIds.indexOf(id)>=0; } : function(){ return true; };
    if(hasSupa){ // 会社側=RLSで自分の発行分のみ。init_code/pw_hashは自分の行なので読める(従業員anonは直read不可)
      return Promise.all([
        fetchAllQ(function(a,b){ return sb.from('pay_meisai_pub').select('token,employee_id,init_code,pw_hash,consent_at',{count:'exact'}).range(a,b); }),
        fetchAllQ(function(a,b){ return sb.from('pay_meisai_docs').select('token,ym,kind,published_at,opened_at,data',{count:'exact'}).range(a,b); })
      ]).then(function(res){
        var pubs=(res[0].data||[]), docs=(res[1].data||[]);
        return pubs.filter(function(p){ return keep(p.employee_id); }).map(function(p){
          var ds=docs.filter(function(x){ return x.token===p.token; }).map(function(x){ return { ym:x.ym, kind:x.kind, name:(x.data&&x.data.person&&x.data.person.name)||'', publishedAt:x.published_at, openedAt:x.opened_at }; });
          var nm=(ds[0]&&ds[0].name)||''; var hasPw=!!p.pw_hash;
          return { employeeId:p.employee_id, name:nm, token:p.token, link:'meisai.html?t='+p.token, hasPassword:hasPw, initCode:(hasPw?null:p.init_code), consentAt:p.consent_at, docs:ds };
        });
      });
    }
    var pubs=mPub(), docs=mDoc();
    return Promise.resolve(pubs.filter(function(p){ return keep(p.employeeId); }).map(function(p){
      var ds=docs.filter(function(x){ return x.token===p.token; }).map(function(x){ return { ym:x.ym, kind:x.kind, name:x.name, publishedAt:x.publishedAt, openedAt:x.openedAt }; });
      var nm=(ds[0]&&ds[0].name)||''; var hasPw=!!p.pwHash;
      return { employeeId:p.employeeId, name:nm, token:p.token, link:'meisai.html?t='+p.token, hasPassword:hasPw, initCode:(hasPw?null:p.initCode), consentAt:p.consentAt, docs:ds };
    }));
  };
  /* ★その月の 公開明細を 消す（＝「今月の確定を 取り消す」の 中身）★（2026-09-07）
     ★なぜ 足したか（司さん「やって」）★
       前は 確定の 確認に「あとから 月ごとに 取り消す方法は ありません」と 書いてあった。
       ★知り合いに 渡すと、練習で 押した 月が 永久に 従業員に 見えたままに なる★。
       倉庫は 消させてくれる事を 実測した（自分の 行は 消せる／★他人の 行は 0行★）。
       ⇒ アプリ側に 道が 無かっただけ。
     ★消すのは その月の 明細の 中身(pay_meisai_docs)だけ★。
       公開の 入口(pay_meisai_pub＝従業員の リンクと パスワード)は ★触らない★
       ＝他の月は 今までどおり 見られる・リンクを 配り直さなくてよい。
     ★他人の 分は 消えない★＝RLSが 自分の 行しか 触らせない（2026-09-07 実測で 確かめた）。
     kind … 'monthly'（月次）／'bonus'（賞与）／'gensen'（源泉徴収票）。省くと その月の 全部。 */
  Store.unpublishMonth = function(ym, kind){
    if(!ym) return Promise.resolve({ ok:false, n:0 });
    if(hasSupa){
      var q = sb.from('pay_meisai_docs').delete().eq('ym', ym);
      if(kind) q = q.eq('kind', kind);
      return q.select('id').then(function(r){
        if(r.error) return { ok:false, n:0, err:r.error.message };
        return { ok:true, n:(r.data||[]).length };
      }).catch(function(e){ return { ok:false, n:0, err:String(e&&e.message||e) }; });
    }
    try{
      var docs=mDoc(), mae=docs.length;
      var nokoru=docs.filter(function(d){ return !(d.ym===ym && (!kind || d.kind===kind)); });
      mDocW(nokoru);
      return Promise.resolve({ ok:true, n:mae-nokoru.length });
    }catch(e){ return Promise.resolve({ ok:false, n:0 }); }
  };
  /* ★★従業員を 消した 時＝本人の 合言葉だけ 残す（2026-09-24 司さん「1 見れた方がええやろが」）★★
     ★前（2026-09-24 まで）★ … ★4つとも 空に して いた★
        `init_code:null, ★pw_hash:null★, device_tokens:[], consent_at:null`
        ⇒ ★★辞めた 人は 自分の 給与明細・源泉徴収票を ★二度と 開けない★★★
          （紙 `pay_meisai_docs` は 残る＝★会社は 見られる／本人は 見られない★）
     ★今★ … ★★`pw_hash` は 消さない★★＝★本人が 決めた 合言葉で 開ける★
     ★なぜ 他の 3つは 今まで通り 空に するか（★なぜ しなかったか★）★
       ・`device_tokens` … ★その 端末は 合言葉 無しで 開く★＝★人に 渡った／無くした 端末で 開かせない★
       ・`init_code` …… ★初回登録の コード★＝★辞めた 後に 新しく 登録させない★
       ・`consent_at` … ★空でも 開ける（もう一度 同意を 取るだけ）★＝止めては いない
     ★安全と 言える 訳（★倉庫の 字で 確かめた★）★
       `get_meisai(p_token, …)` は ★`where token = p_token` の 紙しか 返さない★
       ⇒ ★★鍵 1本で 引けるのは ★本人の 分だけ★／他人の 紙は 1行も 引けない★★
     ★★★この 直しで ★失う 物★（黙って 失わない）★★★
       ・★★消した 人の リンクを 会社は ★二度と 止められません★★★
         … 止める 押しは `.wm-reissue`（リンク再発行）だが、
           `listMeisaiPub(rosterIds())` が ★名簿に 居ない 人を 一覧から 外す★
           ⇒ ★★止める 相手が 画面に 出ない★★
         … ★困る 時★＝★辞めた 人の 電話が 人手に 渡った／会社が 切りたい★
         … ★戻すには★ ★消した 人も 一覧に 出す★ 必要が 在る（★未着手★）
       ・★★『辞めた 人の リンクを 会社が 止められなくて よいか』は 司さんの 決め★★（棚）
     ★★これで 直らない 物（先に 書く）★★
       ・★既に 消した 人は 戻りません★＝★`pw_hash` を 消して しまった＝戻す 字が 無い★
       ・★出し直す 押し（`.wm-reissue` リンク再発行）は 在るが
         `listMeisaiPub(rosterIds())` が ★名簿に 居ない 人を 一覧から 外す★＝★押せない★★
     ★pay_meisai_docs は 物理削除しない★＝pub を 消すと ★cascade で 紙も 消える★（既存の 決め）。
     ★オフライン/未ログインは no-op で 安全に★（RLS で auth.uid()=null は 0行 更新）。 */
  /* ★★ここに `pw_hash` を 足すな★★
     足すと ★辞めた 人が 自分の 明細を 二度と 開けなく なります★
     （前は そうで、本人は「初回設定の 画面」に 落ち `init_code` も 空＝★行き止まり★だった）。
     ★見張り★ … `kyuyo/tests/emp-kesu-meisai.test.mjs` の ⑨（★CI で 毎回 走る 字の 門★）
     ★絵の 門★ … `kyuyo/tests/yameta-hito-mieru.mjs`（★手で 回す★＝CI に 倉庫の 鍵が 無い） */
  Store.unpublishMeisai = function(employeeId){
    if(!employeeId) return Promise.resolve({ ok:false });
    if(hasSupa){
      return sb.from('pay_meisai_pub').update({ init_code:null, device_tokens:[], consent_at:null, fail_count:0, locked_until:null })
        .eq('employee_id', employeeId).then(function(r){ return { ok:!r.error }; }).catch(function(){ return { ok:false }; });
    }
    try{ var pubs=mPub(); var changed=false; pubs.forEach(function(p){ if(p.employeeId===employeeId){ p.initCode=null; p.deviceTokens=[]; p.consentAt=null; changed=true; } }); if(changed) mPubW(pubs); }catch(e){}
    return Promise.resolve({ ok:true });
  };
  // 従業員: トークンの状態(初回か/記憶済か)。★明細/コードは返さない★。返り={found,hasPassword,remembered,name}
  Store.meisaiAuth = function(token, deviceToken){
    if(hasSupa){ // 従業員=匿名RPC(明細/コードは返らない)。氏名は認証後にdocsから
      return sb.rpc('meisai_auth', { p_token:token, p_device:deviceToken||null }).then(function(r){
        var d=r.data||{}; if(!d.found) return { found:false };
        return { found:true, hasPassword:!!d.has_password, remembered:!!d.remembered, locked:!!d.locked, name:'' };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ found:false });
    var remembered=!!(deviceToken && (f.p.deviceTokens||[]).indexOf(deviceToken)>=0);
    var docs=mDoc().filter(function(x){ return x.token===token; });
    var nm=remembered ? ((docs[0]&&docs[0].name)||'') : ''; // ★氏名は認証済(端末記憶)のみ返す。認証前は個人特定情報を出さない
    return Promise.resolve({ found:true, hasPassword:!!f.p.pwHash, remembered:remembered, name:nm });
  };
  // 従業員: 初回パスワード設定(会社発行の初回コードで本人を縛る)。返り={ok} or {badInit} or {alreadySet}
  Store.meisaiSetPassword = function(token, initCode, password){
    if(hasSupa){
      return sb.rpc('meisai_set_password', { p_token:token, p_init:initCode, p_pw:password }).then(function(r){
        var d=r.data||{}; return { ok:!!d.ok, badInit:!!d.bad_init, alreadySet:!!d.already_set, weak:!!d.weak, locked:!!d.locked, remaining:d.remaining };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false, notFound:true });
    if(f.p.pwHash) return Promise.resolve({ ok:false, alreadySet:true });
    if(String(initCode||'').toUpperCase().trim()!==String(f.p.initCode||'')) return Promise.resolve({ ok:false, badInit:true });
    if(String(password||'').length<8) return Promise.resolve({ ok:false, weak:true });
    f.p.pwHash=hashOf(password); f.p.initCode=null; mPubW(f.pubs);
    return Promise.resolve({ ok:true });
  };
  // 従業員: パスワード照合→OKで端末記憶用deviceToken発行。返り={ok,deviceToken} or {bad}
  Store.meisaiVerifyPassword = function(token, password){
    if(hasSupa){
      return sb.rpc('meisai_verify', { p_token:token, p_pw:password }).then(function(r){
        var d=r.data||{}; return { ok:!!d.ok, deviceToken:d.device_token, locked:!!d.locked, remaining:d.remaining };
      });
    }
    var f=findPub(token); if(!f.p || !f.p.pwHash) return Promise.resolve({ ok:false });
    if(f.p.pwHash!==hashOf(password)) return Promise.resolve({ ok:false, bad:true });
    var dt=rndToken(); if(!f.p.deviceTokens)f.p.deviceTokens=[]; f.p.deviceTokens.push(dt); mPubW(f.pubs);
    return Promise.resolve({ ok:true, deviceToken:dt });
  };
  // 従業員: 明細取得。cred={deviceToken}or{password}。★認証NG/同意前は docs を1件も返さない★。返り={docs,name}|{needConsent,name}|{unauth}
  Store.getMeisaiDocs = function(token, cred){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('get_meisai', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null }).then(function(r){
        var d=r.data||{}; if(d.unauth) return { unauth:true };
        // get_meisaiは各docのopened_atを返す(per-doc未読)。既読化はmark_meisai_openedで1件ずつ。氏名は先頭docのdata.personから
        var ds=(d.docs||[]).map(function(x){ return { id:x.id, ym:x.ym, kind:x.kind, name:(x.data&&x.data.person&&x.data.person.name)||'', data:x.data, openedAt:x.openedAt||null }; });
        var nm=(ds[0]&&ds[0].name)||'';
        if(d.need_consent) return { needConsent:true, name:nm };
        return { name:nm, docs:ds };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ unauth:true });
    if(!authPub(f.p, cred)) return Promise.resolve({ unauth:true });
    var docs=mDoc().filter(function(x){ return x.token===token; }).sort(function(a,b){ return (b.ym||'').localeCompare(a.ym||''); });
    var nm=(docs[0]&&docs[0].name)||'';
    if(!f.p.consentAt) return Promise.resolve({ needConsent:true, name:nm });
    return Promise.resolve({ name:nm, consentAt:f.p.consentAt,
      docs:docs.map(function(x){ return { id:x.id, ym:x.ym, kind:x.kind, name:x.name, data:x.data, openedAt:x.openedAt }; }) });
  };
  // 従業員: 電子交付に同意(認証必須)。返り={ok,consentAt} or {unauth}
  Store.setMeisaiConsent = function(token, cred){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('set_meisai_consent', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null }).then(function(r){
        var d=r.data||{}; return { ok:!!d.ok, unauth:!!d.unauth };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false });
    if(!authPub(f.p, cred)) return Promise.resolve({ ok:false, unauth:true });
    if(!f.p.consentAt){ f.p.consentAt=new Date().toISOString(); mPubW(f.pubs); }
    return Promise.resolve({ ok:true, consentAt:f.p.consentAt });
  };
  // 会社: 初回コード再発行(＝旧パスワード/記憶を無効化・本人が再設定)。返り={ok,initCode}
  Store.reissueMeisaiInit = function(token){
    if(hasSupa){ var code=rndCode(); // 会社側=RLSで自分の行のみ。旧PW/端末記憶/同意/ロックを全リセット(別人が再設定→前任者の同意を引き継がない=電子交付要件)
      return sb.from('pay_meisai_pub').update({ init_code:code, pw_hash:null, device_tokens:[], consent_at:null, fail_count:0, locked_until:null }).eq('token', token).then(function(r){
        return { ok:!r.error, initCode:code };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false });
    f.p.initCode=rndCode(); f.p.pwHash=null; f.p.deviceTokens=[]; f.p.consentAt=null; mPubW(f.pubs); // ★同意もリセット=別人が再設定した時に前任者の同意を引き継がない(電子交付要件)
    return Promise.resolve({ ok:true, initCode:f.p.initCode });
  };
  // 従業員: 明細を開いた(その1件だけopenedAt記録)。cloud=RPC mark_meisai_opened(認証必須)。cred={deviceToken}|{password}
  Store.markMeisaiOpened = function(docId, token, cred){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('mark_meisai_opened', { p_token:token, p_id:docId, p_device:cred.deviceToken||null, p_pw:cred.password||null }).then(function(r){ return !!(r.data&&r.data.ok); });
    }
    var docs=mDoc(); var i=docs.findIndex(function(x){ return x.id===docId; });
    if(i>=0 && !docs[i].openedAt){ docs[i].openedAt=new Date().toISOString(); mDocW(docs); }
    return Promise.resolve(true);
  };

  // ── 年末調整 従業員セルフ申告(Web明細から本人が入力→会社が取り込む) ──
  //  本番=Supabase RPC(save_nencho_decl/get_nencho_decl・認証は明細と同じdevice/pw)。localStorage層は下のMNCH。
  //  declは lib/nencho-declaration.js の normalize済オブジェクト(サーバは中身を検証せず保管)。
  var MNCH_KEY='payslip_nencho_decl_v1';
  function mNch(){ return readList(MNCH_KEY); }   /* ★壊れていたら 書き込みを止める★（5対と同じ形） */
  function mNchW(a){ try{ localStorage.setItem(MNCH_KEY, JSON.stringify(a)); }catch(e){} }
  // 従業員: 申告を保存(認証必須)。返り={ok} or {unauth}
  Store.saveNenchoDecl = function(token, cred, year, decl){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('save_nencho_decl', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null, p_year:year, p_decl:decl||{} }).then(function(r){
        var d=r.data||{}; return { ok:!!d.ok, unauth:!!d.unauth, badYear:!!d.bad_year, locked:!!d.locked };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false, unauth:true });
    if(!authPub(f.p, cred)) return Promise.resolve({ ok:false, unauth:true });
    var now=new Date().toISOString(), all=mNch();
    var i=all.findIndex(function(x){ return x.token===token && x.year===year; });
    var row={ token:token, employeeId:f.p.employeeId, year:year, decl:decl||{}, submittedAt:(i>=0?all[i].submittedAt:now), updatedAt:now };
    if(i>=0) all[i]=row; else all.push(row); mNchW(all);
    return Promise.resolve({ ok:true });
  };
  // 従業員: 自分の申告を取得(前回の続き/確認)。返り={found,decl,submittedAt,updatedAt} or {unauth}
  Store.getNenchoDecl = function(token, cred, year){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('get_nencho_decl', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null, p_year:year }).then(function(r){
        var d=r.data||{}; if(d.unauth) return { unauth:true }; if(!d.found) return { found:false };
        return { found:true, decl:d.decl||{}, submittedAt:d.submittedAt, updatedAt:d.updatedAt };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ unauth:true });
    if(!authPub(f.p, cred)) return Promise.resolve({ unauth:true });
    var row=mNch().filter(function(x){ return x.token===token && x.year===year; })[0];
    if(!row) return Promise.resolve({ found:false });
    return Promise.resolve({ found:true, decl:row.decl||{}, submittedAt:row.submittedAt, updatedAt:row.updatedAt });
  };
  // 会社: 提出済みの申告一覧(その年)。RLSで自分の発行分のみ。返り=[{employeeId,decl,submittedAt,updatedAt}]
  Store.listNenchoDecl = function(year){
    if(hasSupa){
      return fetchAllQ(function(a,b){ return sb.from('pay_nencho_decl').select('employee_id,decl,submitted_at,updated_at',{count:'exact'}).eq('year', year).range(a,b); }).then(function(r){
        return (r.data||[]).map(function(x){ return { employeeId:x.employee_id, decl:x.decl||{}, submittedAt:x.submitted_at, updatedAt:x.updated_at }; });
      });
    }
    return Promise.resolve(mNch().filter(function(x){ return x.year===year; }).map(function(x){ return { employeeId:x.employeeId, decl:x.decl||{}, submittedAt:x.submittedAt, updatedAt:x.updatedAt }; }));
  };

  // ── 従業員セルフ登録: 振込先(本人がWeb明細から登録→会社が従業員マスタへ取り込む) ──
  //  本番=Supabase RPC(save_emp_profile/get_emp_profile・認証は明細と同じ)。localStorage層は下のMPRF。
  var MPRF_KEY='payslip_emp_profile_v1';
  function mPrf(){ return readList(MPRF_KEY); }
  function mPrfW(a){ writeList(MPRF_KEY, a); }
  // 従業員: 振込先を保存(認証必須)。返り={ok} or {unauth}
  Store.saveEmpProfile = function(token, cred, data){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('save_emp_profile', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null, p_data:data||{} }).then(function(r){
        var d=r.data||{}; return { ok:!!d.ok, unauth:!!d.unauth, locked:!!d.locked };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false, unauth:true });
    if(!authPub(f.p, cred)) return Promise.resolve({ ok:false, unauth:true });
    var now=new Date().toISOString(), all=mPrf();
    var i=all.findIndex(function(x){ return x.token===token; });
    var row={ token:token, employeeId:f.p.employeeId, data:data||{}, submittedAt:(i>=0?all[i].submittedAt:now), updatedAt:now };
    if(i>=0) all[i]=row; else all.push(row); mPrfW(all);
    return Promise.resolve({ ok:true });
  };
  // 従業員: 自分の登録を取得。返り={found,data,submittedAt,updatedAt} or {unauth}
  Store.getEmpProfile = function(token, cred){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('get_emp_profile', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null }).then(function(r){
        var d=r.data||{}; if(d.unauth) return { unauth:true }; if(!d.found) return { found:false };
        return { found:true, data:d.data||{}, submittedAt:d.submittedAt, updatedAt:d.updatedAt };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ unauth:true });
    if(!authPub(f.p, cred)) return Promise.resolve({ unauth:true });
    var row=mPrf().filter(function(x){ return x.token===token; })[0];
    if(!row) return Promise.resolve({ found:false });
    return Promise.resolve({ found:true, data:row.data||{}, submittedAt:row.submittedAt, updatedAt:row.updatedAt });
  };
  // 会社: 提出済みの振込先一覧。RLSで自分の発行分のみ。返り=[{employeeId,data,submittedAt,updatedAt}]
  Store.listEmpProfile = function(){
    if(hasSupa){
      return fetchAllQ(function(a,b){ return sb.from('pay_emp_profile').select('employee_id,data,submitted_at,updated_at',{count:'exact'}).range(a,b); }).then(function(r){
        return (r.data||[]).map(function(x){ return { employeeId:x.employee_id, data:x.data||{}, submittedAt:x.submitted_at, updatedAt:x.updated_at }; });
      });
    }
    return Promise.resolve(mPrf().map(function(x){ return { employeeId:x.employeeId, data:x.data||{}, submittedAt:x.submittedAt, updatedAt:x.updatedAt }; }));
  };

  // 中央の法定データ(statutory テーブル)を取得。全アプリ共通・anon読取可。localやDB無しは[]=libのハードコードで動く(フォールバック)。
  // ★出典(source_url)と確認日(verified_at)も取る。表にあるのに取っていなかった＝
  //   「なぜその金額か」を客に言えるようにするため（provenance）。2026-08-03
  Store.getStatutory = function(){
    if(hasSupa){ return fetchAllQ(function(a,b){ return sb.from('statutory').select('kind,year,data,source_url,verified_at',{count:'exact'}).range(a,b); }).then(function(r){ return r.data||[]; }).catch(function(){ return []; }); }
    return Promise.resolve([]);
  };

  /* ★共有データ層（js/suite-data.js）に渡す為だけの口★（2026-08-28）
     会社名・住所の持ち主は ★入口の「会社の設定」(pay_org)★になった。
     給与は ★読むだけ★＝ここで作った client を そのまま貸す（★2つ目の client を作らない★＝
     ログインの状態が2つに割れる）。 */
  Store._client = sb;

  global.Store = Store;
})(window);
