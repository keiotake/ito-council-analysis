# Google Search Console / アクセス解析セットアップ手順

DNS伝播完了後、独自ドメインで運用するためのアクセス解析と検索エンジン対応の準備。

---

## 🔍 Google Search Console（無料・必須）

検索エンジンからの流入を可視化＋Googleにサイトの存在を伝える。

### Step 1: Search Console にアクセス

🔗 https://search.google.com/search-console/

→ あなたの Gmail（bmwrllsor.ko@gmail.com）でログイン

### Step 2: プロパティ追加

「プロパティを追加」→「**ドメイン**」を選択 → `all-ito-city.com` と入力

### Step 3: DNS TXTレコードで所有権確認

Google が表示する TXT レコードを、お名前.com の DNS設定で追加。

```
ホスト: @（空欄）
TYPE: TXT
TTL: 3600
VALUE: google-site-verification=XXXXXXXXXX
```

→ Search Console の「確認」ボタンをクリック

### Step 4: サイトマップ送信

サイトマップを作成して送信：

```xml
<!-- sitemap.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://all-ito-city.com/</loc>
    <lastmod>2026-XX-XX</lastmod>
    <priority>1.0</priority>
  </url>
</urlset>
```

Search Console 画面：
- 左メニュー「サイトマップ」
- 「新しいサイトマップを追加」 → `sitemap.xml` と入力 → 送信

---

## 📊 アクセス解析の選択肢

### 案A：Google Analytics（GA4）— 最も標準的

**メリット:**
- 無料
- 業界標準
- 豊富な分析機能
- Search Consoleと連携可能

**デメリット:**
- 個人情報保護の観点で議論あり
- GDPR的な配慮が必要（Cookie同意バナー検討）
- 議員サイトとしてGoogle社にデータを渡すことへの政治的議論余地

**設定:**
1. https://analytics.google.com/ にログイン
2. 「プロパティを作成」→ `all-ito-city.com`
3. 測定ID（G-XXXXXXXX）を取得
4. サイトに以下を追加：

```html
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXX', { 'anonymize_ip': true });
</script>
```

### 案B：Cloudflare Web Analytics — プライバシー重視

**メリット:**
- 無料
- **Cookieなし**（GDPR対応不要）
- 個人特定情報を一切収集しない
- 議員サイトとして安心感大

**デメリット:**
- 機能はGA4より少ない（基本的なPV/ユニーク訪問者のみ）
- Cloudflare アカウントが必要（既に持ってる）

**設定:**
1. https://dash.cloudflare.com/ にログイン
2. 左メニュー「**Web Analytics**」
3. 「**Add a site**」→ `all-ito-city.com`
4. 生成されたスクリプトをサイトに追加：

```html
<!-- Cloudflare Web Analytics -->
<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "XXXXX"}'></script>
```

### 案C：内蔵カウンター（既存）

現在、Cloudflare Worker の `/pageview` エンドポイントで簡易カウンターを既に運用中。
これで十分という判断もあり。

---

## 💡 おすすめ

**案B：Cloudflare Web Analytics** を強く推奨。

理由：
1. **プライバシーフレンドリー** — 議員サイトとしてふさわしい
2. **Cookie 同意バナー不要** — UXを損なわない
3. **既存Cloudflareアカウント活用** — 新たな登録不要
4. **無料・無制限** — コスト面の懸念なし
5. **「議員が運営している」サイトでGoogleにデータを渡さない**ことは公職選挙法的にもプラス

---

## 🛡️ プライバシーポリシーへの追記

アクセス解析を導入する場合、サイト内のプライバシー記述を更新：

```
本サイトはサイト改善のため、Cloudflare Web Analyticsを使用しています。
このサービスはCookieを使用せず、個人を特定可能な情報も収集しません。
詳細：https://www.cloudflare.com/privacy/
```

---

## 🔔 設定後のアクション

1. **Search Console** で「URL検査」 → `https://all-ito-city.com/` → 「インデックス登録をリクエスト」
2. **Bing Webmaster Tools**（無料）にも登録するとさらにSEO効果UP
3. **Google ビジネスプロフィール** は不要（議員個人のため）

---

## 📅 実施タイミング

DNS伝播完了後すぐ：
1. ✅ Search Console 登録（TXT レコード追加）
2. ✅ サイトマップ送信
3. ✅ Cloudflare Web Analytics 設定
4. ✅ プライバシーポリシー追記
5. ✅ Bing Webmaster Tools 登録

---

## 連絡先

質問があれば：ka@oh-life.co.jp
