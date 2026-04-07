const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'subtitles');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));

// 修正パターン一覧
const replacements = [
  // 伊東市 関連（最頻出）
  ['伊藤市', '伊東市'],
  ['伊藤し議会', '伊東市議会'],
  ['伊藤し', '伊東し'],

  // 議員名修正
  ['犬か小のり', '犬飼このり'],
  ['犬飼小のり', '犬飼このり'],
  ['犬か小', '犬飼このり'],
  ['犬飼小', '犬飼このり'],
  ['犬会', '犬飼'],
  ['犬かい', '犬飼'],
  ['茂岡秀子', '重岡秀子'],
  ['茂岡', '重岡'],
  ['田窪真紀', '田久保眞紀'],
  ['田窪眞紀', '田久保眞紀'],
  ['田窪', '田久保'],
  ['4宮和彦', '四宮和彦'],
  ['4宮', '四宮'],
  ['死の宮', '四宮'],
  ['虫明弘男', '虫明弘雄'],
  ['篠原嶺子', '篠原峰子'],
  ['しの原峰子', '篠原峰子'],
  ['しの原', '篠原'],
  ['佐藤竜彦', '佐藤龍彦'],
  ['稲葉藤健', '稲葉富士憲'],
  ['稲葉不二憲', '稲葉富士憲'],
  ['宮崎雅薫', '宮﨑雅薫'],
  ['川島紀美恵', '河島紀美恵'],
  ['河島きみえ', '河島紀美恵'],
  ['田久保真紀', '田久保眞紀'],

  // 役職・用語修正
  ['清和会', '政和会'],
  ['一般失業', '一般質問'],
  ['予算対抗失業', '予算大綱質疑'],
  ['予算大抗失業', '予算大綱質疑'],
  ['大抗失業', '大綱質疑'],
  ['対抗失業', '大綱質疑'],
  ['失業を許します', '質疑を許します'],
  ['失業を行います', '質疑を行います'],
  ['失業します', '質疑します'],
  ['失業に入ります', '質疑に入ります'],
  ['補正予算について失業', '補正予算について質疑'],
  ['委員会付託', '委員会付託'],
  ['反対失業', '反対質疑'],
  ['賛成失業', '賛成質疑'],

  // 議会用語
  ['登壇による失業', '登壇による質疑'],
  ['関連失業', '関連質疑'],
  ['追加失業', '追加質疑'],
  ['再失業', '再質疑'],
  ['仕政方針', '市政方針'],
  ['姿勢方針', '施政方針'],
  ['仕勢方針', '施政方針'],

  // 地名
  ['伊東温泉', '伊東温泉'], // correct already, keep
  ['城ヶ崎', '城ヶ崎'],  // correct
];

let totalFixes = 0;
let fixDetails = {};

for (const file of files) {
  const filepath = path.join(dir, file);
  let text = fs.readFileSync(filepath, 'utf-8');
  let fileFixed = 0;

  for (const [wrong, right] of replacements) {
    if (wrong === right) continue;
    const regex = new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = text.match(regex);
    if (matches) {
      fileFixed += matches.length;
      fixDetails[wrong] = (fixDetails[wrong] || 0) + matches.length;
      text = text.replace(regex, right);
    }
  }

  if (fileFixed > 0) {
    fs.writeFileSync(filepath, text);
    totalFixes += fileFixed;
  }
}

console.log(`=== 誤変換修正完了 ===`);
console.log(`修正ファイル数: ${files.length}`);
console.log(`総修正箇所: ${totalFixes}`);
console.log(`\n--- 修正内訳 ---`);
Object.entries(fixDetails)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => {
    const right = replacements.find(r => r[0] === k)?.[1];
    console.log(`${v}x  ${k} -> ${right}`);
  });
