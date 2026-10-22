// 「他のまちと比べる」の数値が、取り込んだ公式統計と一致しているかを検査する
//   実行: node scripts/stats/verify_compare.js   （不一致があれば終了コード1）
//   build_pages.js とは別の書き方で計算し直して、結果を突き合わせる
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const D = require(path.join(ROOT, 'data/stats/dashboard.json'));
const html = fs.readFileSync(path.join(ROOT, 'compare/index.html'), 'utf8');
const C = JSON.parse(html.match(/window\.COMPARE=(.*?);<\/script>/s)[1]);
const ITO = '22208';

// 元データを「指標→市→年→値」の表に直す
const raw = {};
for (const [k, byCity] of Object.entries(D.data)) {
  raw[k] = {};
  for (const [c, rows] of Object.entries(byCity)) { raw[k][c] = {}; rows.forEach(r => { raw[k][c][r.year] = r.value; }); }
}
const get = (k, c, y) => (raw[k][c] && y in raw[k][c] ? raw[k][c][y] : null);

const DIRECT = { share_65over: 'share_65over', share_0_14: 'share_0_14', fin_index: 'fin_index', current_ratio: 'current_ratio',
  debt_service_ratio: 'debt_service_ratio', future_burden_ratio: 'future_burden_ratio' };
const PER_CAPITA = { pc_expenditure: 'expenditure_total', pc_local_tax: 'local_tax', pc_minsei: 'purpose_030',
  pc_kyoiku: 'purpose_110', pc_doboku: 'purpose_080', pc_shoko: 'purpose_070' };

let checks = 0; const errors = [];
const eq = (label, a, b) => { checks++; if (a !== b) errors.push(`${label}: ページ=${a} 元データから計算=${b}`); };

// 市の並びが固定（伊東市が先頭、残りは市町村コード順）で、全市そろっているか
const order = C.cities.map(c => c.code);
eq('市の並び', order.join(','), [ITO, ...Object.keys(D.regions).filter(c => c !== ITO).sort()].join(','));
C.cities.forEach(c => eq(`市名 ${c.code}`, c.name, D.regions[c.code]));

for (const i of C.indicators) {
  const expect = (c, y) => {
    if (DIRECT[i.key]) return get(DIRECT[i.key], c, y);
    if (PER_CAPITA[i.key]) {
      const a = get(PER_CAPITA[i.key], c, y), p = get('jumin_pop', c, y + 1);
      return a == null || p == null ? null : Math.round(a * 1000 / p);
    }
    if (i.key === 'pop_index') {
      const v = get('pop_total', c, y), b = get('pop_total', c, 2005);
      return v == null || b == null ? null : Math.round(v / b * 1000) / 10;
    }
    throw new Error('検査方法が決まっていない指標です: ' + i.key);
  };
  order.forEach(c => {
    eq(`${i.key} ${c} の年数`, i.values[c].length, i.years.length);
    i.years.forEach((y, k) => {
      const v = i.values[c][k];
      eq(`${i.key} ${c} ${y}`, v, expect(c, y));
      checks++; if (v === 0) errors.push(`${i.key} ${c} ${y}: 0 が入っています（欠損をゼロにしていないか確認）`);
    });
  });
  // 1人あたりは「年度の中の1月1日」の人口を使う（年度N → N+1年の住基人口）
  if (PER_CAPITA[i.key]) i.years.forEach(y => { checks++; if (!(y + 1 in raw.jumin_pop[ITO])) errors.push(`${i.key} ${y}年度: 対応する住基人口がありません`); });
  checks++; if (!i.sources.length) errors.push(`${i.key}: 出典がありません`);
  checks++; if (!i.cautions.length) errors.push(`${i.key}: 読むときの注意がありません`);
}

// 順位づけ・総合点の言葉がページに入っていないか（「順位や総合点は作りません」の説明文は除く）
const body = html.replace(/順位や総合点は作りません|順位づけはせず/g, '');
['ランキング', '順位', '総合点', '1位', 'ワースト', 'ベスト'].forEach(w => { checks++; if (body.includes(w)) errors.push(`ページに「${w}」が含まれています`); });
// AI活用の表記
checks++; if (!html.includes('AIを活用して作成し、運営者が内容を確認しています（本人確認済み）')) errors.push('AI活用・本人確認済みの表記がありません');

if (errors.length) {
  console.error(`✗ 不一致 ${errors.length} 件（検査 ${checks} 件）`);
  errors.slice(0, 50).forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log(`✓ 比較ページの数値はすべて元データと一致しました（検査 ${checks} 件）`);
