const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SUBTITLES_DIR = path.join(__dirname, 'subtitles');
const MISSING_FILE = path.join(__dirname, 'still_missing.json');
const YTDLP = path.join(__dirname, 'yt-dlp.exe');

if (!fs.existsSync(SUBTITLES_DIR)) {
  fs.mkdirSync(SUBTITLES_DIR, { recursive: true });
}

const videoIds = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));

function sleep(ms) {
  // Blocking sleep using execSync
  execSync(`ping -n ${Math.ceil(ms/1000)+1} 127.0.0.1 > NUL`, { windowsHide: true, stdio: 'ignore' });
}

function downloadSubtitle(videoId) {
  const outFile = path.join(SUBTITLES_DIR, `${videoId}.txt`);
  if (fs.existsSync(outFile)) {
    return { id: videoId, status: 'skipped' };
  }

  const tempDir = path.join(__dirname, 'temp_subs');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // Use yt-dlp to download auto-generated subtitles
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const outTemplate = path.join(tempDir, videoId);

    // Try auto-generated subs first, then regular subs
    const cmd = `"${YTDLP}" --write-auto-sub --sub-lang ja --sub-format vtt --skip-download --no-warnings -o "${outTemplate}" "${url}" 2>&1`;

    let result;
    try {
      result = execSync(cmd, { encoding: 'utf8', timeout: 60000, windowsHide: true });
    } catch (e) {
      result = e.stdout || e.stderr || e.message;
    }

    // Look for downloaded subtitle file
    const possibleFiles = [
      `${outTemplate}.ja.vtt`,
      `${outTemplate}.ja.srt`,
    ];

    let subFile = null;
    for (const f of possibleFiles) {
      if (fs.existsSync(f)) {
        subFile = f;
        break;
      }
    }

    // Also check for any file matching the pattern
    if (!subFile) {
      const files = fs.readdirSync(tempDir).filter(f => f.startsWith(videoId));
      if (files.length > 0) {
        subFile = path.join(tempDir, files[0]);
      }
    }

    if (!subFile) {
      return { id: videoId, status: 'failed', reason: 'no subtitle file generated' };
    }

    // Read and extract text from VTT/SRT
    const content = fs.readFileSync(subFile, 'utf8');
    const text = extractTextFromVtt(content);

    // Clean up temp file
    try { fs.unlinkSync(subFile); } catch(e) {}

    if (!text || text.length < 10) {
      return { id: videoId, status: 'failed', reason: 'empty or too short subtitle' };
    }

    fs.writeFileSync(outFile, text, 'utf8');
    return { id: videoId, status: 'success', length: text.length };

  } catch (err) {
    return { id: videoId, status: 'failed', reason: err.message.substring(0, 200) };
  }
}

function extractTextFromVtt(vttContent) {
  const lines = vttContent.split('\n');
  const textLines = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip VTT headers, timestamps, and empty lines
    if (!trimmed) continue;
    if (trimmed === 'WEBVTT') continue;
    if (trimmed.startsWith('Kind:')) continue;
    if (trimmed.startsWith('Language:')) continue;
    if (trimmed.startsWith('NOTE')) continue;
    if (/^\d+$/.test(trimmed)) continue; // SRT sequence numbers
    if (/-->/.test(trimmed)) continue; // Timestamp lines
    if (/^<\d\d:\d\d/.test(trimmed)) continue; // VTT cue timestamps

    // Remove VTT tags like <c>, </c>, <00:01:02.345>
    let cleaned = trimmed
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      textLines.push(cleaned);
    }
  }

  return textLines.join('\n');
}

// Main
console.log(`Total videos to process: ${videoIds.length}`);
let success = 0, failed = 0, skipped = 0;
const failures = [];

for (let i = 0; i < videoIds.length; i++) {
  const videoId = videoIds[i];
  const result = downloadSubtitle(videoId);

  if (result.status === 'success') {
    success++;
    console.log(`[${i+1}/${videoIds.length}] OK: ${videoId} (${result.length} chars)`);
  } else if (result.status === 'skipped') {
    skipped++;
    console.log(`[${i+1}/${videoIds.length}] SKIP: ${videoId}`);
  } else {
    failed++;
    failures.push(result);
    console.log(`[${i+1}/${videoIds.length}] FAIL: ${videoId} - ${result.reason}`);
  }
}

// Clean up temp dir
try { fs.rmdirSync(path.join(__dirname, 'temp_subs')); } catch(e) {}

console.log('\n=== Summary ===');
console.log(`Success: ${success}`);
console.log(`Failed: ${failed}`);
console.log(`Skipped (already exists): ${skipped}`);
console.log(`Total: ${videoIds.length}`);

if (failures.length > 0) {
  console.log('\nFailed videos:');
  failures.forEach(f => console.log(`  ${f.id}: ${f.reason}`));
}
