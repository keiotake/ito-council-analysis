// 総合計画の構造化JSONから、チャットボットのコンテキスト用にコンパクトな
// プレーンテキストを生成する。Worker に直接埋め込む。
const fs = require('fs');
const path = require('path');

const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sougoukeikaku_v5.json'), 'utf-8'));

let ctx = '';
ctx += `# ${plan.meta.title} (${plan.meta.period})\n`;
ctx += `ビジョン: ${plan.meta.vision}\n`;
ctx += `発行: ${plan.meta.issued_by} / ${plan.meta.issued_date}\n`;
ctx += `\n## ⚠ 計画の前提と限界\n`;
plan.meta.known_limitations.forEach(l=>ctx+=`- ${l}\n`);

ctx += `\n## 伊東市が抱える9つのまちづくり課題\n`;
plan.machizukuri_kadai.forEach(k => {
  ctx += `\n### 課題${k.num}: ${k.title} (p.${k.source_page})\n`;
  ctx += `${k.summary}\n`;
  (k.key_points||[]).forEach(p=>ctx+=`- ${p}\n`);
});

ctx += `\n## 将来人口推計 (p.${plan.future_population.source_page})\n`;
ctx += `出典: ${plan.future_population.source_page}\n`;
ctx += `\n社人研推計（このまま推移した場合）:\n`;
plan.future_population.projection.forEach(p=>{
  ctx += `- ${p.year}年(${p.label}): ${p.total.toLocaleString()}人 / 高齢化率${p.elderly_rate}%\n`;
});
const t = plan.future_population.target;
ctx += `\n目標人口（伊東市が目指す値）:\n`;
if (t.year_2025) ctx += `- 2025年: ${t.year_2025.total.toLocaleString()}人\n`;
if (t.year_2030) ctx += `- 2030年: ${t.year_2030.total.toLocaleString()}人\n`;
ctx += `\n注記: ${plan.future_population.note}\n`;

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
    s.current_state.slice(0, 4).forEach(c=>ctx+=`- ${c}\n`);
  }
  if (s.challenges && s.challenges.length > 0) {
    ctx += `課題:\n`;
    s.challenges.slice(0, 6).forEach(c=>ctx+=`- ${c}\n`);
  }
});

const outPath = path.join(__dirname, 'plan_context.txt');
fs.writeFileSync(outPath, ctx, 'utf-8');
console.log(`✓ Wrote ${outPath}`);
console.log(`  size: ${ctx.length} chars (~${Math.round(ctx.length/4)} tokens rough estimate)`);
