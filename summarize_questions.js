const fs = require('fs');

// analysis_data.jsonの質問テキストを要約（短い見出しに変換）
const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const titles = JSON.parse(fs.readFileSync('video_titles.json', 'utf-8'));

// YouTube自動字幕の誤変換パターンを修正
function fixTranscriptionErrors(text) {
  return text
    .replace(/伊藤市/g, '伊東市')
    .replace(/カッコ(\d)/g, '($1)')
    .replace(/格好(\d|に)/g, '($1)')
    .replace(/カッコ一/g, '(1)')
    .replace(/カッコ二/g, '(2)')
    .replace(/カッコ三/g, '(3)')
    .replace(/カッコ四/g, '(4)')
    .replace(/格好一/g, '(1)')
    .replace(/スントイズ/g, '駿東伊豆')
    .replace(/光景条例/g, '景観条例')
    .replace(/色材/g, '食材')
    .replace(/しかこ/g, 'しかし')
    .replace(/収春版/g, '収集運搬')
    .replace(/ごどに/g, 'こども園に')
    .replace(/光と浴衣にぎわい/g, '光と浴衣の賑わい')
    .replace(/ひかりと浴衣に気は/g, '光と浴衣の賑わい')
    .replace(/伊東校伊東校/g, '伊東港')
    .replace(/有知事業/g, '誘致事業')
    .replace(/不校対策/g, '不登校対策')
    .replace(/基調硬質化/g, '機構改革')
    .replace(/市政戦略家/g, '市政戦略課')
    .replace(/重促進/g, '住促進');
}

// 不要な前置き・議長発言等を除去
function removePreamble(text) {
  return text
    .replace(/[\n\r]+/g, ' ')
    // 議長の発言
    .replace(/休憩前に引き続き会議を開きます/g, '')
    .replace(/次に\d*番?[^\s]{2,12}(君|くん|さん|分)の一般質問を許します/g, '')
    .replace(/\d+番[^\s]{2,6}(君|くん|さん)に関する質問/g, '')
    .replace(/[^\s]{2,6}(君|くん)日本に関する質問/g, '')
    .replace(/次に[^\s]{2,12}(君|くん|分)の?いっぱい質問を許します/g, '')
    .replace(/[^\s]{2,12}(君|くん|分)[^\s]{0,8}(です|でございます)/g, '')
    .replace(/数覚に従って/g, '通告に従って')
    .replace(/神様が比例北ん/g, '')
    .replace(/朝だよ[^\s]*/g, '')
    .replace(/篠原猫くん号メイク篠原/g, '')
    // 番号
    .replace(/委?\d+番\d*番?/g, '')
    // 自己紹介・挨拶
    .replace(/(会派[^\s]+の)?[^\s]{2,8}(です|でございます)[。、]?/g, '')
    .replace(/通告に(従い|従いまして|基づき)[^\s]*?(質問|伺い)/g, '質問')
    .replace(/一般質問を(行います|させていただきます|始めます)/g, '')
    .replace(/(本日は|今回は|それでは|早速ですが|よろしくお願いします)[、。]?/g, '')
    .replace(/本会議となりまして[^。]*?[。]/g, '')
    .replace(/ちょっと気を引き締めたいと思いまして/g, '')
    .replace(/ようやく[^。]*?[。]?/g, '')
    // 枕詞
    .replace(/大きく\d+点?について[、。]?/g, '')
    .replace(/大きな項目の?\d*つ目(に|として|は)?/g, '')
    .replace(/通告に従って/g, '')
    .replace(/(1|2|3|4|１|２|３|４|一|二|三|四)(つ目|点目)(に|として|は|の質問は)?/g, '')
    .replace(/最初の(質問|問題)は/g, '')
    .replace(/最後の(質問|問題)は/g, '')
    .replace(/\d+点について[、。]?/g, '')
    // 感嘆・ゴミ
    .replace(/ああ+/g, '')
    .replace(/深夜か英子くん日本(共産党の重岡英子です)?/g, '')
    .replace(/休憩前に引き続き会議を開きます次に/g, '')
    .replace(/はに年度/g, '令和2年度')
    .replace(/例はに年度/g, '令和2年度')
    .replace(/例は後年度/g, '令和5年度')
    .replace(/本誌/g, '本市')
    .replace(/光景条例/g, '景観条例')
    .replace(/景観党/g, '景観等')
    .replace(/髪漏水/g, '管漏水')
    .replace(/巫女比/g, '費目比')
    .replace(/粘土/g, '年度')
    .replace(/子育て声援/g, '子育て支援')
    .replace(/汗保護/g, '額保護')
    .replace(/感謝以下に点火/g, '関し以下に質問')
    .replace(/えーるしぇろ/g, '')
    .replace(/だよ g 露軍/g, '')
    // 前後の空白
    .trim();
}

// 文頭の壊れた部分（前文の語尾の続き）を検出・除去
function trimBrokenStart(text) {
  // 前文の語尾が残っている場合、最初のトピックキーワードまでスキップ
  const topicMatch = text.match(/(について|を伺い|に関し|に関する|の状況|の取り組み|の対応|の方針|の推進|事業の|事業について|制度の|計画の|条例の)/);
  if (topicMatch && topicMatch.index > 0 && topicMatch.index < 120) {
    // トピックキーワードの前にある名詞句を探す
    const before = text.substring(0, topicMatch.index + topicMatch[0].length);
    // 漢字・カタカナで始まる名詞句を見つける
    const nounStart = before.search(/[一-龥ァ-ヶ\uff21-\uff3a]{2,}/);
    if (nounStart >= 0 && nounStart < topicMatch.index) {
      text = text.substring(nounStart);
    }
  }

  // ひらがな1-3文字 + 助詞で始まる → 前文の切れ端
  text = text.replace(/^[ぁ-ん]{0,5}(を|と|の|に|で|が|は|も|て|し|く|き|け|せ|す|れ|る|り|め|み|な)[^ぁ-ん]/, '');
  // 動詞活用語尾で始まるパターン
  text = text.replace(/^(ません|ませんが|れます|します|きます|ります|ています|いました|えます|っています|いたします|したこと|じました|っております|ったということ|きたということ|されている|しました|するには|うなましょう)[がけそ、。で]*?/g, '');
  // 「さを行います」「しょうかね」等
  text = text.replace(/^(さを|しょうかね|けど|けれども|んですが|のですが|んとか|かっこ)[^ぁ-ん]*/g, '');
  // 「つ目の」「つ相談」等
  text = text.replace(/^つ(目の|目として|相談|弱い|とな|の質疑)/g, '');
  // 前文の動詞の続き
  text = text.replace(/^(るほか|るのか|るの|るこ|かがで|かっこ|かす|から見|か伊豆|から臨|になって|になれ|にか|にどう|にまた|か数字|たのか|との|ともな|いという|だよ g)/g, '');
  // 先頭の句読点・接続詞残骸
  text = text.replace(/^[、。,. ]+/, '');
  text = text.replace(/^(そこで|また|なお|さて|さらに|ところで|ただし|でもっとも)[、。]?/g, '');
  return text.trim();
}

// 質問テキストからキーワードを抽出して要約を生成
function summarizeQuestion(rawText) {
  let text = fixTranscriptionErrors(rawText);
  text = removePreamble(text);
  text = trimBrokenStart(text);

  // 空テキストチェック
  if (text.length < 8) return { summary: '', themes: [] };

  // 「伺います」「質問します」で文を区切って最初の質問テーマを抽出
  const sentences = text.split(/[。？\n]/);

  // 質問の核心部分を探す
  let bestSentence = '';
  for (const s of sentences) {
    let trimmed = s.trim();
    trimmed = trimBrokenStart(trimmed);
    if (trimmed.length < 8) continue;

    // 質問内容を含む文を優先
    if (trimmed.match(/について|伺い|質問|どのように|いかが|見解|方針|対応|計画|施策|状況|取り組み|推進/)) {
      bestSentence = trimmed;
      break;
    }
    if (!bestSentence && trimmed.length > 12) {
      bestSentence = trimmed;
    }
  }

  if (!bestSentence) bestSentence = text.substring(0, 100);

  // 再度壊れた先頭を修正
  bestSentence = trimBrokenStart(bestSentence);

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

  // 最終クリーンアップ：先頭が不自然ならさらにトリム
  summary = summary.replace(/^[、。 ]+/, '').trim();

  return { summary, themes };
}

// プレースホルダーかテーマ名のみの場合はスキップ
function isPlaceholder(s) {
  if (!s || s.length < 6) return true;
  if (s === '質問内容') return true;
  if (/^(防災対策|子育て支援|財政・予算|条例関連|観光振興|医療体制|子育て支援・保育|環境問題|教育・子ども|高齢者福祉|DX・デジタル|行政改革|市政運営|インフラ整備|農林水産)$/.test(s)) return true;
  return false;
}

// 各動画の質問を要約
const videoSummaries = {};
const questionSummariesFlat = {};
let totalQ = 0, summarized = 0, fixed = 0;

for (const v of analysis.videos) {
  if (!v.questions || v.questions.length === 0) continue;

  const title = titles[v.videoId] || v.title || '';
  const summaries = v.questions.map(q => {
    totalQ++;
    const result = summarizeQuestion(q);
    if (result.summary.length > 8 && !isPlaceholder(result.summary)) {
      summarized++;
      return result;
    }
    // フォールバック：生テキストから再抽出
    const cleaned = q.replace(/[\n\r]/g, '').replace(/^[^ぁ-んァ-ヶ\u4e00-\u9fff]*/,'')
      .replace(/.{2,6}(君|くん)の一般質問を許します/g,'')
      .replace(/委?\d+番?\d*/g,'').trim();
    const fb = cleaned.length > 55 ? cleaned.substring(0, 52) + '…' : cleaned;
    return { summary: fb, themes: result.themes };
  });

  videoSummaries[v.videoId] = {
    title,
    questionSummaries: summaries.map(s => s.summary),
    themes: [...new Set(summaries.flatMap(s => s.themes))],
  };
  questionSummariesFlat[v.videoId] = summaries.map(s => s.summary);
}

// memberSummaryの動画も処理
for (const [name, data] of Object.entries(analysis.memberSummary)) {
  for (const v of data.videos) {
    if (!v.questions || v.questions.length === 0) continue;
    if (videoSummaries[v.videoId]) continue;

    const title = titles[v.videoId] || v.title || '';
    const summaries = v.questions.map(q => {
      totalQ++;
      const result = summarizeQuestion(q);
      if (result.summary.length > 8 && !isPlaceholder(result.summary)) {
        summarized++;
        return result;
      }
      const cleaned = q.replace(/[\n\r]/g, '').replace(/^[^ぁ-んァ-ヶ\u4e00-\u9fff]*/,'')
        .replace(/.{2,6}(君|くん)の一般質問を許します/g,'')
        .replace(/委?\d+番?\d*/g,'').trim();
      const fb = cleaned.length > 55 ? cleaned.substring(0, 52) + '…' : cleaned;
      return { summary: fb, themes: result.themes };
    });

    videoSummaries[v.videoId] = {
      title,
      questionSummaries: summaries.map(s => s.summary),
      themes: [...new Set(summaries.flatMap(s => s.themes))],
    };
    questionSummariesFlat[v.videoId] = summaries.map(s => s.summary);
  }
}

fs.writeFileSync('video_summaries.json', JSON.stringify(videoSummaries, null, 2));
fs.writeFileSync('question_summaries.json', JSON.stringify(questionSummariesFlat, null, 2));
console.log(`要約完了: ${summarized}/${totalQ}件`);
console.log(`動画数: ${Object.keys(videoSummaries).length}`);

// サンプル表示
const sample = Object.entries(videoSummaries).slice(0, 5);
for (const [id, data] of sample) {
  console.log(`\n${data.title}:`);
  data.questionSummaries.forEach((s, i) => console.log(`  ${i+1}. ${s}`));
}
