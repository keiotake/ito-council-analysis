const fs = require('fs');
const path = require('path');

const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const profiles = JSON.parse(fs.readFileSync('profiles.json', 'utf-8'));
const topics = JSON.parse(fs.readFileSync('member_topics.json', 'utf-8'));
const { videos, memberSummary } = analysis;

// 会派カラー
const factionColors = {
  '伊東未来': '#2196F3',
  '政和会': '#4CAF50',
  '公明党': '#FF9800',
  '正風クラブ': '#9C27B0',
  '自由民主伊東': '#F44336',
  '無所属': '#607D8B',
};

// カテゴリカラー
const catColors = {
  '防災・安全': '#e74c3c',
  '医療・福祉': '#e91e63',
  '教育・子育て': '#9b59b6',
  '観光・経済': '#f39c12',
  '都市整備・交通': '#3498db',
  '環境・衛生': '#27ae60',
  '行財政・議会': '#34495e',
  '農林水産': '#8bc34a',
};

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// 議員データ統合
const allMembers = Object.entries(memberSummary)
  .filter(([_, d]) => d.videos.length > 0)
  .map(([name, data]) => ({
    name,
    profile: profiles[name] || {},
    topics: topics[name] || { topCategories: [], percentage: {} },
    videoCount: data.videos.length,
    questionCount: data.totalQuestions,
    videos: data.videos,
  }))
  .sort((a, b) => b.videoCount - a.videoCount);

// セッション種別集計
const typeCounts = {};
for (const v of videos) typeCounts[v.sessionType] = (typeCounts[v.sessionType] || 0) + 1;

// レーダーチャートSVG生成
function radarChart(topicData, size = 200) {
  const cats = Object.keys(catColors);
  const n = cats.length;
  const cx = size / 2, cy = size / 2, r = size * 0.35;
  const pcts = cats.map(c => (topicData.percentage?.[c] || 0) / 100);

  let gridLines = '';
  for (let level = 1; level <= 4; level++) {
    const lr = r * level / 4;
    let pts = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      pts.push(`${cx + lr * Math.cos(angle)},${cy + lr * Math.sin(angle)}`);
    }
    gridLines += `<polygon points="${pts.join(' ')}" fill="none" stroke="#e0e0e0" stroke-width="0.5"/>`;
  }

  // 軸線
  let axes = '';
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    axes += `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(angle)}" y2="${cy + r * Math.sin(angle)}" stroke="#e0e0e0" stroke-width="0.5"/>`;
  }

  // データポリゴン
  let dataPts = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const val = Math.min(pcts[i] * 2, 1); // 50%で最大
    dataPts.push(`${cx + r * val * Math.cos(angle)},${cy + r * val * Math.sin(angle)}`);
  }

  // ラベル
  let labels = '';
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const lx = cx + (r + 18) * Math.cos(angle);
    const ly = cy + (r + 18) * Math.sin(angle);
    const shortName = cats[i].split('・')[0];
    labels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="#666">${shortName}</text>`;
  }

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    ${gridLines}${axes}
    <polygon points="${dataPts.join(' ')}" fill="rgba(41,128,185,0.3)" stroke="#2980b9" stroke-width="1.5"/>
    ${labels}
  </svg>`;
}

// 議員カードHTML
function memberCardHTML(m) {
  const p = m.profile;
  const fc = factionColors[p.faction] || '#607D8B';
  const initial = m.name.charAt(0);
  const topCats = m.topics.topCategories?.slice(0, 3) || [];
  const roleTag = p.role ? `<span class="role-tag">${esc(p.role)}</span>` : '';

  return `<div class="m-card" data-name="${esc(m.name)}" data-faction="${esc(p.faction || '')}" onclick="showDetail('${esc(m.name)}')">
    <div class="m-avatar" style="background:${fc}">${initial}</div>
    <div class="m-name">${esc(m.name)}</div>
    <div class="m-faction" style="color:${fc}">${esc(p.faction || '')}</div>
    ${roleTag}
    <div class="m-stats-mini">
      <span>${m.videoCount}本</span><span>${m.questionCount}問</span><span>${p.terms || '?'}期</span>
    </div>
    <div class="m-top-cats">${topCats.map(t => `<span class="cat-pill" style="background:${catColors[t.category] || '#999'}">${t.category.split('・')[0]} ${t.percentage}%</span>`).join('')}</div>
  </div>`;
}

// 議員詳細パネルHTML
function memberDetailHTML(m) {
  const p = m.profile;
  const fc = factionColors[p.faction] || '#607D8B';
  const chart = radarChart(m.topics);

  const videoItems = m.videos
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(v => {
      const tc = v.sessionType === '一般質問' ? '#3498db' : v.sessionType === '大綱質疑' ? '#27ae60' : v.sessionType === '補正予算審議' ? '#e67e22' : '#95a5a6';
      const qs = v.questions && v.questions.length > 0
        ? `<div class="qs-box"><div class="qs-toggle" onclick="this.parentElement.classList.toggle('open')">&#9654; 質問 (${v.questions.length}件)</div><ul class="qs-list">${v.questions.map(q => `<li>${esc(q.substring(0, 180))}</li>`).join('')}</ul></div>`
        : '';
      return `<div class="v-item">
        <a href="${v.url}" target="_blank" class="v-thumb"><img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" loading="lazy"><div class="v-play"></div></a>
        <div class="v-info"><a href="${v.url}" target="_blank" class="v-title">${esc(v.title || v.videoId)}</a>
        <div class="v-meta">${v.date ? `<span class="v-date">${v.date}</span>` : ''}<span class="v-type" style="background:${tc}">${v.sessionType}</span></div>${qs}</div>
      </div>`;
    }).join('');

  return `<div class="detail-panel" id="dp-${esc(m.name)}" style="display:none">
    <button class="back-btn" onclick="hideDetail()">&#9664; 一覧に戻る</button>
    <div class="detail-top">
      <div class="detail-left">
        <div class="detail-avatar" style="background:${fc}">${m.name.charAt(0)}</div>
        <h2>${esc(m.name)}</h2>
        <div class="detail-reading">${esc(p.reading || '')}</div>
        <div class="detail-info">
          <div><span class="info-label">会派</span><span class="info-val" style="color:${fc}">${esc(p.faction || '不明')}</span></div>
          <div><span class="info-label">期数</span><span class="info-val">${p.terms || '?'}期</span></div>
          <div><span class="info-label">生年</span><span class="info-val">${esc(p.birthYear || '不明')}</span></div>
          <div><span class="info-label">委員会</span><span class="info-val">${esc(p.committee || '')}</span></div>
          ${p.role ? `<div><span class="info-label">役職</span><span class="info-val">${esc(p.role)}</span></div>` : ''}
        </div>
      </div>
      <div class="detail-right">
        <h3>注力分野</h3>
        ${chart}
        <div class="cat-bars">${(m.topics.topCategories || []).map(t => `<div class="cat-bar-row"><span class="cat-bar-label">${t.category}</span><div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${Math.min(t.percentage * 2, 100)}%;background:${catColors[t.category] || '#999'}"></div></div><span class="cat-bar-pct">${t.percentage}%</span></div>`).join('')}</div>
      </div>
    </div>
    <h3 class="section-title">発言動画 (${m.videos.length}本)</h3>
    <div class="v-list">${videoItems}</div>
  </div>`;
}

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>伊東市議会分析サイト</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#f0f4f8;--card:#fff;--text:#1a1a2e;--sub:#6b7280;--radius:16px}
body{font-family:-apple-system,'Hiragino Sans','Meiryo',sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:2.5rem 1rem 2rem;text-align:center}
header h1{font-size:1.6rem;font-weight:800;letter-spacing:.05em}
.header-sub{opacity:.85;font-size:.85rem;margin-top:.3rem}
.stats-row{display:flex;justify-content:center;gap:1.5rem;margin-top:1.2rem;flex-wrap:wrap}
.stat-card{background:rgba(255,255,255,.15);border-radius:12px;padding:.6rem 1.2rem;backdrop-filter:blur(10px)}
.stat-val{font-size:1.8rem;font-weight:800}
.stat-lbl{font-size:.75rem;opacity:.85}
nav{display:flex;justify-content:center;gap:.5rem;padding:.8rem 1rem;background:#fff;position:sticky;top:0;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.06)}
nav button{padding:.5rem 1.2rem;border:none;border-radius:25px;font-size:.9rem;font-weight:600;cursor:pointer;transition:.2s;background:transparent;color:var(--sub)}
nav button:hover{background:#f0f4f8}
nav button.active{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
.container{max-width:1200px;margin:0 auto;padding:1rem}
.search-row{display:flex;gap:.8rem;margin:1rem 0;flex-wrap:wrap}
.search-input{flex:1;min-width:200px;padding:.8rem 1.2rem;border:2px solid #e5e7eb;border-radius:12px;font-size:1rem;outline:none;transition:.2s}
.search-input:focus{border-color:#667eea;box-shadow:0 0 0 3px rgba(102,126,234,.15)}
.filter-sel{padding:.8rem 1rem;border:2px solid #e5e7eb;border-radius:12px;font-size:.9rem;background:#fff;outline:none}
.m-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;margin:1rem 0}
.m-card{background:var(--card);border-radius:var(--radius);padding:1.2rem;text-align:center;cursor:pointer;transition:.3s;box-shadow:0 2px 8px rgba(0,0,0,.06);border:2px solid transparent;position:relative;overflow:hidden}
.m-card:hover{transform:translateY(-4px);box-shadow:0 8px 25px rgba(0,0,0,.12)}
.m-card.active{border-color:#667eea}
.m-avatar{width:64px;height:64px;border-radius:50%;margin:0 auto .6rem;display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:800;color:#fff}
.m-name{font-size:1.1rem;font-weight:700;margin-bottom:.2rem}
.m-faction{font-size:.8rem;font-weight:600;margin-bottom:.3rem}
.role-tag{display:inline-block;padding:.1rem .5rem;border-radius:10px;font-size:.7rem;background:#fef3c7;color:#92400e;font-weight:600;margin-bottom:.3rem}
.m-stats-mini{display:flex;justify-content:center;gap:.8rem;font-size:.78rem;color:var(--sub);margin:.4rem 0}
.m-top-cats{display:flex;flex-wrap:wrap;justify-content:center;gap:.3rem;margin-top:.4rem}
.cat-pill{display:inline-block;padding:.1rem .5rem;border-radius:8px;font-size:.65rem;color:#fff;font-weight:500}
.tab-panel{display:none}
.tab-panel.active{display:block}
.back-btn{padding:.5rem 1rem;border:none;border-radius:10px;background:#f0f4f8;font-size:.9rem;cursor:pointer;font-weight:600;margin-bottom:1rem}
.back-btn:hover{background:#e5e7eb}
.detail-panel{display:none}
.detail-top{display:flex;gap:2rem;flex-wrap:wrap;background:var(--card);border-radius:var(--radius);padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:1.5rem}
.detail-left{flex:1;min-width:250px;text-align:center}
.detail-avatar{width:80px;height:80px;border-radius:50%;margin:0 auto .8rem;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:800;color:#fff}
.detail-left h2{font-size:1.5rem;margin-bottom:.2rem}
.detail-reading{color:var(--sub);font-size:.85rem;margin-bottom:1rem}
.detail-info{text-align:left;max-width:300px;margin:0 auto}
.detail-info>div{display:flex;padding:.4rem 0;border-bottom:1px solid #f0f4f8}
.info-label{width:70px;font-size:.8rem;color:var(--sub);flex-shrink:0;font-weight:600}
.info-val{font-size:.85rem;font-weight:500}
.detail-right{flex:1;min-width:280px}
.detail-right h3{text-align:center;margin-bottom:.5rem;font-size:1rem;color:#667eea}
.cat-bars{margin-top:.8rem}
.cat-bar-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem}
.cat-bar-label{width:80px;font-size:.75rem;text-align:right;flex-shrink:0;color:var(--sub)}
.cat-bar-bg{flex:1;height:16px;background:#f0f4f8;border-radius:8px;overflow:hidden}
.cat-bar-fill{height:100%;border-radius:8px;transition:.5s}
.cat-bar-pct{width:35px;font-size:.75rem;color:var(--sub);text-align:right}
.section-title{font-size:1.1rem;font-weight:700;margin:1.5rem 0 .8rem;padding-left:.5rem;border-left:4px solid #667eea}
.v-list{display:flex;flex-direction:column;gap:.8rem}
.v-item{display:flex;background:var(--card);border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);transition:.2s}
.v-item:hover{box-shadow:0 4px 15px rgba(0,0,0,.1)}
.v-thumb{flex-shrink:0;width:180px;min-height:100px;position:relative;display:block;background:#eee}
.v-thumb img{width:100%;height:100px;object-fit:cover}
.v-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;background:rgba(0,0,0,.6);border-radius:50%;display:flex;align-items:center;justify-content:center}
.v-play::after{content:'';border-style:solid;border-width:7px 0 7px 12px;border-color:transparent transparent transparent #fff;margin-left:2px}
.v-info{padding:.6rem .8rem;flex:1;min-width:0}
.v-title{font-weight:600;font-size:.88rem;color:var(--text);text-decoration:none;display:block;margin-bottom:.3rem}
.v-title:hover{color:#667eea}
.v-meta{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
.v-date{font-size:.78rem;color:var(--sub)}
.v-type{display:inline-block;padding:.1rem .5rem;border-radius:6px;font-size:.7rem;color:#fff;font-weight:500}
.qs-box{margin-top:.4rem}
.qs-toggle{cursor:pointer;font-size:.8rem;color:#667eea;font-weight:600;user-select:none}
.qs-toggle:hover{text-decoration:underline}
.qs-list{display:none;list-style:none;padding:0;margin-top:.3rem}
.qs-box.open .qs-list{display:block}
.qs-list li{font-size:.8rem;color:#555;padding:.3rem .5rem;background:#f8f9ff;border-radius:6px;margin-bottom:.3rem;border-left:3px solid #667eea}
.stats-panel{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.stats-box{background:var(--card);border-radius:var(--radius);padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.stats-box h3{font-size:1rem;margin-bottom:1rem;color:#667eea}
.bar-row{margin-bottom:.6rem}
.bar-label{display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:.2rem}
.bar-bg{height:20px;background:#f0f4f8;border-radius:10px;overflow:hidden}
.bar-fill{height:100%;border-radius:10px;transition:.5s}
footer{text-align:center;padding:2rem;color:var(--sub);font-size:.8rem}
#all-v-list .v-item{display:none}
#all-v-list .v-item.vis{display:flex}
.load-btn{display:block;margin:1rem auto;padding:.7rem 2rem;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:.95rem;font-weight:600}
.load-btn:hover{opacity:.9}
@media(max-width:768px){
  .m-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
  .stats-panel{grid-template-columns:1fr}
  .detail-top{flex-direction:column}
  .v-item{flex-direction:column}
  .v-thumb{width:100%;height:160px}
  .v-thumb img{height:160px}
  header h1{font-size:1.3rem}
}
</style>
</head>
<body>
<header>
  <h1>伊東市議会分析サイト</h1>
  <div class="header-sub">YouTube動画の文字起こしから質問・回答を自動分析</div>
  <div class="stats-row">
    <div class="stat-card"><div class="stat-val">${videos.length}</div><div class="stat-lbl">動画数</div></div>
    <div class="stat-card"><div class="stat-val">${allMembers.length}</div><div class="stat-lbl">議員数</div></div>
    <div class="stat-card"><div class="stat-val">${videos.reduce((s,v)=>s+v.questions.length,0)}</div><div class="stat-lbl">質問数</div></div>
    <div class="stat-card"><div class="stat-val">${typeCounts['一般質問']||0}</div><div class="stat-lbl">一般質問</div></div>
  </div>
</header>
<nav>
  <button class="active" onclick="switchTab('members',this)">議員一覧</button>
  <button onclick="switchTab('all',this)">全動画</button>
  <button onclick="switchTab('stats',this)">統計</button>
</nav>
<div class="container">
  <!-- 議員タブ -->
  <div id="tab-members" class="tab-panel active">
    <div class="search-row">
      <input class="search-input" id="m-search" placeholder="議員名・会派で検索..." oninput="filterCards()">
      <select class="filter-sel" id="f-filter" onchange="filterCards()">
        <option value="">全会派</option>
        ${[...new Set(allMembers.map(m=>m.profile.faction).filter(Boolean))].map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('')}
      </select>
    </div>
    <div class="m-grid" id="m-grid">${allMembers.map(m => memberCardHTML(m)).join('')}</div>
    <div id="detail-area">${allMembers.map(m => memberDetailHTML(m)).join('')}</div>
  </div>
  <!-- 全動画タブ -->
  <div id="tab-all" class="tab-panel">
    <div class="search-row">
      <input class="search-input" id="v-search" placeholder="タイトル・質問で検索..." oninput="filterVids()">
      <select class="filter-sel" id="t-filter" onchange="filterVids()">
        <option value="">全種別</option>
        <option value="一般質問">一般質問</option>
        <option value="大綱質疑">大綱質疑</option>
        <option value="補正予算審議">補正予算審議</option>
        <option value="委員会">委員会</option>
      </select>
    </div>
    <div class="v-list" id="all-v-list">
      ${videos.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(v => {
        const tc = v.sessionType==='一般質問'?'#3498db':v.sessionType==='大綱質疑'?'#27ae60':v.sessionType==='補正予算審議'?'#e67e22':'#95a5a6';
        const sp = v.speakers.map(s=>`<span class="cat-pill" style="background:#667eea">${s}</span>`).join('');
        const qs = v.questions.length>0?`<div class="qs-box"><div class="qs-toggle" onclick="this.parentElement.classList.toggle('open')">&#9654; 質問 (${v.questions.length}件)</div><ul class="qs-list">${v.questions.map(q=>`<li>${esc(q.substring(0,180))}</li>`).join('')}</ul></div>`:'';
        return `<div class="v-item" data-type="${v.sessionType}" data-sp="${v.speakers.join(',')}">
          <a href="${v.url}" target="_blank" class="v-thumb"><img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" loading="lazy"><div class="v-play"></div></a>
          <div class="v-info"><a href="${v.url}" target="_blank" class="v-title">${esc(v.title||v.videoId)}</a>
          <div class="v-meta">${v.date?`<span class="v-date">${v.date}</span>`:''}<span class="v-type" style="background:${tc}">${v.sessionType}</span>${sp}</div>${qs}</div>
        </div>`;
      }).join('')}
    </div>
    <button class="load-btn" id="load-btn" onclick="loadMore()">もっと表示</button>
  </div>
  <!-- 統計タブ -->
  <div id="tab-stats" class="tab-panel">
    <div class="stats-panel">
      <div class="stats-box">
        <h3>種別ごとの動画数</h3>
        ${Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([t,c])=>{
          const p=(c/videos.length*100).toFixed(1);
          const cl=t==='一般質問'?'#667eea':t==='大綱質疑'?'#27ae60':t==='補正予算審議'?'#e67e22':'#95a5a6';
          return `<div class="bar-row"><div class="bar-label"><span>${t}</span><span>${c}本 (${p}%)</span></div><div class="bar-bg"><div class="bar-fill" style="width:${p}%;background:${cl}"></div></div></div>`;
        }).join('')}
      </div>
      <div class="stats-box">
        <h3>質問数ランキング</h3>
        ${allMembers.slice(0,15).map((m,i)=>{
          const max=allMembers[0].questionCount;
          const p=max>0?(m.questionCount/max*100).toFixed(1):0;
          return `<div class="bar-row"><div class="bar-label"><span>${i+1}. ${m.name}</span><span>${m.questionCount}問</span></div><div class="bar-bg"><div class="bar-fill" style="width:${p}%;background:linear-gradient(90deg,#667eea,#764ba2)"></div></div></div>`;
        }).join('')}
      </div>
      <div class="stats-box">
        <h3>会派別議員数</h3>
        ${Object.entries(
          allMembers.reduce((acc,m)=>{const f=m.profile.faction||'不明';acc[f]=(acc[f]||0)+1;return acc},{})
        ).sort((a,b)=>b[1]-a[1]).map(([f,c])=>{
          const cl=factionColors[f]||'#607D8B';
          return `<div class="bar-row"><div class="bar-label"><span style="color:${cl};font-weight:600">${f}</span><span>${c}名</span></div><div class="bar-bg"><div class="bar-fill" style="width:${c/allMembers.length*100}%;background:${cl}"></div></div></div>`;
        }).join('')}
      </div>
      <div class="stats-box">
        <h3>動画数ランキング</h3>
        ${allMembers.slice(0,15).map((m,i)=>{
          const max=allMembers[0].videoCount;
          const p=(m.videoCount/max*100).toFixed(1);
          return `<div class="bar-row"><div class="bar-label"><span>${i+1}. ${m.name}</span><span>${m.videoCount}本</span></div><div class="bar-bg"><div class="bar-fill" style="width:${p}%;background:linear-gradient(90deg,#764ba2,#667eea)"></div></div></div>`;
        }).join('')}
      </div>
    </div>
  </div>
</div>
<footer>最終更新: ${new Date().toLocaleDateString('ja-JP')}</footer>
<script>
let vCount=30;
function switchTab(id,btn){
  document.querySelectorAll('.tab-panel').forEach(e=>e.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(e=>e.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  if(id==='all'){vCount=30;showVids();}
}
function filterCards(){
  const q=document.getElementById('m-search').value.toLowerCase();
  const f=document.getElementById('f-filter').value;
  document.querySelectorAll('.m-card').forEach(el=>{
    const n=el.dataset.name.toLowerCase();
    const fc=el.dataset.faction;
    el.style.display=(n.includes(q)||!q)&&(fc===f||!f)?'':'none';
  });
}
function showDetail(name){
  document.getElementById('m-grid').style.display='none';
  document.querySelector('.search-row').style.display='none';
  document.querySelectorAll('.detail-panel').forEach(e=>e.style.display='none');
  const dp=document.getElementById('dp-'+name);
  if(dp)dp.style.display='block';
}
function hideDetail(){
  document.querySelectorAll('.detail-panel').forEach(e=>e.style.display='none');
  document.getElementById('m-grid').style.display='';
  document.querySelector('.search-row').style.display='';
}
function showVids(){
  const items=document.querySelectorAll('#all-v-list .v-item');
  const tf=document.getElementById('t-filter').value;
  const sq=document.getElementById('v-search').value.toLowerCase();
  let shown=0;
  items.forEach(el=>{
    const mt=!tf||el.dataset.type===tf;
    const ms=!sq||el.textContent.toLowerCase().includes(sq);
    if(mt&&ms&&shown<vCount){el.classList.add('vis');shown++}
    else{el.classList.remove('vis')}
  });
  document.getElementById('load-btn').style.display=shown>=vCount?'':'none';
}
function filterVids(){vCount=30;showVids();}
function loadMore(){vCount+=30;showVids();}
document.addEventListener('DOMContentLoaded',()=>{showVids();});
</script>
</body>
</html>`;

fs.writeFileSync('index.html', html);
console.log(`HTML生成完了: ${(html.length/1024).toFixed(0)}KB`);
