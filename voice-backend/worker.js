/**
 * みんなの伊東市 - 市民の声 Cloudflare Worker
 *
 * 役割:
 *  - クライアントのIPアドレスを取得 (cf-connecting-ip)
 *  - 共有シークレットを付与してGAS Web Appに転送
 *  - GETリクエストもキャッシュ付きで中継
 *
 * デプロイ:
 *  1. Cloudflare ダッシュボード → Workers & Pages → Create Worker
 *  2. このコードを貼付け
 *  3. Settings → Variables → Environment Variables で以下を設定:
 *     GAS_URL          = GASのウェブアプリURL
 *     SHARED_SECRET    = GAS側と同じシークレット文字列
 *     ALLOWED_ORIGIN   = https://keiotake.github.io
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env, origin) });
    }

    // ====== POST: 投稿受付 ======
    if (request.method === 'POST' && url.pathname === '/submit') {
      try {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const ua = request.headers.get('user-agent') || 'unknown';
        const country = request.cf?.country || '';

        // 国外からの投稿はブロック (日本のみ受付)
        if (country && country !== 'JP') {
          return jsonResp({ ok: false, error: '日本国内からのみ投稿可能です' }, 403, env, origin);
        }

        const body = await request.json();

        // GASに転送（シークレット・IP・UAを付与）
        const payload = {
          ...body,
          secret: env.SHARED_SECRET,
          ip: ip,
          userAgent: ua,
          country: country,
        };

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

    // ====== GET: 承認済み投稿の一覧 ======
    if (request.method === 'GET' && url.pathname === '/posts') {
      try {
        // 60秒キャッシュ
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
