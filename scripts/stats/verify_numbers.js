// 「数字で見る伊東市」のグラフ・表の数値が、取り込んだ公式統計と一致しているかを検査する
//   実行: node scripts/stats/verify_numbers.js   （不一致があれば終了コード1）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const D = require(path.join(ROOT, 'data/stats/dashboard.json'));
const P = require(path.join(ROOT, 'data/stats/ipss_r5.json'));
const html = fs.readFileSync(path.join(ROOT, 'numbers/index.html'), 'utf8');
const N = JSON.parse(html.match(/window\.NUMBERS=(.*?);<\/script>/s)[1]);
const ITO = '22208';
const ip = P.regions[ITO].years;
const oku = v => Math.round(v / 100000 * 10) / 10;
const val = (key, year) => { const r = (D.data[key][ITO] || []).find(x => x.year === Number(year)); return r ? r.value : null; };
const chart = id => N.charts.find(c => c.id === id);

let checks = 0; const errors = [];
const eq = (label, a, b) => { checks++; if (a !== b) errors.push(`${label}: グラフ=${a} 元データ=${b}`); };

// 1. 総人口と推計
{ const c = chart('pop-trend');
  c.labels.forEach((y, i) => {
    eq(`総人口 ${y}`, c.datasets[0].data[i], val('pop_total', y));
    eq(`推計 ${y}`, c.datasets[1].data[i], ip[y] && y >= 2020 ? ip[y].total : null);
  }); }
// 2. 年齢3区分（実績は公表値、推計は5歳階級の合計）
{ const c = chart('age-groups'); const keys = ['pop_0_14', 'pop_15_64', 'pop_65over']; const rng = [[0, 3], [3, 13], [13, 20]];
  c.labels.forEach((l, i) => {
    const y = parseInt(l, 10); const proj = /推計/.test(l);
    keys.forEach((k, g) => {
      const expect = proj ? ip[y].ages.slice(rng[g][0], rng[g][1]).reduce((s, v) => s + v, 0) : val(k, y);
      eq(`${k} ${l}`, c.datasets[g].data[i], expect);
    });
  }); }
// 3. ピラミッド
{ const c = chart('pyramid');
  c.years.forEach(y => P.ageLabels.forEach((a, i) => {
    eq(`ピラミッド男 ${y} ${a}`, c.pyramid[y].male[i], ip[y].maleAges[i]);
    eq(`ピラミッド女 ${y} ${a}`, c.pyramid[y].female[i], ip[y].femaleAges[i]);
  })); }
// 4〜9. 公表値をそのまま使うグラフ
const direct = { 'births-deaths': ['births', 'deaths'], migration: ['moves_in', 'moves_out'], households: ['households'],
  'fin-index': ['fin_index'], 'current-ratio': ['current_ratio'], 'debt-ratios': ['debt_service_ratio', 'future_burden_ratio'] };
for (const [id, keys] of Object.entries(direct)) {
  const c = chart(id);
  c.labels.forEach((y, i) => keys.forEach((k, g) => eq(`${id} ${k} ${y}`, c.datasets[g].data[i], val(k, y))));
}
// 10. 歳入（グラフは億円換算、表は公表値の千円）
{ const c = chart('revenue'); const keys = ['revenue_total', 'local_tax', 'local_allocation_tax'];
  c.labels.forEach((y, i) => keys.forEach((k, g) => {
    eq(`歳入グラフ ${k} ${y}`, c.datasets[g].data[i], oku(val(k, y)));
    eq(`歳入表 ${k} ${y}`, c.table.rows[i][g + 1], val(k, y));
  })); }
// 11. 目的別歳出
{ const c = chart('expenditure'); const ly = Number((c.title.match(/(\d{4})年度/) || [])[1]);
  const total = val('expenditure_total', ly);
  c.table.rows.forEach((r, i) => {
    const key = Object.keys(D.indicators).find(k => k.startsWith('purpose_') && D.indicators[k].shortName.replace(/（.*$/, '') === r[0]);
    eq(`歳出表 ${r[0]}`, r[1], val(key, ly));
    eq(`歳出グラフ ${r[0]}`, c.datasets[0].data[i], Math.round(val(key, ly) / 100000 * 100) / 100);
    eq(`歳出割合 ${r[0]}`, r[2], Math.round(val(key, ly) / total * 1000) / 10);
  }); }

// 欠損をゼロにしていないか（公表値に0が存在しないのにグラフに0がある場合は異常）
N.charts.forEach(c => (c.datasets || []).forEach(d => d.data.forEach((v, i) => {
  checks++; if (v === 0) errors.push(`${c.id} ${d.label} ${c.labels[i]}: 0 が入っています（欠損をゼロにしていないか確認）`);
})));

if (errors.length) {
  console.error(`✗ 不一致 ${errors.length} 件（検査 ${checks} 件）`);
  errors.slice(0, 50).forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log(`✓ グラフ・表の数値はすべて元データと一致しました（検査 ${checks} 件）`);
