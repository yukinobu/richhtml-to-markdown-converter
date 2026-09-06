# Rich HTML to Markdown Converter

ブラウザ上のコンテンツをHTMLとして取得し、再利用しやすいMarkdownへ変換するローカルツールです。

最初の主要な対象としてChatGPTの会話を想定していますが、特定のWebサービスだけに依存せず、変換モードを追加することで他のWebサービスや一般的なHTMLへ拡張できる設計を目指します。

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

このツールでは、プレーンテキストから文書構造を推測してMarkdownへ変換することは行いません。

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

## HTMLの取得方法

HTMLは主に2種類の方法で取得できます。

### 通常のコピー

Webページ上で範囲を選択してコピーした場合、ブラウザのクリップボードに `text/html` が含まれることがあります。

本ツールの入力欄へ貼り付けると、貼り付けイベントからHTMLを取得します。

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

入力欄には確認用としてHTMLソースを表示します。

### Developer ToolsからDOMをコピー

より多くのHTML構造を取得したい場合は、ブラウザのDeveloper Toolsから対象DOM要素をコピーできます。

例えばChatGPTでは、Elementsパネルで対象要素を選択して `Copy element` を使用します。

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

長い会話では、必要に応じて会話の先頭までスクロールしてからDOMをコピーしてください。

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

初期版では少なくとも以下を想定します。

### Auto

入力HTMLを解析し、利用可能な変換モードを自動判定します。

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

### Generic HTML

サービス固有の構造を利用せず、一般的なHTML文書としてMarkdownへ変換します。

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
````

````

実際のメタデータや見出し形式は変換モードおよび設定によって変更される可能性があります。

## ChatGPT以外への拡張

本ツールはChatGPT専用コンバーターとして固定しない設計を採用します。

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

通常の変換処理では、貼り付けたHTMLを外部サーバーへ送信しません。

配布版では以下を原則とします。

* 外部JavaScriptを読み込まない
* 外部CSSを読み込まない
* Analyticsを使用しない
* 変換処理でネットワーク通信を行わない
* 入力HTMLを外部へ送信しない

入力HTMLには会話以外の情報が含まれる場合があります。

特に `body` 全体をコピーした場合、

* チャット履歴
* UI情報
* プロフィール関連情報
* 他のページ要素

などが含まれる可能性があります。

入力データは必要以上に保存・共有しないでください。

## 制限事項

本ツールは、コピー時点でHTMLに存在する情報だけを利用できます。

そのため以下は保証されません。

* DOMに存在しない過去メッセージ
* コピー元ページのCSSによる完全な外観
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
