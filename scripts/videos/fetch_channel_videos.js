// 伊東市議会YouTubeチャンネルの動画一覧を読み、サイト（analysis_data.json）にまだない動画を追加する
//   実行: node scripts/videos/fetch_channel_videos.js           … 追加候補を表示するだけ（書き換えない）
//         node scripts/videos/fetch_channel_videos.js --write   … analysis_data.json に追加する
// 方針:
//   - 以前の fetch_new_videos.js は YouTube の RSS を使っていたが、RSS が 404 を返すようになったため、
//     チャンネルの「動画」ページ（公開ページ）を直接読む
//   - 種別・議員名は動画タイトルから決める（字幕の自動認識は誤りが多いので使わない）
//   - 質問の要約（questions）は空のまま追加する。正確な内容は会議録のデータで補う
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'analysis_data.json');
const CHANNEL = 'https://www.youtube.com/channel/UC9FGDfo93b_dpu_7-AnN4wQ/videos';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const MAX_PAGES = 10; // 1ページ約30本。既存の動画に十分出会ったら止める
const WRITE = process.argv.includes('--write');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function lockups(obj) {
  const out = [];
  JSON.stringify(obj, (k, v) => {
    if (v && v.lockupViewModel) {
      const l = v.lockupViewModel;
      const md = l.metadata && l.metadata.lockupMetadataViewModel;
      if (l.contentId && md && md.title) out.push({ videoId: l.contentId, title: md.title.content });
    }
    return v;
  });
  return out;
}
function continuation(obj) {
  let token = null;
  JSON.stringify(obj, (k, v) => {
    if (!token && v && v.continuationCommand && v.continuationCommand.token) token = v.continuationCommand.token;
    return v;
  });
  return token;
}

async function fetchChannel(known) {
  const res = await fetch(CHANNEL, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error('チャンネルページ HTTP ' + res.status);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error('チャンネルページの形式が変わった可能性があります（ytInitialData が見つかりません）');
  const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
  const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1];
  let data = JSON.parse(m[1]);
  const all = lockups(data);
  let token = continuation(data);
  for (let page = 2; page <= MAX_PAGES && token && key; page++) {
    // 直近のページがすべて既存の動画なら、それより古い分は取得済みとみなして止める
    if (all.slice(-30).every(v => known.has(v.videoId))) break;
    await sleep(1000);
    const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}`, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'ja', gl: 'JP' } }, continuation: token }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) throw new Error('続きの取得 HTTP ' + r.status);
    data = await r.json();
    all.push(...lockups(data));
    token = continuation(data);
  }
  return all;
}

// タイトルから会議の年月・種別・議員を読み取る
const toNum = s => Number(String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
function classify(title, memberNames) {
  const t = title.replace(/\s+/g, ' ');
  const era = t.match(/令和\s*([0-9０-９]+)\s*年\s*([0-9０-９]+)\s*月/);
  const date = era ? `${2018 + toNum(era[1])}-${String(toNum(era[2])).padStart(2, '0')}` : '';
  let sessionType = '議案審議';
  if (/一般質問/.test(t)) sessionType = '一般質問';
  else if (/大綱質疑/.test(t)) sessionType = '大綱質疑';
  else if (/委員会/.test(t)) sessionType = '委員会';
  const plain = t.replace(/\s/g, '');
  const speakers = memberNames.filter(n => plain.includes(n + '議員'));
  return { date, sessionType, speakers };
}

async function main() {
  const A = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const known = new Set(A.videos.map(v => v.videoId));
  const memberNames = [...new Set([...Object.keys(A.memberSummary), ...Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles.json'), 'utf8')))])];

  const listed = await fetchChannel(known);
  console.log(`チャンネルから ${listed.length} 本を確認（既存 ${known.size} 本）`);
  const fresh = listed.filter(v => !known.has(v.videoId) && v.title.includes('伊東市議会'))
    .filter((v, i, a) => a.findIndex(x => x.videoId === v.videoId) === i);
  if (!fresh.length) { console.log('✓ 追加する動画はありません'); return; }

  const add = fresh.map(v => {
    const c = classify(v.title, memberNames);
    return { videoId: v.videoId, title: v.title, date: c.date, url: `https://youtu.be/${v.videoId}`, sessionType: c.sessionType,
      speakers: c.speakers, memberFrequency: {}, questions: [], topics: [], textLength: 0 };
  });
  add.forEach(v => console.log(`  + ${v.date || '年月不明'} ${v.sessionType}${v.speakers.length ? '（' + v.speakers.join('・') + '）' : ''} ${v.title}`));
  const noDate = add.filter(v => !v.date);
  if (noDate.length) console.log(`⚠ 年月をタイトルから読み取れなかった動画 ${noDate.length} 本（日付なしで追加されます）`);

  if (!WRITE) { console.log(`\n追加候補 ${add.length} 本。追加するには --write を付けて実行してください。`); return; }

  A.videos.push(...add);
  for (const v of add) {
    for (const s of v.speakers) {
      if (!A.memberSummary[s]) A.memberSummary[s] = { name: s, videos: [], totalQuestions: 0, topics: {} };
      A.memberSummary[s].videos.push({ videoId: v.videoId, title: v.title, date: v.date, url: v.url, sessionType: v.sessionType, questions: [] });
    }
  }
  A.totalVideos = A.videos.length;
  A.generatedAt = new Date().toISOString();
  fs.writeFileSync(DATA, JSON.stringify(A, null, 2) + '\n', 'utf8');
  console.log(`\n✓ analysis_data.json に ${add.length} 本を追加しました（合計 ${A.videos.length} 本）`);
}

main().catch(e => { console.error('✗ 動画一覧の取得に失敗しました。ファイルは変更していません:', e.message); process.exit(1); });
