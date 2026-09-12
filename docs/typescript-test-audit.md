# TypeScript移行時のテスト内容の確認

2026年9月12日、Node.js 24.21.0で確認。
比較元はTS移行直前の `f3940c09594960f53a3c04055b562dc9c6215c31`。
比較先は `c552a37` に、以下の入力復元を適用した作業ツリーです。

**テストソースが完全に同一という結論ではありません。既存の入力・期待値を維持し、旧JSテストでも新しいTS実装が合格することを確認しました。**

## 検証結果

| 対象 | 移行前のJSテスト → 現在のTS実装 | 現在のTSテスト → 現在のTS実装 |
| --- | ---: | ---: |
| fixture | 22件成功 | 22件成功 |
| ChatGPT正規化 | 27件成功 | 27件成功 |
| 診断 | 1件成功 | 1件成功 |
| Markdown renderer・URL | 52件成功 | 52件成功 |
| Profile engine・検証 | 29件成功 | 30件成功 |
| Source detection | 11件成功 | 11件成功 |
| 単体・fixture合計 | **142件成功** | **143件成功** |
| ブラウザ | **12件成功** | **12件成功** |

両方とも失敗・skip・ブラウザのflakyは0件です。単体テストのケース名を重複件数も含めて照合し、既存142件の削除がないことも確認しました。追加の1件は、本文正規化用にrole解決hookを指定したProfileの拒否です。

`test/fixtures/` はファイル一覧と全85ファイルの内容を比較し、バイト単位で一致しました。入力HTML、期待Markdown、期待診断JSON、出自metadataをすべて含みます。

## 旧テストを実行するための変更

ローカルGitから旧テストを一時ディレクトリへ取り出し、次の接続変更だけを適用しました。

1. 実装・ビルドpluginのimport拡張子を `.js` / `.mjs` から `.ts` へ変更。
2. ブラウザテスト内のesbuildのentry pointを `src/core/convert.ts` へ変更。
3. 2箇所の `chatgptNormalizeContent` 差し替えを、現在の `normalizeContent` map内へ移動。差し替える関数の本体は同一。

入力・期待値・matcher・旧テスト本体のその他の部分は変更していません。旧fixtureもGitから復元しています。実装ディレクトリは現在のTSソースへ接続し、配布HTMLも現在のソースから作り直しています。

この接続変更は生成される `legacy-connections.diff` ですべて確認できます。旧JSを旧実装に対して再実行した結果ではありません。

## 型注釈を除いた差分のレビュー

esbuildで両方のテストを同じ設定のJavaScriptへ変換し、型注釈・非nullアサーション・型だけのimport・整形の違いを除いて比較しました。import先の拡張子も統一しています。実行時のassertionを消すような正規化は行っていません。

残る差分を確認した結果は以下です。

| 差分 | テストへの影響 |
| --- | --- |
| `success(result)` / `conversation(result)` と `assert.ok` | 成功状態・文書種別の確認を追加。その後は元の値を検査し、値を加工しない |
| 中間変数の追加・変数名の変更 | 貼り付けデータ配列や抽出結果を変数へ移動。入力・期待値は同一 |
| hook差し替えのmap化 | 登録形式への追従。差し替える関数本体と検査内容は同一 |
| `NO_ITEMS` の検査 | `.error.code` の一致に加えて `ok: false` を検査する形へ変更 |
| Profile検証の追加1件 | 別の役割のhookを誤指定したケースを追加 |
| `test/type-contracts.ts` | コンパイル時の検査を追加。旧ランタイムテストを置き換えていない |

`diagnostics.test` は拡張子統一後のJavaScriptが完全一致しました。

調査中、既存の不正Profileテストで `p.detect.all = ['p']` が `p.detect = { any: ['p'], all: ['p'] }` に置き換わっていたことを確認しました。両方とも「allとanyの同時指定」ですが、既存の `any` の内容まで変わるため、元の操作へ戻しました。現在はTSの非nullアサーションだけを足した `p.detect!.all = ['p']` です。

追加の状態確認があるため、旧テストと新テストの合否条件が全く同一とは主張しません。差分のレビューと旧テストの再実行を合わせ、既存の入力・期待値が引き継がれていることを確認しています。

## 再実行

```bash
npm run typecheck
npm run audit:ts-migration
```

既存の依存関係・Playwrightブラウザと、比較元のローカルGitオブジェクトが必要です。Gitリモートとは通信しません。

`tmp/ts-migration-audit-*/` に次の証拠を保存し、最後にディレクトリを表示します。

- `original/test/`: Gitから取り出した旧テスト・fixture。
- `legacy/test/`: 接続変更だけを適用して実行した旧JSテスト。
- `legacy-connections.diff`: 旧テストに適用した全変更。
- `runtime.diff`: 型注釈を除いた移行前後の差分。追加のassertion helperも含む。
- `case-diff.json`: ケース名の差分。重複件数も比較。
- `*-unit.json` / `*-browser.json`: 両テスト群の実行結果。
- `summary.json` / `worktree.diff`: 比較元・比較先・件数と実行時の未コミット差分。

これは今回の移行確認用のコマンドで、通常の `npm run check` やCIには追加していません。
