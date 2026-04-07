const fs = require('fs');

const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const titles = JSON.parse(fs.readFileSync('video_titles.json', 'utf-8'));

// 全角→半角変換
function zen2han(s) {
  return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

let titleUpdated = 0;
let dateUpdated = 0;

for (const v of analysis.videos) {
  const title = titles[v.videoId];
  if (title) {
    v.title = title;
    titleUpdated++;

    // 日付抽出（全角対応）
    if (!v.date) {
      const normalized = zen2han(title);
      // 令和X年X月 or 平成X年X月
      const m = normalized.match(/(令和|平成)(\d+)年(\d+)月/);
      if (m) {
        const era = m[1];
        const eraYear = parseInt(m[2]);
        const baseYear = era === '令和' ? 2018 : 1988;
        const year = baseYear + eraYear;
        const month = m[3].padStart(2, '0');
        v.date = `${year}-${month}`;
        dateUpdated++;
      }
    }
  }
}

console.log(`タイトル更新: ${titleUpdated}/${analysis.videos.length}件`);
console.log(`日付更新: ${dateUpdated}件`);

// memberSummaryの動画にもタイトル・日付を反映
let msUpdated = 0;
if (analysis.memberSummary) {
  for (const [name, data] of Object.entries(analysis.memberSummary)) {
    for (const v of data.videos) {
      const title = titles[v.videoId];
      if (title) {
        v.title = title;
        msUpdated++;
        if (!v.date) {
          const normalized = zen2han(title);
          const m = normalized.match(/(令和|平成)(\d+)年(\d+)月/);
          if (m) {
            const era = m[1];
            const eraYear = parseInt(m[2]);
            const baseYear = era === '令和' ? 2018 : 1988;
            const year = baseYear + eraYear;
            const month = m[3].padStart(2, '0');
            v.date = `${year}-${month}`;
          }
        }
      }
    }
  }
}
console.log(`memberSummary更新: ${msUpdated}件`);

fs.writeFileSync('analysis_data.json', JSON.stringify(analysis, null, 2));
console.log('analysis_data.json 更新完了');

// Also update analysis_with_responses.json
try {
  const resp = JSON.parse(fs.readFileSync('analysis_with_responses.json', 'utf-8'));
  let rUpdated = 0;
  for (const v of resp.videos) {
    const title = titles[v.videoId];
    if (title) {
      v.title = title;
      rUpdated++;
      if (!v.date) {
        const normalized = zen2han(title);
        const m = normalized.match(/(令和|平成)(\d+)年(\d+)月/);
        if (m) {
          const era = m[1];
          const eraYear = parseInt(m[2]);
          const baseYear = era === '令和' ? 2018 : 1988;
          const year = baseYear + eraYear;
          const month = m[3].padStart(2, '0');
          v.date = `${year}-${month}`;
        }
      }
    }
  }
  fs.writeFileSync('analysis_with_responses.json', JSON.stringify(resp, null, 2));
  console.log(`analysis_with_responses.json 更新完了 (${rUpdated}件)`);
} catch(e) {
  console.log('analysis_with_responses.json 更新スキップ:', e.message);
}
