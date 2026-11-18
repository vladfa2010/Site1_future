function stripDsml(text: string): string {
  return text
    .replace(/<｜｜DSML｜｜\s*calls>[\s\S]*?<｜｜DSML｜｜\s*\/calls>/g, '')
    .replace(/<｜｜DSML｜｜\s*calls>[\s\S]*$/g, '')
    .replace(/<｜｜DSML｜｜[^>]*>/g, '');
}
// кейс из репорта: сырой DSML без JSON
const raw1 = `<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="web_search">\n<｜｜DSML｜｜ parameter name="query" string="true">Dealroom "2025 wrapped" US venture</｜｜DSML｜｜/parameter>\n<｜｜DSML｜｜/invoke>\n<｜｜DSML｜｜/calls>`;
console.log('1 полный блок ->', JSON.stringify(stripDsml(raw1)));
// кейс: DSML перед нормальным JSON-ответом
const raw2 = `<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="web_search">\n<｜｜DSML｜｜ parameter name="query" string="true">test</｜｜DSML｜｜/parameter>\n<｜｜DSML｜｜/calls>\n{"title":"Ответ","html":"<p>Текст</p>"}`;
const s2 = stripDsml(raw2);
console.log('2 блок+JSON ->', s2.includes('"title"') ? 'JSON цел' : 'JSON ПОВРЕЖДЁН', '|', s2.slice(0, 40));
// кейс: оборванный блок без закрытия
const raw3 = `Начало ответа\n<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="web_search">\nхвост`;
console.log('3 оборванный ->', JSON.stringify(stripDsml(raw3)));
