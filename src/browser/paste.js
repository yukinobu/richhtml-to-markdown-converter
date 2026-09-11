export function readPaste(event, method) {
  event.preventDefault();
  const mime = method === 'rich' ? 'text/html' : 'text/plain';
  const value = event.clipboardData?.getData(mime) ?? '';
  if (!value.trim()) return {
    ok: false,
    message: method === 'rich'
      ? 'HTMLを含まないコピーです。Developer ToolsでコピーしたHTMLは「HTMLソース」入力へ切り替えて貼り付けてください。'
      : '貼り付けに空でないテキストが含まれていません。HTMLソースをコピーしてください。',
  };
  return { ok: true, value };
}
