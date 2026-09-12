import { readPaste } from './paste.ts';
import type { convert as convertHtml } from '../core/convert.ts';
import type { Profile } from '../core/profile.ts';

export function setupUI(document: Document, navigator: Navigator, convert: typeof convertHtml, profiles: Profile[]) {
  // These IDs and element types are fixed by index.template.html.
  const byId = (id: string) => document.getElementById(id)!;
  const input = byId('input') as HTMLTextAreaElement;
  const output = byId('output') as HTMLTextAreaElement;
  const method = byId('input-method') as HTMLSelectElement;
  const mode = byId('mode') as HTMLSelectElement;
  const copy = byId('copy') as HTMLButtonElement;
  let revision = 0;
  const clearResult = () => {
    revision++;
    output.value = '';
    copy.disabled = true;
    for (const id of ['detected', 'conversion-error', 'warnings', 'copy-status', 'input-error']) byId(id).textContent = '';
  };
  input.addEventListener('paste', event => {
    const result = readPaste(event, method.value);
    if (!result.ok) { byId('input-error').textContent = result.message; return; }
    clearResult();
    input.value = result.value;
  });
  input.addEventListener('input', clearResult);
  method.addEventListener('change', () => {
    clearResult();
    input.value = '';
    input.readOnly = method.value === 'rich';
    byId('input-help').textContent = input.readOnly
      ? 'Webページを範囲選択してコピーし、入力欄へ貼り付けてください。HTMLを含むコピーを受け付けます。'
      : 'Developer Toolsの「Copy element」などで取得したHTMLソースを貼り付けてください。手入力・編集もできます。';
  });
  mode.addEventListener('change', clearResult);
  byId('convert').addEventListener('click', () => {
    clearResult();
    const result = convert(input.value, { mode: mode.value });
    if (result.profileId) byId('detected').textContent = `採用Profile: ${profiles.find(profile => profile.id === result.profileId)?.name ?? result.profileId}`;
    for (const warning of result.warnings) {
      const li = document.createElement('li');
      li.textContent = `${warning.itemIndex === undefined ? '' : `メッセージ${warning.itemIndex + 1}: `}${warning.message}`;
      byId('warnings').append(li);
    }
    if (!result.ok) { byId('conversion-error').textContent = result.error.message; return; }
    output.value = result.markdown;
    copy.disabled = !result.markdown;
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
