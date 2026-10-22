// 「数字で見る伊東市」ページ（numbers/index.html）を生成する
//   入力: data/stats/dashboard.json（統計ダッシュボード）, data/stats/ipss_r5.json（社人研 2023年推計）
//   実行: node build_pages.js
// 方針:
//   - 数値は公式統計の値をそのまま使う。欠損は表示しない（ゼロにしない）
//   - 「この数字から何が分かる？」の事実は、データから計算して自動生成する（手入力の数字を置かない）
//   - 事実と、読むときの注意（解釈）を分けて書き、良い・悪いの判定はしない
const fs = require('fs');
const path = require('path');

const D = require('./data/stats/dashboard.json');
const P = require('./data/stats/ipss_r5.json');
const ITO = '22208';
const OUT_DIR = path.join(__dirname, 'numbers');

// ---------- 小さな道具 ----------
const nf = n => (n == null ? '—' : Number(n).toLocaleString('ja-JP'));
const pct = (a, b) => ((b - a) / a * 100);
const sgn = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toLocaleString('ja-JP', { maximumFractionDigits: 1 });
const oku = senYen => Math.round(senYen / 100000 * 10) / 10; // 千円 → 億円（小数1桁）
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const series = key => (D.data[key] && D.data[key][ITO]) || [];
const byYear = key => Object.fromEntries(series(key).map(r => [r.year, r]));
const ind = key => D.indicators[key];
const fetchedDate = iso => { const d = new Date(iso); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };

function dashSource(keys) {
  return keys.map(k => {
    const i = ind(k), s = series(k);
    return {
      label: i.shortName,
      org: D.meta.source,
      stat: i.statName,
      unit: i.unit,
      period: s.length ? `${s[0].year}〜${s[s.length - 1].year}${s[0].period}` : '値なし',
      url: D.meta.sourceUrl,
      fetchedAt: D.meta.fetchedAt,
      definition: i.definition,
      annotation: i.annotation,
    };
  });
}
const ipssSource = {
  label: '将来推計人口',
  org: P.meta.source,
  stat: P.meta.title,
  unit: '人',
  period: '2020年（実績）〜2050年（推計）',
  url: P.meta.sourceUrl,
  fetchedAt: P.meta.fetchedAt,
  definition: P.meta.note,
  annotation: '',
};

const charts = [];
const ipssIto = P.regions[ITO].years;
const ipssYears = Object.keys(ipssIto).map(Number).sort((a, b) => a - b);

// ========== 人口 ==========
{ // 1. 総人口の推移と将来推計
  const census = series('pop_total');
  const years = [...new Set([...census.map(r => r.year), ...ipssYears])].sort((a, b) => a - b);
  const cMap = byYear('pop_total');
  const first = census[0], last = census[census.length - 1];
  const peak = census.reduce((m, r) => (r.value > m.value ? r : m), census[0]);
  const p2020 = ipssIto[2020].total, p2050 = ipssIto[2050].total, p2025 = ipssIto[2025] && ipssIto[2025].total;
  const facts = [
    `国勢調査の総人口は、${first.year}年の${nf(first.value)}人から${last.year}年の${nf(last.value)}人へ、${nf(Math.abs(last.value - first.value))}人${last.value < first.value ? '減りました' : '増えました'}（${sgn(pct(first.value, last.value))}%）。`,
    `この期間で人口が最も多かったのは${peak.year}年の${nf(peak.value)}人です。`,
    `国立社会保障・人口問題研究所の2023年推計では、2050年の人口は${nf(p2050)}人と見込まれています（2020年の${nf(p2020)}人から${sgn(pct(p2020, p2050))}%）。`,
  ];
  if (cMap[2025] && p2025) {
    const gap = cMap[2025].value - p2025;
    facts.push(`2025年の国勢調査の人口（${nf(cMap[2025].value)}人）は、2023年推計が見込んだ2025年の値（${nf(p2025)}人）を${nf(Math.abs(gap))}人${gap < 0 ? '下回り' : '上回り'}ました。`);
  }
  charts.push({
    id: 'pop-trend', section: 'pop', type: 'line',
    title: '総人口の推移と将来推計',
    lead: '国勢調査による実績（実線）と、国の研究機関による将来推計（点線）を並べています。',
    labels: years,
    datasets: [
      { label: '実績（国勢調査）', data: years.map(y => (cMap[y] ? cMap[y].value : null)), style: 'actual' },
      { label: '推計（社人研 2023年推計）', data: years.map(y => (ipssIto[y] && y >= 2020 ? ipssIto[y].total : null)), style: 'projection' },
    ],
    unit: '人',
    table: { head: ['年', '実績（国勢調査）', '推計（社人研）'], rows: years.map(y => [y, cMap[y] ? cMap[y].value : '', ipssIto[y] ? ipssIto[y].total : '']) },
    facts,
    cautions: [
      '将来推計は、出生や人の移動がこれまでの傾向で続くと仮定した見通しです。政策や社会の変化で実際の数は変わります。',
      '国勢調査は5年ごと（10月1日時点）の人口です。市が毎月公表する住民基本台帳の人口とは数え方が違うため、値は一致しません。',
      '2020年の推計値は国勢調査の実績値です（推計の出発点）。',
    ],
    sources: [...dashSource(['pop_total']), ipssSource],
  });
}

{ // 2. 年齢3区分の人数
  const c014 = byYear('pop_0_14'), c1564 = byYear('pop_15_64'), c65 = byYear('pop_65over');
  const cYears = series('pop_0_14').map(r => r.year);
  const projYears = ipssYears.filter(y => y > Math.max(...cYears));
  const sum = (arr, a, b) => arr.slice(a, b).reduce((s, v) => s + (v || 0), 0);
  const proj = y => { const a = ipssIto[y].ages; return [sum(a, 0, 3), sum(a, 3, 13), sum(a, 13, 20)]; };
  const labels = [...cYears.map(String), ...projYears.map(y => `${y}推計`)];
  const g = i => [...cYears.map(y => [c014, c1564, c65][i][y].value), ...projYears.map(y => proj(y)[i])];
  const fy = cYears[0], ly = cYears[cYears.length - 1];
  const share = byYear('share_65over');
  const facts = [
    `65歳以上の人は、${fy}年の${nf(c65[fy].value)}人から${ly}年の${nf(c65[ly].value)}人になりました。`,
    `0〜14歳の子どもは、${fy}年の${nf(c014[fy].value)}人から${ly}年の${nf(c014[ly].value)}人になりました。`,
    `15〜64歳は、${fy}年の${nf(c1564[fy].value)}人から${ly}年の${nf(c1564[ly].value)}人になりました。`,
  ];
  if (share[ly]) facts.push(`${ly}年の高齢化率（65歳以上の割合）は${share[ly].value}%です（国勢調査）。`);
  charts.push({
    id: 'age-groups', section: 'pop', type: 'stacked',
    title: '年齢3区分の人数',
    lead: '子ども（0〜14歳）、働く世代の中心（15〜64歳）、高齢者（65歳以上）の人数の移り変わりです。「推計」と付いた年は将来推計です。',
    labels,
    datasets: [
      { label: '0〜14歳', data: g(0), color: 0 },
      { label: '15〜64歳', data: g(1), color: 1 },
      { label: '65歳以上', data: g(2), color: 2 },
    ],
    unit: '人',
    table: { head: ['年', '0〜14歳', '15〜64歳', '65歳以上'], rows: labels.map((l, i) => [l, g(0)[i], g(1)[i], g(2)[i]]) },
    facts,
    cautions: [
      '国勢調査の実績には年齢が分からない人が含まれないため、3区分の合計は総人口と一致しないことがあります。',
      '推計年の3区分は、社人研の5歳ごとの推計値を足し合わせて計算しました。',
    ],
    sources: [...dashSource(['pop_0_14', 'pop_15_64', 'pop_65over', 'share_65over']), ipssSource],
  });
}

{ // 3. 人口ピラミッド
  const pyrYears = [2020, 2035, 2050].filter(y => ipssIto[y]);
  const ages = P.ageLabels;
  const peakAge = y => { const a = ipssIto[y].ages; let i = 0; a.forEach((v, k) => { if (v > a[i]) i = k; }); return [ages[i], a[i]]; };
  const facts = pyrYears.map(y => { const [l, v] = peakAge(y); return `${y}年${y === 2020 ? '（実績）' : '（推計）'}に最も人数が多い年齢層は「${l}」で${nf(v)}人です。`; });
  charts.push({
    id: 'pyramid', section: 'pop', type: 'pyramid',
    title: '人口ピラミッド（男女・5歳ごと）',
    lead: '左が男性、右が女性です。ボタンで年を切り替えられます。2020年は実績、それ以降は推計です。',
    ages,
    years: pyrYears,
    pyramid: Object.fromEntries(pyrYears.map(y => [y, { male: ipssIto[y].maleAges, female: ipssIto[y].femaleAges, actual: !!ipssIto[y].actual }])),
    unit: '人',
    table: { head: ['年齢', ...pyrYears.flatMap(y => [`${y} 男`, `${y} 女`])], rows: ages.map((a, i) => [a, ...pyrYears.flatMap(y => [ipssIto[y].maleAges[i], ipssIto[y].femaleAges[i]])]) },
    facts,
    cautions: ['ピラミッドは社人研の資料（2020年は国勢調査の実績）を使っています。将来の形は推計の仮定によって変わります。'],
    sources: [ipssSource],
  });
}

{ // 4. 出生数と死亡数
  const b = byYear('births'), d = byYear('deaths');
  const years = series('births').map(r => r.year).filter(y => d[y]);
  const ly = years[years.length - 1], fy = years[0];
  let crossYear = null;
  for (let i = years.length - 1; i >= 0; i--) { if (d[years[i]].value > b[years[i]].value) crossYear = years[i]; else break; }
  const facts = [
    `${ly}年の出生数は${nf(b[ly].value)}人、死亡数は${nf(d[ly].value)}人で、差（自然増減）は${sgn(b[ly].value - d[ly].value)}人です。`,
    `${fy}年の出生数は${nf(b[fy].value)}人でした。`,
  ];
  if (crossYear) facts.push(`${crossYear}年以降、毎年、死亡数が出生数を上回っています。`);
  charts.push({
    id: 'births-deaths', section: 'pop', type: 'line',
    title: '出生数と死亡数（自然増減）',
    lead: '1年間に生まれた人と亡くなった人の数です。',
    labels: years,
    datasets: [
      { label: '出生数', data: years.map(y => b[y].value), style: 'actual', color: 0 },
      { label: '死亡数', data: years.map(y => d[y].value), style: 'actual', color: 3 },
    ],
    unit: '人',
    table: { head: ['年', '出生数', '死亡数', '差（出生−死亡）'], rows: years.map(y => [y, b[y].value, d[y].value, b[y].value - d[y].value]) },
    facts,
    cautions: ['出典の注記では日本人のみの数です。外国人の出生・死亡は含まれません。', '暦年（1月〜12月）の数です。'],
    sources: dashSource(['births', 'deaths']),
  });
}

{ // 5. 転入と転出
  const i = byYear('moves_in'), o = byYear('moves_out');
  const years = series('moves_in').map(r => r.year).filter(y => o[y]);
  const plus = years.filter(y => i[y].value > o[y].value);
  const ly = years[years.length - 1];
  charts.push({
    id: 'migration', section: 'pop', type: 'bar',
    title: '転入と転出（社会増減）',
    lead: '市の外から移り住んだ人（転入）と、市の外へ移った人（転出）の数です。',
    labels: years,
    datasets: [
      { label: '転入者数', data: years.map(y => i[y].value), color: 0 },
      { label: '転出者数', data: years.map(y => o[y].value), color: 3 },
    ],
    unit: '人',
    table: { head: ['年', '転入者数', '転出者数', '差（転入−転出）'], rows: years.map(y => [y, i[y].value, o[y].value, i[y].value - o[y].value]) },
    facts: [
      `${years[0]}年〜${ly}年の${years.length}年間のうち、転入が転出を上回った年は${plus.length}年（${plus.join('・') || 'なし'}年）です。`,
      `${ly}年は転入${nf(i[ly].value)}人、転出${nf(o[ly].value)}人で、差は${sgn(i[ly].value - o[ly].value)}人です。`,
    ],
    cautions: ['年ごとの差は小さく、1年の値だけで傾向を判断するのは難しい指標です。', '統計ダッシュボードで市単位の値が公開されている年だけを表示しています。'],
    sources: dashSource(['moves_in', 'moves_out']),
  });
}

{ // 6. 世帯数
  const h = byYear('households'), p = byYear('pop_total');
  const years = series('households').map(r => r.year);
  const fy = years[0], ly = years[years.length - 1];
  const per = y => (p[y] ? Math.round(p[y].value / h[y].value * 100) / 100 : null);
  charts.push({
    id: 'households', section: 'pop', type: 'bar',
    title: '世帯数',
    lead: '同じ家に住み生計をともにする単位（世帯）の数です。',
    labels: years,
    datasets: [{ label: '世帯数', data: years.map(y => h[y].value), color: 1 }],
    unit: '世帯',
    table: { head: ['年', '世帯数', '1世帯あたり人数（計算値）'], rows: years.map(y => [y, h[y].value, per(y) ?? '']) },
    facts: [
      `世帯数は${fy}年の${nf(h[fy].value)}世帯から${ly}年の${nf(h[ly].value)}世帯になりました。`,
      `1世帯あたりの人数（総人口÷世帯数で計算）は、${fy}年の${per(fy)}人から${ly}年の${per(ly)}人になりました。`,
    ],
    cautions: ['1世帯あたりの人数は、このページで総人口を世帯数で割って計算した値です（公式統計の値ではありません）。'],
    sources: dashSource(['households', 'pop_total']),
  });
}

// ========== 財政 ==========
{ // 7. 財政力指数
  const s = series('fin_index'); const f = s[0], l = s[s.length - 1];
  const max = s.reduce((m, r) => (r.value > m.value ? r : m), s[0]);
  charts.push({
    id: 'fin-index', section: 'fin', type: 'line',
    title: '財政力指数',
    lead: '市が自分の税収などで、標準的な行政サービスの費用をどのくらいまかなえるかを示す指数です。',
    labels: s.map(r => r.year),
    datasets: [{ label: '財政力指数', data: s.map(r => r.value), style: 'actual', color: 1 }],
    unit: '指数',
    table: { head: ['年度', '財政力指数'], rows: s.map(r => [r.year, r.value]) },
    facts: [
      `${f.year}年度は${f.value}、${l.year}年度は${l.value}です。`,
      `この期間で最も高かったのは${max.year}年度の${max.value}です。`,
    ],
    cautions: [
      '計算のしかた：基準財政収入額 ÷ 基準財政需要額（3年間の平均）。1に近いほど、自前の収入で標準的な費用をまかなえる計算になります。',
      '1を下回る分は、主に国からの地方交付税で調整されます。全国の多くの市町村が1を下回っています。',
      '指数の高い・低いだけで、財政の良し悪しや市の努力を判断することはできません。',
    ],
    sources: dashSource(['fin_index']),
  });
}

{ // 8. 経常収支比率
  const s = series('current_ratio'); const f = s[0], l = s[s.length - 1];
  charts.push({
    id: 'current-ratio', section: 'fin', type: 'line',
    title: '経常収支比率',
    lead: '毎年決まって入るお金のうち、毎年決まって出ていく費用（人件費・福祉の扶助費・借金の返済など）に使われる割合です。',
    labels: s.map(r => r.year),
    datasets: [{ label: '経常収支比率', data: s.map(r => r.value), style: 'actual', color: 1 }],
    unit: '%',
    table: { head: ['年度', '経常収支比率（%）'], rows: s.map(r => [r.year, r.value]) },
    facts: [`${f.year}年度は${f.value}%、${l.year}年度は${l.value}%です。`],
    cautions: [
      '比率が高いほど、新しい事業などに自由に使えるお金の割合が小さいことを示します。',
      '一時的な収入や支出の変化でも上下します。1年だけでなく、数年の流れで見ることが大切です。',
    ],
    sources: dashSource(['current_ratio']),
  });
}

{ // 9. 実質公債費比率・将来負担比率
  const a = byYear('debt_service_ratio'), b = byYear('future_burden_ratio');
  const years = [...new Set([...series('debt_service_ratio'), ...series('future_burden_ratio')].map(r => r.year))].sort((x, y) => x - y);
  const la = series('debt_service_ratio').slice(-1)[0], lb = series('future_burden_ratio').slice(-1)[0];
  charts.push({
    id: 'debt-ratios', section: 'fin', type: 'line',
    title: '実質公債費比率と将来負担比率',
    lead: '借金の返済の重さ（実質公債費比率）と、将来負担しなければならない借金などの重さ（将来負担比率）です。',
    labels: years,
    datasets: [
      { label: '実質公債費比率', data: years.map(y => (a[y] ? a[y].value : null)), style: 'actual', color: 1 },
      { label: '将来負担比率', data: years.map(y => (b[y] ? b[y].value : null)), style: 'actual', color: 2 },
    ],
    unit: '%',
    table: { head: ['年度', '実質公債費比率（%）', '将来負担比率（%）'], rows: years.map(y => [y, a[y] ? a[y].value : '', b[y] ? b[y].value : '']) },
    facts: [
      `${la.year}年度の実質公債費比率は${la.value}%です。`,
      `${lb.year}年度の将来負担比率は${lb.value}%です。`,
    ],
    cautions: [
      '法律（地方公共団体の財政の健全化に関する法律）で、市町村の「早期健全化基準」は実質公債費比率25%、将来負担比率350%と決められています。実質公債費比率が18%以上になると、新たな借金（地方債）に許可が必要になります。',
      '借金は、道路や学校など長く使う施設の費用を将来の世代と分け合う仕組みでもあり、少ないほど良いとは限りません。',
      '将来負担比率は、基金（貯金）などで借金を上回る場合に表示されないことがあります。',
    ],
    sources: dashSource(['debt_service_ratio', 'future_burden_ratio']),
  });
}

{ // 10. 歳入：地方税と地方交付税
  const t = byYear('revenue_total'), x = byYear('local_tax'), k = byYear('local_allocation_tax');
  const years = series('local_allocation_tax').map(r => r.year).filter(y => t[y] && x[y]);
  const ly = years[years.length - 1];
  const sh = (v, tot) => Math.round(v / tot * 1000) / 10;
  charts.push({
    id: 'revenue', section: 'fin', type: 'line',
    title: '歳入（市に入るお金）と、市税・地方交付税',
    lead: '1年間の歳入の合計と、そのうち市税などの地方税、国から配られる地方交付税の金額です。',
    labels: years,
    datasets: [
      { label: '歳入の合計', data: years.map(y => oku(t[y].value)), style: 'actual', color: 1 },
      { label: '地方税（市税など）', data: years.map(y => oku(x[y].value)), style: 'actual', color: 0 },
      { label: '地方交付税', data: years.map(y => oku(k[y].value)), style: 'actual', color: 2 },
    ],
    unit: '億円',
    table: { head: ['年度', '歳入合計（千円）', '地方税（千円）', '地方交付税（千円）'], rows: years.map(y => [y, t[y].value, x[y].value, k[y].value]) },
    facts: [
      `${ly}年度の歳入の合計は約${nf(oku(t[ly].value))}億円です。`,
      `そのうち地方税は約${nf(oku(x[ly].value))}億円（${sh(x[ly].value, t[ly].value)}%）、地方交付税は約${nf(oku(k[ly].value))}億円（${sh(k[ly].value, t[ly].value)}%）です。`,
    ],
    cautions: [
      'グラフは千円単位の公表値を億円に直して表示しています（小数点以下1桁）。表には公表値をそのまま載せています。',
      '決算（実際に入ったお金）の値です。予算（見込み）とは異なります。',
    ],
    sources: dashSource(['revenue_total', 'local_tax', 'local_allocation_tax']),
  });
}

{ // 11. 目的別の歳出（最新年度）
  const keys = Object.keys(D.indicators).filter(k => k.startsWith('purpose_'));
  const ly = Math.max(...keys.map(k => (series(k).slice(-1)[0] || {}).year || 0));
  const total = byYear('expenditure_total')[ly];
  const items = keys.map(k => ({ name: ind(k).shortName.replace(/（.*$/, ''), v: (byYear(k)[ly] || {}).value })).filter(i => i.v != null).sort((a, b) => b.v - a.v);
  const top = items.slice(0, 3).map(i => `${i.name}（約${nf(oku(i.v))}億円・${Math.round(i.v / total.value * 1000) / 10}%）`);
  charts.push({
    id: 'expenditure', section: 'fin', type: 'hbar',
    title: `何にお金を使っているか（目的別の歳出・${ly}年度）`,
    lead: '1年間の支出を、福祉・教育・道路など使いみちの分野ごとに分けた金額です。',
    labels: items.map(i => i.name),
    datasets: [{ label: `${ly}年度の歳出`, data: items.map(i => Math.round(i.v / 100000 * 100) / 100), color: 1 }], // 少額の分野が0に丸まらないよう小数2桁
    unit: '億円',
    table: { head: ['分野', `${ly}年度（千円）`, '歳出合計に占める割合（%）'], rows: items.map(i => [i.name, i.v, Math.round(i.v / total.value * 1000) / 10]) },
    facts: [
      `${ly}年度の歳出の合計は約${nf(oku(total.value))}億円です。`,
      `金額が大きい分野は、${top.join('、')}です。`,
    ],
    cautions: [
      '民生費は、子育て・高齢者・障害のある人への支援や生活保護など、福祉にかかる費用です。',
      '大きな工事などがあった年は、その分野の金額が一時的に大きくなります。',
      '割合は、このページで歳出合計に対して計算した値です。',
    ],
    sources: dashSource(['expenditure_total', ...keys]),
  });
}

// ---------- ページ組み立て ----------
const SECTIONS = [
  { id: 'pop', title: '人口', lead: '人口は、まちの将来を考えるうえでいちばん基本になる数字です。実績と将来推計を分けて表示しています。' },
  { id: 'fin', title: '財政', lead: '市のお金の入り方と使い方です。数値はすべて決算（実際の結果）で、予算ではありません。' },
];

const GLOSSARY = [
  ['国勢調査と住民基本台帳', '国勢調査は5年に1度、10月1日時点で住んでいる人を数える国の調査です。住民基本台帳は、住民票の登録をもとに市が毎月数えている人口です。数え方が違うため、同じ時点でも値は一致しません。'],
  ['実績と推計', '実績は実際に数えた値、推計は一定の仮定を置いて計算した将来の見通しです。このページでは、推計を点線や「推計」の文字で区別しています。'],
  ['年と年度', '「年」は1月〜12月、「年度」は4月〜翌年3月です。人口の多くは年、市のお金（財政）は年度で集計されています。'],
  ['決算と予算', '予算は「この1年でいくら使う予定か」、決算は「実際にいくら入り、いくら使ったか」です。このページの財政の数値はすべて決算です。'],
  ['地方交付税', 'どこに住んでいても一定の行政サービスを受けられるよう、国が集めた税の一部を、収入が少ない自治体に多く配る仕組みです。'],
  ['基金と地方債', '基金は市の貯金、地方債は市の借金です。地方債は、長く使う施設の費用を将来の利用者と分け合うために使われることが多く、それ自体が悪いものではありません。'],
];

const fmtFetched = fetchedDate(D.meta.fetchedAt);
const payload = JSON.stringify({ charts }).replace(/</g, '\\u003c');

const card = c => `
<article class="card" id="${c.id}" aria-labelledby="${c.id}-title">
  <h3 id="${c.id}-title">${esc(c.title)}</h3>
  <p class="lead">${esc(c.lead)}</p>
  ${c.type === 'pyramid' ? `<div class="yearbtns" role="group" aria-label="表示する年">${c.years.map((y, i) => `<button type="button" data-year="${y}" aria-pressed="${i === 0}">${y}年${c.pyramid[y].actual ? '（実績）' : '（推計）'}</button>`).join('')}</div>` : ''}
  <div class="chartbox${c.type === 'pyramid' || c.type === 'hbar' ? ' tall' : ''}"><canvas id="cv-${c.id}" role="img" aria-label="${esc(c.title)}のグラフ。数値は下の「表で見る」から確認できます。"></canvas></div>
  <p class="unitnote">単位：${esc(c.unit)}</p>
  <div class="tools">
    <button type="button" class="btn" data-csv="${c.id}">CSVで保存</button>
    <button type="button" class="btn" data-png="${c.id}">画像で保存</button>
  </div>
  <section class="insight" aria-label="この数字から何が分かる？">
    <h4>この数字から何が分かる？</h4>
    <p class="tag fact">データから言えること</p>
    <ul>${c.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    <p class="tag caution">読むときの注意</p>
    <ul>${c.cautions.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
  </section>
  <details class="table"><summary>表で見る</summary>
    <div class="tablewrap"><table><thead><tr>${c.table.head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${c.table.rows.map(r => `<tr>${r.map((v, i) => i === 0 ? `<th scope="row">${esc(v)}</th>` : `<td>${typeof v === 'number' ? nf(v) : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  </details>
  <details class="src"><summary>出典と定義</summary>
    <ul>${c.sources.map(s => `<li><strong>${esc(s.label)}</strong>：${esc(s.org)}「${esc(s.stat)}」／単位 ${esc(s.unit || '—')}／期間 ${esc(s.period)}／取得 ${esc(fetchedDate(s.fetchedAt))}　<a href="${esc(s.url)}" target="_blank" rel="noopener">出典を開く</a>${s.definition ? `<br><span class="def">定義：${esc(s.definition)}</span>` : ''}${s.annotation ? `<br><span class="def">注記：${esc(s.annotation)}</span>` : ''}</li>`).join('')}</ul>
  </details>
</article>`;

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>数字で見る伊東市｜みんなの伊東市</title>
<meta name="description" content="伊東市の人口と財政を、国の公式統計をもとにグラフで確認できるページです。すべての数字に出典・単位・取得日を表示しています。">
<link rel="canonical" href="https://all-ito-city.com/numbers/">
<meta property="og:title" content="数字で見る伊東市｜みんなの伊東市">
<meta property="og:description" content="伊東市の人口と財政を、公式統計をもとにグラフで。出典つき。">
<meta property="og:type" content="website">
<meta property="og:url" content="https://all-ito-city.com/numbers/">
<style>
:root{--bg:#fafafa;--card:#fff;--text:#0a0a0a;--sub:#525252;--border:#e5e5e5;--brand:#2563eb;--brand-d:#1e40af;--fact:#065f46;--fact-bg:#ecfdf5;--warn:#78350f;--warn-bg:#fffbeb;--radius:14px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI","Yu Gothic",Meiryo,sans-serif;font-size:16px;line-height:1.8}
a{color:var(--brand-d)}
.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;background:#fff;padding:8px;z-index:9}
header.top{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:20px 16px 28px}
header.top .wrap,main,footer .wrap{max-width:1040px;margin:0 auto}
.crumb a{color:#dbeafe;font-size:14px}
h1{font-size:28px;margin:8px 0 6px;line-height:1.4}
header.top p{margin:0;color:#e0e7ff;font-size:15px}
.principles{background:rgba(255,255,255,.12);border-radius:12px;padding:12px 14px;margin-top:14px;font-size:14px}
.principles ul{margin:4px 0 0;padding-left:1.2em}
nav.toc{display:flex;gap:8px;flex-wrap:wrap;padding:14px 16px;max-width:1040px;margin:0 auto}
nav.toc a{background:#fff;border:1px solid var(--border);border-radius:999px;padding:6px 14px;text-decoration:none;font-weight:700;font-size:15px}
main{padding:0 16px 40px}
h2{font-size:24px;margin:32px 0 4px;padding-left:10px;border-left:6px solid var(--brand)}
.seclead{color:var(--sub);margin:4px 0 16px}
.grid{display:grid;gap:16px}
@media(min-width:900px){.grid{grid-template-columns:1fr 1fr}.card.wide{grid-column:1/-1}}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;min-width:0}
.card h3{font-size:19px;margin:0 0 4px;line-height:1.5}
.lead{margin:0 0 10px;color:var(--sub);font-size:15px}
.chartbox{position:relative;height:280px}
.chartbox.tall{height:420px}
@media(min-width:900px){.chartbox{height:300px}}
.unitnote{margin:4px 0 0;font-size:13px;color:var(--sub);text-align:right}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.btn,.yearbtns button{font:inherit;font-size:14px;border:1px solid var(--border);background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;min-height:40px}
.btn:hover,.yearbtns button:hover{border-color:var(--brand)}
.yearbtns{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.yearbtns button[aria-pressed=true]{background:var(--brand);color:#fff;border-color:var(--brand)}
.insight{background:#f8fafc;border-radius:12px;padding:12px 14px;margin-top:8px}
.insight h4{margin:0 0 6px;font-size:16px}
.insight ul{margin:0 0 8px;padding-left:1.2em;font-size:15px}
.tag{display:inline-block;font-size:13px;font-weight:700;border-radius:6px;padding:1px 8px;margin:4px 0}
.tag.fact{background:var(--fact-bg);color:var(--fact)}
.tag.caution{background:var(--warn-bg);color:var(--warn)}
details{margin-top:8px;border-top:1px solid var(--border);padding-top:6px}
summary{cursor:pointer;font-weight:700;font-size:15px;color:var(--brand-d);min-height:36px;display:flex;align-items:center}
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;font-size:14px;width:100%;margin-top:6px}
th,td{border:1px solid var(--border);padding:4px 8px;text-align:right;white-space:nowrap}
th[scope=col]{background:#f1f5f9;text-align:center}
th[scope=row]{text-align:left;background:#fafafa}
.src ul{padding-left:1.2em;font-size:13px;margin:6px 0}
.def{color:var(--sub)}
.glossary dl{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:8px 16px;margin:0}
.glossary dt{font-weight:700;margin-top:10px}
.glossary dd{margin:0 0 6px;font-size:15px}
footer{border-top:1px solid var(--border);padding:20px 16px;font-size:13px;color:var(--sub)}
:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<a class="skip" href="#main">本文へ移動</a>
<header class="top"><div class="wrap">
  <div class="crumb"><a href="../">← みんなの伊東市トップへ</a></div>
  <h1>📊 数字で見る伊東市</h1>
  <p>伊東市の人口とお金の流れを、国の公式統計でたどります。</p>
  <div class="principles"><strong>このページの約束</strong><ul>
    <li>数字は国などの公式統計の値をそのまま使い、すべてに出典・単位・取得日を付けています。</li>
    <li>値が公表されていない年は空けています（0として扱いません）。</li>
    <li>良い・悪いの判定はしません。「データから言えること」と「読むときの注意」を分けて書いています。</li>
  </ul></div>
</div></header>
<nav class="toc" aria-label="ページ内の目次">${SECTIONS.map(s => `<a href="#sec-${s.id}">${esc(s.title)}</a>`).join('')}<a href="#glossary">ことばの説明</a></nav>
<main id="main">
${SECTIONS.map(s => `<section id="sec-${s.id}" aria-labelledby="h-${s.id}">
  <h2 id="h-${s.id}">${esc(s.title)}</h2>
  <p class="seclead">${esc(s.lead)}</p>
  <div class="grid">${charts.filter(c => c.section === s.id).map(c => card(c).replace('class="card"', `class="card${['pop-trend', 'pyramid', 'expenditure'].includes(c.id) ? ' wide' : ''}"`)).join('')}</div>
</section>`).join('\n')}
<section id="glossary" class="glossary" aria-labelledby="h-glossary">
  <h2 id="h-glossary">ことばの説明</h2>
  <dl>${GLOSSARY.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl>
</section>
</main>
<footer><div class="wrap">
  <p>データの取得日：${fmtFetched}（統計ダッシュボード）。国の統計は公表まで時間がかかるため、最新の年度・年が含まれていない場合があります。</p>
  <p>出典：統計ダッシュボード（総務省統計局）、国立社会保障・人口問題研究所「日本の地域別将来推計人口（令和5(2023)年推計）」。このページは出典の数値をもとに「みんなの伊東市」が作成・加工したもので、出典元の公式見解ではありません。</p>
  <p>このページはAIを活用して作成し、運営者が内容を確認しています（本人確認済み）。数値は公式統計から機械的に取り込んでいます。誤りに気づいた方は、トップページの「市民の声」からお知らせください。</p>
  <p>© 2026 みんなの伊東市（非公式の市民向け情報サイト）｜制作・運営：伊東市議会議員 大竹圭</p>
</div></footer>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js" integrity="sha512-CQBWl4fJHWbryGE+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d+6I+1zze6Z7kHXO7q3UyZAWw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script>window.NUMBERS=${payload};</script>
<script src="numbers.js"></script>
</body>
</html>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');
console.log(`✓ numbers/index.html を生成（グラフ ${charts.length} 件、${Math.round(html.length / 1024)}KB）`);
