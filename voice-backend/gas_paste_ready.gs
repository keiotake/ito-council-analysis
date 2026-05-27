const CONFIG = {
  NOTIFICATION_EMAIL: '★★ここをあなたのGmailアドレスに書き換え★★@gmail.com',
  SHARED_SECRET: '15461647cbbb695c2f83067eaeab6ecd29b5cc0f',
  FROM_NAME: 'みんなの伊東市',
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== CONFIG.SHARED_SECRET) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }
    const post = data.post || {};
    const typeLabel = ({ good: '👍 良いところ', improve: '💡 改善希望', idea: '💭 アイデア' })[post.postType] || post.postType;
    const adminUrl = 'https://all-ito-city.com/admin.html';
    const subject = '【みんなの伊東市】新着投稿: ' + post.title;

    const htmlBody = '<div style="font-family:sans-serif;line-height:1.7;max-width:600px;margin:0 auto;color:#1a1a1a">' +
      '<div style="background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">' +
      '<h1 style="margin:0;font-size:20px">📨 新しい市民の声が届きました</h1>' +
      '<div style="font-size:13px;opacity:0.9;margin-top:4px">みんなの伊東市</div></div>' +
      '<div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px">' +
      '<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:6px;margin-bottom:18px;font-size:13px;color:#78350f">⚠️ 公開には運営者（あなた）の承認が必要です</div>' +
      '<div style="background:#f9fafc;padding:14px 18px;border-radius:8px;margin-bottom:16px">' +
      '<div style="font-size:12px;color:#64748b;margin-bottom:4px">' + escHtml(typeLabel) + ' / ' + escHtml(post.category) + '</div>' +
      '<div style="font-size:17px;font-weight:700;color:#0a0a0a;margin-bottom:8px">' + escHtml(post.title) + '</div>' +
      '<div style="font-size:14px;color:#1e293b;white-space:pre-wrap">' + escHtml(post.body) + '</div></div>' +
      '<div style="font-size:12px;color:#64748b;margin-bottom:18px">' +
      '<div>👤 ' + escHtml(post.nickname || '匿名') + (post.age ? ' / 🎂 ' + escHtml(post.age) : '') + (post.area ? ' / 📍 ' + escHtml(post.area) : '') + '</div>' +
      '<div>🕒 ' + formatDate_(post.createdAt) + '</div>' +
      '<div>🌐 ' + escHtml(post.ip || 'unknown') + '</div></div>' +
      '<a href="' + adminUrl + '" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px">📋 管理画面で承認/却下する</a>' +
      '</div></div>';

    const plainBody = [
      '新しい市民の声が届きました', '',
      '種別: ' + typeLabel + ' / ' + post.category,
      'タイトル: ' + post.title,
      '本文: ' + post.body, '',
      '投稿者: ' + (post.nickname || '匿名') + (post.age ? ' / ' + post.age : '') + (post.area ? ' / ' + post.area : ''),
      '日時: ' + formatDate_(post.createdAt), '',
      '承認/却下: ' + adminUrl,
    ].join('\n');

    MailApp.sendEmail({
      to: CONFIG.NOTIFICATION_EMAIL,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: CONFIG.FROM_NAME,
    });

    return jsonResponse({ ok: true, sent: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonResponse({ ok: true, service: 'みんなの伊東市 通知GAS' });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function escHtml(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate_(iso) {
  if (!iso) return '';
  return Utilities.formatDate(new Date(iso), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
}
