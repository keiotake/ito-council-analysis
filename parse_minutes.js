// 議事録本文から発言者・Q&Aペアを抽出
const fs = require('fs');
const path = require('path');

const MINUTES_DIR = 'scrape_tmp/minutes';
const OUTPUT_FILE = 'gijiroku_data.json';

// Strip HTML tags and normalize whitespace
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[\u3000]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse one speech segment
function parseSpeechHeader(segment) {
  // Patterns:
  // ○議長（中島弘道 君）
  // ◆８番（大竹圭 君）
  // ◎市長（佃弘巳 君）
  // ◎市長職務代理者・企画部長（近持剛史 君）
  // ◎総務部長（若山克 君）
  const m = segment.match(/^([◆◎○])([^（]+)（([^）]+?)\s*君\s*）/);
  if (!m) return null;
  const symbol = m[1]; // ◆=議員, ◎=当局, ○=議長
  let position = m[2].trim(); // e.g., "８番", "議長", "市長", "総務部長"
  const name = m[3].trim().replace(/\s+/g, '');
  return { symbol, position, name, role: symbol === '◆' ? 'council_member' : symbol === '◎' ? 'authority' : 'chair' };
}

// Position-based role inference (positions are reliable indicators)
function inferRole(symbol, position) {
  const p = position || '';
  // 議員の位置付け：「N番」のみ
  if (/^[\d０-９]+番$/.test(p)) return 'council_member';
  // 議長・副議長・委員長は chair として扱う（質問者ではない）
  if (/議長|副議長|委員長|副委員長/.test(p) && !/議会運営|特別委員/.test(p)) return 'chair';
  // 市長、副市長、部長、課長、局長、主幹、理事、監査、委員会事務局、教育長などは authority
  if (/市長|副市長|部長|次長|課長|局長|主幹|室長|所長|理事|監査|教育長|教育委員|委員会事務局|参事|主査|審議監|幹事/.test(p)) return 'authority';
  // 特別委員会委員長（議員が兼務）はcouncil_member
  if (/特別委員|議会運営委員/.test(p)) return 'council_member';
  // フォールバック: symbol-based
  return symbol === '◆' ? 'council_member' : symbol === '◎' ? 'authority' : 'chair';
}

// 名前の正規化（異体字・委員会名プレフィックスなど）
function normalizeName(name) {
  let n = name.replace(/\s+/g, '');
  // 崎→﨑：伊東市議会では宮﨑雅薫が正式
  n = n.replace(/\u5d0e/g, '\ufa11');
  // 委員会名プレフィックスを除去（greedy match：最後の「委員(長)」以降を採用）
  // 例：「新型コロナウイルス感染症対策特別委員会委員長井戸清司」→「井戸清司」
  // 例：「常任建設委員佐藤美音」→「佐藤美音」
  // 例：「常任福祉文教委員鳥居康子」→「鳥居康子」
  // 例：「発議者中田次城」→「中田次城」
  // 段階的に剥がす（greedy）
  const prefixKeywords = ['委員会委員長', '委員会副委員長', '委員会委員', '特別委員長', '特別副委員長', '特別委員', '副委員長', '委員長', '副委員', '委員', '副議長', '議長', '発議者', '紹介議員', '説明者', '請願者', '陳情者'];
  // 「常任」で始まるものは強制除去
  if (n.startsWith('常任')) {
    for (const kw of prefixKeywords) {
      const idx = n.lastIndexOf(kw);
      if (idx > 0) {
        const remain = n.substring(idx + kw.length);
        if (remain.length >= 2 && remain.length <= 8 && /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(remain)) {
          n = remain;
          break;
        }
      }
    }
  } else {
    // 他のケース：lastIndexOfで後ろから「委員長」「委員」等を探して剥がす
    const keywords = ['委員会委員長', '委員会副委員長', '委員会委員', '特別委員長', '特別副委員長', '特別委員', '副委員長', '委員長', '副議長', '議長'];
    let bestRemain = null;
    for (const kw of keywords) {
      const idx = n.lastIndexOf(kw);
      if (idx > 0) {
        const remain = n.substring(idx + kw.length);
        if (remain.length >= 2 && remain.length <= 8 && /^[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+$/.test(remain)) {
          bestRemain = remain;
          break;
        }
      }
    }
    // Prefix patterns (at start of string)
    const startPrefixes = ['発議者', '紹介議員', '説明者', '請願者', '陳情者', '提出者'];
    for (const pre of startPrefixes) {
      if (n.startsWith(pre)) {
        const remain = n.substring(pre.length);
        if (remain.length >= 2 && remain.length <= 8 && /^[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+$/.test(remain)) {
          bestRemain = remain;
          break;
        }
      }
    }
    if (bestRemain) n = bestRemain;
  }
  return n;
}

// Split text into speech segments
function splitSpeeches(text) {
  const segments = [];
  const regex = /([◆◎○])([^（◆◎○]+)（([^）]+?君)\s*）([\s\S]*?)(?=[◆◎○][^（◆◎○]+（[^）]+君\s*）|$)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const symbol = m[1];
    const position = m[2].trim();
    const nameWithKun = m[3].trim();
    let name = nameWithKun.replace(/\s*君$/, '').replace(/\s+/g, '');
    name = normalizeName(name);
    const body = m[4].trim();
    const role = inferRole(symbol, position);
    segments.push({
      symbol,
      position,
      name,
      role,
      body
    });
  }
  return segments;
}

// Extract agenda/session info from header
function extractHeaderInfo(text) {
  const out = {};
  const titleM = text.match(/伊東市議会(.+?)会議録/);
  if (titleM) out.title = titleM[1].trim();
  const dateM = text.match(/(令和\s*[\d０-９]+年|平成\s*[\d０-９]+年)\s*([\d０-９]+)月\s*([\d０-９]+)日/);
  if (dateM) out.dateStr = dateM[0];
  return out;
}

// Normalize whitespace and extract a summary from body text
function summarize(body, maxLen = 150) {
  const clean = body.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen - 1) + '…';
}

// Process one meeting file
function processMeeting(fino) {
  const htmlFile = path.join(MINUTES_DIR, `${fino}.html`);
  const metaFile = path.join(MINUTES_DIR, `${fino}.json`);
  if (!fs.existsSync(htmlFile) || !fs.existsSync(metaFile)) return null;
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
  const html = fs.readFileSync(htmlFile, 'utf-8');
  const text = stripHtml(html);
  const header = extractHeaderInfo(text);
  const segments = splitSpeeches(text);

  // Group by session: consecutive ◆-◎ exchanges by the same council member = 1 session
  // 一般質問の「再質問」も同じセッションに統合
  const qaPairs = [];
  let currentSession = null;
  const flushSession = () => {
    if (currentSession && currentSession.exchanges.length > 0) {
      // メイン質問は最初の質問（通常は壇上からの長い質問）
      const mainQ = currentSession.exchanges[0].question;
      const allFollowUps = currentSession.exchanges.slice(1).map(e => e.question);
      const allResponses = [];
      for (const ex of currentSession.exchanges) {
        allResponses.push(...ex.responses);
      }
      qaPairs.push({
        questioner: currentSession.name,
        questionerPosition: currentSession.position,
        // メイン質問要約（100文字）
        question: summarize(mainQ, 100),
        // メイン質問全文
        questionFull: summarize(mainQ, 2000),
        // やり取り件数（再質問含む）
        exchangeCount: currentSession.exchanges.length,
        followUpCount: allFollowUps.length,
        // 全答弁
        responses: allResponses.map(r => ({
          responder: r.name,
          position: r.position,
          response: summarize(r.body, 300),
          responseFull: summarize(r.body, 2000),
        })),
      });
    }
  };
  // 新しいロジック：同じ議員の連続するやり取りを1セッションにまとめる
  // 別議員の発言が出てきた時だけセッションを切る（議長の「次に」では切らない）
  let currentExchange = null;
  for (const seg of segments) {
    if (seg.role === 'council_member') {
      if (currentSession && currentSession.name === seg.name) {
        // 同じ議員 → 再質問として同一セッションに追加
        if (currentExchange) currentSession.exchanges.push(currentExchange);
        currentExchange = { question: seg.body, responses: [] };
      } else {
        // 別議員 → 前セッションをflushして新セッション開始
        if (currentExchange && currentSession) currentSession.exchanges.push(currentExchange);
        flushSession();
        currentSession = { name: seg.name, position: seg.position, exchanges: [] };
        currentExchange = { question: seg.body, responses: [] };
      }
    } else if (seg.role === 'authority' && currentExchange) {
      currentExchange.responses.push(seg);
    }
    // chair (議長) の発言は無視（セッション切り替えは議員の切替で判定）
  }
  if (currentExchange && currentSession) currentSession.exchanges.push(currentExchange);
  flushSession();

  return {
    fino: meta.fino,
    kgno: meta.kgno,
    unid: meta.unid,
    sessionTitle: meta.sessionTitle,
    dateLabel: meta.dateLabel,
    headerInfo: header,
    speakerCount: segments.length,
    qaPairs,
    allSpeakers: [...new Set(segments.map(s => s.name))],
  };
}

function main() {
  const files = fs.readdirSync(MINUTES_DIR).filter(f => f.endsWith('.html'));
  console.log(`Processing ${files.length} meeting files...`);
  const results = [];
  for (const f of files) {
    const fino = f.replace('.html', '');
    try {
      const result = processMeeting(fino);
      if (result) results.push(result);
    } catch (e) {
      console.log(`  Error processing ${fino}: ${e.message}`);
    }
  }
  // Sort by date (newest first)
  results.sort((a, b) => (b.unid || '').localeCompare(a.unid || ''));

  // Aggregate by speaker
  const bySpeaker = {};
  for (const r of results) {
    for (const q of r.qaPairs) {
      if (!q.questioner) continue;
      if (!bySpeaker[q.questioner]) {
        bySpeaker[q.questioner] = { name: q.questioner, questions: [] };
      }
      bySpeaker[q.questioner].questions.push({
        fino: r.fino,
        unid: r.unid,
        sessionTitle: r.sessionTitle,
        dateLabel: r.dateLabel,
        position: q.questionerPosition,
        question: q.question,
        questionFull: q.questionFull,
        exchangeCount: q.exchangeCount,
        followUpCount: q.followUpCount,
        responses: q.responses.map(x => ({
          responder: x.responder,
          position: x.position,
          response: x.response,
          responseFull: x.responseFull,
        }))
      });
    }
  }

  const summary = {
    meta: {
      generated: new Date().toISOString(),
      totalMeetings: results.length,
      totalQaPairs: results.reduce((s, r) => s + r.qaPairs.length, 0),
      totalSpeakers: Object.keys(bySpeaker).length,
    },
    meetings: results,
    bySpeaker,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));
  console.log(`✓ Meetings: ${results.length}`);
  console.log(`✓ Q&A pairs: ${summary.meta.totalQaPairs}`);
  console.log(`✓ Speakers: ${summary.meta.totalSpeakers}`);
  console.log('---Sample speakers---');
  const topSpeakers = Object.values(bySpeaker)
    .sort((a, b) => b.questions.length - a.questions.length)
    .slice(0, 15);
  topSpeakers.forEach(s => console.log(`  ${s.name}: ${s.questions.length} questions`));
  console.log(`Saved to ${OUTPUT_FILE}`);
}

main();
