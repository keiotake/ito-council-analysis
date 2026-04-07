# 「市民の声」バックエンド デプロイ手順

サーバーレス構成（GAS + Cloudflare Workers）で、IPアドレス取得・スパム対策・モデレーション機能を備えた匿名投稿バックエンドを構築します。

---

## 全体構成

```
[市民]
  ↓ POST /submit
[Cloudflare Worker] (IP取得・国判定)
  ↓ シークレット付与して転送
[Google Apps Script]
  ↓ NGワード検査・保存
[Google Sheets] (大竹さんが承認/却下)
  ↓
[Cloudflare Worker GET /posts] (60秒キャッシュ)
  ↓
[みんなの伊東市サイト]
```

---

## Step 1: Google Sheets と GAS のセットアップ

### 1-1. スプレッドシート作成
1. https://drive.google.com/ で新規スプレッドシート作成
2. 名前を「みんなの伊東市_投稿管理」などに変更
3. URL の `/d/XXXXXX/` の **XXXXXX** 部分（スプレッドシートID）をメモ

### 1-2. GAS デプロイ
1. スプレッドシート上部メニュー → **拡張機能 → Apps Script**
2. デフォルトの `function myFunction()` を全削除
3. `voice-backend/Code.gs` の中身を全コピーして貼付け
4. 上部の `CONFIG` を編集：
   ```javascript
   const CONFIG = {
     SHEET_ID: 'メモしたスプレッドシートID',
     SHEET_NAME: '投稿',
     ADMIN_EMAIL: 'ka@oh-life.co.jp',
     SHARED_SECRET: 'ランダム文字列を生成して入れる', // 例: openssl rand -hex 16
     MAX_POSTS_PER_DAY_PER_IP: 5,
     SITE_URL: 'https://keiotake.github.io/ito-council-analysis/',
   };
   ```
5. **SHARED_SECRET** は推測不可能な長い文字列に。例えばブラウザのコンソールで:
   ```javascript
   crypto.getRandomValues(new Uint8Array(16)).reduce((s,b)=>s+b.toString(16).padStart(2,'0'),'')
   ```
   この文字列はあとで Cloudflare Worker でも使うのでメモ
6. 保存（💾アイコン）
7. 右上の **デプロイ → 新しいデプロイ** をクリック
8. 「種類を選択」（⚙️アイコン）→ **ウェブアプリ**
9. 設定：
   - 説明: `みんなの伊東市 投稿API v1`
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
10. **デプロイ** をクリック
11. アクセス権限を求められたら「承認」→ Googleアカウントを選択 → 「詳細 → 安全でないページに移動」→ 許可
12. 表示される **ウェブアプリのURL** をコピー（`https://script.google.com/macros/s/.../exec`）

### 1-3. 動作確認
- 上記URLにブラウザでアクセス → `{"posts":[],"total":0,...}` が返ればOK

---

## Step 2: Cloudflare Workers デプロイ

### 2-1. アカウント作成
- https://dash.cloudflare.com/sign-up で無料アカウント作成
- 既にお持ちなら不要

### 2-2. Worker 作成
1. ダッシュボード左メニュー → **Workers & Pages → Create application → Create Worker**
2. 名前を `ito-voice` に設定 → **Deploy**
3. デプロイ後 → **Edit code**
4. デフォルトコードを全削除
5. `voice-backend/worker.js` の中身を全コピーして貼付け
6. 右上 **Deploy** （「Save and deploy」）

### 2-3. 環境変数設定
1. Worker のページに戻る → **Settings → Variables**
2. **Environment Variables → Add variable** を3回押して以下を追加:

| Name | Value | Encrypt |
|---|---|---|
| `GAS_URL` | Step 1-2でコピーしたGAS Web App URL | ✅ |
| `SHARED_SECRET` | Step 1-2で生成したランダム文字列(GASと同じもの) | ✅ |
| `ALLOWED_ORIGIN` | `https://keiotake.github.io` | ❌ |

3. **Save and deploy**

### 2-4. Worker URL の取得
- Worker のページ上部に表示される URL をメモ
  - 例: `https://ito-voice.your-subdomain.workers.dev`

### 2-5. 動作確認
```bash
curl https://ito-voice.your-subdomain.workers.dev/posts
```
→ `{"posts":[],...}` が返ればOK

---

## Step 3: フロントエンド側の URL 書き換え

`build_v3.js` の以下の行を Worker URL に書き換える：

```javascript
const VOICE_API='https://ito-voice.your-subdomain.workers.dev'; // ← ここ
```

書き換え後にビルド＆プッシュ：
```bash
cd /c/Users/ka/ito-council-summary
node build_v3.js
git add -A && git commit -m "市民の声バックエンドURL設定"
git push
```

---

## Step 4: テスト投稿

1. https://keiotake.github.io/ito-council-analysis/ を開く
2. 「市民の声」タブ → 「＋ 新しい投稿」
3. テスト投稿を送信
4. ka@oh-life.co.jp に通知メールが届くことを確認
5. スプレッドシートを開いて投稿が記録されていることを確認
6. ステータス列を「未確認」→「承認」に手動変更
7. サイトの「市民の声」タブで「🔄 更新」ボタンを押すと表示される

---

## モデレーション運用（日常）

### スプレッドシートでの操作
1. ka@oh-life.co.jp に新規投稿通知メールが届く
2. メール内のリンクからスプレッドシートを開く
3. C列「ステータス」を編集：
   - **承認** → 公開される
   - **却下** → 非表示
   - **通報対象** → 警察相談用に保全

### NGフラグについて
L列に自動検出フラグが入る：
- `HARD:殺す` などの暴力ワード → 自動で「却下」
- `INSULT_MULTI` → 侮蔑語が複数 → 要確認
- `PII` → 個人情報パターン検出 → 要確認

### 警察への通報手順
通報対象として選別した投稿は：
1. 該当行をPDFまたは印刷で保存（IP・UA・ハッシュ含む）
2. 静岡県警サイバー犯罪対策課: https://www.police.pref.shizuoka.jp/cyber/
3. 伊東警察署: 0557-37-0110
4. 弁護士に相談の上、発信者情報開示請求の可否を検討

---

## トラブルシューティング

### 投稿時に「unauthorized」エラー
→ GASとCloudflare Workerの`SHARED_SECRET`が一致していない

### 投稿時に「日本国内からのみ投稿可能」
→ VPN等を経由してアクセスしている

### 「読み込み失敗」が表示される
→ `build_v3.js` の `VOICE_API` が正しいWorker URLか確認

### 通知メールが届かない
→ GAS実行時に Gmail送信権限を承認したか確認。再デプロイ時は新しい権限承認が必要

---

## セキュリティ設計まとめ

| 対策 | 実装 |
|---|---|
| 国外ブロック | Cloudflare Workerで `cf.country !== 'JP'` を拒否 |
| シークレット保護 | GAS-Worker間の通信に共有シークレット |
| レート制限 | 同一IPから1日5件まで |
| NGワード自動検出 | 暴力語は即「却下」、侮蔑語複数は手動確認 |
| 個人情報検出 | 電話番号・メールアドレスのパターン検出 |
| 承認制 | デフォルト「未確認」、手動承認のみ公開 |
| IP・UA記録 | 全投稿に対して保存（永続） |
| ハッシュ記録 | 改ざん検証用 |
| HTTPS強制 | Cloudflare/GitHub Pagesともに標準 |
| CORS制限 | 自サイトドメインのみ受付 |

---

最終更新: 2026-04-07
