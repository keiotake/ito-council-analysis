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
// 第五次伊東市総合計画（構造化データ）
let sougouPlan = null;
try { sougouPlan = JSON.parse(fs.readFileSync('data/sougoukeikaku_v5.json', 'utf-8')); } catch(e) { console.warn('sougoukeikaku_v5.json not found'); }
let memberPolicyMap = null;
try { memberPolicyMap = JSON.parse(fs.readFileSync('data/member_policy_map.json', 'utf-8')); } catch(e) { console.warn('member_policy_map.json not found'); }

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

// 用語ツールチップ用ビルドヘルパー
const glossaryDefs = {
  '一般質問':'議員が市長に対し、市政全般について質問すること。定例会ごとに行われます。',
  '大綱質疑':'予算案の大枠について、会派の代表者が質問すること。個人ではなく会派単位で行います。',
  '補正予算':'年度途中で当初予算を変更すること。緊急の事業や国の補助金対応などで必要になります。',
  '委員会':'議案を専門的に審査するための少人数の会議。総務、観光建設、福祉文教などがあります。',
  '会派':'政策や考えが近い議員のグループ。国政政党とは異なる場合があります。',
  '総合計画':'市の将来像と、それを実現するための基本方針をまとめた長期計画（10年間）。',
  '定例会':'年4回（3月・6月・9月・12月）定期的に開かれる議会のこと。',
};
function glossary(term) {
  const def = glossaryDefs[term];
  if (!def) return esc(term);
  return `<span class="glossary-term" data-term="${esc(term)}">${esc(term)}<span class="glossary-tip">${esc(def)}</span></span>`;
}

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
    <polygon points="${dataPts.join(' ')}" fill="rgba(37,99,235,0.25)" stroke="#2563eb" stroke-width="2"/>
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

      // 質問位置の推定タイムスタンプ（1議員あたり約15分、最初の5分は開会）
      const speakerIndex = (v.speakers||[]).indexOf(m.name);
      const estimatedSec = speakerIndex >= 0 ? 300 + speakerIndex * 900 : 0;
      const jumpLink = estimatedSec > 0 ? `<a href="${v.url}&t=${estimatedSec}" target="_blank" class="v-jump" title="推定位置から再生（目安）">▶ この質問から再生</a>` : '';
      return `<div class="v-item">
        <a href="${v.url}" target="_blank" class="v-thumb"><img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" loading="lazy"><div class="v-play"></div></a>
        <div class="v-info"><a href="${v.url}" target="_blank" class="v-title">${esc(v.title || v.videoId)}</a>
        <div class="v-meta">${v.date ? `<span class="v-date">${v.date}</span>` : ''}<span class="v-type" style="background:${tc}">${v.sessionType}</span>${jumpLink}</div>${qsContent}</div>
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
          <div><span class="info-label">${glossary('会派')}</span><span class="info-val" style="color:${fc}">${esc(p.faction || '不明')}</span></div>
          <div><span class="info-label">期数</span><span class="info-val">${p.terms || '?'}期</span></div>
          <div><span class="info-label">生年</span><span class="info-val">${esc(p.birthYear || '不明')}</span></div>
        </div>
        <div class="detail-committees">
          <div class="cm-title">所属${glossary('委員会')}</div>
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
    ${(() => {
      // 活動サマリーカード生成
      const topCats = (m.topics.topCategories || []).slice(0, 3);
      const recentYear = m.videos.length > 0 ? m.videos[0].date?.substring(0, 4) : null;
      const recentVids = m.videos.filter(v => v.date?.startsWith(recentYear || ''));
      const recentQCount = recentVids.reduce((s,v) => s + (v.questions||[]).length, 0);
      const themeList = topCats.map(t => t.category).join('・') || '多分野';
      if (!m.isCurrent || m.videoCount === 0) return '';
      return `<div class="activity-summary">
        <h4>📊 直近の活動まとめ</h4>
        <p>${esc(m.name)}議員は${esc(p.faction||'無所属')}所属、${p.terms||'?'}期目。議会動画は計<strong>${m.videoCount}本</strong>、質問数は<strong>${m.questionCount}件</strong>。${recentYear ? `${recentYear}年は${recentVids.length}本の動画で${recentQCount}件の質問を行いました。` : ''}主な注力分野は<strong>${esc(themeList)}</strong>です。</p>
        <div class="activity-highlights">
          ${topCats.map(t => `<span class="activity-tag" style="background:${catColors[t.category]||'#dbeafe'}22;color:${catColors[t.category]||'#1d4ed8'};border:1px solid ${catColors[t.category]||'#1d4ed8'}44">${esc(t.category)} ${t.percentage}%</span>`).join('')}
        </div>
      </div>`;
    })()}
    ${(() => {
      // === 質問一覧タイムライン ===
      const allQuestions = [];
      const sortedVids = [...m.videos].sort((a,b) => (b.date||'').localeCompare(a.date||''));
      for (const v of sortedVids) {
        if (!v.questions || v.questions.length === 0) continue;
        const tc = v.sessionType === '一般質問' ? '#3498db' : v.sessionType === '大綱質疑' ? '#27ae60' : v.sessionType === '補正予算審議' ? '#e67e22' : '#95a5a6';
        const sums = questionSummaries[v.videoId] || [];
        const resps = responseMap[v.videoId] || [];
        v.questions.forEach((q, qi) => {
          let summary = sums[qi] || '';
          if (!summary || summary === '質問内容') {
            const cleaned = q.replace(/[\n\r]/g, '').replace(/^[^ぁ-んァ-ヶ\u4e00-\u9fff]*/,'')
              .replace(/.{2,6}(君|くん)の一般質問を許します/g,'')
              .replace(/委?\d+番?\d*/g,'').trim();
            summary = cleaned.length > 80 ? cleaned.substring(0, 77) + '…' : cleaned;
          }
          if (summary.length > 80) summary = summary.substring(0, 77) + '…';
          const resp = resps[qi];
          const respText = resp && resp.response ? resp.response : '';
          allQuestions.push({
            date: v.date || '',
            type: v.sessionType,
            typeColor: tc,
            summary: summary,
            response: respText,
            url: v.url,
            videoId: v.videoId,
          });
        });
      }
      if (allQuestions.length === 0) return '';

      const qRows = allQuestions.map((q, i) => {
        const respShort = q.response ? (q.response.length > 150 ? q.response.substring(0, 147) + '…' : q.response) : '';
        const respHTML = q.response
          ? `<div class="qtl-resp">
              <div class="qtl-resp-label">当局回答</div>
              <div class="qtl-resp-short" id="qtl-rs-${esc(m.name)}-${i}">${esc(respShort)}</div>
              ${q.response.length > 150 ? `<div class="qtl-resp-full" id="qtl-rf-${esc(m.name)}-${i}" style="display:none">${esc(q.response)}</div><button class="qtl-resp-toggle" onclick="toggleQtlResp('${esc(m.name)}',${i})">全文を表示</button>` : ''}
            </div>`
          : '<div class="qtl-no-resp">回答データなし</div>';

        return `<div class="qtl-card">
          <div class="qtl-header">
            <span class="qtl-date">${esc(q.date)}</span>
            <span class="qtl-type" style="background:${q.typeColor}">${esc(q.type)}</span>
            <a href="${q.url}" target="_blank" class="qtl-video-link" title="動画を見る">▶ 動画</a>
          </div>
          <div class="qtl-question">${esc(q.summary)}</div>
          ${respHTML}
        </div>`;
      }).join('');

      return `<div class="qtl-section">
        <h3 class="section-title">📋 質問一覧 (${allQuestions.length}件)</h3>
        <div class="qtl-controls">
          <input class="qtl-search" placeholder="質問をキーワードで絞り込み..." oninput="filterQtl(this,'${esc(m.name)}')">
          <select class="qtl-filter" onchange="filterQtlType(this,'${esc(m.name)}')">
            <option value="">全種別</option>
            <option value="一般質問">一般質問</option>
            <option value="大綱質疑">大綱質疑</option>
            <option value="補正予算審議">補正予算審議</option>
          </select>
        </div>
        <div class="qtl-list" id="qtl-${esc(m.name)}">${qRows}</div>
        <div class="qtl-count" id="qtl-count-${esc(m.name)}">全${allQuestions.length}件を表示中</div>
      </div>`;
    })()}
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
<meta name="description" content="伊東市議会の活動を市民にわかりやすく。議員プロフィール・議会動画・質問要約・市民の声を掲載。">
<title>みんなの伊東市 — 伊東市議会の活動をわかりやすく</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#f8fafc;--card:#fff;--text:#1e293b;--sub:#64748b;--radius:14px;--accent:#2563eb;--font-scale:1}
/* スキップリンク */
.skip-link{position:absolute;top:-100px;left:0;padding:.5rem 1rem;background:var(--accent);color:#fff;z-index:9999;font-weight:700;border-radius:0 0 8px 0}
.skip-link:focus{top:0}
/* フォーカス表示 */
:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:4px}
/* フォントサイズ調整 */
body.font-large{--font-scale:1.15}
body.font-large *{font-size-adjust:inherit}
body.font-large .m-name,body.font-large .voice-title,body.font-large .v-title{font-size:calc(1.05rem * 1.15)}
body.font-large p,body.font-large .voice-body,body.font-large .q-bullet,body.font-large .activity-summary p{font-size:calc(.85rem * 1.15);line-height:1.8}
body.font-large .header-sub,body.font-large nav button{font-size:calc(.88rem * 1.15)}
/* アクセシビリティバー */
.a11y-bar{display:flex;justify-content:flex-end;align-items:center;gap:.3rem;padding:.2rem .6rem;background:rgba(255,255,255,.1)}
.a11y-btn{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:6px;padding:.15rem .5rem;font-size:.72rem;cursor:pointer;font-weight:600}
.a11y-btn:hover{background:rgba(255,255,255,.35)}
body{font-family:-apple-system,'Hiragino Sans','Meiryo',sans-serif;background:var(--bg);color:var(--text);line-height:1.7;-webkit-text-size-adjust:100%}
header{background:linear-gradient(135deg,#1e40af 0%,#2563eb 100%);color:#fff;padding:1.4rem 1rem 1.1rem;text-align:center}
header h1{font-size:1.5rem;font-weight:700;letter-spacing:.06em}
.header-sub{opacity:.92;font-size:.88rem;margin-top:.2rem;font-weight:400}
.header-stats{display:flex;justify-content:center;gap:.4rem;margin-top:.5rem;flex-wrap:wrap;font-size:.78rem;opacity:.9}
.header-stats span{background:rgba(255,255,255,.18);padding:.25rem .7rem;border-radius:20px}
.header-visitors{display:flex;justify-content:center;gap:.3rem;margin-top:.35rem;font-size:.72rem;opacity:.85}
.header-visitors span{font-weight:700}
.header-credit{opacity:.75;font-size:.72rem;margin-top:.3rem}
nav{display:flex;justify-content:flex-start;gap:.3rem;padding:.6rem 1rem;background:#fff;position:sticky;top:0;z-index:100;box-shadow:0 1px 4px rgba(0,0,0,.06);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
nav::-webkit-scrollbar{display:none}
nav button{padding:.5rem 1rem;border:none;border-radius:8px;font-size:.85rem;font-weight:600;cursor:pointer;transition:.2s;background:transparent;color:var(--sub);white-space:nowrap;flex-shrink:0;position:relative}
nav button:hover{background:#f0f4f8;color:var(--text)}
nav button.active{color:var(--accent);background:#eff6ff}
nav button.active::after{content:'';position:absolute;bottom:0;left:20%;right:20%;height:3px;background:var(--accent);border-radius:3px}
.container{max-width:1200px;margin:0 auto;padding:1rem 1.2rem}
.search-row{display:flex;gap:.8rem;margin:1rem 0;flex-wrap:wrap}
.search-input{flex:1;min-width:200px;padding:.8rem 1.2rem;border:2px solid #e5e7eb;border-radius:12px;font-size:1rem;outline:none;transition:.2s}
.search-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(102,126,234,.15)}
.filter-sel{padding:.8rem 1rem;border:2px solid #e5e7eb;border-radius:12px;font-size:.9rem;background:#fff;outline:none}

.faction-section{margin-bottom:1.5rem}
.faction-header{padding:.6rem 1rem;background:#fff;border-radius:10px;margin-bottom:.8rem;display:flex;align-items:center;gap:.8rem;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.faction-name{font-size:1.1rem;font-weight:700}
.faction-count{font-size:.8rem;color:var(--sub);background:#f0f4f8;padding:.2rem .6rem;border-radius:8px}
.faction-rep{font-size:.75rem;color:var(--sub);margin-left:auto}

.m-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem;margin-bottom:1rem}
.m-card{background:var(--card);border-radius:var(--radius);padding:1.2rem;text-align:center;cursor:pointer;transition:.2s;box-shadow:0 2px 8px rgba(0,0,0,.06);border:2px solid transparent;overflow:hidden}
.m-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.1);border-color:#e0e7ff}
.m-avatar{width:72px;height:72px;border-radius:50%;margin:0 auto .6rem;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:#fff}
.m-avatar-photo{width:72px;height:72px;border-radius:50%;margin:0 auto .6rem;overflow:hidden;border:3px solid}
.m-avatar-photo img{width:100%;height:100%;object-fit:cover}
.m-avatar-fb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:#fff}
.m-name{font-size:1.05rem;font-weight:700;margin-bottom:.2rem}
.m-faction{font-size:.82rem;font-weight:600;margin-bottom:.3rem}
.m-committee{font-size:.76rem;color:var(--sub);margin-bottom:.3rem}
.role-tag{display:inline-block;padding:.15rem .5rem;border-radius:10px;font-size:.72rem;background:#fef3c7;color:#92400e;font-weight:600;margin-bottom:.3rem;margin-right:.2rem}
.m-stats-mini{display:flex;justify-content:center;gap:.8rem;font-size:.82rem;color:var(--sub);margin:.4rem 0}
.m-top-cats{display:flex;flex-wrap:wrap;justify-content:center;gap:.3rem;margin-top:.4rem}
.cat-pill{display:inline-block;padding:.15rem .5rem;border-radius:8px;font-size:.7rem;color:#fff;font-weight:500}

.current-badge{display:inline-block;padding:.15rem .7rem;border-radius:10px;font-size:.75rem;background:#dcfce7;color:#166534;font-weight:600;margin:.4rem 0}
.former-badge{display:inline-block;padding:.15rem .7rem;border-radius:10px;font-size:.75rem;background:#f3f4f6;color:#6b7280;font-weight:600;margin:.4rem 0}
.section-title-former{font-size:1rem;font-weight:600;color:var(--sub);margin:2rem 0 .8rem;padding:.5rem 1rem;background:#fff;border-radius:10px;border-left:4px solid #9ca3af}

.tab-panel{display:none}
.tab-panel.active{display:block}
/* 総合計画タブ */
.plan-hero{background:linear-gradient(135deg,#1e40af,#2563eb);color:#fff;border-radius:16px;padding:1.5rem;margin-bottom:1.2rem;box-shadow:0 4px 20px rgba(37,99,235,.25)}
.plan-hero h2{font-size:1.3rem;margin-bottom:.4rem;font-weight:700}
.plan-hero .plan-vision{font-size:1.05rem;font-weight:600;margin:.6rem 0 .2rem;line-height:1.5}
.plan-hero .plan-sub{font-size:.85rem;opacity:.92;line-height:1.5}
.plan-meta{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:.8rem;font-size:.78rem}
.plan-meta span{background:rgba(255,255,255,.22);padding:.3rem .7rem;border-radius:20px}
.plan-warn{background:#fff5e6;border-left:4px solid #f39c12;padding:.7rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:.8rem;color:#7a5a00;line-height:1.5}
.plan-warn strong{color:#c06500}
.plan-h3{font-size:1.1rem;font-weight:700;margin:1.8rem 0 .8rem;padding:.5rem .9rem;background:linear-gradient(90deg,#e8f0fe,#fff);border-left:5px solid #4a90e2;border-radius:0 8px 8px 0}
.plan-h3 .plan-count{float:right;background:#4a90e2;color:#fff;font-size:.75rem;padding:.15rem .6rem;border-radius:12px;font-weight:600}
.kadai-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:.9rem}
.kadai-card{background:var(--card);border-radius:12px;padding:1rem 1.1rem;box-shadow:0 2px 10px rgba(0,0,0,.07);border-top:4px solid #4a90e2;transition:.2s}
.kadai-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.12)}
.kadai-num{display:inline-block;background:#4a90e2;color:#fff;font-weight:700;font-size:.72rem;padding:.18rem .6rem;border-radius:12px;margin-bottom:.5rem}
.kadai-title{font-size:.95rem;font-weight:700;color:var(--text);line-height:1.45;margin-bottom:.5rem}
.kadai-summary{font-size:.8rem;color:var(--sub);line-height:1.55;margin-bottom:.6rem}
.kadai-points{list-style:none;padding:0;margin:0}
.kadai-points li{font-size:.76rem;color:#555;padding:.3rem .5rem .3rem 1.2rem;position:relative;line-height:1.5}
.kadai-points li::before{content:'▸';position:absolute;left:.3rem;color:#4a90e2;font-weight:700}
.kadai-src{font-size:.7rem;color:#999;margin-top:.5rem;padding-top:.5rem;border-top:1px dashed #e0e0e0}
/* 将来人口 */
.pop-box{background:var(--card);border-radius:12px;padding:1.2rem;box-shadow:0 2px 10px rgba(0,0,0,.07);margin-bottom:1rem}
.pop-row{display:flex;align-items:center;gap:.6rem;margin-bottom:.3rem;font-size:.78rem}
.pop-year{width:46px;text-align:right;color:var(--sub);font-weight:600}
.pop-bar-wrap{flex:1;height:22px;background:#f0f4f8;border-radius:11px;position:relative;overflow:hidden}
.pop-bar-proj{position:absolute;left:0;top:0;height:100%;background:linear-gradient(90deg,#5d9cec,#a0b9d4);border-radius:11px;display:flex;align-items:center;justify-content:flex-end;padding-right:.5rem;color:#fff;font-size:.68rem;font-weight:600;transition:.8s}
.pop-bar-target{position:absolute;top:0;height:100%;border-right:3px dashed #e74c3c}
.pop-legend{display:flex;gap:1rem;flex-wrap:wrap;margin-top:.8rem;font-size:.75rem;color:var(--sub)}
.pop-legend span::before{content:'';display:inline-block;width:14px;height:10px;margin-right:.3rem;vertical-align:middle;border-radius:2px}
.pop-legend .lg-proj::before{background:linear-gradient(90deg,#5d9cec,#a0b9d4)}
.pop-legend .lg-target::before{background:transparent;border:2px dashed #e74c3c;height:8px}
.pop-note{font-size:.72rem;color:var(--sub);margin-top:.6rem;line-height:1.5;background:#f9fafc;padding:.5rem .7rem;border-radius:6px}
/* 政策目標 */
.goals-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.8rem}
.goal-card{background:var(--card);border-radius:12px;padding:1rem;box-shadow:0 2px 10px rgba(0,0,0,.07);cursor:pointer;transition:.2s;text-align:center;border:2px solid transparent}
.goal-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.13);border-color:#4a90e2}
.goal-card.selected{border-color:#4a90e2;background:#f0f6ff}
.goal-num{display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;width:32px;height:32px;line-height:32px;border-radius:50%;font-weight:700;margin-bottom:.5rem}
.goal-title{font-size:.95rem;font-weight:700;line-height:1.4;margin-bottom:.35rem;color:var(--text)}
.goal-theme{font-size:.72rem;color:#4a90e2;font-weight:600;margin-bottom:.4rem}
.goal-desc{font-size:.73rem;color:var(--sub);line-height:1.5}
/* 施策詳細 */
.sub-detail{margin-top:1rem}
.sub-card{background:var(--card);border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:.8rem;overflow:hidden}
.sub-head{padding:.8rem 1rem;background:linear-gradient(90deg,#f0f6ff,#fff);cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-left:4px solid #4a90e2}
.sub-head-title{font-size:.92rem;font-weight:700;color:var(--text)}
.sub-head-id{font-size:.7rem;color:#4a90e2;background:#e8f0fe;padding:.15rem .5rem;border-radius:10px;margin-right:.5rem;font-weight:600}
.sub-toggle{color:#4a90e2;font-size:.9rem;font-weight:700}
.sub-body{display:none;padding:.8rem 1rem;border-top:1px solid #eef1f5}
.sub-card.open .sub-body{display:block}
.sub-card.open .sub-toggle{transform:rotate(180deg)}
.sub-section{margin-bottom:.9rem}
.sub-label{font-size:.75rem;font-weight:700;color:#4a90e2;margin-bottom:.35rem;padding:.2rem .6rem;background:#e8f0fe;border-radius:10px;display:inline-block}
.sub-label.challenge{color:#c06500;background:#fff5e6}
.sub-label.kpi{color:#27ae60;background:#e8f8ef}
.sub-list{list-style:none;padding:0;margin:0}
.sub-list li{font-size:.8rem;color:#444;line-height:1.55;padding:.3rem 0 .3rem 1rem;position:relative}
.sub-list li::before{content:'・';position:absolute;left:0;color:#4a90e2}
.sub-label.challenge ~ .sub-list li::before{color:#e67e22}
.kpi-raw{font-size:.73rem;color:#555;background:#f9fafc;padding:.5rem .7rem;border-radius:6px;white-space:pre-wrap;font-family:monospace;line-height:1.5;margin-top:.3rem}
/* 議員×施策ヒートマップ */
.heat-wrap{background:var(--card);border-radius:12px;padding:1rem;box-shadow:0 2px 10px rgba(0,0,0,.07);overflow-x:auto;margin-bottom:1rem}
.heat-disclaimer{background:#fff5e6;border-left:4px solid #f39c12;padding:.7rem 1rem;border-radius:8px;margin-bottom:.8rem;font-size:.78rem;color:#7a5a00;line-height:1.55}
.heat-disclaimer strong{color:#c06500}
.heat-controls{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.7rem;align-items:center}
.heat-controls select,.heat-controls input{padding:.4rem .7rem;border:1px solid #d5dbe6;border-radius:8px;font-size:.82rem;background:#fff}
.heat-controls label{font-size:.78rem;color:var(--sub);font-weight:600}
.heat-table{border-collapse:collapse;font-size:.72rem;min-width:100%}
.heat-table th,.heat-table td{border:1px solid #eef1f5;padding:0;text-align:center}
.heat-table th.member-col,.heat-table td.member-col{position:sticky;left:0;background:#fff;z-index:2;text-align:left;padding:.3rem .5rem;white-space:nowrap;font-weight:600;min-width:100px;max-width:120px;overflow:hidden;text-overflow:ellipsis;border-right:2px solid #d5dbe6}
.heat-table thead th{position:sticky;top:0;background:#f0f4f8;z-index:3;padding:.2rem .1rem;font-size:.58rem;writing-mode:vertical-rl;height:140px;white-space:nowrap;border-bottom:2px solid #d5dbe6;font-weight:600;color:var(--sub);overflow:hidden;text-overflow:ellipsis;max-width:24px;line-height:1.1}
.heat-table thead th.member-col{writing-mode:initial;transform:none;height:auto;z-index:4;background:#e8eef6;text-align:left}
.heat-table thead th.goal-sep{background:#e8eef6;color:#4a90e2;font-weight:700;writing-mode:initial;transform:none;height:auto;padding:.3rem .5rem;font-size:.72rem}
.heat-cell{width:24px;height:22px;cursor:pointer;transition:.1s;display:block;font-size:.6rem}
.heat-cell:hover{outline:2px solid #4a90e2;outline-offset:-1px;z-index:5;position:relative}
.heat-0{background:#fafbfd}
.heat-1{background:#e3edf8}
.heat-2{background:#b8d1ef}
.heat-3{background:#7faadb}
.heat-4{background:#4a7fc4;color:#fff}
.heat-5{background:#2a5ba5;color:#fff}
.heat-legend{display:flex;gap:.4rem;align-items:center;margin-top:.7rem;font-size:.72rem;color:var(--sub);flex-wrap:wrap}
.heat-legend .lg-box{display:inline-block;width:16px;height:16px;border:1px solid #d5dbe6;vertical-align:middle;margin-right:.2rem}
/* モーダル */
.heat-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center;padding:1rem}
.heat-modal.open{display:flex}
.heat-modal-box{background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:80vh;overflow-y:auto;padding:1.2rem 1.3rem;box-shadow:0 10px 40px rgba(0,0,0,.3)}
.heat-modal-head{font-size:1rem;font-weight:700;margin-bottom:.4rem;color:var(--text);border-bottom:2px solid #4a90e2;padding-bottom:.4rem}
.heat-modal-sub{font-size:.8rem;color:var(--sub);margin-bottom:.7rem;line-height:1.5}
.heat-modal-close{float:right;background:#f0f4f8;border:none;border-radius:20px;padding:.3rem .9rem;cursor:pointer;font-size:.82rem;font-weight:600;color:var(--sub)}
.heat-modal-close:hover{background:#e3edf8;color:#4a90e2}
.heat-vid-item{display:block;padding:.6rem .8rem;background:#f9fafc;border-left:3px solid #4a90e2;border-radius:6px;margin-bottom:.5rem;text-decoration:none;color:var(--text);transition:.15s}
.heat-vid-item:hover{background:#e8f0fe;transform:translateX(2px)}
.heat-vid-title{font-size:.82rem;font-weight:600;color:var(--text);margin-bottom:.25rem;line-height:1.4}
.heat-vid-meta{font-size:.7rem;color:var(--sub);display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.heat-vid-kw{font-size:.68rem;background:#e8f0fe;color:#4a90e2;padding:.1rem .4rem;border-radius:8px;font-weight:600}
/* コンシェルジュ・チャットボット（フロート型） */
.concierge-fab{position:fixed;bottom:24px;right:24px;width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;box-shadow:0 6px 20px rgba(102,126,234,.45);cursor:pointer;font-size:1.8rem;z-index:9998;display:flex;align-items:center;justify-content:center;transition:transform .2s, box-shadow .2s}
.concierge-fab:hover{transform:scale(1.08);box-shadow:0 10px 28px rgba(102,126,234,.55)}
.concierge-fab.open{background:#6b7280}
.concierge-fab-label{position:absolute;right:78px;bottom:14px;background:#fff;color:#4a90e2;padding:.5rem .9rem;border-radius:20px;font-size:.78rem;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.15);white-space:nowrap;pointer-events:none;animation:cfab-pulse 2.5s ease-in-out infinite}
@keyframes cfab-pulse{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.concierge-panel{position:fixed;bottom:100px;right:24px;width:380px;max-width:calc(100vw - 32px);height:min(620px, calc(100vh - 140px));background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.25);z-index:9999;display:none;flex-direction:column;overflow:hidden;border:1px solid #e5e7eb}
.concierge-panel.open{display:flex;animation:cpanel-in .25s ease-out}
@keyframes cpanel-in{from{opacity:0;transform:translateY(20px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
.concierge-header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:1rem 1.2rem;display:flex;align-items:center;gap:.7rem;flex-shrink:0}
.concierge-header-icon{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0}
.concierge-header-text{flex:1;min-width:0}
.concierge-title{font-size:.95rem;font-weight:700;line-height:1.2}
.concierge-subtitle{font-size:.68rem;opacity:.9;margin-top:.15rem}
.concierge-close{background:rgba(255,255,255,.2);color:#fff;border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;transition:background .15s}
.concierge-close:hover{background:rgba(255,255,255,.35)}
.concierge-body{flex:1;overflow-y:auto;padding:1rem 1.1rem;background:#f9fafc;display:flex;flex-direction:column;gap:.7rem}
.concierge-disclaimer{background:#fff5e6;border-left:3px solid #f39c12;padding:.5rem .7rem;border-radius:5px;font-size:.68rem;color:#7a5a00;line-height:1.55}
.concierge-msg{max-width:88%;padding:.6rem .85rem;border-radius:14px;font-size:.82rem;line-height:1.6;white-space:pre-wrap;word-wrap:break-word}
.concierge-msg.bot{background:#fff;border:1px solid #e5e7eb;align-self:flex-start;border-top-left-radius:4px;color:#222}
.concierge-msg.user{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;align-self:flex-end;border-top-right-radius:4px}
.concierge-msg.err{background:#fef2f2;border:1px solid #fecaca;color:#a33;align-self:flex-start}
.concierge-samples{display:flex;flex-wrap:wrap;gap:.35rem;padding:.2rem 0}
.concierge-sample{background:#fff;border:1px solid #c9dcf7;color:#4a90e2;padding:.35rem .7rem;border-radius:14px;font-size:.7rem;cursor:pointer;font-weight:600;transition:.15s}
.concierge-sample:hover{background:#4a90e2;color:#fff;border-color:#4a90e2}
.concierge-loading{display:flex;align-items:center;gap:.5rem;color:var(--sub);font-size:.75rem;align-self:flex-start;padding:.4rem 0}
.concierge-spinner{width:14px;height:14px;border:2px solid #e3edf8;border-top-color:#4a90e2;border-radius:50%;animation:cchat-spin .8s linear infinite}
@keyframes cchat-spin{to{transform:rotate(360deg)}}
.concierge-footer{padding:.7rem .9rem;border-top:1px solid #e5e7eb;background:#fff;flex-shrink:0}
.concierge-inputwrap{display:flex;gap:.4rem;align-items:flex-end}
.concierge-input{flex:1;padding:.55rem .7rem;border:1.5px solid #d5dbe6;border-radius:10px;font-size:.82rem;resize:none;min-height:38px;max-height:100px;font-family:inherit;line-height:1.4;outline:none}
.concierge-input:focus{border-color:#667eea}
.concierge-send{padding:.55rem .95rem;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:10px;font-size:.8rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:.15s}
.concierge-send:hover:not(:disabled){opacity:.9;transform:translateY(-1px)}
.concierge-send:disabled{background:#a8b8c8;cursor:not-allowed;transform:none}
.concierge-counter{font-size:.65rem;color:var(--sub);text-align:right;margin-top:.3rem}
@media (max-width:480px){
  .concierge-panel{width:calc(100vw - 20px);right:10px;bottom:90px;height:calc(100vh - 120px)}
  .concierge-fab{bottom:16px;right:16px;width:56px;height:56px;font-size:1.5rem}
  .concierge-fab-label{display:none}
}
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
.v-title{font-weight:600;font-size:.92rem;color:var(--text);text-decoration:none;display:block;margin-bottom:.3rem;line-height:1.5}
.v-title:hover{color:var(--accent)}
.v-meta{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin-bottom:.4rem}
.v-date{font-size:.82rem;color:var(--sub)}
.v-type{display:inline-block;padding:.12rem .5rem;border-radius:6px;font-size:.74rem;color:#fff;font-weight:500}

/* 質問箇条書き（常に表示） */
.q-list-always{list-style:none;padding:0;margin:0}
.q-list-always li{font-size:.85rem;color:#444;padding:.4rem .6rem;background:#f8f9ff;border-radius:8px;margin-bottom:.4rem;border-left:3px solid var(--accent);position:relative;padding-left:1.2rem;line-height:1.6}
.q-list-always li::before{content:'\\25CF';position:absolute;left:.4rem;top:.45rem;color:var(--accent);font-size:.5rem}
.q-bullet{margin-bottom:.2rem;line-height:1.6;word-break:break-all;overflow-wrap:break-word}
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
.qs-list li{font-size:.85rem;color:#444;padding:.35rem .6rem;background:#f8f9ff;border-radius:6px;margin-bottom:.3rem;border-left:3px solid var(--accent);padding-left:1.2rem;position:relative;line-height:1.6}
.qs-list li::before{content:'\\25CF';position:absolute;left:.4rem;top:.4rem;color:var(--accent);font-size:.45rem}

.stats-panel{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.stats-box{background:var(--card);border-radius:var(--radius);padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.stats-box h3{font-size:1rem;margin-bottom:1rem;color:var(--accent)}
.bar-row{margin-bottom:.6rem}
.bar-label{display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.2rem}
.bar-bg{height:20px;background:#f0f4f8;border-radius:10px;overflow:hidden}
.bar-fill{height:100%;border-radius:10px;transition:.5s}
footer{text-align:center;padding:1.5rem 1rem;color:var(--sub);font-size:.82rem}
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
.search-hit-title{font-size:.92rem;font-weight:600;color:var(--text);text-decoration:none;display:block;margin-bottom:.3rem}
.search-hit-title:hover{color:var(--accent)}
.search-hit-meta{display:flex;gap:.5rem;font-size:.78rem;color:var(--sub);margin-bottom:.4rem;flex-wrap:wrap}
.search-hit-q{font-size:.82rem;color:#444;padding:.3rem .5rem .3rem 1rem;background:#f8f9ff;border-radius:6px;margin-bottom:.25rem;border-left:3px solid var(--accent);position:relative;line-height:1.6}
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

/* 市民の声タブ */
.voice-intro{background:linear-gradient(135deg,#2563eb10,#1d4ed810);border-left:4px solid var(--accent);padding:1rem 1.2rem;border-radius:12px;margin-bottom:1rem}
.voice-intro h3{font-size:1rem;color:var(--accent);margin-bottom:.5rem}
.voice-intro p{font-size:.85rem;color:#444;line-height:1.6}
.voice-actions{display:flex;gap:.6rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center}
.voice-btn-post{padding:.7rem 1.5rem;border:none;border-radius:10px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-weight:700;cursor:pointer;font-size:.92rem;box-shadow:0 2px 8px rgba(37,99,235,.3)}
.voice-btn-post:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(37,99,235,.4)}
.voice-cat-filter{padding:.6rem 1rem;border:2px solid #e5e7eb;border-radius:10px;font-size:.88rem;background:#fff}
.voice-list{display:flex;flex-direction:column;gap:.8rem}
.voice-item{background:var(--card);border-radius:12px;padding:1rem 1.2rem;box-shadow:0 1px 4px rgba(0,0,0,.05);border-left:4px solid var(--accent)}
.voice-item-head{display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;flex-wrap:wrap}
.voice-cat-pill{display:inline-block;padding:.15rem .6rem;border-radius:8px;font-size:.75rem;color:#fff;font-weight:600}
.voice-title{font-size:1rem;font-weight:700;color:var(--text);margin-bottom:.3rem}
.voice-body{font-size:.85rem;color:#444;line-height:1.6;white-space:pre-wrap;word-break:break-all}
.voice-meta{display:flex;gap:.5rem;font-size:.78rem;color:var(--sub);margin-top:.5rem;flex-wrap:wrap}
.voice-empty{text-align:center;padding:2rem;color:var(--sub);background:#fff;border-radius:12px}
.voice-loading{text-align:center;padding:1rem;color:var(--sub);font-size:.85rem}
/* サイト改善要望セクション */
.site-feedback-section{margin-top:2rem;background:linear-gradient(135deg,#fef9ef,#fff7e6);border:2px solid #f5d990;border-radius:14px;padding:1.2rem 1.4rem}
.site-feedback-section h3{font-size:1rem;color:#b8860b;margin-bottom:.5rem}
.site-feedback-section>p{font-size:.82rem;color:#666;line-height:1.6;margin-bottom:1rem}
.site-feedback-form select,.site-feedback-form textarea{width:100%;padding:.6rem .8rem;border:2px solid #e5e7eb;border-radius:8px;font-size:.88rem;font-family:inherit;outline:none;box-sizing:border-box}
.site-feedback-form select:focus,.site-feedback-form textarea:focus{border-color:#f39c12}
.site-feedback-form textarea{resize:vertical;min-height:100px}

/* はじめてガイド */
.welcome-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:1rem;animation:fadeIn .3s}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.welcome-box{background:#fff;border-radius:20px;max-width:520px;width:100%;padding:2rem 1.5rem;box-shadow:0 20px 60px rgba(0,0,0,.25);animation:slideUp .4s ease-out}
@keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
.welcome-box h2{font-size:1.3rem;text-align:center;color:var(--accent);margin-bottom:.3rem}
.welcome-box .welcome-sub{text-align:center;font-size:.85rem;color:var(--sub);margin-bottom:1.2rem;line-height:1.6}
.welcome-cards{display:flex;flex-direction:column;gap:.7rem;margin-bottom:1.2rem}
.welcome-card{display:flex;align-items:center;gap:.8rem;padding:.9rem 1rem;border-radius:12px;border:2px solid #e5e7eb;cursor:pointer;transition:.2s}
.welcome-card:hover{border-color:var(--accent);background:#eff6ff;transform:translateX(4px)}
.welcome-card-icon{font-size:1.8rem;flex-shrink:0;width:48px;text-align:center}
.welcome-card-text{flex:1}
.welcome-card-text strong{font-size:.92rem;color:var(--text);display:block;margin-bottom:.15rem}
.welcome-card-text span{font-size:.78rem;color:var(--sub);line-height:1.4}
.welcome-close{display:block;margin:0 auto;padding:.6rem 2rem;border:none;border-radius:10px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-weight:700;font-size:.9rem;cursor:pointer;box-shadow:0 2px 8px rgba(37,99,235,.3)}
.welcome-close:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(37,99,235,.4)}
.welcome-skip{display:block;text-align:center;margin-top:.6rem;font-size:.75rem;color:var(--sub);cursor:pointer;border:none;background:none}
.welcome-skip:hover{color:var(--accent)}

/* 用語ツールチップ */
.glossary-term{border-bottom:1.5px dotted #2563eb;color:var(--text);cursor:help;position:relative}
.glossary-tip{display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;font-size:.76rem;padding:.5rem .7rem;border-radius:8px;width:260px;line-height:1.5;z-index:500;box-shadow:0 4px 12px rgba(0,0,0,.2);pointer-events:none;font-weight:400}
.glossary-tip::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:6px solid transparent;border-top-color:#1e293b}
.glossary-term:hover .glossary-tip,.glossary-term:focus .glossary-tip{display:block}
@media(max-width:480px){.glossary-tip{width:200px;font-size:.72rem;left:0;transform:none}.glossary-tip::after{left:20px}}

/* テーマで探す */
.theme-picker{margin-bottom:.8rem}
.theme-picker-label{font-size:.88rem;font-weight:700;color:var(--text);margin-bottom:.5rem}
.theme-btns{display:flex;flex-wrap:wrap;gap:.4rem}
.theme-btn{padding:.45rem .8rem;border:2px solid var(--tc,#ccc);border-radius:20px;background:#fff;font-size:.8rem;font-weight:600;cursor:pointer;transition:.2s;color:var(--tc,#333)}
.theme-btn:hover,.theme-btn.active{background:var(--tc,#2563eb);color:#fff;transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,.15)}

/* 議員活動サマリー */
.activity-summary{background:linear-gradient(135deg,#f0f9ff,#eff6ff);border:2px solid #bfdbfe;border-radius:12px;padding:1rem 1.2rem;margin:1rem 0}
.activity-summary h4{font-size:.9rem;color:var(--accent);margin-bottom:.5rem}
.activity-summary p{font-size:.82rem;color:#444;line-height:1.7}
.activity-highlights{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem}
.activity-tag{padding:.25rem .6rem;border-radius:8px;font-size:.72rem;font-weight:600;background:#dbeafe;color:#1d4ed8}

/* 質問一覧タイムライン */
.qtl-section{margin:1.5rem 0}
.qtl-controls{display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap}
.qtl-search{flex:1;min-width:180px;padding:.6rem .8rem;border:2px solid #e5e7eb;border-radius:10px;font-size:.85rem;outline:none}
.qtl-search:focus{border-color:var(--accent)}
.qtl-filter{padding:.6rem .8rem;border:2px solid #e5e7eb;border-radius:10px;font-size:.85rem;background:#fff;outline:none}
.qtl-list{display:flex;flex-direction:column;gap:.6rem}
.qtl-card{background:var(--card);border-radius:12px;padding:1rem 1.2rem;box-shadow:0 1px 4px rgba(0,0,0,.06);border-left:4px solid var(--accent);transition:.2s}
.qtl-card:hover{box-shadow:0 3px 12px rgba(0,0,0,.1)}
.qtl-card.hidden{display:none}
.qtl-header{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap}
.qtl-date{font-size:.78rem;font-weight:700;color:var(--sub);background:#f0f4f8;padding:.2rem .5rem;border-radius:6px}
.qtl-type{font-size:.68rem;color:#fff;padding:.15rem .5rem;border-radius:6px;font-weight:600}
.qtl-video-link{font-size:.72rem;color:#16a34a;font-weight:600;text-decoration:none;margin-left:auto;padding:.15rem .5rem;border:1px solid #86efac;border-radius:6px;background:#f0fdf4}
.qtl-video-link:hover{background:#16a34a;color:#fff}
.qtl-question{font-size:.9rem;font-weight:600;color:var(--text);line-height:1.6;margin-bottom:.5rem}
.qtl-resp{background:#f8fafc;border-radius:8px;padding:.6rem .8rem;border-left:3px solid #2563eb}
.qtl-resp-label{font-size:.68rem;font-weight:700;color:var(--accent);margin-bottom:.25rem;display:inline-block;background:#eff6ff;padding:.1rem .4rem;border-radius:4px}
.qtl-resp-short,.qtl-resp-full{font-size:.82rem;color:#444;line-height:1.7;white-space:pre-wrap;word-break:break-all}
.qtl-resp-toggle{font-size:.72rem;color:var(--accent);border:none;background:none;cursor:pointer;font-weight:600;padding:.2rem 0;margin-top:.2rem}
.qtl-resp-toggle:hover{text-decoration:underline}
.qtl-no-resp{font-size:.75rem;color:#aaa;font-style:italic;margin-top:.2rem}
.qtl-count{font-size:.75rem;color:var(--sub);text-align:center;margin-top:.6rem;padding:.3rem}

/* 議会カレンダー */
.council-calendar{background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border:2px solid #7dd3fc;border-radius:14px;padding:1rem 1.2rem;margin-bottom:1.5rem}
.cal-header{font-size:1rem;font-weight:700;color:#0369a1;margin-bottom:.5rem}
.cal-next{background:#fff;border-radius:10px;padding:.7rem 1rem;margin-bottom:.7rem;font-size:.88rem;color:#0c4a6e;font-weight:600;border-left:4px solid #0ea5e9}
.cal-schedule{display:flex;gap:.5rem;flex-wrap:wrap}
.cal-item{display:flex;align-items:center;gap:.4rem;padding:.35rem .7rem;background:#fff;border-radius:8px;font-size:.78rem;border:1px solid #bae6fd}
.cal-item.is-next{background:#0ea5e9;color:#fff;font-weight:700;border-color:#0ea5e9}
.cal-item.is-next .glossary-term{color:#fff}
.cal-item.is-past{opacity:.5}
.cal-month{font-weight:700;min-width:2rem}
.cal-label{color:#475569}
.cal-item.is-next .cal-label{color:#fff}

/* 動画ジャンプリンク */
.v-jump{display:inline-block;padding:.15rem .5rem;border-radius:6px;font-size:.72rem;font-weight:600;background:#f0fdf4;color:#16a34a;border:1px solid #86efac;text-decoration:none;margin-left:.3rem}
.v-jump:hover{background:#16a34a;color:#fff}

/* パーソナライズ */
.personalize-bar{background:linear-gradient(135deg,#faf5ff,#f3e8ff);border:2px solid #d8b4fe;border-radius:14px;padding:1rem 1.2rem;margin-bottom:1rem}
.personalize-bar h4{font-size:.9rem;color:#7c3aed;margin-bottom:.5rem}
.personalize-tags{display:flex;flex-wrap:wrap;gap:.4rem}
.p-tag{padding:.35rem .7rem;border:2px solid #d8b4fe;border-radius:20px;font-size:.78rem;cursor:pointer;transition:.2s;background:#fff;color:#7c3aed;font-weight:600}
.p-tag:hover{background:#f3e8ff}
.p-tag.selected{background:#7c3aed;color:#fff;border-color:#7c3aed}
.p-tag-save{padding:.35rem .8rem;border:none;border-radius:20px;font-size:.78rem;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-weight:700;cursor:pointer;margin-left:.3rem}

/* ニュースレター */
.newsletter-section{background:linear-gradient(135deg,#1e40af,#2563eb);padding:2rem 1rem;margin-top:1rem}
.newsletter-inner{max-width:600px;margin:0 auto;text-align:center;color:#fff}
.newsletter-inner h3{font-size:1.1rem;margin-bottom:.4rem}
.newsletter-inner>p{font-size:.85rem;opacity:.9;margin-bottom:1rem;line-height:1.6}
.newsletter-form{display:flex;gap:.5rem;justify-content:center;max-width:400px;margin:0 auto}
.nl-input{flex:1;padding:.6rem .8rem;border:2px solid rgba(255,255,255,.3);border-radius:10px;font-size:.88rem;background:rgba(255,255,255,.15);color:#fff;outline:none}
.nl-input::placeholder{color:rgba(255,255,255,.6)}
.nl-input:focus{border-color:#fff;background:rgba(255,255,255,.25)}
.nl-btn{padding:.6rem 1.2rem;border:none;border-radius:10px;background:#fff;color:#1e40af;font-weight:700;font-size:.88rem;cursor:pointer}
.nl-btn:hover{background:#f0f9ff;transform:translateY(-1px)}
.nl-note{font-size:.7rem;opacity:.7;margin-top:.6rem}
@media(max-width:480px){.newsletter-form{flex-direction:column}.nl-input,.nl-btn{width:100%}}

/* モーダル */
.modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:1000;align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow-y:auto}
.modal-overlay.open{display:flex}
.modal-box{background:#fff;border-radius:16px;max-width:600px;width:100%;padding:1.5rem;box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:calc(100vh - 4rem);overflow-y:auto}
.modal-box h2{font-size:1.2rem;margin-bottom:.8rem;color:var(--accent)}
.modal-rules{background:#fef3c7;border-left:4px solid #f59e0b;padding:1rem;border-radius:8px;margin-bottom:1rem;font-size:.78rem;color:#444;line-height:1.7}
.modal-rules strong{color:#92400e;display:block;margin-bottom:.3rem}
.modal-rules ul{padding-left:1.2rem;margin:.4rem 0}
.modal-rules li{margin-bottom:.15rem}
.modal-form-row{margin-bottom:.8rem}
.modal-form-row label{display:block;font-size:.78rem;font-weight:600;color:var(--sub);margin-bottom:.25rem}
.modal-form-row input,.modal-form-row select,.modal-form-row textarea{width:100%;padding:.6rem .8rem;border:2px solid #e5e7eb;border-radius:8px;font-size:.88rem;font-family:inherit;outline:none;box-sizing:border-box}
.modal-form-row input:focus,.modal-form-row select:focus,.modal-form-row textarea:focus{border-color:var(--accent)}
.modal-form-row textarea{resize:vertical;min-height:120px}
.modal-form-row .char-count{font-size:.7rem;color:var(--sub);text-align:right;margin-top:.2rem}
.modal-agree{display:flex;align-items:flex-start;gap:.5rem;background:#f0f9ff;padding:.8rem;border-radius:8px;margin:.8rem 0;font-size:.82rem}
.modal-agree input{margin-top:.2rem;flex-shrink:0}
.modal-buttons{display:flex;gap:.6rem;margin-top:1rem}
.modal-buttons button{flex:1;padding:.8rem;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:.92rem}
.modal-cancel{background:#f3f4f6;color:#444}
.modal-submit{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff}
.modal-submit:disabled{opacity:.5;cursor:not-allowed}
.modal-msg{padding:.8rem;border-radius:8px;margin-top:.8rem;font-size:.85rem;text-align:center}
.modal-msg.success{background:#dcfce7;color:#166534}
.modal-msg.error{background:#fee2e2;color:#991b1b}
.load-btn{display:block;margin:1rem auto;padding:.7rem 2rem;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:.95rem;font-weight:600}
.load-btn:hover{opacity:.9}
/* タブレット */
@media(max-width:1024px){
  .container{padding:.8rem}
  .detail-top{gap:1.2rem;padding:1.2rem}
  .m-grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
}
/* スマートフォン */
@media(max-width:768px){
  header{padding:1rem .8rem .8rem}
  header h1{font-size:1.2rem;letter-spacing:.04em}
  .header-sub{font-size:.75rem}
  .header-stats{font-size:.72rem;gap:.3rem;margin-top:.35rem}
  .header-stats span{padding:.18rem .5rem}
  .header-credit{font-size:.65rem;margin-top:.35rem}
  nav{gap:.2rem;padding:.5rem .6rem;justify-content:flex-start}
  nav button{padding:.4rem .7rem;font-size:.78rem;border-radius:6px}
  nav button.active::after{left:15%;right:15%;height:2px}
  .container{padding:.5rem .6rem}
  .search-row{gap:.5rem;margin:.6rem 0}
  .search-input{padding:.6rem .8rem;font-size:.88rem;min-width:120px}
  .filter-sel{padding:.6rem .7rem;font-size:.82rem}
  .m-grid{grid-template-columns:repeat(2,1fr);gap:.6rem}
  .m-card{padding:.8rem .5rem;border-radius:12px}
  .m-avatar,.m-avatar-photo{width:56px;height:56px;margin-bottom:.4rem}
  .m-avatar-photo img{width:100%;height:100%}
  .m-avatar-fb{font-size:1.4rem}
  .m-name{font-size:.92rem}
  .m-faction{font-size:.75rem}
  .m-committee{font-size:.68rem}
  .m-stats-mini{font-size:.72rem;gap:.5rem}
  .m-top-cats{gap:.2rem}
  .cat-pill{font-size:.62rem;padding:.1rem .35rem}
  .role-tag{font-size:.65rem;padding:.1rem .35rem}
  .faction-header{padding:.5rem .7rem}
  .faction-name{font-size:.95rem}
  .stats-panel{grid-template-columns:1fr}
  .detail-panel{margin:0 -.5rem}
  .detail-top{flex-direction:column;gap:1rem;padding:1rem;border-radius:12px}
  .detail-left{min-width:unset}
  .detail-left h2{font-size:1.3rem}
  .detail-avatar,.detail-avatar-photo{width:80px;height:80px}
  .detail-info>div{padding:.35rem 0}
  .info-label{width:60px;font-size:.78rem}
  .info-val{font-size:.82rem}
  .detail-right{min-width:unset}
  .detail-right h3{font-size:.95rem}
  .detail-stats-box{gap:.8rem;padding:.6rem}
  .ds-val{font-size:1.3rem}
  .cat-bar-label{width:70px;font-size:.72rem}
  .cat-bar-pct{width:35px;font-size:.72rem}
  .section-title{font-size:1rem;margin:1rem 0 .6rem}
  .v-list{gap:.6rem}
  .v-item{flex-direction:column}
  .v-thumb{width:100%;height:auto;aspect-ratio:16/9}
  .v-thumb img{width:100%;height:100%;object-fit:cover}
  .v-info{padding:.5rem .7rem}
  .v-title{font-size:.85rem}
  .v-meta{margin-bottom:.3rem}
  .v-date{font-size:.75rem}
  .v-type{font-size:.68rem;padding:.1rem .4rem}
  .q-list-always li{font-size:.8rem;padding:.35rem .5rem .35rem 1rem;margin-bottom:.3rem}
  .q-list-always li::before{left:.3rem;top:.38rem;font-size:.4rem}
  .q-bullet{font-size:.8rem;line-height:1.5}
  .resp-box{font-size:.75rem;padding:.3rem .5rem}
  .resp-label{font-size:.62rem;padding:.08rem .3rem}
  .qs-list li{font-size:.78rem;padding:.3rem .5rem .3rem 1rem}
  .qs-list li::before{left:.3rem;font-size:.4rem}
  .back-btn{font-size:.82rem;padding:.4rem .8rem}
  .load-btn{font-size:.88rem;padding:.6rem 1.5rem}
  .detail-committees{padding:.7rem}
  .qtl-card{padding:.7rem .8rem}
  .qtl-question{font-size:.82rem}
  .qtl-resp-short,.qtl-resp-full{font-size:.78rem}
  .qtl-controls{gap:.4rem}
  .qtl-search{font-size:.8rem;padding:.5rem .6rem}
  .qtl-filter{font-size:.8rem;padding:.5rem .6rem}
  .cm-title{font-size:.8rem}
  .cm-item{font-size:.78rem}
  .cm-badge{font-size:.65rem}
  .member-desc p{font-size:.82rem}
  .cmp-grid{grid-template-columns:1fr 1fr}
  .cmp-card{padding:.8rem}
  .cmp-name{font-size:.92rem}
  .cmp-stat-val{font-size:1.1rem}
  .kadai-grid{grid-template-columns:1fr}
  .goals-grid{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.6rem}
  .goal-title{font-size:.85rem}
  .goal-desc{font-size:.7rem}
  .plan-hero{padding:1rem;border-radius:12px}
  .plan-hero h2{font-size:1.1rem}
  .plan-hero .plan-vision{font-size:.92rem}
  .plan-hero .plan-sub{font-size:.78rem}
  .heat-wrap{padding:.5rem}
  .heat-table{font-size:.65rem}
  .trend-chart{padding:.8rem}
  .trend-chart h3{font-size:.92rem}
  .disclaimer{padding:1rem;margin:1.5rem auto 0}
  .disclaimer h3{font-size:.92rem}
  .disclaimer h4{font-size:.82rem}
  .disclaimer p,.disclaimer li{font-size:.78rem}
  .modal-box{padding:1rem;border-radius:12px;max-height:calc(100vh - 2rem)}
  .modal-overlay{padding:1rem .5rem}
  footer{padding:1rem;font-size:.75rem}
}
/* 小さいスマホ */
@media(max-width:400px){
  .m-grid{grid-template-columns:repeat(2,1fr);gap:.4rem}
  .m-card{padding:.6rem .3rem}
  .m-avatar,.m-avatar-photo{width:48px;height:48px}
  .m-name{font-size:.82rem}
  .m-stats-mini{font-size:.65rem}
  header h1{font-size:1.05rem}
  .header-stats span{font-size:.65rem;padding:.15rem .4rem}
  .header-credit{font-size:.6rem}
  nav button{padding:.35rem .55rem;font-size:.72rem}
  .cmp-grid{grid-template-columns:1fr}
  .goals-grid{grid-template-columns:1fr 1fr}
  .theme-btns{gap:.3rem}
  .theme-btn{padding:.35rem .6rem;font-size:.72rem}
  .welcome-box{padding:1.2rem 1rem}
  .welcome-box h2{font-size:1.1rem}
  .welcome-card{padding:.7rem}
  .welcome-card-icon{font-size:1.4rem;width:36px}
  .welcome-card-text strong{font-size:.82rem}
  .welcome-card-text span{font-size:.72rem}
  .activity-summary{padding:.8rem}
  .activity-summary h4{font-size:.82rem}
  .activity-summary p{font-size:.78rem}
  .activity-tag{font-size:.65rem;padding:.2rem .4rem}
  .a11y-bar{padding:.15rem .4rem}
  .a11y-btn{font-size:.65rem;padding:.12rem .4rem}
  .site-feedback-section{padding:.8rem 1rem}
  .site-feedback-section h3{font-size:.9rem}
}
</style>
</head>
<body>
<a href="#main-content" class="skip-link">本文へスキップ</a>
<!-- はじめてガイド -->
<div class="welcome-overlay" id="welcome-overlay" style="display:none">
  <div class="welcome-box">
    <h2>ようこそ「みんなの伊東市」へ</h2>
    <p class="welcome-sub">伊東市議会の活動を、わかりやすくお届けするサイトです。<br>まずは気になるものを選んでみてください。</p>
    <div class="welcome-cards">
      <div class="welcome-card" onclick="welcomeGo('members')">
        <div class="welcome-card-icon">🏛️</div>
        <div class="welcome-card-text">
          <strong>あなたの地域の議員を探す</strong>
          <span>${currentMembersList.length}名の議員プロフィール・質問内容を確認</span>
        </div>
      </div>
      <div class="welcome-card" onclick="welcomeGo('theme')">
        <div class="welcome-card-icon">🔍</div>
        <div class="welcome-card-text">
          <strong>テーマで議会活動を調べる</strong>
          <span>子育て・防災・観光など、気になるテーマから探せます</span>
        </div>
      </div>
      <div class="welcome-card" onclick="welcomeGo('voice')">
        <div class="welcome-card-icon">📢</div>
        <div class="welcome-card-text">
          <strong>市政に声を届ける</strong>
          <span>市民の声を投稿・閲覧。サイト改善要望も受付中</span>
        </div>
      </div>
    </div>
    <button class="welcome-close" onclick="closeWelcome()">サイトを見る</button>
    <button class="welcome-skip" onclick="closeWelcome(true)">次回から表示しない</button>
  </div>
</div>
<header>
  <div class="a11y-bar">
    <button class="a11y-btn" onclick="toggleFontSize()" aria-label="文字サイズ切り替え">文字 大⇔標準</button>
  </div>
  <h1>みんなの伊東市</h1>
  <div class="header-sub">伊東市議会の活動を、市民にわかりやすく</div>
  <div class="header-stats">
    <span>議員 ${currentMembersList.length}名</span>
    <span>動画 ${videos.length}本</span>
    <span>質問 ${videos.reduce((s,v)=>s+v.questions.length,0)}件</span>
  </div>
  <div class="header-visitors" id="visitor-counter" style="display:none">
    <span id="vc-total">—</span> 人が訪問 ｜ 今日 <span id="vc-today">—</span> 人
  </div>
  <div class="header-credit">制作・運営: <wbr>伊東市議会議員 大竹圭</div>
</header>
<nav role="tablist" aria-label="メインナビゲーション">
  <button class="active" role="tab" aria-selected="true" onclick="switchTab('members',this)">議員一覧</button>
  <button role="tab" aria-selected="false" onclick="switchTab('all',this)">動画・検索</button>
  <button role="tab" aria-selected="false" onclick="switchTab('plan',this)">総合計画</button>
  <button role="tab" aria-selected="false" onclick="switchTab('voice',this)">市民の声</button>
  <button role="tab" aria-selected="false" onclick="switchTab('stats',this)">統計・分析</button>
</nav>
<div class="container" id="main-content" role="main">
  <div id="tab-members" class="tab-panel active">
    <!-- パーソナライズバー -->
    <div class="personalize-bar" id="personalize-bar">
      <h4>⭐ 関心のあるテーマを選んでください（複数可）</h4>
      <div class="personalize-tags" id="p-tags">
        ${Object.keys(catColors).map(c => `<button class="p-tag" onclick="toggleInterest(this)" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        <button class="p-tag-save" onclick="saveInterests()">保存して反映</button>
      </div>
      <div id="p-status" style="font-size:.72rem;color:var(--sub);margin-top:.3rem"></div>
    </div>
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
    <!-- テーマで探す -->
    <div class="theme-picker">
      <div class="theme-picker-label">🔍 テーマで探す</div>
      <div class="theme-btns">
        <button class="theme-btn" onclick="themeSearch('子育て 教育 学校 保育')" style="--tc:#9b59b6">🧒 子育て・教育</button>
        <button class="theme-btn" onclick="themeSearch('防災 災害 避難 地震 津波')" style="--tc:#e74c3c">🛡️ 防災・安全</button>
        <button class="theme-btn" onclick="themeSearch('観光 インバウンド 温泉 イベント')" style="--tc:#f39c12">🏖️ 観光・経済</button>
        <button class="theme-btn" onclick="themeSearch('医療 福祉 介護 高齢 病院')" style="--tc:#e91e63">🏥 医療・福祉</button>
        <button class="theme-btn" onclick="themeSearch('道路 交通 バス 駐車場')" style="--tc:#3498db">🚌 交通・道路</button>
        <button class="theme-btn" onclick="themeSearch('環境 ごみ ゴミ メガソーラー 太陽光')" style="--tc:#27ae60">🌿 環境</button>
        <button class="theme-btn" onclick="themeSearch('人口 移住 定住 空き家 少子')" style="--tc:#8e44ad">🏠 人口・移住</button>
        <button class="theme-btn" onclick="themeSearch('DX ICT デジタル AI')" style="--tc:#2980b9">💻 DX・デジタル</button>
      </div>
    </div>
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
        const sp = v.speakers.map(s=>`<span class="cat-pill" style="background:#2563eb">${s}</span>`).join('');
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
    <div style="margin-top:2rem;padding-top:1.5rem;border-top:2px solid #e5e7eb">
      <h3 class="section-title">質問キーワード検索</h3>
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
  </div>
  <div id="tab-trend" style="display:none">
    <div class="trend-chart">
      <h3>年別 動画数（種別内訳） <span style="font-size:.7rem;font-weight:400;color:var(--sub)">💡用語にカーソルを合わせると説明が表示されます</span></h3>
      ${(() => {
        const allTypes = ['一般質問','大綱質疑','補正予算審議','委員会'];
        const typeCol = {'一般質問':'#2563eb','大綱質疑':'#27ae60','補正予算審議':'#e67e22','委員会':'#95a5a6'};
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
        const legend = allTypes.map(t => `<div class="trend-legend-item"><div class="trend-legend-dot" style="background:${typeCol[t]}"></div>${glossary(t.replace('審議',''))}</div>`).join('');
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
          return `<div class="trend-bar-row"><div class="trend-year">${y}</div><div class="trend-bar-bg"><div class="trend-seg" style="width:${w}%;background:#1d4ed8">${q>=5?q:''}</div></div><div class="trend-total">${q}問</div></div>`;
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
  <div id="tab-plan" class="tab-panel">
    ${sougouPlan ? (() => {
      const p = sougouPlan;
      const maxPop = Math.max(...p.future_population.projection.map(x=>x.total));
      const targetMap = {};
      const tgt = p.future_population.target || {};
      if (tgt.year_2025) targetMap[2025] = tgt.year_2025.total;
      if (tgt.year_2030) targetMap[2030] = tgt.year_2030.total;
      const popRows = p.future_population.projection.map(pt => {
        const pct = (pt.total/maxPop)*100;
        const tv = targetMap[pt.year];
        const tgtPct = tv ? (tv/maxPop)*100 : null;
        const diff = tv ? (tv - pt.total) : 0;
        return `<div class="pop-row">
          <div class="pop-year">${pt.year}<br><span style="font-size:.65rem;opacity:.7">${esc(pt.label||'')}</span></div>
          <div class="pop-bar-wrap">
            <div class="pop-bar-proj" style="width:${pct.toFixed(1)}%">${pt.total.toLocaleString()}人 (高齢化率${pt.elderly_rate}%)</div>
            ${tv ? `<div class="pop-bar-target" style="left:${tgtPct.toFixed(1)}%" title="目標 ${tv.toLocaleString()}人 (+${diff.toLocaleString()})"></div>` : ''}
          </div>
        </div>`;
      }).join('');
      const kadaiCards = p.machizukuri_kadai.map(k => `
        <div class="kadai-card">
          <span class="kadai-num">課題 ${k.num}</span>
          <div class="kadai-title">${esc(k.title)}</div>
          <div class="kadai-summary">${esc(k.summary)}</div>
          <ul class="kadai-points">${(k.key_points||[]).map(pt=>`<li>${esc(pt)}</li>`).join('')}</ul>
          <div class="kadai-src">📖 根拠: 計画書 p.${k.source_page}</div>
        </div>`).join('');
      const goalCards = p.policy_goals.map(g => `
        <div class="goal-card" data-goal="${g.num}" onclick="selectPlanGoal(${g.num},this)">
          <div class="goal-num">${g.num}</div>
          <div class="goal-title">${esc(g.title)}</div>
          <div class="goal-theme">${esc(g.theme||'')}</div>
          <div class="goal-desc">${esc(g.description||'')}</div>
        </div>`).join('');
      return `
        <div class="plan-hero">
          <div style="font-size:.8rem;opacity:.9">${esc(p.meta.title)} (${esc(p.meta.period)})</div>
          <div class="plan-vision">${esc(p.meta.vision)}</div>
          <div class="plan-sub">${esc(p.meta.vision_tagline||'')}</div>
          <div class="plan-meta">
            <span>発行: ${esc(p.meta.issued_date||'')}</span>
            <span>発行者: ${esc(p.meta.issued_by||'')}</span>
            <span>出典: ${esc(p.meta.source_document||'')}</span>
          </div>
        </div>
        <div class="plan-warn">
          <strong>⚠ この計画書について</strong><br>
          ${(p.meta.known_limitations||[]).map(l=>'・'+esc(l)).join('<br>')}<br>
          ・データは計画書本体から機械抽出したもので、正式情報は<a href="https://www.city.ito.shizuoka.jp/" target="_blank">伊東市公式サイト</a>をご確認ください。
        </div>

        <div class="plan-h3">🗺️ 伊東市が抱える9つのまちづくり課題<span class="plan-count">${p.machizukuri_kadai.length}</span></div>
        <div class="kadai-grid">${kadaiCards}</div>

        <div class="plan-h3">📉 将来人口推計</div>
        <div class="pop-box">
          ${popRows}
          <div class="pop-legend">
            <span class="lg-proj">社人研推計（このまま推移した場合）</span>
            <span class="lg-target">目標人口（総合計画の目指す値）</span>
          </div>
          <div class="pop-note">${esc(p.future_population.note||'')}</div>
        </div>

        <div class="plan-h3">🎯 5つの政策目標（クリックで施策を展開）</div>
        <div class="goals-grid">${goalCards}</div>
        <div id="plan-sub-detail" class="sub-detail"></div>

        ${memberPolicyMap ? `
        <div class="plan-h3">🗺️ 議員×施策マッピング<span class="plan-count">${memberPolicyMap.meta.total_matches}件</span></div>
        <div class="heat-disclaimer">
          <strong>⚠ このヒートマップの見方・限界</strong><br>
          ・動画タイトル・質問テキストに含まれる<strong>キーワードの機械的一致</strong>から「言及の有無」のみを示しています。<br>
          ・発言の<strong>賛否・質・評価は含みません</strong>。色の濃さは言及回数の多さであり、議員の優劣や貢献度ではありません。<br>
          ・文脈は必ず該当動画で確認してください。セルをクリックで関連動画を表示します。<br>
          ・字幕の文字起こし精度により、実際には発言していても検出されない / 逆に無関係な発言が混入する場合があります。
        </div>
        <div class="heat-controls">
          <label>並び順:</label>
          <select id="heat-sort" onchange="renderHeatmap()">
            <option value="coverage">言及施策数が多い順</option>
            <option value="mentions">総言及回数が多い順</option>
            <option value="name">議員名順</option>
          </select>
          <label>絞り込み:</label>
          <input type="text" id="heat-filter" placeholder="議員名..." oninput="renderHeatmap()">
        </div>
        <div class="heat-wrap" id="heat-wrap"></div>
        <div class="heat-legend">
          <span>言及回数:</span>
          <span><span class="lg-box heat-0"></span>0</span>
          <span><span class="lg-box heat-1"></span>1</span>
          <span><span class="lg-box heat-2"></span>2</span>
          <span><span class="lg-box heat-3"></span>3-4</span>
          <span><span class="lg-box heat-4"></span>5-9</span>
          <span><span class="lg-box heat-5"></span>10+</span>
        </div>
        ` : ''}
      `;
    })() : '<div style="text-align:center;padding:2rem;color:var(--sub)">総合計画データが見つかりません。data/sougoukeikaku_v5.json を生成してください。</div>'}
  </div>
  <!-- ヒートマップ詳細モーダル -->
  <div class="heat-modal" id="heat-modal" onclick="if(event.target===this)closeHeatModal()">
    <div class="heat-modal-box">
      <button class="heat-modal-close" onclick="closeHeatModal()">閉じる ✕</button>
      <div class="heat-modal-head" id="heat-modal-head"></div>
      <div class="heat-modal-sub" id="heat-modal-sub"></div>
      <div id="heat-modal-body"></div>
    </div>
  </div>
  <div id="tab-voice" class="tab-panel">
    <div class="voice-intro">
      <h3>💬 市民の声 — 伊東市政への提案・問題提起</h3>
      <p>伊東市の道路・福祉・観光・教育・防災など、市政について感じていることを匿名で投稿できます。投稿は運営者(大竹圭)の確認後に公開されます。建設的な議論の場として、ぜひご活用ください。</p>
    </div>
    <div class="voice-actions">
      <button class="voice-btn-post" onclick="openVoiceModal()">＋ 新しい投稿</button>
      <select class="voice-cat-filter" id="voice-cat" onchange="renderVoices()">
        <option value="">全カテゴリ</option>
        <option value="道路・交通">道路・交通</option>
        <option value="福祉・医療">福祉・医療</option>
        <option value="教育・子育て">教育・子育て</option>
        <option value="観光・経済">観光・経済</option>
        <option value="防災・安全">防災・安全</option>
        <option value="環境・衛生">環境・衛生</option>
        <option value="行政サービス">行政サービス</option>
        <option value="その他">その他</option>
      </select>
      <button class="voice-cat-filter" onclick="loadVoices()">🔄 更新</button>
    </div>
    <div id="voice-list" class="voice-list">
      <div class="voice-loading">投稿を読み込み中...</div>
    </div>

    <!-- サイト改善要望セクション -->
    <div class="site-feedback-section">
      <h3>💡 サイト改善要望</h3>
      <p>「みんなの伊東市」をもっと使いやすくするためのご意見・ご要望をお寄せください。いただいたご意見は運営者が確認し、改善に活かしていきます。</p>
      <div class="site-feedback-form">
        <div class="modal-form-row">
          <label>カテゴリ</label>
          <select id="site-fb-category">
            <option>機能の追加・改善</option>
            <option>データの誤り・不足</option>
            <option>デザイン・使いやすさ</option>
            <option>その他</option>
          </select>
        </div>
        <div class="modal-form-row">
          <label>ご要望・ご意見 * (500文字以内)</label>
          <textarea id="site-fb-text" maxlength="500" rows="4" placeholder="例：○○議員の質問データが古い、スマホで見づらい、こんな機能がほしい など" oninput="document.getElementById('site-fb-count').textContent=this.value.length+'/500'"></textarea>
          <div class="char-count" id="site-fb-count">0/500</div>
        </div>
        <button class="voice-btn-post" onclick="submitSiteFeedback()" id="site-fb-btn" style="width:100%;margin-top:.5rem">送信する</button>
        <div id="site-fb-result" style="display:none;margin-top:.6rem;padding:.6rem .8rem;border-radius:8px;font-size:.82rem"></div>
      </div>
    </div>
  </div>

  <!-- 投稿モーダル -->
  <div class="modal-overlay" id="voice-modal">
    <div class="modal-box">
      <h2>市政への投稿</h2>
      <div class="modal-rules">
        <strong>⚠ 投稿前に必ずお読みください</strong>
        以下の内容を含む投稿は<strong>削除・通報の対象</strong>となります：
        <ul>
          <li>特定の個人(議員・市職員・市民)への誹謗中傷</li>
          <li>個人情報(氏名・住所・電話番号など)の記載</li>
          <li>差別的・侮蔑的な表現</li>
          <li>虚偽の情報・デマ</li>
          <li>営業・宣伝・スパム・選挙運動</li>
          <li>わいせつな内容</li>
        </ul>
        悪質な投稿(脅迫・名誉毀損等)については、IPアドレス・接続情報をもとに<strong>伊東警察署および静岡県警サイバー犯罪対策課への被害届提出、発信者情報開示請求</strong>を行う場合があります。
      </div>
      <form id="voice-form" onsubmit="submitVoice(event)">
        <div class="modal-form-row">
          <label>カテゴリ *</label>
          <select name="category" required>
            <option value="">選択してください</option>
            <option value="道路・交通">道路・交通</option>
            <option value="福祉・医療">福祉・医療</option>
            <option value="教育・子育て">教育・子育て</option>
            <option value="観光・経済">観光・経済</option>
            <option value="防災・安全">防災・安全</option>
            <option value="環境・衛生">環境・衛生</option>
            <option value="行政サービス">行政サービス</option>
            <option value="その他">その他</option>
          </select>
        </div>
        <div class="modal-form-row">
          <label>タイトル * (50文字以内)</label>
          <input type="text" name="title" maxlength="50" required oninput="updateCharCount(this,'tc')">
          <div class="char-count" id="tc">0/50</div>
        </div>
        <div class="modal-form-row">
          <label>本文 * (500文字以内)</label>
          <textarea name="body" maxlength="500" required oninput="updateCharCount(this,'bc')"></textarea>
          <div class="char-count" id="bc">0/500</div>
        </div>
        <div class="modal-form-row">
          <label>ニックネーム (任意・空欄なら「匿名」)</label>
          <input type="text" name="nickname" maxlength="20">
        </div>
        <div class="modal-form-row">
          <label>居住地区 (任意)</label>
          <select name="area">
            <option value="">未指定</option>
            <option value="湯川">湯川</option>
            <option value="松原">松原</option>
            <option value="玖須美">玖須美</option>
            <option value="鎌田">鎌田</option>
            <option value="大原">大原</option>
            <option value="宇佐美">宇佐美</option>
            <option value="川奈">川奈</option>
            <option value="池">池</option>
            <option value="十足">十足</option>
            <option value="赤沢">赤沢</option>
            <option value="伊東市内その他">伊東市内その他</option>
            <option value="市外">市外</option>
          </select>
        </div>
        <div class="modal-agree">
          <input type="checkbox" id="agree" required>
          <label for="agree">上記の禁止事項・通報方針をすべて読み、同意します。投稿内容は公開され、IPアドレス等の接続情報が記録されることを了承します。</label>
        </div>
        <div class="modal-buttons">
          <button type="button" class="modal-cancel" onclick="closeVoiceModal()">キャンセル</button>
          <button type="submit" class="modal-submit" id="voice-submit-btn">投稿する</button>
        </div>
        <div id="voice-msg"></div>
      </form>
    </div>
  </div>

  <div id="tab-stats" class="tab-panel">
    <!-- 議会カレンダー -->
    <div class="council-calendar" id="council-calendar">
      <div class="cal-header">🗓️ 議会スケジュール</div>
      <div class="cal-next" id="cal-next"></div>
      <div class="cal-schedule">
        <div class="cal-item" data-month="3"><span class="cal-month">3月</span><span class="cal-label">${glossary('定例会')}（予算審議）</span></div>
        <div class="cal-item" data-month="6"><span class="cal-month">6月</span><span class="cal-label">${glossary('定例会')}</span></div>
        <div class="cal-item" data-month="9"><span class="cal-month">9月</span><span class="cal-label">${glossary('定例会')}（決算審査）</span></div>
        <div class="cal-item" data-month="12"><span class="cal-month">12月</span><span class="cal-label">${glossary('定例会')}</span></div>
      </div>
    </div>
    <h3 class="section-title">議員比較</h3>
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

    <div style="margin-top:2rem;padding-top:1.5rem;border-top:2px solid #e5e7eb">
      <h3 class="section-title">年別トレンド</h3>
      <div id="trend-embed"></div>
    </div>

    <div style="margin-top:2rem;padding-top:1.5rem;border-top:2px solid #e5e7eb">
      <h3 class="section-title">基本統計</h3>
    </div>
    <div class="stats-panel">
      <div class="stats-box">
        <h3>種別ごとの動画数</h3>
        ${Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([t,c])=>{
          const p=(c/videos.length*100).toFixed(1);
          const cl=t==='一般質問'?'#2563eb':t==='大綱質疑'?'#27ae60':t==='補正予算審議'?'#e67e22':'#95a5a6';
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
            '教育・子育て': '#2563eb', '行財政・議会': '#1d4ed8', '観光・経済': '#e67e22',
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

<!-- コンシェルジュチャットボット（全ページ共通・フロート型） -->
<button class="concierge-fab" id="concierge-fab" onclick="conciergeToggle()" aria-label="AIコンシェルジュに質問">
  <span id="concierge-fab-icon">💬</span>
  <span class="concierge-fab-label" id="concierge-fab-label">AIに聞く</span>
</button>
<div class="concierge-panel" id="concierge-panel" role="dialog" aria-label="AIコンシェルジュ">
  <div class="concierge-header">
    <div class="concierge-header-icon">🏙️</div>
    <div class="concierge-header-text">
      <div class="concierge-title">みんなの伊東市 AIコンシェルジュ</div>
      <div class="concierge-subtitle">議員・質問・総合計画などサイト全体を案内します</div>
    </div>
    <button class="concierge-close" onclick="conciergeToggle()" aria-label="閉じる">✕</button>
  </div>
  <div class="concierge-body" id="concierge-body">
    <div class="concierge-disclaimer">
      <strong>⚠ ご利用にあたって</strong><br>
      ・本サイト掲載情報（議員・質問・総合計画）のみを根拠に回答します。<br>
      ・質問要約は自動字幕の機械抽出、議員評価は行いません。<br>
      ・正確な情報は<a href="https://www.city.ito.shizuoka.jp/" target="_blank">伊東市公式</a>・<a href="https://www.city.ito.shizuoka.jp/gyosei/shiseijoho/itoshigikai/index.html" target="_blank">市議会公式</a>でご確認ください。
    </div>
    <div class="concierge-msg bot">こんにちは！「みんなの伊東市」AIコンシェルジュです 🏙️<br>議員情報・質問ランキング・会派・総合計画など、サイトに掲載された情報について日本語で質問してください。</div>
    <div class="concierge-samples" id="concierge-samples">
      <button class="concierge-sample" onclick="conciergeAsk('質問数が多い議員は誰ですか？')">質問数ランキング</button>
      <button class="concierge-sample" onclick="conciergeAsk('伊東市議会の会派構成を教えて')">会派構成</button>
      <button class="concierge-sample" onclick="conciergeAsk('伊東市のこれからの人口はどうなりますか？')">将来人口</button>
      <button class="concierge-sample" onclick="conciergeAsk('防災対策について教えて')">防災対策</button>
      <button class="concierge-sample" onclick="conciergeAsk('子育て支援はどうなっていますか？')">子育て支援</button>
      <button class="concierge-sample" onclick="conciergeAsk('このサイトは何ができますか？')">サイトの使い方</button>
    </div>
  </div>
  <div class="concierge-footer">
    <div class="concierge-inputwrap">
      <textarea class="concierge-input" id="concierge-input" maxlength="300" placeholder="質問を入力..." rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();conciergeSend();}"></textarea>
      <button class="concierge-send" id="concierge-send-btn" onclick="conciergeSend()">送信</button>
    </div>
    <div class="concierge-counter"><span id="concierge-counter">0</span> / 300　<span style="opacity:.6">Enterで送信</span></div>
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

  <h4>9. 「市民の声」投稿機能について</h4>
  <ul>
    <li><strong>承認制：</strong>投稿は運営者が確認後、承認されたもののみが公開されます。投稿即時公開ではありません。</li>
    <li><strong>禁止事項：</strong>特定の個人(議員・市職員・市民)への誹謗中傷、個人情報の記載、差別的表現、虚偽情報、営業・宣伝、わいせつ表現、選挙運動等は禁止します。該当する投稿は予告なく削除します。</li>
    <li><strong>記録される情報：</strong>投稿者のIPアドレス、ブラウザ情報、投稿日時、投稿内容のハッシュ値を保存します。これらは公開されませんが、悪質な投稿への対応のため永続的に保存されます。</li>
    <li><strong>悪質投稿への対応：</strong>脅迫・名誉毀損・威力業務妨害等に該当すると判断した投稿については、保存している接続情報をもとに、<strong>伊東警察署および静岡県警察本部サイバー犯罪対策課への被害届提出、ならびにプロバイダ責任制限法に基づく発信者情報開示請求</strong>を行う場合があります。</li>
    <li><strong>運営者の責任：</strong>プロバイダ責任制限法第3条に基づき、運営者は権利侵害のある投稿を認識した後、速やかに削除等の対応を行います。</li>
    <li><strong>削除依頼：</strong>掲載中の投稿について削除をご希望の場合は ka@oh-life.co.jp までご連絡ください。</li>
    <li><strong>免責：</strong>投稿内容の真実性・正確性について運営者は一切の責任を負いません。投稿は投稿者個人の意見であり、運営者の見解ではありません。</li>
  </ul>

  <h4>10. お問い合わせ・情報の修正・削除について</h4>
  <p>掲載内容に誤りを発見された場合、掲載情報の修正・削除のご希望、またはご意見・ご感想等がございましたら、下記までご連絡ください。確認の上、速やかに対応いたします。</p>
  <ul>
    <li><strong>メール:</strong> <a href="mailto:ka@oh-life.co.jp" style="color:var(--accent)">ka@oh-life.co.jp</a></li>
    <li><strong>お問い合わせフォーム:</strong> <span style="color:var(--sub)">準備中</span></li>
    <li><strong>運営:</strong> 大竹圭（伊東市議会議員）</li>
  </ul>

  <div class="disc-note">本免責事項は予告なく変更される場合があります。最終更新: ${new Date().toLocaleDateString('ja-JP')}</div>
</div>
<!-- ダイジェストメール登録 -->
<div class="newsletter-section" id="newsletter">
  <div class="newsletter-inner">
    <div class="newsletter-text">
      <h3>📬 みんなの伊東市ダイジェスト</h3>
      <p>月1回、議会の動きをメールでお届けします。新着動画・話題のテーマ・質問数ランキングなど。</p>
    </div>
    <div class="newsletter-form">
      <input type="email" id="nl-email" class="nl-input" placeholder="メールアドレスを入力">
      <button class="nl-btn" onclick="subscribeNewsletter()">登録する</button>
    </div>
    <div id="nl-result" style="display:none;font-size:.78rem;margin-top:.4rem"></div>
    <p class="nl-note">※ いつでも配信停止可能です。メールアドレスはダイジェスト配信以外には使用しません。</p>
  </div>
</div>
<footer>
  <div>データ出典: <a href="https://www.youtube.com/channel/UC9FGDfo93b_dpu_7-AnN4wQ" target="_blank" style="color:var(--accent)">伊東市議会インターネット中継放送</a> | <a href="https://www.city.ito.shizuoka.jp/gyosei/shiseijoho/itoshigikai/index.html" target="_blank" style="color:var(--accent)">伊東市議会HP</a></div>
  <div style="margin-top:.3rem">制作・運営: 伊東市議会議員 大竹圭 ｜ 最終更新: ${new Date().toLocaleDateString('ja-JP')}</div>
</footer>
<script>
// === はじめてガイド ===
(function(){
  if(!localStorage.getItem('ito_welcomed')){
    document.getElementById('welcome-overlay').style.display='flex';
  }
})();
function closeWelcome(dontShow){
  document.getElementById('welcome-overlay').style.display='none';
  if(dontShow) localStorage.setItem('ito_welcomed','1');
}
function welcomeGo(target){
  closeWelcome(false);
  localStorage.setItem('ito_welcomed','1');
  if(target==='members'){
    switchTab('members',document.querySelector('nav button:nth-child(1)'));
  } else if(target==='theme'){
    switchTab('all',document.querySelector('nav button:nth-child(2)'));
    setTimeout(()=>document.getElementById('v-search')?.focus(),300);
  } else if(target==='voice'){
    switchTab('voice',document.querySelector('nav button:nth-child(4)'));
  }
}

// === 用語解説ツールチップ ===
const GLOSSARY={
  '一般質問':'議員が市長に対し、市政全般について質問すること。定例会ごとに行われます。',
  '大綱質疑':'予算案の大枠について、会派の代表者が質問すること。個人ではなく会派単位で行います。',
  '補正予算':'年度途中で当初予算を変更すること。緊急の事業や国の補助金対応などで必要になります。',
  '付託':'議案や請願を、専門の委員会に審査を委ねること。本会議で採決する前に詳しく検討します。',
  '委員会':'議案を専門的に審査するための少人数の会議。総務、観光建設、福祉文教などがあります。',
  '会派':'政策や考えが近い議員のグループ。国政政党とは異なる場合があります。',
  '定例会':'年4回（3月・6月・9月・12月）定期的に開かれる議会のこと。',
  '請願':'市民が議会に対して要望を文書で提出すること。議員の紹介が必要です。',
  '陳情':'市民が議会に意見・要望を伝えること。請願と異なり、議員の紹介は不要です。',
  '採決':'議案について賛成・反対を決めること。過半数で可決されます。',
  '質問要約':'議会動画から、質問内容をAIが自動要約したものです。',
  '総合計画':'市の将来像と、それを実現するための基本方針をまとめた長期計画（10年間）。',
};
function initGlossary(){
  document.querySelectorAll('.glossary-term').forEach(el=>{
    el.setAttribute('tabindex','0');
    el.setAttribute('role','button');
    el.setAttribute('aria-label',el.dataset.term+'の説明');
  });
}
document.addEventListener('DOMContentLoaded', initGlossary);

// === 訪問者カウンター ===
(function(){
  var api = typeof VOICE_API !== 'undefined' ? VOICE_API : '';
  if(!api) return;
  fetch(api+'/pageview',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
    .then(function(r){return r.json()})
    .then(function(d){
      if(d.ok){
        var el=document.getElementById('visitor-counter');
        if(el){
          document.getElementById('vc-total').textContent=d.totalVisitors.toLocaleString();
          document.getElementById('vc-today').textContent=d.todayVisitors.toLocaleString();
          el.style.display='flex';
        }
      }
    })
    .catch(function(){});
})();

// === 質問一覧タイムライン ===
function toggleQtlResp(name, idx){
  var short=document.getElementById('qtl-rs-'+name+'-'+idx);
  var full=document.getElementById('qtl-rf-'+name+'-'+idx);
  var btn=full.nextElementSibling;
  if(full.style.display==='none'){
    full.style.display='block'; short.style.display='none';
    btn.textContent='閉じる';
  } else {
    full.style.display='none'; short.style.display='block';
    btn.textContent='全文を表示';
  }
}
function filterQtl(input, name){
  var kw=input.value.toLowerCase();
  var cards=document.querySelectorAll('#qtl-'+name+' .qtl-card');
  var shown=0;
  cards.forEach(function(c){
    var match=!kw||c.textContent.toLowerCase().indexOf(kw)>=0;
    c.classList.toggle('hidden',!match);
    if(match) shown++;
  });
  document.getElementById('qtl-count-'+name).textContent=shown+'件を表示中';
}
function filterQtlType(sel, name){
  var type=sel.value;
  var cards=document.querySelectorAll('#qtl-'+name+' .qtl-card');
  var shown=0;
  cards.forEach(function(c){
    var cardType=c.querySelector('.qtl-type').textContent;
    var match=!type||cardType===type;
    c.classList.toggle('hidden',!match);
    if(match) shown++;
  });
  document.getElementById('qtl-count-'+name).textContent=shown+'件を表示中';
}

// === アクセシビリティ ===
function toggleFontSize(){
  document.body.classList.toggle('font-large');
  localStorage.setItem('ito_fontlarge', document.body.classList.contains('font-large')?'1':'0');
}
(function(){
  if(localStorage.getItem('ito_fontlarge')==='1') document.body.classList.add('font-large');
})();

// === 議会カレンダー ===
(function(){
  var sessions=[{m:3,label:'3月定例会（予算審議）'},{m:6,label:'6月定例会'},{m:9,label:'9月定例会（決算審査）'},{m:12,label:'12月定例会'}];
  var now=new Date();
  var cm=now.getMonth()+1;
  var nextIdx=sessions.findIndex(function(s){return s.m>=cm});
  if(nextIdx===-1) nextIdx=0;
  var next=sessions[nextIdx];
  var calNext=document.getElementById('cal-next');
  if(calNext){
    var monthsUntil=next.m>=cm ? next.m-cm : 12-cm+next.m;
    calNext.innerHTML=monthsUntil<=1
      ? '📢 まもなく <strong>'+next.label+'</strong> が始まります'
      : '📅 次の議会: <strong>'+next.label+'</strong>（約'+monthsUntil+'ヶ月後）';
  }
  document.querySelectorAll('.cal-item').forEach(function(el){
    var m=parseInt(el.dataset.month);
    if(m===next.m) el.classList.add('is-next');
    else if((m<cm && cm<=12 && next.m>=cm) || (next.m<cm && m<next.m)) el.classList.add('is-past');
  });
})();

// === パーソナライズ ===
function toggleInterest(btn){btn.classList.toggle('selected')}
function saveInterests(){
  const sel=[...document.querySelectorAll('.p-tag.selected')].map(b=>b.dataset.cat);
  localStorage.setItem('ito_interests',JSON.stringify(sel));
  document.getElementById('p-status').textContent=sel.length>0?sel.join('・')+' を保存しました。関連議員が上部に表示されます。':'テーマ選択がクリアされました。';
  applyPersonalize();
}
function applyPersonalize(){
  const stored=localStorage.getItem('ito_interests');
  if(!stored) return;
  const interests=JSON.parse(stored);
  if(!interests.length) return;
  // タグのUI復元
  document.querySelectorAll('.p-tag').forEach(b=>{
    if(interests.includes(b.dataset.cat)) b.classList.add('selected');
  });
  // 議員カードに「おすすめ」バッジ追加
  const cards=document.querySelectorAll('.m-card');
  cards.forEach(card=>{
    const cats=[...card.querySelectorAll('.cat-pill')].map(e=>e.textContent.trim());
    const match=cats.some(c=>interests.includes(c));
    if(match){
      if(!card.querySelector('.recommend-badge')){
        const badge=document.createElement('div');
        badge.className='recommend-badge';
        badge.textContent='⭐ おすすめ';
        badge.style.cssText='background:#7c3aed;color:#fff;font-size:.65rem;padding:.15rem .4rem;border-radius:6px;display:inline-block;margin-bottom:.3rem;font-weight:700';
        card.prepend(badge);
      }
    }
  });
}
document.addEventListener('DOMContentLoaded',applyPersonalize);

// === ニュースレター登録 ===
async function subscribeNewsletter(){
  const email=document.getElementById('nl-email').value.trim();
  const result=document.getElementById('nl-result');
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    result.style.display='block';result.style.color='#fca5a5';result.textContent='有効なメールアドレスを入力してください。';return;
  }
  try{
    const resp=await fetch(VOICE_API+'/newsletter',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:email,action:'subscribe'})
    });
    const data=await resp.json();
    result.style.display='block';
    if(data.ok){
      result.style.color='#86efac';result.textContent='登録ありがとうございます！次回のダイジェストをお届けします。';
      document.getElementById('nl-email').value='';
    } else {
      result.style.color='#fca5a5';result.textContent=data.error||'登録に失敗しました。';
    }
  }catch(e){
    result.style.display='block';result.style.color='#fca5a5';result.textContent='通信エラー: '+e.message;
  }
}

// === テーマで探す ===
function themeSearch(keywords){
  document.querySelectorAll('.theme-btn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  const input=document.getElementById('v-search');
  // スペース区切りの最初のキーワードで検索（ORフィルタ）
  input.value=keywords.split(' ')[0];
  input.dataset.themeKeywords=keywords;
  filterVids();
}

const COMPARE_DATA = ${JSON.stringify(compareData)};
const SEARCH_INDEX = ${JSON.stringify(searchIndex)};
const CAT_COLORS = ${JSON.stringify(catColors)};
const SUB_POLICIES = ${JSON.stringify(sougouPlan ? sougouPlan.sub_policies : [])};
const MEMBER_POLICY_MAP = ${JSON.stringify(memberPolicyMap || null)};
function heatLevel(n){ if(!n)return 0; if(n===1)return 1; if(n===2)return 2; if(n<=4)return 3; if(n<=9)return 4; return 5; }
function renderHeatmap(){
  if(!MEMBER_POLICY_MAP)return;
  const wrap = document.getElementById('heat-wrap');
  if(!wrap)return;
  const sortKey = document.getElementById('heat-sort')?.value || 'coverage';
  const filter = (document.getElementById('heat-filter')?.value || '').trim();
  let members = Object.keys(MEMBER_POLICY_MAP.member_map);
  if(filter) members = members.filter(m=>m.includes(filter));
  const cov = MEMBER_POLICY_MAP.member_coverage;
  if(sortKey==='coverage') members.sort((a,b)=>cov[b].mentioned_sub_count-cov[a].mentioned_sub_count);
  else if(sortKey==='mentions') members.sort((a,b)=>cov[b].total_mentions-cov[a].total_mentions);
  else members.sort((a,b)=>a.localeCompare(b,'ja'));
  // 列はSUB_POLICIES順
  const goalHeaderMap = {};
  SUB_POLICIES.forEach(s=>{ const k=s.goal_num||'base'; if(!goalHeaderMap[k])goalHeaderMap[k]=[]; goalHeaderMap[k].push(s); });
  let html = '<table class="heat-table"><thead><tr><th class="member-col">議員 ('+members.length+'名)</th>';
  SUB_POLICIES.forEach(s=>{
    html += '<th title="'+escHtml(s.id+' '+s.title)+'">'+escHtml(s.title)+'</th>';
  });
  html += '<th class="goal-sep">計</th></tr></thead><tbody>';
  members.forEach(m=>{
    html += '<tr><td class="member-col" title="'+escHtml(m)+'">'+escHtml(m)+'</td>';
    SUB_POLICIES.forEach(s=>{
      const cell = MEMBER_POLICY_MAP.member_map[m]?.[s.id];
      const n = cell?.count || 0;
      const lvl = heatLevel(n);
      html += '<td class="heat-'+lvl+'"><div class="heat-cell" data-m="'+escHtml(m)+'" data-s="'+s.id+'" onclick="openHeatCell(this)" title="'+escHtml(m)+' × '+escHtml(s.title)+' : '+n+'回">'+(n||'')+'</div></td>';
    });
    html += '<td class="goal-sep">'+(cov[m]?.mentioned_sub_count||0)+'</td></tr>';
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}
function openHeatCell(el){
  const m = el.dataset.m, subId = el.dataset.s;
  const cell = MEMBER_POLICY_MAP.member_map[m]?.[subId];
  const sub = SUB_POLICIES.find(s=>s.id===subId);
  const head = document.getElementById('heat-modal-head');
  const subEl = document.getElementById('heat-modal-sub');
  const body = document.getElementById('heat-modal-body');
  head.textContent = m + ' × ' + (sub?.title || subId);
  if(!cell || cell.count===0){
    subEl.textContent = '';
    body.innerHTML = '<div style="padding:1rem;text-align:center;color:#888">該当施策に関する言及は検出されませんでした。<br><small>※キーワード機械一致の結果です。実際の発言はあるかもしれません。</small></div>';
  } else {
    subEl.innerHTML = '言及回数: <strong>'+cell.count+'回</strong>（全'+cell.videos.length+'件中 直近 '+Math.min(cell.videos.length,5)+' 件を表示）';
    body.innerHTML = cell.videos.map(v=>{
      const kws = (v.matchedKeywords||[]).slice(0,4).map(k=>'<span class="heat-vid-kw">'+escHtml(k)+'</span>').join(' ');
      return '<a href="'+escHtml(v.url||'#')+'" target="_blank" class="heat-vid-item">'+
        '<div class="heat-vid-title">'+escHtml(v.title||v.videoId)+'</div>'+
        '<div class="heat-vid-meta">'+(v.date?'<span>'+escHtml(v.date)+'</span>':'')+
        '<span>'+escHtml(v.sessionType||'')+'</span>'+kws+'</div></a>';
    }).join('');
  }
  document.getElementById('heat-modal').classList.add('open');
}
function closeHeatModal(){ document.getElementById('heat-modal').classList.remove('open'); }
function selectPlanGoal(num,btn){
  document.querySelectorAll('.goal-card').forEach(c=>c.classList.remove('selected'));
  btn.classList.add('selected');
  const subs = SUB_POLICIES.filter(s=>s.goal_num===num);
  const area = document.getElementById('plan-sub-detail');
  if(!subs.length){ area.innerHTML='<div style="text-align:center;color:#888;padding:1rem">該当する施策がありません</div>'; return; }
  area.innerHTML = '<div class="plan-h3">▼ 政策目標'+num+'の施策 <span class="plan-count">'+subs.length+'</span></div>' +
    subs.map((s,i)=>{
      const cs = (s.current_state||[]).map(x=>'<li>'+escHtml(x)+'</li>').join('');
      const ch = (s.challenges||[]).map(x=>'<li>'+escHtml(x)+'</li>').join('');
      const kp = (s.kpis_raw||[]).map(k=>'<div class="kpi-raw">'+escHtml(k.raw||'')+'</div>').join('');
      return '<div class="sub-card" id="sub-'+s.id+'">'+
        '<div class="sub-head" onclick="this.parentElement.classList.toggle(\\'open\\')">'+
          '<div><span class="sub-head-id">'+escHtml(s.id)+'</span><span class="sub-head-title">'+escHtml(s.title)+'</span></div>'+
          '<span class="sub-toggle">▼</span>'+
        '</div>'+
        '<div class="sub-body">'+
          (cs?'<div class="sub-section"><div class="sub-label">現状</div><ul class="sub-list">'+cs+'</ul></div>':'')+
          (ch?'<div class="sub-section"><div class="sub-label challenge">課題</div><ul class="sub-list">'+ch+'</ul></div>':'')+
          (kp?'<div class="sub-section"><div class="sub-label kpi">KPI（原文）</div>'+kp+'</div>':'')+
        '</div>'+
      '</div>';
    }).join('');
  area.scrollIntoView({behavior:'smooth',block:'start'});
}
/* ========== コンシェルジュ・チャットボット（全ページ共通） ========== */
function conciergeEscHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function conciergeToggle(){
  const panel=document.getElementById('concierge-panel');
  const fab=document.getElementById('concierge-fab');
  const icon=document.getElementById('concierge-fab-icon');
  const label=document.getElementById('concierge-fab-label');
  if(!panel || !fab) return;
  const isOpen=panel.classList.toggle('open');
  fab.classList.toggle('open', isOpen);
  if(icon) icon.textContent = isOpen ? '✕' : '💬';
  if(label) label.style.display = isOpen ? 'none' : '';
  if(isOpen){
    setTimeout(()=>{
      const input=document.getElementById('concierge-input');
      if(input) input.focus();
    }, 250);
  }
}
function conciergeAppendMsg(text, cls){
  const body=document.getElementById('concierge-body');
  if(!body) return null;
  const div=document.createElement('div');
  div.className='concierge-msg '+(cls||'bot');
  div.textContent=text;
  body.appendChild(div);
  body.scrollTop=body.scrollHeight;
  return div;
}
function conciergeHideSamples(){
  const s=document.getElementById('concierge-samples');
  if(s) s.style.display='none';
}
function conciergeAsk(q){
  const panel=document.getElementById('concierge-panel');
  if(panel && !panel.classList.contains('open')) conciergeToggle();
  const input=document.getElementById('concierge-input');
  if(input){ input.value=q; conciergeUpdateCounter(); }
  conciergeSend();
}
function conciergeUpdateCounter(){
  const ta=document.getElementById('concierge-input');
  const c=document.getElementById('concierge-counter');
  if(ta && c) c.textContent=ta.value.length;
}
async function conciergeSend(){
  const ta=document.getElementById('concierge-input');
  const btn=document.getElementById('concierge-send-btn');
  const body=document.getElementById('concierge-body');
  if(!ta || !btn || !body) return;
  const q=ta.value.trim();
  if(q.length<2){ conciergeAppendMsg('質問を2文字以上入力してください。','err'); return; }
  if(q.length>300){ conciergeAppendMsg('質問は300文字以内でお願いします。','err'); return; }
  conciergeHideSamples();
  conciergeAppendMsg(q,'user');
  ta.value=''; conciergeUpdateCounter();
  btn.disabled=true; btn.textContent='…';
  const loading=document.createElement('div');
  loading.className='concierge-loading';
  loading.innerHTML='<div class="concierge-spinner"></div>サイト情報を検索中...';
  body.appendChild(loading);
  body.scrollTop=body.scrollHeight;
  try{
    const resp=await fetch(VOICE_API+'/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question:q})
    });
    const data=await resp.json();
    loading.remove();
    if(!resp.ok || !data.ok){
      const msg=data && data.error ? data.error : ('エラー: '+resp.status);
      conciergeAppendMsg('❌ '+msg,'err');
    } else {
      conciergeAppendMsg(data.answer || '(応答なし)','bot');
    }
  }catch(e){
    loading.remove();
    conciergeAppendMsg('❌ 通信エラー: '+(e.message||String(e)),'err');
  }finally{
    btn.disabled=false; btn.textContent='送信';
    ta.focus();
  }
}
// 入力カウンタのリスナー登録
document.addEventListener('DOMContentLoaded',()=>{
  const ta=document.getElementById('concierge-input');
  if(ta) ta.addEventListener('input', conciergeUpdateCounter);
});
// サイト改善要望（市民の声タブ内）
async function submitSiteFeedback(){
  const text=document.getElementById('site-fb-text').value.trim();
  const cat=document.getElementById('site-fb-category').value;
  const btn=document.getElementById('site-fb-btn');
  const result=document.getElementById('site-fb-result');
  if(text.length<5){ result.style.display='block'; result.style.background='#fef2f2'; result.style.color='#a33'; result.textContent='5文字以上でご入力ください。'; return; }
  btn.disabled=true; btn.textContent='送信中...';
  try{
    const resp=await fetch(VOICE_API+'/feedback',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({feedback:text,category:cat})
    });
    const data=await resp.json();
    result.style.display='block';
    if(data.ok){
      result.style.background='#f0fdf4'; result.style.color='#166534';
      result.textContent='ご要望を受け付けました。ありがとうございます！';
      document.getElementById('site-fb-text').value='';
      document.getElementById('site-fb-count').textContent='0/500';
    } else {
      result.style.background='#fef2f2'; result.style.color='#a33';
      result.textContent=data.error||'送信に失敗しました';
    }
  }catch(e){
    result.style.display='block'; result.style.background='#fef2f2'; result.style.color='#a33';
    result.textContent='通信エラー: '+e.message;
  }finally{
    btn.disabled=false; btn.textContent='送信する';
  }
}
let vCount=30;
function switchTab(id,btn){
  document.querySelectorAll('.tab-panel').forEach(e=>e.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(e=>{e.classList.remove('active');e.setAttribute('aria-selected','false')});
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  btn.setAttribute('aria-selected','true');
  if(id==='all'){vCount=30;showVids();}
  if(id==='voice' && !voicesLoaded){loadVoices();}
  if(id==='plan'){ renderHeatmap(); }
  if(id==='stats'){
    // トレンドチャートをstatsタブ内に移動（初回のみ）
    const embed=document.getElementById('trend-embed');
    if(embed && !embed.hasChildNodes()){
      const src=document.getElementById('tab-trend');
      if(src){ embed.innerHTML=src.innerHTML; }
    }
  }
}

// ============ 市民の声タブ ============
const VOICE_API='https://ito-voice.bmwrllsor-ko.workers.dev'; // Cloudflare Worker
const VOICE_CAT_COLORS={
  '道路・交通':'#3498db','福祉・医療':'#e91e63','教育・子育て':'#9b59b6',
  '観光・経済':'#f39c12','防災・安全':'#e74c3c','環境・衛生':'#27ae60',
  '行政サービス':'#34495e','その他':'#95a5a6'
};
let voiceData=[];
let voicesLoaded=false;
async function loadVoices(){
  const list=document.getElementById('voice-list');
  list.innerHTML='<div class="voice-loading">投稿を読み込み中...</div>';
  try{
    const res=await fetch(VOICE_API+'/posts');
    if(!res.ok)throw new Error('読み込み失敗');
    const data=await res.json();
    voiceData=data.posts||[];
    voicesLoaded=true;
    renderVoices();
  }catch(e){
    list.innerHTML='<div class="voice-empty">投稿の読み込みに失敗しました。バックエンドが設定されていない可能性があります。<br><small>'+escHtml(e.message)+'</small></div>';
  }
}
function renderVoices(){
  const list=document.getElementById('voice-list');
  const cat=document.getElementById('voice-cat').value;
  const filtered=cat?voiceData.filter(v=>v.category===cat):voiceData;
  if(filtered.length===0){
    list.innerHTML='<div class="voice-empty">まだ投稿はありません。最初の投稿をしてみませんか？</div>';
    return;
  }
  list.innerHTML=filtered.map(v=>{
    const col=VOICE_CAT_COLORS[v.category]||'#95a5a6';
    return '<div class="voice-item" style="border-left-color:'+col+'">'
      +'<div class="voice-item-head"><span class="voice-cat-pill" style="background:'+col+'">'+escHtml(v.category)+'</span></div>'
      +'<div class="voice-title">'+escHtml(v.title)+'</div>'
      +'<div class="voice-body">'+escHtml(v.body)+'</div>'
      +'<div class="voice-meta"><span>— '+escHtml(v.nickname||'匿名')+'さん</span>'+(v.area?'<span>'+escHtml(v.area)+'</span>':'')+'<span>'+escHtml(v.date)+'</span></div>'
      +'</div>';
  }).join('');
}
function openVoiceModal(){
  document.getElementById('voice-modal').classList.add('open');
  document.getElementById('voice-msg').innerHTML='';
  document.getElementById('voice-form').reset();
  document.getElementById('tc').textContent='0/50';
  document.getElementById('bc').textContent='0/500';
}
function closeVoiceModal(){
  document.getElementById('voice-modal').classList.remove('open');
}
function updateCharCount(el,id){
  document.getElementById(id).textContent=el.value.length+'/'+el.maxLength;
}
async function submitVoice(e){
  e.preventDefault();
  const form=e.target;
  const btn=document.getElementById('voice-submit-btn');
  const msg=document.getElementById('voice-msg');
  btn.disabled=true;
  msg.innerHTML='<div class="modal-msg">送信中...</div>';
  const fd=new FormData(form);
  const payload={
    category:fd.get('category'),
    title:fd.get('title'),
    body:fd.get('body'),
    nickname:fd.get('nickname'),
    area:fd.get('area'),
    agreed:document.getElementById('agree').checked,
  };
  try{
    const res=await fetch(VOICE_API+'/submit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),
    });
    const result=await res.json();
    if(result.ok){
      msg.innerHTML='<div class="modal-msg success">'+escHtml(result.message||'投稿を受け付けました')+'</div>';
      setTimeout(()=>{closeVoiceModal();loadVoices();},2500);
    }else{
      msg.innerHTML='<div class="modal-msg error">'+escHtml(result.error||'送信に失敗しました')+'</div>';
      btn.disabled=false;
    }
  }catch(err){
    msg.innerHTML='<div class="modal-msg error">通信エラー: '+escHtml(err.message)+'</div>';
    btn.disabled=false;
  }
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
  const input=document.getElementById('v-search');
  const sq=input.value.toLowerCase();
  const themeKw=input.dataset.themeKeywords;
  let shown=0;
  items.forEach(el=>{
    const mt=!tf||el.dataset.type===tf;
    let ms;
    if(themeKw&&sq){
      const kws=themeKw.toLowerCase().split(' ');
      const txt=el.textContent.toLowerCase();
      ms=kws.some(k=>txt.includes(k));
    } else {
      ms=!sq||el.textContent.toLowerCase().includes(sq);
    }
    if(mt&&ms&&shown<vCount){el.classList.add('vis');shown++}
    else{el.classList.remove('vis')}
  });
  document.getElementById('load-btn').style.display=shown>=vCount?'':'none';
}
function filterVids(){
  const input=document.getElementById('v-search');
  if(!input.dataset.themeKeywords || !input.value) delete input.dataset.themeKeywords;
  vCount=30;showVids();
}
function loadMore(){vCount+=30;showVids();}
document.addEventListener('DOMContentLoaded',()=>{showVids();});
</script>
</body>
</html>`;

fs.writeFileSync('index.html', html);
console.log('HTML生成完了: ' + (html.length/1024).toFixed(0) + 'KB');
