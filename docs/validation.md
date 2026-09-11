# 初期実装の検証記録

検証日: 2026-09-09（初期実装の検証: 2026-09-08）

## 確認した環境と操作

| 項目 | 環境・結果 |
| --- | --- |
| OS | Linux 6.18.33.2-microsoft-standard-WSL2 x64 |
| Node.js | v24.20.0 |
| npm | 11.19.0 |
| Playwright Chromium | 153.0.8010.12 |
| `npm test` | 単体・Profile・fixtureの114テスト成功 |
| `npm run build` | `dist/rich-html-to-markdown.html` を生成 |
| `npm run test:e2e` | `file://` で配布HTMLを開く操作を含む12テスト成功 |

ブラウザテストではpasteイベントをDataTransferで生成し、コピーAPIは成功・不在・拒否を制御しています。OSの実クリップボードを使った確認ではありません。

入力の受理・拒否、両MIME形式がある場合の選択、入力全体の置換、編集・モード変更による旧結果の消去、Autoと手動選択、warning付き成功、コピー失敗時の全選択を確認しています。生成した画面も1360px幅で目視確認しました。

外部URLを持つ画像・iframe・stylesheet・script・動画等と、イベント属性を含む入力を貼り付け、変換、コピーするテストでは、配布HTML自身以外へのリクエストとCSP違反が0件、実行検知コードの実行が0件であることを確認しています。リクエストの遮断は行っていません。CSPのないページへ変換基盤のみを組み込んだ場合も、同じ入力から通信・実行が発生しないことを確認しています。

## Fixtureの出自

`test/fixtures/` のうち初期の18件はREADME-dev.mdの規則から手作成した合成HTMLです。各 `metadata.json` に `captureMethod: synthetic`、`browser: null`、`captured: null` を記載しています。

追加の3件（`code-viewer-2026-09`、`user-lines-2026-09`、`citation-2026-09`）は、利用者から提供された `tmp/chatgpt_20260909.html` の実DOMを抜粋・匿名化したものです。元HTMLはDeveloper ToolsのCopy elementによる取得と申告されています。取得日はファイル名に基づき、ブラウザ種別は未確認です。本文・コード・URLをテスト用データに置換し、メッセージID・会話IDなどを除去しています。取得済みの構造を保持した加工fixtureであり、元ページの全文ではありません。

期待Markdownは手作成し、末尾LFまで完全一致で比較します。診断はコードと元のitemIndexを規定順で比較します。

## 提供されたHTML全体の確認

ローカルの元HTMLでも変換を実行し、次を確認しました。元HTMLを必要とする検査はCIには含めず、回帰テストでは匿名化したfixtureを使用します。

さらに、配布HTMLをChromiumで `file://` から開き、元HTML全体をHTMLソースとして貼り付けて変換しました。出力はNode.jsによる変換結果と完全一致し、配布HTML自身以外へのネットワーク要求は0件でした。

* 8件のメッセージを元のDOM順・話者で抽出。
* 24個のコードブロックの本文が、入力の内側の `pre.cm-content` のtextContentと完全一致。4個の言語付きブロックは `cmd` / `powershell` として出力。
* 3件のユーザー投稿の改行数（50、0、76）を本文内の `br` として保持。
* 14件の出典リンク先を保持し、出典チップの空altのアイコンを除去。
* ターン番号10から開始し13〜15が存在しないため、`COMPLETENESS_UNVERIFIED`、`POSSIBLE_MISSING_START`、`MISSING_TURNS` を維持。

比較用の修正前出力は `tmp/chatgpt_20260909.before.md`、修正後は `tmp/chatgpt_20260909.md` に保存しています。これらと元HTMLはGit管理対象外です。

## リリース前に残る確認

- 別の実ChatGPT会話も取得し、取得方法・ブラウザ・日付を記録したfixtureを増やす。
- 今回のHTMLで未確認の会話先頭からの抽出やwriting blockなどを実DOMで確認する。
- デスクトップChrome・Edgeの安定版で配布HTMLを直接開き、通常コピーとDeveloper ToolsのCopy elementから変換し、実クリップボードの往復を確認する。OSとブラウザのバージョンを記録する。

GitHub Actionsのワークフローは追加済みですが、リモートでの実行はこの記録に含みません。
