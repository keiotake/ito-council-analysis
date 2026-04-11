// みんなの伊東市 全サイトコンテキスト生成 v2
// - サイト概要・機能
// - 現職議員20名のプロフィール・統計
// - 各議員の質問要約（動画ごと）★NEW
// - 会派別の大綱質疑の質問要約 ★NEW
// - 質問/動画ランキング
// - 第五次総合計画（9課題/将来人口/5政策目標/施策タイトル一覧）
// - 議員×施策マッピングの要約
// Worker に埋め込まれるコンテキストファイルを出力する。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const profiles = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles.json'), 'utf-8'));
const analysis = JSON.parse(fs.readFileSync(path.join(ROOT, 'analysis_data.json'), 'utf-8'));
let questionSummaries = {};
try {
  questionSummaries = JSON.parse(fs.readFileSync(path.join(ROOT, 'question_summaries.json'), 'utf-8'));
} catch (e) { console.warn('question_summaries.json not found'); }
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
ctx += `運営: 大竹圭（伊東市議会議員・伊東未来所属）\n`;
ctx += `\n## 掲載タブ\n`;
ctx += `- 議員一覧: 現職20名のプロフィール・会派別表示\n`;
ctx += `- 動画・検索: 伊東市議会公式YouTubeの全動画 (${analysis.videos?.length || 0}本) + キーワード検索\n`;
ctx += `- 総合計画: 第五次伊東市総合計画 (2021-2030) + 議員×施策ヒートマップ\n`;
ctx += `- 市民の声: 市政への意見投稿フォーム\n`;
ctx += `- 統計・分析: 種別/会派/分野の集計グラフ + 議員比較 + トレンド\n`;
ctx += `\n## データの限界（質問と関連する回答では必ず伝えること）\n`;
ctx += `- 質問要約はYouTube自動生成字幕の機械抽出であり、不正確な場合がある\n`;
ctx += `- 分野分類はキーワードによる自動判定\n`;
ctx += `- 正確な議会記録は伊東市議会公式ページを参照する必要がある\n`;

// ========== 現職議員20名 ==========
ctx += `\n\n# 伊東市議会 現職議員 (20名)\n`;
ctx += `定数20名、議長1名・副議長1名を含む。\n\n`;
ctx += `## 会派構成\n`;
const factionCount = {};
currentNames.forEach(n => {
  const f = profiles[n].faction || '無会派';
  factionCount[f] = (factionCount[f] || 0) + 1;
});
Object.entries(factionCount).forEach(([f, c]) => {
  ctx += `- ${f}: ${c}名\n`;
});
ctx += `\n注意: 各会派は独立した政治グループです。会派名から所属政党を推測してはいけません。例えば「政和会」は政和会という会派であり、特定の政党の系列ではありません。\n`;

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
    ctx += `- ${n} (${parts.join('・')}) 動画${s.videoCount}本・質問${s.questionCount}問\n`;
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

// ========== 議員ごとの質問要約 ==========
ctx += `\n\n# 議員別 質問要約一覧\n`;
ctx += `各議員の動画ごとに、質問内容の要約を掲載します。\n`;
ctx += `字幕の自動抽出のため、不正確な部分が含まれる可能性があります。\n`;

currentNames.forEach(name => {
  const ms = analysis.memberSummary[name];
  if (!ms || !ms.videos || ms.videos.length === 0) return;

  const s = memberStats[name] || {};
  ctx += `\n## ${name} (${profiles[name].faction || '無会派'}・動画${s.videoCount}本・質問${s.questionCount}問)\n`;

  // 新しい順にソート
  const sortedVideos = [...ms.videos].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  sortedVideos.forEach(v => {
    const summaries = (questionSummaries[v.videoId] || []).filter(s => s && s !== '質問内容');
    if (summaries.length === 0 && (!v.questions || v.questions.length === 0)) return;

    // 質問要約を使う（なければ生質問テキストから短縮）
    const qTexts = summaries.length > 0 ? summaries : (v.questions || []).map(q => {
      const cleaned = q.replace(/[\n\r]/g, '').replace(/^[^ぁ-んァ-ヶ\u4e00-\u9fff]*/, '').trim();
      return cleaned.length > 50 ? cleaned.substring(0, 47) + '...' : cleaned;
    });

    if (qTexts.length === 0) return;

    // 各質問を80文字に制限して1行にまとめる
    const qList = qTexts.map(q => {
      const trimmed = q.length > 80 ? q.substring(0, 77) + '...' : q;
      return trimmed;
    }).join(' / ');

    ctx += `${v.date || '不明'} ${v.sessionType || ''}: ${qList}\n`;
  });
});

// ========== 会派別大綱質疑 ==========
ctx += `\n\n# 会派別 大綱質疑・予算質疑の質問要約\n`;
ctx += `会派代表としての質問であり、特定の議員個人の発言ではなく会派全体の質疑です。\n`;

const factionVideos = analysis.videos.filter(v =>
  v.sessionType && (v.sessionType.includes('大綱') || v.sessionType.includes('補正'))
);

// Sort by date descending
factionVideos.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

factionVideos.forEach(v => {
  const summaries = (questionSummaries[v.videoId] || []).filter(s => s && s !== '質問内容');
  if (summaries.length === 0) return;

  const qList = summaries.map(q => {
    return q.length > 80 ? q.substring(0, 77) + '...' : q;
  }).join(' / ');

  const title = (v.title || '').replace(/伊東市議会[　\s]*/g, '').substring(0, 40);
  ctx += `${v.date || '不明'} ${title}: ${qList}\n`;
});


// ========== 第五次総合計画（コンパクト版） ==========
ctx += `\n\n# 第五次伊東市総合計画 (${plan.meta.period})\n`;
ctx += `ビジョン: ${plan.meta.vision}\n`;
if (plan.meta.vision_tagline) ctx += `サブタイトル: ${plan.meta.vision_tagline}\n`;
ctx += `発行: ${plan.meta.issued_by} / ${plan.meta.issued_date}\n`;
ctx += `\n## 計画の前提と限界\n`;
(plan.meta.known_limitations || []).forEach(l => ctx += `- ${l}\n`);

ctx += `\n## 9つのまちづくり課題\n`;
plan.machizukuri_kadai.forEach(k => {
  ctx += `課題${k.num}: ${k.title}\n`;
});

ctx += `\n## 将来人口推計\n`;
ctx += `社人研推計（このまま推移した場合）:\n`;
plan.future_population.projection.forEach(p => {
  ctx += `- ${p.year}年: ${p.total.toLocaleString()}人 / 高齢化率${p.elderly_rate}%\n`;
});
const tgt = plan.future_population.target || {};
ctx += `目標人口: `;
if (tgt.year_2025) ctx += `2025年 ${tgt.year_2025.total.toLocaleString()}人、`;
if (tgt.year_2030) ctx += `2030年 ${tgt.year_2030.total.toLocaleString()}人`;
ctx += `\n`;

ctx += `\n## 5つの政策目標と施策\n`;
plan.policy_goals.forEach(g => {
  ctx += `\n### 政策目標${g.num}: ${g.title}\n`;
  if (g.theme) ctx += `テーマ: ${g.theme}\n`;
  if (g.description) ctx += `${g.description}\n`;
  // 施策タイトルのみ列挙（詳細は省略）
  const subs = plan.sub_policies.filter(s => s.goal_num === g.num);
  subs.forEach(s => {
    ctx += `  ${s.id} ${s.title}\n`;
  });
});

// ========== 議員×施策 ==========
if (memberPolicy && memberPolicy.member_coverage) {
  ctx += `\n\n# 議員×施策マッピング (要約)\n`;
  ctx += `動画タイトル・質問テキストのキーワード一致による集計。賛否・質は不明。\n`;
  ctx += `\n## 議員別: 最も多くの施策に言及している上位10名\n`;
  const covRank = Object.entries(memberPolicy.member_coverage)
    .map(([name, data]) => ({ name, count: data.mentioned_sub_count || 0, total: data.total_mentions || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  covRank.forEach((m, i) => {
    ctx += `${i + 1}. ${m.name}: ${m.count}施策 (${m.total}回言及)\n`;
  });
}

const outPath = path.join(__dirname, 'plan_context.txt');
fs.writeFileSync(outPath, ctx, 'utf-8');
console.log(`✓ Wrote ${outPath}`);
console.log(`  size: ${ctx.length} chars (~${Math.round(ctx.length / 2.5)} tokens rough JA estimate)`);
