# CLAUDE.md — Claude Code 向けプロジェクト指針

このファイルは、複数PCで Claude Code を使う際の共通指針です。詳細な背景・運用は `HANDOFF.md`、`OPERATIONS_RULES.md`、`SETUP_NEW_PC.md` を参照してください。

---

## プロジェクト概要

「**みんなの伊東市**」: 伊東市議会の議論をAIで整理した非公式情報サイト。

- 公開URL: https://keiotake.github.io/ito-council-analysis/
- 構成: GitHub Pages(静的) + Cloudflare Worker(API) + GAS(投稿保存)
- 静的サイトは `node build_v3.js` で `index.html` を生成して `git push` するだけでデプロイされる
- ビルドツール不使用(素の Node + テンプレート文字列)

## 開発フロー(必ず守る)

```bash
git pull                  # 作業前に必ず
# 編集 (※ index.html を直接編集してはいけない — 下記参照)
node build_v3.js          # index.html を再生成
npm run audit             # コンテンツ系を変更したら必ず実行
git add <変更ファイル> index.html
git commit -m "..."
git push                  # GitHub Pages が自動デプロイ (反映1〜3分)
```

## 編集してよいもの / してはいけないもの

| 種別 | ファイル | 編集 |
|---|---|---|
| データ(手動入力) | `member_comments.json`, `ito_analysis.json` | ✅ 直接編集OK |
| データ(自動生成) | `profiles.json`, `member_topics.json`, `analysis_data.json`, `question_summaries.json` 等 | ⚠️ 編集する前に生成元スクリプトを確認 |
| テンプレート/ロジック | `build_v3.js`, `parse_minutes.js`, `integrate_gijiroku.js` 等 | ✅ 編集OK |
| **ビルド成果物** | `index.html` | ❌ **直接編集しない**。必ずビルドで再生成 |
| Worker API | `voice-backend/worker.js` | ✅ 編集後 `cd voice-backend && npx wrangler deploy` |

## 絶対にコミットしないファイル(`.gitignore` 済)

これらは PC 間で git 経由では同期されません(別経路で受け渡し):

- `gijiroku_integrated.json` (80MB) — 議事録統合データ(サイトのメイン)
- `gijiroku_data.json` (157MB) — 議事録の生データ
- `topics_cache.json` (172KB) — AI生成トピックキャッシュ
- `scrape_tmp/` (140MB) — 議事録HTMLスクレイピング作業領域
- `subtitles/` (31MB) — YouTube字幕
- `node_modules/`, `yt-dlp.exe`, `logs/`, `voice-backend/.wrangler/`

`git add -A` で誤って混入させないよう注意。万一入った場合は `git rm --cached <path>` で外す。

## 🛡️ コンテンツの安全性ルール(最重要)

このサイトは**現役の市議会議員の発言を扱う公開サイト**です。音声認識ミスで「促進→即死」「察知→殺害」のような誤変換が出ると議員個人に実害が及ぶため、以下のルールを守ること:

1. **議事録・YouTube字幕由来のテキストデータを変更したら必ず `npm run audit` を実行**
2. `CRITICAL` (殺害/即死/虐殺/処刑/抹殺/暗殺/撲殺/射殺など) が検出されたら**push禁止**
   - 音声認識ミスかどうか YouTube 元動画で確認 → 修正 → 再ビルド → 再audit
   - 歴史的事件の引用など正当なものは `audit_allowlist.json` に追記
3. `WARN` (無能/失格/クズ/バカ/詐欺師など) も同様に目視確認
4. 詳細は `OPERATIONS_RULES.md` を参照

## データファイルが手元にない場合

新PCで `gijiroku_integrated.json` 等が無いと:
- `node build_v3.js` は警告を出すが動作する(議事録機能が抜けた軽量版が生成される)
- **この状態の `index.html` をコミットしてはいけない**(本番サイトがデグレする)
- データを揃えるか、index.html を `git restore index.html` で戻すこと

## Cloudflare Worker

- ディレクトリ: `voice-backend/`
- 設定済シークレット(再設定不要): `ADMIN_SECRET`, `ANTHROPIC_API_KEY`, `GAS_URL`, `SHARED_SECRET`
- デプロイ: `cd voice-backend && npx wrangler deploy`
- ログ監視: `npx wrangler tail`
- 新PCでは初回のみ `npx wrangler login` が必要

## Claude Code への作業依頼ガイド

- **push は明示的に依頼された時だけ実行**(自動pushしない)
- **大量データ・本番影響のある操作前は必ず確認を取る**
- 議員個人に関するデータ(コメント・写真URL・プロフィール)を変更する時は、その出典を必ず確認
- 既存の `HANDOFF.md` / `OPERATIONS_RULES.md` / `SETUP_NEW_PC.md` / `QUICKSTART.md` の方針と矛盾しない
- スクレイピング系スクリプト(`scrape_*.js`)を勝手に実行しない(レート制限・サーバ負荷)

## よく使うコマンド

```bash
npm run build          # = node build_v3.js
npm run audit          # コンテンツ監査(push前必須)
npm run audit:strict   # CRITICAL検出で exit 1 (CI用)
npm run monthly        # 月次チェック(議事録新着取得→audit→ビルド→デプロイ)
npm run deploy:worker  # = cd voice-backend && npx wrangler deploy
```

## ローカル確認

```powershell
# Windows
start index.html
```

## トラブル時の最初の一手

- ビルド失敗 → `npm install` を先に
- `gijiroku_integrated.json not found` → 警告だけならOK、機能フル確認したいなら旧PCからコピー
- Worker エラー → `cd voice-backend && npx wrangler tail` でログ確認
- git push 拒否 → 大ファイル混入を疑う(`git status` でサイズ確認)
