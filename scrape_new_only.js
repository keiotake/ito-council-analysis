// 新規 fino だけターゲットして本文取得
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE_URL = 'https://itoshigikai.gijiroku.com/voices/';
const OUT_DIR = 'scrape_tmp';
const MINUTES_DIR = `${OUT_DIR}/minutes`;
const COOKIE_FILE = `${OUT_DIR}/cookies.txt`;

const TARGET_FINOS = ['923', '924', '926', '927']; // 新規分のみ

let cookies = {};
try {
  const txt = fs.readFileSync(COOKIE_FILE, 'utf-8');
  txt.split('\n').forEach(l => { const [k, v] = l.split('='); if (k) cookies[k.trim()] = v?.trim() || ''; });
} catch {}

function cookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function fetchRaw(urlStr, referer) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9',
      }
    };
    if (referer) opts.headers['Referer'] = referer;
    if (Object.keys(cookies).length) opts.headers['Cookie'] = cookieHeader();
    const lib = u.protocol === 'https:' ? https : http;
    lib.request(opts, res => {
      const setCookie = res.headers['set-cookie'];
      if (setCookie) for (const c of setCookie) {
        const [pair] = c.split(';'); const [k, v] = pair.split('='); if (k) cookies[k.trim()] = v?.trim() || '';
      }
      const bufs = [];
      res.on('data', d => bufs.push(d));
      res.on('end', () => resolve({ buf: Buffer.concat(bufs), status: res.statusCode }));
      res.on('error', reject);
    }).on('error', reject).end();
  });
}

async function fetchText(urlStr, referer, retries = 6) {
  for (let i = 0; i < retries; i++) {
    try {
      const { buf, status } = await fetchRaw(urlStr, referer);
      if (status !== 200) { await new Promise(r => setTimeout(r, 2500)); continue; }
      const text = buf.toString('binary');
      if (/voiweb\.exe.*busy/i.test(text) || text.length < 500) {
        console.log(`  [busy] retry ${i + 1}`);
        await new Promise(r => setTimeout(r, 3500));
        continue;
      }
      // 文字列はShift_JISなのでiconvでデコード
      const iconv = require('iconv-lite');
      return iconv.decode(buf, 'Shift_JIS');
    } catch (e) {
      console.log(`  err ${e.message}, retry ${i + 1}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Failed after retries');
}

async function main() {
  // セッション確立
  console.log('Init session...');
  await fetchText(`${BASE_URL}easy.html`);
  await fetchText(`${BASE_URL}CGI/voiweb.exe?ACT=1`, `${BASE_URL}easy.html`);

  const meetings = JSON.parse(fs.readFileSync(`${OUT_DIR}/meeting_list.json`, 'utf-8'));
  const targets = meetings.filter(m => TARGET_FINOS.includes(m.fino));
  console.log(`Target meetings: ${targets.length}`);

  // hitCountを785にしてリクエスト
  const hitCount = meetings.length;
  for (const m of targets) {
    const outFile = `${MINUTES_DIR}/${m.fino}.html`;
    const metaFile = `${MINUTES_DIR}/${m.fino}.json`;
    console.log(`\nFINO=${m.fino} ${m.sessionTitle} ${m.dateLabel}`);
    // m の position をmeetingsから探す
    const idx = meetings.findIndex(x => x.fino === m.fino);
    const page = Math.floor(idx / 10) + 1;
    const pageStart = (page - 1) * 10;
    const finos = meetings.slice(pageStart, pageStart + 10).map(x => x.fino);
    const finosParam = finos.join('%2C');
    // 1) HUID取得
    const listUrl = `${BASE_URL}CGI/voiweb.exe?ACT=100&KENSAKU=0&SORT=0&KTYP=2,3&KGTP=1,2&FINO=${m.fino}&FINOS=${finosParam}&PAGE=${page}&HIT=${hitCount}&AHIT=-1`;
    const listHtml = await fetchText(listUrl, `${BASE_URL}easy.html`);
    const huidMatch = listHtml.match(/HUID=(\d+)/);
    if (!huidMatch) { console.log('  No HUID'); continue; }
    const huid = huidMatch[1];
    // 2) 本文取得
    const bodyUrl = `${BASE_URL}CGI/voiweb.exe?ACT=203&KENSAKU=0&SORT=0&KTYP=2,3,2&KGTP=1,2,1&FINO=${m.fino}&HATSUGENMODE=1&HYOUJIMODE=0&HUID=${huid}&STYLE=0`;
    const html = await fetchText(bodyUrl, listUrl);
    if (html && html.length > 5000) {
      fs.writeFileSync(outFile, html, 'utf-8');
      fs.writeFileSync(metaFile, JSON.stringify(m, null, 2));
      console.log(`  Saved ${html.length} chars`);
    } else {
      console.log(`  Body too short: ${html?.length || 0} chars`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('\nDone.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
