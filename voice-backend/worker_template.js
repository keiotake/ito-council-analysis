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

// 第五次伊東市総合計画のコンパクト版コンテキスト
// build_plan_context.js で自動生成 → このWorkerビルド時に埋め込み
const PLAN_CONTEXT = `__PLAN_CONTEXT__`;

// チャットボットのシステムプロンプト
const CHAT_SYSTEM = [
  'あなたは「伊東市総合計画ガイド」です。下記の「第五次伊東市総合計画」の内容だけを根拠に、市民からの質問にやさしく答えます。',
  '',
  '## 回答ルール',
  '1. **必ず計画書の内容に基づいて回答してください**。計画書に書かれていない推測や外部情報は使わないでください。',
  '2. 計画書に該当情報がない場合は「計画書にはその記載が見当たりません」と正直に答え、関連する近い情報を提示してください。',
  '3. 回答は日本語で、やさしく簡潔に。中学生でもわかる表現を心がけてください。',
  '4. 数値(人口、年度等)は計画書の記載をそのまま使ってください。',
  '5. 回答末尾に「📖 根拠」として、参照した政策目標/施策番号(例: 課題3, 政策目標2, 施策2-3)を明記してください。',
  '6. **⚠ 注意事項**: 計画書は令和3年(2021年)3月策定のため、COVID-19や人口等の記述は現時点で古い可能性があります。回答時にその旨が関係する場合は一言添えてください。',
  '7. 議員個人の評価、賛否、投票先の示唆などは一切行わず、中立的に計画書の内容を説明するにとどめてください。',
  '8. 政治的な対立、批判、差別的表現を含む回答はしないでください。',
  '9. 計画書と無関係の質問(例: レシピ、プログラミング等)が来た場合は「伊東市総合計画に関する質問にのみお答えできます」と丁重にお断りしてください。',
  '',
  '## 計画書本文（抜粋）',
  PLAN_CONTEXT,
  '',
  '以上が計画書の内容です。市民からの質問にこの情報を使って答えてください。',
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
