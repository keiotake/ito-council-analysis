const fs = require('fs');

const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const titles = JSON.parse(fs.readFileSync('video_titles.json', 'utf-8'));

// 質問テキストから具体的なテーマを短い見出しに変換
function extractHeadline(rawText) {
  let text = rawText.trim();

  // ノイズ除去（議長の発言、自己紹介、挨拶等）
  text = text
    .replace(/休憩前に引き続き会議を開きます/g, '')
    .replace(/次に\d+番.{2,6}(君|くん|さん)の一般質問を許します/g, '')
    .replace(/\d+番.{2,6}(君|くん|さん)の一般質問を許します/g, '')
    .replace(/.{2,6}(君|くん)の一般質問を許します/g, '')
    .replace(/委?\d+番\d*番?/g, '')
    .replace(/ます委\d+/g, '')
    .replace(/(会派.{2,10}の)?.{2,8}(です|でございます|であります)/g, '')
    .replace(/通告に(従い|従いまして)[^。]*?(質問|伺い)/g, '')
    .replace(/(一般質問|質問)を(行います|させていただきます)/g, '')
    .replace(/(本日は|今回は|それでは|まず|最初に|初めに|はじめに|続きまして|続いて|次に)/g, '')
    .replace(/(お伺い|伺い)(いたします|します|させていただきます)/g, '')
    .replace(/(いただきたい|よろしくお願い|思います|考えます|ございます|ありがとう)[^。]*$/g, '')
    .trim();

  // ===== 戦略1: 複数の「について」トピックが列挙されているパターン =====
  // 例: 「○○について、△△について、□□について質問します」
  const multiAbout = [...text.matchAll(/([ぁ-んァ-ヶー\u4e00-\u9fffA-Za-zＡ-Ｚａ-ｚ０-９0-9・]{3,30}について)/g)];
  if (multiAbout.length >= 2) {
    const topics = multiAbout
      .map(m => cleanTopicText(m[1]))
      .filter(t => t.length >= 4 && t.length <= 35);
    if (topics.length >= 2) {
      const joined = topics.slice(0, 3).join('、');
      if (joined.length <= 55) return joined;
      return topics[0];
    }
  }

  // ===== 戦略2: 「について」を含む句で、前の部分が日本語として意味のある語句 =====
  // 短い方が精度が高いので、短い方を優先
  const aboutMatchesShort = [...text.matchAll(/([^。、\n]{4,25}について)/g)];
  const aboutMatchesLong = [...text.matchAll(/([^。、\n]{26,50}について)/g)];
  for (const matches of [aboutMatchesShort, aboutMatchesLong]) {
    for (const m of matches) {
      let topic = cleanTopicText(m[1]);
      // クリーニング後に短すぎたら元のマッチを使う
      if (topic.length < 5 && m[1].length >= 8) {
        topic = m[1].trim();
      }
      if (topic.length >= 5 && topic.length <= 45 && isValidTopic(topic)) {
        return cleanHeadline(topic);
      }
    }
  }

  // ===== 戦略3: 「を伺います」「について伺い」の前のフレーズ =====
  const askMatches = [...text.matchAll(/([^。、\n]{4,60})(を伺い|を質問|について伺い|に関し[て、])/g)];
  if (askMatches.length > 0) {
    for (const m of askMatches) {
      let topic = cleanTopicText(m[1]);
      if (topic.length >= 5 && isValidTopic(topic)) {
        const suffix = m[2] === 'に関し' ? 'に関して' : '';
        return cleanHeadline(topic + suffix);
      }
    }
  }

  // ===== 戦略4: 「○点目」「○つ目」パターン =====
  const numMatches = [...text.matchAll(/(\d+|[一二三四五六七八九十]+)(つ目|点目)[はの、].{0,5}?([^。、\n]{4,40})(について|を|に関し)/g)];
  if (numMatches.length > 0) {
    const topics = numMatches
      .map(m => cleanTopicText(m[3] + (m[4] === 'について' ? 'について' : '')))
      .filter(t => t.length >= 4 && isValidTopic(t));
    if (topics.length > 0) return cleanHeadline(topics[0]);
  }

  // ===== 戦略5: キーワードベースのテーマ抽出 =====
  const keywordThemes = [
    [/学校(の|統合|整備|施設|トイレ|老朽化|教育)/, '学校施設の整備'],
    [/通学路|スクールゾーン/, '通学路の安全対策'],
    [/不登校|いじめ/, '不登校・いじめ対策'],
    [/保育(園|士|所)|待機児童|子育て支援/, '子育て支援・保育'],
    [/給食(費|センター|の)?/, '学校給食'],
    [/児童(クラブ|館)/, '放課後児童クラブ'],
    [/高齢者|介護|認知症/, '高齢者福祉・介護'],
    [/病院|医療(体制|費)|市民病院/, '医療体制'],
    [/防災|災害|避難(所|場所|計画)/, '防災対策'],
    [/地震|津波/, '地震・津波対策'],
    [/消防|救急/, '消防・救急体制'],
    [/観光(振興|戦略|客)|インバウンド/, '観光振興'],
    [/温泉|入湯税/, '温泉・入湯税'],
    [/海岸|ビーチ|海水浴/, '海岸整備'],
    [/予算|決算|財政|歳(入|出)|基金/, '財政・予算'],
    [/道路|橋(梁)?|舗装/, '道路・橋梁整備'],
    [/上下水道|水道(事業)?/, '上下水道'],
    [/公園|緑地/, '公園整備'],
    [/ごみ|廃棄物|リサイクル/, 'ごみ処理・リサイクル'],
    [/太陽光|メガソーラー|再生可能エネルギー/, '再生可能エネルギー'],
    [/有害鳥獣|イノシシ|シカ|捕獲/, '有害鳥獣対策'],
    [/DX|デジタル(化|トランス)|ICT|AI活用|マイナンバー/, 'DX・デジタル化'],
    [/職員(の|体制|定員)|人事/, '職員体制・人事'],
    [/条例|規則/, '条例関連'],
    [/競輪(事業|場)?/, '競輪事業'],
    [/図書館/, '図書館'],
    [/空き家|空家/, '空き家対策'],
    [/移住|定住|人口減少/, '移住・定住促進'],
    [/公共交通|バス(路線)?|タクシー/, '公共交通'],
    [/下水道(事業)?/, '下水道事業'],
    [/LGBT|多様性|ジェンダー|性的マイノリティ/, '多様性・ジェンダー'],
    [/発達障(がい|害)|障(がい|害)者?(福祉|支援)?/, '障がい者支援'],
    [/コロナ|感染症|ワクチン/, '感染症対策'],
    [/補正予算/, '補正予算'],
    [/都市計画|まちづくり|街づくり/, 'まちづくり'],
    [/ふるさと納税|寄附/, 'ふるさと納税'],
    [/情報(発信|公開)|広報/, '情報発信・広報'],
    [/リニューアル|改修|建替/, '施設改修'],
    [/耐震|老朽化/, '耐震・老朽化対策'],
    [/指定管理|民間委託/, '指定管理・民間委託'],
    [/ペット|動物|犬猫/, 'ペット・動物行政'],
    [/化学物質|過敏症/, '化学物質過敏症対策'],
    [/マネジメント|行政改革/, '行政改革'],
    [/市長(の|施政|方針)/, '市長施政方針'],
  ];

  const shortText = text.substring(0, 500);
  for (const [pattern, theme] of keywordThemes) {
    if (shortText.match(pattern)) return theme;
  }

  // ===== 戦略6: 最初の文から主要名詞句を抽出 =====
  const sentences = text.split(/[。\n]/).filter(s => s.trim().length > 10);
  if (sentences.length > 0) {
    let first = sentences[0].trim();
    first = cleanTopicText(first);
    if (first.length > 45) first = first.substring(0, 42) + '…';
    if (first.length >= 5 && isValidTopic(first)) return first;
  }

  // ===== 戦略7: テキスト全体から最もテーマ性の高いキーワードを抽出 =====
  const topicWords = extractTopicWords(text.substring(0, 800));
  if (topicWords) return topicWords;

  return '質問内容';
}

// トピックテキストのクリーニング
function cleanTopicText(text) {
  let s = text.trim();
  // 先頭の非日本語文字を除去
  s = s.replace(/^[^ぁ-んァ-ヶー\u4e00-\u9fffA-Za-zＡ-Ｚ０-９]+/, '');
  // 先頭の接続詞・助詞・フィラー・動詞活用語尾等を繰り返し除去
  let prev;
  do {
    prev = s;
    s = s.replace(/^(ます|した|います|いる|ている|ました|ですが|ところ|こと(から|で)?|しかし|ただし|なお|また|そして|ように|ために|として|において|における|おける|おいて|えー|あー|うー|まぁ|こう|えっと|あの|その|この|それ|これ|それで|そこで|つまり|やはり|やっぱり|けれども|けど|だから|ので|から|ですので|ところで|さて|では|じゃあ|ちょっと|少し|大変|非常に|本当に|実は|実際|実際に|もう|まだ|とても|すごく|かなり|ほんとに|ほんとうに|思いますが|考えますが|ありますが|おりますが|思いまして|考えまして|伺いますが|伺いたいと|思うんですが|思うのですが|るほか|るとともに|ることから|る中で|っている|っております|られている|されている|されます|されました|しました|しまして|いたしまして|であります|でございます|ございまして|ござい|ございますが|おります|おりまして|おりますが|いただき|いただきまして|くださり|くださいまして|つ目の質疑は|つ目は|点目は|目に|目として|目の|番目|一つ目|二つ目|三つ目|四つ目|五つ目|六つ目|七つ目|一般会計|特別会計)+/g, '');
  } while (s !== prev);
  // 先頭の助詞を除去
  s = s.replace(/^[のはがをでとにへもかよねやら、・]+/, '');
  // 末尾のゴミを除去（後続テキストまで削除しないよう注意）
  s = s.replace(/(のですが|んですが|ですが|ですけど|ですので|ですから|ですけれども|なんですけど|ということで|というのは|というのが|といいますか|ではないか|と思う$|と考える$|でありますが|でございますが|であります$)/, '');
  return s.trim();
}

// トピックとして有効かチェック
function isValidTopic(text) {
  if (text.length < 4) return false;
  // 漢字が2文字以上含まれていればテーマ性が高い
  const kanjiCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  if (kanjiCount >= 2) return true;
  // カタカナ語（外来語等）が含まれていればOK
  if (/[ァ-ヶー]{2,}/.test(text)) return true;
  // ひらがなのみの短い断片はNG（音声認識ノイズの可能性大）
  if (text.length < 10) return false;
  // 十分な長さがある場合はOK
  return text.length >= 15;
}

// テキスト全体からテーマ的なキーワードを抽出
function extractTopicWords(text) {
  // 漢字の連続（2文字以上）を名詞候補として抽出
  const kanjiWords = [...text.matchAll(/([\u4e00-\u9fff]{2,8})/g)].map(m => m[1]);
  if (kanjiWords.length === 0) return null;

  // テーマ性の高い名詞の出現頻度をカウント
  const freq = {};
  for (const w of kanjiWords) {
    // 一般的すぎる語は除外
    if (['質問', '答弁', '議員', '議長', '市長', '部長', '課長', '会議', '休憩',
         '説明', '確認', '理解', '認識', '状況', '現在', '今後', '本市', '当局',
         '結果', '内容', '問題', '意見', '最後', '以上', '次第', '委員'].includes(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  if (sorted.length >= 2) {
    // 上位2-3のキーワードを組み合わせ
    const top = sorted.slice(0, 3).map(e => e[0]);
    return top.join('・') + 'に関する質問';
  }
  if (sorted.length === 1) {
    return sorted[0][0] + 'に関する質問';
  }
  return null;
}

function cleanHeadline(text) {
  let s = text.replace(/^(のうち|として|、|・|に関し|ます|まず|の|は|が|を|で|と|に|へ|も|か|よ|ね)+/, '').trim();
  // 末尾の助詞等を除去
  s = s.replace(/(のですが|ですが|ですけど|んですが|ということで|という)$/, '').trim();
  if (s.length > 50) s = s.substring(0, 47) + '…';
  if (s.length < 3) return text.substring(0, Math.min(text.length, 47));
  return s;
}

// 全動画・全質問を処理
const summaryMap = {};
let total = 0, good = 0;

for (const [name, data] of Object.entries(analysis.memberSummary)) {
  for (const v of data.videos) {
    if (!v.questions || v.questions.length === 0) continue;
    if (summaryMap[v.videoId]) continue;

    const headlines = v.questions.map(q => {
      total++;
      const h = extractHeadline(q);
      if (h !== '質問内容') good++;
      return h;
    });

    summaryMap[v.videoId] = headlines;
  }
}

// videosにもある分
for (const v of analysis.videos) {
  if (!v.questions || v.questions.length === 0) continue;
  if (summaryMap[v.videoId]) continue;

  const headlines = v.questions.map(q => {
    total++;
    const h = extractHeadline(q);
    if (h !== '質問内容') good++;
    return h;
  });

  summaryMap[v.videoId] = headlines;
}

fs.writeFileSync('question_summaries.json', JSON.stringify(summaryMap, null, 2));
console.log(`要約完了: ${good}/${total}件 (${(good/total*100).toFixed(1)}%)`);
console.log(`動画数: ${Object.keys(summaryMap).length}`);

// サンプル表示（複数議員）
const sampleMembers = ['犬飼このり', '杉本一彦', '重岡秀子', '鈴木絢子', '大竹圭'];
for (const memberName of sampleMembers) {
  const memberData = analysis.memberSummary[memberName];
  if (!memberData) continue;
  const videos = memberData.videos.filter(v => v.questions && v.questions.length > 0).slice(0, 2);
  for (const v of videos) {
    const title = titles[v.videoId] || v.videoId;
    const sums = summaryMap[v.videoId] || [];
    console.log(`\n[${memberName}] ${title}:`);
    sums.forEach((s, i) => console.log(`  ${i+1}. ${s}`));
  }
}
