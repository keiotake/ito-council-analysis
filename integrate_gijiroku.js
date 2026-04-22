// 議事録データとYouTube動画データを統合
// - 議事録は信頼できる発言記録（ground truth）
// - YouTube動画は補助的に（クリック可能な動画リンク）
// - YouTube字幕抽出の質問は廃止、議事録由来のQ&Aに置き換える

const fs = require('fs');

const gijiroku = JSON.parse(fs.readFileSync('gijiroku_data.json', 'utf-8'));
const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const videoMetadata = JSON.parse(fs.readFileSync('video_metadata.json', 'utf-8'));

// Parse session date from sessionTitle + dateLabel
// e.g., "令和 ７年１２月 定例会" + "11月21日-01号" → 2025-11-21
const eraBase = { '令和': 2018, '平成': 1988, '昭和': 1925 };
function parseDate(sessionTitle, dateLabel) {
  const norm = (s) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const ntitle = norm(sessionTitle);
  const ndate = norm(dateLabel);
  let year = null;
  for (const era of Object.keys(eraBase)) {
    const m = ntitle.match(new RegExp(era + '\\s*(\\d+)年'));
    if (m) { year = eraBase[era] + parseInt(m[1]); break; }
  }
  if (!year) return null;
  const mm = ndate.match(/(\d+)月(\d+)日/);
  if (!mm) return null;
  const month = parseInt(mm[1]);
  const day = parseInt(mm[2]);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Build date-indexed lookup of YouTube videos
// Parse YouTube video date from metadata title or date field
const youtubeByDate = {}; // "2025-11-21" → [videos]
for (const [videoId, meta] of Object.entries(videoMetadata)) {
  // meta.date is like "2025-12" or "" - prefer using title to extract actual date
  const title = meta.title || '';
  // Extract session year-month (e.g., 令和7年12月定例会)
  const normTitle = title.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const eraM = normTitle.match(/(令和|平成)\s*(\d+)年/);
  if (!eraM) continue;
  const year = eraBase[eraM[1]] + parseInt(eraM[2]);
  const monthM = normTitle.match(/(\d+)月/);
  if (!monthM) continue;
  const month = parseInt(monthM[1]);
  // Store by year-month (we'll match to gijiroku by session)
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (!youtubeByDate[key]) youtubeByDate[key] = [];
  youtubeByDate[key].push({ videoId, title, date: meta.date, sessionType: meta.sessionType });
}

// Also index YouTube by speakers they mention (from analysis_data.json)
// Use analysis.videos which has speakers extracted
const youtubeBySpeakerAndDate = {}; // "speaker|yyyy-mm" → [videos]
for (const v of (analysis.videos || [])) {
  if (!v.speakers) continue;
  for (const sp of v.speakers) {
    const key = `${sp}|${v.date || ''}`;
    if (!youtubeBySpeakerAndDate[key]) youtubeBySpeakerAndDate[key] = [];
    youtubeBySpeakerAndDate[key].push(v);
  }
}

// For each meeting in gijiroku, find matching YouTube videos
for (const meeting of gijiroku.meetings) {
  const date = parseDate(meeting.sessionTitle, meeting.dateLabel);
  meeting.actualDate = date;
  meeting.actualYearMonth = date ? date.substring(0, 7) : null;
  // Try to link videos per questioner
  for (const qa of meeting.qaPairs) {
    const ymKey = meeting.actualYearMonth;
    const speakerKey = `${qa.questioner}|${ymKey}`;
    const candidates = youtubeBySpeakerAndDate[speakerKey] || [];
    if (candidates.length > 0) {
      qa.youtubeVideo = { videoId: candidates[0].videoId, title: candidates[0].title, sessionType: candidates[0].sessionType };
    }
  }
}

// 議事録検索システムの直リンクを構築
function buildGijirokuUrl(meeting) {
  // ACT=200: popup view of the meeting
  if (!meeting.kgno || !meeting.fino || !meeting.unid) return null;
  return `https://itoshigikai.gijiroku.com/voices/CGI/voiweb.exe?ACT=200&KGNO=${encodeURIComponent(meeting.kgno)}&FINO=${encodeURIComponent(meeting.fino)}&UNID=${encodeURIComponent(meeting.unid)}`;
}

// Build member-indexed question database (from gijiroku)
const memberGijirokuData = {};
for (const meeting of gijiroku.meetings) {
  const gjUrl = buildGijirokuUrl(meeting);
  for (const qa of meeting.qaPairs) {
    const name = qa.questioner;
    if (!memberGijirokuData[name]) {
      memberGijirokuData[name] = {
        name,
        questions: []
      };
    }
    memberGijirokuData[name].questions.push({
      fino: meeting.fino,
      date: meeting.actualDate,
      sessionTitle: meeting.sessionTitle,
      dateLabel: meeting.dateLabel,
      sessionType: inferSessionType(meeting.sessionTitle, qa.question),
      position: qa.questionerPosition,
      question: qa.question,
      questionFull: qa.questionFull,
      responses: qa.responses,
      youtubeVideo: qa.youtubeVideo || null,
      gijirokuUrl: gjUrl,  // 議事録直リンク
    });
  }
}
// Sort each member's questions by date (newest first)
for (const m of Object.values(memberGijirokuData)) {
  m.questions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function inferSessionType(sessionTitle, questionText) {
  const t = (sessionTitle || '') + ' ' + (questionText || '').substring(0, 200);
  if (/一般質問/.test(t)) return '一般質問';
  if (/大綱質疑|決算|予算大綱/.test(t)) return '大綱質疑';
  if (/補正予算/.test(t)) return '補正予算審議';
  if (/討論/.test(t)) return '討論';
  if (/臨時会|委員会/.test(t)) return '委員会';
  if (/定例会/.test(t)) return '一般質問';
  return '';
}

const finalOutput = {
  meta: {
    generated: new Date().toISOString(),
    totalMeetings: gijiroku.meetings.length,
    totalQaPairs: gijiroku.meetings.reduce((s, m) => s + m.qaPairs.length, 0),
    totalMembers: Object.keys(memberGijirokuData).length,
  },
  memberData: memberGijirokuData,
};

fs.writeFileSync('gijiroku_integrated.json', JSON.stringify(finalOutput, null, 2));
console.log(`✓ Generated gijiroku_integrated.json`);
console.log(`✓ Meetings: ${finalOutput.meta.totalMeetings}`);
console.log(`✓ Q&A pairs: ${finalOutput.meta.totalQaPairs}`);
console.log(`✓ Members with Q&A: ${finalOutput.meta.totalMembers}`);
console.log('---Top speakers---');
Object.values(memberGijirokuData)
  .sort((a, b) => b.questions.length - a.questions.length)
  .slice(0, 15)
  .forEach(m => {
    const withVideo = m.questions.filter(q => q.youtubeVideo).length;
    console.log(`  ${m.name}: ${m.questions.length} Q (${withVideo} w/video)`);
  });
