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

// ===== 統合データの監査 =====
// 議事録AI要約・音声認識ミスを検出するためのパターン辞書
const AUDIT_RULES = {
  // 【CRITICAL】議員の名誉に関わる重大語。出現したら必ず人手確認
  critical: [
    { re: /即死/g, hint: '「促進」「即時」等の誤認識の可能性' },
    { re: /殺害/g, hint: '事件報告の引用なら可。議員自身の発言文脈で要確認' },
    { re: /虐殺/g, hint: '歴史的引用なら可。要確認' },
    { re: /処刑/g, hint: '事件報告の引用なら可。要確認' },
    { re: /抹殺/g, hint: '人物への文脈なら極めて危険' },
    { re: /暗殺/g, hint: '事件報告の引用なら可。要確認' },
    { re: /撲殺/g, hint: '事件報告の引用なら可。要確認' },
    { re: /射殺/g, hint: '事件報告の引用なら可。要確認' },
  ],
  // 【WARN】よくある音声認識ミスや誤変換パターン
  warn: [
    { re: /無能/g, hint: '人物評価表現。要確認' },
    { re: /失格/g, hint: '人物評価表現。要確認' },
    { re: /クズ/g, hint: '誹謗中傷表現。要確認' },
    { re: /バカ/g, hint: '誹謗中傷表現。要確認' },
    { re: /アホ/g, hint: '誹謗中傷表現。要確認' },
    { re: /詐欺師/g, hint: '誹謗中傷表現。要確認' },
  ],
};

function hashFindingMC(f) {
  const s = (f.label || '') + '|' + (f.snippet || '').substring(0, 40);
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return String(h);
}

function loadAllowlistMC() {
  if (!fs.existsSync('audit_allowlist.json')) return new Set();
  try {
    return new Set(JSON.parse(fs.readFileSync('audit_allowlist.json', 'utf-8')).map(x => x.hash));
  } catch (e) { return new Set(); }
}

function runAudit() {
  log('監査対象ファイル: analysis_data.json, question_summaries.json, video_summaries.json, topics_cache.json');
  const allowlist = loadAllowlistMC();
  if (allowlist.size > 0) log(`許可リスト: ${allowlist.size}件の既知パターンを除外`);
  const targets = [
    'analysis_data.json',
    'question_summaries.json',
    'video_summaries.json',
    'topics_cache.json',
  ];
  const findings = [];

  for (const file of targets) {
    if (!fs.existsSync(file)) {
      log(`  ${file} : ファイルなし（スキップ）`);
      continue;
    }
    let raw;
    try { raw = fs.readFileSync(file, 'utf-8'); } catch (e) {
      log(`  ${file} : 読み込み失敗`); continue;
    }

    for (const severity of ['critical', 'warn']) {
      for (const rule of AUDIT_RULES[severity]) {
        const matches = [...raw.matchAll(rule.re)];
        for (const m of matches) {
          const idx = m.index || 0;
          const snippet = raw.substring(Math.max(0, idx - 50), idx + 50)
            .replace(/\s+/g, ' ').trim();
          findings.push({
            severity: severity.toUpperCase(),
            label: `${file} [${rule.re.source}]`,
            hint: rule.hint,
            snippet,
          });
        }
      }
    }
  }

  // 議事録議員データを構造的にチェック（議員名×ネガティブ語の隣接検出）
  try {
    const data = JSON.parse(fs.readFileSync('gijiroku_integrated.json', 'utf-8'));
    Object.entries(data.memberData || {}).forEach(([name, mem]) => {
      (mem.questions || []).forEach((q, idx) => {
        const blob = JSON.stringify(q);
        for (const rule of AUDIT_RULES.critical) {
          if (rule.re.test(blob)) {
            // 議員名と問題語が同じ要約内に共存
            const matchIdx = blob.search(rule.re);
            const snippet = blob.substring(Math.max(0, matchIdx - 60), matchIdx + 60)
              .replace(/\s+/g, ' ').trim();
            findings.push({
              severity: 'CRITICAL',
              label: `gijiroku_integrated.json [${name} #${idx}] [${rule.re.source}]`,
              hint: rule.hint,
              snippet,
            });
            rule.re.lastIndex = 0; // reset state for global regex reuse
          }
        }
      });
    });
  } catch (e) {
    log(`gijiroku_integrated.json 監査失敗: ${e.message}`);
  }

  // 許可リスト適用
  const allFindings = findings.map(f => ({ ...f, hash: hashFindingMC(f), allowlisted: allowlist.has(hashFindingMC(f)) }));
  const visibleFindings = allFindings.filter(f => !f.allowlisted);
  const allowedCount = allFindings.length - visibleFindings.length;

  const criticalCount = visibleFindings.filter(f => f.severity === 'CRITICAL').length;
  const warnCount = visibleFindings.filter(f => f.severity === 'WARN').length;

  log(`監査完了: 新規CRITICAL ${criticalCount}件 / 新規WARN ${warnCount}件 / 確認済みスキップ ${allowedCount}件`);
  return { criticalCount, warnCount, findings: visibleFindings, allowedCount };
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

  // Step 6.5: 不適切表現の監査（ビルド前）
  log('\n--- Phase 6: 統合データの監査（不適切表現チェック） ---');
  const auditResult = runAudit();
  if (auditResult.criticalCount > 0) {
    log(`⚠️ ${auditResult.criticalCount}件の重大な要修正候補があります。`);
    log('要修正候補:');
    auditResult.findings.forEach(f => log(`  [${f.severity}] ${f.label}: ${f.snippet}`));
    log('\n人手による確認・修正が必要です。');
    log('対応:');
    log('  1. 上記findingsを目視で確認');
    log('  2. 議事録の元動画（YouTube字幕）と照合');
    log('  3. 音声認識ミスなら analysis_data.json / question_summaries.json / video_summaries.json を修正');
    log('  4. node build_v3.js で再ビルド');
    log('\nビルド・デプロイは中止します。手動修正後に再実行してください。');
    // ログとサマリーは保存して終了
    fs.writeFileSync(`${LOG_DIR}/audit_findings_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(auditResult, null, 2));
    log(`監査結果を ${LOG_DIR}/audit_findings_*.json に保存しました。`);
    process.exit(1);
  } else if (auditResult.warnCount > 0) {
    log(`⚠️ ${auditResult.warnCount}件の警告候補（要確認）があります。ビルドは継続します。`);
    auditResult.findings.forEach(f => log(`  [${f.severity}] ${f.label}: ${f.snippet}`));
  } else {
    log('✓ 監査クリア。不適切表現は検出されませんでした。');
  }

  // Step 7: ビルド
  log('\n--- Phase 7: HTMLビルド ---');
  const r5 = run('node build_v3.js');
  if (!r5.ok) { log('ビルド失敗。中止。'); process.exit(1); }
  // ビルドログから AUDIT WARN を抽出
  const buildWarns = (r5.out || '').match(/\[AUDIT WARN\][^\n]+/g) || [];
  if (buildWarns.length > 0) {
    log(`⚠️ ビルド時にも ${buildWarns.length} 件の警告が出力されました:`);
    buildWarns.forEach(w => log(`  ${w}`));
  }

  // Step 8: Git commit & push
  log('\n--- Phase 8: GitHubへデプロイ ---');
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
