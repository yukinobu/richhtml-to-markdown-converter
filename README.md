# Rich HTML to Markdown Converter

ブラウザ上のコンテンツをHTMLとして取得し、再利用しやすいMarkdownへ変換するローカルツールです。

最初の主要な対象としてChatGPTの会話を想定していますが、特定のWebサービスだけに依存せず、変換モードを追加することで他のWebサービスや一般的なHTMLへ拡張できる設計を目指します。

初期実装としてAuto、ChatGPT Conversation、Generic HTMLの変換と単一HTMLへのビルドを提供しています。仕様に基づく合成fixtureに加え、2026年9月9日付のChatGPT実DOMから匿名化・抜粋したfixtureとChromiumのブラウザテストで検証しています。デスクトップChrome・Edgeの実クリップボードによる確認は未実施です。サービス固有の抽出規則は暫定仕様として、実HTMLのfixtureによる検証を通じて見直します。詳細な規則は [README-dev.md](README-dev.md) に記載します。

## 起動方法

開発環境で以下を実行すると、配布用HTMLを生成できます（Node.js 20.19以降、22系は22.12以降）。

```bash
npm ci
npm run build
```

生成された `dist/rich-html-to-markdown.html` をブラウザで直接開いてください。このHTML単体の利用にはNode.jsやWebサーバーは必要ありません。入力方式「HTMLソース」を選ぶと、例えば `<h1>見出し</h1><p>本文</p>` を入力してConvertで変換できます。

## 特徴

* 単一のHTMLファイルとして動作
* インストール不要
* ブラウザ拡張不要
* Webサーバー不要
* 変換処理はローカルで完結
* HTMLの文書構造を利用してMarkdownへ変換
* ChatGPTなど特定サービス向けの変換モードを利用可能
* HTMLの種類に応じた変換モードの自動判定
* 必要に応じた変換モードの手動選択
* 将来的に新しいWebサービス向け変換モードを追加可能

## 基本的な考え方

見出し、リスト、コードブロック、リンク、強調などの情報を保持するため、入力はHTMLを前提とします。

```text
HTML
  |
  v
Extraction
  |
  v
Semantic Document
  |
  v
Markdown Renderer
  |
  v
Markdown
```

コピー元からHTMLを取得できない場合、その入力は本ツールの変換対象外です。

通常のプレーンテキストから見出しやリストを推測する機能は提供しません。ただし、利用者が「HTMLソース」入力を選んだ場合は、入力文字列全体をHTMLとして扱います。

## HTMLの取得方法

HTMLは主に2種類の方法で取得できます。

### 通常のコピー

Webページ上で範囲を選択してコピーした場合、ブラウザのクリップボードに `text/html` が含まれることがあります。

入力方式「リッチコピー」（初期値）を選んで入力欄へ貼り付けると、貼り付けイベントの `text/html` からHTMLを取得します。`text/plain` も含まれる場合は使用しません。HTMLが含まれない場合は入力を更新せず、「HTMLソース」入力への切り替えを案内します。

```text
Web page
   |
   | Copy
   v
Clipboard
   |
   | text/html
   v
Converter
```

入力欄には確認用としてHTMLソースをテキスト表示します。貼り付けは入力全体を置き換え、既存の入力への追記は行いません。

### Developer ToolsからDOMをコピー

より多くのHTML構造を取得したい場合は、ブラウザのDeveloper Toolsから対象DOM要素をコピーできます。

例えばChatGPTでは、Elementsパネルで対象要素を選択して `Copy element` を使用します。

ツール側では入力方式「HTMLソース」を選び、取得したHTML文字列を貼り付けます。この方式はクリップボードの `text/plain` を使用し、入力欄での手入力・編集もできます。文字列がHTMLらしいかどうかの自動推測は行いません。

```text
Developer Tools
      |
      | Copy element
      v
HTML source
      |
      | Paste
      v
Converter
```

この方法では、通常の範囲選択コピーよりも多くのDOM属性や構造を保持できることがあります。

ChatGPTでは例えば以下のような情報がHTML中に含まれる場合があります。

```html
<section
  data-testid="conversation-turn-5"
  data-turn="user">
```

また、各メッセージに次のような属性が含まれる場合があります。

```html
<div data-message-author-role="assistant">
```

これらを利用することで、単なる見た目ではなく、UserとAssistantの区別なども抽出できます。

## ChatGPTでの利用

ChatGPTでは、Developer Toolsから会話を含むDOMをコピーする方法を推奨します。

最も簡単な方法として、`body` 要素をコピーしてツールへ貼り付けることができます。

```text
ChatGPT
  |
Developer Tools
  |
<body>
  |
Copy element
  |
Paste into converter
  |
Convert
```

ツール側ではページ全体をそのままMarkdownへ変換するのではなく、ChatGPT用の変換モードによって会話部分を抽出します。

例えば以下のような情報を利用できます。

```text
conversation turn
user / assistant
message content
Markdown-rendered response
code block
table
list
link
```

### body全体をコピーする場合の注意

`body` には会話以外の大量のHTMLも含まれます。

例えば以下です。

* サイドバー
* チャット履歴
* ナビゲーション
* ボタン
* SVGアイコン
* スクリプト
* プロフィールUI
* その他のアプリケーションUI

これらはChatGPT用変換モードによって除外されます。

また、ブラウザ上のDOMに会話全体が存在しているとは限りません。

長い会話では、画面外の古いメッセージがDOMから削除されている場合があります。

その場合、`body` をコピーしても会話全体を取得できません。

ツールは可能な範囲で不足を検出して警告しますが、完全性を保証するものではありません。

長い会話では、必要なメッセージがコピー対象に含まれることを確認してください。先頭までスクロールしても、会話全体が同時にDOMに存在する保証はありません。

初期実装では、会話の完全性を保証できない旨を常に警告します。さらに、取得したターン番号に途中開始や欠番の兆候があれば追加で警告します。意図的に会話の一部をコピーした場合も警告対象です。警告があっても、取得できた内容の変換・コピーは可能です。

## 変換モード

入力HTMLの種類ごとに「変換モード」を使用します。

変換モードは、HTMLのどの部分を意味のある文書要素として抽出するかを定義します。

想定するモードの例:

```text
Auto
ChatGPT Conversation
Generic HTML
GitHub
Claude
Gemini
...
```

本バージョンでは以下を想定します。

### Auto

入力HTMLを解析し、利用可能な変換モードを自動判定します。

ChatGPTのターン属性、またはUser/Assistantを示す著者属性があればChatGPT Conversationを選び、それ以外はGeneric HTMLを選びます。選ばれたモードで抽出に失敗した場合はエラーを表示します。モードの変更は利用者が明示的に行います。

### ChatGPT Conversation

ChatGPTのDOMから、

```text
conversation
  |
  +-- user message
  |
  +-- assistant message
  |
  +-- user message
  |
  +-- assistant message
```

という構造を抽出します。

2026年9月の実DOMで確認したコードビューアでは、言語ラベルと操作UIをコード本文から分離し、言語名をコードフェンスへ付けます。ユーザー投稿の既知の本文要素では改行を保持しますが、ログなどを自動でコードブロックに変換することはありません。出典リンク内の装飾用アイコンは除き、リンク自体と通常の本文画像は保持します。

### Generic HTML

サービス固有の構造を利用せず、一般的なHTML文書としてMarkdownへ変換します。

`article`、`main`、`body` の順で最初に存在する種類を採用し、その種類の要素を文書順に変換します。例えば `article` が複数あればすべてを対象とし、それ以外の領域は対象にしません。入れ子の対象要素は重複変換しません。

## 操作と対応環境

1. 入力方式を選び、HTMLを貼り付けます。
2. 変換モードを選びます。初期値はAutoです。
3. Convertボタンを押し、Markdownと警告を確認します。
4. コピーボタンでMarkdownをコピーします。コピーに失敗した場合は出力欄を選択して手動でコピーできます。

貼り付けだけでは変換しません。入力の変更、受け付けた貼り付け、入力方式・変換モードの変更時には、前回の出力と診断表示をクリアします。入力方式を変更した場合は入力もクリアします。空入力や変換可能な本文がない入力はエラーとなり、Markdownは出力しません。

初期実装の対応対象はデスクトップ版ChromeとEdgeです。リリース時点の安定版で、配布HTMLを `file://` から直接開く操作を確認します。Firefox、Safari、モバイルブラウザは初期実装の動作保証対象に含めません。

## 変換処理

変換処理は大きく2段階に分かれます。

### 1. HTMLから意味構造を抽出

変換モードが入力HTMLから必要な部分を抽出します。

ChatGPTの場合は例えば、

```text
Raw ChatGPT DOM
       |
       v
Conversation extraction
       |
       v
User message
Assistant message
User message
Assistant message
```

のようになります。

### 2. 意味構造をMarkdownへ変換

抽出された内容を共通Markdown Rendererで変換します。

例えば、

```html
<strong>important</strong>
```

は、

```markdown
**important**
```

へ変換されます。

同様に、主に以下をMarkdownへ変換します。

* 見出し
* 段落
* 太字
* 強調
* 打ち消し線
* リンク
* 箇条書き
* 番号付きリスト
* 引用
* インラインコード
* コードブロック
* 表
* 画像参照

## 変換モードとMarkdownの責務

変換モードは、HTMLの意味を判断する役割を持ちます。

例えばChatGPT用モードは、

```text
この要素はUserのメッセージ
この要素はAssistantのメッセージ
この要素は本文
この要素はUIなので無視
```

と判断します。

一方、

```text
strong → **...**
h2 → ## ...
ul → Markdown list
pre/code → fenced code block
```

といったMarkdown表現は、共通Markdown Rendererが担当します。

この分離により、サービスごとに異なるMarkdown変換ロジックを持たせる必要がありません。

## 出力例

ChatGPT会話の場合、例えば次のようなMarkdownを生成します。

````markdown
---
source: chatgpt
type: conversation
---

## User

質問内容。

## Assistant

回答内容。

### Example

- item 1
- item 2

```js
const value = 123;
```
````

初期実装ではChatGPT会話に上記のfront matterを必ず付け、話者見出しを `## User`、`## Assistant`、判定できない場合は `## Unknown` とします。本文の見出しは元のレベルに2を加え、最大6とします。上の `### Example` は入力の `h1` に対応します。Generic HTMLではfront matterを付けず、見出しレベルも維持します。これらを変更する設定は初期実装では提供しません。

出力はCommonMarkの基本構文とGFMの表・打ち消し線を使用する範囲に限定します。結合セルなどの複雑な表は行ごとのテキストに変換して警告します。数式、添付ファイル、埋め込みコンテンツ専用の変換は初期実装の対象外です。表示テキストが残る要素は可能な範囲で保持します。

画像はHTTP(S)のURLを参照するMarkdownとして出力し、画像自体は取得・保存しません。リンクはHTTP(S)、`mailto:`、`tel:`、同一文書内の `#...` を保持します。相対URLやその他の形式のURLは解決せず、リンクなら本文、画像なら代替テキストを残して警告します。

## 今後の拡張

新しいWebサービスに対応する場合、そのサービス用のExtraction Profileを追加します。

例えばGitHub Issueなら、

```text
title
author
issue body
comments
````

を抽出するProfileを定義できます。

生成AIサービスなら、

```text
message
role
content
```

を抽出できます。

一般的なWeb記事なら、

```text
title
article body
```

を抽出できます。

このため、Markdown Renderer自体をサービスごとに変更する必要はありません。

## 保存形式

基本的な出力形式としてMarkdownを使用します。

Markdownはプレーンテキストであり、特定のアプリケーションに依存せず保存できます。

例えば以下で利用できます。

* VS Code
* Obsidian
* Git
* Markdown対応エディタ
* 静的サイトジェネレーター
* Pandoc
* LLMへの再入力

## プライバシー

本ツールは単一HTMLとしてローカルで動作します。

貼り付け、解析、変換、出力表示ではネットワーク通信を行わず、入力HTMLを外部サーバーへ送信しません。

配布版では以下を必須とします。

* 外部JavaScriptを読み込まない
* 外部CSSを読み込まない
* Analyticsを使用しない
* 変換処理でネットワーク通信を行わない
* 入力HTMLを外部へ送信しない

入力HTMLはテキストとして表示し、スクリプトの実行や画像・iframeなどの外部リソースの読み込みを行いません。入力と出力をブラウザの永続ストレージへ保存せず、ページを閉じるとツール内のデータは失われます。利用者がコピーしたクリップボードの内容はこの対象外です。

入力HTMLには会話以外の情報が含まれる場合があります。

特に `body` 全体をコピーした場合、

* チャット履歴
* UI情報
* プロフィール関連情報
* 他のページ要素

などが含まれる可能性があります。

## 制限事項

本ツールは、ペースト時点でHTMLに存在する情報だけを利用できます。

そのため以下は変換されません。

* DOMに存在しない過去メッセージ
* CSSによる外観
* JavaScript内部状態
* 未ロードのコンテンツ
* 外部リソースの永続保存
* サービス固有の非公開データ

また、ChatGPTなどのWebサービスのDOM構造は公開APIではありません。

サービス側のUI変更によってExtraction Profileの更新が必要になる場合があります。

## 配布形式

利用者向けの配布物は1ファイルです。

```text
rich-html-to-markdown.html
```

このファイルをブラウザで直接開いて使用します。

Node.jsやnpmなどの開発環境は利用時には必要ありません。

開発方法およびExtraction Profileの構成については `README-dev.md` を参照してください。
