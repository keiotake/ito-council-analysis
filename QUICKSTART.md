# 🚀 新PCで作業を開始するクイックガイド

詳細は `HANDOFF.md` を参照。これは最短ルート版。

---

## 1. 環境準備（5分）

```bash
# Node.js 18+ と Git があればOK
node --version
git --version
```

## 2. クローン＆セットアップ（3分）

```bash
git clone https://github.com/keiotake/ito-council-analysis.git
cd ito-council-analysis
npm install
```

## 3. 大容量データを移行（USB/外部ストレージ経由）

旧PC `C:\Users\ka\ito-council-summary\` から以下を新PCにコピー：

| ファイル/フォルダ | サイズ | 必要性 |
|---|---|---|
| `gijiroku_data.json` | 157MB | 🟡 あれば便利（再生成可） |
| `gijiroku_integrated.json` | 80MB | 🟢 **必須**（サイト表示の基幹データ） |
| `topics_cache.json` | 172KB | 🟢 **必須**（AI生成済みトピック744件） |
| `scrape_tmp/minutes/` | 140MB | 🟡 あれば便利（議事録HTML 1,412件） |
| `subtitles/` | 31MB | 🟡 あれば便利（YouTube字幕 680ファイル） |
| `yt-dlp.exe` | - | 🔵 動画字幕DL時のみ |

## 4. Wrangler ログイン（Worker更新する場合のみ）

```bash
cd voice-backend
npx wrangler login
# ブラウザでCloudflareアカウントにログイン
```

## 5. 動作確認

```bash
cd ..
node build_v3.js
# → "HTML生成完了: 5400KB" が出ればOK
```

ブラウザで `index.html` を開いて画面表示を確認。

---

## よく使うコマンド

```bash
# サイトをビルド＆デプロイ
node build_v3.js
git add index.html
git commit -m "更新内容"
git push

# Worker（API）を更新
cd voice-backend
npx wrangler deploy

# 議員のコメントを追加
# → member_comments.json を編集 → 上記ビルドフロー

# 分析タブの内容を更新
# → ito_analysis.json を編集 → 上記ビルドフロー
```

---

## 🔑 重要なURL

- **サイト**: https://keiotake.github.io/ito-council-analysis/
- **GitHub**: https://github.com/keiotake/ito-council-analysis
- **Worker**: https://ito-voice.bmwrllsor-ko.workers.dev
- **Cloudflare**: https://dash.cloudflare.com/
- **Anthropic Console**: https://console.anthropic.com/

---

## ⚠️ 即対応が必要かもしれないこと

1. **Anthropic API 月次上限到達**
   - 2026-05-01 00:00 UTC まで AI機能（用語解説・コンシェルジュ）が制限中
   - 内蔵辞書21語は動作するが、それ以外はエラー
   - 対処: console.anthropic.com で上限増額

2. **議事録新着の追加スクレイピング**
   - 6月・9月・12月・3月の定例会後に増分取得が必要
   - `node scrape_bodies.js --recent && node parse_minutes.js && node generate_topics.js && node integrate_gijiroku.js && node build_v3.js`

詳細は `HANDOFF.md` をご覧ください。
