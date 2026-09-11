# Development Guide

この文書では Rich HTML to Markdown Converter のアーキテクチャ、Extraction Profile、テスト方針、ディレクトリ構成、ビルド方法について説明します。

利用者向けの仕様については `README.md` を参照してください。

## 仕様の状態

初期実装として、以下の変換基盤・Profile・ブラウザUI・ビルド・自動テストを追加しています。仕様から手作成した合成fixtureに加え、2026年9月9日・10日付のChatGPT実DOMから匿名化・抜粋したfixtureで、コードビューア、ユーザー投稿の改行、出典リンクを検証しています。リリース対象ブラウザの実クリップボード操作は未確認です。検証状況は [docs/validation.md](docs/validation.md) に記録します。仕様変更時は両READMEと対応するfixtureの期待値を同じ変更で更新します。新しいDOMへの対応は実HTMLで検証し、この文書の属性例を現行サービスの保証とは扱いません。

初期実装の範囲はAuto、ChatGPT Conversation、Generic HTMLとMarkdown出力です。出力書式の設定、外部Profileの実行時読み込み、履歴の永続保存、ファイルのダウンロード機能は含めません。

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

### 入力方式と受理条件

| 入力方式 | 使用するクリップボード形式 | 入力欄 |
| --- | --- | --- |
| リッチコピー（初期値） | 空でない `text/html` のみ | 読み取り専用のソース表示。pasteイベントは受け付ける |
| HTMLソース | `text/plain` のみ。`text/html` は無視 | ソースを手入力・編集可能 |

貼り付けは既定動作を抑止して入力全体を置き換えます。必要な形式がない、またはその値が空白のみなら、入力・既存の変換結果を変更せず入力方法のエラーを表示します。HTMLソース入力でタグの有無による判定は行いません。例えば `hello` はテキストノードとして受理し、プレーンテキストのMarkdown構造は推測しません。

coreは空白のみの入力を `EMPTY_INPUT` として拒否します。文書全体と断片の両方をHTMLとして解析し、断片は合成した `body` 内に置きます。不正な閉じタグなどは採用したHTML parserの補正に従い、XMLとしての整形式性は要求しません。補正後のDOMで抽出します。

### 解析・表示時の安全性

入力は、外部リソースを取得せずコードを実行しない隔離された解析環境でDOM化します。この性質をブラウザテストで確認できるparserを採用します。入力DOMを稼働中のページへ挿入しません。入力・出力の表示には `textarea.value` または `textContent` を使用し、HTMLプレビューは提供しません。

実装では [parse5](https://parse5.js.org/) でHTMLの構文を補正し、[LinkeDOM](https://github.com/WebReflection/linkedom) の `linkedom/worker` で検索・複製用のDOMを構築します。解析・正規化・Rendererは同じ実装をNode.jsとブラウザで使用し、ブラウザのネイティブDOMParserは使用しません。CSPを持たないページでもparserによる通信・入力コードの実行が発生しないことをブラウザテストで確認します。

解析後、検出前に `script`、`style`、`link`、`base`、`meta`、`iframe`、`object`、`embed`、`template`、`svg` を子孫ごと除去し、イベント属性と `style` 属性を除去します。`hidden` または `aria-hidden="true"` の要素も子孫ごと除去します。外部CSSや計算済みスタイルによる可視性判定はしません。検出に必要な `data-*`、`class`、`role` は残します。hook後にも同じ除去を行います。

URLは共通正規化でHTML文字参照の復号後に前後の空白を除いて判定します。途中のASCII制御文字を含むURLは無効とします。リンクはホスト付きの絶対HTTP(S) URL、空でない `mailto:` / `tel:`、`#...` のみ、画像はホスト付きの絶対HTTP(S) URLのみ許可します。相対URL、`//...`、`data:`、`blob:`、その他のschemeは `URL_DROPPED` を出し、リンク本文または画像のaltだけを残します。`base` やツール自身の `file://` URLから補完しません。URLの到達確認や画像取得は行いません。

防御として配布HTMLにCSPを埋め込み、少なくとも `connect-src 'none'`、`img-src 'none'`、`frame-src 'none'`、`object-src 'none'`、`base-uri 'none'`、`form-action 'none'` を指定します。必要な埋め込みJavaScript/CSSのみを許可します。CSPの有無にかかわらずparser自体も通信しないことを要件とします。入力・出力はメモリ内だけに保持し、localStorage、IndexedDB等には保存しません。

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

### 初期実装のデータ契約

共有型は `src/core/document-model.ts` に定義し、TypeScriptで検査します。以下は組み込みProfileのデータ契約です。`html` は安全性処理・正規化済みのHTML断片文字列であり、DOMオブジェクトを層間の公開データに含めません。

```ts
type Message = {
  type: 'message';
  role: 'user' | 'assistant' | 'unknown';
  html: string;
};
type SemanticDocument =
  | { type: 'conversation'; metadata: { source: 'chatgpt' }; items: Message[] }
  | { type: 'document'; metadata: { source: 'generic-html' }; html: string };

type Diagnostic = {
  code: string;
  message: string;
  itemIndex?: number; // 抽出対象ターンのDOM順、0始まり。除外後も振り直さない
};
type ConvertResult =
  | { ok: true; profileId: string; document: SemanticDocument;
      markdown: string; warnings: Diagnostic[] }
  | { ok: false; profileId: string | null; error: Diagnostic;
      warnings: Diagnostic[] };
// convert(html, { mode: 'auto' | 'chatgpt-conversation' | 'generic-html' })
//   -> ConvertResult（同期処理）
```

前述の概念図の `content` はこの契約では `html` です。追加の時刻・タイトル・URL・メッセージIDは初期モデルに含めません。抽出した本文に可視テキスト、空でないコード、許可された画像参照のいずれも残らないメッセージは `EMPTY_MESSAGE` を出して除外します。全メッセージが除外された場合とGeneric HTMLの本文が空の場合は `NO_CONTENT` とします。画像のみの本文は有効です。

RendererはサービスIDで分岐せず、`type` と `role` に基づいて会話形式を出力し、metadataを出力します。

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

ProfileはDSLそのものではなく、YAMLベースの宣言的設定として実装します。

独自の制御構文を持つプログラミング言語にはしません。

## Profileの初期定義

ChatGPT用Profileの暫定定義は以下です。

```yaml
id: chatgpt-conversation
name: ChatGPT Conversation
documentType: conversation

detect:
  any:
    - '[data-testid^="conversation-turn-"]'
    - '[data-message-author-role="user"]'
    - '[data-message-author-role="assistant"]'

items:
  selectors:
    - '[data-testid^="conversation-turn-"]'
    - '[data-message-author-role="user"], [data-message-author-role="assistant"]'

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
        - ':scope'
      assistant:
        - '[data-message-author-role="assistant"] .markdown'
        - '[data-message-author-role="assistant"]'
        - ':scope'
      unknown:
        - '[data-message-author-role]'
        - ':scope'

  exclude:
    - button
    - nav
    - '[role="toolbar"]'
    - '[data-testid="webpage-citation-pill"] img[alt=""]'

hooks:
  resolveRole: chatgptResolveRole
  normalizeContent: chatgptNormalizeContent
  inspectDocument: chatgptInspectDocument
```

`[role="group"]` は本文を含む可能性があるため、一律に除外しません。新しいUI除外セレクターは本文を保持するfixtureと組み合わせて追加します。

### Schemaと選択規則

必須フィールドは `id`、`name`、`documentType` です。`conversation` は `items`、`document` は `content.selectors` を必須とします。任意フィールドは `detect`、`exclude`、`hooks` です。`items` のフィールドは上例の `selectors`、`type`、`role`、`content`、`exclude` とし、`type` は `message` 固定です。`role.attribute` が欠落するか `map` にない値なら、hook適用前のroleは `unknown` です。

* `detect` は `all` または `any` のいずれか一方に空でないセレクター配列を持ちます。安全性処理後の文書全体で、各セレクターの一致要素の存在を判定します。
* `selectors` は優先順の空でない配列です。最初に1件以上一致するセレクターだけを採用し、その全一致要素をDOM順で使用します。空本文であっても一致とみなし、次候補へ進みません。
* 文書単位の検索範囲は `body` とその子孫、メッセージ本文の検索範囲は対象itemとその子孫です。検索範囲のルート自身も一致候補とし、`:scope` はそのルート1件を指します。
* 同一DOM要素は1回だけ扱い、採用した要素の子孫に別の採用要素があれば、最外側の要素だけを残します。`data-message-id` や本文の一致では重複排除しません。
* 複数の本文要素はそれぞれの外側タグを保持した断片として結合し、間にLFを1個置きます。`:scope` も同様です。これにより段落・見出しなどの境界を保持します。
* `content.selectors` は文書では配列、会話では `user` / `assistant` / `unknown` をキーとする配列のmapです。role解決後に対応する配列を使用します。
* `exclude` は選択した本文の複製に適用し、一致要素を子孫ごと除去します。選択ルートも対象です。Profile直下、item内の順で適用し、検出用のDOMは変更しません。
* 未知フィールド、空の候補配列、不正なCSS selector、重複Profile ID、未登録hookはビルド・テスト時のエラーです。実行時に判明した場合も `INVALID_PROFILE` とし、黙って無視しません。

## Profileが担当する機能

初期schemaで表現する機能は以下に限定します。

| Function          | Purpose              |
| ----------------- | -------------------- |
| detect            | Profileを適用できるHTMLか判定 |
| selector          | CSS selectorによる要素選択  |
| fallback selector | 第一候補が存在しない場合の代替      |
| repeat            | 複数要素を順番に抽出           |
| attribute         | HTML属性の取得            |
| html              | 選択要素の外側タグを含む断片取得 |
| constant          | documentType / item typeの固定値 |
| map               | 属性値等の意味変換            |
| exclude           | 不要DOMの除外             |

必要になるまでは条件式、ループ、変数、独自式言語などを追加しません。

`repeat` は採用した全要素をDOM順で処理する動作を指し、独立した構文は設けません。任意フィールドへの `textContent` 取得や汎用的な値代入は初期schemaに含めません。

## Custom hooks

すべてのDOM構造を宣言的Profileだけで表現しようとはしません。

サービス固有の特殊処理が必要な場合は、TypeScript hookへ処理を委譲できます。

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

のようにProfileからhookを指定します。

`src/core/profile.ts` の `Hooks` が引数・戻り値の契約、`HookRegistry` が役割ごとの登録形式です。例えば `src/hooks/chatgpt.ts` では次のように登録します。

```ts
export const hookRegistry = {
  resolveRole: { chatgptResolveRole },
  normalizeContent: { chatgptNormalizeContent },
  inspectDocument: { chatgptInspectDocument },
} satisfies HookRegistry;
```

追加hookは対応する役割のmapに登録します。YAMLで別の役割の関数名を指定した場合も `INVALID_PROFILE` として拒否します。

hook名はビルドに含めた関数のregistryで解決し、入力HTMLから関数名やコードを読み込みません。初期契約は以下です。

| hook | 呼び出し単位・入力 | 戻り値 |
| --- | --- | --- |
| `resolveRole` | itemごと。読み取り専用の対象Element、map適用後のrole、itemIndex | `{ role, warnings }` |
| `normalizeContent` | itemごと（文書は1回）。除外済みHTML文字列と `{ role, itemIndex }`。文書では両方省略 | `{ html, warnings }` |
| `inspectDocument` | 会話1回。読み取り専用の安全性処理後DOMと、空本文を除外する前のitem一覧 | `{ warnings }` |

すべて同期関数とし、渡されたDOMの変更、ネットワーク通信、UI操作を禁止します。実行順は「安全な解析 → 検出 → item選択 → 完全性検査 → itemごとにrole取得・resolveRole → 本文選択 → exclude → normalizeContent → 安全性処理の再適用・共通正規化 → 空本文判定 → Semantic Document → Renderer」です。itemが0件なら完全性検査前に `NO_ITEMS` とします。Generic HTMLでは検出後に本文選択へ進み、item選択・完全性検査・role処理を省略します。

hookの例外は `CONVERSION_FAILED` として処理全体を中止し、部分的なMarkdownは返しません。

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

### Markdownの固定出力規則

CommonMarkの基本構文にGFMの表・打ち消し線を加えた範囲を対象とします。初期実装には書式オプションを設けません。

| 対象 | 暫定規則 |
| --- | --- |
| 出力全体 | UTF-8、改行はLF。ブロック間に空行1行、末尾にLF1個。コード内の空行は圧縮しない |
| 会話 | `source: chatgpt`、`type: conversation` の順のfront matterを必ず出力。話者は `## User` / `## Assistant` / `## Unknown` |
| 文書 | front matterなし |
| 見出し | ATX形式。文書は元のレベル、会話本文は `min(元のレベル + 2, 6)` |
| 段落・改行 | `p` とブロック要素は段落境界、`br` は末尾スペース2個＋LFのhard break。通常テキスト内の連続するHTML空白は半角スペース1個に畳み、段落の前後と改行直後の空白は除去 |
| 強調 | `strong` / `b` は `**`、`em` / `i` は `*`、`del` / `s` は `~~`。空要素は出力しない |
| リスト | 箇条書きは `- `。番号付きは有効な `ol[start]`（省略時1）から連番。子ブロックは親のマーカーと後続スペースの文字数だけ字下げ。段落が複数あるitemは段落間に空行を残す |
| 引用・水平線 | 引用は空行も含め各行に `> ` を付け、空の引用行は `>` のみ。`hr` は `---` |
| インラインコード | 改行をスペースへ置換。本文中の最長バッククォート連続長より1個長いdelimiter（最低1個）を使う。本文の端がバッククォート、または両端がスペースで全体がスペースだけではない場合は両端にスペースを1個追加 |
| コードブロック | `pre` のtextContentを使用しCRLF/CRをLFへ統一。バッククォートを最低3個、本文中の最長連続長より1個長く使用。閉じfenceは独立行とし、本文末尾にLFがなければ1個補う |
| コード言語 | `pre > code`、次に `pre` のclassから、最初の `language-([A-Za-z0-9_+-]+)` に完全一致するclass tokenのsuffixを使用。なければ言語指定なし |
| リンク・画像 | `[本文](<URL>)` / `![alt](<URL>)`。titleは省略、URL中の空白・`<`・`>`はパーセントエンコード。scheme等は入力節の許可規則に従う |

通常テキストのASCII句読点を一律にescapeせず、`Stage-Gate`、`R&D`、`80%`、`0.5`、`Confidence:` などをそのまま出力します。入力由来のバックスラッシュ、バッククォート、アスタリスク、アンダースコア、角括弧、パイプ、チルダはescapeします。`<` は直後が非空白またはテキスト末尾の場合、`&` は文字参照になり得る場合またはテキスト末尾の場合にescapeします。HTML文字参照で分かれた隣接テキストは結合し、未対応の透明なラッパーも除去してから判定します。

インライン内容を連結した後、行頭の見出し・引用・リスト・水平線・Setext見出しとして解釈され得る記号をescapeします。番号は行頭の1〜9桁の数字と `.` / `)` に空白または行末が続く場合にescapeし、本文見出しと表セルにも同じ規則を適用します。ATX見出し末尾の空白に続く `#` も保護します。本文の `!` と生成したリンクが隣接して画像構文になることを防ぎます。これらは汎用Markdown parserによる最小escapeの計算ではなく、読みやすさと文字の保持を両立する固定規則です。

Rendererが生成するMarkdown構文やfront matterは通常テキストのescape対象外です。装飾の内側にある前後の空白はdelimiterの外へ移し、コード本文はescapeしません。HTML文字参照はDOM解析で復号し、raw HTMLを出力へ残しません。

結合セルがなく、各行のセル数が同じで、セルがインライン内容だけの表をGFMのpipe tableへ変換します。最初の行がすべて `th` ならヘッダーとし、そうでなければ空のヘッダーを補って全行をデータ行にします。列幅はヘッダーと全データセルのMarkdownソースの最大表示幅（最低3）とし、各セルを右側のスペースで埋めます。セルの両側にはさらにスペース1個を置き、区切り行は列幅と同じ数の `-` とします。日本語・全角文字・絵文字は幅2、通常の半角文字は幅1で扱い、結合文字は基底文字と一体で数えます。強調記号やescapeのバックスラッシュもソース幅に含めます。実際の表示幅はフォントに依存します。列の配置指定は出力しません。セル内の `br` はスペースへ置換し、`|` はコード内も含め `\|` とします。`caption` は表の直前の段落として残します。

`rowspan` / `colspan` が1以外、列数不一致、入れ子の表、セル内にブロック要素がある表は `TABLE_FLATTENED` を出します。セル内の可視テキストを空白で畳み、行ごとにセルを ` / ` で区切った段落へ変換します。入れ子の表は外側セルのテキストに含めて一度だけ出力します。セルがない空の表は省略します。

一般の `div`、`section`、`article`、`main`、`header`、`footer`、`aside` はブロック境界として扱い、その他の未対応要素は子の内容を保持してタグだけを取り除きます。安全性処理で子孫ごと除去する要素は例外です。数式、添付、writing block、タスクリスト、脚注などの専用表現は初期実装に含めず、この一般規則に従います。`ol[reversed]` と `li[value]` は番号付けに反映せず `LIST_NUMBERING_NORMALIZED` を出します。

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

本バージョンでは複雑なスコアリングアルゴリズムは必要ありません。

Autoは登録順でサービス固有Profileの `detect` を評価し、最初に一致した1件を採用します。初期登録順はChatGPTのみで、どれにも一致しなければGeneric HTMLを採用します。Generic HTMLはfallback専用で `detect` を持ちません。将来Profileを追加する際も登録順を明示し、競合入力のテストを追加します。

手動選択は `detect` の成否にかかわらず指定Profileを実行します。Autoでも手動でも、採用後の抽出失敗を理由とした別Profileへの再試行は行いません。存在しないモードは `INVALID_MODE`、対象itemがないChatGPT入力は `NO_ITEMS` とします。失敗時も採用済みのProfile IDを返してUIに表示します。

## Generic HTML Profile

サービス固有Profileに該当しないHTML用としてGeneric HTML Profileを提供します。

初期定義は以下です。

```yaml
id: generic-html
name: Generic HTML
documentType: document

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

`script` と `style` は共通の安全性処理でも除去されます。`nav` はGeneric HTML固有の除外です。`body` が合成されたHTML断片にも、同じ候補優先順と複数一致規則を適用します。

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

### メッセージと本文の確定

1. ターン要素が1件でもあれば、その最外側の全要素をDOM順でitemにします。なければUser/Assistantの著者属性を持つ最外側の要素をitemにします。両方式を混ぜて追加抽出しません。
2. `chatgptResolveRole` は有効な `data-turn` を優先し、なければitem自身と子孫の有効な `data-message-author-role` が1種類だけの場合に採用します。有効値は `user` / `assistant` のみです。両属性の有効値が矛盾すれば `ROLE_CONFLICT`、roleを確定できなければ `UNKNOWN_ROLE` を出します。矛盾時は有効な `data-turn`、確定不能時は `unknown` を使用します。
3. role別の本文候補を順に評価します。Assistantの `.markdown` が複数あればすべてDOM順で結合します。同一itemの複数著者要素も同様です。異なる応答候補を推測して1つに絞る処理は行いません。
4. `:scope` までfallbackした場合は `CONTENT_FALLBACK` を出し、item内の既知UIを除いた内容を保持します。最初の候補が存在して空だった場合はfallbackせず、最終的な空本文判定に従います。
5. `chatgptNormalizeContent` は抽出・除外済み断片に、次節の実DOMで検証した正規化を適用します。未確認のクラスや見た目から本文構造を推測しません。

### 2026年9月の実DOMに対する正規化

以下は `code-viewer-2026-09`、`user-lines-2026-09`、`citation-2026-09`、`readable-output-2026-09` のfixtureで固定しています。サービス固有の処理はProfileとhookに置き、Markdownの書式は共通Rendererに委ねます。

* コードビューア: 最外側の `pre` 内に `[id="code-block-viewer"]` が1件、その中に `pre.cm-content` が1件、さらに直下の `code` が1件ある場合、外側のUIを内側の `pre` に置き換えます。これによりコード本文の空白・改行を保持し、言語ラベルの本文への混入を防ぎます。ビューアが複数あるなど判定が曖昧な場合は元の構造を保持します。
* コード言語: 内側の `code`、内側の `pre`、外側の `pre` の順で有効な `language-*` クラスを優先します。なければ、外側の `.select-none.sticky .font-medium` にあるラベルが `[A-Za-z0-9_+-]+` に完全一致する場合のみ、小文字化して `language-*` クラスに移します。ラベルがない場合や形式が不正な場合は言語を付けません。
* ユーザー投稿: 解決済みroleが `user` の場合だけ、本文の `.whitespace-pre-wrap` 内のテキスト改行を `br` に変換します。連続改行も保持し、`pre` / `code` 内には適用しません。Markdown上では末尾スペース2個とLFのhard breakになります。通常の空白の圧縮・句読点のescapeは共通規則に従い、見出しやコードを推測しません。折りたたみ状態でもDOM内の全文を対象にします。
* 検索ラベル: user本文の `[data-inline-selection-pill][data-id="search"][data-keyword]` を `〔data-keywordの値〕` に置き換えます。空のラベル・未知のpill・通常の `@` メンションは保持し、`pre` / `code` 内には適用しません。
* 文字列の強調: assistant本文に限り、同じテキストノード内の対応する `**...**` を `strong` に変換します。復号済みのHTML文字参照は隣接テキストと結合して扱います。空・改行を含む・内側の前後に空白がある・バックスラッシュでescapeされた・3個以上連続するアスタリスクのdelimiterは解釈しません。要素境界をまたいだ推測や他のMarkdown記法の解釈は行わず、既存の `strong` / `b` と `pre` / `code` の内部も保持します。user・unknown・Generic HTMLには適用しません。
* 出典アイコン: `[data-testid="webpage-citation-pill"]` 内にある `img[alt=""]` をProfileの `exclude` で除去します。出典のラベルとリンク先は保持し、代替テキストを持つ画像と出典チップ外の本文画像は除去しません。

再生成候補や非表示要素を含む入力についても、共通の `hidden` / `aria-hidden` 除去と上記規則だけを適用します。サービスの内部状態を推測しません。

### DOM完全性

`body` をコピーした場合でも、会話全体がHTMLに含まれるとは限りません。

長い会話では過去ターンがブラウザDOMから削除されている可能性があります。

ChatGPT Profileでは、以下を検査します。

```text
detected turn count
first detected turn
last detected turn
missing sequence
```

完全性を確実に判定できない場合はエラーではなくwarningとして扱います。

`chatgptInspectDocument` は、本文抽出前のitemに対して次の順で文書単位のwarningを返します。

* `COMPLETENESS_UNVERIFIED` は常に1件出します。連番でも末尾の欠落やDOM外の会話の有無は確認できないためです。
* 全itemの `data-testid` が `^conversation-turn-(0|[1-9][0-9]*)$` に一致し、安全な整数として扱える場合のみ番号を検査します。0始まり・1始まりの両方を許容する暫定規則とし、最小値が1より大きければ `POSSIBLE_MISSING_START` を1件出します。
* 番号の重複またはDOM順での逆転があれば `TURN_SEQUENCE_INVALID` を1件出します。item順は並べ替えません。番号が一意で昇順の場合だけ、隣接番号の差が2以上なら `MISSING_TURNS` を1件出します。

著者要素だけの入力や番号を取得できない入力は `COMPLETENESS_UNVERIFIED` のみとします。警告は欠落の可能性を示すもので、欠落の確定や完全性の保証には使用しません。意図的な部分コピーも同じ規則です。

## エラーとwarning

warningがあっても変換とコピーを継続します。エラーではMarkdownとSemantic Documentを返さず、UIの旧出力もクリアします。想定外の例外は `CONVERSION_FAILED` に変換し、HTML本文やスタックトレースを利用者向けメッセージに含めません。

エラーコードは `EMPTY_INPUT`、`INVALID_MODE`、`INVALID_PROFILE`、`NO_ITEMS`、`NO_CONTENT`、`CONVERSION_FAILED` です。HTMLソースの構文補正そのものはエラーにしません。失敗時は発生までに確定したwarningを保持します。モード不正と空入力が同時なら `INVALID_MODE` を優先します。

warningコードは各規則に記載したものを使用します。UI文言は日本語とし、機械判定には `code` と任意の `itemIndex` のみを使用します。完全性検査は文書単位（itemIndexなし）、role・本文fallback・空メッセージはitem単位、URL・表・リストは会話なら所属item単位、Generic HTMLなら文書単位です。同じ `(code, itemIndex)` は最初の1件だけを残します。配列順は「完全性検査の順 → itemIndex昇順 → 同一itemではcodeのASCII昇順」とし、Generic HTMLはcodeのASCII昇順とします。

## ディレクトリ構成

想定するリポジトリ構成は以下です。

```text
.
├── README.md
├── README-dev.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
│
├── src/
│   ├── index.template.html
│   ├── style.css
│   │
│   ├── core/
│   │   ├── convert.ts
│   │   ├── detect-source.ts
│   │   ├── extract.ts
│   │   ├── document-model.ts
│   │   ├── profile.ts
│   │   ├── profile-schema.ts
│   │   ├── diagnostics.ts
│   │   ├── dom.ts
│   │   ├── normalize.ts
│   │   └── render-markdown.ts
│   │
│   ├── profiles/
│   │   ├── index.ts
│   │   ├── yaml.d.ts
│   │   ├── chatgpt.yaml
│   │   └── generic-html.yaml
│   │
│   ├── hooks/
│   │   └── chatgpt.ts
│   │
│   └── browser/
│       ├── paste.ts
│       ├── ui.ts
│       └── app.ts
│
├── test/
│   ├── assertions.ts
│   ├── fixtures.test.ts
│   ├── type-contracts.ts
│   ├── unit/
│   │   ├── profile-engine.test.ts
│   │   ├── source-detection.test.ts
│   │   └── markdown-renderer.test.ts
│   │
│   ├── fixtures/
│   │   ├── chatgpt/
│   │   │   ├── body-basic/
│   │   │   │   ├── input.html
│   │   │   │   ├── metadata.json
│   │   │   │   ├── expected.json
│   │   │   │   └── expected.md
│   │   │   │
│   │   │   ├── body-partial/
│   │   │   │   ├── input.html
│   │   │   │   ├── metadata.json
│   │   │   │   ├── expected.json
│   │   │   │   └── expected.md
│   │   │   │
│   │   │   ├── code-block/
│   │   │   └── writing-block/
│   │   │
│   │   └── generic-html/
│   │       └── article-basic/
│   │           ├── input.html
│   │           ├── metadata.json
│   │           ├── expected.json
│   │           └── expected.md
│   │
│   └── browser/
│       └── app.spec.ts
│
├── scripts/
│   ├── build.ts
│   └── profile-plugin.ts
│
└── dist/
    └── rich-html-to-markdown.html
```

Profileは `.yaml` で管理し、ビルド時に検証してbundleへ埋め込みます。

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

入力方式は「リッチコピー」、変換モードはAutoを初期値とします。入力欄の編集、受け付けた貼り付け、入力方式・変換モードの変更時に前回の出力・warning・エラー・検出結果をクリアし、Convertの実行を待ちます。入力方式の変更時だけ入力もクリアします。受理できない貼り付けでは既存の入力・出力を保持し、別の入力エラー表示領域に理由を示します。

検出はConvert時に行い、選択モードと実際に採用したProfile名を別々に表示します。出力欄は読み取り専用のtextareaとし、成功して空でない出力があるときだけコピーボタンを有効にします。Clipboard APIが存在しない、または書き込みに失敗した場合は、出力欄へフォーカスして全選択し、手動コピーを案内します。コピー失敗で変換結果を消しません。front matterを含むMarkdown文字列だけをコピーし、warningなどのUI表示は含めません。

## Fixture

実際のWebサービスから取得したHTMLをfixtureとして保存します。

基本構成:

```text
fixture-name/
├── input.html
├── metadata.json
├── expected.json
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

2026年9月に追加した実DOM由来のfixtureは、提供されたHTMLから構造を抜粋し、本文・コード・URLをテスト用データへ置換しています。`metadata.json` の `sanitization` に加工内容を記録し、確認できないブラウザ種別は `null` としています。元データと全文の変換結果を置く `tmp/` はGit管理対象外です。

`expected.json` は実行オプションと機械判定可能な期待結果を保持します。初期形式は以下とし、`mode`、`ok`、`profileId`、`warnings` は必須です。成功時は `error` を省略し、失敗時は `error` を必須とします。`profileId` は採用前の失敗では `null` です。診断には `code` と必要な `itemIndex` だけを記録し、表示文言は比較しません。

```json
{
  "mode": "auto",
  "ok": true,
  "profileId": "chatgpt-conversation",
  "warnings": [
    { "code": "COMPLETENESS_UNVERIFIED" }
  ]
}
```

失敗fixtureでは例えば `"error": { "code": "NO_CONTENT" }` を指定し、`expected.md` は置きません。成功fixtureのMarkdownは末尾LFまで完全一致、診断は規定順の配列を完全一致で比較します。Semantic Documentの型・role・item順・正規化内容はunit testで検証します。

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

初期実装で少なくとも以下の境界例を固定します。

| 入力・条件 | 期待結果 |
| --- | --- |
| `main` の中に兄弟の `article` が2件 | 2記事をDOM順に各1回出力し、mainの他の本文は含めない |
| 入れ子の `article` | 最外側を1回出力し、内側の本文はその中に保持 |
| ChatGPTのitemに `.markdown` がなく著者要素がある | 著者要素を本文として採用 |
| 最優先の本文候補は存在するが空 | 他候補へ進まず `EMPTY_MESSAGE`。全件空なら `NO_CONTENT` |
| ChatGPTを手動選択した一般記事 | `NO_ITEMS`。Generic HTMLに切り替えない |
| `data-turn="user"` と著者のassistantが矛盾 | roleはuser、`ROLE_CONFLICT`。role別候補に従って抽出 |
| 未知role、`:scope` fallback、空メッセージ | 各warningと、Unknown見出しまたは除外を確認 |
| ターン番号0,1 / 1,2 / 5,7 / 2,1 / 番号なし | 完全性節どおりのwarning配列、DOM順を維持 |
| 会話本文のh1 / h6 | 話者h2、本文h3 / h6 |
| バッククォートを含むコード、入れ子リスト、br、結合セル | 固定出力規則と表のwarningを確認 |
| 相対URL、許可しないscheme、画像だけの本文 | URLの除去・alt保持・warningと空本文判定を確認 |

raw HTMLの `hello` はGeneric HTMLで `hello` と末尾LFになります。通常のコピーで `text/plain` のみの `hello` はブラウザ層で拒否するため、別のブラウザテストとします。

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

CIではPlaywright付属Chromiumで配布HTMLを `file://` から直接開きます。リリース前にデスクトップChrome・Edgeの安定版で同じ基本操作と実クリップボードの往復を確認し、OS・ブラウザのバージョンを記録します。Firefox・WebKit・モバイル対応は初期の合格条件に含めません。

両MIME形式を持つpaste、形式欠落、入力全体の置換、編集による旧結果のクリア、空入力、warning付き成功、コピーAPIの不在・拒否時の手動コピー案内を自動検証します。CIのpasteはDataTransfer等によるイベント、コピーはAPIの成功・失敗を制御して検証し、実クリップボードの確認はリリース前の操作確認で補います。

外部URLを持つ `img` / `iframe` / stylesheet、script、イベント属性を含む入力を、貼り付けから変換・コピーまで通して検証します。ネットワーク要求を監視し、起動する配布HTML自身以外への要求が1件でもあれば失敗とします。要求を遮断して成功扱いにせず、要求の試行自体を検出します。入力に仕込んだ実行検知用コードが実行されず、入力と出力がテキストとして表示されることも確認します。

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

* Node.js 20.19以降（22系は22.12以降。CIは22系）
* npm
* TypeScript
* esbuild
* Vitest
* Playwright

役割:

| Tool       | Purpose                   |
| ---------- | ------------------------- |
| Node.js    | 開発・ビルド環境                  |
| npm        | パッケージ管理                   |
| TypeScript | strict型チェック            |
| esbuild    | TypeScript変換・JavaScript bundling |
| Vitest     | Unit / fixture tests      |
| Playwright | Browser integration tests |

Extraction ProfileのYAMLは、ビルド時にJavaScriptオブジェクトとしてbundleへ埋め込みます。

実行時に外部Profileファイルを必要としないようにします。

## セットアップ

```bash
npm ci
```

Playwrightのブラウザが必要な場合:

```bash
npx playwright install chromium
```

## 型チェック

```bash
npm run typecheck
```

本体・hook・テスト・ビルドスクリプト・設定ファイルを `strict: true` で検査します。`tsc --noEmit` は型チェックのみを行い、JavaScriptへの変換はesbuildとテストランナーが担当します。`test/type-contracts.ts` では、成功／失敗・文書種別による絞り込みとhookの型の取り違えをコンパイル時に検証します。

`SemanticDocument` と `ConvertResult` は判別可能なunionです。`document.type` や `result.ok` を確認してから種別固有のフィールドを使います。追加サービスのため、`metadata.source` と変換モードのProfile IDは `string` としています。

YAMLのimportは `unknown` として扱い、既存の `validateProfiles` で検証してから `Profile[]` として利用します。型チェック後も実行時のProfile検証・HTMLの安全性処理・URL検証を行います。

LinkeDOMの型定義にある広い型を本体へ伝播させないため、`src/core/dom.ts` のparser境界で標準DOM型へ合わせています。`skipLibCheck` は依存ライブラリの宣言ファイルの検査を省略する設定で、本体・テストの型検査は有効です。

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

を生成します。ビルドスクリプト自身もesbuildで `node_modules/.cache/richhtml/build.mjs` に変換してからNode.jsで実行するため、Node.jsのネイティブTS実行機能や追加のTS実行ローダーは使いません。この中間ファイルはビルドごとに再生成し、配布物には含めません。

## Browser tests

```bash
npm run test:e2e
```

生成済み単一HTMLをPlaywrightで検証します。

Linuxでブラウザのシステム依存ライブラリも必要な場合は `npx playwright install --with-deps chromium` を使用します。`npm run test:e2e` の前に `npm run build` を実行してください。`npm run check` はビルドも含めて順番に実行します。

## 一括チェック

```bash
npm run check
```

概念的には以下を実行します。

```text
Type check
    |
    v
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

開発中はHTML、CSS、TypeScript、Profileを分離します。

```text
TypeScript modules
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
                   | build.ts
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
* 起動・貼り付け・解析・変換・表示・コピーでネットワーク通信を行わない
* ローカルHTMLとして直接起動可能

## package.json scripts

少なくとも以下を提供します。

```text
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run check
```

実際のコマンドラインオプションは実装時に決定します。

## `dist/` の扱い

単一HTMLは本プロジェクトの主要な配布成果物です。

Git管理せず、CI / Releaseで生成します。

現在のGitHub Actionsは `npm run check` の成功後、単一HTMLをartifactとして保存します。Releaseへの公開はまだ自動化していません。配布HTMLにはランタイム依存ライブラリのライセンスを `THIRD-PARTY-NOTICES.txt` から埋め込みます。依存関係を更新する際はこのファイルも確認してください。

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

本バージョンではMarkdownのみを出力対象とします。

<!-- markdownlint-disable-file MD038 -->
