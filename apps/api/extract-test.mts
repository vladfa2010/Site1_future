function extractFirstJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return raw.slice(start, i + 1); }
  }
  return null;
}
// кейс бага: JSON + текст со скобками после
const raw1 = 'Вот результат:\n{"report":[{"claim":"a {x}","status":"confirmed","comment":"b"}],"summary":"s"}\nНадеюсь, это поможет {вам}.';
const j1 = extractFirstJson(raw1)!;
console.log('1 ok:', JSON.parse(j1).summary === 's');
// markdown-обёртка
const raw2 = '```json\n{"a":1}\n```\nпостскриптум }';
console.log('2 ok:', JSON.parse(extractFirstJson(raw2)!).a === 1);
// скобки внутри строки JSON
const raw3 = '{"html":"<p>шаблон {placeholder}</p>"} trailing {';
console.log('3 ok:', JSON.parse(extractFirstJson(raw3)!).html.includes('{placeholder}'));
