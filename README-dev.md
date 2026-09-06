# Development Guide

この文書では Rich Text to Markdown Converter の開発構成、テスト方針、ビルド方法を説明します。

利用者向けの仕様については `README.md` を参照してください。

## 開発方針

利用者には単一HTMLを配布します。

一方、リポジトリ内部ではソースコードを適切に分割し、単体テスト、fixtureテスト、ブラウザテストを実行できる構成にします。

つまり、単一HTMLはソースコード上の制約ではなく、ビルド成果物に対する制約として扱います。

```text
Source modules
     |
     | build
     v
Single HTML
     |
     v
User
```

## 基本原則

開発上は以下を原則とします。

### 配布物とソースを分離する

開発者が巨大な単一HTMLを直接編集する構成にはしません。

JavaScript、CSS、HTMLテンプレートを個別に管理し、ビルド時に単一HTMLへまとめます。

### 変換ロジックとブラウザ処理を分離する

Markdown変換ロジックは、可能な限りUIやClipboard APIから独立させます。

概念上の依存関係は以下とします。

```text
Browser UI
    |
    v
Clipboard adapter
    |
    v
Core converter
    |
    v
Markdown
```

`core` からブラウザUIを参照してはいけません。

### クリップボード取得と変換を分離する

ブラウザから取得したデータは、一度共通の入力モデルへ変換します。

概念的には以下のデータを扱います。

```text
ClipboardInput
- html
- text
- types
```

変換器はこの入力を受け取り、Markdownを返します。

これにより、本物のOSクリップボードを利用せずに変換処理を自動テストできます。

### 実データをfixtureとして保持する

ChatGPTなどから実際に取得したクリップボードHTMLをfixtureとして保存します。

変換器の変更によって過去の入力に対する結果が壊れていないか、自動テストで確認します。

## 想定開発環境

以下を基本構成とします。

* Node.js 20以降
* npm
* esbuild
* Vitest
* Playwright

各ツールの役割は以下です。

| Tool       | Purpose                  |
| ---------- | ------------------------ |
| Node.js    | 開発・ビルド環境                 |
| npm        | パッケージ管理とタスク実行            |
| esbuild    | JavaScriptのバンドル          |
| Vitest     | Unit test / fixture test |
| Playwright | Browser integration test |

プロジェクトが小規模なうちは、より大規模なWebフレームワークは使用しない方針とします。

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
│   │   ├── normalize.js
│   │   └── html-to-markdown.js
│   │
│   └── browser/
│       ├── clipboard.js
│       ├── ui.js
│       └── app.js
│
├── test/
│   ├── unit/
│   │   └── converter.test.js
│   │
│   ├── fixtures/
│   │   ├── chatgpt-basic/
│   │   │   ├── clipboard.html
│   │   │   ├── clipboard.txt
│   │   │   ├── metadata.json
│   │   │   └── expected.md
│   │   │
│   │   ├── chatgpt-code/
│   │   │   ├── clipboard.html
│   │   │   ├── clipboard.txt
│   │   │   ├── metadata.json
│   │   │   └── expected.md
│   │   │
│   │   └── generic-web/
│   │       ├── clipboard.html
│   │       ├── clipboard.txt
│   │       ├── metadata.json
│   │       └── expected.md
│   │
│   └── browser/
│       └── app.spec.js
│
├── scripts/
│   └── build.mjs
│
└── dist/
    └── richtext-to-markdown.html
```

必要になるまでディレクトリやモジュールを細分化しすぎないようにします。

## 各ディレクトリの責務

### `src/core/`

ブラウザUIに依存しない変換処理を配置します。

主な責務は以下です。

* HTML入力の正規化
* HTMLからMarkdownへの変換
* プレーンテキスト入力の処理
* Markdown出力の正規化

このディレクトリ内のコードはNode.js上の自動テストから直接実行できる状態を維持します。

### `src/browser/`

ブラウザ固有の処理を配置します。

主な責務は以下です。

* `paste` イベントの受信
* `ClipboardEvent.clipboardData` の取得
* `text/html` と `text/plain` の取得
* 入力プレビュー
* Convertボタン
* 出力textarea
* Markdownのコピー

変換規則そのものはここへ実装しません。

### `test/fixtures/`

実際のコピー元から取得した入力データと、その期待結果を保存します。

1つのfixtureは基本的に以下の構成とします。

```text
fixture-name/
├── clipboard.html
├── clipboard.txt
├── metadata.json
└── expected.md
```

`clipboard.html` はクリップボードの `text/html` を保存したものです。

`clipboard.txt` は同時に取得した `text/plain` を保存します。

`expected.md` は期待するMarkdown出力です。

`metadata.json` にはfixtureの出所を記録します。

例えば以下の情報を保持できます。

```json
{
  "source": "chatgpt",
  "browser": "chrome",
  "captured": "2026-09-06",
  "description": "Answer containing headings and a code block"
}
```

fixtureに個人情報、認証情報、機密情報を含めてはいけません。

必要に応じて匿名化してからリポジトリへ追加します。

## 入力モデル

ブラウザ固有のClipboardEventをcoreへ直接渡さないようにします。

ブラウザ層で共通入力形式へ変換します。

概念的な入力形式は以下です。

```text
ClipboardInput
{
    html: string,
    text: string,
    types: string[]
}
```

変換処理の外部インターフェースは、概念的には以下とします。

```text
ClipboardInput
      |
      v
convert
      |
      v
Markdown string
```

具体的な関数分割やHTML変換アルゴリズムは実装時に決定します。

## 変換時の優先順位

基本的な入力選択ルールは以下です。

```text
text/html available
        |
       yes
        |
        v
HTML -> Markdown
```

HTMLが存在しない場合は、

```text
text/plain
    |
    v
Plain text / Markdown fallback
```

を使用します。

コピー元の形式ごとの特殊処理を追加する場合でも、可能な限り共通変換処理と分離します。

## テスト方針

テストは主に3層に分けます。

### Unit tests

HTML要素や正規化ルール単位のテストです。

対象例:

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
* whitespace normalization

高速に実行できるテストを中心とします。

### Fixture / Golden tests

実際に取得したクリップボードデータを変換し、`expected.md` と完全一致することを確認します。

```text
clipboard.html
      |
      v
 converter
      |
      v
 actual Markdown
      |
      v
 compare
      |
      v
 expected.md
```

ChatGPT側のHTML形式などが変化した場合は、新しい入力を既存fixtureへ上書きせず、新しいfixtureとして追加することを基本とします。

これにより、過去に対応していた入力形式を継続してテストできます。

### Browser integration tests

生成されたアプリケーションを実際のブラウザで開き、UIとして動作することを確認します。

主な確認対象は以下です。

* HTMLが正常に起動する
* 入力データを受け取れる
* Convertボタンが動作する
* Markdownが出力欄へ表示される
* 出力をコピーできる
* 外部リソースなしで起動する

OSの実クリップボード操作はブラウザ権限やCI環境の影響を受けやすいため、自動テストの中心には置きません。

ClipboardEventから内部入力モデルへの変換は、テスト用データを注入して検証します。

実際の `Ctrl+V` 操作については必要に応じて手動smoke testを実施します。

## ビルド

開発中のファイルは分割されていますが、最終成果物は以下の1ファイルです。

```text
dist/richtext-to-markdown.html
```

ビルド処理は概ね次の順序で行います。

```text
src/browser/app.js
        |
        | esbuild
        v
bundled JavaScript
        |
        +------------------+
                           |
src/style.css              |
        |                  |
        +---------+        |
                  |        |
src/index.template.html    |
        |         |        |
        +---------+--------+
                  |
                  | scripts/build.mjs
                  v
dist/richtext-to-markdown.html
```

最終HTMLにはJavaScriptとCSSをインライン化します。

配布版では外部ファイルへの依存を持たせません。

## セットアップ

リポジトリを取得後、依存パッケージをインストールします。

```bash
npm ci
```

開発環境で最初にPlaywrightのブラウザが必要な場合は、追加でインストールします。

```bash
npx playwright install
```

## Unit / fixture tests

```bash
npm test
```

Vitestを使用してUnit testとfixture testを実行します。

## ビルド

```bash
npm run build
```

成功すると以下が生成されます。

```text
dist/richtext-to-markdown.html
```

## Browser tests

ビルド後に実行します。

```bash
npm run test:e2e
```

Playwrightで生成済みHTMLのブラウザ動作を確認します。

利用者がローカルHTMLとして使用することを考慮し、少なくとも最終的な成果物が外部Webサーバーに依存せず動作することを確認します。

## 一括チェック

CIおよびリリース前には以下を一括実行できるようにします。

```bash
npm run check
```

想定する処理順序は以下です。

```text
Unit tests
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

## package.json scripts

少なくとも以下のnpm scriptを提供します。

```text
npm test
npm run build
npm run test:e2e
npm run check
```

具体的なコマンドラインや追加オプションは実装時に決定します。

## ビルド成果物の検証

単一HTMLという配布要件を自動的に検証します。

少なくとも以下を確認します。

* JavaScriptがHTML内に含まれている
* CSSがHTML内に含まれている
* 外部JavaScriptを必要としない
* 外部stylesheetを必要としない
* 変換処理にネットワークアクセスを必要としない
* `dist/richtext-to-markdown.html` 単独で起動できる

必要に応じて、生成HTMLに外部参照が含まれていないこともCIで検査します。

## `dist/` の扱い

`dist/richtext-to-markdown.html` は単なる一時ファイルではなく、本プロジェクトの主要な配布成果物です。

そのため、以下のどちらかの運用を選択します。

1. Gitには含めず、ReleaseやCI Artifactとして生成する
2. Gitにも含め、リポジトリから直接HTMLを取得できるようにする

Gitへ含める場合は、CIで再ビルドした成果物とコミット済みの `dist/richtext-to-markdown.html` が一致することを確認し、生成物の更新忘れを防ぎます。

初期段階では、配布の容易さを優先してGitへ含めても構いません。

## fixture追加手順

新しい入力形式への対応や不具合修正時は、可能な限り再現用fixtureを追加します。

例えばChatGPTの表変換に問題が見つかった場合、

```text
test/fixtures/chatgpt-table/
```

を作成し、

```text
clipboard.html
clipboard.txt
metadata.json
expected.md
```

を追加します。

その後に変換処理を修正します。

これにより同じ問題の再発を自動検出できます。

## 対応ブラウザ

初期段階ではChromium系ブラウザを主要な開発・テスト対象として構いません。

ただし、ClipboardEventなど標準Web APIを使用し、可能な限り特定ブラウザ固有APIへ依存しない設計とします。

FirefoxやSafariを正式に対象とする場合は、Playwrightの対象ブラウザとfixtureの取得環境を追加します。

## セキュリティとプライバシー

このツールは、ユーザーが貼り付ける会話や文書を扱います。

そのため、以下を原則とします。

* 入力内容を外部サーバーへ送信しない
* Analyticsを組み込まない
* 外部CDNを利用しない
* 外部JavaScriptを読み込まない
* fixtureへ実ユーザーの機密情報を保存しない
* HTML入力をUIへ再描画する場合は、任意スクリプトを実行しないよう注意する

特にクリップボード由来のHTMLは信頼できない入力として扱います。

## 将来的な拡張

現在の主要な出力はMarkdownですが、coreとbrowserを分離することで、将来的に以下を追加できる構成とします。

* CLI
* HTMLファイル入力
* JSON形式の会話保存
* Markdown + JSON bundle
* 複数サービス固有のnormalizer
* 画像・添付ファイルの保存
* 他形式への変換

これらの拡張によって、単一HTML版の基本的な利用方法を壊さないことを原則とします。
