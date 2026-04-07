const fs = require('fs');
const https = require('https');

const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const videoIds = analysis.videos.map(v => v.videoId);

console.log(`${videoIds.length}本の動画タイトルを取得します...`);

function fetchTitle(videoId) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ videoId, title: json.title || '' });
        } catch(e) {
          resolve({ videoId, title: '' });
        }
      });
    }).on('error', () => resolve({ videoId, title: '' }));
  });
}

async function main() {
  const titles = {};
  const batchSize = 10;
  let done = 0;

  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(id => fetchTitle(id)));
    for (const r of results) {
      titles[r.videoId] = r.title;
      if (r.title) done++;
    }
    process.stdout.write(`\r${i + batch.length}/${videoIds.length} (${done}件取得済)`);
    // Rate limit: wait 200ms between batches
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n\n取得完了: ${done}/${videoIds.length}件`);

  // Save titles map
  fs.writeFileSync('video_titles.json', JSON.stringify(titles, null, 2));
  console.log('保存完了: video_titles.json');

  // Also extract dates from titles
  // Title format: "伊東市議会　令和4年6月定例会　一般質問　浅田良弘議員"
  const titleDates = {};
  for (const [id, title] of Object.entries(titles)) {
    const m = title.match(/令和(\d+)年(\d+)月/);
    if (m) {
      const year = 2018 + parseInt(m[1]);
      const month = m[2].padStart(2, '0');
      titleDates[id] = `${year}-${month}`;
    }
  }
  fs.writeFileSync('video_dates.json', JSON.stringify(titleDates, null, 2));
  console.log('日付抽出完了: video_dates.json');
}

main().catch(console.error);
