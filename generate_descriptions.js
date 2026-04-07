const fs = require('fs');

const profiles = JSON.parse(fs.readFileSync('profiles.json', 'utf-8'));
const topics = JSON.parse(fs.readFileSync('member_topics.json', 'utf-8'));
const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const { memberSummary } = analysis;

// 各議員の質問キーワード分析から人物像を生成
function generateDescription(name) {
  const p = profiles[name];
  const t = topics[name];
  const ms = memberSummary[name];
  if (!p || !t || !ms) return '';

  const topCats = t.topCategories || [];
  const top1 = topCats[0]?.category || '';
  const top2 = topCats[1]?.category || '';
  const top3 = topCats[2]?.category || '';
  const pct1 = topCats[0]?.percentage || 0;
  const videoCount = ms.videos.length;
  const qCount = ms.totalQuestions;
  const terms = p.terms;

  // 質問テキスト全体から特徴的なキーワードを抽出
  let allQText = '';
  for (const v of ms.videos) {
    if (v.questions) allQText += v.questions.join(' ');
  }

  // 特徴キーワード検出
  const keywords = {
    '子育て支援': /子育て|保育|幼稚園|子ども|児童/g,
    '高齢者福祉': /高齢者|介護|福祉|老人|シニア/g,
    '防災対策': /防災|災害|避難|地震|津波|台風/g,
    '観光振興': /観光|旅行|温泉|インバウンド|宿泊/g,
    '教育改革': /教育|学校|授業|教員|学力/g,
    '財政改革': /財政|予算|経費|歳入|歳出|決算/g,
    '環境保全': /環境|ごみ|リサイクル|CO2|脱炭素/g,
    '都市整備': /道路|橋|建設|整備|インフラ/g,
    '医療充実': /医療|病院|健康|医師|診療/g,
    '交通問題': /交通|バス|鉄道|駐車|渋滞/g,
    '地域経済': /商店|経済|雇用|産業|中小企業/g,
    'DX推進': /デジタル|IT|AI|オンライン|DX|ＤＸ/g,
    '安全安心': /安全|安心|防犯|不審者|見守り/g,
    '農林水産': /農業|漁業|水産|農林|森林/g,
  };

  const keywordHits = {};
  for (const [label, regex] of Object.entries(keywords)) {
    const matches = allQText.match(regex);
    keywordHits[label] = matches ? matches.length : 0;
  }

  // 上位3つの特徴キーワード
  const topKeywords = Object.entries(keywordHits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([_, c]) => c > 0)
    .map(([k]) => k);

  // 活動スタイル判定
  let style = '';
  if (videoCount >= 60) style = '非常に活発な質問活動を展開';
  else if (videoCount >= 40) style = '積極的に議会活動に参加';
  else if (videoCount >= 20) style = 'コンスタントに質問活動を実施';
  else if (videoCount >= 10) style = '議会での発言を重ねている';
  else style = '議会活動に参加';

  // 人物像テキスト生成
  let desc = '';

  if (terms >= 5) {
    desc += `${terms}期のベテラン議員。`;
  } else if (terms >= 3) {
    desc += `${terms}期の中堅議員。`;
  } else if (terms === 2) {
    desc += `2期目を迎え、着実に実績を積む議員。`;
  } else if (terms === 1) {
    desc += `初当選の新人議員。`;
  }

  desc += `${style}し、`;

  if (pct1 >= 30) {
    desc += `特に${top1}の分野に強いこだわりを持つ。`;
  } else if (topKeywords.length >= 2) {
    desc += `${topKeywords[0]}や${topKeywords[1]}に注力している。`;
  } else {
    desc += `${top1}を中心に幅広い分野で質問を行う。`;
  }

  if (top2 && top3 && top1 !== top2) {
    desc += `${top2}や${top3}にも関心が高い。`;
  }

  // 特徴的な活動
  if (keywordHits['DX推進'] > 5) desc += 'デジタル化推進にも積極的。';
  if (keywordHits['子育て支援'] > 50) desc += '子育て世代の声を代弁する存在。';
  if (keywordHits['高齢者福祉'] > 50) desc += '高齢者の暮らしを守る活動に尽力。';
  if (keywordHits['防災対策'] > 40) desc += '市民の安全を守る防災対策に熱心。';
  if (keywordHits['観光振興'] > 40) desc += '伊東の観光振興に情熱を注ぐ。';

  desc += `これまでに${videoCount}本の動画で${qCount}件の質問を行っている。`;

  return desc;
}

const descriptions = {};
for (const name of Object.keys(profiles)) {
  descriptions[name] = generateDescription(name);
  console.log(`${name}: ${descriptions[name].substring(0, 60)}...`);
}

fs.writeFileSync('member_descriptions.json', JSON.stringify(descriptions, null, 2));
console.log('\n人物像生成完了: member_descriptions.json');
