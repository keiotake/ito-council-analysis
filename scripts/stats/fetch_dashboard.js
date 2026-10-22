// 統計ダッシュボード（総務省統計局）から、人口・財政などの公式統計を取り込む
//   出力: data/stats/dashboard.json
//   実行: node scripts/stats/fetch_dashboard.js
// 方針: 公開値をそのまま保存する。空欄・欠損はゼロにせず「値なし」として扱う。
//       1件でも取得に失敗したら既存ファイルを上書きしない（古いデータを最新と偽らないため）。
const fs = require('fs');
const path = require('path');

const API = 'https://dashboard.e-stat.go.jp/api/1.0/Json';
const OUT = path.join(__dirname, '..', '..', 'data', 'stats', 'dashboard.json');

const REGIONS = {
  '22208': '伊東市',
  '22205': '熱海市',
  '22219': '下田市',
  '22222': '伊豆市',
  '22225': '伊豆の国市',
};

const INDICATORS = {
  pop_total: '0201010000000010000',
  jumin_pop: '0201200000000010010',
  area_total: '0101010000000010010',
  pop_0_14: '0201010010000010010',
  pop_15_64: '0201010010000010020',
  pop_65over: '0201010010000010030',
  share_0_14: '0201010010000020010',
  share_15_64: '0201010010000020020',
  share_65over: '0201010010000020030',
  households: '0202000000000010000',
  births: '0203010000000010000',
  deaths: '0203020000000010000',
  moves_in: '0204010000000010020',
  moves_out: '0204020000000010020',
  fin_index: '1302050000000190010',
  current_ratio: '1302050000000320010',
  debt_service_ratio: '1302050000000820010',
  future_burden_ratio: '1302050000000920010',
  revenue_total: '1302050102000010000',
  local_tax: '1302050102000010010',
  local_allocation_tax: '1302050102000010080',
  expenditure_total: '1302050202000010000',
};
// 目的別歳出（大分類）は指標一覧から自動で拾う（コード末尾が0のもの＝大分類）
const PURPOSE_RE = /^1302050202010010\d{2}0$/;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === tries) throw new Error(`${url} : ${e.message}`);
      await sleep(1500 * i);
    }
  }
}

function parseTime(t) {
  // 例: 2020CY00（暦年）, 2022FY00（年度）
  const m = /^(\d{4})(CY|FY)/.exec(t || '');
  return m ? { year: Number(m[1]), period: m[2] === 'FY' ? '年度' : '年' } : null;
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const metaJson = await getJson(`${API}/getIndicatorInfo?Lang=JP&RegionalRank=4`);
  const all = metaJson.GET_META_INDICATOR_INF.METADATA_INF.CLASS_INF.CLASS_OBJ;
  const byCode = new Map(all.map(o => [o['@code'], o]));

  const purposeCodes = all.filter(o => PURPOSE_RE.test(o['@code'])).map(o => o['@code']);
  const targets = { ...INDICATORS };
  purposeCodes.forEach(c => { targets['purpose_' + c.slice(-3)] = c; });

  const indicators = {};
  for (const [key, code] of Object.entries(targets)) {
    const o = byCode.get(code);
    if (!o) throw new Error(`指標コードが見つかりません: ${key} ${code}`);
    const cls = [].concat(o.CLASS || [])[0] || {};
    const details = [].concat((o.details && o.details.detail) || []);
    indicators[key] = {
      code,
      name: o['@name'],
      shortName: cls['@sname'] || o['@name'],
      unit: cls['@unit'] || '',
      statName: cls['@statName'] || '',
      cycle: (cls.cycle && cls.cycle['@name']) || '',
      definition: details.map(d => String(d['$'] || '').replace(/^"|"$/g, '')).join('\n'),
      annotation: [].concat(o.annotations || []).map(a => a['@annotation']).filter(Boolean).join(' '),
    };
  }

  const data = {};
  let calls = 0;
  for (const [key, code] of Object.entries(targets)) {
    data[key] = {};
    for (const region of Object.keys(REGIONS)) {
      const j = await getJson(`${API}/getData?Lang=JP&IndicatorCode=${code}&RegionCode=${region}`);
      calls++;
      const st = j.GET_STATS && j.GET_STATS.STATISTICAL_DATA;
      const objs = st && st.DATA_INF ? [].concat(st.DATA_INF.DATA_OBJ || []) : [];
      const rows = [];
      for (const { VALUE: v } of objs) {
        const t = parseTime(v['@time']);
        const raw = v['$'];
        const num = raw === '' || raw == null || raw === '-' || raw === '…' ? null : Number(raw);
        if (!t || num === null || !Number.isFinite(num)) continue; // 欠損はゼロにしない
        rows.push({ year: t.year, period: t.period, value: num, provisional: v['@isProvisional'] === '1' });
      }
      rows.sort((a, b) => a.year - b.year);
      data[key][region] = rows;
      await sleep(250);
    }
  }

  const out = {
    meta: {
      title: '統計ダッシュボードから取り込んだ公式統計',
      source: '統計ダッシュボード（総務省統計局）',
      sourceUrl: 'https://dashboard.e-stat.go.jp/',
      apiUrl: API + '/getData',
      license: '出典を明記のうえ利用。政府統計の利用条件は https://dashboard.e-stat.go.jp/ の利用規約に従う',
      fetchedAt,
      note: '値が公開されていない年は含めていない（ゼロとはしない）。provisional=true は速報値など暫定の値。',
      calls,
    },
    regions: REGIONS,
    indicators,
    data,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
  console.log(`✓ ${OUT} を更新（指標 ${Object.keys(targets).length} 件 × 地域 ${Object.keys(REGIONS).length}、API ${calls} 回）`);
}

main().catch(e => {
  console.error('✗ 取り込みに失敗しました。既存ファイルは変更していません:', e.message);
  process.exit(1);
});
