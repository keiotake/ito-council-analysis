/**
 * みんなの伊東市 - 市民の声 + 総合計画チャットボット Cloudflare Worker
 *
 * エンドポイント:
 *  - POST /submit  : 市民の声投稿をGASに転送
 *  - GET  /posts   : 承認済み投稿一覧をGASから中継（60秒キャッシュ）
 *  - POST /chat    : 第五次伊東市総合計画を根拠にした質問応答（Claude API）
 *
 * 必要な環境変数 (Settings → Variables and Secrets):
 *  GAS_URL            : GASウェブアプリURL
 *  SHARED_SECRET      : GASと同じシークレット (Secret)
 *  ALLOWED_ORIGIN     : https://keiotake.github.io
 *  ANTHROPIC_API_KEY  : Claude APIキー (Secret)
 */

// 「みんなの伊東市」サイト全体のコンテキスト
// （議員20名のプロフィール・統計、第五次総合計画、議員×施策マッピングなど）
// build_site_context.js で自動生成 → このWorkerビルド時に埋め込み
const PLAN_CONTEXT = `__PLAN_CONTEXT__`;

// チャットボットのシステムプロンプト
const CHAT_SYSTEM = [
  'あなたは「みんなの伊東市 AIコンシェルジュ」です。',
  '静岡県・伊東市議会の活動を市民に分かりやすく伝えるサイト「みんなの伊東市」に常駐し、',
  'サイトの掲載情報全般（議員プロフィール、質問内容、会派、動画、第五次総合計画など）について',
  '市民からの質問にやさしく案内します。',
  '',
  '## 最重要ルール: 事実のみ回答する',
  '絶対に守ること:',
  '- 下記「サイト情報」に明記されている事実だけを回答すること',
  '- 書かれていないことは絶対に推測・創作しないこと。「その情報はサイトに掲載されていません」と正直に答えること',
  '- 会派名から所属政党を推測してはいけない。例:「政和会」は政和会であり、公明党系でも自民党系でもない。会派名はそのまま伝えること',
  '- 議員のプロフィール（期数、委員会、会派など）は、サイト情報に書かれた通りに正確に答えること',
  '- 質問内容を聞かれた場合は「議員別 質問要約一覧」セクションから該当する議員の質問を探して回答すること',
  '- キーワードで質問を検索する場合は、全議員の質問要約と会派別大綱質疑の質問要約の両方を検索すること',
  '',
  '## 回答ルール',
  '1. 回答は日本語で、やさしく簡潔に。中学生にもわかる言葉を心がけてください。人と会話するときと同じ、自然な話し言葉で答えてください。',
  '2. 可能な限り具体的な数値や固有名詞（議員名・会派名・日付など）を添えてください。',
  '3. 回答の最後に、参照したサイト内の場所を1行だけ、自然な文で添えてください（例：「詳しくは動画・検索タブで検索してみてください。」）。絵文字や「📖 参照:」のような見出しは付けないでください。',
  '4. 関連するタブ・ページがあれば自然に誘導してください（例：「詳細は総合計画タブをご覧ください」）。',
  '',
  '## 書式ルール（とても重要）',
  '市民との自然な会話を目指します。回答は必ず普通の日本語の文章だけで書いてください。以下の記号や書式は一切使わないでください：',
  '- Markdown見出し（#, ##, ### など）',
  '- アスタリスクによる強調（**太字**、*斜体*）',
  '- ハッシュタグ（#○○）',
  '- 表（| 区切り、--- の罫線）',
  '- 米印（※）、矢印(→)、絵文字、顔文字',
  '- 箇条書き記号（-、*、・）',
  '- 区切り線（---、===）',
  '- コードブロック（```）',
  '情報を並べたい場合も、箇条書きではなく「〜は5名、〜は3名です。」のように普通の文で書いてください。複数の項目を分けたい時は、段落（空行）で自然に区切ってください。「こんにちは」「お問い合わせありがとうございます」のように丁寧で親しみやすい口調で、チャットで人と話しているように答えてください。',
  '',
  '## データの限界（質問内容に関する回答では必ず1行添えること）',
  '- 質問要約はYouTube自動字幕の機械抽出のため、不正確な場合があります。正確な内容は動画をご確認ください。',
  '',
  '## 中立性・安全性のルール',
  '6. 特定議員の評価・優劣・賛否・投票先の示唆は一切行わないでください。質問数や施策言及数は「活動の量の指標の一つ」であり、優劣ではないことを明確に伝えてください。',
  '7. 差別・誹謗中傷・政治的対立を煽る表現は出さないでください。',
  '8. 議員個人に関する質問には、サイトに掲載された事実（会派・期数・委員会・統計数値）のみを答え、人物評・人柄・政策評価はしないでください。',
  '9. 議会・行政の手続きや個人の相談（市役所の窓口情報など）についてはサイトに記載がなければ「伊東市公式サイト( https://www.city.ito.shizuoka.jp/ )をご覧ください」と案内してください。',
  '10. サイトと無関係の質問（レシピ、プログラミング、他自治体の話題、時事問題等）が来た場合は「『みんなの伊東市』に掲載された情報に関する質問にお答えしています」と丁重にお断りしてください。',
  '11. 運営者（大竹圭議員）の政策・実績について聞かれた場合も、他の議員と同じく「会派・委員会・統計数値」のみを答え、評価や宣伝はしないでください。',
  '',
  '## サイト情報（回答の唯一の根拠）',
  PLAN_CONTEXT,
  '',
  '以上が「みんなの伊東市」サイトに掲載されている情報です。この情報のみを根拠に、市民からの質問にお答えしてください。',
].join('\n');

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env, origin) });
    }

    // ====== POST /submit : 投稿受付 ======
    if (request.method === 'POST' && url.pathname === '/submit') {
      try {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const ua = request.headers.get('user-agent') || 'unknown';
        const country = request.cf?.country || '';
        if (country && country !== 'JP') {
          return jsonResp({ ok: false, error: '日本国内からのみ投稿可能です' }, 403, env, origin);
        }
        const body = await request.json();
        const payload = { ...body, secret: env.SHARED_SECRET, ip, userAgent: ua, country };
        const gasResp = await fetch(env.GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const text = await gasResp.text();
        return new Response(text, {
          status: gasResp.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(env, origin) },
        });
      } catch (e) {
        return jsonResp({ ok: false, error: e.message }, 500, env, origin);
      }
    }

    // ====== GET /posts : 承認済み投稿一覧 ======
    if (request.method === 'GET' && url.pathname === '/posts') {
      try {
        const cache = caches.default;
        const cacheKey = new Request(url.toString(), request);
        let cached = await cache.match(cacheKey);
        if (cached) return cached;
        const gasResp = await fetch(env.GAS_URL, { method: 'GET' });
        const text = await gasResp.text();
        const resp = new Response(text, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
            ...corsHeaders(env, origin),
          },
        });
        ctx.waitUntil(cache.put(cacheKey, resp.clone()));
        return resp;
      } catch (e) {
        return jsonResp({ posts: [], error: e.message }, 500, env, origin);
      }
    }

    // ====== POST /chat : 総合計画チャットボット ======
    if (request.method === 'POST' && url.pathname === '/chat') {
      try {
        if (!env.ANTHROPIC_API_KEY) {
          return jsonResp({ ok: false, error: 'APIキーが設定されていません' }, 500, env, origin);
        }
        const country = request.cf?.country || '';
        if (country && country !== 'JP') {
          return jsonResp({ ok: false, error: '日本国内からのみ利用可能です' }, 403, env, origin);
        }
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';

        // 簡易レート制限: 同一IPから10分間に20回まで
        const rateKey = new Request('https://ratelimit.local/' + ip, { method: 'GET' });
        const rateCache = caches.default;
        const prev = await rateCache.match(rateKey);
        let count = 0;
        if (prev) { try { count = parseInt(await prev.text()) || 0; } catch(e){} }
        if (count >= 20) {
          return jsonResp({ ok: false, error: '利用回数の上限に達しました。10分ほど時間をおいてから再度お試しください。' }, 429, env, origin);
        }
        ctx.waitUntil(rateCache.put(rateKey, new Response(String(count+1), { headers: { 'Cache-Control':'public, max-age=600' }})));

        const body = await request.json();
        const question = (body.question || '').toString().trim();
        if (question.length < 2) {
          return jsonResp({ ok: false, error: '質問を入力してください' }, 400, env, origin);
        }
        if (question.length > 300) {
          return jsonResp({ ok: false, error: '質問は300文字以内でお願いします' }, 400, env, origin);
        }

        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 600,
            system: CHAT_SYSTEM,
            messages: [{ role: 'user', content: question }],
          }),
        });

        if (!claudeResp.ok) {
          const errText = await claudeResp.text();
          return jsonResp({ ok: false, error: 'AI呼び出しエラー: ' + errText.substring(0,200) }, 502, env, origin);
        }
        const data = await claudeResp.json();
        const answer = data.content?.[0]?.text || '(応答を取得できませんでした)';
        const usage = data.usage || {};

        return jsonResp({
          ok: true,
          answer: answer,
          usage: { input: usage.input_tokens, output: usage.output_tokens },
        }, 200, env, origin);
      } catch (e) {
        return jsonResp({ ok: false, error: e.message }, 500, env, origin);
      }
    }

    return jsonResp({ ok: false, error: 'not found' }, 404, env, origin);
  },
};

function corsHeaders(env, origin) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResp(obj, status, env, origin) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, origin) },
  });
}
