// 伊東市議会の会議録検索システムから、まだ取り込んでいない会議だけを取得して追加する
//   実行（リポジトリの一番上で）:
//     node scripts/gijiroku/update_minutes.js           … 新しい会議の一覧を表示するだけ
//     node scripts/gijiroku/update_minutes.js --fetch   … 本文を取得し data/gijiroku/added_meetings.json に追加
// 方針:
//   - 既存の gijiroku_integrated.json（80MB・git管理外）は書き換えない。追加分は別ファイルに保存し、build_v3.js が合わせて読む
//   - 本文の解析は parse_minutes.js の processMeeting をそのまま使う（同じ規則で解析するため）
//   - 統合の規則（日付・種別・委員会報告の除外・会議録リンク）は integrate_gijiroku.js と同じにする
//   - 公開サーバーに負担をかけないよう、1リクエストごとに間隔を空ける
const fs = require('fs');
const path = require('path');
const https = require('https');
const iconv = require('iconv-lite');

const ROOT = path.join(__dirname, '..', '..');
process.chdir(ROOT); // parse_minutes.js は scrape_tmp/minutes を相対パスで読む
const { processMeeting } = require(path.join(ROOT, 'parse_minutes.js'));

const BASE_URL = 'https://itoshigikai.gijiroku.com/voices/';
const MINUTES_DIR = 'scrape_tmp/minutes';
const ADDED = path.join('data', 'gijiroku', 'added_meetings.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const WAIT_MS = 1500;
const FETCH = process.argv.includes('--fetch');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let cookies = {};

function fetchRaw(urlStr, referer) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const headers = { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'ja-JP,ja;q=0.9' };
    if (referer) headers.Referer = referer;
    if (Object.keys(cookies).length) headers.Cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers }, res => {
      for (const c of res.headers['set-cookie'] || []) { const [k, v] = c.split(';')[0].split('='); if (k) cookies[k.trim()] = (v || '').trim(); }
      const bufs = [];
      res.on('data', d => bufs.push(d));
      res.on('end', () => resolve({ buf: Buffer.concat(bufs), status: res.statusCode }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function fetchText(urlStr, referer, retries = 6) {
  for (let i = 0; i < retries; i++) {
    try {
      const { buf, status } = await fetchRaw(urlStr, referer);
      const text = iconv.decode(buf, 'Shift_JIS');
      if (status === 200 && text.length >= 500 && !/Server Busy/i.test(text)) return text;
      console.log(`  [${status} / ${text.length}字] 再試行 ${i + 1}`);
    } catch (e) {
      console.log(`  [${e.message}] 再試行 ${i + 1}`);
    }
    await sleep(3000 + i * 2000);
  }
  throw new Error('取得できませんでした: ' + urlStr);
}

function parseMeetingList(html) { // scrape_minutes.js と同じ読み取り方
  const re = /<IMG[^>]*folder\.gif[^>]*><\/A>\s*([^<,]+),\s*<A[^>]*winopen\('voiweb\.exe\?ACT=200[^']*KGNO=(\d+)&FINO=(\d+)&UNID=([^']+)'\)[^>]*>([^<]+)</g;
  const out = []; let m;
  while ((m = re.exec(html)) !== null) out.push({ sessionTitle: m[1].replace(/&nbsp;/g, ' ').trim(), kgno: m[2], fino: m[3], unid: m[4], dateLabel: m[5].trim() });
  return out;
}

// ---------- integrate_gijiroku.js と同じ規則 ----------
const eraBase = { '令和': 2018, '平成': 1988, '昭和': 1925 };
const norm = s => String(s || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
function parseDate(sessionTitle, dateLabel) {
  let year = null;
  for (const era of Object.keys(eraBase)) { const m = norm(sessionTitle).match(new RegExp(era + '\\s*(\\d+)年')); if (m) { year = eraBase[era] + parseInt(m[1], 10); break; } }
  const mm = norm(dateLabel).match(/(\d+)月(\d+)日/);
  if (!year || !mm) return null;
  return `${year}-${mm[1].padStart(2, '0')}-${mm[2].padStart(2, '0')}`;
}
function isCommitteeReport(qa) {
  const combined = (qa.questionFull || qa.question || '').substring(0, 500) + ' ' + (qa.topic || '');
  return /予算[・]?決算特別委員会|予算[・]?決算特別委員|予算決算特別委員会/.test(combined)
    || /少数意見.*(報告|留保|提出)|少数意見(書|者)/.test(combined)
    || /特別委員会における審査の結果を?報告/.test(combined);
}
function inferSessionType(sessionTitle, questionText) {
  const t = (sessionTitle || '') + ' ' + (questionText || '').substring(0, 200);
  if (/一般質問/.test(t)) return '一般質問';
  if (/大綱質疑|決算|予算大綱/.test(t)) return '大綱質疑';
  if (/補正予算/.test(t)) return '補正予算審議';
  if (/討論/.test(t)) return '討論';
  if (/臨時会|委員会/.test(t)) return '委員会';
  if (/定例会/.test(t)) return '一般質問';
  return '';
}
// 動画は「同じ議員・同じ年月・同じ種別」のときだけ結び付ける（討論に一般質問の動画を付けるなどの取り違えを防ぐ）
const linkVideo = (videos, name, date, sessionType) => {
  const v = videos.find(x => x.date === (date || '').slice(0, 7) && x.sessionType === sessionType && (x.speakers || []).includes(name));
  return v ? { videoId: v.videoId, title: v.title, sessionType: v.sessionType } : null;
};
const gijirokuUrl = m => `https://itoshigikai.gijiroku.com/voices/CGI/voiweb.exe?ACT=200&KGNO=${encodeURIComponent(m.kgno)}&FINO=${encodeURIComponent(m.fino)}&UNID=${encodeURIComponent(m.unid)}`;

async function main() {
  const integrated = JSON.parse(fs.readFileSync('gijiroku_integrated.json', 'utf8'));
  const added = fs.existsSync(ADDED) ? JSON.parse(fs.readFileSync(ADDED, 'utf8')) : { meta: { finos: [] }, memberData: {} };
  const knownFinos = new Set([
    ...Object.values(integrated.memberData).flatMap(m => m.questions.map(q => String(q.fino))),
    ...added.meta.finos.map(String),
  ]);
  const maxKnown = Math.max(...[...knownFinos].map(Number).filter(Number.isFinite));
  console.log(`取り込み済みの会議: ${knownFinos.size} 件（最新の会議番号 ${maxKnown}）`);

  // 会議一覧（新しい順）。取り込み済みの会議だけのページに着いたら止める
  await fetchText(`${BASE_URL}easy.html`);
  await sleep(WAIT_MS);
  await fetchText(`${BASE_URL}CGI/voiweb.exe?ACT=1`, `${BASE_URL}easy.html`);
  const list = [];
  let hit = 0;
  for (let page = 1; page <= 20; page++) {
    await sleep(WAIT_MS);
    const url = page === 1
      ? `${BASE_URL}CGI/voiweb.exe?ACT=100&KENSAKU=0&SORT=0&KTYP=2,3&KGTP=1,2`
      : `${BASE_URL}CGI/voiweb.exe?ACT=100&KENSAKU=0&SORT=0&KTYP=2,3&KGTP=1,2&PAGE=${page}&HIT=${hit}&AHIT=-1`;
    const html = await fetchText(url, `${BASE_URL}easy.html`);
    if (page === 1) hit = Number((html.match(/(\d+)件の日程がヒット/) || [])[1] || 0);
    const ms = parseMeetingList(html);
    ms.forEach((m, i) => list.push({ ...m, page, pos: i }));
    if (!ms.length || ms.every(m => Number(m.fino) <= maxKnown)) break;
  }
  const fresh = list.filter(m => Number(m.fino) > maxKnown && !knownFinos.has(m.fino));
  console.log(`会議録システムの日程: ${hit} 件／新しい会議: ${fresh.length} 件`);
  fresh.forEach(m => console.log(`  + 会議番号 ${m.fino}  ${m.sessionTitle.replace(/\s+/g, '')} ${m.dateLabel}`));
  if (!fresh.length) console.log('✓ 追加する会議はありません（--fetch のときは動画の結び付けだけ更新します）');
  if (!FETCH) { if (fresh.length) console.log('\n本文を取得して追加するには --fetch を付けて実行してください。'); return; }

  // 本文の取得（scrape_new_only.js と同じ手順：一覧で発言ID(HUID)を得て、全文表示(ACT=203)を読む）
  fs.mkdirSync(MINUTES_DIR, { recursive: true });
  const videos = JSON.parse(fs.readFileSync('analysis_data.json', 'utf8')).videos;
  const done = [];
  for (const m of fresh) {
    const finos = list.filter(x => x.page === m.page).map(x => x.fino).join('%2C');
    const listUrl = `${BASE_URL}CGI/voiweb.exe?ACT=100&KENSAKU=0&SORT=0&KTYP=2,3&KGTP=1,2&FINO=${m.fino}&FINOS=${finos}&PAGE=${m.page}&HIT=${hit}&AHIT=-1`;
    console.log(`\n会議番号 ${m.fino} ${m.sessionTitle.replace(/\s+/g, '')} ${m.dateLabel}`);
    await sleep(WAIT_MS);
    const listHtml = await fetchText(listUrl, `${BASE_URL}easy.html`);
    const huid = (listHtml.match(/HUID=(\d+)/) || [])[1];
    if (!huid) { console.log('  発言IDが見つからないため飛ばします'); continue; }
    await sleep(WAIT_MS);
    const body = await fetchText(`${BASE_URL}CGI/voiweb.exe?ACT=203&KENSAKU=0&SORT=0&KTYP=2,3,2&KGTP=1,2,1&FINO=${m.fino}&HATSUGENMODE=1&HYOUJIMODE=0&HUID=${huid}&STYLE=0`, listUrl);
    if (body.length < 5000) { console.log(`  本文が短すぎるため飛ばします（${body.length}字）`); continue; }
    const meta = { sessionTitle: m.sessionTitle, kgno: m.kgno, fino: m.fino, unid: m.unid, dateLabel: m.dateLabel };
    fs.writeFileSync(path.join(MINUTES_DIR, `${m.fino}.html`), body, 'utf8');
    fs.writeFileSync(path.join(MINUTES_DIR, `${m.fino}.json`), JSON.stringify(meta, null, 2));

    const parsed = processMeeting(m.fino);
    const date = parseDate(m.sessionTitle, m.dateLabel);
    let n = 0, skipped = 0;
    for (const qa of parsed.qaPairs) {
      if (!qa.questioner) continue;
      if (isCommitteeReport(qa)) { skipped++; continue; }
      const member = added.memberData[qa.questioner] || (added.memberData[qa.questioner] = { name: qa.questioner, questions: [] });
      member.questions.push({
        fino: m.fino, date, sessionTitle: m.sessionTitle, dateLabel: m.dateLabel,
        sessionType: inferSessionType(m.sessionTitle, qa.question),
        position: qa.questionerPosition, topic: qa.topic, question: qa.question, questionFull: qa.questionFull,
        followUpCount: qa.followUpCount, exchangeCount: qa.exchangeCount, responses: qa.responses,
        youtubeVideo: null, // 下でまとめて結び付ける
        gijirokuUrl: gijirokuUrl(m),
      });
      n++;
    }
    added.meta.finos.push(m.fino);
    done.push(m.fino);
    console.log(`  質疑 ${n} 件を追加（委員会報告など ${skipped} 件は除外）`);
  }

  // 動画は後から追加されることもあるので、追加分すべての結び付けを毎回やり直す
  for (const mem of Object.values(added.memberData)) {
    mem.questions.forEach(q => { q.youtubeVideo = linkVideo(videos, mem.name, q.date, q.sessionType); });
    mem.questions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
  added.meta = {
    ...added.meta,
    title: '会議録検索システムから追加で取り込んだ質疑（gijiroku_integrated.json に含まれない会議）',
    source: '伊東市議会 会議録検索システム https://itoshigikai.gijiroku.com/voices/',
    generated: new Date().toISOString(),
    totalQaPairs: Object.values(added.memberData).reduce((s, m) => s + m.questions.length, 0),
  };
  fs.mkdirSync(path.dirname(ADDED), { recursive: true });
  fs.writeFileSync(ADDED, JSON.stringify(added, null, 1) + '\n', 'utf8');
  console.log(`\n✓ ${done.length} 件の会議を ${ADDED} に追加しました（質疑の合計 ${added.meta.totalQaPairs} 件）`);
}

main().catch(e => { console.error('✗ 失敗しました:', e.message); process.exit(1); });
