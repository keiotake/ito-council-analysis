const fs = require('fs');

const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const profiles = JSON.parse(fs.readFileSync('profiles.json', 'utf-8'));
const topics = JSON.parse(fs.readFileSync('member_topics.json', 'utf-8'));
const descriptions = JSON.parse(fs.readFileSync('member_descriptions.json', 'utf-8'));
// 公式PDF準拠の詳細委員会データ
let councilData = null;
try { councilData = JSON.parse(fs.readFileSync('ito_council_members.json', 'utf-8')); } catch(e) {}

let photos = {};
try {
  const rawPhotos = JSON.parse(fs.readFileSync('member_photos.json', 'utf-8'));
  for (const [name, data] of Object.entries(rawPhotos)) {
    photos[name] = data.photo_url || data.election_photo_url || '';
  }
} catch(e) {}
let responsesData = null;
try { responsesData = JSON.parse(fs.readFileSync('analysis_with_responses.json', 'utf-8')); } catch(e) {}
let questionSummaries = {};
try { questionSummaries = JSON.parse(fs.readFileSync('question_summaries.json', 'utf-8')); } catch(e) {}

const { videos, memberSummary } = analysis;

// 回答データをvideoIdでインデックス化
const responseMap = {};
if (responsesData && responsesData.videos) {
  for (const v of responsesData.videos) {
    responseMap[v.videoId] = v.questions || [];
  }
}

// 詳細委員会マップ構築
const memberCommitteeMap = {};
if (councilData && councilData.members) {
  for (const m of councilData.members) {
    memberCommitteeMap[m.name] = {
      committees: m.committees || [],
      faction_role: m.faction_role,
      special_role: m.special_role,
    };
  }
}

const factionColors = {
  '伊東未来': '#2196F3',
  '政和会': '#4CAF50',
  '公明党': '#FF9800',
  '正風クラブ': '#9C27B0',
  '自由民主伊東': '#F44336',
  '無所属': '#607D8B',
  '無会派': '#607D8B',
};

const factionOrder = ['伊東未来', '正風クラブ', '自由民主伊東', '政和会', '公明党', '無会派', '無所属'];

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

// 現役議員名リスト
const currentMembers = new Set(Object.keys(profiles));

// 議員データ統合（動画があるメンバー）
const membersFromVideos = Object.entries(memberSummary)
  .filter(([_, d]) => d.videos.length > 0)
  .map(([name, data]) => ({
    name,
    profile: profiles[name] || {},
    topics: topics[name] || { topCategories: [], percentage: {} },
    description: descriptions[name] || '',
    photoUrl: photos[name] || '',
    videoCount: data.videos.length,
    questionCount: data.totalQuestions,
    videos: data.videos,
    isCurrent: currentMembers.has(name),
  }));

// profiles.jsonにいるが動画データがない議員も追加
const namesFromVideos = new Set(membersFromVideos.map(m => m.name));
const membersWithoutVideos = Object.keys(profiles)
  .filter(name => !namesFromVideos.has(name))
  .map(name => ({
    name,
    profile: profiles[name] || {},
    topics: topics[name] || { topCategories: [], percentage: {} },
    description: descriptions[name] || '',
    photoUrl: photos[name] || '',
    videoCount: 0,
    questionCount: 0,
    videos: [],
    isCurrent: true,
  }));

const allMembers = [...membersFromVideos, ...membersWithoutVideos];

// ソート: 現役優先 → 会派順 → 動画数降順
allMembers.sort((a, b) => {
  if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
  const fi = (f) => { const i = factionOrder.indexOf(f); return i >= 0 ? i : 99; };
  const fa = fi(a.profile.faction || '');
  const fb = fi(b.profile.faction || '');
  if (fa !== fb) return fa - fb;
  return b.videoCount - a.videoCount;
});

const currentMembersList = allMembers.filter(m => m.isCurrent);
const formerMembersList = allMembers.filter(m => !m.isCurrent);

function groupByFaction(members) {
  const groups = {};
  for (const m of members) {
    const f = m.profile.faction || '無所属';
    if (!groups[f]) groups[f] = [];
    groups[f].push(m);
  }
  return groups;
}

const typeCounts = {};
for (const v of videos) typeCounts[v.sessionType] = (typeCounts[v.sessionType] || 0) + 1;

// ============ Phase 1: 比較・検索・トレンド用データ集計 ============

// 年度集計（年別 × 種別 × 質問数）
const yearStats = {}; // { 2024: { total: N, types: {...}, questions: N } }
for (const v of videos) {
  const y = (v.date || '').substring(0, 4);
  if (!y || y.length !== 4) continue;
  if (!yearStats[y]) yearStats[y] = { videos: 0, types: {}, questions: 0 };
  yearStats[y].videos++;
  yearStats[y].types[v.sessionType] = (yearStats[y].types[v.sessionType] || 0) + 1;
  yearStats[y].questions += (v.questions || []).length;
}
const sortedYears = Object.keys(yearStats).sort();

// 年別キーワードランキング（要約ベース）
const stopWords = new Set(['について','および','における','ついて','思います','考え','質問','答弁','市長','議員','伺い','伺う','ます','です','こと','もの','ため','よう','から','まで','この','その','あの','どの','本市','今回','以上','今後','点目','成果','見通','成果及','方及','現状','対応','取組','取り組','一般','本年','本日','以下','以外','以来','以降','以前','回答','改善','確認','検討','実施','実現','実際','実情','状況','状態','内容','場合','部分','方法','理由','結果','原因','影響','地域','市民','現在','向上','推進','促進','全体','一部','可能','必要','重要','大切']);
// 質の高いキーワード辞書（実際の議題に登場するもの優先）
const goodKeywords = new Set(['観光','防災','災害','SDGs','LGBTQ','ICT','DX','メガソーラー','太陽光','保育','学校','給食','温泉','道路','ゴミ','ごみ','競輪','図書館','高齢者','介護','医療','空き家','公園','水道','病院','予算','財政','条例','子育て','教育','環境','産業','農業','漁業','林業','インバウンド','移住','定住','空港','交通','バス','タクシー','駐車場','駅','防犯','街灯','歩道','歩行者','自転車','犯罪','防犯灯','避難所','避難','要支援','耐震','液状化','津波','土砂','崩落','崖','急傾斜','市営','公営','住宅','団地','空店舗','商店街','中心市街','過疎','人口','少子','高齢化','婚活','結婚','出産','妊娠','子ども','女性','男女共同','ジェンダー','虐待','いじめ','不登校','特別支援','放課後','児童','クラブ','幼稚園','こども園','保育園','地域包括','要介護','在宅','看取','緩和ケア','認知症','フレイル','運動','スポーツ','文化','芸術','音楽','図書','歴史','文化財','遺跡','博物館','美術館','再生可能','省エネ','脱炭素','カーボン','ニュートラル','エネルギー','電気','電力','水素','太陽','風力','地熱','森林','里山','生物','多様','希少','野生','害獣','イノシシ','鹿','猿','カラス','産業廃棄','焼却','埋立','資源','循環','リサイクル','分別','コンポスト','プラスチック','レジ袋','マイクロ','汚水','下水','上水','取水','配水','給水','井戸','地下水','湧水','河川','護岸','堤防','水門','ダム','排水','内水','氾濫','浸水','崖崩','地震','南海','東海','富士山','噴火','火山','緊急','広域','連携','姉妹','友好','SDGs推進','SDGs目標']);
function extractKeywords(text) {
  const kws = [];
  // good keyword辞書を最優先
  for (const kw of goodKeywords) {
    if (text.includes(kw)) kws.push(kw);
  }
  // それ以外は3〜6文字の漢字連続 or カタカナ連続のみ（短い切れ端を除外）
  const matches = [...(text.matchAll(/[\u4e00-\u9fff]{3,6}|[ァ-ヶー]{3,8}/g) || [])];
  for (const m of matches) {
    const w = m[0];
    if (stopWords.has(w)) continue;
    if (kws.includes(w)) continue;
    kws.push(w);
  }
  return kws;
}
const yearKeywords = {};
for (const v of videos) {
  const y = (v.date || '').substring(0, 4);
  if (!y || y.length !== 4) continue;
  if (!yearKeywords[y]) yearKeywords[y] = {};
  const sums = questionSummaries[v.videoId] || [];
  for (const s of sums) {
    for (const kw of extractKeywords(s)) {
      yearKeywords[y][kw] = (yearKeywords[y][kw] || 0) + 1;
    }
  }
}

// 検索インデックス（軽量: videoId, title, date, url, type, speakers, 要約配列）
const searchIndex = videos.map(v => {
  const sums = questionSummaries[v.videoId] || [];
  return {
    i: v.videoId,
    t: v.title || '',
    d: v.date || '',
    u: v.url,
    y: v.sessionType,
    s: v.speakers || [],
    q: sums.filter(x => x && x !== '質問内容').slice(0, 10),
  };
}).filter(v => v.q.length > 0 || v.t);

// 比較用議員データ（現役のみ・軽量化）
const compareData = currentMembersList.map(m => ({
  name: m.name,
  faction: m.profile.faction || '',
  factionColor: factionColors[m.profile.faction] || '#607D8B',
  photo: m.photoUrl || '',
  questionCount: m.questionCount,
  videoCount: m.videoCount,
  percentage: m.topics.percentage || {},
  topCategories: (m.topics.topCategories || []).slice(0, 3),
}));

// 委員会情報をHTML化
function committeeHTML(name) {
  const cd = memberCommitteeMap[name];
  if (!cd || !cd.committees.length) {
    const p = profiles[name];
    return p && p.committee ? `<div class="cm-item">${esc(p.committee)}</div>` : '';
  }
  return cd.committees.map(c => {
    const roleBadge = c.role === '委員長' ? '<span class="cm-badge cm-chair">委員長</span>'
      : c.role === '副委員長' ? '<span class="cm-badge cm-vice">副委員長</span>'
      : '<span class="cm-badge cm-member">委員</span>';
    return `<div class="cm-item">${esc(c.name)} ${roleBadge}</div>`;
  }).join('');
}

// 役職情報統一HTML
function rolesHTML(name) {
  const cd = memberCommitteeMap[name];
  const roles = [];
  if (cd) {
    if (cd.special_role) roles.push(cd.special_role);
    if (cd.faction_role) {
      const p = profiles[name];
      roles.push(`${p?.faction || ''} ${cd.faction_role}`);
    }
  } else {
    const p = profiles[name];
    if (p && p.role) roles.push(p.role);
  }
  return roles.map(r => `<span class="role-tag">${esc(r)}</span>`).join(' ');
}

// レーダーチャートSVG
function radarChart(topicData, size = 280) {
  const cats = Object.keys(catColors);
  const n = cats.length;
  const cx = size / 2, cy = size / 2, r = size * 0.32;
  const rawPcts = cats.map(c => topicData.percentage?.[c] || 0);
  const maxPct = Math.max(...rawPcts, 1); // 最大値を基準にスケーリング
  const pcts = rawPcts.map(p => p / 100);

  let gridLines = '';
  for (let level = 1; level <= 4; level++) {
    const lr = r * level / 4;
    let pts = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      pts.push(`${cx + lr * Math.cos(angle)},${cy + lr * Math.sin(angle)}`);
    }
    gridLines += `<polygon points="${pts.join(' ')}" fill="none" stroke="#ddd" stroke-width="0.8"/>`;
  }

  let axes = '';
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    axes += `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(angle)}" y2="${cy + r * Math.sin(angle)}" stroke="#ddd" stroke-width="0.5"/>`;
  }

  let dataPts = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const val = Math.min(rawPcts[i] / maxPct, 1); // 最大カテゴリを100%として相対表示
    dataPts.push(`${cx + r * val * Math.cos(angle)},${cy + r * val * Math.sin(angle)}`);
  }

  let labels = '';
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const lx = cx + (r + 25) * Math.cos(angle);
    const ly = cy + (r + 25) * Math.sin(angle);
    labels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#555" font-weight="500">${cats[i]}</text>`;
  }

  // スケールラベル（最外周=maxPct%）
  const scaleLabels = [1,2,3,4].map(level => {
    const val = Math.round(maxPct * level / 4);
    const ly = cy - r * level / 4 - 2;
    return `<text x="${cx+2}" y="${ly}" font-size="8" fill="#bbb">${val}%</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="max-width:100%">
    ${gridLines}${axes}${scaleLabels}
    <polygon points="${dataPts.join(' ')}" fill="rgba(102,126,234,0.25)" stroke="#667eea" stroke-width="2"/>
    ${labels}
  </svg>`;
}

// 議員カードHTML（統一フォーマット）
function memberCardHTML(m) {
  const p = m.profile;
  const fc = factionColors[p.faction] || '#607D8B';
  const initial = m.name.charAt(0);
  const topCats = m.topics.topCategories?.slice(0, 3) || [];
  const roles = rolesHTML(m.name);

  // 常任委員会名のみ短縮表示
  const cd = memberCommitteeMap[m.name];
  let shortCommittee = '';
  if (cd && cd.committees.length > 0) {
    const standing = cd.committees.find(c => c.name.startsWith('常任'));
    if (standing) {
      const cName = standing.name.replace('常任', '');
      const cRole = standing.role === '委員長' ? ' 委員長' : standing.role === '副委員長' ? ' 副委員長' : '';
      shortCommittee = cName + cRole;
    }
  } else if (p.committee) {
    shortCommittee = p.committee.replace('常任', '');
  }

  const avatarContent = m.photoUrl
    ? `<div class="m-avatar-photo" style="border-color:${fc}"><img src="${esc(m.photoUrl)}" alt="${esc(m.name)}" onerror="this.parentElement.innerHTML='<div class=m-avatar-fb style=background:${fc}>${initial}</div>'"></div>`
    : `<div class="m-avatar" style="background:${fc}">${initial}</div>`;

  return `<div class="m-card" data-name="${esc(m.name)}" data-faction="${esc(p.faction || '')}" onclick="showDetail('${esc(m.name)}')">
    ${avatarContent}
    <div class="m-name">${esc(m.name)}</div>
    <div class="m-faction" style="color:${fc}">${esc(p.faction || '')}</div>
    ${roles}
    <div class="m-committee">${esc(shortCommittee)}</div>
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
  const initial = m.name.charAt(0);
  const roles = rolesHTML(m.name);
  const committees = committeeHTML(m.name);

  const avatarContent = m.photoUrl
    ? `<div class="detail-avatar-photo" style="border-color:${fc}"><img src="${esc(m.photoUrl)}" alt="${esc(m.name)}" onerror="this.parentElement.innerHTML='<div class=detail-avatar style=background:${fc}>${initial}</div>'"></div>`
    : `<div class="detail-avatar" style="background:${fc}">${initial}</div>`;

  // 動画リスト（質問を箇条書きで常に表示）
  const videoItems = m.videos
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(v => {
      const tc = v.sessionType === '一般質問' ? '#3498db' : v.sessionType === '大綱質疑' ? '#27ae60' : v.sessionType === '補正予算審議' ? '#e67e22' : '#95a5a6';

      const videoResponses = responseMap[v.videoId] || [];

      // 質問を要約で箇条書き表示
      const summaries = questionSummaries[v.videoId] || [];
      let qsContent = '';
      if (v.questions && v.questions.length > 0) {
        const qItems = v.questions.map((q, qi) => {
          let summary = summaries[qi] || '';
          if (!summary || summary === '質問内容') {
            // フォールバック：生テキストから短い要約を生成
            const cleaned = q.replace(/[\n\r]/g, '').replace(/^[^ぁ-んァ-ヶ\u4e00-\u9fff]*/,'')
              .replace(/.{2,6}(君|くん)の一般質問を許します/g,'')
              .replace(/委?\d+番?\d*/g,'').trim();
            summary = cleaned.length > 55 ? cleaned.substring(0, 52) + '…' : cleaned;
          }
          if (summary.length > 55) summary = summary.substring(0, 52) + '…';
          const resp = videoResponses[qi];
          const respText = resp && resp.response
            ? `<div class="resp-box"><span class="resp-label">当局回答</span><div class="resp-toggle" onclick="this.parentElement.classList.toggle('expanded')">${esc(resp.response.substring(0, 120))}${resp.response.length > 120 ? '...<span class="resp-more">続きを読む</span>' : ''}</div><div class="resp-full">${esc(resp.response)}</div></div>`
            : '';
          return `<li><div class="q-bullet">${esc(summary)}</div>${respText}</li>`;
        }).join('');
        qsContent = `<ul class="q-list-always">${qItems}</ul>`;
      }

      return `<div class="v-item">
        <a href="${v.url}" target="_blank" class="v-thumb"><img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" loading="lazy"><div class="v-play"></div></a>
        <div class="v-info"><a href="${v.url}" target="_blank" class="v-title">${esc(v.title || v.videoId)}</a>
        <div class="v-meta">${v.date ? `<span class="v-date">${v.date}</span>` : ''}<span class="v-type" style="background:${tc}">${v.sessionType}</span></div>${qsContent}</div>
      </div>`;
    }).join('');

  return `<div class="detail-panel" id="dp-${esc(m.name)}" style="display:none">
    <button class="back-btn" onclick="hideDetail()">&#9664; 一覧に戻る</button>
    <div class="detail-top">
      <div class="detail-left">
        ${avatarContent}
        <h2>${esc(m.name)}</h2>
        <div class="detail-reading">${esc(p.reading || '')}</div>
        ${m.isCurrent ? '<span class="current-badge">現職</span>' : '<span class="former-badge">元職</span>'}
        <div class="detail-roles">${roles}</div>
        <div class="detail-info">
          <div><span class="info-label">会派</span><span class="info-val" style="color:${fc}">${esc(p.faction || '不明')}</span></div>
          <div><span class="info-label">期数</span><span class="info-val">${p.terms || '?'}期</span></div>
          <div><span class="info-label">生年</span><span class="info-val">${esc(p.birthYear || '不明')}</span></div>
        </div>
        <div class="detail-committees">
          <div class="cm-title">所属委員会</div>
          ${committees}
        </div>
        ${m.description ? `<div class="member-desc"><p>${esc(m.description)}</p></div>` : ''}
      </div>
      <div class="detail-right">
        <h3>注力分野</h3>
        ${chart}
        <div class="cat-bars">${(() => {
          const cats = m.topics.topCategories || [];
          const maxPct = cats.length > 0 ? Math.max(...cats.map(t => t.percentage)) : 1;
          return cats.map(t => `<div class="cat-bar-row"><span class="cat-bar-label">${t.category}</span><div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${(t.percentage / maxPct * 100).toFixed(1)}%;background:${catColors[t.category] || '#999'}"></div></div><span class="cat-bar-pct">${t.percentage}%</span></div>`).join('');
        })()}</div>
        <div class="detail-stats-box">
          <div class="ds-item"><span class="ds-val">${m.videoCount}</span><span class="ds-lbl">動画</span></div>
          <div class="ds-item"><span class="ds-val">${m.questionCount}</span><span class="ds-lbl">質問</span></div>
          <div class="ds-item"><span class="ds-val">${p.terms || '?'}</span><span class="ds-lbl">期</span></div>
        </div>
      </div>
    </div>
    <h3 class="section-title">発言動画 (${m.videos.length}本)</h3>
    <div class="v-list">${videoItems}</div>
  </div>`;
}

// 会派別セクションHTML
function factionSectionHTML(factionName, members) {
  const fc = factionColors[factionName] || '#607D8B';
  const rep = councilData?.factions?.find(f => f.name.includes(factionName))?.representative;
  const repTag = rep ? `<span class="faction-rep">代表: ${esc(rep)}</span>` : '';
  return `<div class="faction-section">
    <div class="faction-header" style="border-left:5px solid ${fc}">
      <span class="faction-name" style="color:${fc}">${esc(factionName)}</span>
      <span class="faction-count">${members.length}名</span>
      ${repTag}
    </div>
    <div class="m-grid">${members.map(m => memberCardHTML(m)).join('')}</div>
  </div>`;
}

const currentGroups = groupByFaction(currentMembersList);
const currentSections = factionOrder
  .filter(f => currentGroups[f] && currentGroups[f].length > 0)
  .map(f => factionSectionHTML(f, currentGroups[f]))
  .join('');

const formerSection = formerMembersList.length > 0
  ? `<div class="former-section">
      <h3 class="section-title-former">元議員 (${formerMembersList.length}名)</h3>
      <div class="m-grid">${formerMembersList.map(m => memberCardHTML(m)).join('')}</div>
    </div>`
  : '';

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>みんなの伊東市</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#f0f4f8;--card:#fff;--text:#1a1a2e;--sub:#6b7280;--radius:16px;--accent:#667eea}
body{font-family:-apple-system,'Hiragino Sans','Meiryo',sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:2.5rem 1rem 2rem;text-align:center}
header h1{font-size:1.8rem;font-weight:800;letter-spacing:.08em}
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
.search-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(102,126,234,.15)}
.filter-sel{padding:.8rem 1rem;border:2px solid #e5e7eb;border-radius:12px;font-size:.9rem;background:#fff;outline:none}

.faction-section{margin-bottom:1.5rem}
.faction-header{padding:.6rem 1rem;background:#fff;border-radius:10px;margin-bottom:.8rem;display:flex;align-items:center;gap:.8rem;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.faction-name{font-size:1.1rem;font-weight:700}
.faction-count{font-size:.8rem;color:var(--sub);background:#f0f4f8;padding:.2rem .6rem;border-radius:8px}
.faction-rep{font-size:.75rem;color:var(--sub);margin-left:auto}

.m-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;margin-bottom:1rem}
.m-card{background:var(--card);border-radius:var(--radius);padding:1.2rem;text-align:center;cursor:pointer;transition:.3s;box-shadow:0 2px 8px rgba(0,0,0,.06);border:2px solid transparent;overflow:hidden}
.m-card:hover{transform:translateY(-4px);box-shadow:0 8px 25px rgba(0,0,0,.12)}
.m-avatar{width:72px;height:72px;border-radius:50%;margin:0 auto .6rem;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:#fff}
.m-avatar-photo{width:72px;height:72px;border-radius:50%;margin:0 auto .6rem;overflow:hidden;border:3px solid}
.m-avatar-photo img{width:100%;height:100%;object-fit:cover}
.m-avatar-fb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:#fff}
.m-name{font-size:1.1rem;font-weight:700;margin-bottom:.2rem}
.m-faction{font-size:.8rem;font-weight:600;margin-bottom:.3rem}
.m-committee{font-size:.72rem;color:var(--sub);margin-bottom:.3rem}
.role-tag{display:inline-block;padding:.15rem .5rem;border-radius:10px;font-size:.7rem;background:#fef3c7;color:#92400e;font-weight:600;margin-bottom:.3rem;margin-right:.2rem}
.m-stats-mini{display:flex;justify-content:center;gap:.8rem;font-size:.78rem;color:var(--sub);margin:.4rem 0}
.m-top-cats{display:flex;flex-wrap:wrap;justify-content:center;gap:.3rem;margin-top:.4rem}
.cat-pill{display:inline-block;padding:.12rem .5rem;border-radius:8px;font-size:.65rem;color:#fff;font-weight:500}

.current-badge{display:inline-block;padding:.15rem .7rem;border-radius:10px;font-size:.75rem;background:#dcfce7;color:#166534;font-weight:600;margin:.4rem 0}
.former-badge{display:inline-block;padding:.15rem .7rem;border-radius:10px;font-size:.75rem;background:#f3f4f6;color:#6b7280;font-weight:600;margin:.4rem 0}
.section-title-former{font-size:1rem;font-weight:600;color:var(--sub);margin:2rem 0 .8rem;padding:.5rem 1rem;background:#fff;border-radius:10px;border-left:4px solid #9ca3af}

.tab-panel{display:none}
.tab-panel.active{display:block}
.back-btn{padding:.5rem 1rem;border:none;border-radius:10px;background:#f0f4f8;font-size:.9rem;cursor:pointer;font-weight:600;margin-bottom:1rem}
.back-btn:hover{background:#e5e7eb}
.detail-panel{display:none}
.detail-top{display:flex;gap:2rem;flex-wrap:wrap;background:var(--card);border-radius:var(--radius);padding:2rem;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:1.5rem}
.detail-left{flex:1;min-width:280px}
.detail-left h2{font-size:1.6rem;margin-bottom:.2rem;text-align:center}
.detail-reading{color:var(--sub);font-size:.85rem;margin-bottom:.5rem;text-align:center}
.detail-roles{text-align:center;margin-bottom:.5rem}
.detail-avatar{width:100px;height:100px;border-radius:50%;margin:0 auto .8rem;display:flex;align-items:center;justify-content:center;font-size:2.5rem;font-weight:800;color:#fff}
.detail-avatar-photo{width:100px;height:100px;border-radius:50%;margin:0 auto .8rem;overflow:hidden;border:4px solid}
.detail-avatar-photo img{width:100%;height:100%;object-fit:cover}
.detail-info{max-width:320px;margin:0 auto}
.detail-info>div{display:flex;padding:.45rem 0;border-bottom:1px solid #f0f4f8}
.info-label{width:70px;font-size:.82rem;color:var(--sub);flex-shrink:0;font-weight:600}
.info-val{font-size:.87rem;font-weight:500}

/* 委員会セクション */
.detail-committees{margin-top:1rem;padding:1rem;background:#f8fafc;border-radius:12px}
.cm-title{font-size:.85rem;font-weight:700;color:var(--accent);margin-bottom:.5rem}
.cm-item{font-size:.82rem;padding:.35rem 0;border-bottom:1px solid #eee;display:flex;align-items:center;gap:.5rem}
.cm-item:last-child{border-bottom:none}
.cm-badge{display:inline-block;padding:.1rem .4rem;border-radius:6px;font-size:.68rem;font-weight:600;flex-shrink:0}
.cm-chair{background:#fef3c7;color:#92400e}
.cm-vice{background:#dbeafe;color:#1e40af}
.cm-member{background:#f3f4f6;color:#6b7280}

.detail-stats-box{display:flex;justify-content:center;gap:1.5rem;margin-top:1rem;padding:.8rem;background:#f8fafc;border-radius:12px}
.ds-item{text-align:center}
.ds-val{display:block;font-size:1.5rem;font-weight:800;color:var(--accent)}
.ds-lbl{font-size:.72rem;color:var(--sub)}

.member-desc{margin-top:1rem;padding:1rem;background:#f8f9ff;border-radius:12px;border-left:4px solid var(--accent)}
.member-desc p{font-size:.88rem;color:#444;line-height:1.7}

.detail-right{flex:1;min-width:300px;text-align:center}
.detail-right h3{margin-bottom:.8rem;font-size:1.1rem;color:var(--accent)}
.cat-bars{margin-top:1rem}
.cat-bar-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}
.cat-bar-label{width:90px;font-size:.78rem;text-align:right;flex-shrink:0;color:var(--sub);font-weight:500}
.cat-bar-bg{flex:1;height:18px;background:#f0f4f8;border-radius:9px;overflow:hidden}
.cat-bar-fill{height:100%;border-radius:9px;transition:.5s}
.cat-bar-pct{width:40px;font-size:.78rem;color:var(--sub);text-align:right;font-weight:600}
.section-title{font-size:1.15rem;font-weight:700;margin:1.5rem 0 .8rem;padding-left:.6rem;border-left:4px solid var(--accent)}
.v-list{display:flex;flex-direction:column;gap:.8rem}
.v-item{display:flex;background:var(--card);border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);transition:.2s}
.v-item:hover{box-shadow:0 4px 15px rgba(0,0,0,.1)}
.v-thumb{flex-shrink:0;width:180px;min-height:100px;position:relative;display:block;background:#eee}
.v-thumb img{width:100%;height:100px;object-fit:cover}
.v-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;background:rgba(0,0,0,.6);border-radius:50%;display:flex;align-items:center;justify-content:center}
.v-play::after{content:'';border-style:solid;border-width:7px 0 7px 12px;border-color:transparent transparent transparent #fff;margin-left:2px}
.v-info{padding:.6rem .8rem;flex:1;min-width:0}
.v-title{font-weight:600;font-size:.88rem;color:var(--text);text-decoration:none;display:block;margin-bottom:.3rem}
.v-title:hover{color:var(--accent)}
.v-meta{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin-bottom:.4rem}
.v-date{font-size:.78rem;color:var(--sub)}
.v-type{display:inline-block;padding:.1rem .5rem;border-radius:6px;font-size:.7rem;color:#fff;font-weight:500}

/* 質問箇条書き（常に表示） */
.q-list-always{list-style:none;padding:0;margin:0}
.q-list-always li{font-size:.82rem;color:#444;padding:.4rem .6rem;background:#f8f9ff;border-radius:8px;margin-bottom:.4rem;border-left:3px solid var(--accent);position:relative;padding-left:1.2rem}
.q-list-always li::before{content:'\\25CF';position:absolute;left:.4rem;top:.4rem;color:var(--accent);font-size:.5rem}
.q-bullet{margin-bottom:.2rem;line-height:1.5;word-break:break-all;overflow-wrap:break-word}
.resp-box{margin-top:.3rem;padding:.4rem .6rem;background:#fff8f0;border-radius:8px;border-left:3px solid #f39c12;font-size:.78rem;color:#666;cursor:pointer}
.resp-box .resp-full{display:none}
.resp-box.expanded .resp-full{display:block}
.resp-box.expanded .resp-toggle{display:none}
.resp-label{display:inline-block;padding:.1rem .4rem;border-radius:4px;background:#f39c12;color:#fff;font-size:.65rem;font-weight:600;margin-right:.3rem;margin-bottom:.2rem}
.resp-more{color:var(--accent);font-weight:600;font-size:.72rem}

/* 全動画の質問も箇条書き */
.qs-box{margin-top:.3rem}
.qs-toggle{cursor:pointer;font-size:.82rem;color:var(--accent);font-weight:600;user-select:none}
.qs-toggle:hover{text-decoration:underline}
.qs-list{display:none;list-style:none;padding:0;margin-top:.3rem}
.qs-list li{word-break:break-all;overflow-wrap:break-word}
.qs-box.open .qs-list{display:block}
.qs-list li{font-size:.8rem;color:#444;padding:.35rem .6rem;background:#f8f9ff;border-radius:6px;margin-bottom:.3rem;border-left:3px solid var(--accent);padding-left:1.2rem;position:relative}
.qs-list li::before{content:'\\25CF';position:absolute;left:.4rem;top:.35rem;color:var(--accent);font-size:.45rem}

.stats-panel{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.stats-box{background:var(--card);border-radius:var(--radius);padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.stats-box h3{font-size:1rem;margin-bottom:1rem;color:var(--accent)}
.bar-row{margin-bottom:.6rem}
.bar-label{display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:.2rem}
.bar-bg{height:20px;background:#f0f4f8;border-radius:10px;overflow:hidden}
.bar-fill{height:100%;border-radius:10px;transition:.5s}
footer{text-align:center;padding:2rem;color:var(--sub);font-size:.8rem}
.disclaimer{max-width:900px;margin:2rem auto 0;padding:1.5rem 2rem;background:#fff;border-radius:var(--radius);box-shadow:0 2px 8px rgba(0,0,0,.06);text-align:left}
.disclaimer h3{font-size:1rem;font-weight:700;color:var(--text);margin-bottom:.8rem;padding-bottom:.5rem;border-bottom:2px solid #e5e7eb}
.disclaimer h4{font-size:.85rem;font-weight:700;color:#444;margin:1rem 0 .3rem}
.disclaimer p,.disclaimer li{font-size:.8rem;color:#555;line-height:1.7}
.disclaimer ul{padding-left:1.2rem;margin:.3rem 0 .8rem}
.disclaimer li{margin-bottom:.2rem}
.disclaimer .disc-note{font-size:.75rem;color:var(--sub);margin-top:1rem;padding-top:.8rem;border-top:1px solid #e5e7eb}
#all-v-list .v-item{display:none}
#all-v-list .v-item.vis{display:flex}
/* 比較タブ */
.cmp-picker{display:flex;gap:.6rem;flex-wrap:wrap;margin:1rem 0;align-items:center}
.cmp-picker select{padding:.6rem .9rem;border:2px solid #e5e7eb;border-radius:10px;font-size:.88rem;background:#fff;min-width:160px}
.cmp-picker button{padding:.6rem 1rem;border:none;border-radius:10px;background:#f0f4f8;cursor:pointer;font-weight:600;font-size:.85rem}
.cmp-picker button:hover{background:#e5e7eb}
.cmp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;margin-top:1rem}
.cmp-card{background:var(--card);border-radius:var(--radius);padding:1.2rem;box-shadow:0 2px 8px rgba(0,0,0,.06);position:relative}
.cmp-card .cmp-close{position:absolute;top:.5rem;right:.5rem;background:#f3f4f6;border:none;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:1rem;color:#6b7280}
.cmp-card .cmp-close:hover{background:#e5e7eb}
.cmp-head{display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem}
.cmp-avatar{width:56px;height:56px;border-radius:50%;overflow:hidden;border:3px solid;flex-shrink:0}
.cmp-avatar img{width:100%;height:100%;object-fit:cover}
.cmp-avatar-fb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:800;color:#fff}
.cmp-name{font-size:1.05rem;font-weight:700}
.cmp-faction{font-size:.78rem;font-weight:600}
.cmp-stats{display:flex;gap:.6rem;justify-content:space-around;padding:.6rem;background:#f8fafc;border-radius:10px;margin-bottom:.8rem}
.cmp-stat{text-align:center}
.cmp-stat-val{display:block;font-size:1.3rem;font-weight:800;color:var(--accent)}
.cmp-stat-lbl{font-size:.68rem;color:var(--sub)}
.cmp-cats-title{font-size:.78rem;font-weight:700;color:var(--sub);margin:.6rem 0 .3rem}
.cmp-cat-row{display:flex;align-items:center;gap:.4rem;margin-bottom:.3rem}
.cmp-cat-label{width:82px;font-size:.7rem;text-align:right;color:var(--sub);flex-shrink:0}
.cmp-cat-bg{flex:1;height:14px;background:#f0f4f8;border-radius:7px;overflow:hidden}
.cmp-cat-fill{height:100%;border-radius:7px}
.cmp-cat-pct{width:34px;font-size:.68rem;text-align:right;font-weight:600}
.cmp-empty{text-align:center;padding:2rem;color:var(--sub);font-size:.9rem;background:#fff;border-radius:12px}

/* 検索タブ */
.search-result-count{font-size:.82rem;color:var(--sub);margin:.6rem 0}
.search-hit{background:var(--card);padding:.9rem 1rem;border-radius:12px;margin-bottom:.6rem;box-shadow:0 1px 4px rgba(0,0,0,.05);border-left:4px solid var(--accent)}
.search-hit-title{font-size:.88rem;font-weight:600;color:var(--text);text-decoration:none;display:block;margin-bottom:.3rem}
.search-hit-title:hover{color:var(--accent)}
.search-hit-meta{display:flex;gap:.5rem;font-size:.72rem;color:var(--sub);margin-bottom:.4rem;flex-wrap:wrap}
.search-hit-q{font-size:.78rem;color:#444;padding:.3rem .5rem .3rem 1rem;background:#f8f9ff;border-radius:6px;margin-bottom:.25rem;border-left:3px solid var(--accent);position:relative}
.search-hit-q::before{content:'\\25CF';position:absolute;left:.3rem;top:.35rem;color:var(--accent);font-size:.4rem}
.search-hl{background:#fef3c7;font-weight:600;padding:0 .1rem;border-radius:2px}

/* トレンドタブ */
.trend-chart{background:var(--card);border-radius:var(--radius);padding:1.2rem;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:1rem}
.trend-chart h3{font-size:1rem;margin-bottom:1rem;color:var(--accent)}
.trend-bar-row{display:flex;align-items:center;gap:.6rem;margin-bottom:.45rem}
.trend-year{width:48px;font-size:.8rem;font-weight:600;color:var(--sub);text-align:right;flex-shrink:0}
.trend-bar-bg{flex:1;height:22px;background:#f0f4f8;border-radius:11px;overflow:hidden;display:flex}
.trend-seg{height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.65rem;font-weight:600;min-width:0;overflow:hidden;white-space:nowrap}
.trend-total{width:60px;font-size:.78rem;text-align:right;font-weight:600;color:var(--text);flex-shrink:0}
.trend-legend{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:.6rem;padding-top:.6rem;border-top:1px solid #f0f4f8}
.trend-legend-item{display:flex;align-items:center;gap:.3rem;font-size:.72rem;color:var(--sub)}
.trend-legend-dot{width:10px;height:10px;border-radius:3px}
.trend-kw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.6rem}
.trend-kw-year{background:#f8fafc;padding:.6rem .8rem;border-radius:10px}
.trend-kw-year-lbl{font-size:.8rem;font-weight:700;color:var(--accent);margin-bottom:.3rem}
.trend-kw-item{font-size:.72rem;color:#444;padding:.15rem 0;display:flex;justify-content:space-between}
.trend-kw-item span:last-child{color:var(--sub);font-weight:600}
.load-btn{display:block;margin:1rem auto;padding:.7rem 2rem;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:.95rem;font-weight:600}
.load-btn:hover{opacity:.9}
/* タブレット */
@media(max-width:1024px){
  .container{padding:.8rem}
  .detail-top{gap:1.2rem;padding:1.2rem}
  .m-grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
}
/* スマートフォン */
@media(max-width:768px){
  header{padding:1.5rem .8rem 1.2rem}
  header h1{font-size:1.2rem;letter-spacing:.04em}
  .header-sub{font-size:.72rem}
  .stats-row{gap:.6rem;margin-top:.8rem}
  .stat-card{padding:.4rem .7rem;border-radius:8px}
  .stat-val{font-size:1.3rem}
  .stat-lbl{font-size:.65rem}
  nav{gap:.3rem;padding:.5rem .6rem}
  nav button{padding:.4rem .8rem;font-size:.8rem}
  .container{padding:.5rem}
  .search-row{gap:.5rem;margin:.6rem 0}
  .search-input{padding:.6rem .8rem;font-size:.88rem;min-width:120px}
  .filter-sel{padding:.6rem .7rem;font-size:.82rem}
  .m-grid{grid-template-columns:repeat(2,1fr);gap:.6rem}
  .m-card{padding:.8rem .5rem;border-radius:12px}
  .m-avatar,.m-avatar-photo{width:56px;height:56px;margin-bottom:.4rem}
  .m-avatar-photo img{width:100%;height:100%}
  .m-avatar-fb{font-size:1.4rem}
  .m-name{font-size:.92rem}
  .m-faction{font-size:.72rem}
  .m-committee{font-size:.65rem}
  .m-stats-mini{font-size:.68rem;gap:.5rem}
  .m-top-cats{gap:.2rem}
  .cat-pill{font-size:.6rem;padding:.1rem .35rem}
  .role-tag{font-size:.62rem;padding:.1rem .35rem}
  .faction-header{padding:.5rem .7rem}
  .faction-name{font-size:.95rem}
  .stats-panel{grid-template-columns:1fr}
  .detail-panel{margin:0 -.5rem}
  .detail-top{flex-direction:column;gap:1rem;padding:1rem;border-radius:12px}
  .detail-left{min-width:unset}
  .detail-left h2{font-size:1.3rem}
  .detail-avatar,.detail-avatar-photo{width:80px;height:80px}
  .detail-info>div{padding:.35rem 0}
  .info-label{width:60px;font-size:.75rem}
  .info-val{font-size:.8rem}
  .detail-right{min-width:unset}
  .detail-right h3{font-size:.95rem}
  .detail-stats-box{gap:.8rem;padding:.6rem}
  .ds-val{font-size:1.3rem}
  .cat-bar-label{width:70px;font-size:.7rem}
  .cat-bar-pct{width:35px;font-size:.7rem}
  .section-title{font-size:1rem;margin:1rem 0 .6rem}
  .v-list{gap:.6rem}
  .v-item{flex-direction:column}
  .v-thumb{width:100%;height:auto;aspect-ratio:16/9}
  .v-thumb img{width:100%;height:100%;object-fit:cover}
  .v-info{padding:.5rem .6rem}
  .v-title{font-size:.82rem}
  .v-meta{margin-bottom:.3rem}
  .v-date{font-size:.7rem}
  .v-type{font-size:.62rem;padding:.08rem .4rem}
  .q-list-always li{font-size:.75rem;padding:.3rem .5rem .3rem 1rem;margin-bottom:.3rem}
  .q-list-always li::before{left:.3rem;top:.35rem;font-size:.4rem}
  .q-bullet{font-size:.75rem;line-height:1.4}
  .resp-box{font-size:.72rem;padding:.3rem .5rem}
  .resp-label{font-size:.6rem;padding:.08rem .3rem}
  .qs-list li{font-size:.72rem;padding:.3rem .5rem .3rem 1rem}
  .qs-list li::before{left:.3rem;font-size:.4rem}
  .back-btn{font-size:.82rem;padding:.4rem .8rem}
  .load-btn{font-size:.85rem;padding:.6rem 1.5rem}
  .detail-committees{padding:.7rem}
  .cm-title{font-size:.78rem}
  .cm-item{font-size:.75rem}
  .cm-badge{font-size:.62rem}
  .member-desc p{font-size:.8rem}
  footer{padding:1.2rem;font-size:.72rem}
}
/* 小さいスマホ */
@media(max-width:400px){
  .m-grid{grid-template-columns:repeat(2,1fr);gap:.4rem}
  .m-card{padding:.6rem .3rem}
  .m-avatar,.m-avatar-photo{width:48px;height:48px}
  .m-name{font-size:.82rem}
  .m-stats-mini{font-size:.62rem}
  header h1{font-size:1rem}
  .stat-val{font-size:1.1rem}
}
</style>
</head>
<body>
<header>
  <h1>みんなの伊東市</h1>
  <div class="header-sub">第21期（令和7年〜）</div>
  <div class="stats-row">
    <div class="stat-card"><div class="stat-val">${videos.length}</div><div class="stat-lbl">動画数</div></div>
    <div class="stat-card"><div class="stat-val">${currentMembersList.length}</div><div class="stat-lbl">現職議員</div></div>
    <div class="stat-card"><div class="stat-val">${videos.reduce((s,v)=>s+v.questions.length,0)}</div><div class="stat-lbl">質問数</div></div>
    <div class="stat-card"><div class="stat-val">${typeCounts['一般質問']||0}</div><div class="stat-lbl">一般質問</div></div>
  </div>
</header>
<nav>
  <button class="active" onclick="switchTab('members',this)">議員一覧</button>
  <button onclick="switchTab('all',this)">全動画</button>
  <button onclick="switchTab('compare',this)">比較</button>
  <button onclick="switchTab('search',this)">検索</button>
  <button onclick="switchTab('trend',this)">トレンド</button>
  <button onclick="switchTab('stats',this)">統計</button>
</nav>
<div class="container">
  <div id="tab-members" class="tab-panel active">
    <div class="search-row">
      <input class="search-input" id="m-search" placeholder="議員名・会派で検索..." oninput="filterCards()">
      <select class="filter-sel" id="f-filter" onchange="filterCards()">
        <option value="">全会派</option>
        ${factionOrder.filter(f => currentGroups[f]).map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('')}
      </select>
    </div>
    <div id="faction-sections">
      ${currentSections}
      ${formerSection}
    </div>
    <div id="search-results" style="display:none">
      <div class="m-grid" id="m-grid-search"></div>
    </div>
    <div id="detail-area">${allMembers.map(m => memberDetailHTML(m)).join('')}</div>
  </div>
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
        const vSummaries = questionSummaries[v.videoId] || [];
        const qs = v.questions.length>0?`<div class="qs-box open"><ul class="qs-list" style="display:block">${v.questions.map((q,qi)=>{
          let s = vSummaries[qi] || '';
          if (!s || s === '質問内容') { s = q.replace(/[\n\r]/g,'').replace(/^[^ぁ-んァ-ヶ\u4e00-\u9fff]*/,'').replace(/.{2,6}(君|くん)の一般質問を許します/g,'').replace(/委?\d+番?\d*/g,'').trim(); }
          if (s.length > 55) s = s.substring(0,52) + '…';
          return `<li>${esc(s)}</li>`;
        }).join('')}</ul></div>`:'';
        return `<div class="v-item" data-type="${v.sessionType}" data-sp="${v.speakers.join(',')}">
          <a href="${v.url}" target="_blank" class="v-thumb"><img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" loading="lazy"><div class="v-play"></div></a>
          <div class="v-info"><a href="${v.url}" target="_blank" class="v-title">${esc(v.title||v.videoId)}</a>
          <div class="v-meta">${v.date?`<span class="v-date">${v.date}</span>`:''}<span class="v-type" style="background:${tc}">${v.sessionType}</span>${sp}</div>${qs}</div>
        </div>`;
      }).join('')}
    </div>
    <button class="load-btn" id="load-btn" onclick="loadMore()">もっと表示</button>
  </div>
  <div id="tab-compare" class="tab-panel">
    <div class="cmp-picker">
      <select id="cmp-select">
        <option value="">議員を選択...</option>
        ${compareData.map(m => `<option value="${esc(m.name)}">${esc(m.name)}${m.faction?` (${esc(m.faction)})`:''}</option>`).join('')}
      </select>
      <button onclick="addCompare()">追加</button>
      <button onclick="clearCompare()">クリア</button>
    </div>
    <div class="search-result-count">最大4名まで比較できます。質問数・動画数・分野別割合を並べて表示します。</div>
    <div id="cmp-area" class="cmp-grid"><div class="cmp-empty">上のプルダウンから議員を選んで「追加」してください</div></div>
  </div>
  <div id="tab-search" class="tab-panel">
    <div class="search-row">
      <input class="search-input" id="kw-input" placeholder="キーワードで全質問を検索（例: 観光、防災、給食、SDGs...）" oninput="runSearch()">
      <select class="filter-sel" id="kw-type" onchange="runSearch()">
        <option value="">全種別</option>
        <option value="一般質問">一般質問</option>
        <option value="大綱質疑">大綱質疑</option>
        <option value="補正予算審議">補正予算審議</option>
        <option value="委員会">委員会</option>
      </select>
    </div>
    <div class="search-result-count" id="kw-count">キーワードを入力してください</div>
    <div id="kw-results"></div>
  </div>
  <div id="tab-trend" class="tab-panel">
    <div class="trend-chart">
      <h3>年別 動画数（種別内訳）</h3>
      ${(() => {
        const allTypes = ['一般質問','大綱質疑','補正予算審議','委員会'];
        const typeCol = {'一般質問':'#667eea','大綱質疑':'#27ae60','補正予算審議':'#e67e22','委員会':'#95a5a6'};
        const maxV = Math.max(...sortedYears.map(y => yearStats[y].videos), 1);
        const rows = sortedYears.map(y => {
          const ys = yearStats[y];
          const segs = allTypes.map(t => {
            const c = ys.types[t] || 0;
            if (c === 0) return '';
            const w = (c / maxV * 100).toFixed(1);
            return `<div class="trend-seg" style="width:${w}%;background:${typeCol[t]}" title="${t}: ${c}本">${c>=3?c:''}</div>`;
          }).join('');
          return `<div class="trend-bar-row"><div class="trend-year">${y}</div><div class="trend-bar-bg">${segs}</div><div class="trend-total">${ys.videos}本</div></div>`;
        }).join('');
        const legend = allTypes.map(t => `<div class="trend-legend-item"><div class="trend-legend-dot" style="background:${typeCol[t]}"></div>${t}</div>`).join('');
        return rows + `<div class="trend-legend">${legend}</div>`;
      })()}
    </div>
    <div class="trend-chart">
      <h3>年別 質問数（一般質問ベース）</h3>
      ${(() => {
        const maxQ = Math.max(...sortedYears.map(y => yearStats[y].questions), 1);
        return sortedYears.map(y => {
          const q = yearStats[y].questions;
          const w = (q / maxQ * 100).toFixed(1);
          return `<div class="trend-bar-row"><div class="trend-year">${y}</div><div class="trend-bar-bg"><div class="trend-seg" style="width:${w}%;background:#764ba2">${q>=5?q:''}</div></div><div class="trend-total">${q}問</div></div>`;
        }).join('');
      })()}
    </div>
    <div class="trend-chart">
      <h3>年別 注目キーワード TOP 5</h3>
      <div class="trend-kw-grid">
        ${sortedYears.slice().reverse().map(y => {
          const kws = yearKeywords[y] || {};
          const top = Object.entries(kws).sort((a,b) => b[1] - a[1]).slice(0, 5);
          if (top.length === 0) return '';
          return `<div class="trend-kw-year"><div class="trend-kw-year-lbl">${y}年</div>${top.map(([k,c]) => `<div class="trend-kw-item"><span>${esc(k)}</span><span>${c}</span></div>`).join('')}</div>`;
        }).join('')}
      </div>
    </div>
  </div>
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
        ${allMembers.filter(m=>m.isCurrent).sort((a,b)=>b.questionCount-a.questionCount).slice(0,15).map((m,i)=>{
          const max=allMembers.filter(x=>x.isCurrent).reduce((a,b)=>Math.max(a,b.questionCount),1);
          const p=(m.questionCount/max*100).toFixed(1);
          const fc=factionColors[m.profile.faction]||'#607D8B';
          return `<div class="bar-row"><div class="bar-label"><span>${i+1}. ${m.name}</span><span>${m.questionCount}問</span></div><div class="bar-bg"><div class="bar-fill" style="width:${p}%;background:${fc}"></div></div></div>`;
        }).join('')}
      </div>
      <div class="stats-box">
        <h3>会派別議員数</h3>
        ${factionOrder.filter(f => currentGroups[f]).map(f => {
          const c = currentGroups[f].length;
          const cl = factionColors[f] || '#607D8B';
          return `<div class="bar-row"><div class="bar-label"><span style="color:${cl};font-weight:600">${f}</span><span>${c}名</span></div><div class="bar-bg"><div class="bar-fill" style="width:${c/currentMembersList.length*100}%;background:${cl}"></div></div></div>`;
        }).join('')}
      </div>
      <div class="stats-box">
        <h3>動画数ランキング</h3>
        ${allMembers.filter(m=>m.isCurrent).sort((a,b)=>b.videoCount-a.videoCount).slice(0,15).map((m,i)=>{
          const max=allMembers.filter(x=>x.isCurrent).reduce((a,b)=>Math.max(a,b.videoCount),1);
          const p=(m.videoCount/max*100).toFixed(1);
          const fc=factionColors[m.profile.faction]||'#607D8B';
          return `<div class="bar-row"><div class="bar-label"><span>${i+1}. ${m.name}</span><span>${m.videoCount}本</span></div><div class="bar-bg"><div class="bar-fill" style="width:${p}%;background:${fc}"></div></div></div>`;
        }).join('')}
      </div>
      <div class="stats-box" style="grid-column:1/-1">
        <h3>伊東市議会 分野別質問割合</h3>
        ${(() => {
          const fieldCounts = {};
          for (const m of allMembers) {
            const pcts = m.topics.percentage || {};
            const qc = m.questionCount || 0;
            for (const [field, pct] of Object.entries(pcts)) {
              fieldCounts[field] = (fieldCounts[field] || 0) + Math.round(qc * pct / 100);
            }
          }
          const sorted = Object.entries(fieldCounts).sort((a,b) => b[1] - a[1]);
          const total = sorted.reduce((s, e) => s + e[1], 0);
          const fieldColors = {
            '教育・子育て': '#667eea', '行財政・議会': '#764ba2', '観光・経済': '#e67e22',
            '医療・福祉': '#e74c3c', '防災・安全': '#f39c12', '都市整備・交通': '#27ae60',
            '環境・衛生': '#2ecc71', '農林水産': '#16a085'
          };
          return sorted.map(([field, count], i) => {
            const pct = total > 0 ? (count / total * 100).toFixed(1) : '0';
            const maxPct = total > 0 ? (sorted[0][1] / total * 100) : 1;
            const barW = (parseFloat(pct) / maxPct * 100).toFixed(1);
            const cl = fieldColors[field] || '#95a5a6';
            return `<div class="bar-row"><div class="bar-label"><span style="font-weight:600">${i+1}. ${field}</span><span>${count}件 (${pct}%)</span></div><div class="bar-bg"><div class="bar-fill" style="width:${barW}%;background:${cl}"></div></div></div>`;
          }).join('');
        })()}
      </div>
    </div>
  </div>
</div>
<div class="disclaimer">
  <h3>免責事項</h3>

  <h4>1. 本サイトの目的と性質</h4>
  <p>本サイトは、伊東市議会の活動に関する公開情報を市民がわかりやすく閲覧できるよう、公益目的で作成された非公式の情報サイトです。伊東市、伊東市議会、またはいかなる政党・政治団体とも関係はなく、特定の政治的立場を支持・推薦・批判するものではありません。</p>

  <h4>2. 情報の正確性について</h4>
  <ul>
    <li>本サイトに掲載されている質問要約は、YouTubeの自動生成字幕（音声認識）をもとに機械的に抽出・要約したものであり、<strong>正確性を保証するものではありません</strong>。音声認識の誤変換、文脈の欠落、要約時の情報損失等が含まれる可能性があります。</li>
    <li>質問の分野分類（教育・子育て、観光・経済等）は、キーワードに基づく自動分類であり、質問の趣旨を正確に反映していない場合があります。</li>
    <li>議員の質問数・動画出演数等の数値データは、YouTube動画の字幕解析に基づく推計値であり、公式記録とは異なる場合があります。</li>
    <li>正確な議会記録については、<a href="https://www.city.ito.shizuoka.jp/gyosei/shiseijoho/itoshigikai/index.html" target="_blank">伊東市議会公式ページ</a>および会議録をご参照ください。</li>
  </ul>

  <h4>3. データの出典と利用</h4>
  <ul>
    <li><strong>動画・字幕:</strong> <a href="https://www.youtube.com/channel/UC9FGDfo93b_dpu_7-AnN4wQ" target="_blank">伊東市議会インターネット中継放送（YouTube公式チャンネル）</a>の公開動画および自動生成字幕を利用しています。</li>
    <li><strong>議員情報:</strong> 伊東市公式ウェブサイトで公開されている議員名簿、委員会名簿、会派名簿等の公開資料に基づいています。</li>
    <li><strong>写真:</strong> 選挙ドットコム等の公開されている政治家プロフィールページの情報を参照しています。各写真の著作権は撮影者または掲載元に帰属します。</li>
  </ul>

  <h4>4. 公平性・中立性について</h4>
  <ul>
    <li>本サイトは客観的なデータの可視化を目的としており、特定の議員の活動を評価・批判・推薦する意図はありません。</li>
    <li>質問数や動画出演数の多寡は、議員活動の質や成果を直接示すものではありません。議会活動には、委員会審議、住民相談、政策調査など、本サイトでは計測できない多くの側面があります。</li>
    <li>データの取得・処理は全議員に対して同一の方法で行っており、意図的な偏りはありません。</li>
  </ul>

  <h4>5. 肖像権・プライバシーについて</h4>
  <ul>
    <li>掲載している議員の写真は、政治家としての公的活動に関連して公開されているものを利用しています。政治家は公人として、公務に関する情報公開が社会的に求められる立場にあります。</li>
    <li>プライベートな情報（住所、電話番号、家族構成等）は一切掲載していません。</li>
    <li>掲載情報に関してご本人から削除・修正の申し出があった場合は、速やかに対応いたします。</li>
  </ul>

  <h4>6. 著作権について</h4>
  <ul>
    <li>議会の質疑内容は公的な記録であり、著作権法第13条により著作権の対象外となる場合がありますが、動画・字幕データの利用についてはYouTubeの利用規約に従います。</li>
    <li>本サイトでは字幕テキストをそのまま掲載するのではなく、質問テーマの短い要約として再構成しています。</li>
    <li>本サイト上の分析結果・グラフ等の二次利用にあたっては、出典を明記してください。</li>
  </ul>

  <h4>7. 外部リンクについて</h4>
  <p>本サイトから外部サイト（YouTube、伊東市HP等）へのリンクを設けていますが、リンク先の内容について本サイトは責任を負いません。</p>

  <h4>8. 免責</h4>
  <p>本サイトの利用によって生じたいかなる損害についても、サイト運営者は一切の責任を負いません。掲載情報に基づく判断・行動は、利用者ご自身の責任において行ってください。</p>

  <h4>9. お問い合わせ・情報の修正・削除について</h4>
  <p>掲載内容に誤りを発見された場合、掲載情報の修正・削除のご希望、またはご意見・ご感想等がございましたら、下記までご連絡ください。確認の上、速やかに対応いたします。</p>
  <ul>
    <li><strong>メール:</strong> <a href="mailto:ka@oh-life.co.jp" style="color:var(--accent)">ka@oh-life.co.jp</a></li>
    <li><strong>お問い合わせフォーム:</strong> <span style="color:var(--sub)">準備中</span></li>
    <li><strong>運営:</strong> 大竹圭（伊東市議会議員）</li>
  </ul>

  <div class="disc-note">本免責事項は予告なく変更される場合があります。最終更新: ${new Date().toLocaleDateString('ja-JP')}</div>
</div>
<footer>
  <div>データ出典: <a href="https://www.youtube.com/channel/UC9FGDfo93b_dpu_7-AnN4wQ" target="_blank" style="color:var(--accent)">伊東市議会インターネット中継放送</a> | <a href="https://www.city.ito.shizuoka.jp/gyosei/shiseijoho/itoshigikai/index.html" target="_blank" style="color:var(--accent)">伊東市議会HP</a></div>
  <div style="margin-top:.3rem">最終更新: ${new Date().toLocaleDateString('ja-JP')}</div>
</footer>
<script>
const COMPARE_DATA = ${JSON.stringify(compareData)};
const SEARCH_INDEX = ${JSON.stringify(searchIndex)};
const CAT_COLORS = ${JSON.stringify(catColors)};
let vCount=30;
function switchTab(id,btn){
  document.querySelectorAll('.tab-panel').forEach(e=>e.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(e=>e.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  if(id==='all'){vCount=30;showVids();}
}

// ============ 比較タブ ============
let compareList=[];
function addCompare(){
  const sel=document.getElementById('cmp-select');
  const name=sel.value;
  if(!name||compareList.includes(name))return;
  if(compareList.length>=4){alert('最大4名まで比較できます');return;}
  compareList.push(name);
  sel.value='';
  renderCompare();
}
function removeCompare(name){
  compareList=compareList.filter(n=>n!==name);
  renderCompare();
}
function clearCompare(){compareList=[];renderCompare();}
function renderCompare(){
  const area=document.getElementById('cmp-area');
  if(compareList.length===0){
    area.innerHTML='<div class="cmp-empty">上のプルダウンから議員を選んで「追加」してください</div>';
    area.className='cmp-grid';
    return;
  }
  area.className='cmp-grid';
  const html=compareList.map(name=>{
    const m=COMPARE_DATA.find(x=>x.name===name);
    if(!m)return '';
    const initial=m.name.charAt(0);
    const av=m.photo
      ?'<div class="cmp-avatar" style="border-color:'+m.factionColor+'"><img src="'+m.photo+'" onerror="this.parentElement.innerHTML=\\'<div class=cmp-avatar-fb style=background:'+m.factionColor+'>'+initial+'</div>\\'"></div>'
      :'<div class="cmp-avatar" style="border-color:'+m.factionColor+'"><div class="cmp-avatar-fb" style="background:'+m.factionColor+'">'+initial+'</div></div>';
    const cats=Object.entries(m.percentage||{}).sort((a,b)=>b[1]-a[1]).map(([c,p])=>{
      const col=CAT_COLORS[c]||'#999';
      return '<div class="cmp-cat-row"><div class="cmp-cat-label">'+c+'</div><div class="cmp-cat-bg"><div class="cmp-cat-fill" style="width:'+p+'%;background:'+col+'"></div></div><div class="cmp-cat-pct">'+p+'%</div></div>';
    }).join('');
    return '<div class="cmp-card"><button class="cmp-close" onclick="removeCompare(\\''+name+'\\')">×</button>'
      +'<div class="cmp-head">'+av+'<div><div class="cmp-name">'+m.name+'</div><div class="cmp-faction" style="color:'+m.factionColor+'">'+m.faction+'</div></div></div>'
      +'<div class="cmp-stats"><div class="cmp-stat"><span class="cmp-stat-val">'+m.questionCount+'</span><span class="cmp-stat-lbl">質問数</span></div>'
      +'<div class="cmp-stat"><span class="cmp-stat-val">'+m.videoCount+'</span><span class="cmp-stat-lbl">動画数</span></div></div>'
      +'<div class="cmp-cats-title">分野別割合</div>'+cats+'</div>';
  }).join('');
  area.innerHTML=html;
}

// ============ 検索タブ ============
function escHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function highlight(text,q){
  if(!q)return escHtml(text);
  const esc=escHtml(text);
  const parts=q.split(/\\s+/).filter(Boolean).map(p=>p.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&'));
  if(parts.length===0)return esc;
  const re=new RegExp('('+parts.join('|')+')','gi');
  return esc.replace(re,'<span class="search-hl">$1</span>');
}
let searchTimer=null;
function runSearch(){
  clearTimeout(searchTimer);
  searchTimer=setTimeout(doSearch,150);
}
function doSearch(){
  const q=document.getElementById('kw-input').value.trim();
  const tf=document.getElementById('kw-type').value;
  const countEl=document.getElementById('kw-count');
  const resEl=document.getElementById('kw-results');
  if(!q){countEl.textContent='キーワードを入力してください';resEl.innerHTML='';return;}
  const qLower=q.toLowerCase();
  const terms=qLower.split(/\\s+/).filter(Boolean);
  const hits=[];
  for(const v of SEARCH_INDEX){
    if(tf && v.y!==tf)continue;
    const haystack=(v.t+' '+(v.s||[]).join(' ')+' '+(v.q||[]).join(' ')).toLowerCase();
    if(!terms.every(t=>haystack.includes(t)))continue;
    const matchQ=(v.q||[]).filter(x=>x&&terms.every(t=>x.toLowerCase().includes(t)));
    hits.push({v,matchQ});
    if(hits.length>=200)break;
  }
  countEl.textContent=hits.length+'件ヒット'+(hits.length>=200?'（上位200件のみ表示）':'');
  resEl.innerHTML=hits.map(h=>{
    const v=h.v;
    const mq=h.matchQ.length>0?h.matchQ:(v.q||[]).slice(0,3);
    const qs=mq.slice(0,5).map(x=>'<div class="search-hit-q">'+highlight(x,q)+'</div>').join('');
    const sp=(v.s||[]).map(x=>'<span>'+escHtml(x)+'</span>').join(' / ');
    return '<div class="search-hit"><a href="'+v.u+'" target="_blank" class="search-hit-title">'+highlight(v.t,q)+'</a>'
      +'<div class="search-hit-meta">'+(v.d?'<span>'+v.d+'</span>':'')+'<span>'+escHtml(v.y||'')+'</span>'+(sp?'<span>'+sp+'</span>':'')+'</div>'+qs+'</div>';
  }).join('');
}
function filterCards(){
  const q=document.getElementById('m-search').value.toLowerCase();
  const f=document.getElementById('f-filter').value;
  const fSections=document.getElementById('faction-sections');
  const sResults=document.getElementById('search-results');
  if(!q && !f){fSections.style.display='';sResults.style.display='none';return;}
  fSections.style.display='none';sResults.style.display='';
  const grid=document.getElementById('m-grid-search');
  grid.innerHTML='';
  document.querySelectorAll('.faction-section .m-card, .former-section .m-card').forEach(el=>{
    const n=el.dataset.name.toLowerCase();
    const fc=el.dataset.faction;
    if((n.includes(q)||!q)&&(fc===f||!f)){grid.appendChild(el.cloneNode(true));}
  });
  grid.querySelectorAll('.m-card').forEach(el=>{el.onclick=()=>showDetail(el.dataset.name);});
}
function showDetail(name){
  document.getElementById('faction-sections').style.display='none';
  document.getElementById('search-results').style.display='none';
  document.querySelector('#tab-members .search-row').style.display='none';
  document.querySelectorAll('.detail-panel').forEach(e=>e.style.display='none');
  const dp=document.getElementById('dp-'+name);
  if(dp)dp.style.display='block';
  window.scrollTo(0,0);
}
function hideDetail(){
  document.querySelectorAll('.detail-panel').forEach(e=>e.style.display='none');
  document.getElementById('faction-sections').style.display='';
  document.querySelector('#tab-members .search-row').style.display='';
  filterCards();
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
console.log('HTML生成完了: ' + (html.length/1024).toFixed(0) + 'KB');
