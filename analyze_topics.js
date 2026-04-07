const fs = require('fs');
const path = require('path');

const analysisData = JSON.parse(fs.readFileSync(path.join(__dirname, 'analysis_data.json'), 'utf-8'));
const dir = path.join(__dirname, 'subtitles');

// 分野キーワード定義
const categories = {
  '防災・安全': ['防災','災害','避難','地震','津波','消防','安全','ハザード','浸水','土砂','台風','耐震','防犯'],
  '医療・福祉': ['医療','福祉','介護','高齢者','障害','健康','病院','看護','保健','年金','生活保護','社会保障','障がい','バリアフリー'],
  '教育・子育て': ['教育','学校','子育て','保育','幼稚園','子ども','児童','学童','給食','通学','いじめ','不登校','図書館','小学校','中学校'],
  '観光・経済': ['観光','経済','商業','産業','企業','雇用','商店','景気','インバウンド','宿泊','温泉','入湯税','にぎわい','花火'],
  '都市整備・交通': ['道路','交通','都市','建設','インフラ','バス','駐車','橋','公園','街路','区画整理','開発','まちづくり','渋滞'],
  '環境・衛生': ['環境','ごみ','リサイクル','脱炭素','CO2','下水道','排水','衛生','美化','清掃','温暖化','エネルギー','太陽光'],
  '行財政・議会': ['予算','財政','行政','税','収入','歳出','人件費','職員','組織','改革','DX','デジタル','マイナンバー','AI','ICT'],
  '農林水産': ['農業','漁業','水産','林業','農地','漁港','鳥獣','イノシシ','シカ','有害鳥獣'],
};

const members = analysisData.memberSummary;
const memberTopics = {};

for (const [name, data] of Object.entries(members)) {
  if (data.videos.length === 0) continue;

  const scores = {};
  for (const cat of Object.keys(categories)) scores[cat] = 0;

  // この議員が登場する動画の字幕を分析
  for (const video of data.videos) {
    const subFile = path.join(dir, video.videoId + '.txt');
    if (!fs.existsSync(subFile)) continue;
    const text = fs.readFileSync(subFile, 'utf-8');

    for (const [cat, keywords] of Object.entries(categories)) {
      for (const kw of keywords) {
        const matches = text.match(new RegExp(kw, 'g'));
        if (matches) scores[cat] += matches.length;
      }
    }
  }

  // 正規化（パーセンテージ）
  const total = Object.values(scores).reduce((s, v) => s + v, 0);
  const normalized = {};
  if (total > 0) {
    for (const [cat, score] of Object.entries(scores)) {
      normalized[cat] = Math.round(score / total * 100);
    }
  }

  memberTopics[name] = {
    raw: scores,
    percentage: normalized,
    topCategories: Object.entries(normalized)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, pct]) => ({ category: cat, percentage: pct })),
  };
}

fs.writeFileSync(
  path.join(__dirname, 'member_topics.json'),
  JSON.stringify(memberTopics, null, 2)
);

console.log('=== 議員別注力分野分析完了 ===');
for (const [name, data] of Object.entries(memberTopics)) {
  const top3 = data.topCategories.slice(0, 3).map(t => `${t.category}(${t.percentage}%)`).join(', ');
  console.log(`${name}: ${top3}`);
}
