# 新しいPCで開発を始める手順

このプロジェクトを別のPCで開発するためのガイド。

---

## 📋 前提：必要なソフトウェア

| 必須/任意 | ソフト | 確認方法 |
|---|---|---|
| 必須 | **Node.js 18+** | `node --version` |
| 必須 | **Git** | `git --version` |
| 推奨 | **VSCode** | エディタ |
| 推奨 | **Claude Code** | https://claude.com/claude-code |

---

## 🚀 Step 1: リポジトリのクローン

```bash
git clone https://github.com/keiotake/ito-council-analysis.git
cd ito-council-analysis
npm install
```

`npm install` は `iconv-lite` `node-fetch` などの依存パッケージを入れます。

---

## 📦 Step 2: 大容量データの移行（必要に応じて）

GitHub には軽量データのみを置いています。**議事録データ（80MB）等は別途コピー**してください。

### 旧PC（現在のPC）からコピーすべきファイル

| ファイル | サイズ | 重要度 | 用途 |
|---|---|---|---|
| `gijiroku_integrated.json` | 80MB | 🟢 **必須** | サイトのメインデータ |
| `gijiroku_data.json` | 157MB | 🟡 あれば便利 | 議事録の生データ（再生成可能）|
| `topics_cache.json` | 172KB | 🟢 **必須** | AI生成済みトピック744件 |
| `scrape_tmp/meeting_list.json` | 数百KB | 🟢 **必須** | 議事録一覧 |
| `scrape_tmp/minutes/*.html` | 140MB | 🟡 あれば便利 | 議事録HTML 785件 |
| `subtitles/*.json` | 31MB | 🟡 あれば便利 | YouTube字幕 |
| `analysis_data.json` | 数MB | 🟢 **必須** | 動画統計 |

### 移行方法

**方法A：USBメモリ／外部ストレージ**
1. 旧PCで上記ファイルをコピー
2. 新PCの `ito-council-analysis/` 配下に同じ構造で配置

**方法B：クラウド経由（Google Drive / Dropbox）**
1. ZIP化してアップロード
2. 新PCでダウンロードして展開

**方法C：必須ファイルだけGitHubのリリースに添付（おすすめ）**

```bash
# 旧PCで
gh release create data-snapshot-$(date +%Y%m%d) \
  gijiroku_integrated.json topics_cache.json analysis_data.json \
  scrape_tmp/meeting_list.json \
  --title "データスナップショット" \
  --notes "プライベートリリース：必須データのみ"

# 新PCで
gh release download data-snapshot-YYYYMMDD
```

⚠️ **重要：このリポジトリは公開なので、議事録データは個人ファイルとして扱い、リリースは Private 化してください。**

---

## 🔧 Step 3: 動作確認

```bash
node build_v3.js
```

→ `HTML生成完了: XXXXKkB` が出れば成功。

```bash
# ブラウザでローカルプレビュー
# Windowsの場合
start index.html
# Macの場合
open index.html
```

---

## ☁️ Step 4: Cloudflare Worker の管理権限

Workerのデプロイ・修正をするには：

```bash
cd voice-backend
npx wrangler login
# ブラウザでCloudflareアカウントにログイン
```

ログイン後、以下のコマンドが使えるようになります：

```bash
npx wrangler deploy                      # Worker更新
npx wrangler secret list                  # シークレット一覧
npx wrangler secret put ADMIN_SECRET     # シークレット設定
npx wrangler kv namespace list           # KV一覧
```

---

## 🔑 Step 5: 必要なシークレットの設定

Cloudflare Worker側に以下が必要です（**既に設定済みの場合はスキップ**）：

| 名前 | 用途 | 設定コマンド |
|---|---|---|
| `ADMIN_SECRET` | 管理画面の認証 | `npx wrangler secret put ADMIN_SECRET` |
| `ANTHROPIC_API_KEY` | 用語解説のAI機能 | `npx wrangler secret put ANTHROPIC_API_KEY` |

設定済みかを確認：

```bash
cd voice-backend && npx wrangler secret list
```

---

## 🚀 Step 6: GitHub への push 権限

```bash
git config user.name "あなたの名前"
git config user.email "your-email@example.com"
git push  # 認証を求められたら GitHub のトークンで認証
```

GitHub のトークンは [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) で発行できます（`repo` 権限のみ必要）。

---

## 📋 Step 7: 動作確認チェックリスト

新PCで以下が動けばOK：

- [ ] `node build_v3.js` → `index.html` が更新される
- [ ] `index.html` をブラウザで開く → サイトが表示される
- [ ] `node monthly_check.js` → 新規議事録チェックが走る
- [ ] `git push` → GitHub Pagesに反映される
- [ ] `https://keiotake.github.io/ito-council-analysis/` → ライブ版が見える

---

## 🛠️ よく使うコマンド一覧

```bash
# サイトをビルド＆デプロイ
node build_v3.js
git add index.html
git commit -m "更新内容"
git push

# 月次定期チェック（議事録更新）
node monthly_check.js

# 議事録新着の追加スクレイピング（手動）
node scrape_minutes.js --force-list   # リスト更新
# scrape_new_only.js の TARGET_FINOS を編集
node scrape_new_only.js               # 新規分のみ取得
node parse_minutes.js                 # パース
node integrate_gijiroku.js            # 統合
node build_v3.js                      # ビルド

# Worker（API）を更新
cd voice-backend
npx wrangler deploy

# 投稿モデレーション画面
# admin.html をブラウザで開く
# https://keiotake.github.io/ito-council-analysis/admin.html
```

---

## 🔑 重要なURL

- **本番サイト**: https://keiotake.github.io/ito-council-analysis/
- **管理画面**: https://keiotake.github.io/ito-council-analysis/admin.html
- **GitHub リポジトリ**: https://github.com/keiotake/ito-council-analysis
- **Worker API**: https://ito-voice.bmwrllsor-ko.workers.dev
- **Cloudflare ダッシュボード**: https://dash.cloudflare.com/
- **Anthropic Console**: https://console.anthropic.com/

---

## 🚨 トラブルシューティング

### `node build_v3.js` が `MODULE_NOT_FOUND`
→ `npm install` を実行

### `gijiroku_integrated.json not found`
→ 旧PCからデータをコピーする（Step 2参照）

### `wrangler` コマンドが見つからない
→ `npm install -g wrangler` で global install

### Worker側でエラー
→ `cd voice-backend && npx wrangler tail` でリアルタイムログを確認

### 投稿フォームが動かない
→ `voice-backend/wrangler.toml` のKVバインディング設定を確認

---

## 📞 困った時は

運営者：**ka@oh-life.co.jp**（大竹圭）

または Claude Code を起動して「セットアップを手伝って」と頼めば、エラー解析から自動修復まで対応してくれます。
