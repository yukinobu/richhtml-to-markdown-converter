# 初期実装の検証記録

検証日: 2026-09-08

## 確認した環境と操作

| 項目 | 環境・結果 |
| --- | --- |
| OS | Linux 6.18.33.2-microsoft-standard-WSL2 x64 |
| Node.js | v24.20.0 |
| npm | 11.19.0 |
| Playwright Chromium | 153.0.8010.12 |
| `npm test` | 単体・Profile・fixtureの99テスト成功 |
| `npm run build` | `dist/rich-html-to-markdown.html` を生成 |
| `npm run test:e2e` | `file://` で配布HTMLを開く操作を含む11テスト成功 |

ブラウザテストではpasteイベントをDataTransferで生成し、コピーAPIは成功・不在・拒否を制御しています。OSの実クリップボードを使った確認ではありません。

入力の受理・拒否、両MIME形式がある場合の選択、入力全体の置換、編集・モード変更による旧結果の消去、Autoと手動選択、warning付き成功、コピー失敗時の全選択を確認しています。生成した画面も1360px幅で目視確認しました。

外部URLを持つ画像・iframe・stylesheet・script・動画等と、イベント属性を含む入力を貼り付け、変換、コピーするテストでは、配布HTML自身以外へのリクエストとCSP違反が0件、実行検知コードの実行が0件であることを確認しています。リクエストの遮断は行っていません。CSPのないページへ変換基盤のみを組み込んだ場合も、同じ入力から通信・実行が発生しないことを確認しています。

## Fixtureの出自

`test/fixtures/` の18件はREADME-dev.mdの規則から手作成した合成HTMLです。各 `metadata.json` に `captureMethod: synthetic`、`browser: null`、`captured: null` を記載しています。実サービスから取得したHTMLとして扱わないでください。

期待Markdownは手作成し、末尾LFまで完全一致で比較します。診断はコードと元のitemIndexを規定順で比較します。

## リリース前に残る確認

- 実際のChatGPTから匿名化したHTMLを取得し、取得方法・ブラウザ・日付を記録したfixtureを追加する。
- 実DOMで会話全体、部分会話、コードブロック、writing blockの抽出結果を確認する。
- デスクトップChrome・Edgeの安定版で配布HTMLを直接開き、通常コピーとDeveloper ToolsのCopy elementから変換し、実クリップボードの往復を確認する。OSとブラウザのバージョンを記録する。

GitHub Actionsのワークフローは追加済みですが、リモートでの実行はこの記録に含みません。
