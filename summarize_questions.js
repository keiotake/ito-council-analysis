const fs = require('fs');

// analysis_data.jsonの質問テキストを要約（短い見出しに変換）
const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const titles = JSON.parse(fs.readFileSync('video_titles.json', 'utf-8'));

// 質問テキストからキーワードを抽出して要約を生成
function summarizeQuestion(rawText) {
  // 不要な前置き（議長の発言、自己紹介等）を除去
  let text = rawText
    .replace(/休憩前に引き続き会議を開きます/g, '')
    .replace(/次に\d+番[^\s]{2,6}(君|くん|さん)の一般質問を許します/g, '')
    .replace(/委?\d+番\d*番?/g, '')
    .replace(/(会派[^\s]+の)?[^\s]{2,8}(です|でございます)/g, '')
    .replace(/通告に(従い|従いまして)[^\s]*?(質問|伺い)/g, '質問')
    .replace(/一般質問を(行います|させていただきます)/g, '')
    .replace(/(本日は|今回は|それでは)/g, '')
    .trim();

  // 「伺います」「質問します」で文を区切って最初の質問テーマを抽出
  const sentences = text.split(/[。？\n]/);

  // 質問の核心部分を探す
  let bestSentence = '';
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed.length < 10) continue;

    // 質問内容を含む文を優先
    if (trimmed.match(/について|伺い|質問|どのように|いかが|見解|方針|対応|計画|施策/)) {
      bestSentence = trimmed;
      break;
    }
    if (!bestSentence && trimmed.length > 15) {
      bestSentence = trimmed;
    }
  }

  if (!bestSentence) bestSentence = text.substring(0, 100);

  // キーワードベースでテーマを抽出
  const themes = [];
  const themePatterns = [
    [/子(供|ども)|教育|学校|保育|通学|不登校|給食|PTA|児童/g, '教育・子ども'],
    [/高齢者?|介護|福祉|年金|認知症|老人/g, '高齢者福祉'],
    [/病院|医療|健康|検診|がん|ワクチン|コロナ/g, '医療・健康'],
    [/防災|災害|地震|津波|避難|消防|豪雨|台風|防犯/g, '防災・安全'],
    [/観光|温泉|インバウンド|宿泊|花火|海岸|ビーチ/g, '観光振興'],
    [/予算|財政|決算|税|歳(入|出)|基金|起債|公債/g, '財政・予算'],
    [/道路|橋|公園|上下水道|インフラ|建設|整備|交通/g, 'インフラ整備'],
    [/環境|ごみ|リサイクル|太陽光|メガソーラー|CO2/g, '環境問題'],
    [/農|漁|林|鳥獣|イノシシ|シカ|有害/g, '農林水産'],
    [/DX|ICT|デジタル|AI|システム|マイナンバー/g, 'DX・デジタル'],
    [/職員|人事|マネジメント|組織|行政改革/g, '行政改革'],
    [/市長|市政|条例|議会|委員会/g, '市政運営'],
  ];

  for (const [pattern, theme] of themePatterns) {
    if (bestSentence.match(pattern) || text.substring(0, 300).match(pattern)) {
      themes.push(theme);
      if (themes.length >= 2) break;
    }
  }

  // 要約文を作成（80文字以内）
  let summary = bestSentence;

  // 長すぎる場合は切り詰め
  if (summary.length > 80) {
    // 「について」「を伺います」等の区切りで切る
    const cutPoints = [
      summary.indexOf('について'),
      summary.indexOf('を伺い'),
      summary.indexOf('について伺い'),
      summary.indexOf('を質問'),
    ].filter(i => i > 15 && i < 80);

    if (cutPoints.length > 0) {
      const cut = Math.max(...cutPoints);
      summary = summary.substring(0, cut + (summary.substring(cut).startsWith('について') ? 4 : 0));
    } else {
      summary = summary.substring(0, 77) + '…';
    }
  }

  return { summary, themes };
}

// 各動画の質問を要約
const videoSummaries = {};
let totalQ = 0, summarized = 0;

for (const v of analysis.videos) {
  if (!v.questions || v.questions.length === 0) continue;

  const title = titles[v.videoId] || v.title || '';
  const summaries = v.questions.map(q => {
    totalQ++;
    const result = summarizeQuestion(q);
    if (result.summary.length > 10) summarized++;
    return result;
  });

  videoSummaries[v.videoId] = {
    title,
    questionSummaries: summaries.map(s => s.summary),
    themes: [...new Set(summaries.flatMap(s => s.themes))],
  };
}

// memberSummaryの動画も処理
for (const [name, data] of Object.entries(analysis.memberSummary)) {
  for (const v of data.videos) {
    if (!v.questions || v.questions.length === 0) continue;
    if (videoSummaries[v.videoId]) continue; // 既に処理済み

    const title = titles[v.videoId] || v.title || '';
    const summaries = v.questions.map(q => {
      totalQ++;
      const result = summarizeQuestion(q);
      if (result.summary.length > 10) summarized++;
      return result;
    });

    videoSummaries[v.videoId] = {
      title,
      questionSummaries: summaries.map(s => s.summary),
      themes: [...new Set(summaries.flatMap(s => s.themes))],
    };
  }
}

fs.writeFileSync('video_summaries.json', JSON.stringify(videoSummaries, null, 2));
console.log(`要約完了: ${summarized}/${totalQ}件`);
console.log(`動画数: ${Object.keys(videoSummaries).length}`);

// サンプル表示
const sample = Object.entries(videoSummaries).slice(0, 3);
for (const [id, data] of sample) {
  console.log(`\n${data.title}:`);
  data.questionSummaries.forEach((s, i) => console.log(`  ${i+1}. ${s}`));
}
