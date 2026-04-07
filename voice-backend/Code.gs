/**
 * みんなの伊東市 - 市民の声 バックエンド
 * Google Apps Script Web App
 *
 * 機能:
 *  - doPost: 投稿受付（Cloudflare Worker経由でIP付き）
 *  - doGet : 承認済み投稿を返す（公開API）
 *  - 通知メール送信
 *  - NGワードフィルタ
 *
 * デプロイ手順:
 *  1. 新規スプレッドシート作成
 *  2. 拡張機能 → Apps Script
 *  3. このコードを貼付け
 *  4. CONFIG.SHEET_ID, ADMIN_EMAIL, SHARED_SECRET を設定
 *  5. デプロイ → 新しいデプロイ → ウェブアプリ
 *     - 実行ユーザー: 自分
 *     - アクセス: 全員
 */

// ============ 設定 ============
const CONFIG = {
  SHEET_ID: 'ここにスプレッドシートIDを入れる',
  SHEET_NAME: '投稿',
  ADMIN_EMAIL: 'ka@oh-life.co.jp',
  SHARED_SECRET: 'ここにランダム文字列を入れる_例:abc123xyz789', // CF Workerと共有
  MAX_POSTS_PER_DAY_PER_IP: 5,
  SITE_URL: 'https://keiotake.github.io/ito-council-analysis/',
};

// ============ NGワード（自動却下） ============
const NG_HARD = [
  // 暴力・脅迫
  '殺す', '殺害', 'ぶち殺', '死ね', 'しねよ', '殺してやる', '刺してやる',
  '爆破', '燃やしてやる', '焼き払', 'テロ', '脅迫', '殺害予告',
  // 強い差別語（一部のみ。完全リストは別途追加）
  'キチガイ', '基地外', 'ガイジ',
  // 性的・露骨
  'セックス', 'チンコ', 'マンコ',
];

// 議員・職員への侮蔑（誹謗中傷の自動検出用）
const NG_NAME_INSULT = [
  '無能', '辞めろ', 'クビにしろ', '税金泥棒', '汚職', '不倫', '愛人',
  '裏金', '横領', '犯罪者',
];

// 個人情報パターン
const PII_PATTERNS = [
  /\b0\d{1,3}-\d{1,4}-\d{4}\b/,        // 電話番号
  /\b0[789]0-\d{4}-\d{4}\b/,          // 携帯
  /〒\d{3}-?\d{4}/,                    // 郵便番号
  /[\w.+-]+@[\w-]+\.[\w.-]+/,         // メールアドレス
];

// ============ doPost: 投稿受付 ============
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 共有シークレット検証（CF Workerからのリクエストのみ受付）
    if (data.secret !== CONFIG.SHARED_SECRET) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    }

    // 必須項目チェック
    if (!data.category || !data.title || !data.body) {
      return jsonResponse({ ok: false, error: '必須項目が未入力です' });
    }
    if (data.title.length > 50) {
      return jsonResponse({ ok: false, error: 'タイトルは50文字以内' });
    }
    if (data.body.length > 500) {
      return jsonResponse({ ok: false, error: '本文は500文字以内' });
    }
    if (data.agreed !== true) {
      return jsonResponse({ ok: false, error: '規約への同意が必要です' });
    }

    const ip = data.ip || 'unknown';
    const ua = data.userAgent || 'unknown';

    // レート制限（同一IPから1日5件まで）
    if (countRecentPostsByIP(ip) >= CONFIG.MAX_POSTS_PER_DAY_PER_IP) {
      return jsonResponse({ ok: false, error: '本日の投稿上限に達しました' });
    }

    // NGワード判定
    const fullText = data.title + ' ' + data.body + ' ' + (data.nickname || '');
    const ngFlags = scanContent(fullText);

    let status = '未確認';
    if (ngFlags.includes('HARD')) {
      status = '却下';
    }

    // ID生成
    const id = Utilities.getUuid().substring(0, 8);
    const hash = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      fullText
    ).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('').substring(0, 16);

    // スプレッドシート保存
    const sheet = getSheet();
    sheet.appendRow([
      new Date(),                    // A: タイムスタンプ
      id,                            // B: ID
      status,                        // C: ステータス
      data.category,                 // D: カテゴリ
      data.title,                    // E: タイトル
      data.body,                     // F: 本文
      data.nickname || '匿名',       // G: ニックネーム
      data.area || '',               // H: 居住地区
      ip,                            // I: IP
      ua,                            // J: User Agent
      hash,                          // K: ハッシュ
      ngFlags.join(','),             // L: NGフラグ
      '',                            // M: 承認日時
      '',                            // N: 備考
      '',                            // O: 削除依頼
    ]);

    // 管理者通知メール
    sendNotification(id, data, ip, ngFlags, status);

    return jsonResponse({
      ok: true,
      id: id,
      message: status === '却下'
        ? '投稿は規約違反の疑いがあるため受付できませんでした'
        : 'ご投稿ありがとうございました。運営者の確認後、公開されます'
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ ok: false, error: 'サーバーエラー: ' + err.message }, 500);
  }
}

// ============ doGet: 承認済み投稿の公開API ============
function doGet(e) {
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonResponse({ posts: [] });

    const posts = [];
    // 1行目はヘッダ
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[2] !== '承認') continue;
      posts.push({
        id: row[1],
        date: Utilities.formatDate(new Date(row[0]), 'Asia/Tokyo', 'yyyy-MM-dd'),
        category: row[3],
        title: row[4],
        body: row[5],
        nickname: row[6] || '匿名',
        area: row[7] || '',
      });
    }
    posts.sort((a, b) => b.date.localeCompare(a.date));
    return jsonResponse({ posts: posts, total: posts.length, updated: new Date().toISOString() });
  } catch (err) {
    return jsonResponse({ posts: [], error: err.message }, 500);
  }
}

// ============ ヘルパー ============
function getSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow([
      'タイムスタンプ', 'ID', 'ステータス', 'カテゴリ', 'タイトル',
      '本文', 'ニックネーム', '居住地区', 'IPアドレス', 'User Agent',
      'ハッシュ', 'NGフラグ', '承認日時', '備考', '削除依頼'
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function scanContent(text) {
  const flags = [];
  for (const w of NG_HARD) {
    if (text.indexOf(w) !== -1) { flags.push('HARD:' + w); }
  }
  let nameInsultCount = 0;
  for (const w of NG_NAME_INSULT) {
    if (text.indexOf(w) !== -1) { nameInsultCount++; }
  }
  if (nameInsultCount >= 2) flags.push('INSULT_MULTI');
  for (const re of PII_PATTERNS) {
    if (re.test(text)) { flags.push('PII'); break; }
  }
  return flags;
}

function countRecentPostsByIP(ip) {
  if (!ip || ip === 'unknown') return 0;
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (new Date(data[i][0]) > oneDayAgo && data[i][8] === ip) count++;
  }
  return count;
}

function sendNotification(id, data, ip, ngFlags, status) {
  const subject = `[みんなの伊東市] 新規投稿 ${id} (${status})`;
  const body = [
    `新しい投稿がありました。`,
    ``,
    `ID: ${id}`,
    `ステータス: ${status}`,
    `カテゴリ: ${data.category}`,
    `タイトル: ${data.title}`,
    ``,
    `本文:`,
    data.body,
    ``,
    `ニックネーム: ${data.nickname || '匿名'}`,
    `居住地区: ${data.area || '未指定'}`,
    `IP: ${ip}`,
    `NGフラグ: ${ngFlags.join(', ') || 'なし'}`,
    ``,
    `スプレッドシートで承認/却下: https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}`,
  ].join('\n');
  try {
    MailApp.sendEmail(CONFIG.ADMIN_EMAIL, subject, body);
  } catch (e) { console.error('mail failed:', e); }
}

function jsonResponse(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ メンテナンス用 ============
// スプレッドシートで投稿を一括承認するときに使う
function approveSelected() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  for (let i = 0; i < range.getNumRows(); i++) {
    const row = range.getRow() + i;
    sheet.getRange(row, 3).setValue('承認');
    sheet.getRange(row, 13).setValue(new Date());
  }
}
function rejectSelected() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  for (let i = 0; i < range.getNumRows(); i++) {
    sheet.getRange(range.getRow() + i, 3).setValue('却下');
  }
}
function flagAsReportable() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  for (let i = 0; i < range.getNumRows(); i++) {
    sheet.getRange(range.getRow() + i, 3).setValue('通報対象');
  }
}
