const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'subtitles');
const metaFile = path.join(__dirname, 'video_metadata.json');
const outputFile = path.join(__dirname, 'analysis_data.json');

// Load metadata
let metadata = {};
if (fs.existsSync(metaFile)) {
  metadata = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
}

// 既知の議員名リスト
const members = [
  '犬飼このり','重岡秀子','杉本憲也','田久保眞紀','四宮和彦',
  '浅田良弘','村上祥平','竹本力哉','河島紀美恵','杉本一彦',
  '鈴木絢子','虫明弘雄','鳥居康子','篠原峰子','長沢正',
  '青木敬博','佐藤周','佐藤龍彦','石島茂雄','中島弘道',
  '大川勝弘','仲田佳正','山口嘉昭','稲葉正仁','稲葉富士憲',
  '佐山正','井戸清司','土屋進','鈴木克政','宮﨑雅薫',
  '大竹圭','片桐基至'
];

// 姓だけのリスト（重複注意: 杉本、佐藤、稲葉、鈴木は複数）
const lastNames = {};
for (const m of members) {
  // 2文字姓か3文字姓か判定
  let lastName;
  if (m.startsWith('田久保')) lastName = '田久保';
  else if (m.startsWith('犬飼')) lastName = '犬飼';
  else lastName = m.substring(0, 2);

  if (!lastNames[lastName]) lastNames[lastName] = [];
  lastNames[lastName].push(m);
}

function extractSpeakerAndTopics(text, videoId) {
  const results = [];

  // タイトルから議員名を抽出
  const meta = metadata[videoId] || {};
  const title = meta.title || '';

  // テキスト内から議員の発言を検出
  let detectedMembers = new Set();

  // 「○番 XXくん」パターンで発言者検出
  const speakerPatterns = [
    /(\d+)番\s*([^\s]{2,6})くん/g,
    /(\d+)番\s*([^\s]{2,6})議員/g,
    /([^\s]{2,6})くんの一般質問/g,
    /([^\s]{2,6})議員の一般質問/g,
  ];

  for (const pattern of speakerPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[2] || match[1];
      for (const m of members) {
        if (m.includes(name) || name.includes(m.substring(0, 2))) {
          detectedMembers.add(m);
        }
      }
    }
  }

  // タイトルからも検出
  for (const m of members) {
    if (title.includes(m) || title.includes(m.substring(0, 2))) {
      detectedMembers.add(m);
    }
  }

  // テキスト内の出現頻度で主要発言者を特定
  const memberFreq = {};
  for (const m of members) {
    const count = (text.match(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (count > 0) memberFreq[m] = count;
  }

  // 質問テーマの抽出
  const topics = [];

  // 「○点目」「○つ目」パターン
  const topicPatterns = [
    /(\d+)つ目の(質疑|質問)は(.{10,80}?)(について|に関し|を伺い)/g,
    /(\d+)点目(.{5,60}?)(について|に関し|を伺い)/g,
    /次に(.{5,80}?)(について|に関し)(質問|伺い)/g,
    /大きく(\d+)点(.{5,60}?)(について|に関し)/g,
  ];

  for (const pattern of topicPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const topic = match[0].substring(0, 100);
      topics.push(topic);
    }
  }

  // 「伺います」の前の文を質問として抽出
  const questions = [];
  const questionPatterns = [
    /([^。]{20,150})(を伺います|について伺います|をお伺いします|の見解を伺い|について質問)/g,
    // 大綱質疑・予算質疑向けパターン
    /([^。]{20,150})(についてお聞き|について聞き|について確認|について伺い|について見解|についてお尋ね|をお聞き)/g,
    /([^。]{15,150})(はどうか|はいかが|はどのように|はどうなっている|はどうなる)/g,
    /([^。]{15,150})(を求め|を要望|を要請|と考えるが)/g,
  ];
  for (const questionPattern of questionPatterns) {
    let qMatch;
    while ((qMatch = questionPattern.exec(text)) !== null) {
      const q = qMatch[1].trim() + qMatch[2];
      // 重複チェック（同じ文が複数パターンにマッチする場合）
      if (!questions.some(existing => existing.includes(q.substring(0, 30)) || q.includes(existing.substring(0, 30)))) {
        questions.push(q);
      }
    }
  }

  // 回答パターン（市長、部長等の答弁）
  const answers = [];
  const answerPatterns = [
    /(市長|副市長|部長|課長|教育長)(がお答え|がご答弁|からお答え|から答弁)/g,
    /お答えいたします(.{10,200}?)(?=次に|以上|続きまして)/g,
  ];

  // テキストの種類判定（一般質問、大綱質疑、委員会等）
  // タイトル＋字幕テキストの両方から判定する
  const combined = title + ' ' + text;
  let sessionType = '不明';
  if (combined.includes('一般質問')) sessionType = '一般質問';
  else if (combined.includes('大綱質疑') || combined.includes('予算大綱') || combined.includes('決算大綱')) sessionType = '大綱質疑';
  else if (combined.includes('所信表明に対する質問') || combined.includes('所信表明')) sessionType = '大綱質疑';
  else if (combined.includes('補正予算')) sessionType = '補正予算審議';
  else if (combined.includes('委員会') || combined.includes('臨時会')) sessionType = '委員会';
  else if (combined.includes('討論')) sessionType = '討論';
  else if (combined.includes('議案')) sessionType = '議案審議';

  // 日付の推定（タイトルから）
  let date = '';
  const dateMatch = title.match(/(\d{4})[年\/\-.](\d{1,2})[月\/\-.](\d{1,2})/);
  if (dateMatch) {
    date = `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`;
  } else {
    const dateMatch2 = title.match(/(令和\d+)年(\d{1,2})月/);
    if (dateMatch2) {
      const reiwa = parseInt(dateMatch2[1].replace('令和',''));
      const year = 2018 + reiwa;
      date = `${year}-${dateMatch2[2].padStart(2,'0')}`;
    }
  }

  return {
    videoId,
    title,
    date,
    url: `https://youtu.be/${videoId}`,
    sessionType,
    speakers: [...detectedMembers],
    memberFrequency: memberFreq,
    questions: questions.slice(0, 20), // 最大20個
    topics: topics.slice(0, 10),
    textLength: text.length,
  };
}

// 全ファイル処理
const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
const allResults = [];

for (const file of files) {
  const videoId = file.replace('.txt', '');
  const text = fs.readFileSync(path.join(dir, file), 'utf-8');
  const result = extractSpeakerAndTopics(text, videoId);
  allResults.push(result);
}

// 議員別に集計
const memberSummary = {};
for (const m of members) {
  memberSummary[m] = {
    name: m,
    videos: [],
    totalQuestions: 0,
    topics: [],
  };
}

for (const r of allResults) {
  for (const speaker of r.speakers) {
    if (memberSummary[speaker]) {
      memberSummary[speaker].videos.push({
        videoId: r.videoId,
        title: r.title,
        date: r.date,
        url: r.url,
        sessionType: r.sessionType,
        questions: r.questions,
        topics: r.topics,
      });
      memberSummary[speaker].totalQuestions += r.questions.length;
    }
  }

  // memberFrequencyでも追加（speakersに入っていない場合）
  for (const [name, freq] of Object.entries(r.memberFrequency)) {
    if (freq >= 3 && memberSummary[name] && !r.speakers.includes(name)) {
      const existing = memberSummary[name].videos.find(v => v.videoId === r.videoId);
      if (!existing) {
        memberSummary[name].videos.push({
          videoId: r.videoId,
          title: r.title,
          date: r.date,
          url: r.url,
          sessionType: r.sessionType,
          questions: r.questions,
          topics: r.topics,
          mentionOnly: true,
        });
      }
    }
  }
}

// 保存
const output = {
  totalVideos: allResults.length,
  videos: allResults,
  memberSummary,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

// サマリー出力
console.log(`=== 分析完了 ===`);
console.log(`総動画数: ${allResults.length}`);
console.log(`\n--- 議員別動画数 ---`);
Object.values(memberSummary)
  .filter(m => m.videos.length > 0)
  .sort((a, b) => b.videos.length - a.videos.length)
  .forEach(m => {
    console.log(`${m.videos.length}本  ${m.name} (質問${m.totalQuestions}件)`);
  });

console.log(`\n--- セッション種別 ---`);
const typeCounts = {};
for (const r of allResults) {
  typeCounts[r.sessionType] = (typeCounts[r.sessionType] || 0) + 1;
}
Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`${v}本  ${k}`));

console.log(`\nデータ保存: ${outputFile}`);
