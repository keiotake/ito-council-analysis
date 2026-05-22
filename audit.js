#!/usr/bin/env node
/**
 * 不適切表現の監査スタンドアロンコマンド
 *
 * 使い方:
 *   node audit.js              # 監査実行（結果表示のみ）
 *   node audit.js --json        # JSON形式で出力
 *   node audit.js --strict      # CRITICAL検出時に exit code 1
 *
 * 何を見るか:
 *   - 議員AI要約に音声認識ミスや誤変換による不適切表現が混入していないか
 *   - 議員名 × 「即死」「殺害」等のセンセーショナル語の組合せがないか
 *
 * 検出時の対応:
 *   1. 該当箇所を目視確認
 *   2. YouTube動画の元字幕と照合
 *   3. 該当データファイル（analysis_data.json 等）を修正
 *   4. node build_v3.js で再ビルド
 */

const fs = require('fs');

const AUDIT_RULES = {
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
  warn: [
    { re: /無能/g, hint: '人物評価表現。要確認' },
    { re: /失格/g, hint: '人物評価表現。要確認' },
    { re: /クズ/g, hint: '誹謗中傷表現。要確認' },
    { re: /バカ/g, hint: '誹謗中傷表現。要確認' },
    { re: /アホ/g, hint: '誹謗中傷表現。要確認' },
    { re: /詐欺師/g, hint: '誹謗中傷表現。要確認' },
  ],
};

// 既知の正当な事件・歴史引用（ハッシュベースで重複検知を防ぐ）
// 一度人手で確認した「これは事件引用なのでOK」というfindingをここに登録すると次回からスキップされる
function loadAllowlist() {
  if (!fs.existsSync('audit_allowlist.json')) return new Set();
  try {
    const list = JSON.parse(fs.readFileSync('audit_allowlist.json', 'utf-8'));
    return new Set(list.map(item => item.hash));
  } catch (e) {
    return new Set();
  }
}

function hashFinding(f) {
  // findingsをパターン+ファイル+snippet先頭40文字 でハッシュ化
  const s = f.pattern + '|' + f.file + '|' + (f.snippet || '').substring(0, 40);
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return String(h);
}

function audit() {
  const targets = [
    'analysis_data.json',
    'question_summaries.json',
    'video_summaries.json',
    'topics_cache.json',
  ];
  const findings = [];
  const allowlist = loadAllowlist();

  for (const file of targets) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf-8');
    for (const severity of ['critical', 'warn']) {
      for (const rule of AUDIT_RULES[severity]) {
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(raw)) !== null) {
          const idx = m.index;
          const snippet = raw.substring(Math.max(0, idx - 50), idx + 50).replace(/\s+/g, ' ').trim();
          findings.push({
            severity: severity.toUpperCase(),
            file,
            pattern: rule.re.source,
            hint: rule.hint,
            snippet,
          });
        }
      }
    }
  }

  if (fs.existsSync('gijiroku_integrated.json')) {
    const data = JSON.parse(fs.readFileSync('gijiroku_integrated.json', 'utf-8'));
    Object.entries(data.memberData || {}).forEach(([name, mem]) => {
      (mem.questions || []).forEach((q, idx) => {
        const blob = JSON.stringify(q);
        for (const rule of AUDIT_RULES.critical) {
          rule.re.lastIndex = 0;
          let m;
          while ((m = rule.re.exec(blob)) !== null) {
            const i = m.index;
            const snippet = blob.substring(Math.max(0, i - 60), i + 60).replace(/\s+/g, ' ').trim();
            findings.push({
              severity: 'CRITICAL',
              file: `gijiroku_integrated.json [member=${name}, q#${idx}]`,
              pattern: rule.re.source,
              hint: rule.hint,
              snippet,
            });
          }
        }
      });
    });
  }

  // 各findingにハッシュ追加、許可リストにあるものはallowlisted=trueマーキング
  return findings.map(f => ({ ...f, hash: hashFinding(f), allowlisted: allowlist.has(hashFinding(f)) }));
}

function approveAll() {
  // 現在の全findingsを許可リストに追加する（初回ベースライン作成 or 確認済み一括登録）
  const findings = audit();
  const items = findings.map(f => ({
    hash: f.hash,
    file: f.file,
    pattern: f.pattern,
    snippet: f.snippet,
    approvedAt: new Date().toISOString(),
    note: '事件・歴史的引用として人手確認済み',
  }));
  fs.writeFileSync('audit_allowlist.json', JSON.stringify(items, null, 2));
  console.log(`✓ ${items.length}件を audit_allowlist.json に登録しました。`);
  console.log('  今後のauditでは、これらの既存findingsはスキップされます。');
  console.log('  新規に検出されたものだけが警告対象になります。');
}

function main() {
  // --approve-all: 現在の検出結果を全て許可リストに登録（ベースライン作成）
  if (process.argv.includes('--approve-all')) {
    approveAll();
    return;
  }

  let findings = audit();
  // 許可リスト適用：許可済みは除外（--show-allowlistedで全表示）
  const showAll = process.argv.includes('--show-allowlisted');
  const visibleFindings = showAll ? findings : findings.filter(f => !f.allowlisted);
  const allowlistedCount = findings.filter(f => f.allowlisted).length;

  const critical = visibleFindings.filter(f => f.severity === 'CRITICAL');
  const warn = visibleFindings.filter(f => f.severity === 'WARN');
  findings = visibleFindings;

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      criticalCount: critical.length,
      warnCount: warn.length,
      findings,
    }, null, 2));
  } else {
    console.log('============================');
    console.log('みんなの伊東市 - データ監査結果');
    console.log('============================\n');
    console.log(`実行日時: ${new Date().toLocaleString('ja-JP')}\n`);

    if (allowlistedCount > 0 && !showAll) {
      console.log(`（事件・歴史引用として確認済み: ${allowlistedCount}件 → スキップ）\n`);
    }
    if (findings.length === 0) {
      console.log('✓ 新規の不適切表現は検出されませんでした。');
    } else {
      console.log(`CRITICAL: ${critical.length}件\n`);
      critical.forEach((f, i) => {
        console.log(`  [${i + 1}] ${f.file}`);
        console.log(`      パターン: /${f.pattern}/`);
        console.log(`      ヒント: ${f.hint}`);
        console.log(`      文脈: ...${f.snippet}...\n`);
      });

      console.log(`WARN: ${warn.length}件\n`);
      warn.forEach((f, i) => {
        console.log(`  [${i + 1}] ${f.file}`);
        console.log(`      パターン: /${f.pattern}/`);
        console.log(`      文脈: ...${f.snippet}...\n`);
      });

      console.log('\n=== 対応手順 ===');
      console.log('1. 上記の各findingを目視で確認');
      console.log('2. YouTube動画の元字幕と照合（音声認識ミスかどうか）');
      console.log('3. 修正が必要なら該当ファイルを編集');
      console.log('4. node build_v3.js で再ビルド');
      console.log('5. node audit.js でクリーンになったか再確認');
    }
  }

  // --strict モード: CRITICAL検出時 exit code 1
  if (process.argv.includes('--strict') && critical.length > 0) {
    process.exit(1);
  }
}

main();
