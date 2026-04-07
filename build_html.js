const fs = require('fs');
const path = require('path');

const analysisData = JSON.parse(fs.readFileSync(path.join(__dirname, 'analysis_data.json'), 'utf-8'));
const { videos, memberSummary } = analysisData;

// メンバーをビデオ数でソート
const sortedMembers = Object.values(memberSummary)
  .filter(m => m.videos.length > 0)
  .sort((a, b) => b.videos.length - a.videos.length);

// セッション種別ごとの集計
const typeCounts = {};
for (const v of videos) {
  typeCounts[v.sessionType] = (typeCounts[v.sessionType] || 0) + 1;
}

// 議員カードHTML生成
function memberCardsHTML() {
  return sortedMembers.map(m => `
    <div class="member-card" data-member="${m.name}" onclick="selectMember('${m.name}')">
      <div class="member-name">${m.name}</div>
      <div class="member-count">${m.videos.length}本 / 質問${m.totalQuestions}件</div>
    </div>
  `).join('');
}

// 議員別詳細パネルHTML
function memberDetailsHTML() {
  return sortedMembers.map(m => {
    const videoItems = m.videos
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(v => {
        const tagClass = v.sessionType === '一般質問' ? 'tag-ippan' :
          v.sessionType === '大綱質疑' ? 'tag-yosan' :
          v.sessionType === '補正予算審議' ? 'tag-kessan' :
          v.sessionType === '委員会' ? 'tag-gian' : 'tag-other';

        const questionsHTML = v.questions && v.questions.length > 0
          ? `<div class="questions-list">
              <div class="questions-toggle" onclick="this.parentElement.classList.toggle('open')">
                <span class="toggle-icon">&#9654;</span> 質問内容 (${v.questions.length}件)
              </div>
              <ul class="questions-items">
                ${v.questions.map(q => `<li>${escapeHtml(q.substring(0, 200))}</li>`).join('')}
              </ul>
            </div>`
          : '';

        return `
          <div class="video-item" data-type="${v.sessionType}">
            <a href="${v.url}" target="_blank" rel="noopener" class="video-thumb">
              <img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" alt="" loading="lazy">
              <div class="play-overlay"></div>
            </a>
            <div class="video-info">
              <a href="${v.url}" target="_blank" rel="noopener" class="video-title">${escapeHtml(v.title || v.videoId)}</a>
              <div class="video-meta">
                ${v.date ? `<span class="session-tag">${v.date}</span>` : ''}
                <span class="tag ${tagClass}">${v.sessionType}</span>
                ${v.mentionOnly ? '<span class="tag tag-other">言及のみ</span>' : ''}
              </div>
              ${questionsHTML}
            </div>
          </div>
        `;
      }).join('');

    return `
      <div class="member-detail" id="detail-${m.name}" style="display:none">
        <div class="detail-header">
          <h2>${m.name}</h2>
          <div class="detail-stats">
            <span>動画 ${m.videos.length}本</span>
            <span>質問 ${m.totalQuestions}件</span>
          </div>
        </div>
        <div class="detail-videos">${videoItems}</div>
      </div>
    `;
  }).join('');
}

// 全動画リストHTML（タブ用）
function allVideosHTML() {
  return videos
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(v => {
      const tagClass = v.sessionType === '一般質問' ? 'tag-ippan' :
        v.sessionType === '大綱質疑' ? 'tag-yosan' :
        v.sessionType === '補正予算審議' ? 'tag-kessan' :
        v.sessionType === '委員会' ? 'tag-gian' : 'tag-other';

      const speakersHTML = v.speakers.length > 0
        ? v.speakers.map(s => `<span class="speaker-tag">${s}</span>`).join('')
        : '';

      const questionsHTML = v.questions && v.questions.length > 0
        ? `<div class="questions-list">
            <div class="questions-toggle" onclick="this.parentElement.classList.toggle('open')">
              <span class="toggle-icon">&#9654;</span> 質問内容 (${v.questions.length}件)
            </div>
            <ul class="questions-items">
              ${v.questions.map(q => `<li>${escapeHtml(q.substring(0, 200))}</li>`).join('')}
            </ul>
          </div>`
        : '';

      return `
        <div class="video-item" data-type="${v.sessionType}" data-speakers="${v.speakers.join(',')}">
          <a href="${v.url}" target="_blank" rel="noopener" class="video-thumb">
            <img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" alt="" loading="lazy">
            <div class="play-overlay"></div>
          </a>
          <div class="video-info">
            <a href="${v.url}" target="_blank" rel="noopener" class="video-title">${escapeHtml(v.title || v.videoId)}</a>
            <div class="video-meta">
              ${v.date ? `<span class="session-tag">${v.date}</span>` : ''}
              <span class="tag ${tagClass}">${v.sessionType}</span>
              ${speakersHTML}
            </div>
            ${questionsHTML}
          </div>
        </div>
      `;
    }).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>伊東市議会チャンネルまとめ - 質問・回答アーカイブ</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--pri:#1a5276;--pri-l:#2980b9;--bg:#f5f7fa;--text:#2c3e50;--tl:#7f8c8d;--bdr:#dce1e6}
body{font-family:'Segoe UI','Hiragino Sans','Meiryo',sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
header{background:linear-gradient(135deg,var(--pri),var(--pri-l));color:#fff;padding:2rem 1rem;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15)}
header h1{font-size:1.8rem;margin-bottom:.3rem}
header p{opacity:.9;font-size:.95rem}
.stats{display:flex;justify-content:center;gap:2rem;margin-top:1rem;flex-wrap:wrap}
.stat-box{text-align:center}
.stat-num{font-size:2rem;font-weight:700}
.stat-label{font-size:.85rem;opacity:.8}
.container{max-width:1200px;margin:0 auto;padding:1rem}
.tabs{display:flex;background:#fff;border-radius:8px;overflow:hidden;margin:1rem 0;box-shadow:0 1px 3px rgba(0,0,0,.1);flex-wrap:wrap}
.tab{flex:1;min-width:120px;padding:.8rem 1rem;text-align:center;cursor:pointer;border:none;background:none;font-size:.95rem;font-weight:500;color:var(--tl);transition:.2s;border-bottom:3px solid transparent}
.tab:hover{background:var(--bg);color:var(--text)}
.tab.active{color:var(--pri);border-bottom-color:var(--pri);background:var(--bg)}
.controls{display:flex;gap:1rem;margin:1rem 0;flex-wrap:wrap}
.search-box{flex:1;min-width:200px;padding:.7rem 1rem;border:2px solid var(--bdr);border-radius:8px;font-size:1rem;outline:none;transition:.2s}
.search-box:focus{border-color:var(--pri-l)}
.filter-select{padding:.7rem 1rem;border:2px solid var(--bdr);border-radius:8px;font-size:.95rem;outline:none;min-width:160px;background:#fff}
.member-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.8rem;margin:1rem 0}
.member-card{background:#fff;border-radius:8px;padding:1rem;text-align:center;cursor:pointer;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.08);border:2px solid transparent}
.member-card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.12)}
.member-card.active{border-color:var(--pri);background:#ebf5fb}
.member-name{font-weight:600;font-size:1rem;margin-bottom:.3rem}
.member-count{font-size:.8rem;color:var(--tl)}
.video-list{margin:1rem 0}
.video-item{display:flex;background:#fff;border-radius:8px;margin-bottom:.8rem;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);transition:.2s}
.video-item:hover{box-shadow:0 4px 12px rgba(0,0,0,.12)}
.video-thumb{flex-shrink:0;width:200px;min-height:112px;background:#eee;position:relative;display:block}
.video-thumb img{width:100%;height:112px;object-fit:cover}
.play-overlay{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;background:rgba(0,0,0,.7);border-radius:50%;display:flex;align-items:center;justify-content:center}
.play-overlay::after{content:'';border-style:solid;border-width:8px 0 8px 14px;border-color:transparent transparent transparent #fff;margin-left:3px}
.video-info{padding:.8rem 1rem;flex:1;min-width:0}
.video-title{font-weight:600;font-size:.95rem;margin-bottom:.3rem;color:var(--text);text-decoration:none;display:block}
.video-title:hover{color:var(--pri-l)}
.video-meta{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:.3rem}
.tag{display:inline-block;padding:.15rem .6rem;border-radius:4px;font-size:.75rem;font-weight:500;color:#fff}
.tag-ippan{background:#3498db}
.tag-yosan{background:#27ae60}
.tag-kessan{background:#e67e22}
.tag-gian{background:#9b59b6}
.tag-other{background:#95a5a6}
.session-tag{font-size:.8rem;color:var(--tl)}
.speaker-tag{display:inline-block;padding:.1rem .5rem;border-radius:3px;font-size:.75rem;background:#ebf5fb;color:var(--pri);margin-left:.3rem;font-weight:500}
.detail-header{display:flex;justify-content:space-between;align-items:center;padding:1rem;background:#fff;border-radius:8px;margin-bottom:1rem;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.detail-header h2{font-size:1.4rem;color:var(--pri)}
.detail-stats{display:flex;gap:1.5rem}
.detail-stats span{font-size:.95rem;color:var(--tl);font-weight:500}
.back-btn{display:inline-block;padding:.5rem 1rem;background:var(--pri);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.9rem;margin-bottom:1rem}
.back-btn:hover{background:var(--pri-l)}
.tab-content{display:none}
.tab-content.active{display:block}
.questions-list{margin-top:.5rem}
.questions-toggle{cursor:pointer;font-size:.85rem;color:var(--pri-l);font-weight:500;padding:.3rem 0;user-select:none}
.questions-toggle:hover{text-decoration:underline}
.toggle-icon{display:inline-block;transition:.2s;font-size:.7rem}
.questions-list.open .toggle-icon{transform:rotate(90deg)}
.questions-items{display:none;list-style:disc;padding-left:1.5rem;margin-top:.3rem}
.questions-list.open .questions-items{display:block}
.questions-items li{font-size:.85rem;color:#555;margin-bottom:.3rem;line-height:1.4}
footer{text-align:center;padding:2rem 1rem;color:var(--tl);font-size:.85rem;margin-top:2rem}
@media(max-width:600px){
  .video-item{flex-direction:column}
  .video-thumb{width:100%;height:180px}
  .video-thumb img{height:180px}
  .member-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
  header h1{font-size:1.3rem}
  .stats{gap:1rem}
  .stat-num{font-size:1.5rem}
}
#all-videos-list .video-item{display:none}
#all-videos-list .video-item.visible{display:flex}
.load-more-btn{display:block;margin:1rem auto;padding:.8rem 2rem;background:var(--pri);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem}
.load-more-btn:hover{background:var(--pri-l)}
.type-filters{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0}
.type-filter{padding:.4rem .8rem;border-radius:20px;border:2px solid var(--bdr);background:#fff;cursor:pointer;font-size:.85rem;transition:.2s}
.type-filter:hover{border-color:var(--pri-l)}
.type-filter.active{background:var(--pri);color:#fff;border-color:var(--pri)}
</style>
</head>
<body>
<header>
  <h1>伊東市議会チャンネルまとめ</h1>
  <p>YouTube動画の文字起こしから質問・回答を自動分析</p>
  <div class="stats">
    <div class="stat-box"><div class="stat-num">${videos.length}</div><div class="stat-label">動画数</div></div>
    <div class="stat-box"><div class="stat-num">${sortedMembers.length}</div><div class="stat-label">議員数</div></div>
    <div class="stat-box"><div class="stat-num">${videos.reduce((s,v) => s + v.questions.length, 0)}</div><div class="stat-label">質問数</div></div>
    <div class="stat-box"><div class="stat-num">${typeCounts['一般質問'] || 0}</div><div class="stat-label">一般質問</div></div>
  </div>
</header>
<div class="container">
  <div class="tabs">
    <button class="tab active" onclick="switchTab('members')">議員別</button>
    <button class="tab" onclick="switchTab('all')">全動画一覧</button>
    <button class="tab" onclick="switchTab('stats')">統計</button>
  </div>

  <!-- 議員別タブ -->
  <div id="tab-members" class="tab-content active">
    <div class="controls">
      <input type="text" class="search-box" id="member-search" placeholder="議員名で検索..." oninput="filterMembers()">
    </div>
    <div class="member-grid" id="member-grid">
      ${memberCardsHTML()}
    </div>
    <div id="member-details">
      ${memberDetailsHTML()}
    </div>
  </div>

  <!-- 全動画タブ -->
  <div id="tab-all" class="tab-content">
    <div class="controls">
      <input type="text" class="search-box" id="video-search" placeholder="タイトル・質問内容で検索..." oninput="filterVideos()">
      <select class="filter-select" id="type-filter" onchange="filterVideos()">
        <option value="">全種別</option>
        <option value="一般質問">一般質問</option>
        <option value="大綱質疑">大綱質疑</option>
        <option value="補正予算審議">補正予算審議</option>
        <option value="委員会">委員会</option>
        <option value="討論">討論</option>
      </select>
    </div>
    <div class="video-list" id="all-videos-list">
      ${allVideosHTML()}
    </div>
    <button class="load-more-btn" id="load-more" onclick="loadMore()">もっと表示</button>
  </div>

  <!-- 統計タブ -->
  <div id="tab-stats" class="tab-content">
    <div style="background:#fff;border-radius:8px;padding:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:1rem">
      <h3 style="margin-bottom:1rem;color:var(--pri)">セッション種別</h3>
      ${Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([type, count]) => {
        const pct = (count / videos.length * 100).toFixed(1);
        const color = type === '一般質問' ? '#3498db' : type === '大綱質疑' ? '#27ae60' : type === '補正予算審議' ? '#e67e22' : '#95a5a6';
        return `<div style="margin-bottom:.8rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:.2rem"><span>${type}</span><span>${count}本 (${pct}%)</span></div>
          <div style="background:#eee;border-radius:4px;height:24px;overflow:hidden"><div style="width:${pct}%;background:${color};height:100%;border-radius:4px;transition:.3s"></div></div>
        </div>`;
      }).join('')}
    </div>
    <div style="background:#fff;border-radius:8px;padding:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin-bottom:1rem;color:var(--pri)">議員別質問数ランキング</h3>
      ${sortedMembers.slice(0, 20).map((m, i) => {
        const maxQ = sortedMembers[0].totalQuestions;
        const pct = maxQ > 0 ? (m.totalQuestions / maxQ * 100).toFixed(1) : 0;
        return `<div style="margin-bottom:.6rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:.2rem"><span>${i+1}. ${m.name}</span><span>${m.totalQuestions}件 / ${m.videos.length}本</span></div>
          <div style="background:#eee;border-radius:4px;height:20px;overflow:hidden"><div style="width:${pct}%;background:var(--pri-l);height:100%;border-radius:4px"></div></div>
        </div>`;
      }).join('')}
    </div>
  </div>
</div>
<footer>
  <p>伊東市議会YouTubeチャンネル動画の自動文字起こし・分析に基づくまとめ</p>
  <p>最終更新: ${new Date().toLocaleDateString('ja-JP')}</p>
</footer>
<script>
let visibleCount = 30;
function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
  if (name === 'all') { visibleCount = 30; showVideos(); }
}
function selectMember(name) {
  document.querySelectorAll('.member-card').forEach(el => {
    el.classList.toggle('active', el.dataset.member === name);
  });
  document.querySelectorAll('.member-detail').forEach(el => el.style.display = 'none');
  const detail = document.getElementById('detail-' + name);
  if (detail) {
    detail.style.display = 'block';
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
function filterMembers() {
  const q = document.getElementById('member-search').value.toLowerCase();
  document.querySelectorAll('.member-card').forEach(el => {
    el.style.display = el.dataset.member.toLowerCase().includes(q) ? '' : 'none';
  });
}
function showVideos() {
  const items = document.querySelectorAll('#all-videos-list .video-item');
  const typeFilter = document.getElementById('type-filter').value;
  const searchQ = document.getElementById('video-search').value.toLowerCase();
  let shown = 0;
  items.forEach(el => {
    const matchType = !typeFilter || el.dataset.type === typeFilter;
    const text = el.textContent.toLowerCase();
    const matchSearch = !searchQ || text.includes(searchQ);
    if (matchType && matchSearch && shown < visibleCount) {
      el.classList.add('visible');
      shown++;
    } else {
      el.classList.remove('visible');
    }
  });
  document.getElementById('load-more').style.display = shown >= visibleCount ? '' : 'none';
}
function filterVideos() { visibleCount = 30; showVideos(); }
function loadMore() { visibleCount += 30; showVideos(); }
document.addEventListener('DOMContentLoaded', () => { showVideos(); });
</script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log(`HTML生成完了: ${(html.length / 1024).toFixed(0)}KB`);
console.log(`議員数: ${sortedMembers.length}`);
console.log(`動画数: ${videos.length}`);
