// 議事録本文スクレイパー（ACT=203）
const fs = require('fs');
const https = require('https');
const iconv = require('iconv-lite');
const { URL } = require('url');

const BASE_URL = 'https://itoshigikai.gijiroku.com/voices/';
const OUT_DIR = 'scrape_tmp';
const MINUTES_DIR = `${OUT_DIR}/minutes`;
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
        if (res.headers['set-cookie']) {
          const newCookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
          cookies = cookies ? `${cookies}; ${newCookies}` : newCookies;
        }
        resolve({ buf, status: res.statusCode });
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

async function fetchText(urlStr, referer, retries = 4, minSize = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const { buf, status } = await fetchRaw(urlStr, referer);
      if (status !== 200) {
        console.log(`  [${status}] retry ${i+1}`);
        await sleep(3000 + i * 3000);
        continue;
      }
      const text = iconv.decode(buf, 'Shift_JIS');
      if (text.includes('Server Busy') || text.includes('メンテナンス')) {
        console.log(`  [busy] retry ${i+1}`);
        await sleep(5000 + i * 3000);
        continue;
      }
      if (minSize > 0 && buf.length < minSize) {
        console.log(`  [small ${buf.length}B < ${minSize}] retry ${i+1}`);
        await sleep(5000 + i * 3000);
        continue;
      }
      return text;
    } catch (e) {
      console.log(`  [error] ${e.message}, retry ${i+1}`);
      await sleep(5000);
    }
  }
  throw new Error(`Failed`);
}

// Parse speaker list from ACT=100&FINO page to get first HUID
async function getFirstHUID(meeting, pageContext) {
  const { page, finosParam, hitCount } = pageContext;
  const url = `${BASE_URL}CGI/voiweb.exe?ACT=100&KENSAKU=0&SORT=0&KTYP=2,3&KGTP=1,2&FINO=${meeting.fino}&FINOS=${finosParam}&PAGE=${page}&HIT=${hitCount}&AHIT=-1`;
  const html = await fetchText(url, `${BASE_URL}easy.html`);
  const m = html.match(/HUID=(\d+)/);
  return m ? m[1] : null;
}

async function fetchMeetingBody(meeting, pageContext) {
  const huid = await getFirstHUID(meeting, pageContext);
  if (!huid) {
    console.log(`  No HUID for FINO=${meeting.fino}`);
    return null;
  }
  await sleep(800);
  const bodyUrl = `${BASE_URL}CGI/voiweb.exe?ACT=203&KENSAKU=0&SORT=0&KTYP=2,3,2&KGTP=1,2,1&FINO=${meeting.fino}&HATSUGENMODE=1&HYOUJIMODE=0&HUID=${huid}&STYLE=0`;
  const html = await fetchText(bodyUrl, `${BASE_URL}easy.html`);
  return html;
}

async function main() {
  // Session (small pages, no size check)
  await fetchText(`${BASE_URL}easy.html`, null, 4, 0);
  await fetchText(`${BASE_URL}CGI/voiweb.exe?ACT=1`, `${BASE_URL}easy.html`, 4, 0);

  const meetings = JSON.parse(fs.readFileSync(MEETING_LIST_FILE, 'utf-8'));
  console.log(`Loaded ${meetings.length} meetings`);

  // Filter to target era if specified
  let filtered = meetings;
  if (process.argv.includes('--reiwa')) {
    filtered = meetings.filter(m => /_R/.test(m.unid));
    console.log(`Filtered to Reiwa only: ${filtered.length}`);
  } else if (process.argv.includes('--recent')) {
    filtered = meetings.filter(m => {
      const match = (m.unid||'').match(/_([RH])(\d{2})/);
      if (!match) return false;
      const era = match[1], yr = parseInt(match[2]);
      if (era === 'R') return true;
      if (era === 'H' && yr >= 27) return true;
      return false;
    });
    console.log(`Filtered to H27+ & Reiwa: ${filtered.length}`);
  } else if (process.argv.includes('--pre-h27')) {
    // 平成26年以前（昔の議員を含むため）
    filtered = meetings.filter(m => {
      const match = (m.unid||'').match(/_([RH])(\d{2})/);
      if (!match) return false;
      const era = match[1], yr = parseInt(match[2]);
      return era === 'H' && yr < 27;
    });
    console.log(`Filtered to pre-H27: ${filtered.length}`);
  }

  // Build page context for each meeting (based on their position in the FULL meeting list, not filtered)
  const hitCount = meetings.length;
  const pageSize = 10;
  const pageContextMap = {};
  for (let i = 0; i < meetings.length; i++) {
    const page = Math.floor(i / pageSize) + 1;
    const pageStart = (page - 1) * pageSize;
    const finos = meetings.slice(pageStart, pageStart + pageSize).map(x => x.fino);
    pageContextMap[meetings[i].fino] = {
      page,
      finosParam: finos.join('%2C'),
      hitCount,
    };
  }

  let done = 0, failed = 0;
  for (const m of filtered) {
    const outFile = `${MINUTES_DIR}/${m.fino}.html`;
    const metaFile = `${MINUTES_DIR}/${m.fino}.json`;
    done++;
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 50000) {
      continue;
    }
    console.log(`[${done}/${filtered.length}] FINO=${m.fino} ${m.sessionTitle} ${m.dateLabel}`);
    try {
      const html = await fetchMeetingBody(m, pageContextMap[m.fino]);
      if (html) {
        fs.writeFileSync(outFile, html, 'utf-8');
        fs.writeFileSync(metaFile, JSON.stringify(m, null, 2));
      } else {
        failed++;
      }
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
      failed++;
    }
    await sleep(1200);
  }
  console.log(`\nDone. Success: ${done - failed}, Failed: ${failed}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
