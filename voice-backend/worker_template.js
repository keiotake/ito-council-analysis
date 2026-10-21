/**
 * みんなの伊東市 - 市民の声 + 総合計画チャットボット Cloudflare Worker
 *
 * エンドポイント:
 *  - POST /submit  : 市民の声投稿をGASに転送
 *  - GET  /posts   : 承認済み投稿一覧をGASから中継（60秒キャッシュ）
 *  - POST /chat    : 第五次伊東市総合計画を根拠にした質問応答（Claude API）
 *  - POST /pageview : ページビューカウント（KV使用）
 *  - GET  /pageview : 現在のカウント取得
 *
 * 必要な環境変数 (Settings → Variables and Secrets):
 *  GAS_URL            : GASウェブアプリURL
 *  SHARED_SECRET      : GASと同じシークレット (Secret)
 *  ALLOWED_ORIGIN     : https://keiotake.github.io
 *  ANTHROPIC_API_KEY  : Claude APIキー (Secret)
 *
 * KVバインディング:
 *  PAGEVIEW_KV        : ページビューカウンター用KVネームスペース
 */

// 「みんなの伊東市」サイト全体のコンテキスト
// （議員20名のプロフィール・統計、第五次総合計画、議員×施策マッピングなど）
// build_site_context.js で自動生成 → このWorkerビルド時に埋め込み
const PLAN_CONTEXT = `__PLAN_CONTEXT__`;

// チャットボットのシステムプロンプト
// === フォールバック辞書：主要な行政・議会・財政用語 ===
// APIエラー時や想定される用語にはこの辞書で即答
const TERM_DICTIONARY = {
  '実質公債費比率': {
    summary: '市の借金返済の重さを示す指標の一つ',
    explain: '市の収入に対して、借金（地方債）の返済にどれくらいお金を使っているかを示す割合です。家計でいえば、収入に対する住宅ローンの返済額の割合のような考え方です。全国的には、この比率が25%を超えると要注意、35%以上になると新たな借金に国の許可が必要になります。',
    example: '伊東市は令和5年度で6.5%と、健全基準の25%を大きく下回っています。数値が低いほど財政に余裕があるといえます。'
  },
  '百条委員会': {
    summary: '市議会が不正やミスを調査するために設置する特別な調査チーム',
    explain: '地方自治法第100条に基づき、議会が市の事務について調査するために設置する特別委員会のこと。証人出頭や記録提出を求める強い権限があり、拒否や虚偽陳述には罰則があります。学校で何か問題が起きたときの真相究明委員会と似ています。',
    example: '令和7年に伊東市では市長の学歴詐称疑惑をめぐり設置され、全国的にも注目されました。'
  },
  '大綱質疑': {
    summary: '予算・決算などの重要案件について、会派の代表が行う大枠の質問',
    explain: '市が提出する予算案や決算の概要について、各会派の代表議員がまとめて質問する場です。個別の細かな数字ではなく、予算編成の方針や全体の方向性など、大きな枠組みを確認するのが目的です。',
    example: '3月定例会の予算大綱質疑、9月定例会の決算大綱質疑として年に複数回行われます。'
  },
  '一般質問': {
    summary: '議員が市政全般について市長や当局に質問する機会',
    explain: '市議会の定例会で、議員が個人として市政のあらゆる事項について、市長や担当部長に直接質問できる制度です。議員1人あたりの持ち時間は決まっており、伊東市議会では1人50分以内で行われます。',
    example: '定例会ごとに複数の議員が登壇し、それぞれの関心テーマについて質問します。'
  },
  '財政調整基金': {
    summary: '市の貯金。景気悪化や災害など不測の事態に備えるお金',
    explain: '家計でいう「貯金」のようなもの。税収が落ち込んだ年や、災害対応で急な出費が必要になった時に取り崩して使います。一般的に標準財政規模の10〜20%が目安とされます。',
    example: '伊東市は令和5年度末で31.6億円を保有し、標準財政規模の18.88%にあたります。'
  },
  '経常収支比率': {
    summary: '固定的な収入のうち、固定的な支出がどれだけを占めるかの割合',
    explain: '家計でいえば、毎月の収入のうち家賃や光熱費など「必ず出ていくお金」の割合です。この比率が高いと、新しい事業に回せるお金が少ないことを意味します。一般的に80〜90%が適正水準とされます。',
    example: '伊東市は令和5年度で88.1%と、全国平均93.1%より良好な水準です。'
  },
  '将来負担比率': {
    summary: '将来の世代が負担する借金や債務の重さを示す指標',
    explain: '市が現在抱えている借金や、将来支払う義務のあるお金（退職金など）の合計を、市の収入で割った比率です。この数値が高いほど、将来の世代にツケを残すことを意味します。',
    example: '伊東市は0.0%で、充当可能な財源が将来負担を上回る健全な状態です。'
  },
  '不信任決議': {
    summary: '議会が市長を信頼できないと正式に表明する決議',
    explain: '市議会が市長に対して「もう市長の職を続けてほしくない」と意思表示する決議です。議員の3分の2以上が出席し、その4分の3以上が賛成すると可決します。可決されると市長は10日以内に議会を解散するか、自ら辞職するかを選ぶことになります。',
    example: '令和7年に伊東市議会で市長に対する不信任決議が提出されました。'
  },
  '辞職勧告決議': {
    summary: '議会が市長・議員に辞職を求める決議',
    explain: '不信任決議と違って法的な効力はありませんが、議会の意思を示すものです。辞職を強制することはできません。道義的・政治的な圧力として出されます。',
    example: '令和7年7月、伊東市議会で市長の学歴詐称疑惑に対する辞職勧告決議が全会一致で可決されました。'
  },
  '議会解散': {
    summary: '議員の任期中に議会そのものを終了させること',
    explain: '本来4年の任期を途中で終わらせ、議員全員が失職します。その後、新たな市議会議員選挙が行われます。市長の不信任決議が可決された場合に市長が対抗手段として行う「議会解散」が有名です。',
    example: '令和7年に伊東市議会は全国的に異例の議会解散が行われました。'
  },
  '専決処分': {
    summary: '市長が議会の議決を経ずに決定できる特例措置',
    explain: '本来は議会の議決が必要な事項を、時間的余裕がない場合などに市長が独自の判断で処分する仕組みです。後日、必ず議会に報告し承認を求める必要があります。',
    example: '市長選挙に必要な補正予算を、議会招集を待てない事情で専決処分することがあります。'
  },
  '指定管理者': {
    summary: '市の施設の運営を任された民間事業者',
    explain: '図書館や体育館など、市が持っている公の施設の管理・運営を、民間企業やNPOなどに任せる制度です。市が直接運営するより、民間のノウハウを活かして良いサービスやコスト削減が期待されます。',
    example: '伊東市の文化施設や福祉施設の一部で指定管理者制度が導入されています。'
  },
  '補正予算': {
    summary: '年度途中で当初予算を修正・追加する予算',
    explain: '家計の予算をイメージしてください。「今年はこれだけ使おう」と決めた予算に、途中で「台風被害の修繕で追加が必要」「国からの補助金が入ってきた」などで修正を加えるのが補正予算です。',
    example: '伊東市では年に数回、定例会に合わせて補正予算が編成されます。'
  },
  'パブリックコメント': {
    summary: '市が計画や条例を作る時に市民から意見を募集する制度',
    explain: '通称「パブコメ」。市が新しい政策や計画の案を作った時、正式に決定する前に市民から意見を集める仕組みです。提出された意見は市が検討し、政策に反映されることもあります。',
    example: '伊東市HPの「パブリックコメント」ページで募集中の案件を確認できます。'
  },
  '陳情': {
    summary: '議員の紹介なしで市民が議会に要望を届ける正式な方法',
    explain: '市政や議会に対する希望を文書で議会に提出する制度です。誰でも提出でき、議会の委員会で審査されます。「請願」と似ていますが、請願が議員の紹介を必要とするのに対し、陳情は紹介なしで提出できます。',
    example: '伊東市議会事務局で陳情書の様式と提出方法を案内しています。'
  },
  '請願': {
    summary: '議員の紹介を得て市民が議会に要望を届ける正式な方法',
    explain: '憲法で保障された市民の権利の一つで、紹介議員（1名以上）の署名を得て議会に提出します。本会議で採択・不採択が決まる重要な手続きです。',
    example: '陳情と違い、議員が紹介者として名前を添えるため、議論の場が広がりやすい特徴があります。'
  },
  'ゼロカーボンシティ': {
    summary: '2050年までに温室効果ガスの排出実質ゼロを目指す自治体',
    explain: '地球温暖化対策として、二酸化炭素などの温室効果ガスを出す量と、森林などが吸収する量を等しくする（実質ゼロにする）ことを目指す自治体のことです。',
    example: '伊東市は令和5年3月にゼロカーボンシティ宣言を行い、2050年実質ゼロを目標に掲げています。'
  },
  '議会運営委員会': {
    summary: '議会の進行やルールを決める委員会',
    explain: '定例会の日程や議案の取扱い、議会の運営方法について話し合う委員会です。議員の中から選ばれた委員が、円滑な議会運営のために事前に協議します。',
    example: '各定例会の開会前に議会運営委員会が開かれ、審議の段取りが決まります。'
  },
  '決算大綱質疑': {
    summary: '前年度の決算について、会派の代表が大枠で行う質疑',
    explain: '決算（1年間のお金の使い方の結果）に対して、各会派の代表議員が全体的な質問を行う場です。個別の事業ごとの細かな審査は「予算・決算特別委員会」で行われ、ここでは大枠の評価や方針を議論します。',
    example: '9月定例会で前年度決算について行われるのが通例です。'
  },
  '予算大綱質疑': {
    summary: '新年度予算について、会派の代表が大枠で行う質疑',
    explain: '市が新年度に行う事業や使うお金の計画に対して、各会派の代表議員が全体的な質問を行う場です。予算編成の方針や重点施策について議論します。',
    example: '3月定例会で翌年度（新年度）の予算案について行われるのが通例です。'
  },
  '委員会付託': {
    summary: '議案を担当の委員会に送って詳しく審査してもらうこと',
    explain: '本会議ですべての議案を詳しく議論する時間はないので、それぞれの分野に詳しい常任委員会（総務・観光建設・福祉文教など）に振り分けて審査します。委員会で審査した結果を本会議に報告し、最終的な採決を行います。',
    example: '伊東市議会では通常、議案は担当の常任委員会に付託されて審査されます。'
  },
};

function normalizeTerm(t) {
  return (t || '').trim().replace(/[\s　]/g, '');
}

const CHAT_SYSTEM = [
  'あなたは「みんなの伊東市 AIコンシェルジュ」です。',
  '静岡県・伊東市議会の活動を市民に分かりやすく伝えるサイト「みんなの伊東市」に常駐し、',
  'サイトの掲載情報全般（議員プロフィール、質問内容、会派、動画、第五次総合計画など）について',
  '市民からの質問にやさしく案内します。',
  '',
  '## 最重要ルール: 事実のみ回答する',
  '絶対に守ること:',
  '- 下記「サイト情報」に明記されている事実だけを回答すること（ただし後述の【例外】に注意）',
  '- 書かれていないことは絶対に推測・創作しないこと。「その情報はサイトに掲載されていません」と正直に答えること',
  '- 会派名から所属政党を推測してはいけない。例:「政和会」は政和会であり、公明党系でも自民党系でもない。会派名はそのまま伝えること',
  '- 議員のプロフィール（期数、委員会、会派など）は、サイト情報に書かれた通りに正確に答えること',
  '',
  '## 【例外】 行政用語・議会用語・財政用語の解説',
  '市民から「XXとは何？」「XXについて教えて」「XXの意味」のように、行政・議会・財政用語そのものの意味を尋ねられた場合は、サイト情報の有無に関わらず、一般的な定義を中学生にもわかるやさしい日本語で説明してください。',
  'この例外が適用される用語の例：百条委員会、実質公債費比率、財政調整基金、経常収支比率、大綱質疑、一般質問、委員会付託、専決処分、指定管理者、補正予算、PFI、公共工事、補助金、交付税、条例、規則、要綱、可決、否決、継続審査、議会運営委員会、会期、閉会中審査 など行政・議会・財政に関するあらゆる一般用語。',
  '解説の構成：',
  '  (1) 一文でズバッと要点（例：「市の借金返済の重さを示す指標のひとつ」）',
  '  (2) もう少し詳しく、身近な例えを交えて（例：「家計でいうと、年収に対する住宅ローン返済額の割合のような考え方」）',
  '  (3) 伊東市議会のサイト情報にこの用語を使った議論があれば、どのタブで見られるかを一言だけ添える（例：「実際の議会での議論は『議員一覧』から各議員の質問をご覧ください」）',
  '注意：政治的な意味合いや特定議員の評価は含めないこと。用語の一般的な意味のみ説明する。',
  '',
  '- 質問内容を聞かれた場合の検索手順（必ず全ステップを実行すること）:',
  '  ステップ1: 「議員別 質問要約一覧」セクションからその議員の個人質問を検索する',
  '  ステップ2: その議員のプロフィールから所属会派を確認する',
  '  ステップ3: 「会派別 大綱質疑・予算質疑の質問要約」セクションからその会派名で質疑を検索する',
  '  ステップ4: ステップ1とステップ3の両方の結果をまとめて回答する',
  '  重要: ステップ3を省略してはならない。大綱質疑は会派代表質問であり、所属議員に関連する重要な情報源である',
  '- キーワードで質問を検索する場合も、「議員別 質問要約一覧」と「会派別 大綱質疑・予算質疑の質問要約」の両セクションを漏れなく検索すること',
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
  '## サイト改善要望の受付',
  'ユーザーからサイトの改善要望・機能リクエスト・バグ報告を受け取った場合は:',
  '1. まず「貴重なご意見ありがとうございます」とお礼を伝える',
  '2. 内容を簡潔にまとめて確認する',
  '3. 「運営者（大竹議員）に伝えます。今後の改善に活かしていきます。」と回答する',
  '4. 回答のJSON内に feedback フィールドとして要望内容を含めること（システム処理用）',
  'サイトに関する建設的な意見や要望は歓迎する姿勢で対応してください。',
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

    // ====== POST /submit : 投稿受付（KV保存・運営者承認待ち） ======
    if (request.method === 'POST' && url.pathname === '/submit') {
      try {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const ua = request.headers.get('user-agent') || 'unknown';
        const country = request.cf?.country || '';
        if (country && country !== 'JP') {
          return jsonResp({ ok: false, error: '日本国内からのみ投稿可能です' }, 403, env, origin);
        }
        const body = await request.json();

        // 入力バリデーション
        if (!body.title || body.title.length > 50) return jsonResp({ ok: false, error: 'タイトルは1〜50文字' }, 400, env, origin);
        if (!body.body || body.body.length > 500) return jsonResp({ ok: false, error: '本文は1〜500文字' }, 400, env, origin);
        if (!body.category) return jsonResp({ ok: false, error: 'カテゴリ必須' }, 400, env, origin);
        if (!body.agreed) return jsonResp({ ok: false, error: '同意必須' }, 400, env, origin);

        // 簡易NGワード
        const ngWords = ['死ね', 'バカ', '無能', 'クソ', '殺', 'kill', 'fuck'];
        const blob = (body.title + body.body).toLowerCase();
        for (const w of ngWords) if (blob.includes(w.toLowerCase())) {
          return jsonResp({ ok: false, error: 'ガイドライン違反の語句が含まれています' }, 400, env, origin);
        }

        // KVに保存
        if (!env.POSTS_KV) return jsonResp({ ok: false, error: 'ストレージが設定されていません（運営者へご連絡ください）' }, 500, env, origin);

        // IP別レート制限：1日5件
        const dateKey = new Date().toISOString().slice(0, 10);
        const ipKey = `ratelimit:${dateKey}:${ip}`;
        const ipCount = parseInt(await env.POSTS_KV.get(ipKey) || '0');
        if (ipCount >= 5) return jsonResp({ ok: false, error: '1日の投稿上限(5件)に達しました' }, 429, env, origin);
        await env.POSTS_KV.put(ipKey, String(ipCount + 1), { expirationTtl: 86400 });

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const post = {
          id, createdAt: now,
          postType: body.postType || 'good',
          category: body.category,
          title: body.title,
          body: body.body,
          nickname: body.nickname || '',
          age: body.age || '',
          area: body.area || '',
          ip, userAgent: ua, country,
          status: 'pending', // pending | approved | rejected
        };
        await env.POSTS_KV.put(`post:${id}`, JSON.stringify(post));
        // インデックスにも追加（pending側）
        const pendingList = JSON.parse(await env.POSTS_KV.get('index:pending') || '[]');
        pendingList.unshift(id);
        await env.POSTS_KV.put('index:pending', JSON.stringify(pendingList.slice(0, 500)));

        // 運営者にメール通知（バックグラウンド・失敗してもユーザーには影響しない）
        if (env.NOTIFY_GAS_URL && env.NOTIFY_GAS_SECRET) {
          ctx.waitUntil(sendNotificationEmail(env, post).catch(e => console.error('Notification failed:', e)));
        }

        return jsonResp({
          ok: true,
          message: '投稿を受け付けました。運営者の確認後に公開されます。',
          id,
        }, 200, env, origin);
      } catch (e) {
        return jsonResp({ ok: false, error: e.message }, 500, env, origin);
      }
    }

    // ====== GET /posts : 承認済み投稿一覧（KVから） ======
    if (request.method === 'GET' && url.pathname === '/posts') {
      try {
        if (!env.POSTS_KV) return jsonResp({ ok: true, posts: [], total: 0 }, 200, env, origin);
        const cache = caches.default;
        const cacheKey = new Request(url.toString(), request);
        let cached = await cache.match(cacheKey);
        if (cached) return cached;

        const approvedList = JSON.parse(await env.POSTS_KV.get('index:approved') || '[]');
        const posts = [];
        for (const id of approvedList.slice(0, 100)) {
          const raw = await env.POSTS_KV.get(`post:${id}`);
          if (raw) {
            const p = JSON.parse(raw);
            // 公開用に内部情報を除外
            posts.push({
              id: p.id,
              date: (p.publishedAt || p.createdAt).slice(0, 10),
              postType: p.postType,
              category: p.category,
              title: p.title,
              body: p.body,
              nickname: p.nickname,
              age: p.age,
              area: p.area,
            });
          }
        }

        const resp = new Response(JSON.stringify({ ok: true, posts, total: posts.length }), {
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
        return jsonResp({ ok: false, posts: [], error: e.message }, 500, env, origin);
      }
    }

    // ====== /admin/posts : 運営者用 投稿一覧（pending含む） ======
    if (url.pathname === '/admin/posts') {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.ADMIN_SECRET}`) return jsonResp({ ok: false, error: '認証エラー' }, 401, env, origin);
      if (!env.POSTS_KV) return jsonResp({ ok: false, error: 'POSTS_KV未設定' }, 500, env, origin);
      const pending = JSON.parse(await env.POSTS_KV.get('index:pending') || '[]');
      const approved = JSON.parse(await env.POSTS_KV.get('index:approved') || '[]');
      const all = [...pending, ...approved];
      const posts = [];
      for (const id of all.slice(0, 200)) {
        const raw = await env.POSTS_KV.get(`post:${id}`);
        if (raw) posts.push(JSON.parse(raw));
      }
      return jsonResp({ ok: true, posts }, 200, env, origin);
    }

    // ====== /admin/moderate : 運営者用 承認/却下 ======
    if (request.method === 'POST' && url.pathname === '/admin/moderate') {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.ADMIN_SECRET}`) return jsonResp({ ok: false, error: '認証エラー' }, 401, env, origin);
      if (!env.POSTS_KV) return jsonResp({ ok: false, error: 'POSTS_KV未設定' }, 500, env, origin);
      const { id, action } = await request.json(); // action: approve | reject
      const raw = await env.POSTS_KV.get(`post:${id}`);
      if (!raw) return jsonResp({ ok: false, error: '投稿が見つかりません' }, 404, env, origin);
      const post = JSON.parse(raw);
      const pendingList = JSON.parse(await env.POSTS_KV.get('index:pending') || '[]');
      const approvedList = JSON.parse(await env.POSTS_KV.get('index:approved') || '[]');
      const newPending = pendingList.filter(x => x !== id);
      let newApproved = approvedList.filter(x => x !== id);
      if (action === 'approve') {
        post.status = 'approved';
        post.publishedAt = new Date().toISOString();
        newApproved = [id, ...newApproved];
      } else {
        post.status = 'rejected';
      }
      await env.POSTS_KV.put(`post:${id}`, JSON.stringify(post));
      await env.POSTS_KV.put('index:pending', JSON.stringify(newPending));
      await env.POSTS_KV.put('index:approved', JSON.stringify(newApproved.slice(0, 500)));
      // /postsキャッシュをクリア
      const cache = caches.default;
      ctx.waitUntil(cache.delete(`${url.origin}/posts`));
      return jsonResp({ ok: true, post }, 200, env, origin);
    }

    // ====== POST /chat : 総合計画チャットボット ======
    // 画面から呼ばれておらず、1回ごとに大きな資料をAIへ送るため、出典つきAI検索に作り直すまで停止中。
    // 再開するときは CHAT_ENABLED を true にする。
    const CHAT_ENABLED = false;
    if (request.method === 'POST' && url.pathname === '/chat' && !CHAT_ENABLED) {
      return jsonResp({ ok: false, error: 'この機能は現在停止しています' }, 503, env, origin);
    }
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
          const isLimitError = /usage limit|rate_limit|credit/.test(errText);
          if (isLimitError) {
            return jsonResp({
              ok: false,
              error: 'ただいまAIコンシェルジュが混雑しているため、ご質問にお答えできません。時間をおいてから再度お試しください。',
              errorCode: 'api_limit',
            }, 503, env, origin);
          }
          return jsonResp({ ok: false, error: 'AI応答エラーが発生しました。時間をおいてお試しください。', errorCode: 'api_error' }, 502, env, origin);
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

    // ====== POST /subscribe : 新着通知メール登録 ======
    if (request.method === 'POST' && url.pathname === '/subscribe') {
      try {
        const country = request.cf?.country || '';
        if (country && country !== 'JP') {
          return jsonResp({ ok: false, error: '日本国内からのみ登録可能です' }, 403, env, origin);
        }
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        // レート制限（10分間に5回まで）
        const rateKey = new Request('https://sublimit.local/' + ip, { method: 'GET' });
        const rateCache = caches.default;
        const prev = await rateCache.match(rateKey);
        let count = 0;
        if (prev) { try { count = parseInt(await prev.text()) || 0; } catch(e){} }
        if (count >= 5) {
          return jsonResp({ ok: false, error: '登録回数の上限に達しました。10分後にお試しください。' }, 429, env, origin);
        }
        ctx.waitUntil(rateCache.put(rateKey, new Response(String(count+1), { headers: { 'Cache-Control':'public, max-age=600' }})));

        const body = await request.json();
        const email = (body.email || '').toString().trim().toLowerCase();
        const interests = Array.isArray(body.interests) ? body.interests.slice(0, 10) : [];
        const action = (body.action || 'subscribe').toString();

        // メールアドレス検証
        if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
          return jsonResp({ ok: false, error: '有効なメールアドレスを入力してください' }, 400, env, origin);
        }
        if (email.length > 200) {
          return jsonResp({ ok: false, error: 'メールアドレスが長すぎます' }, 400, env, origin);
        }

        // GAS経由で登録（既存の/submitと同じパターン）
        if (!env.GAS_URL) {
          return jsonResp({ ok: false, error: 'サーバー設定が不完全です' }, 500, env, origin);
        }
        const payload = {
          type: 'email_subscription',
          email,
          interests,
          action, // 'subscribe' or 'unsubscribe'
          secret: env.SHARED_SECRET,
          ip,
          country,
          timestamp: new Date().toISOString(),
        };
        const gasResp = await fetch(env.GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const gasText = await gasResp.text();
        let gasJson = {};
        try { gasJson = JSON.parse(gasText); } catch(e){}
        if (!gasResp.ok || gasJson.ok === false) {
          return jsonResp({ ok: false, error: gasJson.error || 'サーバー側でエラーが発生しました' }, 502, env, origin);
        }
        return jsonResp({
          ok: true,
          message: action === 'subscribe' ? '登録ありがとうございます。新着議会情報をお届けします。' : '配信停止しました。',
        }, 200, env, origin);
      } catch (e) {
        return jsonResp({ ok: false, error: e.message }, 500, env, origin);
      }
    }

    // ====== POST /topic : 議会質問のトピック生成（バッチ処理用） ======
    if (request.method === 'POST' && url.pathname === '/topic') {
      try {
        if (!env.ANTHROPIC_API_KEY) {
          return jsonResp({ ok: false, error: 'APIキーが設定されていません' }, 500, env, origin);
        }
        // バッチ生成用エンドポイント、管理者用シークレット認証
        const authHeader = request.headers.get('X-Admin-Secret') || '';
        if (!env.ADMIN_SECRET || authHeader !== env.ADMIN_SECRET) {
          return jsonResp({ ok: false, error: 'Unauthorized' }, 401, env, origin);
        }
        const body = await request.json();
        const questionText = (body.text || '').toString().trim();
        const sessionType = (body.sessionType || '').toString().trim();
        if (questionText.length < 10) {
          return jsonResp({ ok: false, error: 'テキストが短すぎます' }, 400, env, origin);
        }
        // 最大2000文字まで
        const text = questionText.substring(0, 2000);

        const topicSystem = [
          'あなたは「議会での質問や発言を一言で要約する編集者」です。',
          '市民がパッと見てすぐ内容を把握できる、端的で具体的な見出しを作ります。',
          '',
          '## ルール',
          '1. 見出しは15〜35文字の日本語。必ず「〜について」または名詞句で終わる',
          '2. 具体的な対象物や事柄を必ず含める（例：「特別会計補正予算」「指定管理者の選定」「ポスター掲示場」など）',
          '3. 冒頭の定型句・フィラーは無視する：',
          '   - 「ただいま議題となっております」「ただいま議題となりました」',
          '   - 「先ほどの答弁で」「今のお話ですと」「それで」',
          '   - 「まず」「次に」「続いて」「以下」',
          '4. 抽象的な言葉だけの見出しは禁止：',
          '   NG：「この問題について」「提案理由について」「議題について」',
          '   NG：「報告について」「審査について」「説明について」',
          '5. 議案番号や会議報告は「内容の本質」を抽出：',
          '   例：「議題となりました特別会計補正予算２件につきまして…審査の結果を報告」',
          '     → 「特別会計補正予算２件（委員会審査報告）」',
          '   例：「発議第６号 市長に対する不信任決議」→ 「市長に対する不信任決議について」',
          '6. 再質問や続きの質問は、元の論点が何かを本文から読み取って見出しにする',
          '   例：「先ほどの井戸議員への答弁で…管理栄養士…」→ 「管理栄養士の資格要件について」',
          '7. 金額や数値は含めてよい（例：「３，７００万円の選挙費補正について」）',
          '',
          '## 出力フォーマット',
          'トピックの見出しだけを1行で返してください。説明や引用符は不要です。',
        ].join('\n');

        const userMsg = `次の議会発言について、15〜35文字で具体的な見出しを作ってください。${sessionType ? `\n種別：${sessionType}` : ''}\n\n発言：\n${text}`;

        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 100,
            system: topicSystem,
            messages: [{ role: 'user', content: userMsg }],
          }),
        });
        if (!claudeResp.ok) {
          const errText = await claudeResp.text();
          return jsonResp({ ok: false, error: 'AI呼び出しエラー: ' + errText.substring(0,200) }, 502, env, origin);
        }
        const data = await claudeResp.json();
        let topic = (data.content?.[0]?.text || '').trim();
        // 先頭・末尾の引用符を除去
        topic = topic.replace(/^["「『]+/, '').replace(/["」』]+$/, '').trim();
        // 改行があれば最初の行だけ
        topic = topic.split(/[\n\r]/)[0].trim();

        return jsonResp({
          ok: true,
          topic,
          usage: data.usage || {},
        }, 200, env, origin);
      } catch (e) {
        return jsonResp({ ok: false, error: e.message }, 500, env, origin);
      }
    }

    // ====== POST /explain : 行政用語の分かりやすい解説 ======
    if (request.method === 'POST' && url.pathname === '/explain') {
      try {
        if (!env.ANTHROPIC_API_KEY) {
          return jsonResp({ ok: false, error: 'APIキーが設定されていません' }, 500, env, origin);
        }
        const country = request.cf?.country || '';
        if (country && country !== 'JP') {
          return jsonResp({ ok: false, error: '日本国内からのみ利用可能です' }, 403, env, origin);
        }
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        // レート制限（10分間に30回）
        const rateKey = new Request('https://explainlimit.local/' + ip, { method: 'GET' });
        const rateCache = caches.default;
        const prev = await rateCache.match(rateKey);
        let count = 0;
        if (prev) { try { count = parseInt(await prev.text()) || 0; } catch(e){} }
        if (count >= 30) {
          return jsonResp({ ok: false, error: '利用回数の上限に達しました。10分後にお試しください。' }, 429, env, origin);
        }
        ctx.waitUntil(rateCache.put(rateKey, new Response(String(count+1), { headers: { 'Cache-Control':'public, max-age=600' }})));

        const body = await request.json();
        const term = (body.term || '').toString().trim();
        const context = (body.context || '').toString().trim().substring(0, 200);
        if (term.length < 1 || term.length > 50) {
          return jsonResp({ ok: false, error: '単語は1〜50文字で指定してください' }, 400, env, origin);
        }

        // まずフォールバック辞書を確認（即座に返せる場合）
        const normTerm = normalizeTerm(term);
        for (const [key, entry] of Object.entries(TERM_DICTIONARY)) {
          if (normalizeTerm(key) === normTerm || normTerm.includes(normalizeTerm(key)) || normalizeTerm(key).includes(normTerm)) {
            return jsonResp({
              ok: true,
              term,
              summary: entry.summary,
              explain: entry.explain,
              example: entry.example,
              source: 'dictionary',
            }, 200, env, origin);
          }
        }

        const explainSystem = [
          'あなたは「行政・議会の言葉をやさしく解説する先生」です。',
          '市民・特に中学生や高校生が、行政用語や議会用語、政治用語を理解できるよう、',
          'かみ砕いた言葉で説明します。',
          '',
          '## 必ず守ること',
          '- 中学生でも分かる言葉で説明する（難しい熟語を使わない）',
          '- 身近な例え話を使う（「学校の〇〇に似ている」など）',
          '- 120文字以内の短い説明 + 補足説明 に分ける',
          '- 専門用語を使う場合は必ずその場で説明する',
          '- 「〜のことだよ」「〜といいます」のように親しみやすい口調',
          '- 政治的な立場は取らない（中立）',
          '- 分からない言葉は「正直に分かりません」と答える',
          '',
          '## 書式',
          '以下のJSON形式で返してください：',
          '{',
          '  "summary": "一言で言うと〇〇（50文字以内）",',
          '  "explain": "もう少し詳しい説明（200文字程度）",',
          '  "example": "身近な例え（100文字程度、なければ空文字）"',
          '}',
          '',
          'JSON以外は一切出力しないでください。',
        ].join('\n');

        const userMsg = context
          ? `次の言葉を、中学生にも分かるように解説してください。\n\n言葉：「${term}」\n\nこの言葉が使われている文脈（参考）：${context}`
          : `次の言葉を、中学生にも分かるように解説してください。\n\n言葉：「${term}」`;

        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 500,
            system: explainSystem,
            messages: [{ role: 'user', content: userMsg }],
          }),
        });

        if (!claudeResp.ok) {
          const errText = await claudeResp.text();
          // APIの利用上限・レート制限の場合、辞書から類似語を探す
          const isLimitError = /usage limit|rate_limit|credit/.test(errText);
          if (isLimitError) {
            // 部分一致を試みる
            for (const [key, entry] of Object.entries(TERM_DICTIONARY)) {
              if (normTerm.includes(normalizeTerm(key).substring(0, 3)) || normalizeTerm(key).includes(normTerm.substring(0, 3))) {
                return jsonResp({
                  ok: true,
                  term,
                  summary: entry.summary,
                  explain: entry.explain,
                  example: entry.example,
                  source: 'dictionary-fallback',
                  note: '※ AIが現在混雑中のため、辞書から近い用語の解説を表示しています。',
                }, 200, env, origin);
              }
            }
            return jsonResp({
              ok: false,
              error: 'AI解説機能が現在混雑しています。しばらくしてからお試しください。',
              errorCode: 'api_limit',
            }, 503, env, origin);
          }
          return jsonResp({ ok: false, error: 'AI呼び出しエラーが発生しました。時間をおいて再度お試しください。', errorCode: 'api_error' }, 502, env, origin);
        }
        const data = await claudeResp.json();
        const answerRaw = data.content?.[0]?.text || '';
        // JSONパース試行、失敗時はフォールバック
        let result = null;
        try {
          // コードブロック除去
          const cleaned = answerRaw.replace(/^```json\s*|```\s*$/g, '').trim();
          result = JSON.parse(cleaned);
        } catch (e) {
          result = { summary: answerRaw.substring(0, 100), explain: answerRaw, example: '' };
        }

        return jsonResp({
          ok: true,
          term: term,
          summary: result.summary || '',
          explain: result.explain || '',
          example: result.example || '',
        }, 200, env, origin);
      } catch (e) {
        return jsonResp({ ok: false, error: e.message }, 500, env, origin);
      }
    }

    // ====== POST /feedback : サイト改善要望受付 ======
    if (request.method === 'POST' && url.pathname === '/feedback') {
      try {
        const country = request.cf?.country || '';
        if (country && country !== 'JP') {
          return jsonResp({ ok: false, error: '日本国内からのみ利用可能です' }, 403, env, origin);
        }
        const body = await request.json();
        const feedback = (body.feedback || '').toString().trim();
        const category = (body.category || 'その他').toString().trim();
        if (feedback.length < 5) {
          return jsonResp({ ok: false, error: 'ご要望を5文字以上で入力してください' }, 400, env, origin);
        }
        if (feedback.length > 500) {
          return jsonResp({ ok: false, error: 'ご要望は500文字以内でお願いします' }, 400, env, origin);
        }
        // GASに転送（市民の声と同じ仕組み）
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const ua = request.headers.get('user-agent') || 'unknown';
        const payload = {
          secret: env.SHARED_SECRET,
          type: 'site_feedback',
          category: category,
          message: feedback,
          ip,
          userAgent: ua,
          timestamp: new Date().toISOString()
        };
        const gasResp = await fetch(env.GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return jsonResp({ ok: true, message: 'ご要望を受け付けました。ありがとうございます！' }, 200, env, origin);
      } catch (e) {
        return jsonResp({ ok: false, error: e.message }, 500, env, origin);
      }
    }

    // ====== POST /pageview : ページビューをカウント ======
    if (request.method === 'POST' && url.pathname === '/pageview') {
      try {
        const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
        const kv = env.PAGEVIEW_KV;
        if (!kv) {
          return jsonResp({ ok: false, error: 'KV not configured' }, 500, env, origin);
        }

        // 総PV
        const totalStr = await kv.get('pv_total') || '0';
        const newTotal = parseInt(totalStr) + 1;
        await kv.put('pv_total', String(newTotal));

        // 今日のPV
        const todayStr = await kv.get('pv_' + today) || '0';
        const newToday = parseInt(todayStr) + 1;
        await kv.put('pv_' + today, String(newToday), { expirationTtl: 90 * 86400 }); // 90日保持

        // ユニーク訪問者（日別、IPベース簡易版）
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const uvKey = 'uv_' + today;
        const uvSetStr = await kv.get(uvKey) || '[]';
        let uvSet;
        try { uvSet = JSON.parse(uvSetStr); } catch(e) { uvSet = []; }
        const ipHash = await hashIP(ip);
        let isNew = false;
        if (!uvSet.includes(ipHash)) {
          uvSet.push(ipHash);
          await kv.put(uvKey, JSON.stringify(uvSet), { expirationTtl: 90 * 86400 });
          isNew = true;
        }

        // 総ユニーク訪問者
        const totalUvStr = await kv.get('uv_total') || '0';
        const newTotalUv = isNew ? parseInt(totalUvStr) + 1 : parseInt(totalUvStr);
        if (isNew) await kv.put('uv_total', String(newTotalUv));

        return jsonResp({
          ok: true,
          total: newTotal,
          today: newToday,
          totalVisitors: newTotalUv,
          todayVisitors: uvSet.length,
        }, 200, env, origin);
      } catch (e) {
        return jsonResp({ ok: false, error: e.message }, 500, env, origin);
      }
    }

    // ====== GET /pageview : カウント取得のみ ======
    if (request.method === 'GET' && url.pathname === '/pageview') {
      try {
        const kv = env.PAGEVIEW_KV;
        if (!kv) {
          return jsonResp({ ok: false, error: 'KV not configured' }, 500, env, origin);
        }
        const today = new Date().toISOString().substring(0, 10);
        const total = parseInt(await kv.get('pv_total') || '0');
        const todayPv = parseInt(await kv.get('pv_' + today) || '0');
        const totalUv = parseInt(await kv.get('uv_total') || '0');
        const uvSetStr = await kv.get('uv_' + today) || '[]';
        let todayUv = 0;
        try { todayUv = JSON.parse(uvSetStr).length; } catch(e) {}
        return jsonResp({
          ok: true,
          total,
          today: todayPv,
          totalVisitors: totalUv,
          todayVisitors: todayUv,
        }, 200, env, origin);
      } catch (e) {
        return jsonResp({ ok: false, error: e.message }, 500, env, origin);
      }
    }

    return jsonResp({ ok: false, error: 'not found' }, 404, env, origin);
  },
};

// IPアドレスをハッシュ化（プライバシー保護）
async function hashIP(ip) {
  const data = new TextEncoder().encode(ip + '_ito_salt_2026');
  const hash = await crypto.subtle.digest('SHA-256', data);
  const arr = new Uint8Array(hash);
  return Array.from(arr.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(env, origin) {
  // 許可するオリジン（独自ドメインと旧GitHub Pages両方）
  const allowedList = [
    'https://all-ito-city.com',
    'https://www.all-ito-city.com',
    'https://keiotake.github.io',
  ];
  const allowed = allowedList.includes(origin) ? origin : allowedList[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResp(obj, status, env, origin) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, origin) },
  });
}

// 運営者へのメール通知（Google Apps Script経由でGmailから送信）
async function sendNotificationEmail(env, post) {
  if (!env.NOTIFY_GAS_URL || !env.NOTIFY_GAS_SECRET) {
    console.log('Notification env vars not set, skipping');
    return;
  }
  const resp = await fetch(env.NOTIFY_GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.NOTIFY_GAS_SECRET, post }),
    redirect: 'follow',
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Notification GAS ${resp.status}: ${errText.slice(0, 200)}`);
  }
}
