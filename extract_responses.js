const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'analysis_data.json');
const SUBTITLES_DIR = path.join(__dirname, 'subtitles');
const OUTPUT_PATH = path.join(__dirname, 'analysis_with_responses.json');

// 当局答弁の開始パターン
const ANSWER_PATTERNS = [
  'お答えいたします',
  'お答えします',
  'お答え申し上げます',
  'お答えをいたします',
  'お答えをします',
  'ご答弁申し上げます',
  'お答えをさせていただきます',
  'お答えさせていただきます',
];

/**
 * テキスト内の全ての答弁パターンの位置を収集する
 */
function findAllAnswerPositions(text) {
  const positions = [];
  for (const pattern of ANSWER_PATTERNS) {
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(pattern, searchFrom);
      if (idx === -1) break;
      positions.push({ index: idx, patternLen: pattern.length, pattern });
      searchFrom = idx + 1;
    }
  }
  positions.sort((a, b) => a.index - b.index);
  const filtered = [];
  for (const p of positions) {
    if (filtered.length === 0 || p.index - filtered[filtered.length - 1].index > 10) {
      filtered.push(p);
    }
  }
  return filtered;
}

/**
 * 質問テキストの位置をテキスト内で見つける
 */
function findQuestionPosition(text, questionText) {
  for (const len of [30, 20, 15, 40, 50]) {
    const searchKey = questionText.substring(0, Math.min(len, questionText.length));
    const pos = text.indexOf(searchKey);
    if (pos !== -1) return pos;
  }
  if (questionText.length > 60) {
    const midKey = questionText.substring(30, 60);
    const pos = text.indexOf(midKey);
    if (pos !== -1) return pos;
  }
  return -1;
}

/**
 * 一括答弁の開始位置を見つける
 */
function findBulkResponseStart(text, answerPositions) {
  // パターン: 「○○議員の質問にお答えいたします」「○○の質疑にお答え」等
  const patterns = [
    /議員の質問に/,
    /の質問にお答え/,
    /の質疑にお答え/,
    /議員の質疑に/,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      // この付近の答弁パターンを探す
      const nearAnswer = answerPositions.find(a => a.index >= m.index && a.index < m.index + 80);
      if (nearAnswer) {
        return nearAnswer.index + nearAnswer.patternLen;
      }
    }
  }
  return -1;
}

/**
 * 一括答弁テキストを「次に」等の区切りで分割する
 */
function splitBulkResponseIntoSections(bulkText) {
  const sectionMarkers = /(次に|続きまして|続いて)/g;
  const positions = [];
  let match;
  while ((match = sectionMarkers.exec(bulkText)) !== null) {
    positions.push(match.index);
  }

  const sections = [];
  let lastIdx = 0;
  for (const pos of positions) {
    if (pos > lastIdx + 30) {
      sections.push(bulkText.substring(lastIdx, pos));
      lastIdx = pos;
    }
  }
  if (lastIdx < bulkText.length) {
    sections.push(bulkText.substring(lastIdx));
  }
  return sections;
}

/**
 * 質問文から重要なキーワードを抽出
 */
function extractKeywords(question) {
  const keywords = new Set();

  // 「について」の前
  for (const m of question.matchAll(/(.{3,20}?)について/g)) {
    const kw = m[1].replace(/^(の|は|が|を|に|と|で|も|へ|から|より)/, '');
    if (kw.length >= 3) keywords.add(kw);
  }

  // 「を伺い」の前
  for (const m of question.matchAll(/(.{3,15}?)(を伺い|をお伺い|について伺い)/g)) {
    const kw = m[1].replace(/^(の|は|が|を|に|と|で|も|へ)/, '');
    if (kw.length >= 3) keywords.add(kw);
  }

  // 漢字4文字以上の連続
  for (const m of question.matchAll(/[\u4e00-\u9fff]{4,}/g)) {
    keywords.add(m[0]);
  }

  // カタカナ3文字以上
  for (const m of question.matchAll(/[\u30a0-\u30ff]{3,}/g)) {
    keywords.add(m[0]);
  }

  return [...keywords];
}

/**
 * 質問と答弁セクションのマッチングスコアを計算
 */
function matchScore(question, sectionText) {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return 0;
  let score = 0;
  for (const kw of keywords) {
    if (sectionText.includes(kw)) {
      score += kw.length;
    }
  }
  return score;
}

/**
 * 答弁テキストから意味のある部分を200文字抽出する
 */
function extractMeaningfulResponse(text, maxLen = 200) {
  // 答弁冒頭の質問繰り返し部分をスキップ
  const skipPatterns = [
    /でありますが/,
    /であります/,
    /でございますが/,
    /でございます/,
    /につきましては/,
  ];

  let result = text;
  for (const pat of skipPatterns) {
    const m = result.match(pat);
    if (m && m.index < 120) {
      const candidate = result.substring(m.index + m[0].length);
      if (candidate.length > 30) {
        result = candidate;
        break;
      }
    }
  }
  return result.substring(0, maxLen).trim();
}

/**
 * メイン処理: 各動画の質問に対する当局答弁を抽出
 */
function processVideo(video, text) {
  const questions = video.questions;
  if (questions.length === 0) return [];

  const qPositions = questions.map(q => findQuestionPosition(text, q));
  const answerPositions = findAllAnswerPositions(text);

  if (answerPositions.length === 0) {
    return questions.map(q => ({ question: q, response: null }));
  }

  // 一括答弁の開始位置と分割
  const bulkStart = findBulkResponseStart(text, answerPositions);
  let bulkSections = [];
  let bulkEndPos = text.length;

  if (bulkStart !== -1) {
    // 一括答弁の終了: 議員名の再出現
    const afterBulk = text.substring(bulkStart);
    const speakerReturn = afterBulk.match(/\d+番.{1,6}(議員|君|くん)/);
    if (speakerReturn) {
      bulkEndPos = bulkStart + speakerReturn.index;
    }
    const bulkText = text.substring(bulkStart, bulkEndPos);
    bulkSections = splitBulkResponseIntoSections(bulkText);
  }

  // === STEP 1: 各質問に対して一括答弁セクションのベストマッチを割り当て ===
  // (ハンガリアン法の簡易版: 貪欲法でスコア順に割り当て)
  const results = questions.map(q => ({ question: q, response: null }));

  if (bulkSections.length > 0) {
    // 全組み合わせのスコアを計算
    const scores = [];
    for (let qi = 0; qi < questions.length; qi++) {
      for (let si = 0; si < bulkSections.length; si++) {
        const score = matchScore(questions[qi], bulkSections[si]);
        if (score > 0) {
          scores.push({ qi, si, score });
        }
      }
    }

    // スコアの高い順にソート
    scores.sort((a, b) => b.score - a.score);

    const usedQuestions = new Set();
    const usedSections = new Set();

    for (const { qi, si, score } of scores) {
      if (usedQuestions.has(qi) || usedSections.has(si)) continue;
      usedQuestions.add(qi);
      usedSections.add(si);
      const response = extractMeaningfulResponse(bulkSections[si]);
      if (response.length >= 15) {
        results[qi].response = response;
      }
    }

    // まだ割り当てのない質問に、残りのセクションを順番に割り当て
    const unassignedQ = [];
    const unassignedS = [];
    for (let qi = 0; qi < questions.length; qi++) {
      if (!results[qi].response) unassignedQ.push(qi);
    }
    for (let si = 0; si < bulkSections.length; si++) {
      if (!usedSections.has(si)) unassignedS.push(si);
    }
    for (let i = 0; i < Math.min(unassignedQ.length, unassignedS.length); i++) {
      const response = extractMeaningfulResponse(bulkSections[unassignedS[i]]);
      if (response.length >= 15) {
        results[unassignedQ[i]].response = response;
      }
    }
  }

  // === STEP 2: まだ回答がない質問について、質問位置直後の答弁パターンを使う ===
  for (let qi = 0; qi < questions.length; qi++) {
    if (results[qi].response) continue;

    const qPos = qPositions[qi];
    if (qPos === -1) continue;

    // 次の質問位置を計算
    let nextQPos = text.length;
    for (let nqi = qi + 1; nqi < questions.length; nqi++) {
      if (qPositions[nqi] !== -1) {
        nextQPos = qPositions[nqi];
        break;
      }
    }

    // 質問テキスト終了後の答弁を探す
    const qEndEstimate = qPos + Math.min(questions[qi].length, 200);

    for (const ap of answerPositions) {
      if (ap.index > qEndEstimate && ap.index < nextQPos) {
        const start = ap.index + ap.patternLen;
        const responseText = text.substring(start, start + 400);
        const response = extractMeaningfulResponse(responseText);
        if (response.length >= 15) {
          results[qi].response = response;
          break;
        }
      }
    }
  }

  // === STEP 3: まだ回答がない質問について、質問位置の後の最も近い答弁を使う ===
  for (let qi = 0; qi < questions.length; qi++) {
    if (results[qi].response) continue;

    const qPos = qPositions[qi];
    if (qPos === -1) continue;

    const afterAnswer = answerPositions.find(a => a.index > qPos + 30);
    if (afterAnswer) {
      const start = afterAnswer.index + afterAnswer.patternLen;
      const responseText = text.substring(start, start + 400);
      const response = extractMeaningfulResponse(responseText);
      if (response.length >= 15) {
        results[qi].response = response;
      }
    }
  }

  // === STEP 4: 重複答弁の解消 ===
  // 同じ答弁が複数の質問に割り当てられている場合、最もスコアの高い質問だけに残す
  const responseMap = {};
  results.forEach((r, i) => {
    if (!r.response) return;
    const key = r.response.substring(0, 60);
    if (!responseMap[key]) responseMap[key] = [];
    responseMap[key].push(i);
  });

  for (const [key, indices] of Object.entries(responseMap)) {
    if (indices.length <= 1) continue;

    // 重複あり: 一括答弁のセクションがあれば再割り当て、なければスコア最高のみ残す
    if (bulkSections.length > 1) {
      // 各重複質問に異なるセクションを割り当て
      const usedSections = new Set();
      // まず現在のresponseがどのセクションに対応するか特定
      const currentSectionIdx = bulkSections.findIndex(s =>
        s.includes(results[indices[0]].response.substring(0, 30))
      );
      if (currentSectionIdx !== -1) usedSections.add(currentSectionIdx);

      // スコア最高の質問は現在の割り当てを維持
      let bestIdx = indices[0];
      let bestScore = 0;
      for (const idx of indices) {
        const score = matchScore(questions[idx], results[idx].response);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      }

      // 他の質問には別のセクションを割り当て
      for (const idx of indices) {
        if (idx === bestIdx) continue;
        results[idx].response = null; // リセット

        let newBestSection = -1;
        let newBestScore = 0;
        for (let si = 0; si < bulkSections.length; si++) {
          if (usedSections.has(si)) continue;
          const score = matchScore(questions[idx], bulkSections[si]);
          if (score > newBestScore) {
            newBestScore = score;
            newBestSection = si;
          }
        }

        if (newBestSection !== -1) {
          usedSections.add(newBestSection);
          const response = extractMeaningfulResponse(bulkSections[newBestSection]);
          if (response.length >= 15) {
            results[idx].response = response;
          }
        }
      }
    } else {
      // セクション分割なし: スコア最高のみ残す
      let bestIdx = indices[0];
      let bestScore = 0;
      for (const idx of indices) {
        const score = matchScore(questions[idx], results[idx].response);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      }
      for (const idx of indices) {
        if (idx !== bestIdx) {
          results[idx].response = null;
        }
      }
    }
  }

  return results;
}

// メイン
function main() {
  console.log('読み込み中...');
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

  let processedCount = 0;
  let totalQuestions = 0;
  let questionsWithResponse = 0;

  const output = {
    totalVideos: data.totalVideos,
    videos: data.videos.map((video, vi) => {
      const subtitlePath = path.join(SUBTITLES_DIR, `${video.videoId}.txt`);

      if (!fs.existsSync(subtitlePath) || video.questions.length === 0) {
        return {
          ...video,
          questions: video.questions.map(q => ({ question: q, response: null }))
        };
      }

      const text = fs.readFileSync(subtitlePath, 'utf8');
      processedCount++;
      totalQuestions += video.questions.length;

      const results = processVideo(video, text);
      results.forEach(r => { if (r.response) questionsWithResponse++; });

      if (vi % 100 === 0) {
        console.log(`  処理中... ${vi}/${data.videos.length}`);
      }

      return {
        ...video,
        questions: results
      };
    })
  };

  // 重複レポート
  let duplicateVideos = 0;
  let totalDuplicates = 0;
  for (const v of output.videos) {
    const responses = v.questions.filter(q => q.response).map(q => q.response.substring(0, 50));
    const unique = new Set(responses);
    if (responses.length > unique.size) {
      duplicateVideos++;
      totalDuplicates += responses.length - unique.size;
    }
  }

  console.log(`\n=== 処理完了 ===`);
  console.log(`対象動画数: ${processedCount}`);
  console.log(`総質問数: ${totalQuestions}`);
  console.log(`回答抽出成功: ${questionsWithResponse} (${(questionsWithResponse / totalQuestions * 100).toFixed(1)}%)`);
  console.log(`重複回答がある動画: ${duplicateVideos}`);
  console.log(`重複回答数: ${totalDuplicates}`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n出力: ${OUTPUT_PATH}`);

  // サンプル
  console.log('\n=== サンプル ===');
  let shown = 0;
  for (const v of output.videos) {
    if (shown >= 4) break;
    const withResp = v.questions.filter(q => q.response);
    if (withResp.length > 0) {
      const q = withResp[0];
      console.log(`\n[${v.videoId}] (${v.sessionType})`);
      console.log(`  Q: ${q.question.substring(0, 80)}...`);
      console.log(`  A: ${q.response.substring(0, 100)}...`);
      shown++;
    }
  }
}

main();
