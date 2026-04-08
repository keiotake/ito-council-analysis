// みんなの伊東市 全サイトコンテキスト生成
// - サイト概要・機能
// - 現職議員20名のプロフィール・統計
// - 質問/動画ランキング
// - 会派別
// - 第五次総合計画（9課題/将来人口/5政策目標/39施策）
// - 議員×施策マッピングの要約
// Worker に埋め込まれるコンテキストファイルを出力する。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const profiles = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles.json'), 'utf-8'));
const analysis = JSON.parse(fs.readFileSync(path.join(ROOT, 'analysis_data.json'), 'utf-8'));
const plan = JSON.parse(fs.readFileSync(path.join(DATA, 'sougoukeikaku_v5.json'), 'utf-8'));
let memberPolicy = null;
try {
  memberPolicy = JSON.parse(fs.readFileSync(path.join(DATA, 'member_policy_map.json'), 'utf-8'));
} catch (e) {
  console.warn('member_policy_map.json not found, skipping');
}

const currentNames = Object.keys(profiles);

// 議員ごとの質問・動画数を集計（現職のみ）
const memberStats = {};
currentNames.forEach(name => {
  const summary = analysis.memberSummary[name];
  const videos = (summary && summary.videos) || [];
  const questions = videos.reduce((s, v) => s + ((v.questions || []).length), 0);
  memberStats[name] = {
    videoCount: videos.length,
    questionCount: questions,
  };
});

// 出力組み立て
let ctx = '';

ctx += `# サイト「みんなの伊東市」について\n`;
ctx += `静岡県伊東市議会の活動を市民に分かりやすく可視化する非公式情報サイト。\n`;
ctx += `URL: https://keiotake.github.io/ito-council-analysis/\n`;
ctx += `運営: 大竹圭（伊東市議会議員）\n`;
ctx += `\n## 掲載タブ\n`;
ctx += `- 議員一覧: 現職20名のプロフィール・会派別表示\n`;
ctx += `- 全動画: 伊東市議会公式YouTubeの全動画 (${analysis.totalVideos || analysis.videos?.length || 0}本)\n`;
ctx += `- 比較: 議員間の活動比較\n`;
ctx += `- 検索: キーワード検索\n`;
ctx += `- トレンド: 年別の質問数・注目キーワード推移\n`;
ctx += `- 総合計画: 第五次伊東市総合計画 (2021-2030) + 議員×施策ヒートマップ\n`;
ctx += `- 市民の声: 市政への意見投稿フォーム\n`;
ctx += `- 統計: 種別/会派/分野の集計グラフ\n`;
ctx += `\n## データの限界（必ず伝えること）\n`;
ctx += `- 質問要約はYouTube自動生成字幕の機械抽出（精度に限界あり）\n`;
ctx += `- 分野分類はキーワードによる自動判定\n`;
ctx += `- 正確な議会記録は伊東市議会公式ページを参照する必要がある\n`;

// ========== 現職議員20名 ==========
ctx += `\n\n# 伊東市議会 現職議員 (20名)\n`;
ctx += `定数20名、議長1名・副議長1名を含む。会派構成:\n`;
const factionCount = {};
currentNames.forEach(n => {
  const f = profiles[n].faction || '無会派';
  factionCount[f] = (factionCount[f] || 0) + 1;
});
Object.entries(factionCount).forEach(([f, c]) => {
  ctx += `- ${f}: ${c}名\n`;
});

// 会派ごとに議員を列挙
ctx += `\n## 会派別 議員一覧\n`;
const factionMembers = {};
currentNames.forEach(n => {
  const f = profiles[n].faction || '無会派';
  if (!factionMembers[f]) factionMembers[f] = [];
  factionMembers[f].push(n);
});
Object.entries(factionMembers).forEach(([f, names]) => {
  ctx += `\n### ${f} (${names.length}名)\n`;
  names.forEach(n => {
    const p = profiles[n];
    const s = memberStats[n] || { videoCount: 0, questionCount: 0 };
    const parts = [];
    if (p.reading) parts.push(p.reading);
    if (p.terms) parts.push(`${p.terms}期`);
    if (p.role) parts.push(p.role);
    if (p.committee) parts.push(p.committee);
    if (p.special) parts.push(p.special);
    ctx += `- **${n}** (${parts.join('・')}) 動画${s.videoCount}本・質問${s.questionCount}問\n`;
  });
});

// 質問数ランキング（現職上位10）
ctx += `\n## 質問数ランキング (現職上位10名)\n`;
const qRank = currentNames
  .map(n => ({ name: n, q: memberStats[n].questionCount, v: memberStats[n].videoCount, f: profiles[n].faction }))
  .sort((a, b) => b.q - a.q)
  .slice(0, 10);
qRank.forEach((m, i) => {
  ctx += `${i + 1}. ${m.name} (${m.f}) — ${m.q}問 / ${m.v}本\n`;
});

// 動画数ランキング
ctx += `\n## 動画出演数ランキング (現職上位10名)\n`;
const vRank = currentNames
  .map(n => ({ name: n, q: memberStats[n].questionCount, v: memberStats[n].videoCount, f: profiles[n].faction }))
  .sort((a, b) => b.v - a.v)
  .slice(0, 10);
vRank.forEach((m, i) => {
  ctx += `${i + 1}. ${m.name} (${m.f}) — ${m.v}本 / ${m.q}問\n`;
});

// 運営者のプロフィール
if (profiles['大竹圭']) {
  const p = profiles['大竹圭'];
  const s = memberStats['大竹圭'] || {};
  ctx += `\n## 運営者: 大竹圭 議員\n`;
  ctx += `- 読み: ${p.reading || ''}\n`;
  ctx += `- 生年: ${p.birthYear || ''}\n`;
  ctx += `- 期数: ${p.terms || ''}期\n`;
  ctx += `- 会派: ${p.faction || ''}\n`;
  ctx += `- 委員会: ${p.committee || ''}\n`;
  if (p.role) ctx += `- 役職: ${p.role}\n`;
  ctx += `- 動画${s.videoCount || 0}本・質問${s.questionCount || 0}問\n`;
  ctx += `- AI活用に積極的で、本サイトを個人プロジェクトとして構築・運営している\n`;
}

// ========== 第五次総合計画 ==========
ctx += `\n\n# 第五次伊東市総合計画 (${plan.meta.period})\n`;
ctx += `ビジョン: ${plan.meta.vision}\n`;
if (plan.meta.vision_tagline) ctx += `サブタイトル: ${plan.meta.vision_tagline}\n`;
ctx += `発行: ${plan.meta.issued_by} / ${plan.meta.issued_date}\n`;
ctx += `\n## 計画の前提と限界\n`;
(plan.meta.known_limitations || []).forEach(l => ctx += `- ${l}\n`);

ctx += `\n## 9つのまちづくり課題\n`;
plan.machizukuri_kadai.forEach(k => {
  ctx += `\n### 課題${k.num}: ${k.title} (計画書p.${k.source_page})\n`;
  ctx += `${k.summary}\n`;
  (k.key_points || []).forEach(p => ctx += `- ${p}\n`);
});

ctx += `\n## 将来人口推計\n`;
ctx += `社人研推計（このまま推移した場合）:\n`;
plan.future_population.projection.forEach(p => {
  ctx += `- ${p.year}年(${p.label}): ${p.total.toLocaleString()}人 / 高齢化率${p.elderly_rate}%\n`;
});
const tgt = plan.future_population.target || {};
ctx += `\n目標人口（伊東市が目指す値）:\n`;
if (tgt.year_2025) ctx += `- 2025年: ${tgt.year_2025.total.toLocaleString()}人\n`;
if (tgt.year_2030) ctx += `- 2030年: ${tgt.year_2030.total.toLocaleString()}人\n`;
if (plan.future_population.note) ctx += `\n注記: ${plan.future_population.note}\n`;

ctx += `\n## 5つの政策目標\n`;
plan.policy_goals.forEach(g => {
  ctx += `\n### 政策目標${g.num}: ${g.title}\n`;
  if (g.theme) ctx += `テーマ: ${g.theme}\n`;
  if (g.description) ctx += `${g.description}\n`;
});

ctx += `\n## 施策の現状と課題（抜粋）\n`;
plan.sub_policies.forEach(s => {
  ctx += `\n### ${s.id} ${s.title}\n`;
  if (s.current_state && s.current_state.length > 0) {
    ctx += `現状:\n`;
    s.current_state.slice(0, 3).forEach(c => ctx += `- ${c}\n`);
  }
  if (s.challenges && s.challenges.length > 0) {
    ctx += `課題:\n`;
    s.challenges.slice(0, 4).forEach(c => ctx += `- ${c}\n`);
  }
});

// ========== 議員×施策 ==========
if (memberPolicy && memberPolicy.matches) {
  ctx += `\n\n# 議員×施策マッピング (要約)\n`;
  ctx += `計画書の各施策ID（${Object.keys(memberPolicy.matches).length}件）について、キーワード一致で議員の言及を集計。\n`;
  ctx += `動画タイトル・質問テキストの機械的一致なので、賛否・質は不明。\n`;
  ctx += `\n## 議員別: 最も多くの施策に言及している上位10名\n`;
  const memberCoverage = {};
  Object.entries(memberPolicy.matches).forEach(([policyId, items]) => {
    items.forEach(it => {
      (it.speakers || []).forEach(sp => {
        if (!memberCoverage[sp]) memberCoverage[sp] = new Set();
        memberCoverage[sp].add(policyId);
      });
    });
  });
  const covRank = Object.entries(memberCoverage)
    .map(([name, set]) => ({ name, count: set.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  covRank.forEach((m, i) => {
    ctx += `${i + 1}. ${m.name}: ${m.count}施策\n`;
  });
}

const outPath = path.join(__dirname, 'plan_context.txt');
fs.writeFileSync(outPath, ctx, 'utf-8');
console.log(`✓ Wrote ${outPath}`);
console.log(`  size: ${ctx.length} chars (~${Math.round(ctx.length / 2.5)} tokens rough JA estimate)`);
