const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'subtitles');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));

// 追加修正パターン
const replacements = [
  // 「失業」→「質疑」（議会文脈）
  ['失業秋月', '質疑終結'],
  ['失業集結', '質疑終結'],
  ['失業終結', '質疑終結'],
  ['決算大高失業', '決算大綱質疑'],
  ['決算対抗の最後なので失業', '決算大綱の最後なので質疑'],
  ['決算大後失業', '決算大綱質疑'],
  ['壇上からの失業', '壇上からの質疑'],
  ['通告のない失業', '通告のない質疑'],
  ['基礎国のない失業', '基礎のない質疑'],
  ['たい4失業', '大綱質疑'],
  ['他に失業ありません', '他に質疑ありません'],
  ['失業を許します', '質疑を許します'],
  ['失業に入ります', '質疑に入ります'],

  // 議員名修正（「くん」パターン）
  ['番杉本和也くん', '番 杉本憲也くん'],
  ['杉本和也くん', '杉本憲也くん'],
  ['杉本和也議員', '杉本憲也議員'],
  ['番杉本和彦くん', '番 杉本一彦くん'],
  ['杉本和彦くん', '杉本一彦くん'],
  ['杉本和彦議員', '杉本一彦議員'],
  ['番佐藤修くん', '番 佐藤周くん'],
  ['佐藤修くん', '佐藤周くん'],
  ['番佐藤辰彦くん', '番 佐藤龍彦くん'],
  ['佐藤辰彦くん', '佐藤龍彦くん'],
  ['佐藤辰彦議員', '佐藤龍彦議員'],
  ['番佐藤立彦くん', '番 佐藤龍彦くん'],
  ['佐藤立彦くん', '佐藤龍彦くん'],
  ['番佐藤駿くん', '番 佐藤周くん'],
  ['佐藤駿くん', '佐藤周くん'],
  ['番犬飼公哉くん', '番 犬飼このりくん'],
  ['犬飼公哉くん', '犬飼このりくん'],
  ['犬飼公哉', '犬飼このり'],
  ['中島宏海智くん', '中島弘道くん'],
  ['中島宏海くん', '中島弘道くん'],
  ['中島宏海智', '中島弘道'],
  ['中島宏海', '中島弘道'],
  ['番宮崎正成くん', '番 宮﨑雅薫くん'],
  ['宮崎正成くん', '宮﨑雅薫くん'],
  ['宮崎正成', '宮﨑雅薫'],
  ['番山口義昭くん', '番 山口嘉昭くん'],
  ['山口義昭くん', '山口嘉昭くん'],
  ['山口義昭', '山口嘉昭'],
  ['番鈴木愛子くん', '番 鈴木絢子くん'],
  ['鈴木愛子くん', '鈴木絢子くん'],
  ['鈴木愛子', '鈴木絢子'],
  ['番四宮風彦くん', '番 四宮和彦くん'],
  ['四宮風彦くん', '四宮和彦くん'],
  ['四宮風彦', '四宮和彦'],
  ['番杉本風彦くん', '番 杉本一彦くん'],
  ['杉本風彦くん', '杉本一彦くん'],
  ['杉本風彦', '杉本一彦'],
  ['篠宮議員', '四宮議員'],
  ['篠宮', '四宮'],
  ['一番琢磨くん', '一番 竹本力哉くん'],

  // 杉本憲也 vs 杉本一彦の区別は動画タイトルに依存するため
  // 一般的な「杉本和也」は「杉本憲也」（より若手、頻出）

  // 役職・用語
  ['仕政方針', '市政方針'],
  ['仕勢方針', '施政方針'],
  ['海域削ぐ', '会議規則'],
  ['海議規則', '会議規則'],
];

let totalFixes = 0;
let fixDetails = {};

for (const file of files) {
  const filepath = path.join(dir, file);
  let text = fs.readFileSync(filepath, 'utf-8');
  let fileFixed = 0;

  for (const [wrong, right] of replacements) {
    if (wrong === right) continue;
    const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
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

console.log(`=== 追加誤変換修正完了 ===`);
console.log(`総修正箇所: ${totalFixes}`);
console.log(`\n--- 修正内訳 ---`);
Object.entries(fixDetails)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => {
    const right = replacements.find(r => r[0] === k)?.[1];
    console.log(`${v}x  "${k}" -> "${right}"`);
  });
