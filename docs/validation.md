# 検証記録

最終更新日: 2026-09-12（初期実装の検証: 2026-09-08）

## 確認した環境と操作（2026年9月10日時点）

| 項目 | 環境・結果 |
| --- | --- |
| OS | Linux 6.18.33.2-microsoft-standard-WSL2 x64 |
| Node.js | v24.20.0 |
| npm | 11.19.0 |
| Playwright Chromium | 153.0.8010.12 |
| `npm test` | 単体・Profile・fixtureの142テスト成功 |
| `npm run build` | `dist/rich-html-to-markdown.html` を生成 |
| `npm run test:e2e` | `file://` で配布HTMLを開く操作を含む12テスト成功 |

ブラウザテストではpasteイベントをDataTransferで生成し、コピーAPIは成功・不在・拒否を制御しています。OSの実クリップボードを使った確認ではありません。

入力の受理・拒否、両MIME形式がある場合の選択、入力全体の置換、編集・モード変更による旧結果の消去、Autoと手動選択、warning付き成功、コピー失敗時の全選択を確認しています。生成した画面も1360px幅で目視確認しました。

外部URLを持つ画像・iframe・stylesheet・script・動画等と、イベント属性を含む入力を貼り付け、変換、コピーするテストでは、配布HTML自身以外へのリクエストとCSP違反が0件、実行検知コードの実行が0件であることを確認しています。リクエストの遮断は行っていません。CSPのないページへ変換基盤のみを組み込んだ場合も、同じ入力から通信・実行が発生しないことを確認しています。

## Fixtureの出自

`test/fixtures/` のうち初期の18件はREADME-dev.mdの規則から手作成した合成HTMLです。各 `metadata.json` に `captureMethod: synthetic`、`browser: null`、`captured: null` を記載しています。

追加の3件（`code-viewer-2026-09`、`user-lines-2026-09`、`citation-2026-09`）は、利用者から提供された `tmp/chatgpt_20260909.html` の実DOMを抜粋・匿名化したものです。元HTMLはDeveloper ToolsのCopy elementによる取得と申告されています。取得日はファイル名に基づき、ブラウザ種別は未確認です。本文・コード・URLをテスト用データに置換し、メッセージID・会話IDなどを除去しています。取得済みの構造を保持した加工fixtureであり、元ページの全文ではありません。

期待Markdownは手作成し、末尾LFまで完全一致で比較します。診断はコードと元のitemIndexを規定順で比較します。

## 2026年9月9日の提供HTML全体の確認

ローカルの元HTMLでも変換を実行し、次を確認しました。元HTMLを必要とする検査はCIには含めず、回帰テストでは匿名化したfixtureを使用します。

さらに、配布HTMLをChromiumで `file://` から開き、元HTML全体をHTMLソースとして貼り付けて変換しました。出力はNode.jsによる変換結果と完全一致し、配布HTML自身以外へのネットワーク要求は0件でした。

* 8件のメッセージを元のDOM順・話者で抽出。
* 24個のコードブロックの本文が、入力の内側の `pre.cm-content` のtextContentと完全一致。4個の言語付きブロックは `cmd` / `powershell` として出力。
* 3件のユーザー投稿の改行数（50、0、76）を本文内の `br` として保持。
* 14件の出典リンク先を保持し、出典チップの空altのアイコンを除去。
* ターン番号10から開始し13〜15が存在しないため、`COMPLETENESS_UNVERIFIED`、`POSSIBLE_MISSING_START`、`MISSING_TURNS` を維持。

比較用の修正前出力は `tmp/chatgpt_20260909.before.md`、修正後は `tmp/chatgpt_20260909.md` に保存しています。これらと元HTMLはGit管理対象外です。

## 2026年9月10日：読みやすいMarkdown出力

`npm run check` が成功し、単体・Profile・fixtureの142件と配布HTMLのブラウザテスト12件を確認しました。既存の出力fixtureは、改行の末尾スペース2個と不要なエスケープの削減に合わせて更新しています。

提供された `tmp/chatgpt_20260910_in.html` のメッセージ・検索ラベル・表の構造を抜粋し、本文とID類を匿名化した `readable-output-2026-09` を追加しました。取得日をファイル名に基づいて記録し、取得方法とブラウザは未確認としています。期待Markdownは手作成し、完全一致で検証しています。

* 検索ラベルを `〔ウェブ検索〕` に変換し、通常のメンションと未知のpillを保持。
* Assistant本文の対応する文字列 `**...**` を強調に変換。ユーザー投稿・unknown・Generic HTML・コード・既存の強調には適用しないことを検証。
* 通常の句読点、行頭記号、文字参照、HTML風の文字列、リンク隣接、要素境界、引用内の改行、表内の日本語・半角カナ・結合文字・絵文字を検証。

元HTML全体でもUser／Assistantの2件と5つの表を確認しました。期待ファイル `tmp/chatgpt_20260910_out.md` との差は、3つの表の列幅調整用スペースと区切り線の長さだけです。各セルの前後空白と区切り線長を正規化した比較では、本文・強調・見出し・引用・改行も含め一致しています。列幅は最大表示幅から決める共通規則に統一し、元の期待ファイルは変更していません。

さらに、配布HTMLをPlaywright Chromium 153.0.8010.12で `file://` から開き、元HTML全体を入力して変換しました。出力はNode.jsの変換結果と完全一致し、外部へのネットワーク要求とページエラーは0件でした。警告は `COMPLETENESS_UNVERIFIED` のみです。全文の変換結果はGit管理対象外の `tmp/chatgpt_20260910_actual.md` に保存しています。

## 2026年9月12日：TypeScript移行

本体・hook・テスト・ビルドスクリプト・設定ファイルをTypeScriptへ移行しました。`npm run check` に `tsc --noEmit` によるstrict型チェックを追加し、既存のGitHub Actionsでも同じチェックを実行する構成です。

| 確認 | 結果 |
| --- | --- |
| 移行前の `npm run check` | 単体・Profile・fixture 142件、ブラウザ12件が成功 |
| 移行後の `npm run check`（Node.js 24.21.0） | 型チェック、単体・Profile・fixture 143件、ブラウザ12件が成功 |
| `npm ci` | lockfileからの再インストールに成功 |
| 再インストール後の `npm run check`（Node.js 20.19.0） | 型チェック、単体・Profile・fixture 143件、ブラウザ12件が成功 |
| 単一HTML | 369,839 bytes。`file://` からの操作と外部通信・入力コード実行がないことをブラウザテストで確認 |

既存のfixtureと期待Markdownは変更していません。追加の1件では、YAMLの `normalizeContent` にrole解決用hookを指定すると `INVALID_PROFILE` になることを確認します。`test/type-contracts.ts` では、成功／失敗・文書種別ごとのフィールドアクセスとhookの誤登録が型エラーになることを検証します。

ビルドスクリプトも既存のesbuildでJavaScriptへ変換して実行し、最小対応版のNode.js 20.19.0で一括チェックが通ることを確認しました。追加依存は開発用のTypeScriptとNode.js型定義です。OSの実クリップボードによる操作やリモートCIの実行は今回の検証には含みません。

## 2026年9月12日：旧JSテストによるTS実装の再検証

移行直前のJSテストをローカルGitから復元し、importとhook登録の接続変更だけを適用して現在のTS実装へ実行しました。旧テスト142件・ブラウザ12件が成功し、fixture全85ファイルもバイト単位で一致しました。

型注釈を除いた差分のレビューでは、既存の不正Profileテストの入力の組み立て方が変わっていたため元へ戻しました。追加assertionなどの残る変更、検証結果と再実行手順は [TypeScript移行時のテスト内容の確認](typescript-test-audit.md) に記録しています。

## リリース前に残る確認

- 別の実ChatGPT会話も取得し、取得方法・ブラウザ・日付を記録したfixtureを増やす。
- 今回のHTMLで未確認の会話先頭からの抽出やwriting blockなどを実DOMで確認する。
- デスクトップChrome・Edgeの安定版で配布HTMLを直接開き、通常コピーとDeveloper ToolsのCopy elementから変換し、実クリップボードの往復を確認する。OSとブラウザのバージョンを記録する。

GitHub Actionsのワークフローは追加済みですが、リモートでの実行はこの記録に含みません。
