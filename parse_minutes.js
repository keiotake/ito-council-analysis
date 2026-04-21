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

// Split text into speech segments
function splitSpeeches(text) {
  // Match segments starting with ◆◎○ followed by role(name 君)
  const segments = [];
  const regex = /([◆◎○])([^（◆◎○]+)（([^）]+?君)\s*）([\s\S]*?)(?=[◆◎○][^（◆◎○]+（[^）]+君\s*）|$)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const symbol = m[1];
    const position = m[2].trim();
    const nameWithKun = m[3].trim();
    const name = nameWithKun.replace(/\s*君$/, '').replace(/\s+/g, '');
    const body = m[4].trim();
    segments.push({
      symbol,
      position,
      name,
      role: symbol === '◆' ? 'council_member' : symbol === '◎' ? 'authority' : 'chair',
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

  // Group Q&A: council member speech followed by authority responses until next council member
  const qaPairs = [];
  let currentQ = null;
  let currentResponses = [];
  const flushPair = () => {
    if (currentQ) {
      qaPairs.push({
        questioner: currentQ.name,
        questionerPosition: currentQ.position,
        question: summarize(currentQ.body, 400),
        responses: currentResponses.map(r => ({
          responder: r.name,
          position: r.position,
          response: summarize(r.body, 400),
        }))
      });
    }
  };
  for (const seg of segments) {
    if (seg.role === 'council_member') {
      // New question - flush previous pair
      flushPair();
      currentQ = seg;
      currentResponses = [];
    } else if (seg.role === 'authority' && currentQ) {
      currentResponses.push(seg);
    }
    // Skip chair (○) segments - they're procedural
  }
  flushPair();

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
        responses: q.responses.map(x => ({
          responder: x.responder,
          position: x.position,
          response: x.response
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
