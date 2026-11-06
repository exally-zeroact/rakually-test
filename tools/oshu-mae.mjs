/* oshu-mae.mjs — ★押す前に 回す★（★名簿を 人が 選ばない★）
 * ============================================================================
 * ★なぜ 在るか（2026-09-22 実測）★
 *   ★私は 押す前に `tests/*.test.mjs` の 31本を 回して いました★
 *   ★今日 4回 踏んだ うち★ … ★3回は そこで 出た★／★1回は 出ず 押してから CI で 出た★
 *   ★数えたら★ … ★ci.yml の node の 段 240★／★回して いたのは 31★／★★差 209★★
 *   ⇒ ★★『名簿は 置き場から 作る』と 書いたのに ★その 括りを 選んだのは 人★★★
 *
 * ★★この 道具が 守る 事★★
 *   ⑴ ★段は yml から 拾う★（`tools/_dan-hirou.mjs`＝★拾い方は 1か所★）
 *   ⑵ ★重い／軽いは ★命令の 字★で 決める★（★人が 1本ずつ 選ばない★）
 *   ⑶ ★★回した ＋ 除いた ＝ 全 を 毎回 出す★★
 *      ＝★除いた 段は ★数と 訳★を 必ず 書く★（★これが 無いと また 差が 隠れます★）
 *
 * ★重い 段は ここでは 回しません（訳）★
 *   ・★実ブラウザ／倉庫を 触る 段★ … ★遅い／同じ 試験倉庫を 2つの 席で 使う★
 *   ・★掃きの 道具★ ……………… ★中で 他の 段を 回す＝二重に 走る★
 *   ⇒ ★それらは ★総なめ（souname）★の 仕事★＝★ここは「押す前の 網」★
 *
 * ★使い方★
 *   node tools/oshu-mae.mjs                … ci.yml の 速い 段を 全部
 *   node tools/oshu-mae.mjs --yml=.github/workflows/webkit.yml
 *   node tools/oshu-mae.mjs --self-test    … ★選び方だけ 試す（1段も 走らせない）★
 *   … | node tools/oshu-mae.mjs --sha-stdin … ★pre-push が 使う★＝標準入力の 押す sha を 別の 作業木に 出して そこで 回す
 *        （OSHU_MAE_WAKE=1 なら 今の 作業木の まま）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { erabu, omoiKa, hirouDan, byouMatome, danNoJob, oshuShaYomu, nokoriErabu, kuchiKa, kuchiJobYomu, michiTsukuru, heiretsuYomu, danKuchi } from './_dan-hirou.mjs';
import { kiTomeru, danHashiru, kekkaGyou, tometeYoi, yureKa, YURE_CODE } from './_oshu-michi.mjs';
import { bunrui, OKE_JUN } from './_bunrui.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★★押す sha の 別の 作業木（2026-11-03・網の 4つ割り 押し2）★★
   ★なぜ★ … 今までは 網が ★今の 作業木の 字★を 見た＝未commit が 混ざる／自己確認が わざと 壊した 字（#FF00FF 等）が
     網を 途中で 殺されると 押す 作業木に 残った（feedback_ami_wo_tochuu_de_tomeru…）。
     ⇒ 押す sha を 捨てる 作業木に 出して そこで 回す＝「網が 見た 字 ＝ 押す commit」・壊しは 捨てる 作業木の 中だけ。
   ★守る 事（設計前 taiketsu 止3）★
     ・node_modules は 元の 作業木への junction（npm/npx/husky を 新しい 作業木で 回さない）
     ・片付けは ★junction を 先に 外して から★（外せなければ 消さない＝中身を 辿って node_modules を 消さない）
     ・前の 残りは pid が 死んだ 物 か 6時間 過ぎた 物 だけ 消す（他の 席の 走って いる 網を 消さない）
     ・置き場は repo ごとに 分ける（本番 rakually と テスト線の 網が 互いを 触らない） */
const gitR = (args, cwd) => spawnSync('git', args, { cwd: cwd || ROOT, encoding: 'utf8' });
function junctionHazusu(p) {
  let st;
  try { st = fs.lstatSync(p); } catch (err) { return true; }          /* ★無い＝外れて いる★ */
  if (!st.isSymbolicLink()) return false;                              /* ★本物の dir＝触らない★ */
  try { fs.unlinkSync(p); } catch (err) { try { fs.rmdirSync(p); } catch (err2) { return false; } }
  try { fs.lstatSync(p); return false; } catch (err) { return true; }
}
function wtKatasu(dir, root) {
  if (!junctionHazusu(path.join(dir, 'node_modules'))) return '★node_modules の junction を 外せない＝消さずに 残した★';
  gitR(['worktree', 'remove', '--force', dir], root);
  if (fs.existsSync(dir)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (err) { return '★消せない★ ' + err.message; }
  }
  gitR(['worktree', 'prune'], root);
  return fs.existsSync(dir) ? '★消せない★' : null;
}
const pidIkiteru = (pid) => { try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; } };
function wtOki(root) {
  const common = path.resolve(root, gitR(['rev-parse', '--git-common-dir'], root).stdout.trim());
  return path.join(os.tmpdir(), 'oshu-mae-wt', path.basename(path.dirname(common)));
}
function wtTsukuru(sha, root, base, ato = '') {
  fs.mkdirSync(base, { recursive: true });
  nokoriErabu(fs.readdirSync(base), Date.now(), pidIkiteru).forEach((x) => {
    const r = wtKatasu(path.join(base, x.n), root);
    console.log('  ★前の 網の 残りを 片付けた★ ' + x.n + '（' + x.naze + '）' + (r ? '  ' + r : ''));
  });
  const dir = path.join(base, 'om-' + process.pid + '-' + Date.now().toString(36) + ato);   /* ★ato＝押し3 の 道の 名（_<道名>）★ */
  const r = gitR(['worktree', 'add', '--detach', dir, sha], root);
  if (r.status !== 0) return { err: 'worktree add が 赤（' + String(r.stderr || '').trim().slice(0, 200) + '）' };
  const head = gitR(['rev-parse', 'HEAD'], dir).stdout.trim();
  if (head !== sha) { wtKatasu(dir, root); return { err: '作業木の HEAD ' + head + ' が 押す sha ' + sha + ' と 違う' }; }
  const nm = path.join(root, 'node_modules');
  if (fs.existsSync(nm)) fs.symlinkSync(fs.realpathSync(nm), path.join(dir, 'node_modules'), 'junction');
  return { dir };
}

if (process.argv.includes('--self-test')) {
  console.log('\n[oshu-mae] ★自己確認★（★1段も 走らせません★）');
  let ng = 0, zenTori = 0;
  const iu = (n, good) => { zenTori++; if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★思っていたのと 違う★')); };
  /* ★見本は ★実物と 同じ 書き方★ に する★（2026-09-22 踏んだ）
     ★はじめ★ … 一行の 形で 書いた ⇒ ★拾えず 8件 赤★
     ★実物を 数えた★ … ci.yml 241／★一行の 形は 0★／webkit 48／0
     ⇒ ★★拾い漏らしは 無い／★見本が 違って いた★★ */
  const mihon = [
    '    steps:',
    '      - name: a',
    '        run: node tests/a.test.mjs',
    '      - name: b',
    '        run: node kyuyo/tests/b-ui.mjs',
    '      - name: c',
    '        run: npm install',
    '      - name: d',
    '        run: node tools/clock-sweep.mjs --self-test-kazoe',
    '      - name: e',
    '        run: node kyuyo/tests/souko-mon.test.mjs',
    '      - name: f',
    '        run: node scripts/silent-catch.mjs --check',
  ].join(String.fromCharCode(10));
  const e = erabu(mihon);
  iu('★段を yml から 拾う（6段）★', e.zen === 6);
  iu('★実ブラウザの 段は 除く★', !!e.nozoku.find((x) => /b-ui\.mjs/.test(x.c)));
  iu('★静的な 門（souko-mon）は 名前で 除かない＝回す★（2026-10-03・飾りの字の門を 直した）',
    !!e.hashiru.find((x) => /souko-mon/.test(x.c)) && !e.nozoku.find((x) => /souko-mon/.test(x.c)));
  iu('★掃きの 道具は 除く（二重に 走る）★', !!e.nozoku.find((x) => /clock-sweep/.test(x.c)));
  iu('★支度は 除く★', !!e.nozoku.find((x) => /npm install/.test(x.c)));
  iu('★★`scripts/` の 段も 回す★★（今日 ここが 抜けて いた）',
    !!e.hashiru.find((x) => /silent-catch/.test(x.c)));
  iu('★`tests/` の 段も 回す★', !!e.hashiru.find((x) => /a\.test\.mjs/.test(x.c)));
  iu('★★回した ＋ 除いた ＝ 全★★', e.hashiru.length + e.nozoku.length === e.zen);
  iu('★重い 字に 当たらなければ null（当てない）★', omoiKa('node tests/x.test.mjs') === null);
  iu('★拾い方は 1か所（run: だけ 拾う）★',
    hirouDan('        run: node a' + String.fromCharCode(10) + '      - name: b').length === 1);
  /* ★★★赤の 段の 出しの 切り方を ★実物の 赤で★ 確かめる★★★（2026-09-28）
     ★訳★ … ★この 門は 今日 2回 直しました★
       ⑴`r.stdout` を 1文字も 使って いなかった（★赤が 何と 言って いるか 残らない★）
       ⑵★6行 に した★ ⇒ ★その日の うちに 足りませんでした★
          （実物＝`supa-config-env-matches-repo --self-test` が 押しの 中だけ 赤／
            残った 6行は `output: [ null, null, null ] … stdout: null, stderr: null` だけ
            ⇒ ★どの 子（git／sh／tar）が 落ちたか 読めない★）
     ⇒ ★★『切り方』そのものを 見張る★★（★次に 足りなければ 字で 分かる★）
     ★わざと 赤に なる 子を その場で 作る★＝★網は 1段も 回しません★ */
  {
    const NL = String.fromCharCode(10);
    const kiru2 = (s) => String(s || '').split(NL).map((x) => x.replace(/\s+$/, '')).filter((x) => x.trim());
    const AKA_GYO2 = 40;
    /* ★60行 出して 3行 叫んで 終わり値 3★（★逃がしを 使わない＝紙に 書かない★） */
    const ko = 'for(let i=1;i<=60;i++)console.log("DASHI-"+i);'
      + 'console.error("SAKEBI-1");console.error("SAKEBI-2");console.error("SAKEBI-3");process.exit(3);';
    const rr = spawnSync(process.execPath, ['-e', ko], { encoding: 'utf8' });
    const so2 = kiru2(rr.stdout), se2 = kiru2(rr.stderr);
    const soD = so2.slice(-AKA_GYO2), seD = se2.slice(-AKA_GYO2);
    iu('★赤の 子の 終わり値を 取れる（3）★', rr.status === 3);
    iu('★出しは 全 60行／叫びは 全 3行 と 数えられる★', so2.length === 60 && se2.length === 3);
    iu('★★出すのは 終わりの 40行★★', soD.length === AKA_GYO2);
    iu('★★切った 行数を 数えられる（20行）★★', so2.length - soD.length === 20);
    iu('★終わりの 40行＝DASHI-21〜DASHI-60★', soD[0] === 'DASHI-21' && soD[39] === 'DASHI-60');
    iu('★★出しと 叫びが 混ざって いない★★', soD.every((x) => x.indexOf('SAKEBI') < 0) && seD.length === 3);
    iu('★40行 未満なら 全部 出る（叫び 3行）★', seD[0] === 'SAKEBI-1' && seD[2] === 'SAKEBI-3');
  }
  /* ★★段ごとの 秒の まとめ（2026-11-02）★★ */
  {
    const m = byouMatome([{ c: 'a', byou: 10, job: 'x' }, { c: 'b', byou: 130, job: 'y' }, { c: 'c', byou: 5, job: 'x' }], 2, 120);
    iu('★秒の 合計＝145★', m.zen === 145);
    iu('★遅い 順の 上位 2＝b,a★', m.ue.length === 2 && m.ue[0].c === 'b' && m.ue[1].c === 'a');
    iu('★上限に 近い（120秒 以上）＝1本★', m.chikai === 1);
    iu('★job ごと x＝2段 15秒★', m.job.x.dan === 2 && m.job.x.byou === 15);
    const djJi = ['jobs:', '  j1:', '    steps:', '        run: node a', '        run: node b', '  j2:', '        run: node c'].join(String.fromCharCode(10));
    const dj = danNoJob(djJi);
    iu('★段 → job（j1,j1,j2）＝run: の 数と 合う★', dj.join(',') === 'j1,j1,j2' && dj.length === hirouDan(djJi).length);
    /* ★本物の ci.yml でも 段の 数と job の 数が 合い、job の 無い 段が 0★（合わないと 秒の job 分けが ずれる） */
    const ymlHon = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const djH = danNoJob(ymlHon);
    iu('★本物の ci.yml … 段 ' + hirouDan(ymlHon).length + '・job 付き ' + djH.filter(Boolean).length + '★',
      djH.length === hirouDan(ymlHon).length && djH.every(Boolean));
  }
  /* ★★押す sha を 読む（止1）★★ */
  {
    const A = 'a'.repeat(40), B = 'b'.repeat(40), Z = '0'.repeat(40);
    const g = (l, s) => 'refs/heads/x ' + l + ' refs/heads/main ' + (s || Z);
    const r1 = oshuShaYomu(g(A) + '\n');
    iu('★1行＝sha 1つ・止めない★', r1.shas.length === 1 && r1.shas[0] === A && r1.naze === null);
    iu('★空＝止める（0件＝合格に しない）★', oshuShaYomu('\n').naze !== null && oshuShaYomu('').naze !== null);
    const r3 = oshuShaYomu(g(Z, A));
    iu('★消す 押しだけ＝sha 0・消す 1・止めない（回す 物が 無い）★', r3.shas.length === 0 && r3.kesu === 1 && r3.naze === null);
    iu('★違う sha 2つ＝止める（1押し1件）★', oshuShaYomu(g(A) + '\n' + g(B)).naze !== null);
    iu('★同じ sha を 2つの 枝へ＝1つ・止めない★', oshuShaYomu(g(A) + '\n' + g(A)).shas.length === 1 && oshuShaYomu(g(A) + '\n' + g(A)).naze === null);
    iu('★読めない 行＝止める★', oshuShaYomu('xx yy').naze !== null);
    iu('★CRLF でも 読める★', oshuShaYomu(g(A) + '\r\n').naze === null);
  }
  /* ★★前の 残りの 選び方（止3＝他の 席を 消さない）★★ */
  {
    const now = 1e12, t = (ms) => (now - ms).toString(36);
    const ike = (pid) => pid !== 111;
    const s = nokoriErabu(['om-111-' + t(1000), 'om-222-' + t(1000), 'om-333-' + t(7 * 3600e3), 'oshu-mae-444-x', 'tanin'], now, ike).map((x) => x.n.split('-')[1]);
    iu('★pid 死＝消す／生きて 新しい＝残す／生きて 古い＝消す／形の 違う 名＝触らない★', s.join(',') === '111,333');
  }
  /* ★★本物の 作業木を 作って 片付ける（junction の 先は 消えない）★★＝網は 1段も 回さない */
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'om-st-'));
    const saki = path.join(tmp, 'saki'); fs.mkdirSync(saki); fs.writeFileSync(path.join(saki, 'nokoru.txt'), 'x');
    const head = gitR(['rev-parse', 'HEAD']).stdout.trim();
    const base = path.join(tmp, 'base');
    const nmKazu = () => (fs.existsSync(path.join(ROOT, 'node_modules')) ? fs.readdirSync(path.join(ROOT, 'node_modules')).length : -1);
    const nmKazu0 = nmKazu();
    const w = wtTsukuru(head, ROOT, base);
    iu('★押す sha の 作業木が 出来る★', !w.err && fs.existsSync(path.join(w.dir, 'tools', 'oshu-mae.mjs')));
    if (!w.err) {
      const nmOk = !fs.existsSync(path.join(ROOT, 'node_modules')) || fs.lstatSync(path.join(w.dir, 'node_modules')).isSymbolicLink();
      iu('★node_modules は junction（本物の dir を 作らない）★', nmOk);
      iu('★作業木の HEAD ＝ 押す sha★', gitR(['rev-parse', 'HEAD'], w.dir).stdout.trim() === head);
      const err = wtKatasu(w.dir, ROOT);
      iu('★片付けで 作業木が 消える★', err === null && !fs.existsSync(w.dir));
      iu('★git の 作業木の 名簿にも 残らない★', gitR(['worktree', 'list', '--porcelain']).stdout.indexOf(path.basename(w.dir)) < 0);
      iu('★node_modules の 先は 消えない（中の 数 ' + nmKazu0 + ' → ' + nmKazu() + '）★', nmKazu() === nmKazu0);
    }
    /* ★本物の dir の node_modules は 片付けが 触らない★ */
    const nise = path.join(tmp, 'nise'); fs.mkdirSync(path.join(nise, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(nise, 'node_modules', 'a.txt'), 'x');
    iu('★本物の node_modules が 在る dir は 消さない★', wtKatasu(nise, ROOT) !== null && fs.existsSync(path.join(nise, 'node_modules', 'a.txt')));
    /* ★junction を 外しても 先の 中身は 残る★ */
    const j2 = path.join(tmp, 'j2'); fs.symlinkSync(saki, j2, 'junction');
    iu('★junction を 外す＝junction は 消え・先の 中身は 残る★', junctionHazusu(j2) && !fs.existsSync(j2) && fs.existsSync(path.join(saki, 'nokoru.txt')));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  /* ★★押し3＝道に 分けて 同時に 回す（2026-11-03・設計前 taiketsu 止1〜3）★★ */
  {
    const NL = String.fromCharCode(10);
    const hs = [{ i: 1, c: 'node a.mjs' }, { i: 2, c: 'node b.mjs' }, { i: 3, c: 'node c.mjs' }, { i: 4, c: 'node d.mjs' }];
    const m1 = michiTsukuru(hs, ['j1', 'j1', 'j2', 'j3'], () => false, []);
    iu('★道＝job ごと（j1 2段・j2・j3）★', !m1.naze && m1.michi.map((x) => x.na + ':' + x.dan.length).join(',') === 'j1:2,j2:1,j3:1');
    const m2 = michiTsukuru(hs, ['j1', 'j1', 'j2', 'j3'], (i) => i === 3, ['j3']);
    iu('★試験口の 段を 持つ job（j2＝中身・j3＝印）は 1本の 道に 繋ぐ★', !m2.naze && m2.michi[0].na === 'j2+j3' && m2.michi[0].dan.map((d) => d.i).join(',') === '3,4' && m2.michi.length === 2);
    const m3 = michiTsukuru(hs, ['j1', 'j1', 'j2', 'j3'], (i) => i === 1 || i === 4, []);
    iu('★試験口の 段が 移っても（j1 と j3）名前で なく 中身で 1本に★', !m3.naze && m3.michi.filter((x) => x.dan.some((d) => d.i === 1 || d.i === 4)).length === 1);
    const dk = danKuchi(m2.michi, (i) => (i === 3 ? true : false));
    iu('★段の kuchi＝試験口の 道（j3＝印・中身は 直の import 無し）の 段も 触る・他の 道は 触らない★（11-07 止め1・_hairu.mjs 経由）', dk(3) === true && dk(4) === true && dk(1) === false && dk(2) === false);
    iu('★段の kuchi＝分からない（undefined）は 触る・道が 無くても 直の import は 触る★', danKuchi([], () => undefined)(9) === true && danKuchi(null, (i) => i === 5)(5) === true && danKuchi([], () => false)(5) === false);
    iu('★job の 無い 段＝止める★', michiTsukuru(hs, ['j1', null, 'j2', 'j3'], () => false, []).naze !== null);
    iu('★並べる 数＝既定 6・3・0 と 字 と 小数 は 止める★', heiretsuYomu(undefined).n === 6 && heiretsuYomu('3').n === 3
      && heiretsuYomu('0').naze !== null && heiretsuYomu('x').naze !== null && heiretsuYomu('1.5').naze !== null);
    const ymlK = ['jobs:', '  a:', '    steps:', '        run: node x', '  kuchi:', '    concurrency:', '      group: webkit-shared-account', '  k2:', '    env:', '      SHIKEN_KUCHI_PASS: ${{ secrets.SHIKEN_KUCHI_PASS }}', '  b:', '    env:', "      SHIKEN_KUCHI_PASS: ''"].join(NL);
    iu('★job の 印（concurrency の 組・合言葉の secret）を 拾う・空の 合言葉は 拾わない★', kuchiJobYomu(ymlK).join(',') === 'kuchi,k2');
    const yo = (f) => ({ 'x.mjs': "const { toiawase } = await import('./_souko-kazoeru.mjs');", 'y.mjs': '// test@test.com の 説明だけ', 'z.mjs': "import { kuchi } from '../tests/_shiken-kuchi.mjs';" }[f] ?? null);
    iu('★試験口の 道具を import する 段＝触る（await import も import 文も）★', kuchiKa('node x.mjs', yo) && kuchiKa('node z.mjs --bu=1', yo));
    iu('★字に 出るだけ＝触らない・道具 自身の 自己確認＝触らない★', !kuchiKa('node y.mjs', yo) && !kuchiKa('sh s.sh 10 -- node tests/_shiken-kuchi.mjs --self-test', (f) => (f === 's.sh' ? '' : null)));
    iu('★読めない ファイル＝触る 側（分からないを 安全側へ）★', kuchiKa('node nai.mjs', yo));
    iu('★ファイルを 1つも 拾えない 段（sh・npx）＝触る 側★', kuchiKa('sh scripts/ci-yuka.sh --self-test', yo) && kuchiKa('npx vitest run', yo));
    const now = 1e12, t = (now - 1000).toString(36);
    const nk = nokoriErabu(['om-111-' + t + '_test-1', 'om-111-' + t + '_kinshi-node24', 'om-222-' + t + '_test-1', 'om-111-' + t + '_a b'], now, (pid) => pid !== 111).map((x) => x.n);
    iu('★道の 作業木（_道名）も pid 死で 片付く・生きて 新しい は 残す・形の 違う 名は 触らない★', nk.length === 2 && nk.every((n) => n.indexOf('om-111-') === 0 && n.indexOf(' ') < 0));
    /* ★時間切れで 孫まで 止まる★＝孫の node が pid を 書いて 眠る→2秒で 切る→孫が 居ないか */
    const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'om-st3-'));
    const pf = path.join(tmp3, 'mago.pid');
    fs.writeFileSync(path.join(tmp3, 'mago.cjs'), 'require("fs").writeFileSync(' + JSON.stringify(pf) + ',String(process.pid));setTimeout(()=>{},60000);');
    fs.writeFileSync(path.join(tmp3, 'oya.cjs'), 'require("child_process").spawn(process.execPath,[' + JSON.stringify(path.join(tmp3, 'mago.cjs')) + '],{stdio:"ignore"});setTimeout(()=>{},60000);');
    const r3 = await danHashiru('node oya.cjs', tmp3, 2500);
    let magoPid = 0; try { magoPid = Number(fs.readFileSync(pf, 'utf8')); } catch (err) { magoPid = 0; }
    await new Promise((rr) => setTimeout(rr, 800));
    const magoIkiteru = magoPid > 0 && (() => { try { process.kill(magoPid, 0); return true; } catch (err) { return err.code === 'EPERM'; } })();
    iu('★時間切れ＝走らせられない（赤）・孫の node も 止まる（孫 pid ' + magoPid + '）★', r3.mi !== null && r3.status === null && magoPid > 0 && !magoIkiteru);
    if (magoIkiteru) kiTomeru(magoPid);
    /* ★管を 持った 孫が 親より 長く 残る★＝親は すぐ 死に 孫が stdout を 持って 眠る→1.5秒で 切る→猶予 1秒で 解けるか
       （直す 前は close が 来ず ここで いつまでも 待った） */
    const pf4 = path.join(tmp3, 'mago4.pid');
    fs.writeFileSync(path.join(tmp3, 'mago4.cjs'), 'require("fs").writeFileSync(' + JSON.stringify(pf4) + ',String(process.pid));setTimeout(()=>{},30000);');
    fs.writeFileSync(path.join(tmp3, 'oya4.cjs'), 'require("child_process").spawn(process.execPath,[' + JSON.stringify(path.join(tmp3, 'mago4.cjs')) + '],{stdio:["ignore","inherit","inherit"],detached:true}).unref();');
    const t4 = Date.now();
    const r4 = await Promise.race([danHashiru('node oya4.cjs', tmp3, 1500, 1000), new Promise((rr) => setTimeout(() => rr(null), 15000))]);
    const b4 = (Date.now() - t4) / 1000;
    let mago4 = 0; try { mago4 = Number(fs.readFileSync(pf4, 'utf8')); } catch (err) { mago4 = 0; }
    if (mago4 > 0) kiTomeru(mago4);
    iu('★管を 持った 孫が 残っても 猶予の 後に 解ける＝走らせられない（赤）（' + b4.toFixed(1) + '秒・孫 pid ' + mago4 + '）★', r4 !== null && r4.status === null && /切った/.test(r4.mi || '') && mago4 > 0);
    /* ★見るのは「いつまでも 待たずに 赤で 解ける」★＝Linux は 孫の 止まり方が 違い 字が「切った」だけに なり得る（taiketsu 次の 確かめ1）。r4===null（15秒で 解けない）は 赤 */
    /* ★子の 道を 本当に 回す★（緑 1・赤 1）→ 結果の 行を 段の 番号で 読める */
    const meibo = path.join(tmp3, 'm.json'), kek = path.join(tmp3, 'k.jsonl');
    fs.writeFileSync(meibo, JSON.stringify({ cwd: tmp3, dan: [{ i: 7, c: 'node -e "console.log(\'✓ a\')"' }, { i: 9, c: 'node -e "console.log(\'X\');process.exit(4)"' }] }));
    fs.writeFileSync(kek, '');
    const rk = spawnSync(process.execPath, [path.join(ROOT, 'tools', '_oshu-michi.mjs'), meibo, kek], { encoding: 'utf8' });
    const gy = fs.readFileSync(kek, 'utf8').split(NL).filter(Boolean).map((l) => JSON.parse(l));
    iu('★子の 道＝終わり値 0・結果 2行（7 緑・9 赤 終わり値 4・赤の 出し 1行）★', rk.status === 0 && gy.length === 2 && gy[0].i === 7 && gy[0].status === 0 && !!gy[0].oke
      && gy[1].i === 9 && gy[1].status === 4 && gy[1].so.join() === 'X');
    /* ★揺れ（0xC0000409）の 回し直しは 狭く★（11-06 設計前 taiketsu 任2・任4）＝字なし・その 終わり値 ちょうど・試験口に 触らない 段 だけ */
    const yr = { status: YURE_CODE, mi: null, so: '', se: '' };
    iu('★揺れ と 見る＝終わり値 3221226505・出しも 叫びも 空・kuchi===false の 時だけ★', yureKa(yr, false) === true
      && yureKa({ ...yr, so: 'x' }, false) === false && yureKa({ ...yr, se: 'x' }, false) === false
      && yureKa({ ...yr, status: 1 }, false) === false && yureKa({ ...yr, status: 3221225477 }, false) === false
      && yureKa(yr, true) === false && yureKa(yr, undefined) === false && yureKa({ ...yr, mi: '切った' }, false) === false && yureKa(null, false) === false);
    if (process.platform === 'win32') {
      /* ★本当に 子の 道で 落とす★（process.reallyExit(-1073740791)＝終わり値 3221226505・字なし を taiketsu が 測った 形） */
      const tm = tmp3.replace(/\\/g, '/');
      const ochiru = (shirushi, ato) => 'node -e "const f=require(\'fs\'),p=\'' + tm + '/' + shirushi + '\';if(!f.existsSync(p)){f.writeFileSync(p,\'1\');process.reallyExit(-1073740791)}' + ato + '"';
      fs.writeFileSync(meibo, JSON.stringify({ cwd: tmp3, dan: [
        { i: 21, c: ochiru('y1', 'console.log(\'1 passed, 0 failed\')'), kuchi: false },
        { i: 22, c: 'node -e "process.reallyExit(-1073740791)"', kuchi: false },
        { i: 23, c: 'node -e "console.log(\'x\');process.reallyExit(-1073740791)"', kuchi: false },
        { i: 24, c: ochiru('y4', 'console.log(\'1 passed, 0 failed\')'), kuchi: true },
      ] }));
      fs.writeFileSync(kek, '');
      const ry = spawnSync(process.execPath, [path.join(ROOT, 'tools', '_oshu-michi.mjs'), meibo, kek], { encoding: 'utf8' });
      const g = {}; fs.readFileSync(kek, 'utf8').split(NL).filter(Boolean).forEach((l) => { const o = JSON.parse(l); g[o.i] = o; });
      iu('★1回目だけ 落ちる 段＝回し直して 緑・yure が 残る★', ry.status === 0 && g[21] && g[21].status === 0 && !!g[21].yure && g[21].yure.status === YURE_CODE);
      iu('★2回とも 落ちる 段＝赤（回し直しは 1回だけ）★', g[22] && g[22].status === YURE_CODE && !!g[22].yure);
      iu('★字を 出してから 落ちた 段＝回し直さず 赤★', g[23] && g[23].status === YURE_CODE && !g[23].yure);
      iu('★試験口に 触る 段＝回し直さず 赤★', g[24] && g[24].status === YURE_CODE && !g[24].yure);
    }
    fs.writeFileSync(meibo, JSON.stringify({ cwd: tmp3, dan: [] }));
    iu('★空の 名簿＝子は 終わり値 2（0件＝合格に しない）★', spawnSync(process.execPath, [path.join(ROOT, 'tools', '_oshu-michi.mjs'), meibo, kek], { encoding: 'utf8' }).status === 2);
    /* ★止めて よいか（時間切れ・Ctrl-C で 同じ）★＝Windows は 殻が 終わって いたら 止めない（使い回しの 番号）・Linux は 組ごと 止める */
    iu('★止めて よいか＝Windows で 終わった 殻は 止めない・走り中は 止める・Linux は 組ごと・子 無し は 止めない★',
      tometeYoi({ pid: 5, exitCode: 0, signalCode: null }, 'win32') === false && tometeYoi({ pid: 5, exitCode: null, signalCode: 'SIGTERM' }, 'win32') === false
      && tometeYoi({ pid: 5, exitCode: null, signalCode: null }, 'win32') === true && tometeYoi({ pid: 5, exitCode: 0, signalCode: null }, 'linux') === true
      && tometeYoi(undefined, 'win32') === false && tometeYoi({ pid: 0, exitCode: null, signalCode: null }, 'linux') === false);
    iu('★結果の 1行（赤）＝終わりの 40行だけ★', kekkaGyou({ i: 1 }, { status: 1, mi: null, so: Array.from({ length: 50 }, (x, k) => 'L' + k).join(NL), se: '', byou: 1 }).so.length === 40);
    fs.rmSync(tmp3, { recursive: true, force: true });
  }
  console.log(ng ? '★自己確認 ' + ng + '件 おかしい（全 ' + zenTori + '通り）★' : '  ★' + zenTori + '通り ぜんぶ 思った通り★');
  process.exit(ng ? 1 : 0);
}

const ymlArg = process.argv.find((x) => x.indexOf('--yml=') === 0);
const YML = ymlArg ? ymlArg.split('=')[1] : '.github/workflows/ci.yml';
/* ★★どこで 回すか★★（2026-11-03 押し2）＝--sha-stdin なら 押す sha の 別の 作業木・OSHU_MAE_WAKE=1 なら 今の 作業木 */
let RUN_ROOT = ROOT;
let OSHU_SHA = null;   /* ★押す sha（--sha-stdin の 時だけ）＝道を 並べるのは この 時だけ★ */
/* ★作業木を 消す 前に 道の 子を 先に 止める★（押し3 taiketsu 任A）＝道0 の 段が 生きた まま junction を 外さない。下で 道を 起こす 所が 入れる */
let koSakiniTomeru = () => {};
const HR = heiretsuYomu(process.env.OSHU_MAE_HEIRETSU);
if (HR.naze) {
  console.log('\n[oshu-mae] ★★並べる 数が 読めない＝止めます★★ … ' + HR.naze);
  console.log('  ★「赤 0」とは 書きません＝★何も 測って いません★★');
  process.exit(1);
}
const HEIRETSU = HR.n;
if (process.argv.includes('--sha-stdin') && process.env.OSHU_MAE_WAKE !== '1') {
  let txt = '';
  try { txt = fs.readFileSync(0, 'utf8'); } catch (err) { txt = ''; }
  const s = oshuShaYomu(txt);
  if (s.naze) {
    console.log('\n[oshu-mae] ★★押す 物が 決まらない＝止めます★★ … ' + s.naze);
    console.log('  ★「赤 0」とは 書きません＝★何も 測って いません★★');
    process.exit(1);
  }
  if (!s.shas.length) {
    console.log('\n[oshu-mae] ★消す 押しだけ（' + s.kesu + '本）＝回す 字が 無い＝網を 回しません★');
    process.exit(0);
  }
  const w = wtTsukuru(s.shas[0], ROOT, wtOki(ROOT));
  if (w.err) {
    console.log('\n[oshu-mae] ★★押す sha の 作業木を 作れない＝止めます★★ … ' + w.err);
    console.log('  ★今の 作業木で 回すなら OSHU_MAE_WAKE=1（未commit も 混ざります）★');
    process.exit(1);
  }
  RUN_ROOT = w.dir;
  OSHU_SHA = s.shas[0];
  let katazuketa = false;
  const katasu = () => {
    if (katazuketa) return; katazuketa = true;
    try { koSakiniTomeru(); } catch (err) { console.log('  ★道の 子を 止められない★ ' + err.message); }
    const r = wtKatasu(w.dir, ROOT);
    console.log('  ★押す sha の 作業木を 片付けた★' + (r ? '  ' + r + ' ' + w.dir : ''));
  };
  process.on('exit', katasu);
  ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((sg) => process.on(sg, () => { katasu(); process.exit(1); }));
  console.log('\n[oshu-mae] ★押す sha ' + s.shas[0].slice(0, 10) + ' を 別の 作業木で 回す★ … ' + w.dir
    + (s.kesu ? '（消す 押し ' + s.kesu + '本は 回さない）' : ''));
} else {
  /* ★黙って 前の 形に 戻らない（taiketsu 任4）★＝どちらで 回して いるかを 必ず 字で 出す */
  console.log('\n[oshu-mae] ★今の 作業木で 回す（未commit も 混ざる）★ … '
    + (process.env.OSHU_MAE_WAKE === '1' ? 'OSHU_MAE_WAKE=1' : '--sha-stdin が 無い（手で 回した／hook から 渡って いない）'));
}
const yml = fs.readFileSync(path.join(RUN_ROOT, YML), 'utf8');
const e = erabu(yml);
const JOB_NO = danNoJob(yml);   /* ★段の 番号(1から) → job★ */
const byouList = [];

/* ★★★空きを 測る★★★（2026-09-26・指示役1 の 足し）
   ★なぜ 要るか（実測）★
     この 網を ★３本 続けて 空き不足で 殺されました★。
     その うち 1本は ★「✗ 11段」と 出た★が ★直に 走らせると 緑★。
     ⇒ ★★『赤』と『殺された』を 切り分けられなかった★★
     ⇒ ★★『殺される』より『走らせない』の 方が 良い★★
   ★門は 狭めません★ … ★段を 1つも 外しません★／★走らせない 時は 赤★
   ★測れない 機械では ★この 門を 効かせません★（★字で そう 出します★）
     ＝★測れないのを「足りて いる」と も「足りない」と も しない★ */
const KUUKI_GB = Number(process.env.OSHU_MAE_KUUKI_GB || 2.0);      /* ★走る 前の 下限★ */
const KUUKI_GB_TOCHU = Number(process.env.OSHU_MAE_KUUKI_GB_TOCHU || 1.2); /* ★途中の 下限★ */
const KUUKI_MAI = Number(process.env.OSHU_MAE_KUUKI_MAI || 10);     /* ★何段 ごとに 測るか★ */
function kuukiGB() {
  /* ★Windows … PowerShell★／★それ以外 … /proc/meminfo★／★どちらも 無理なら null★ */
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', ['-NoProfile', '-Command',
        '(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'],
        { encoding: 'utf8', timeout: 20000 });
      const kb = Number(String((r.stdout || '')).trim());
      return kb > 0 ? kb / 1024 / 1024 : null;   /* KB → GB */
    }
    const t = fs.readFileSync('/proc/meminfo', 'utf8');
    const m = t.match(/MemAvailable:\s+(\d+) kB/);
    return m ? Number(m[1]) / 1024 / 1024 : null;
  } catch (err) { return null; }
}
const kuukiIu = (v) => (v === null ? '★測れません★' : v.toFixed(2) + ' GB');

console.log('\n[oshu-mae] ★押す前に 回す★ … ' + YML);
console.log('  ★全 ' + e.zen + '段★ ／ ★回す ' + e.hashiru.length + '段★ ／ ★回さない ' + e.nozoku.length + '段★'
  + '（' + (e.hashiru.length + e.nozoku.length === e.zen ? '★合う★' : '★★合いません★★') + '）');
/* ★★除いた 訳を 数で 出す★★＝★これが 無いと また 差が 隠れます★ */
const wake = {};
e.nozoku.forEach((x) => { wake[x.wake] = (wake[x.wake] || 0) + 1; });
Object.keys(wake).forEach((k) => console.log('    回さない … ' + wake[k] + '段  ' + k));

/* ★★この 道具 自体が ★「0件＝合格」を やって いました★★（2026-09-22 初回の 実測）
   ★出た 字★ … ★走らせられない 220段★ なのに ★「赤 0段」／終わり値 0★
   ★因★ … `/usr/bin/env` は Windows に ★無い★／そして ★私の 判じが それを 緑で 通した★
   ⇒ ★★今日 ずっと 潰して きた 形を ★自分の 道具で★ やって いた★★
   ★直し★ ①★殻を 使う★（Windows でも 走る） ②★★走らせられない 段が 1つでも 在れば 赤★★ */
/* ★★走る 前に 測る★★ */
{
  const k0 = kuukiGB();
  console.log('  ★空き（走る 前） … ' + kuukiIu(k0)
    + '／下限 ' + KUUKI_GB + ' GB（途中の 下限 ' + KUUKI_GB_TOCHU + ' GB）★'
    + (k0 === null ? '（★★この 門は 効きません＝測れません★★）' : ''));
  if (k0 !== null && k0 < KUUKI_GB) {
    console.log(String.fromCharCode(10)
      + '★★★走らせません＝空き ' + kuukiIu(k0)
      + ' が 下限 ' + KUUKI_GB + ' GB を 割って います★★★');
    console.log('  ★訳★ … ★途中で 殺されると ★「赤」と「殺された」が 分からない★★');
    console.log('  ★やる 事★ … ★他の 席・ブラウザを 閉じて から もう一度★'
      + '／★どうしても 走らせるなら `OSHU_MAE_KUUKI_GB=0`（★殺され得ます★）');
    console.log('  ★★「赤 0」とは 書きません＝★何も 測って いません★★');
    process.exit(1);
  }
}

/* ★★★道に 分けて 同時に 回す★★★（2026-11-03・網の 4つ割り 押し3）
   ★組＝CI の job（yml から 機械で）★。試験口に 触る job（job の 印 か 段の import）は 全部 1本の 道に 繋ぐ。
   ★各道は 押す sha の 自分の 作業木★（om-<pid>-<36進>_<道名>）で、子（tools/_oshu-michi.mjs＝親と 同じ ROOT）が 1段ずつ 回す。
   ★並べるのは 押す sha の 作業木で 回す 時だけ★（OSHU_MAE_WAKE=1・手で 回した 時は 1本順＝同じ 作業木を 2本で 触らない）。
   ★守り（今と 同じ）★ … 結果は 段の 番号で 照らす（重なり・抜け・道の 終わり値≠0・読めない 行 は 走らせられない＝赤）。
     途中で 空きが 下限を 割ったら ★全部の 道を 孫まで 止めて★ 残りを 走らせられない に。 */
const yomuF = (f) => { try { return fs.readFileSync(path.join(RUN_ROOT, f), 'utf8'); } catch (err) { return null; } };
const kuchiMap = {};
e.hashiru.forEach((d) => { kuchiMap[d.i] = kuchiKa(d.c, yomuF); });
const mt = michiTsukuru(e.hashiru, JOB_NO, (i) => kuchiMap[i], kuchiJobYomu(yml));
if (mt.naze) {
  console.log('\n[oshu-mae] ★★道を 作れない＝止めます★★ … ' + mt.naze);
  console.log('  ★「赤 0」とは 書きません＝★何も 測って いません★★');
  process.exit(1);
}
/* ★段の kuchi は 並べるか に 関わらず 道で 決める★（11-07 本番前 taiketsu 止め1） */
const danKuchiKa = danKuchi(mt.michi, (i) => kuchiMap[i]);
const NARABE = !!OSHU_SHA && HEIRETSU > 1;
const michi = NARABE ? mt.michi : [{ na: '1本順', jobs: [], dan: e.hashiru.slice(), kuchi: false }];
console.log('  ★道 ' + michi.length + '本★（同時に ' + (NARABE ? Math.min(HEIRETSU, michi.length) : 1) + '本・'
  + (NARABE ? 'OSHU_MAE_HEIRETSU=' + HEIRETSU : (OSHU_SHA ? 'OSHU_MAE_HEIRETSU=1' : '今の 作業木＝並べない')) + '）');
michi.forEach((m) => console.log('    道 ' + m.na + ' … ' + m.dan.length + '段' + (m.kuchi ? '（★試験口に 触る 段を 1本に 集めた★）' : '')));

let aka = 0, mi = 0;
let tometa = 0;               /* ★空き不足で 止めた＝1★ */
let kuukiSaigo = null, kuukiSoko = null;
const akaDan = [], miDan = [], yureDan = [];
/* ★★回った 緑を 4つ組に 割る★★（2026-10-03・⑤）＝「回った N＝赤0」でなく 中で 測ったかを 出す */
const tally = {}; OKE_JUN.forEach((k) => (tally[k] = []));
const yomikata = { 約束: 0, 目印: 0 };
const KO = path.join(ROOT, 'tools', '_oshu-michi.mjs');
const michiTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oshu-mae-michi-'));
const ikiteruKo = new Set();
const michiWt = [];
const michiKatasu = (dir) => { const r = wtKatasu(dir, ROOT); if (r) console.log('  ★道の 作業木を 片付けられない★ ' + r + ' ' + dir); };
/* ★子の 物を 持ち tometeYoi を 通す★（11-04）＝exit から close までの 間に 終わった 番号を 撃たない（Ctrl-C の yame と 同じ 決まり） */
const zenbuTomeru = () => { ikiteruKo.forEach((c) => { if (tometeYoi(c)) kiTomeru(c.pid); }); };
koSakiniTomeru = zenbuTomeru;
process.on('exit', () => {
  zenbuTomeru();
  michiWt.splice(0).forEach(michiKatasu);
  try { fs.rmSync(michiTmp, { recursive: true, force: true }); } catch (err) { /* ★一時の 名簿だけ★ */ }
});
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((sg) => process.on(sg, () => { zenbuTomeru(); process.exit(1); }));
const michiKekka = michi.map(() => ({ owari: null, naze: null, kekka: null }));
const kuuki = setInterval(() => {
  const k = kuukiGB();
  kuukiSaigo = k;
  if (k !== null && (kuukiSoko === null || k < kuukiSoko)) kuukiSoko = k;
  if (!tometa && k !== null && k < KUUKI_GB_TOCHU) {
    tometa = 1;
    console.log('  ★★途中で 止めます＝空き ' + kuukiIu(k) + ' が 途中の 下限 ' + KUUKI_GB_TOCHU + ' GB を 割りました★★（全部の 道を 孫まで 止める）');
    zenbuTomeru();
  }
}, 15000);
async function michiHashiru(k) {
  const m = michi[k];
  let cwd = RUN_ROOT;
  if (NARABE && k > 0) {
    const w = wtTsukuru(OSHU_SHA, ROOT, wtOki(ROOT), '_' + m.na.replace(/[^A-Za-z0-9-]/g, '-'));
    if (w.err) { michiKekka[k].naze = '道の 作業木を 作れない（' + w.err + '）'; return; }
    cwd = w.dir; michiWt.push(w.dir);
  }
  const meibo = path.join(michiTmp, 'm' + k + '.json'), kekka = path.join(michiTmp, 'k' + k + '.jsonl');
  /* ★kuchi★＝試験口に 触るか（分からない＝触る 側）。子は kuchi===false の 段だけ 揺れを 1回 回し直す（_oshu-michi.mjs yureKa） */
  fs.writeFileSync(meibo, JSON.stringify({ cwd, dan: m.dan.map((d) => ({ ...d, kuchi: danKuchiKa(d.i) })) }));
  fs.writeFileSync(kekka, '');
  const owari = await new Promise((res) => {
    const ch = spawn(process.execPath, [KO, meibo, kekka], { cwd, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    ikiteruKo.add(ch);
    let se = '';
    ch.stderr.on('data', (b) => { se += b.toString('utf8'); });
    ch.on('error', (err) => res({ code: null, se: err.message }));
    ch.on('close', (code) => { ikiteruKo.delete(ch); res({ code, se }); });
  });
  michiKekka[k].owari = owari.code;
  if (owari.code !== 0) michiKekka[k].naze = '道 ' + m.na + ' の 終わり値 ' + owari.code + (owari.se.trim() ? '（' + owari.se.trim().slice(-160) + '）' : '');
  michiKekka[k].kekka = fs.readFileSync(kekka, 'utf8');
  if (cwd !== RUN_ROOT) { const j = michiWt.indexOf(cwd); if (j >= 0) michiWt.splice(j, 1); michiKatasu(cwd); }
}
{
  const nokori = michi.map((x, k) => k);
  const hito = Array.from({ length: NARABE ? Math.min(HEIRETSU, michi.length) : 1 }, async () => {
    while (nokori.length && !tometa) await michiHashiru(nokori.shift());
  });
  await Promise.all(hito);
}
clearInterval(kuuki);
/* ★★段の 番号で 照らす★★ */
const kekkaI = {};
let yomenai = 0, kasanari = 0;
michiKekka.forEach((x) => String(x.kekka || '').split(String.fromCharCode(10)).filter((l) => l.trim()).forEach((l) => {
  let o; try { o = JSON.parse(l); } catch (err) { yomenai++; return; }
  if (kekkaI[o.i]) kasanari++;
  kekkaI[o.i] = o;
}));
const michiNo = {}; michi.forEach((m, k) => m.dan.forEach((d) => { michiNo[d.i] = k; }));
e.hashiru.forEach((d) => {
  const o = kekkaI[d.i];
  if (!o) {
    const mk = michiKekka[michiNo[d.i]];
    mi++; miDan.push({ d: d, naze: tometa ? '★空きが 足りず 途中で 止めた★' : (mk && mk.naze) || '結果が 無い' });
    return;
  }
  byouList.push({ i: d.i, c: d.c, job: JOB_NO[d.i - 1], byou: o.byou });
  /* ★揺れ（1回目が 0xC0000409 で 字なし）＝回し直した 段は 緑でも 赤でも 名指しで 数える★ */
  if (o.yure) yureDan.push({ d: d, yure: o.yure, nido: o.mi ? 'mi' : o.status });
  if (o.mi) { mi++; miDan.push({ d: d, naze: o.mi }); return; }
  if (o.status !== 0) {
    aka++;
    akaDan.push({ d: d, status: o.status, byou: o.byou, soZen: o.soZen, seZen: o.seZen, so: o.so, se: o.se });
    console.log('  ✗ ' + d.i + '段 … ' + d.c.slice(0, 90));
    return;
  }
  tally[o.oke].push({ c: d.c, b: o.b });
  if (o.how === '約束') yomikata.約束++; else if (o.how === '目印') yomikata.目印++;
});
/* ★道 そのものの 崩れ★＝段の 結果が 揃って いても 道の 終わり値≠0・読めない 行・重なり は 走らせられない に 足す（黙って 緑に しない） */
michiKekka.forEach((x, k) => {
  if (x.naze && michi[k].dan.every((d) => kekkaI[d.i])) { mi++; miDan.push({ d: { i: '道', c: michi[k].na }, naze: x.naze }); }
});
if (yomenai) { mi++; miDan.push({ d: { i: '道', c: '結果' }, naze: '読めない 結果の 行 ' + yomenai }); }
if (kasanari) { mi++; miDan.push({ d: { i: '道', c: '結果' }, naze: '同じ 段の 結果が 2つ ' + kasanari }); }
console.log('  ★空き（終わり） … ' + kuukiIu(kuukiSaigo === null ? kuukiGB() : kuukiSaigo)
  + '／一番 低い 所 ' + kuukiIu(kuukiSoko)
  + (tometa ? '／★★空きで 止めました★★' : '') + '★');
/* ★★段ごとの 秒（見るだけ・判じに 使わない）★★ */
{
  const m = byouMatome(byouList);
  console.log('  ★段ごとの 秒★ … 合計 ' + m.zen.toFixed(0) + '秒（' + (m.zen / 60).toFixed(1) + '分）／上限 180秒に 近い（120秒 以上）' + m.chikai + '段');
  Object.keys(m.job).forEach((k) => console.log('    job ' + k + ' … ' + m.job[k].dan + '段 ' + m.job[k].byou.toFixed(0) + '秒'));
  console.log('    遅い 順 上位 ' + m.ue.length + '：');
  m.ue.forEach((x) => console.log('      ' + x.byou.toFixed(1).padStart(6) + '秒 ' + x.i + '段 [' + x.job + '] ' + x.c.slice(0, 80)));
}
console.log('  ★赤 ' + aka + '段★ ／ ★走らせられない ' + mi + '段★'
  + ' ／ 回った ' + (e.hashiru.length - mi) + '段（回すつもり ' + e.hashiru.length + '段）');
/* ★★回った 緑の 中を 割る★★＝「回った N＝赤0」を 盛りに しない（測った/一部抜け/丸ごと抜け/読めない/exit0failed） */
{
  const n = (k) => tally[k].length;
  console.log('  ★回った の 中身★ … 測った ' + n('測った') + '／一部抜け ' + n('一部抜け')
    + '／丸ごと抜け ' + n('丸ごと抜け') + '／読めない ' + n('読めない') + '／exit0failed ' + n('exit0failed'));
  console.log('    読み方 … 約束の行 ' + yomikata.約束 + '本／字の目印 ' + yomikata.目印 + '本（KEKKA を 増やし 目印を 減らす）');
  const dasu = (k, mark) => { if (n(k)) { console.log('    ' + mark + ' ' + k + ' ' + n(k) + '本：'); tally[k].forEach((x) => console.log('      ' + mark + ' ' + x.c.slice(0, 100) + '  [' + x.b.how + ' p' + x.b.passed + ' f' + x.b.failed + ' ✓' + x.b.ok + ' ✗' + x.b.ng + ' 未' + x.b.mimiso + ']')); } };
  dasu('exit0failed', '◆');   /* ★赤を 緑と 言う 疑い＝名指し★ */
  dasu('丸ごと抜け', '○');
  dasu('読めない', '?');
}
/* ★★赤は ★字つきで★ 出す★★＝★『何が 赤か』でなく『★何と 言って 赤か★』★
   （★出しを 捨てると 網の 赤と 単独の 緑を 並べられない★＝09-28 に 踏んだ） */
akaDan.forEach((x) => {
  console.log('     ★赤★ ' + x.d.c.slice(0, 120) + '  ★終わり値 ' + x.status + '★（' + (typeof x.byou === 'number' ? x.byou.toFixed(2) : '?') + '秒）');
  if (!x.soZen && !x.seZen) console.log('        ★★何も 言わずに 赤★★（★出しも 叫びも 空★）');
  /* ★★何行の うち 何行 出したかを 書く★★＝★自分で 切ったら 書く★
     ⇒ ★次に 足りなければ ★字で 分かる★（また 見立てで 決めない） */
  if (x.soZen) {
    console.log('        ★出し（stdout） … 全 ' + x.soZen + '行の うち ' + x.so.length + '行★'
      + (x.soZen > x.so.length ? '（★' + (x.soZen - x.so.length) + '行 切りました★）' : ''));
    x.so.forEach((g) => console.log('        │ ' + g.slice(0, 200)));
  }
  if (x.seZen) {
    console.log('        ★叫び（stderr） … 全 ' + x.seZen + '行の うち ' + x.se.length + '行★'
      + (x.seZen > x.se.length ? '（★' + (x.seZen - x.se.length) + '行 切りました★）' : ''));
    x.se.forEach((g) => console.log('        ！ ' + g.slice(0, 200)));
  }
});
/* ★★揺れ★★＝回し直した 段を 名指し＋消えない 控え（git の 共通 dir の oshu-mae-yure.log）に 書き足す＝率を 数えられる形（taiketsu 任3） */
if (yureDan.length) {
  let hikae = null;
  try { const g = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }); if (g.status === 0) hikae = path.resolve(ROOT, g.stdout.trim(), 'oshu-mae-yure.log'); } catch (err) { /* ★下で 書けないと 出す★ */ }
  yureDan.forEach((x) => {
    console.log('     ★揺れ★ ' + x.d.i + '段 ' + x.d.c.slice(0, 100) + '  1回目 終わり値 ' + x.yure.status + '（' + Number(x.yure.byou).toFixed(2) + '秒・字なし）→ 回し直し ' + (x.nido === 0 ? '緑' : '★赤（' + x.nido + '）★'));
    try { if (!hikae) throw new Error('控えの 場所が 無い'); fs.appendFileSync(hikae, [new Date().toISOString(), OSHU_SHA, x.d.i, x.yure.status, Number(x.yure.byou).toFixed(2), x.nido, x.d.c].join('\t') + String.fromCharCode(10)); }
    catch (err) { console.log('        ★揺れの 控えに 書けない★ ' + err.message); }
  });
  if (hikae) console.log('     （揺れの 控え … ' + hikae + '）');
}
miDan.slice(0, 5).forEach((x) => console.log('     ★走らせられない★ ' + x.d.i + '段 … ' + x.naze.slice(0, 80)));
if (miDan.length > 5) console.log('     （他 ' + (miDan.length - 5) + '段）');
if (aka) console.log(String.fromCharCode(10) + '★★押す前に 止めました＝赤 ' + aka + '段★★' + (yureDan.length ? '（揺れ ' + yureDan.length + '）' : ''));
else if (mi) console.log(String.fromCharCode(10) + '★★★「赤 0」とは 書けません＝走らせられない ' + mi + '段★★★');
else console.log(String.fromCharCode(10) + '★押す前の 網 … 回した ' + (e.hashiru.length - mi)
  + '段 ／ 赤 0 ／ 揺れ ' + yureDan.length + '（回し直して 緑）（但し「回った＝測った」では ない＝上の 中身を 見る／測った ' + tally['測った'].length + '段）★');
process.exitCode = (aka || mi) ? 1 : 0;
