# Development Guide

この文書では Rich HTML to Markdown Converter のアーキテクチャ、Extraction Profile、テスト方針、ディレクトリ構成、ビルド方法について説明します。

利用者向けの仕様については `README.md` を参照してください。

## 開発方針

利用者には単一HTMLを配布します。

一方、リポジトリ内部ではソースコードをモジュール化し、自動テスト可能な構成にします。

単一HTMLはソースコード上の制約ではなく、ビルド成果物に対する制約として扱います。

```text
Repository source
       |
       | build
       v
Single HTML
       |
       v
User
```

## アーキテクチャ

変換処理は以下の段階へ分離します。

```text
Raw HTML
   |
   v
Source Detection
   |
   v
Extraction Profile
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

ブラウザUI、サービス固有のDOM解析、Markdown生成を分離することが基本方針です。

## 入力

coreが扱う入力はHTML文字列です。

```text
HTML source
```

plain textからMarkdown構造を推測する機能は提供しません。

ブラウザ層では主に2種類の入力方法を扱います。

```text
Clipboard text/html
```

および、

```text
Raw HTML source
```

です。

Raw HTML sourceは、Developer Toolsの `Copy element` 等によって取得したHTML文字列を想定します。

内部では両者を最終的に、

```text
html: string
```

として統一します。

## 全体構成

概念上の依存関係は以下です。

```text
browser
   |
   v
core
   |
   +--> profile engine
   |
   +--> semantic document
   |
   +--> markdown renderer
```

サービス固有処理はProfileまたはProfileから呼び出されるhookとして実装します。

Markdown RendererはChatGPT、GitHubなどのサービス固有知識を持ちません。

## Semantic Document

Extraction ProfileからMarkdownへ直接変換しません。

一度、サービスに依存しない中間表現へ変換します。

例えばChatGPT会話は概念的には以下です。

```text
Document
  type: conversation
  metadata:
    source: chatgpt

  items:
    - type: message
      role: user
      content: HTML fragment

    - type: message
      role: assistant
      content: HTML fragment
```

一般的なWebページなら、

```text
Document
  type: document
  content: HTML fragment
```

程度から開始します。

初期実装では完全なMarkdown ASTを作る必要はありません。

構造的な単位のみSemantic Documentとして正規化し、本文は必要に応じてHTML fragmentとして保持できます。

## Extraction Profile

サービス固有のHTML抽出規則はExtraction Profileとして定義します。

Profileは、

```text
HTMLのどこを見るか
どの要素を抽出するか
どの属性が意味を持つか
どの要素を無視するか
```

を宣言的に定義します。

ProfileはDSLそのものではなく、まずはJSONまたはYAMLベースの宣言的設定として実装します。

独自の制御構文を持つプログラミング言語にはしません。

## Profileの概念例

ChatGPT用Profileは概念的には以下のようになります。

```yaml
id: chatgpt-conversation
name: ChatGPT Conversation
documentType: conversation

detect:
  all:
    - '[data-testid^="conversation-turn-"]'
    - '[data-message-author-role]'

items:
  selector: '[data-testid^="conversation-turn-"]'

  type: message

  role:
    attribute: data-turn
    map:
      user: user
      assistant: assistant

  content:
    selectors:
      user:
        - '[data-message-author-role="user"]'
      assistant:
        - '[data-message-author-role="assistant"] .markdown'

  exclude:
    - button
    - '[role="group"]'
```

これは仕様イメージであり、Profile schemaの正確な構文は実装時に定義します。

## Profileが担当する機能

初期段階では少なくとも以下の概念を表現できるようにします。

| Function          | Purpose              |
| ----------------- | -------------------- |
| detect            | Profileを適用できるHTMLか判定 |
| selector          | CSS selectorによる要素選択  |
| fallback selector | 第一候補が存在しない場合の代替      |
| repeat            | 複数要素を順番に抽出           |
| attribute         | HTML属性の取得            |
| text              | textContentの取得       |
| html              | innerHTML等の取得        |
| constant          | 固定値の設定               |
| map               | 属性値等の意味変換            |
| exclude           | 不要DOMの除外             |

必要になるまでは条件式、ループ、変数、独自式言語などを追加しません。

## Custom hooks

すべてのDOM構造を宣言的Profileだけで表現しようとはしません。

サービス固有の特殊処理が必要な場合は、JavaScript hookへ処理を委譲できます。

```text
Profile
   |
   v
Generic extractor
   |
   v
Optional hook
   |
   v
Semantic Document
```

例えば、

```yaml
hooks:
  normalizeContent: chatgptNormalizeContent
```

のようにProfileからhookを指定できる構成を想定します。

Profile schemaをJavaScriptの代替プログラミング言語へ発展させないことを優先します。

## Markdown Renderer

Markdown RendererはSemantic Documentおよび正規化されたHTMLをMarkdownへ変換します。

例えば、

```html
<strong>text</strong>
```

を、

```markdown
**text**
```

へ変換します。

主な対象は以下です。

* headings
* paragraphs
* strong
* emphasis
* strike-through
* links
* unordered lists
* ordered lists
* nested lists
* blockquotes
* inline code
* code blocks
* tables
* images

サービス固有のHTML構造をMarkdown Rendererへ直接追加することは避けます。

必要な場合はProfile側でSemantic HTMLへ正規化します。

## Source detection

入力HTMLに適用するProfileは自動判定できます。

例えばChatGPT用Profileは、

```text
[data-testid^="conversation-turn-"]
[data-message-author-role]
```

などの存在を検出条件として利用できます。

UIでは、

```text
Mode: Auto
Detected: ChatGPT Conversation
```

のように表示します。

自動判定に失敗した場合に備え、ユーザーがProfileを手動選択できるようにします。

```text
Auto
ChatGPT Conversation
Generic HTML
...
```

初期段階では複雑なスコアリングアルゴリズムは必要ありません。

## Generic HTML Profile

サービス固有Profileに該当しないHTML用としてGeneric HTML Profileを提供します。

概念的には、

```yaml
id: generic-html
name: Generic HTML

content:
  selectors:
    - article
    - main
    - body

exclude:
  - script
  - style
  - nav
```

のような構成を想定します。

Generic HTML Profileは会話のUser/Assistantなどを推測しません。

HTMLに存在する一般的な文書構造だけをMarkdownへ変換します。

## ChatGPT Profile

ChatGPT Profileでは、ページ全体のHTMLから会話部分を抽出します。

代表的に以下のような属性を利用できます。

```text
data-testid="conversation-turn-*"
data-turn="user"
data-turn="assistant"
data-message-author-role
data-message-id
```

ただし、これらはChatGPTの公開APIではありません。

変更される可能性があるため、Profileおよびfixture testによって対応します。

### DOM完全性

`body` をコピーした場合でも、会話全体がHTMLに含まれるとは限りません。

長い会話では過去ターンがブラウザDOMから削除されている可能性があります。

ChatGPT Profileでは、可能であれば以下を検査します。

```text
detected turn count
first detected turn
last detected turn
missing sequence
```

完全性を確実に判定できない場合はエラーではなくwarningとして扱います。

## ディレクトリ構成

想定するリポジトリ構成は以下です。

```text
.
├── README.md
├── README-dev.md
├── package.json
├── package-lock.json
│
├── src/
│   ├── index.template.html
│   ├── style.css
│   │
│   ├── core/
│   │   ├── convert.js
│   │   ├── detect-source.js
│   │   ├── extract.js
│   │   ├── document-model.js
│   │   ├── normalize.js
│   │   └── render-markdown.js
│   │
│   ├── profiles/
│   │   ├── chatgpt.yaml
│   │   └── generic-html.yaml
│   │
│   ├── hooks/
│   │   └── chatgpt.js
│   │
│   └── browser/
│       ├── paste.js
│       ├── ui.js
│       └── app.js
│
├── test/
│   ├── unit/
│   │   ├── profile-engine.test.js
│   │   ├── source-detection.test.js
│   │   └── markdown-renderer.test.js
│   │
│   ├── fixtures/
│   │   ├── chatgpt/
│   │   │   ├── body-basic/
│   │   │   │   ├── input.html
│   │   │   │   ├── metadata.json
│   │   │   │   └── expected.md
│   │   │   │
│   │   │   ├── body-partial/
│   │   │   │   ├── input.html
│   │   │   │   ├── metadata.json
│   │   │   │   └── expected.md
│   │   │   │
│   │   │   ├── code-block/
│   │   │   └── writing-block/
│   │   │
│   │   └── generic-html/
│   │       └── article-basic/
│   │           ├── input.html
│   │           ├── metadata.json
│   │           └── expected.md
│   │
│   └── browser/
│       └── app.spec.js
│
├── scripts/
│   └── build.mjs
│
└── dist/
    └── rich-html-to-markdown.html
```

ProfileをJSONとして実装する場合は `.yaml` を `.json` に置き換えます。

## 各ディレクトリの責務

### `src/core/`

サービスに依存しない変換基盤を配置します。

主な責務:

* HTML parsing
* Profile detection
* Profile execution
* Semantic Document生成
* HTML normalization
* Markdown rendering

### `src/profiles/`

サービス固有のExtraction Profileを配置します。

Profileは可能な限り宣言的に記述します。

### `src/hooks/`

宣言的Profileだけでは処理できないサービス固有処理を配置します。

Profile schemaに複雑なプログラミング機能を追加する前にhookの利用を検討します。

### `src/browser/`

ブラウザUIとブラウザ固有APIを扱います。

主な責務:

* paste event
* `text/html` の取得
* HTML sourceの貼り付け
* Profile選択UI
* Auto detection結果の表示
* Convertボタン
* warning表示
* Markdown出力
* Markdownコピー

変換規則そのものはここへ実装しません。

## Fixture

実際のWebサービスから取得したHTMLをfixtureとして保存します。

基本構成:

```text
fixture-name/
├── input.html
├── metadata.json
└── expected.md
```

`input.html` は可能な限り実際に取得したHTMLを保存します。

`metadata.json` には取得元を記録します。

例:

```json
{
  "source": "chatgpt",
  "captureMethod": "devtools-copy-element",
  "element": "body",
  "browser": "chrome",
  "captured": "2026-09-06",
  "description": "ChatGPT conversation DOM"
}
```

fixtureに個人情報、認証情報、機密情報を含めてはいけません。

実データを利用する場合はリポジトリへ追加する前に匿名化します。

## Fixtureの更新方針

WebサービスのDOM変更が発生した場合、古いfixtureを上書きすることを基本としません。

例えば、

```text
chatgpt/body-2026-09/
chatgpt/body-2027-01/
```

のように新しいfixtureを追加します。

これにより、

```text
現在のDOM
過去のDOM
```

の両方を継続的にテストできます。

Profileを更新した結果、過去形式への対応が壊れていないことも確認できます。

## テスト方針

テストは主に4層に分けます。

### Unit tests

小さな変換規則やProfile engineを検証します。

主な対象:

```text
profile detection
CSS selector extraction
attribute mapping
fallback selector
exclude
Semantic Document generation
HTML normalization
Markdown rendering
```

### Fixture / Golden tests

実際のHTMLを変換し、期待するMarkdownと完全一致することを確認します。

```text
input.html
    |
    v
Profile
    |
    v
Semantic Document
    |
    v
Markdown Renderer
    |
    v
actual.md
    |
    v
compare
    |
    v
expected.md
```

本プロジェクトではfixture testを主要なregression testとして扱います。

### Profile detection tests

同じ入力に複数Profileが誤って適用されないことを確認します。

例えば、

```text
ChatGPT HTML
→ ChatGPT profile

Generic article
→ Generic HTML profile
```

を検証します。

### Browser integration tests

最終的な単一HTMLを実ブラウザで開いて確認します。

主な対象:

* HTMLが直接開ける
* HTMLを貼り付けられる
* Clipboard `text/html` を取得できる
* Profileが自動判定される
* Profileを手動変更できる
* Convertが動作する
* warningが表示される
* Markdownをコピーできる
* 外部リソースなしで動作する

OSの実クリップボードはCI環境依存性が高いため、主要な変換テストには使用しません。

## DOM completeness test

ChatGPTなどDOM virtualisationが存在するサービスについては、不完全なDOMもfixtureとして保持します。

例えば、

```text
chatgpt/body-partial/
```

では会話途中からしか存在しないHTMLを入力し、適切なwarningが生成されることを確認します。

完全性の検査はProfile固有処理とし、Markdown Rendererには持ち込みません。

## 想定開発環境

基本構成:

* Node.js 20以降
* npm
* esbuild
* Vitest
* Playwright

役割:

| Tool       | Purpose                   |
| ---------- | ------------------------- |
| Node.js    | 開発・ビルド環境                  |
| npm        | パッケージ管理                   |
| esbuild    | JavaScript bundling       |
| Vitest     | Unit / fixture tests      |
| Playwright | Browser integration tests |

Extraction ProfileにYAMLを使用する場合は、ビルド時にJavaScriptまたはJSONとしてbundleへ埋め込みます。

実行時に外部Profileファイルを必要としないようにします。

## セットアップ

```bash
npm ci
```

Playwrightのブラウザが必要な場合:

```bash
npx playwright install
```

## Unit / fixture tests

```bash
npm test
```

Unit test、Profile test、fixture testを実行します。

## ビルド

```bash
npm run build
```

ビルド成功後、

```text
dist/rich-html-to-markdown.html
```

を生成します。

## Browser tests

```bash
npm run test:e2e
```

生成済み単一HTMLをPlaywrightで検証します。

## 一括チェック

```bash
npm run check
```

概念的には以下を実行します。

```text
Unit tests
    |
    v
Profile tests
    |
    v
Fixture tests
    |
    v
Build
    |
    v
Browser tests
```

## ビルド処理

開発中はHTML、CSS、JavaScript、Profileを分離します。

```text
JavaScript modules
        |
        | esbuild
        v
 bundled JavaScript
        |
        +-------------------+
                            |
Profiles                    |
        |                   |
        | embed             |
        +-------------------+
                            |
CSS                         |
        |                   |
        +----------+        |
                   |        |
index.template.html         |
        |          |        |
        +----------+--------+
                   |
                   | build.mjs
                   v
dist/rich-html-to-markdown.html
```

最終HTMLには、

* JavaScript
* CSS
* Extraction Profiles

をすべて埋め込みます。

## 配布成果物の制約

`dist/rich-html-to-markdown.html` は単独で動作しなければなりません。

少なくとも以下を自動検証します。

* 外部JavaScriptなし
* 外部CSSなし
* 外部Profileファイルなし
* 変換処理にネットワーク通信不要
* ローカルHTMLとして直接起動可能

## package.json scripts

少なくとも以下を提供します。

```text
npm test
npm run build
npm run test:e2e
npm run check
```

実際のコマンドラインオプションは実装時に決定します。

## `dist/` の扱い

単一HTMLは本プロジェクトの主要な配布成果物です。

以下のどちらかを選択します。

```text
Git管理しない
→ CI / Releaseで生成
```

または、

```text
Git管理する
→ リポジトリから直接取得可能
```

Git管理する場合は、CI上で再ビルドしたHTMLとコミット済みHTMLが一致することを確認します。

初期段階では配布の容易さを優先し、Gitへ含めても構いません。

## 新しいサービスへの対応

新しいサービスへ対応する場合は、原則として次の順序で進めます。

1. 実HTMLを取得する
2. 匿名化したfixtureを追加する
3. Semantic Documentとして何を抽出するか決める
4. Extraction Profileを追加する
5. 宣言的Profileで不足する場合のみhookを追加する
6. `expected.md` を定義する
7. Auto detection testを追加する

Markdown Rendererをサービス固有に変更することは原則避けます。

## Profile schemaの発展方針

Profileは意図的に小さく保ちます。

次のような要求が出た場合でも、

```text
if
else
loop
variable
function
expression language
```

をすぐProfile schemaへ追加しないでください。

まず、

```text
既存の宣言機能で表現可能か
hookへ分離できないか
複数サービスで共通して必要な機能か
```

を確認します。

複数の実Profileで同じ要求が繰り返し発生した場合にのみ、Profile schemaの標準機能として追加します。

この方針により、独自DSLがJavaScriptの不完全な再実装になることを防ぎます。

## 将来的な拡張

ExtractionとRenderingを分離しているため、入力サービスと出力形式を独立して拡張できます。

入力側:

```text
ChatGPT
Claude
Gemini
GitHub
Web article
...
```

出力側:

```text
Markdown
JSON
HTML
...
```

概念的には、

```text
             Source HTML
                  |
                  v
        Extraction Profiles
                  |
                  v
         Semantic Document
                  |
          +-------+-------+
          |       |       |
          v       v       v
      Markdown   JSON    HTML
```

という構造へ拡張できます。

初期実装ではMarkdownのみを正式な出力対象とします。
