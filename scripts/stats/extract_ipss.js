// 国立社会保障・人口問題研究所「日本の地域別将来推計人口（令和5(2023)年推計）」から
// 対象市の男女・5歳階級別人口を取り出す
//   出力: data/stats/ipss_r5.json
//   実行: npm i --no-save xlsx@0.18.5 && node scripts/stats/extract_ipss.js
// 推計は数年に一度しか公表されないため、取り出した結果をリポジトリに保存して使う。
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SRC_PAGE = 'https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/t-page.asp';
const SRC_FILE = 'https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/3kekka/suikei_kekka.xlsx';
const OUT = path.join(__dirname, '..', '..', 'data', 'stats', 'ipss_r5.json');
const TARGETS = ['22208', '22205', '22219', '22222', '22225'];

async function main() {
  const res = await fetch(SRC_FILE, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

  // 見出し: 4行目に「総数／男／女」、5行目に「計, 0～4歳, …, 95歳～」
  const h1 = rows.findIndex(r => r[0] === 'コード');
  const top = rows[h1], sub = rows[h1 + 1];
  const block = name => {
    const start = top.indexOf(name);
    if (start < 0) throw new Error('見出しが見つかりません: ' + name);
    const cols = [];
    for (let c = start; c < sub.length && sub[c] !== ''; c++) cols.push(c);
    return cols;
  };
  const blocks = { total: block('総数'), male: block('男'), female: block('女') };
  const ageLabels = blocks.total.slice(1).map(c => sub[c]);

  const regions = {};
  for (const r of rows.slice(h1 + 2)) {
    const code = String(r[0]);
    if (!TARGETS.includes(code)) continue;
    const year = Number(String(r[4]).replace('年', ''));
    if (!Number.isFinite(year)) continue;
    const pick = cols => cols.map(c => (r[c] === '' ? null : Number(r[c])));
    const reg = (regions[code] ||= { name: r[3], pref: r[2], years: {} });
    const t = pick(blocks.total), m = pick(blocks.male), f = pick(blocks.female);
    reg.years[year] = {
      total: t[0], male: m[0], female: f[0],
      ages: t.slice(1), maleAges: m.slice(1), femaleAges: f.slice(1),
      actual: year === 2020,
    };
  }
  const missing = TARGETS.filter(c => !regions[c]);
  if (missing.length) throw new Error('対象市が見つかりません: ' + missing.join(','));

  const out = {
    meta: {
      title: '日本の地域別将来推計人口（令和5(2023)年推計）',
      source: '国立社会保障・人口問題研究所',
      sourceUrl: SRC_PAGE,
      fileUrl: SRC_FILE,
      fetchedAt: new Date().toISOString(),
      note: '2020年は国勢調査の実績値、2025年以降は推計値（各年10月1日時点）。推計は一定の仮定に基づく見通しであり、将来を確定的に示すものではない。',
    },
    ageLabels,
    regions,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
  console.log(`✓ ${OUT} を更新（${Object.keys(regions).length}市、年齢区分 ${ageLabels.length}）`);
}

main().catch(e => { console.error('✗ 失敗。既存ファイルは変更していません:', e.message); process.exit(1); });
