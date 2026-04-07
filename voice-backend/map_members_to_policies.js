// 議員発言 × 第五次伊東市総合計画 施策 マッピング
// 言及の有無のみを記録（スコア化はしない）
const fs = require('fs');
const path = require('path');

const analysis = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'analysis_data.json'), 'utf-8'));
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sougoukeikaku_v5.json'), 'utf-8'));

// 各施策のキーワード辞書（手動キュレーション）
// 複数キーワードのうち1つでもマッチすれば「言及あり」と判定
const SUB_KEYWORDS = {
  '1-1': ['危機管理','防災','避難所','自主防災','津波','南海トラフ','相模トラフ','火山','帰宅困難','防災訓練','安否確認','要援護','避難計画','防災意識','地域防災'],
  '1-2': ['治水','浸水','洪水','内水','雨水','河川','豪雨','土砂災害','土石流','急傾斜','砂防','ゲリラ豪雨'],
  '1-3': ['耐震','耐震化','公共施設','老朽化','建築物','空家','空き家','橋梁','インフラ長寿命','倒壊','ブロック塀'],
  '1-4': ['交通安全','防犯','犯罪','振り込め','特殊詐欺','消費生活','消費者','高齢者事故','飲酒運転','暴走','交番'],
  '1-5': ['消防','救急','救命','AED','消防団','消防署','救助','火災','救急搬送','救命率'],
  '2-1': ['地域医療','医師','医師不足','病院','診療所','救急医療','在宅医療','市民病院','医療体制','看護'],
  '2-2': ['健康づくり','健康寿命','健診','がん検診','特定健診','生活習慣病','メタボ','介護予防','フレイル','保健'],
  '2-3': ['出産','妊娠','産前','産後','母子','育児','子育て','不妊','乳幼児','児童手当','ネウボラ'],
  '2-4': ['保育','保育所','保育園','幼稚園','認定こども園','待機児童','幼児教育','一時保育','病児保育'],
  '2-5': ['高齢者','介護','介護保険','地域包括','認知症','老人','シルバー','介護予防','特別養護','デイサービス','グループホーム'],
  '2-6': ['障がい','障害','障がい者','障害者','バリアフリー','福祉サービス','特別支援','手話','発達障'],
  '2-7': ['地域福祉','民生委員','社会福祉','生活困窮','生活保護','引きこもり','ひきこもり','ボランティア','見守り','孤立','孤独'],
  '2-8': ['多様性','ダイバーシティ','LGBT','性的少数','男女共同','ジェンダー','人権','外国人','多文化','SDGs','パートナーシップ'],
  '2-9': ['国民健康保険','国保','後期高齢','年金','保険料'],
  '3-1': ['自然','生物多様','里山','緑地','公園整備','自然環境','生態系','森林','希少種'],
  '3-2': ['ごみ','リサイクル','廃棄物','分別','3R','資源化','ごみ処理','最終処分','ゼロカーボン','脱炭素','温暖化','再エネ','太陽光','温室効果'],
  '3-3': ['下水道','合併浄化槽','生活排水','浄化槽','汚水','下水処理'],
  '3-4': ['上水道','水道','給水','水源','配水','漏水','水質','水道料金'],
  '3-5': ['都市計画','景観','まちなか','中心市街地','土地利用','都市空間','立地適正化','駅前','再開発'],
  '3-6': ['公共交通','バス','路線バス','デマンド','タクシー','鉄道','伊豆急','地域公共交通','交通空白','MaaS'],
  '3-7': ['道路','市道','歩道','舗装','橋','渋滞','歩行者','交差点','自転車道','道路整備','生活道路'],
  '4-1': ['教育環境','学校施設','学校給食','給食','校舎','教室','学区','通学','学校統廃合','少人数学級','ICT教育','GIGAスクール','タブレット'],
  '4-2': ['小学校','中学校','学力','いじめ','不登校','学習','教員','英語教育','プログラミング','特別支援教育','食育'],
  '4-3': ['生涯学習','公民館','図書館','文化センター','講座','学び直し','成人教育'],
  '4-4': ['青少年','青少年育成','子ども会','放課後','児童館','ヤングケアラー','非行','若者'],
  '4-5': ['スポーツ','体育','運動','スポーツ施設','総合体育館','市民運動会','スポーツ推進','部活'],
  '4-6': ['文化','芸術','文化財','史跡','博物館','美術','伝統芸能','郷土芸能','文化振興'],
  '4-7': ['郷土','郷土愛','シビックプライド','ふるさと','歴史学習'],
  '5-1': ['観光資源','温泉','海岸','景勝','観光地','名所','伊東の魅力','城ヶ崎','大室山'],
  '5-2': ['観光','インバウンド','観光客','宿泊','旅館','ホテル','観光戦略','DMO','観光PR','体験型','ワーケーション'],
  '5-3': ['広域連携','伊豆半島','伊豆ジオパーク','周遊','広域観光','ジオパーク'],
  '5-4': ['商工業','商店街','中小企業','創業','起業','事業承継','産業振興','空き店舗','キャッシュレス'],
  '5-5': ['農業','林業','農家','担い手','耕作放棄','農産物','みかん','椎茸','6次産業','森林整備'],
  '5-6': ['水産','漁業','漁港','漁協','魚','養殖','水産物','ブランド化'],
  '5-7': ['移住','定住','空き家バンク','UIJターン','関係人口','二地域居住','テレワーク','リモートワーク'],
  '5-8': ['国際交流','姉妹都市','都市交流','友好都市'],
  'base-1': ['市民参加','協働','自治会','町内会','NPO','市民活動','パブリックコメント','住民参加'],
  'base-2': ['行政運営','行政改革','DX','デジタル化','窓口','行政サービス','人材育成','職員','情報公開','広報'],
  'base-3': ['財政','財政運営','歳入','歳出','市債','基金','ふるさと納税','税収','健全化','公共施設マネジメント','受益者負担'],
};

// 議員正規化マップ（全角スペース等を除去するだけ）
const normName = n => (n||'').replace(/\s+/g,'').trim();

// 結果構造
// map[memberName][subId] = { count, videos: [{videoId, date, title, url, matchedKeywords, snippet}] }
const memberMap = {};

let totalMatches = 0;

for (const v of analysis.videos) {
  const texts = [];
  if (v.questions) texts.push(...v.questions);
  if (v.topics) texts.push(...v.topics);
  if (v.title) texts.push(v.title);
  const fullText = texts.join('\n');
  if (!fullText) continue;

  const speakers = (v.speakers||[]).map(normName).filter(Boolean);
  if (speakers.length===0) continue;

  // この動画が言及した施策を判定
  const matchedSubs = {};
  for (const [subId, kws] of Object.entries(SUB_KEYWORDS)) {
    const hits = kws.filter(kw => fullText.includes(kw));
    if (hits.length > 0) {
      matchedSubs[subId] = hits;
    }
  }

  if (Object.keys(matchedSubs).length === 0) continue;

  for (const sp of speakers) {
    if (!memberMap[sp]) memberMap[sp] = {};
    for (const [subId, hits] of Object.entries(matchedSubs)) {
      if (!memberMap[sp][subId]) memberMap[sp][subId] = { count: 0, videos: [] };
      memberMap[sp][subId].count++;
      // 最初の3件までスニペット保存（後でUIから参照）
      if (memberMap[sp][subId].videos.length < 5) {
        memberMap[sp][subId].videos.push({
          videoId: v.videoId,
          date: v.date,
          title: v.title,
          url: v.url,
          sessionType: v.sessionType,
          matchedKeywords: hits,
        });
      }
      totalMatches++;
    }
  }
}

// 各施策ごとの「言及議員数」集計（全体ビュー用）
const subCoverage = {};
for (const subId of Object.keys(SUB_KEYWORDS)) {
  const members = Object.keys(memberMap).filter(m => memberMap[m][subId]);
  subCoverage[subId] = {
    mentioned_members: members.length,
    total_mentions: members.reduce((s,m)=>s+memberMap[m][subId].count, 0),
    members: members,
  };
}

// 各議員の言及施策総数
const memberCoverage = {};
for (const m of Object.keys(memberMap)) {
  const subIds = Object.keys(memberMap[m]);
  memberCoverage[m] = {
    mentioned_sub_count: subIds.length,
    total_mentions: subIds.reduce((s,id)=>s+memberMap[m][id].count, 0),
  };
}

const out = {
  meta: {
    generated_at: new Date().toISOString(),
    method: 'keyword_matching',
    disclaimer: '本データは議員発言動画タイトル・質問抽出テキストに含まれるキーワードの機械的一致を示すものです。言及の「有無」のみを記録しており、発言の賛否・質・評価は一切含みません。発言の文脈は必ず実際の動画で確認してください。',
    sub_policy_count: Object.keys(SUB_KEYWORDS).length,
    total_members: Object.keys(memberMap).length,
    total_matches: totalMatches,
  },
  member_map: memberMap,
  sub_coverage: subCoverage,
  member_coverage: memberCoverage,
};

const outPath = path.join(__dirname, '..', 'data', 'member_policy_map.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
console.log(`✓ Wrote ${outPath}`);
console.log(`  members: ${Object.keys(memberMap).length}`);
console.log(`  sub policies with mentions: ${Object.values(subCoverage).filter(s=>s.mentioned_members>0).length}/${Object.keys(SUB_KEYWORDS).length}`);
console.log(`  total matches: ${totalMatches}`);
// 上位5議員
const topMembers = Object.entries(memberCoverage).sort((a,b)=>b[1].mentioned_sub_count-a[1].mentioned_sub_count).slice(0,5);
console.log('  top 5 members by sub coverage:');
topMembers.forEach(([m,c])=>console.log(`    ${m}: ${c.mentioned_sub_count}施策 / ${c.total_mentions}回`));
// 言及の多い施策
const topSubs = Object.entries(subCoverage).sort((a,b)=>b[1].mentioned_members-a[1].mentioned_members).slice(0,5);
console.log('  top 5 sub policies by member coverage:');
topSubs.forEach(([id,c])=>console.log(`    ${id}: ${c.mentioned_members}議員 / ${c.total_mentions}回`));
