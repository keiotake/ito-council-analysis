# 「みんなの伊東市」プロジェクト引き継ぎ書

最終更新: 2026-04-24
公開URL: https://keiotake.github.io/ito-council-analysis/
GitHub: https://github.com/keiotake/ito-council-analysis

---

## 📋 1. プロジェクト概要

**「みんなの伊東市」** は、伊東市議会の議員活動を市民にわかりやすく届けるWebサイト。
- 全73議員（現職20名+元職53名）
- 議事録24,457件のQ&Aデータ
- AI生成の議題見出し744件
- 議員別Q&A・テーマ横断検索・行政用語AI解説など

### サイトの構成
- **静的サイト** (GitHub Pages): index.html 約5MB（build_v3.jsで生成）
- **API バックエンド** (Cloudflare Worker): ito-voice.bmwrllsor-ko.workers.dev
- **データベース** (Google Apps Script + スプレッドシート): 市民の声・改善要望の保存

---

## 📂 2. 新PC環境セットアップ手順

### 必要ツール
```bash
# Node.js 18以上
node --version  # v18+ 必要

# Git
git --version

# Cloudflare Wrangler（Worker デプロイ用）は npx で自動取得

# yt-dlp（議事録字幕取得用、必要な場合のみ）
# Windows: https://github.com/yt-dlp/yt-dlp/releases から yt-dlp.exe をDL
```

### 初期セットアップ
```bash
# 1. リポジトリをクローン
git clone https://github.com/keiotake/ito-council-analysis.git
cd ito-council-analysis

# 2. Node モジュールインストール
npm install
# - iconv-lite (議事録Shift_JISデコード用)
# - pdf-parse (PDF抽出用、未使用なら省略可)

# 3. Wrangler ログイン（Cloudflare Worker デプロイ用）
cd voice-backend
npx wrangler login
# → ブラウザで Cloudflare アカウントにログイン

# 4. ローカルでビルド確認
cd ..
node build_v3.js
# → "HTML生成完了: 5400KB" と出ればOK
```

---

## 🗂️ 3. ファイル構成

### Git管理されているもの（重要）
```
ito-council-analysis/
├── HANDOFF.md                        ← この引き継ぎ書
├── build_v3.js                       ← サイトビルドスクリプト（メイン、235KB）
├── index.html                        ← ビルド結果、GitHub Pagesに公開
├── parse_minutes.js                  ← 議事録HTMLパース（◆議員/◎当局を抽出）
├── integrate_gijiroku.js             ← 議事録 + YouTube 統合
├── scrape_minutes.js                 ← 議事録一覧取得スクレイパー
├── scrape_bodies.js                  ← 議事録本文取得スクレイパー
├── analyze_transcripts.js            ← YouTube字幕解析
├── extract_responses.js              ← YouTube字幕からの当局答弁抽出
├── generate_descriptions.js          ← 議員説明文生成
│
├── analysis_data.json                ← YouTube由来の議員Q&Aデータ
├── analysis_with_responses.json      ← 答弁付きデータ
├── profiles.json                     ← 議員プロフィール
├── member_topics.json                ← 議員のトピック傾向
├── member_descriptions.json          ← 議員の自動生成紹介文
├── member_photos.json                ← 議員の写真URL
├── member_comments.json              ← 議員本人コメント（手動入力欄）
├── ito_council_members.json          ← 公式委員会データ
├── question_summaries.json           ← YouTube字幕の質問要約
├── video_metadata.json               ← 動画メタデータ
├── new_videos.json                   ← 新着動画リスト
├── city_page_videos.json             ← 市HPの動画一覧
├── ito_analysis.json                 ← 「伊東市分析」タブの内容
│
├── data/
│   ├── sougoukeikaku_v5.json        ← 第五次総合計画データ
│   └── member_policy_map.json       ← 議員×施策マッピング
│
├── icons/                            ← PWA用アイコン
├── voice-backend/                    ← Cloudflare Worker関連
│   ├── worker.js                     ← APIワーカー本体
│   ├── wrangler.toml                 ← Workerデプロイ設定
│   ├── Code.gs                       ← Google Apps Script（市民投稿用）
│   ├── DEPLOY.md                     ← Workerデプロイ手順
│   └── ...（補助スクリプト）
│
└── .gitignore
```

### Git管理されていない大きなデータ（再生成必要 or 別経路で受け渡し）
```
gijiroku_data.json          ← 議事録解析データ 157MB
gijiroku_integrated.json    ← 議事録 + YouTube統合データ 80MB
topics_cache.json           ← AI生成トピックキャッシュ 172KB
scrape_tmp/                 ← 議事録スクレイピング作業領域 140MB
  └ minutes/                ← 1,412件の議事録HTML（H7〜R7）
subtitles/                  ← YouTube字幕 31MB（680ファイル）
yt-dlp.exe                  ← YouTube DL ツール
package-lock.json
```

**👉 大容量データの引き継ぎ方法**
1. **USB/外部ストレージで物理コピー**: `gijiroku_data.json`, `gijiroku_integrated.json`, `topics_cache.json`, `scrape_tmp/`, `subtitles/`
2. **再生成パス**: 下記「データ再生成手順」で全部再生成可能（時間かかる）

---

## 🔑 4. 認証情報・シークレット

### Cloudflare Worker のシークレット（既に設定済み）
```bash
# 確認: cd voice-backend && npx wrangler secret list
ADMIN_SECRET           # トピック生成バッチ用（generate_topics.jsで使用）
ANTHROPIC_API_KEY      # Claude API キー（用語解説・コンシェルジュ・トピック生成）
GAS_URL                # 市民投稿先のGAS URL
SHARED_SECRET          # GASとWorker間の認証
PAGEVIEW_KV            # KV Namespace（ページビューカウンター用）
```

### ⚠️ 引き継ぎ時の注意
- 新PCでも Cloudflare アカウント `keiotake@...` でログインすればシークレットは Worker 側に保持されており、再設定不要
- `ANTHROPIC_API_KEY` は **2026-05-01まで月次上限到達中**（Anthropic Consoleで上限増額または従量課金切替が必要）

### generate_topics.js のADMIN_SECRET
```javascript
// generate_topics.js 内にハードコード（bach処理用）
const ADMIN_SECRET = '21ce33e5e78b78704d99a863e7235c3c75e109f99e6bed10';
```
※ 公開リポジトリではないので一時的にこの形だが、**漏洩したら Worker側で再設定が必要**。

### GitHub Pages
- リポジトリ: github.com/keiotake/ito-council-analysis
- 設定: Settings > Pages > Source: main / root
- カスタムドメイン: なし

---

## 🔄 5. 通常の運用フロー

### A. 議員データ更新（議事録・新着動画）
```bash
# 1. 議事録一覧の更新（半年に1回程度）
node scrape_minutes.js

# 2. 議事録本文の取得（増分のみ）
node scrape_bodies.js --recent

# 3. 議事録解析
node parse_minutes.js  # → gijiroku_data.json

# 4. AI トピック生成（追加分のみ、キャッシュあり）
node generate_topics.js  # → topics_cache.json

# 5. データ統合
node integrate_gijiroku.js  # → gijiroku_integrated.json

# 6. ビルド
node build_v3.js  # → index.html

# 7. デプロイ
git add index.html member_comments.json ito_analysis.json (+変更ファイル)
git commit -m "..."
git push
# GitHub Pagesは自動デプロイ
```

### B. Worker（API）の更新
```bash
cd voice-backend
# worker.js を編集後
npx wrangler deploy
```

### C. 議員本人コメントの追加
```bash
# member_comments.json を直接編集
# 例:
# {
#   "大竹圭": {
#     "comment": "私は観光振興と...",
#     "updated": "2026-04-24"
#   }
# }
node build_v3.js
git add member_comments.json index.html
git commit && git push
```

### D. ito_analysis.json（伊東市分析タブ）の更新
```bash
# JSONを直接編集→ビルド→push
node build_v3.js
git add ito_analysis.json index.html
git commit && git push
```

---

## 🛠️ 6. データ再生成（クリーンスタート時）

### 議事録データを最初から作り直す手順

```bash
# 1. 議事録一覧（782件、約5分）
node scrape_minutes.js
# → scrape_tmp/meeting_list.json

# 2. 全本文取得（706件、約2-3時間。レート制限あり）
node scrape_bodies.js
# → scrape_tmp/minutes/<fino>.html

# 3. 解析（数分）
node parse_minutes.js
# → gijiroku_data.json (157MB)

# 4. AIトピック生成（744件、Anthropic API使用、約20-30分）
node generate_topics.js
# → topics_cache.json
# ⚠️ ANTHROPIC_API_KEYに利用枠が必要

# 5. 統合
node integrate_gijiroku.js
# → gijiroku_integrated.json (80MB)

# 6. ビルド
node build_v3.js
# → index.html
```

### YouTube字幕データを再取得する場合
```bash
node fetch_new_videos.js          # 新着動画リスト取得
node download_subtitles_ytdlp.js  # 字幕DL（yt-dlp.exe必要）
node analyze_transcripts.js       # 解析
node extract_responses.js          # 答弁抽出
```

---

## 🎨 7. アーキテクチャ要点

### サイトはどう作られているか
1. **build_v3.js**: 1つの巨大なテンプレート
   - 全議員の詳細パネルを HTML にレンダリング
   - JSON データを全て埋め込んだ `index.html` を出力
   - Service Worker（PWA）も埋め込み
   - すべて静的、JSビルドツール不使用（Node のみ）

2. **データソース優先順位（議員Q&A表示）**
   - 第1優先: `gijiroku_integrated.json`（議事録ベース、正確）
   - フォールバック: `analysis_data.json`（YouTube字幕ベース、不正確）

3. **タブ構成（最終版）**
   - メイン: 👥議員一覧 / 🔍テーマから探す / 💬市民の声 / 🗣️参加する
   - サブメニュー（⋯もっと見る）: 🎥動画・全文検索 / 📘総合計画 / 🔎伊東市徹底分析 / 📊議会全体の動き

4. **AI機能（Worker経由）**
   - `/explain` 用語解説（21語の内蔵辞書 + Claude Haiku）
   - `/chat` AIコンシェルジュ（サイト情報を根拠に回答）
   - `/topic` 議題見出し生成（管理者専用、ADMIN_SECRETで保護）
   - `/submit` 市民の声投稿（GASに転送）
   - `/feedback` サイト改善要望
   - `/pageview` PV カウンター

---

## ⚠️ 8. 既知の課題と注意事項

### A. Anthropic API 月次上限
- 2026-05-01 00:00 UTC まで `usage limit` エラー
- 用語解説は内蔵辞書で対応中（21語）
- コンシェルジュは現在使えない
- **対処**: console.anthropic.com で上限増額または従量課金切替

### B. 議事録の追加スクレイピング
- 元のサーバーは時々レート制限を返す（429・空応答）
- scrape_bodies.js は自動リトライ実装済み
- 失敗してもキャッシュで再開可能

### C. 一部の議員写真がない
- `member_photos.json` で `(なし)` の議員は苗字漢字フォールバック
- 浅田良弘・宮﨑雅薫が現在フォールバック

### D. ファイルサイズ
- index.html: 約5.4MB（許容範囲だが将来的に分割検討）
- gijiroku_integrated.json: 80MB（gitignore済み）
- gijiroku_data.json: 157MB（gitignore済み）

---

## 📚 9. 主要なソース URL

| サービス | URL | 備考 |
|---|---|---|
| サイト本体 | https://keiotake.github.io/ito-council-analysis/ | GitHub Pages |
| GitHub | https://github.com/keiotake/ito-council-analysis | リポジトリ |
| Worker | https://ito-voice.bmwrllsor-ko.workers.dev | Cloudflare API |
| Cloudflare ダッシュ | https://dash.cloudflare.com/ | Worker管理 |
| Anthropic Console | https://console.anthropic.com/ | API使用量管理 |
| 議事録検索元 | https://itoshigikai.gijiroku.com/voices/ | スクレイピング元 |
| 伊東市議会YouTube | https://www.youtube.com/channel/UC9FGDfo93b_dpu_7-AnN4wQ | 動画ソース |
| 伊東市公式 | https://www.city.ito.shizuoka.jp/ | リンク先 |

---

## 🆘 10. トラブルシューティング

### ビルドが失敗する
```bash
# 必要なJSONファイルがない場合
ls analysis_data.json profiles.json member_photos.json
# どれかが欠けていると build_v3.js が落ちる

# gijiroku_integrated.json は警告ですむ（フォールバックする）
```

### Worker デプロイが失敗する
```bash
# 認証切れ
cd voice-backend
npx wrangler logout
npx wrangler login
```

### git push が拒否される
```bash
# 大ファイルが混入したら
git rm --cached gijiroku_data.json gijiroku_integrated.json scrape_tmp/
git commit -m "Remove large files"
```

### サイトに変更が反映されない
- GitHub Pages のキャッシュ。1〜3分待つ
- ブラウザのハードリロード（Ctrl+Shift+R）
- Service Worker のキャッシュ。設定の「サイトデータを削除」

---

## 📝 11. 直近の主要な変更履歴

```
e51a294  AI用語解説にフォールバック辞書を追加（API利用上限対応）
1a791c7  サイト全体の見直し：ナビ整理・切れリンク修復・未使用コード削除
9f15070  Q&Aカード閉じた状態でも当局答弁の要点を表示
d5225e3  市民フレンドリー機能を一気に6つ実装（テーマ横断・参加ガイド・PWA・購読等）
31d9f13  予算・決算特別委員会の委員会報告を除外＋顔写真を統一的に表示
3dea68a  全議員のトピック見出しを品質チェック完了（低品質0件）
bd31be5  質問トピックをAI生成で高品質化（全議員73名・743件）
64dcd57  行政用語の超分かりやすい解説機能を追加
9b06f2d  質問を「〇〇について」のトピック表示に＋クリックで全文展開
bd48750  議事録のQ&A統合：再質問を1セッションにまとめて表示
```

---

## ✅ 12. 引き継ぎチェックリスト

新PC側で確認すること：

- [ ] `git clone` 完了
- [ ] `npm install` 完了（iconv-lite等）
- [ ] `wrangler login` 完了
- [ ] `node build_v3.js` でローカルビルド成功
- [ ] 大容量データ（gijiroku_*.json, topics_cache.json）をUSB等で受領
- [ ] `node integrate_gijiroku.js && node build_v3.js` で正常動作確認
- [ ] 試しに index.html をブラウザで開いて動作確認
- [ ] テストコミット＋push（小さな変更）でデプロイフローを確認
- [ ] Anthropic Console でAPI使用量を確認

---

ご不明点や追加情報が必要な場合は本ファイルを更新してください。
