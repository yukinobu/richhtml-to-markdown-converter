import { readPaste } from './paste.ts';
import type { convert as convertHtml } from '../core/convert.ts';
import type { Profile } from '../core/profile.ts';
import type { ConvertResult } from '../core/document-model.ts';
import { createChatgptCollection, formatRange } from '../core/chatgpt-collection.ts';

export function setupUI(document: Document, navigator: Navigator, convert: typeof convertHtml, profiles: Profile[]) {
  // These IDs and element types are fixed by index.template.html.
  const byId = (id: string) => document.getElementById(id)!;
  const input = byId('input') as HTMLTextAreaElement;
  const output = byId('output') as HTMLTextAreaElement;
  const method = byId('input-method') as HTMLSelectElement;
  const mode = byId('mode') as HTMLSelectElement;
  const copy = byId('copy') as HTMLButtonElement;
  const workflow = byId('workflow') as HTMLSelectElement;
  const collection = createChatgptCollection();
  const collecting = () => workflow.value === 'collect';
  let singleMode = mode.value;
  let revision = 0;
  const clearResult = () => {
    revision++;
    output.value = '';
    copy.disabled = true;
    for (const id of ['detected', 'conversion-error', 'warnings', 'copy-status', 'input-error']) byId(id).textContent = '';
  };
  const showResult = (result: ConvertResult) => {
    clearResult();
    if (result.profileId) byId('detected').textContent = `採用Profile: ${profiles.find(profile => profile.id === result.profileId)?.name ?? result.profileId}`;
    for (const warning of result.warnings) {
      const li = document.createElement('li');
      li.textContent = `${warning.itemIndex === undefined ? '' : `メッセージ${warning.itemIndex + 1}: `}${warning.message}`;
      byId('warnings').append(li);
    }
    if (!result.ok) { byId('conversion-error').textContent = result.error.message; return; }
    output.value = result.markdown;
    copy.disabled = !result.markdown;
  };
  const showCollection = () => {
    const snapshot = collection.snapshot;
    byId('collection-count').textContent = `取得済み：${snapshot?.count ?? 0}件`;
    byId('collection-ranges').textContent = snapshot ? `取得範囲：${snapshot.ranges.map(formatRange).join('、')}` : '';
    byId('collection-missing').textContent = snapshot
      ? snapshot.gaps.length ? `未取得：${snapshot.gaps.map(formatRange).join('、')}。前後の発言を手掛かりに、間の部分をコピーしてください。` : '取得した範囲内に欠番はありません。'
      : '最初のHTMLを貼り付けてください。';
    byId('collection-start').textContent = snapshot?.possibleMissingStart ? '会話の先頭が含まれていない可能性があります。先頭付近もコピーしてください。' : '';
    byId('collection-gaps').replaceChildren();
    for (const gap of snapshot?.gaps ?? []) {
      const li = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = `未取得：${formatRange(gap)}`;
      li.append(title);
      for (const text of [`直前 — ${gap.before}`, `直後 — ${gap.after}`]) {
        const p = document.createElement('p');
        p.textContent = text;
        li.append(p);
      }
      byId('collection-gaps').append(li);
    }
    if (snapshot) showResult(snapshot.result);
    else clearResult();
  };
  const addInput = () => {
    const result = collection.add(input.value);
    byId('input-error').textContent = '';
    byId('copy-status').textContent = '';
    if (!result.ok) {
      byId('conversion-error').textContent = result.message;
      byId('collection-batch').textContent = '今回の入力は追加していません。取得済みの内容は保持しています。';
      return;
    }
    showCollection();
    byId('collection-batch').textContent = `今回の追加：新規${result.added}件、重複${result.duplicates}件`;
  };
  input.addEventListener('paste', event => {
    const result = readPaste(event, method.value);
    if (!result.ok) { byId('input-error').textContent = result.message; return; }
    if (!collecting()) clearResult();
    input.value = result.value;
    if (collecting()) addInput();
  });
  input.addEventListener('input', () => {
    if (!collecting()) { clearResult(); return; }
    byId('input-error').textContent = '';
    byId('conversion-error').textContent = '';
    byId('collection-batch').textContent = '入力を編集中です。「入力を追加」で取り込みます。Markdownは取得済みの内容です。';
  });
  method.addEventListener('change', () => {
    if (collecting()) {
      byId('collection-batch').textContent = '';
      showCollection();
    }
    else clearResult();
    input.value = '';
    input.readOnly = method.value === 'rich';
    byId('input-help').textContent = input.readOnly
      ? 'Webページを範囲選択してコピーし、入力欄へ貼り付けてください。HTMLを含むコピーを受け付けます。'
      : 'Developer Toolsの「Copy element」などで取得したHTMLソースを貼り付けてください。手入力・編集もできます。';
  });
  mode.addEventListener('change', clearResult);
  workflow.addEventListener('change', () => {
    clearResult();
    input.value = '';
    if (collecting()) { singleMode = mode.value; mode.value = 'chatgpt-conversation'; }
    else mode.value = singleMode;
    mode.disabled = collecting();
    byId('collection').hidden = !collecting();
    byId('convert').textContent = collecting() ? '入力を追加' : 'Convert';
    output.placeholder = collecting() ? 'HTMLを貼り付けると取得済みの会話が表示されます。' : 'Convertを押すと結果が表示されます。';
    byId('collection-batch').textContent = '';
    if (collecting()) showCollection();
  });
  byId('reset-collection').addEventListener('click', () => {
    collection.reset();
    input.value = '';
    byId('collection-batch').textContent = '';
    showCollection();
    input.focus();
  });
  byId('convert').addEventListener('click', () => {
    if (collecting()) addInput();
    else showResult(convert(input.value, { mode: mode.value }));
  });
  copy.addEventListener('click', async () => {
    const currentRevision = revision;
    const markdown = output.value;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(markdown);
      if (revision === currentRevision) byId('copy-status').textContent = 'Markdownをコピーしました。';
    } catch {
      if (revision !== currentRevision) return;
      output.focus();
      output.select();
      byId('copy-status').textContent = '自動コピーを利用できません。選択された出力をCtrl+C / ⌘Cでコピーしてください。';
    }
  });
}
