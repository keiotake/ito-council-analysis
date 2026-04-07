const fs = require('fs');

const summaries = JSON.parse(fs.readFileSync('question_summaries.json', 'utf-8'));

// 音声認識エラーの修正マッピング
const corrections = [
  // 固有の誤認識
  [/sdg\s*ず/gi, 'SDGs'],
  [/lego\s*くん/g, ''],
  [/深夜可否/g, ''],
  [/日本痛覚/g, '通告'],
  [/トーニャ/g, 'となりに'],
  [/インコーヒー/g, ''],
  [/c\s*た/g, ''],
  [/say\s*\d+/g, ''],
  [/lgbtq/gi, 'LGBTQ'],
  [/ict/gi, 'ICT'],
  [/npo/gi, 'NPO'],
  [/dmo/gi, 'DMO'],
  [/led/gi, 'LED'],
  [/pdca/gi, 'PDCA'],
  [/kpi/gi, 'KPI'],
  [/ai/g, 'AI'],
  [/ねこ(のよう)?について/g, 'について'],
  [/しね社会/g, '、社会'],
  [/ぃひ/g, ''],
  [/えを行い/g, 'を行い'],
  [/ね積極/g, '積極'],
  [/情ね積極/g, '情報を積極'],
  [/神様が比で/g, ''],
  [/即死/g, '促進'],
  [/復職即死/g, '復職促進'],
  [/本氏/g, '本市'],
  [/本誌/g, '本市'],
  [/本紙/g, '本市'],
  [/移の状況/g, '市の状況'],
  [/せいかについて/g, '成果について'],
  [/子症候一第二木商工業し/g, ''],
  [/マン急逝/g, ''],
  [/彦君あの/g, ''],
  [/杉本和彦君え/g, ''],
  [/杉本彦君/g, ''],
  [/許します/g, ''],
  [/5分日本/g, ''],
  // 先頭のノイズ除去
  [/^(ます|した|ている|のですが|んですが|こ\d+として)/g, ''],
  [/^(さとして|始めに)/g, ''],
  // 不要な口語表現
  [/っていうのは/g, 'という'],
  [/あのそういうことも含めてえ/g, ''],
  [/してね今ここでそういう数字僕は改めて/g, ''],
  [/教えていただきました/g, ''],
  [/伊東市も市民もねこれお金を出/g, ''],
  [/ないでしょうか/g, ''],
  [/念されるなかで昨年度比\d+多く/g, ''],
  [/防犯島/g, '防犯灯'],
  [/かまだ区の/g, '区域の'],
  [/新条例でsay/g, '新条例で'],
];

// テーマキーワード（フォールバック用）
const themeKeywords = {
  'SDGs': 'SDGs推進について',
  'LGBTQ': 'LGBTQ・多様性について',
  'ICT': 'ICT活用について',
  'メガソーラー': 'メガソーラー問題について',
  '太陽光': '太陽光発電について',
  '保育': '保育・子育て支援について',
  '学校': '学校教育について',
  '給食': '学校給食について',
  '観光': '観光振興について',
  '温泉': '温泉・入湯税について',
  '防災': '防災対策について',
  '道路': '道路整備について',
  'ごみ': 'ごみ処理について',
  '競輪': '競輪事業について',
  '図書館': '図書館について',
  '高齢者': '高齢者福祉について',
  '介護': '介護・福祉について',
  '医療': '医療体制について',
  '空き家': '空き家対策について',
  '公園': '公園整備について',
  '水道': '水道事業について',
  '病院': '医療・病院について',
  '予算': '予算・財政について',
  'DX': 'DX・デジタル化について',
  '条例': '条例について',
};

let fixed = 0;
let total = 0;

for (const [vid, sums] of Object.entries(summaries)) {
  for (let i = 0; i < sums.length; i++) {
    total++;
    let s = sums[i];
    const original = s;

    // 修正パターンを適用
    for (const [pattern, replacement] of corrections) {
      s = s.replace(pattern, replacement);
    }

    // 先頭・末尾の余分な文字を除去
    s = s.replace(/^[^ぁ-んァ-ヶー\u4e00-\u9fffA-Za-zＡ-Ｚ０-９]+/, '');
    s = s.replace(/^(また|そして|さらに|なお|ただし|しかし|それで|そこで|つまり|やはり)+/, '');
    s = s.replace(/[、。・]+$/, '');
    s = s.trim();

    // 短すぎる場合や空になった場合はキーワードベースで再生成
    if (s.length < 4 || s === '質問内容') {
      // 元のテキストからキーワードを探す
      let found = false;
      for (const [kw, theme] of Object.entries(themeKeywords)) {
        if (original.includes(kw)) {
          s = theme;
          found = true;
          break;
        }
      }
      if (!found && s.length < 4) {
        s = original.length > 3 ? original : '質問内容';
      }
    }

    // 長すぎる場合は切り詰め
    if (s.length > 55) s = s.substring(0, 52) + '…';

    if (s !== original) {
      sums[i] = s;
      fixed++;
    }
  }
}

fs.writeFileSync('question_summaries.json', JSON.stringify(summaries, null, 2));
console.log(`補正完了: ${fixed}/${total}件を修正`);

// 修正後のサンプル表示
const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const titles = JSON.parse(fs.readFileSync('video_titles.json', 'utf-8'));
for (const name of ['大竹圭', '杉本一彦', '犬飼このり', '重岡秀子']) {
  const md = analysis.memberSummary[name];
  if (!md) continue;
  const vids = md.videos.filter(v => v.questions?.length > 0).slice(0, 2);
  for (const v of vids) {
    const s = summaries[v.videoId] || [];
    console.log(`\n[${name}] ${titles[v.videoId] || v.videoId}:`);
    s.forEach((t, j) => console.log(`  ${j+1}. ${t}`));
  }
}
