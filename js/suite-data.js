/* suite-data.js — Exallyスイート 共有データ層(E0)
 * 契約の一次情報 = docs/SPEC_shared_schema.md v2 / DDL = supabase/schema-exally.sql
 *
 * 役割: 1アカウント(account_id)の共有マスタを、全モジュールから同じ形で読み書きする1枚の層。
 *   pay_employees ... 従業員マスタ(Kyuallyと共有。★Exallyは allowlist のキーしか書かない★)
 *   pay_org       ... 自社情報(屋号/住所/インボイス番号/印影/事業一覧)
 *   pay_partners  ... 取引先
 *   pay_ledger    ... 日次/期間台帳(人×日付×{売上/時間/金額})
 *   exally_entitlements ... 利用権(既存・アプリ毎1行)
 *
 * ★絶対に守る事(実測に基づく・テストで担保)★
 *   1. pay_employees.data には EXALLY_EMP_KEYS のキーだけ書く。read-modify-write。
 *      Kyuallyは従業員を data に丸ごと書くが未知キーは保持する(mergeEmp)ので共存できる。
 *      "_"始まりは Kyually の保存(stripTransient)で静かに消えるので禁止。
 *   2. 従業員を更新したら pay_companies の updated_at だけ空更新する。
 *      Kyuallyの競合検知は pay_companies.updated_at しか見ないので、これが無いと
 *      開きっぱなしのKyuallyタブが Exally の変更を静かに巻き戻す。data は絶対に触らない。
 *   3. pay_payslips には書かない。同じ月に期間行が複数あると賃金台帳(労基法108条)が
 *      後勝ちで欠ける。Kyually側に「同月の複数期間を合算」が入るまで Exally は台帳のみ。
 *   4. お金の記録(台帳/取引先)は deleted_at のソフト削除。物理削除しない。
 *   5. 失敗を握り潰さない。書けなかったら {ok:false, reason} を返す(嘘の成功を返さない)。
 *
 * 使い方(ブラウザ): SuiteData.create({ client: supabaseClient })
 * 使い方(Node/テスト): require('./suite-data.js').create({ client: fake, newId: fn })
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.SuiteData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── §2-1 Exallyが pay_employees.data に書いてよいキー(これ以外は例外) ──
  var EXALLY_EMP_KEYS = ['employmentType', 'business'];
  var EMPLOYMENT_TYPES = ['従業員', '業務委託'];
  var EMP_DEFAULTS = { employmentType: '従業員', business: '' };

  function isYmd(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  // allowlist の検査。違反は「書く前に」例外で止める(壊れた行を残さない)
  function assertEmpPatch(patch) {
    if (!patch || typeof patch !== 'object') throw new Error('patch がオブジェクトではありません');
    var keys = Object.keys(patch);
    if (!keys.length) throw new Error('patch が空です');
    keys.forEach(function (k) {
      if (k.charAt(0) === '_') throw new Error('"_"始まりのキーは使えません(保存時に消えます): ' + k);
      if (EXALLY_EMP_KEYS.indexOf(k) < 0) throw new Error('Exallyが従業員に書けないキーです: ' + k + '（書けるのは ' + EXALLY_EMP_KEYS.join(' / ') + ' だけ）');
    });
    if ('employmentType' in patch && EMPLOYMENT_TYPES.indexOf(patch.employmentType) < 0) {
      throw new Error('employmentType は ' + EMPLOYMENT_TYPES.join(' / ') + ' のどちらかです: ' + patch.employmentType);
    }
    if ('business' in patch && typeof patch.business !== 'string') throw new Error('business は文字列です');
    return true;
  }

  // 従業員 data に Exally の既定値を「読む時だけ」当てる(DBには書かない=Kyuallyの行を触らない)
  function readEmp(row) {
    var d = (row && row.data) || {};
    var out = { id: row.id, sort: row.sort, name: d.name || '', data: d, updatedAt: row.updated_at };
    for (var k in EMP_DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(EMP_DEFAULTS, k)) out[k] = (d[k] == null || d[k] === '') ? EMP_DEFAULTS[k] : d[k];
    }
    return out;
  }

  function err(e) { return (e && (e.message || e.reason)) || 'error'; }

  // 入力検査の失敗も「拒否されたPromise」で返す(同期throwと非同期失敗の2系統に割れない)。
  // 呼び出し側は .catch / try-await の1本だけ書けばよい。
  function P(fn) { try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); } }

  function create(opts) {
    opts = opts || {};
    var sb = opts.client;
    if (!sb) throw new Error('SuiteData.create: client(supabaseクライアント) が必要です');
    var seq = 0;
    // id は「同じミリ秒に別タブで作っても衝突しない」よう乱数を混ぜる(連番だけだとタブ間で被る)
    var newId = opts.newId || function (prefix) {
      seq++;
      return prefix + '_' + Math.abs(Date.now()).toString(36) + '_' + seq.toString(36) + Math.random().toString(36).slice(2, 6);
    };
    var nowIso = opts.now || function () { return new Date().toISOString(); };

    function uid() {
      return Promise.resolve(sb.auth.getUser()).then(function (r) {
        return (r && r.data && r.data.user && r.data.user.id) || null;
      }).catch(function () { return null; });
    }
    function me() {
      return Promise.resolve(sb.auth.getUser()).then(function (r) {
        return (r && r.data && r.data.user) || null;
      }).catch(function () { return null; });
    }

    // ── 全件ページング(PostgREST既定 max_rows=1000 で"黙って"切れるのを根治) ──
    //  build=(from,to)=>.select(cols,{count:'exact'})...range(from,to) を付けた完成クエリ。返り={data,error,count}。
    //  ★次ページの開始は「実際に返ってきた件数」で進める。サーバ上限がページ幅より小さくても取りこぼさない。
    function fetchAllQ(build) {
      var out = [], from = 0, size = 1000;
      function step() {
        return Promise.resolve(build(from, from + size - 1)).then(function (r) {
          if (r && r.error) return { data: null, error: r.error };
          var got = (r && r.data) || [];
          out = out.concat(got);
          if (!got.length || r.count == null || out.length >= r.count) {
            return { data: out, error: null, count: (r && r.count != null) ? r.count : out.length };
          }
          from += got.length;   // ★size ではなく実受信数で進める(上限<ページ幅でも漏れない)
          return step();
        });
      }
      return step();
    }

    // ── §2-2 Kyuallyの競合検知を起こすための「updated_at だけ」空更新 ──
    //   data は読みも書きもしない。行が無ければ 0行更新=無害(勝手に作らない)。
    function touchCompanies(u) {
      return Promise.resolve(sb.from('pay_companies').update({ updated_at: nowIso() }).eq('account_id', u))
        .then(function () { return true; }).catch(function () { return false; });
    }

    var api = {
      EXALLY_EMP_KEYS: EXALLY_EMP_KEYS,
      EMPLOYMENT_TYPES: EMPLOYMENT_TYPES,
      assertEmpPatch: assertEmpPatch,
      isYmd: isYmd,

      /* ═══ 従業員マスタ(Kyuallyと共有) ═══ */
      employees: {
        // 一覧(RLSで自分のぶんだけ)。Exallyの既定値は読み時に当てるだけ=DBは書き換えない。
        list: function () {
          return fetchAllQ(function (a, b) {
            return sb.from('pay_employees').select('id,sort,data,updated_at', { count: 'exact' }).order('sort', { ascending: true }).range(a, b);
          }).then(function (r) {
            if (r && r.error) throw new Error(err(r.error));
            return (r.data || []).map(readEmp);
          });
        },
        // ★allowlist のキーだけを read-modify-write で更新 → pay_companies.updated_at を空更新
        patch: function (id, patch) {
          return P(function () {
          assertEmpPatch(patch);                                   // 違反は書く前に止める(Promise拒否)
          return uid().then(function (u) {
            if (!u) return { ok: false, reason: 'no-user' };
            return Promise.resolve(sb.from('pay_employees').select('id,sort,data').eq('id', id).maybeSingle())
              .then(function (r) {
                if (r && r.error) return { ok: false, reason: err(r.error) };
                var row = r && r.data;
                if (!row) return { ok: false, reason: 'not-found' };   // 黙って新規作成しない
                var data = Object.assign({}, row.data || {});
                EXALLY_EMP_KEYS.forEach(function (k) { if (k in patch) data[k] = patch[k]; });
                return Promise.resolve(sb.from('pay_employees').upsert({ id: id, account_id: u, sort: row.sort, data: data, updated_at: nowIso() }))
                  .then(function (w) {
                    if (w && w.error) return { ok: false, reason: err(w.error) };
                    return touchCompanies(u).then(function () { return { ok: true, id: id, data: data }; });
                  });
              }).catch(function (e) { return { ok: false, reason: err(e) }; });
          });
          });
        }
      },

      /* ═══ 会社設定(pay_companies)は「読むだけ」 ═══ */
      //  ★締め方(shimeMethod/shimeN)は Kyually の会社設定が唯一の源(E2)。
      //    Exally は読んで表示するだけ＝設定UIを作らない(二重管理を作らない)。
      //    書き込みは §2-2 の updated_at 空更新のみ(data は絶対に触らない)。
      company: {
        // 締め方を読む。行が無い/未設定は monthly(分割なし)として返す。
        getShime: function () {
          return Promise.resolve(sb.from('pay_companies').select('data').maybeSingle())
            .then(function (r) {
              if (r && r.error) throw new Error(err(r.error));
              var co = (r && r.data && r.data.data && r.data.data.company) || {};
              var m = co.shimeMethod;
              if (['monthly', 'half', 'ten', 'ndays'].indexOf(m) < 0) m = 'monthly';
              var n = Number(co.shimeN);
              return { method: m, n: (isFinite(n) && n > 0) ? Math.floor(n) : 10, fromKyually: !!co.shimeMethod };
            });
        }
      },

      /* ═══ 自社情報(pay_org) ═══ */
      org: {
        get: function () {
          return Promise.resolve(sb.from('pay_org').select('data,updated_at').maybeSingle())
            .then(function (r) {
              if (r && r.error) throw new Error(err(r.error));
              return (r && r.data) ? r.data.data : null;             // 未作成は null(空を捏造しない)
            });
        },
        // 差分マージ(既存キーを消さない)
        save: function (patch) {
          return P(function () {
          if (!patch || typeof patch !== 'object') throw new Error('patch がオブジェクトではありません');
          return uid().then(function (u) {
            if (!u) return { ok: false, reason: 'no-user' };
            return Promise.resolve(sb.from('pay_org').select('data').eq('account_id', u).maybeSingle())
              .then(function (r) {
                if (r && r.error) return { ok: false, reason: err(r.error) };
                var data = Object.assign({}, (r && r.data && r.data.data) || {}, patch);
                return Promise.resolve(sb.from('pay_org').upsert({ account_id: u, data: data, updated_at: nowIso() }))
                  .then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error) } : { ok: true, data: data }; });
              }).catch(function (e) { return { ok: false, reason: err(e) }; });
          });
          });
        }
      },

      /* ═══ 取引先(pay_partners) ═══ */
      partners: {
        list: function () {
          return fetchAllQ(function (a, b) {
            return sb.from('pay_partners').select('id,sort,data,updated_at', { count: 'exact' }).is('deleted_at', null).order('sort', { ascending: true }).range(a, b);
          }).then(function (r) {
            if (r && r.error) throw new Error(err(r.error));
            return r.data || [];
          });
        },
        upsert: function (p) {
          return P(function () {
          p = p || {};
          if (p.data == null || typeof p.data !== 'object') throw new Error('data がオブジェクトではありません');
          return uid().then(function (u) {
            if (!u) return { ok: false, reason: 'no-user' };
            var id = p.id || newId('pt');
            // ★upsert は行を丸ごと置換する(欠けた列は既定値に戻る)。既存を直す時は
            //   sort を渡さないと並び順が黙って0に戻るので、既存行から引き継ぐ。
            var pre = p.id ? Promise.resolve(sb.from('pay_partners').select('sort').eq('id', id).maybeSingle()) : Promise.resolve({ data: null });
            return pre.then(function (r) {
              if (r && r.error) return { ok: false, reason: err(r.error) };
              var sort = (p.sort != null) ? p.sort : ((r && r.data && r.data.sort) || 0);
              return Promise.resolve(sb.from('pay_partners').upsert({ id: id, account_id: u, sort: sort, data: p.data, deleted_at: null, updated_at: nowIso() }))
                .then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error) } : { ok: true, id: id }; });
            }).catch(function (e) { return { ok: false, reason: err(e) }; });
          });
          });
        },
        // ソフト削除(物理削除しない)
        remove: function (id) {
          return Promise.resolve(sb.from('pay_partners').update({ deleted_at: nowIso(), updated_at: nowIso() }).eq('id', id))
            .then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error) } : { ok: true }; })
            .catch(function (e) { return { ok: false, reason: err(e) }; });
        }
      },

      /* ═══ 日次/期間台帳(pay_ledger) ═══ */
      ledger: {
        // 期間で読む(from/to は 'YYYY-MM-DD'・両端を含む)。employeeId 省略で全員。
        list: function (q) {
          return P(function () {
          q = q || {};
          if (!isYmd(q.from) || !isYmd(q.to)) throw new Error('from/to は YYYY-MM-DD です');
          // ★count:'exact' + range で全ページ取り切る。PostgREST はサーバ側の上限(Supabase既定1000行)で
          //   黙って切る＝お金の集計が静かに過少になるので、期間を短く区切らせず全件読む(取りこぼしゼロ)。
          return fetchAllQ(function (a, b) {
            var sel = sb.from('pay_ledger').select('id,employee_id,ymd,data,updated_at', { count: 'exact' }).is('deleted_at', null)
              .gte('ymd', q.from).lte('ymd', q.to);
            if (q.employeeId) sel = sel.eq('employee_id', q.employeeId);
            return sel.order('ymd', { ascending: true }).range(a, b);
          }).then(function (r) {
            if (r && r.error) throw new Error(err(r.error));
            return (r.data || []).map(function (x) {
              return { id: x.id, employeeId: x.employee_id, ymd: x.ymd, data: x.data || {}, updatedAt: x.updated_at };
            });
          });
          });
        },
        // 1件の実績を入れる/直す。同じ人・同じ日に複数行OK(1日に何本も=代行の実態)。
        upsert: function (row) {
          return P(function () {
          row = row || {};
          if (!row.employeeId) throw new Error('employeeId が必要です');
          if (!isYmd(row.ymd)) throw new Error('ymd は YYYY-MM-DD です: ' + row.ymd);
          if (row.data == null || typeof row.data !== 'object') throw new Error('data がオブジェクトではありません');
          return uid().then(function (u) {
            if (!u) return { ok: false, reason: 'no-user' };
            var id = row.id || newId('lg');
            return Promise.resolve(sb.from('pay_ledger').upsert({
              id: id, account_id: u, employee_id: row.employeeId, ymd: row.ymd,
              data: row.data, deleted_at: null, updated_at: nowIso()
            })).then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error), id: id } : { ok: true, id: id }; })
              .catch(function (e) { return { ok: false, reason: err(e), id: id }; });
          }).then(function (r) { r.id = r.id || null; return r; });
          });
        },
        // ソフト削除(お金の記録は物理削除しない)
        remove: function (id) {
          return Promise.resolve(sb.from('pay_ledger').update({ deleted_at: nowIso(), updated_at: nowIso() }).eq('id', id))
            .then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error) } : { ok: true }; })
            .catch(function (e) { return { ok: false, reason: err(e) }; });
        }
      },

      /* ═══ 利用権(exally_entitlements・既存テーブル) ═══ */
      entitlements: {
        get: function (app) {
          return uid().then(function (u) {
            if (!u) return null;
            return Promise.resolve(sb.from('exally_entitlements').select('plan,expires_at').eq('account_id', u).eq('app', app).maybeSingle())
              .then(function (r) { return (r && r.data) || null; });
          });
        },
        // 行が無ければ trial を1行だけ作る。★既存の plan は絶対に書き換えない(有料客を無料に落とさない)★
        ensure: function (app) {
          return me().then(function (user) {
            if (!user) return null;
            return Promise.resolve(sb.from('exally_entitlements').select('plan').eq('account_id', user.id).eq('app', app).maybeSingle())
              .then(function (r) {
                if (r && r.data) return { plan: r.data.plan, existed: true };
                return Promise.resolve(sb.from('exally_entitlements').insert({ account_id: user.id, app: app, plan: 'trial', email: user.email || null }))
                  .then(function (w) {
                    if (w && w.error) return { plan: null, existed: false, error: err(w.error) };
                    return { plan: 'trial', existed: false };
                  });
              });
          });
        }
      }
    };
    return api;
  }

  return {
    create: create,
    EXALLY_EMP_KEYS: EXALLY_EMP_KEYS,
    EMPLOYMENT_TYPES: EMPLOYMENT_TYPES,
    assertEmpPatch: assertEmpPatch,
    isYmd: isYmd
  };
});
