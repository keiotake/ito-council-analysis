// 伊東市議会議事録スクレイパー
// Phase 1: 全会議一覧を取得してFINO/KGNO/UNIDを収集
// Phase 2: 各会議の本文(ACT=203)を取得して保存

const fs = require('fs');
const https = require('https');
const iconv = require('iconv-lite');
const { URL } = require('url');

const BASE_URL = 'https://itoshigikai.gijiroku.com/voices/';
const OUT_DIR = 'scrape_tmp';
const MINUTES_DIR = `${OUT_DIR}/minutes`;
const COOKIE_FILE = `${OUT_DIR}/cookies.txt`;
const MEETING_LIST_FILE = `${OUT_DIR}/meeting_list.json`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

fs.mkdirSync(MINUTES_DIR, { recursive: true });

let cookies = '';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchRaw(urlStr, referer) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,*/*',
        'Accept-Language': 'ja,en;q=0.9',
        ...(referer ? { 'Referer': referer } : {}),
        ...(cookies ? { 'Cookie': cookies } : {}),
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        // Store Set-Cookie
        if (res.headers['set-cookie']) {
          const newCookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
          cookies = cookies ? `${cookies}; ${newCookies}` : newCookies;
        }
        resolve({ buf, status: res.statusCode, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

async function fetchText(urlStr, referer, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const { buf, status } = await fetchRaw(urlStr, referer);
      if (status !== 200) {
        console.log(`  [${status}] ${urlStr}, retry ${i+1}`);
        await sleep(2000 + i * 2000);
        continue;
      }
      const text = iconv.decode(buf, 'Shift_JIS');
      // Check for "Server Busy"
      if (text.includes('Server Busy') || text.includes('メンテナンス') || text.length < 500) {
        console.log(`  [busy/small ${buf.length}B] retry ${i+1}`);
        await sleep(3000 + i * 2000);
        continue;
      }
      return text;
    } catch (e) {
      console.log(`  [error] ${e.message}, retry ${i+1}`);
      await sleep(2000);
    }
  }
  throw new Error(`Failed to fetch ${urlStr}`);
}

// Parse meeting list HTML
function parseMeetingList(html) {
  const folderRe = /<IMG[^>]*folder\.gif[^>]*><\/A>\s*([^<,]+),\s*<A[^>]*winopen\('voiweb\.exe\?ACT=200[^']*KGNO=(\d+)&FINO=(\d+)&UNID=([^']+)'\)[^>]*>([^<]+)</g;
  const out = [];
  let m;
  while ((m = folderRe.exec(html)) !== null) {
    out.push({
      sessionTitle: m[1].replace(/&nbsp;/g,' ').trim(),
      kgno: m[2],
      fino: m[3],
      unid: m[4],
      dateLabel: m[5].trim(),
    });
  }
  return out;
}

async function collectAllMeetings() {
  console.log('=== Phase 1: 全会議一覧の取得 ===');

  // Initial session: load easy.html to get cookies
  console.log('Getting initial session...');
  await fetchText(`${BASE_URL}easy.html`);
  // Get top frame too
  await fetchText(`${BASE_URL}CGI/voiweb.exe?ACT=1`, `${BASE_URL}easy.html`);

  // Load existing progress to resume from last page
  let allMeetings = [];
  let startPage = 1;
  if (fs.existsSync(MEETING_LIST_FILE)) {
    try {
      allMeetings = JSON.parse(fs.readFileSync(MEETING_LIST_FILE, 'utf-8'));
      startPage = Math.floor(allMeetings.length / 10) + 1;
      console.log(`Resuming from page ${startPage} (${allMeetings.length} meetings already collected)`);
    } catch (e) {}
  }

  let page = startPage;
  let totalPages = 1;
  let hitCount = 0;

  while (page <= totalPages) {
    // Page 1: no extra params. Later pages: PAGE=N with HIT & AHIT
    let url;
    if (page === 1) {
      url = `${BASE_URL}CGI/voiweb.exe?ACT=100&KENSAKU=0&SORT=0&KTYP=2,3&KGTP=1,2`;
    } else {
      url = `${BASE_URL}CGI/voiweb.exe?ACT=100&KENSAKU=0&SORT=0&KTYP=2,3&KGTP=1,2&PAGE=${page}&HIT=${hitCount}&AHIT=-1`;
    }
    console.log(`Fetching page ${page}/${totalPages || '?'}...`);
    const html = await fetchText(url, `${BASE_URL}easy.html`);

    // Save first page for debugging
    if (page === 1) fs.writeFileSync(`${OUT_DIR}/dbg_page1.html`, html);

    const meetings = parseMeetingList(html);
    console.log(`  Parsed ${meetings.length} meetings on page ${page}`);
    allMeetings.push(...meetings);

    // Detect total pages from pagination
    if (page === 1) {
      const hitMatch = html.match(/(\d+)件の日程がヒット/);
      if (hitMatch) {
        hitCount = parseInt(hitMatch[1]);
        const perPage = Math.max(meetings.length, 10);
        totalPages = Math.ceil(hitCount / perPage);
        console.log(`  Total: ${hitCount} meetings, estimated ${totalPages} pages (per page: ${perPage})`);
      }
    }
    if (meetings.length === 0) {
      console.log('  No meetings parsed, stopping.');
      break;
    }
    // Save progress after each page
    fs.writeFileSync(MEETING_LIST_FILE, JSON.stringify(allMeetings, null, 2));
    page++;
    await sleep(1500); // gentler pacing
  }

  // Dedupe
  const unique = {};
  for (const m of allMeetings) unique[m.fino] = m;
  const result = Object.values(unique);
  console.log(`Collected ${result.length} unique meetings`);

  fs.writeFileSync(MEETING_LIST_FILE, JSON.stringify(result, null, 2));
  console.log(`Saved to ${MEETING_LIST_FILE}`);
  return result;
}

async function main() {
  try {
    let meetings;
    if (fs.existsSync(MEETING_LIST_FILE) && !process.argv.includes('--force-list')) {
      meetings = JSON.parse(fs.readFileSync(MEETING_LIST_FILE, 'utf-8'));
      console.log(`Loaded ${meetings.length} meetings from cache`);
    } else {
      meetings = await collectAllMeetings();
    }

    // Phase 2: fetch each meeting's body
    if (process.argv.includes('--bodies')) {
      console.log('=== Phase 2: 各会議本文の取得 ===');
      let i = 0;
      for (const m of meetings) {
        i++;
        const outFile = `${MINUTES_DIR}/${m.fino}.html`;
        if (fs.existsSync(outFile) && fs.statSync(outFile).size > 10000) continue;
        // Need a valid HUID, KGNO, FINO, UNID. HUID=first one is not known, but ACT=203 with FINO only?
        // Actually ACT=203 needs HUID too. Let's use the first speaker's HUID. But we don't have speaker list yet.
        // Alternative: use UNID-based direct URL
        // The speaker list itself (ACT=100 with FINO) is the easier path
        const spUrl = `${BASE_URL}CGI/voiweb.exe?ACT=100&KENSAKU=0&SORT=0&KTYP=2,3&KGTP=1,2&FINO=${m.fino}`;
        console.log(`[${i}/${meetings.length}] FINO=${m.fino} ${m.dateLabel}`);
        try {
          const html = await fetchText(spUrl, `${BASE_URL}easy.html`);
          fs.writeFileSync(outFile, html, 'utf-8');
        } catch (e) {
          console.log(`  Failed: ${e.message}`);
        }
        await sleep(600);
      }
    }
  } catch (e) {
    console.error('Fatal:', e.message);
    process.exit(1);
  }
}

main();
