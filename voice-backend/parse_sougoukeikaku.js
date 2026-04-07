// 第五次伊東市総合計画 raw text から構造化JSONを生成
// 入力: voice-backend/sougoukeikaku_raw.txt
// 出力: data/sougoukeikaku_v5.json

const fs = require('fs');
const path = require('path');

const RAW = fs.readFileSync(
  path.join(__dirname, 'sougoukeikaku_raw.txt'),
  'utf8'
);
const lines = RAW.split(/\r?\n/);

// 各サブ政策の開始行（0-index想定だが、lines配列は1始まりのgrep結果に合わせて調整）
// grep結果は1-basedなのでlines[n-1]でアクセス
const subPolicyStarts = [
  // [goal#, sub#, line(1-based), title]
  [1, 1, 1644, '危機管理体制の充実'],
  [1, 2, 1798, '総合治水対策の強化'],
  [1, 3, 1933, '災害に強い建築物や公共施設の整備'],
  [1, 4, 2067, '生活安全の推進'],
  [1, 5, 2202, '消防体制の強化'],
  [2, 1, 2337, '地域医療の充実'],
  [2, 2, 2490, '健康づくり支援'],
  [2, 3, 2654, '出産・子育て支援の充実'],
  [2, 4, 2791, '保育及び幼児教育の充実'],
  [2, 5, 2930, '高齢者福祉の充実'],
  [2, 6, 3089, '障がい者福祉の充実'],
  [2, 7, 3238, '地域福祉の充実'],
  [2, 8, 3382, '多様性のある社会の実現'],
  [2, 9, 3514, '保険・年金制度の運営'],
  [3, 1, 3650, '自然との共生社会の推進'],
  [3, 2, 3787, '循環型社会の推進'],
  [3, 3, 3928, '生活排水対策の充実'],
  [3, 4, 4080, '安全でおいしい水の安定供給'],
  [3, 5, 4220, '魅力的な都市空間の創造'], // approximate, will parse
  [3, 6, 4370, '公共交通体系の充実'],
  [3, 7, 4502, '道路環境の整備'],
  [4, 1, 4645, '教育環境の整備'],
  [4, 2, 4793, '未来を創る教育の充実（小・中学校）'],
  [4, 3, 4945, '生涯学習活動の推進'],
  [4, 4, 5091, '青少年の健全な育成'],
  [4, 5, 5241, '市民スポーツ活動の推進'],
  [4, 6, 5391, '歴史・芸術文化の振興'],
  [4, 7, 5536, '郷土愛の醸成'],
  [5, 1, 5671, '地域資源の魅力向上'],
  [5, 2, 5838, '新たな観光形態の構築・推進'],
  [5, 3, 5989, '広域連携による誘客の拡充'],
  [5, 4, 6126, '商工業の振興'],
  [5, 5, 6283, '農林業の振興'],
  [5, 6, 6410, '水産業の振興'],
  [5, 7, 6524, '移住定住の促進・関係人口の拡大'],
  [5, 8, 6662, '国際交流の推進・都市交流の促進'],
  [9, 1, 6795, '全員参加によるまちづくりの推進'],
  [9, 2, 6940, '市民の信頼に応える行政運営'],
  [9, 3, 7090, '健全かつ持続可能な財政運営'],
  [99, 99, 7246, 'END']
];

// セクション抽出ヘルパー：開始行〜次の政策開始行までの範囲でセクション見出し(現状/課題/施策の方針)を探す
function extractSection(startLine, endLine, sectionName) {
  const result = [];
  let inSection = false;
  // sectionName exact match（「課題」or「現状」単独行）
  for (let i = startLine; i < endLine && i < lines.length; i++) {
    const raw = lines[i] || '';
    const trimmed = raw.trim();
    if (trimmed === sectionName) {
      inSection = true;
      continue;
    }
    if (inSection) {
      // 次セクション見出しで終了
      if (
        trimmed === '課題' ||
        trimmed === '現状' ||
        trimmed.startsWith('④施策の方針') ||
        trimmed.startsWith('⑤基本的な取組') ||
        trimmed.startsWith('⑥役割分担') ||
        trimmed.startsWith('⑦関連する個別計画') ||
        trimmed.startsWith('①施策が目指す姿') ||
        /^[0-9]+\s+[^\s]/.test(trimmed) // 次の施策番号
      ) {
        break;
      }
      // 箇条書き取得（• で始まる行）
      const m = raw.match(/^\s*[•・]\s*(.+)$/);
      if (m) {
        result.push(cleanText(m[1]));
      } else if (result.length > 0 && trimmed && !trimmed.startsWith('※') && !/^[0-9]+$/.test(trimmed)) {
        // 前行の続き（インデント折り返し）と推定
        const last = result[result.length - 1];
        if (last && last.length < 150) {
          result[result.length - 1] = last + trimmed;
        }
      }
    }
  }
  return result;
}

function cleanText(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/　/g, '')
    .trim();
}

// 施策ごとにKPIを抜き取る（②成果指標（KPI） 以降の数行）
function extractKpis(startLine, endLine) {
  const kpis = [];
  for (let i = startLine; i < endLine && i < lines.length; i++) {
    const raw = lines[i] || '';
    if (raw.includes('②成果指標')) {
      // 次の「③現状と課題」までの範囲でKPIエントリを収集
      const sub = [];
      for (let j = i + 1; j < endLine && j < lines.length; j++) {
        const l = lines[j] || '';
        if (l.includes('③現状と課題') || l.trim() === '現状') break;
        sub.push(l);
      }
      // パース：行に日本語+年度+数値があればエントリ
      // レイアウト崩れがひどいので、簡易的に行ごと格納
      const rawText = sub.join('\n').trim();
      if (rawText) kpis.push({ raw: rawText });
      break;
    }
  }
  return kpis;
}

const subPolicies = [];
for (let i = 0; i < subPolicyStarts.length - 1; i++) {
  const [goal, sub, start, title] = subPolicyStarts[i];
  const end = subPolicyStarts[i + 1][2];
  if (goal === 99) break;
  const current = extractSection(start, end, '現状');
  const challenges = extractSection(start, end, '課題');
  const kpis = extractKpis(start, end);
  subPolicies.push({
    id: goal === 9 ? `base-${sub}` : `${goal}-${sub}`,
    goal: goal === 9 ? '構想の推進' : `政策目標${goal}`,
    goal_num: goal,
    sub_num: sub,
    title,
    current_state: current,
    challenges,
    kpis_raw: kpis,
    source_line_start: start,
    source_line_end: end
  });
}

// 9つのまちづくり課題（ハードコード、抽出済み）
const machizukuriKadai = [
  {
    num: 1,
    title: '安全で安心して暮らせるまちづくりが求められます',
    summary: '生活環境の向上、防災・減災、消防救急体制、感染症対応など多岐にわたる対応が必要',
    key_points: [
      '東日本大震災以降、豪雨・台風・土砂災害への備えが高まっている',
      '建築物の耐震化、空家・倒木等の日常安全確保',
      '多様なニーズに対応した避難所運営、実践的避難訓練',
      '消防・救急体制の充実と救命率向上',
      'COVID-19等、想定外事象への迅速な対応体制'
    ],
    source_page: 7
  },
  {
    num: 2,
    title: '人口減少・少子高齢化時代に対応したまちづくりが求められます',
    summary: '社人研推計では2045年に総人口41,000人程度、高齢化率55%。生産年齢人口減少への対応が急務',
    key_points: [
      '2045年に高齢化率55%（2人に1人が高齢者）の予測',
      '生産年齢人口の減少と経済規模縮小が多分野に影響',
      '移住定住者の確保、子育て環境づくりが必要'
    ],
    source_page: 8
  },
  {
    num: 3,
    title: '心身ともに健やかに暮らせるまちづくりが求められます',
    summary: '医療機関利用の市外依存、医師・病床数が全国平均を大きく下回る。介護・保健・福祉充実が必要',
    key_points: [
      '入院患者の半数以上が市外の医療機関を利用',
      '人口10万人あたり病床数345（全国1216）医師数119（全国246）',
      '団塊世代の高齢化で介護サービス利用者増',
      '少子高齢化により保健・医療・福祉・社会保障の重要性増'
    ],
    source_page: 9
  },
  {
    num: 4,
    title: '個性豊かな人づくりと生きがいを感じられるまちづくりが求められます',
    summary: '質の高い学校教育、ICT活用、インクルーシブ教育、生涯学習環境の充実',
    key_points: [
      '「知・徳・体」のバランスがとれた子どもの育成',
      'Society5.0時代に対応するICT環境整備と情報活用能力',
      'インクルーシブ教育の推進',
      '市民の生涯学習・文化・スポーツ活動環境の整備'
    ],
    source_page: 9
  },
  {
    num: 5,
    title: '良好な自然環境と生活環境が広がるまちづくりが求められます',
    summary: '市域の約45%が富士箱根伊豆国立公園。自然景観保全と生活環境問題への対応',
    key_points: [
      '森林の減少、未整備森林の増加、海岸環境の悪化',
      '大気汚染・水質汚濁・土壌汚染・騒音・振動・悪臭への対応',
      '「郷土の宝」としての自然環境を後世に継承'
    ],
    source_page: 10
  },
  {
    num: 6,
    title: '社会情勢の変化に対応した計画的で魅力あるまちづくりが求められます',
    summary: '市街地の空家・空き地増加、都市のスポンジ化が懸念。公共交通と都市機能集約',
    key_points: [
      '空家・空き地増加による都市スポンジ化',
      '地域拠点の形成と既存集落コミュニティ維持',
      '公共交通の利便性向上、拠点ネットワーク形成',
      '誰一人取り残されないまちづくり'
    ],
    source_page: 10
  },
  {
    num: 7,
    title: '観光を軸とした活力ある産業を創造するまちづくりが求められます',
    summary: '観光競争激化、COVID-19影響、商工業・農林水産業の停滞への対応',
    key_points: [
      '外国人宿泊者数：2012年18,479人→2015年104,370人（5倍以上）もCOVIDで激減',
      'COVID-19による観光への大打撃、新時代の観光振興策が必要',
      '商業・工業の販売額・出荷額減少、雇用確保',
      '農林業：担い手育成、6次産業化、森林管理',
      '漁業：2014年以降漁獲量・漁獲高減少、経営体数も減少'
    ],
    source_page: 10
  },
  {
    num: 8,
    title: '心がふれあう地域社会があるまちづくりが求められます',
    summary: '町内会の役割の中で地域連帯感の低下。移住者・高齢者・多様性のある地域社会づくり',
    key_points: [
      '人口減少・少子高齢化・核家族化・価値観多様化で地域連帯感低下',
      '町内会活動支援、情報・機会提供',
      '移住者が暮らしやすい環境、男女共同参画、青少年育成',
      '高齢者が住み慣れた地域で暮らせる環境',
      '多様性が尊重される地域社会'
    ],
    source_page: 12
  },
  {
    num: 9,
    title: 'みんなが役割と責務を自覚するとともに、実効性の高い行政経営が求められます',
    summary: '自助・共助・公助の精神に基づく協働のまちづくりと、実効性の高い行政経営',
    key_points: [
      '自助・共助・公助の理解と実践',
      '市民・事業者・行政の役割と責務の自覚',
      '現場の実情に基づく実効性の高い施策立案',
      '長期的展望に立った計画的で生産性の高い行政経営',
      '市域を越えた広域取組'
    ],
    source_page: 12
  }
];

// 将来人口（計画書18ページ）
const futurePopulation = {
  source: '国立社会保障・人口問題研究所推計 + 伊東市目標',
  baseline: {
    year: 2015,
    total: 68345,
    age_0_14: { count: 6869, pct: 10.1 },
    age_15_64: { count: 34273, pct: 50.1 },
    age_65_plus: { count: 27203, pct: 39.8 }
  },
  projection: [
    { year: 2015, label: 'H27', total: 68345, age_0_14: 6869, age_15_64: 34273, age_65_plus: 27203, elderly_rate: 39.8 },
    { year: 2020, label: 'R2', total: 64203, age_0_14: 5791, age_15_64: 30846, age_65_plus: 27565, elderly_rate: 42.9 },
    { year: 2025, label: 'R7', total: 59606, age_0_14: 4859, age_15_64: 28297, age_65_plus: 26449, elderly_rate: 44.4 },
    { year: 2030, label: 'R12', total: 54918, age_0_14: 4147, age_15_64: 25535, age_65_plus: 25235, elderly_rate: 46.0 },
    { year: 2035, label: 'R17', total: 50272, age_0_14: 3586, age_15_64: 21995, age_65_plus: 24690, elderly_rate: 49.1 },
    { year: 2040, label: 'R22', total: 45746, age_0_14: 3206, age_15_64: 18171, age_65_plus: 24369, elderly_rate: 53.3 },
    { year: 2045, label: 'R27', total: 41459, age_0_14: 2866, age_15_64: 15762, age_65_plus: 22831, elderly_rate: 55.1 },
    { year: 2050, label: 'R32', total: 37319, age_0_14: 2522, age_15_64: 13957, age_65_plus: 20841, elderly_rate: 55.8 },
    { year: 2055, label: 'R37', total: 33217, age_0_14: 2180, age_15_64: 12526, age_65_plus: 18511, elderly_rate: 55.7 },
    { year: 2060, label: 'R42', total: 29185, age_0_14: 1867, age_15_64: 11139, age_65_plus: 16179, elderly_rate: 55.4 }
  ],
  target: {
    year_2025: { total: 63800, age_0_14: 5300, age_15_64: 31400, age_65_plus: 27100 },
    year_2030: { total: 60000, age_0_14: 4700, age_15_64: 29100, age_65_plus: 26200 }
  },
  note: '社人研推計は2030年に54,918人まで減少と予測するが、伊東市は目標人口として60,000人（約5,082人の上積み）を設定。移住定住促進・子育て環境整備等で人口減少抑制を目指す。',
  source_page: 18
};

// 5大政策目標
const policyGoals = [
  {
    num: 1,
    title: '安全で安心して暮らせるまち',
    theme: '危機管理',
    description: '自然災害などから市民等を守ることができるまちを目指し、災害時の情報伝達体制の強化、避難所等の環境整備、感染症対策等を推進'
  },
  {
    num: 2,
    title: '誰もが健やかに暮らし活躍できるまち',
    theme: '医療・健康・福祉',
    description: '医療機関の役割分担、健康づくり、子育て支援、高齢者・障がい者福祉、多様性のある社会の実現'
  },
  {
    num: 3,
    title: '良好な環境が広がり快適に暮らせるまち',
    theme: '自然・環境・都市',
    description: '自然との共生、循環型社会、生活排水対策、上水道、都市空間、公共交通、道路環境の整備'
  },
  {
    num: 4,
    title: '心豊かな人を育み生涯にわたって学習できるまち',
    theme: '教育・歴史・文化',
    description: '教育環境整備、未来を創る教育、生涯学習、青少年育成、スポーツ、歴史・芸術文化、郷土愛'
  },
  {
    num: 5,
    title: '活力にあふれ交流でにぎわうまち',
    theme: '観光・産業・交流',
    description: '地域資源魅力向上、新観光形態、広域連携、商工業・農林水産業振興、移住定住、国際・都市交流'
  }
];

const result = {
  meta: {
    title: '第五次伊東市総合計画',
    period: '2021-2030（令和3年度-令和12年度）',
    source_document: 'dai5ji_sougoukeikaku.pdf (97ページ)',
    issued_by: '伊東市',
    issued_date: '令和3年3月',
    mayor_at_issuance: '小野達也',
    vision: '出会い　つながり　みんなで育む　自然豊かなやさしいまち　いとう',
    vision_tagline: '行ってみたい住んでみたい住んでいたいまちづくり',
    extracted_at: new Date().toISOString(),
    extraction_method: 'pdftotext -layout + Node.js parser',
    known_limitations: [
      '計画策定時点（2021年3月）の記述であり、COVID-19等一部記述は現時点で状況が変化している',
      '一部の目次・図表はPDFフォント埋め込みにより文字化けしており本文からは抽出できていない',
      'KPIの現状値は2019-2020年度、目標値は2025年度（計画中間年次）'
    ]
  },
  future_population: futurePopulation,
  machizukuri_kadai: machizukuriKadai,
  policy_goals: policyGoals,
  sub_policies: subPolicies
};

const outPath = path.join(__dirname, '..', 'data', 'sougoukeikaku_v5.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
console.log(`✓ Wrote ${outPath}`);
console.log(`  - machizukuri_kadai: ${machizukuriKadai.length}`);
console.log(`  - policy_goals: ${policyGoals.length}`);
console.log(`  - sub_policies: ${subPolicies.length}`);
const totalChallenges = subPolicies.reduce((s, p) => s + p.challenges.length, 0);
const totalCurrent = subPolicies.reduce((s, p) => s + p.current_state.length, 0);
console.log(`  - total current_state bullets: ${totalCurrent}`);
console.log(`  - total challenges bullets: ${totalChallenges}`);
