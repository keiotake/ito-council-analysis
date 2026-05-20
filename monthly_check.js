// 毎月頭に実行する定期チェック・更新スクリプト
// 1. 公式サイトから最新の議事録一覧を取得
// 2. 新規ファイルがあれば本文取得・パース・統合
// 3. サイトをビルドしてGitHubにデプロイ
// 4. 結果をログに保存

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const LOG_DIR = 'logs';
const LOG_FILE = `${LOG_DIR}/monthly_check_${new Date().toISOString().slice(0,10)}.log`;
const MEETING_LIST = 'scrape_tmp/meeting_list.json';
const MEETING_BACKUP = 'scrape_tmp/meeting_list.before.json';

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function run(cmd, opts = {}) {
  log(`$ ${cmd}`);
  try {
    const out = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts });
    if (out) log(out.trim().split('\n').slice(-20).join('\n'));
    return { ok: true, out };
  } catch (e) {
    log(`ERROR: ${e.message}`);
    if (e.stdout) log(`stdout: ${e.stdout.toString().slice(-500)}`);
    if (e.stderr) log(`stderr: ${e.stderr.toString().slice(-500)}`);
    return { ok: false, err: e };
  }
}

async function main() {
  log('===== 定期チェック開始 =====');
  log(`実行日時: ${new Date().toLocaleString('ja-JP')}`);

  // Step 1: 既存リストをバックアップ
  if (fs.existsSync(MEETING_LIST)) {
    fs.copyFileSync(MEETING_LIST, MEETING_BACKUP);
    const old = JSON.parse(fs.readFileSync(MEETING_BACKUP, 'utf-8'));
    log(`現在の議事録リスト: ${old.length}件`);
  }

  // Step 2: 最新リストを公式から取得
  log('\n--- Phase 1: 公式サイトから最新の議事録リストを取得 ---');
  if (fs.existsSync(MEETING_LIST)) fs.unlinkSync(MEETING_LIST);
  const r1 = run('node scrape_minutes.js');
  if (!r1.ok) { log('議事録リスト取得失敗。中止。'); process.exit(1); }

  // Step 3: 新規finoを検出
  log('\n--- Phase 2: 新規議事録の検出 ---');
  const current = JSON.parse(fs.readFileSync(MEETING_LIST, 'utf-8'));
  const oldFinos = fs.existsSync(MEETING_BACKUP)
    ? new Set(JSON.parse(fs.readFileSync(MEETING_BACKUP, 'utf-8')).map(m => m.fino))
    : new Set();
  const newOnes = current.filter(m => !oldFinos.has(m.fino));

  log(`総議事録: ${current.length}件`);
  log(`新規検出: ${newOnes.length}件`);
  newOnes.forEach(m => log(`  fino=${m.fino} | ${m.dateLabel} | ${m.sessionTitle}`));

  if (newOnes.length === 0) {
    log('\n新規議事録なし。更新の必要はありません。');
    log('===== 定期チェック完了 =====');
    return;
  }

  // Step 4: 新規分の本文取得（scrape_new_onlyを動的生成）
  log('\n--- Phase 3: 新規議事録の本文を取得 ---');
  // scrape_new_only.js を新規finoで動的更新
  const sno = fs.readFileSync('scrape_new_only.js', 'utf-8');
  const updatedSno = sno.replace(
    /const TARGET_FINOS = \[[^\]]*\];/,
    `const TARGET_FINOS = ${JSON.stringify(newOnes.map(m => m.fino))};`
  );
  fs.writeFileSync('scrape_new_only.js', updatedSno);
  const r2 = run('node scrape_new_only.js');
  if (!r2.ok) { log('本文取得失敗。中止。'); process.exit(1); }

  // Step 5: パース
  log('\n--- Phase 4: 議事録のパース ---');
  const r3 = run('node parse_minutes.js');
  if (!r3.ok) { log('パース失敗。中止。'); process.exit(1); }

  // Step 6: 統合
  log('\n--- Phase 5: データ統合 ---');
  const r4 = run('node integrate_gijiroku.js');
  if (!r4.ok) { log('統合失敗。中止。'); process.exit(1); }

  // Step 7: ビルド
  log('\n--- Phase 6: HTMLビルド ---');
  const r5 = run('node build_v3.js');
  if (!r5.ok) { log('ビルド失敗。中止。'); process.exit(1); }

  // Step 8: Git commit & push
  log('\n--- Phase 7: GitHubへデプロイ ---');
  const r6 = run('git add build_v3.js index.html scrape_tmp/meeting_list.json scrape_new_only.js scrape_tmp/minutes/');
  const msg = `毎月定期更新: ${newOnes.length}件の新規議事録を追加 (${new Date().toISOString().slice(0,10)})

新規取得した議事録:
${newOnes.map(m => `- fino=${m.fino} ${m.sessionTitle} ${m.dateLabel}`).join('\n')}
`;
  fs.writeFileSync('.commit_msg.tmp', msg);
  const r7 = run('git commit -F .commit_msg.tmp');
  fs.unlinkSync('.commit_msg.tmp');
  if (!r7.ok) {
    log('コミット失敗（変更なし or 競合の可能性）');
  } else {
    const r8 = run('git push');
    if (!r8.ok) log('プッシュ失敗。手動でgit pushしてください。');
  }

  // Step 9: サマリーを保存
  log('\n===== 定期チェック完了 =====');
  log(`新規 ${newOnes.length} 件を追加し、デプロイ完了。`);

  // 通知用のサマリー
  const summary = {
    date: new Date().toISOString(),
    newMeetings: newOnes.map(m => ({ fino: m.fino, dateLabel: m.dateLabel, sessionTitle: m.sessionTitle })),
    totalMeetings: current.length,
  };
  fs.writeFileSync(`${LOG_DIR}/last_check.json`, JSON.stringify(summary, null, 2));
  log(`サマリーを ${LOG_DIR}/last_check.json に保存`);
}

main().catch(e => {
  log(`Fatal error: ${e.message}\n${e.stack}`);
  process.exit(1);
});
