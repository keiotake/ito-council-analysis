const https = require('https');
const fs = require('fs');

// 既存の動画ID
const analysis = JSON.parse(fs.readFileSync('analysis_data.json', 'utf-8'));
const existingIds = new Set(analysis.videos.map(v => v.videoId));
console.log('既存動画数:', existingIds.size);

// YouTube Data APIなしでチャンネルの全動画を取得する方法：
// 1. RSSフィード（最新15件のみ）
// 2. oEmbed APIで個別にタイトル取得
// 3. チャンネルのHTMLページをスクレイプ

// まずRSSの15件を取得し、さらに検索ページからも探す
function fetchRSS() {
  return new Promise((resolve, reject) => {
    const url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC9FGDfo93b_dpu_7-AnN4wQ';
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const ids = [...data.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)].map(m => m[1]);
        const titles = [...data.matchAll(/<media:title>([^<]+)<\/media:title>/g)].map(m => m[1]);
        const published = [...data.matchAll(/<published>([^<]+)<\/published>/g)].map(m => m[1]);
        const results = ids.map((id, i) => ({
          videoId: id,
          title: titles[i] || '',
          published: published[i] || '',
        }));
        resolve(results);
      });
    }).on('error', reject);
  });
}

// oEmbed APIでタイトル取得
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

// YouTube検索で追加の動画IDを探す
function searchYouTube(query) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=CAI%253D`;
    https.get(url, {headers: {'User-Agent': 'Mozilla/5.0'}}, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const ids = [...new Set([...data.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map(m => m[1]))];
        resolve(ids);
      });
    }).on('error', () => resolve([]));
  });
}

async function main() {
  // 1. RSSから最新15件
  console.log('RSSフィードを取得中...');
  const rssVideos = await fetchRSS();
  console.log(`RSS: ${rssVideos.length}件`);

  const allNewIds = new Set();
  for (const v of rssVideos) {
    if (!existingIds.has(v.videoId)) allNewIds.add(v.videoId);
  }

  // 2. 検索で追加の動画を探す
  const searchQueries = [
    '伊東市議会 令和8年',
    '伊東市議会 令和7年 12月',
    '伊東市議会 令和7年 一般質問',
    '伊東市議会 令和6年 9月',
    '伊東市議会 令和6年 12月',
    '伊東市議会 令和6年 6月',
    '伊東市議会 2024',
    '伊東市議会 2025',
    '伊東市議会 大竹圭',
  ];

  for (const q of searchQueries) {
    console.log(`検索: ${q}`);
    const ids = await searchYouTube(q);
    for (const id of ids) {
      if (!existingIds.has(id) && !allNewIds.has(id)) {
        allNewIds.add(id);
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n新動画候補: ${allNewIds.size}件`);

  // 3. oEmbed APIで全タイトル取得（伊東市議会の動画か確認）
  const newVideos = [];
  const ids = [...allNewIds];
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i+5);
    const results = await Promise.all(batch.map(id => fetchTitle(id)));
    for (const r of results) {
      if (r.title && r.title.includes('伊東市議会')) {
        newVideos.push(r);
        console.log(`  ✓ ${r.videoId}: ${r.title}`);
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n確認済み新動画: ${newVideos.length}件`);
  fs.writeFileSync('new_videos.json', JSON.stringify(newVideos, null, 2));
  console.log('保存完了: new_videos.json');
}

main().catch(console.error);
