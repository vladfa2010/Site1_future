import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  ImportedXmlComponent,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx";

import { fileURLToPath } from "node:url";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Usage: node create.js /absolute/path/output.docx");

const T = String.raw;
const reviewDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const imgDir = path.join(reviewDir, "site-review");

const palette = {
  dark: "1A1A1A",
  primary: "3A3A3A",
  light: "7A7A7A",
  border: "D8D8D8",
  fill: "F3F3EF",
  lime: "9DBB00",
  limeFill: "F0F5D8",
};

const font = {
  ascii: "Times New Roman",
  hAnsi: "Times New Roman",
  cs: "Times New Roman",
};

const run = (text, options = {}) => new TextRun({ text, font, size: 24, ...options });

const para = (children, options = {}) =>
  new Paragraph({
    spacing: { after: 160, line: 300 },
    ...options,
    children: Array.isArray(children) ? children : [children],
  });

const body = (text) => para(run(text));
const h1 = (text) =>
  para(run(text, { bold: true, size: 30, color: palette.dark }), {
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 140 },
  });
const h2 = (text) =>
  para(run(text, { bold: true, size: 26, color: palette.primary }), {
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
  });

const bullet = (text) =>
  para(run(text), { bullet: { level: 0 }, spacing: { after: 100, line: 280 } });

const numItem = (text) =>
  para(run(text), { numbering: { reference: "checklist", level: 0 }, spacing: { after: 100, line: 280 } });

const caption = (text) =>
  para(run(text, { italics: true, size: 20, color: palette.light }), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  });

const figure = (file, widthPx, heightPx, cap) =>
  para(
    new ImageRun({
      type: "jpg",
      data: fs.readFileSync(path.join(imgDir, file)),
      transformation: { width: widthPx, height: heightPx },
    }),
    { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 } },
  );

const cell = (children, options = {}) =>
  new TableCell({
    children: [Array.isArray(children) ? para(children) : para(run(children))],
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    ...options,
  });

const widths = [1100, 3000, 2300, 2626];
const hdrCell = (text) =>
  cell(text, {
    shading: { type: ShadingType.CLEAR, fill: palette.fill },
    width: { size: widths[0], type: WidthType.DXA },
  });
const bodyCell = (text, w) => cell(text, { width: { size: w, type: WidthType.DXA } });

const prio = (label, fill, color) =>
  cell([run(label, { bold: true, color })], {
    shading: { type: ShadingType.CLEAR, fill },
    width: { size: widths[0], type: WidthType.DXA },
  });

const issueRow = (label, labelFill, labelColor, problem, where, fix) =>
  new TableRow({
    children: [
      prio(label, labelFill, labelColor),
      bodyCell(problem, widths[1]),
      bodyCell(where, widths[2]),
      bodyCell(fix, widths[3]),
    ],
  });

const issueTable = new Table({
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  columnWidths: widths,
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        hdrCell("Приоритет"),
        cell("Проблема", { shading: { type: ShadingType.CLEAR, fill: palette.fill }, width: { size: widths[1], type: WidthType.DXA } }),
        cell("Где", { shading: { type: ShadingType.CLEAR, fill: palette.fill }, width: { size: widths[2], type: WidthType.DXA } }),
        cell("Что делать", { shading: { type: ShadingType.CLEAR, fill: palette.fill }, width: { size: widths[3], type: WidthType.DXA } }),
      ],
    }),
    issueRow("P0", "FDE8E8", "B3261E",
      "Страница статьи пустая: вместо текста — слово «Текст», блок «Поделиться» продублирован дважды подряд",
      "/analitika/ipo-spacex-razbor",
      "Залить реальный контент, убрать дубль блока шеринга, проверить шаблон статьи"),
    issueRow("P0", "FDE8E8", "B3261E",
      "Карточки без изображений: серые пустые плейсхолдеры в блоках «Кто мы и зачем» и «Тренды»",
      "Главная",
      "Добавить обложки всем карточкам либо ввести осмысленный skeleton/error-стейт"),
    issueRow("P0", "FDE8E8", "B3261E",
      "Отладочный текст «пернерс-тест zod4» виден на странице рядом с карточками аналитики",
      "Главная, блок аналитики",
      "Убрать тестовые артефакты из production-сборки"),
    issueRow("P1", "FFF4DC", "8A6D00",
      "HTML-мнемоник не декодируется: «SpaceX &#8211; лидер по количеству спутников»",
      "Лента событий",
      "Декодировать сущности при выводе заголовков (html_entity_decode)"),
    issueRow("P1", "FFF4DC", "8A6D00",
      "Битая иконка в лаймовой кнопке «Предложить новость или идею»",
      "Главная, подвал, статья",
      "Восстановить файл иконки или заменить на inline-SVG"),
    issueRow("P1", "FFF4DC", "8A6D00",
      "Кнопка «Редактировать» доступна на странице статьи — похоже, админский контрол не скрыт от гостей",
      "Страница статьи",
      "Показывать редакторскую кнопку только авторизованным редакторам"),
    issueRow("P2", "EEF3F6", "37474F",
      "Синяя кнопка Telegram-бота выпадает из чёрно-лаймовой палитры",
      "Главная, блок «Дайджесты»",
      "Привести к фирменному стилю (лайм/призрачная) либо осознанно закрепить как исключение"),
    issueRow("P2", "EEF3F6", "37474F",
      "Дублирующиеся заголовки в ленте: «SpaceX — лидер по количеству спутников» встречается дважды с разными датами",
      "Лента событий",
      "Проверить дедупликацию материалов при публикации"),
    issueRow("P2", "EEF3F6", "37474F",
      "Серая подводка «Наш фокус внимания…» мельче и светлее капсового заголовка «ЛЕНТА СОБЫТИЙ» под ней — иерархия перевернута",
      "Главная, лента",
      "Сделать заголовок крупнее либо поменять их местами"),
  ],
});

const xmlEscape = (value) =>
  String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const tocEntries = [
  { title: "1. Резюме", level: 1, page: 2 },
  { title: "2. Что работает: сильные стороны стиля", level: 1, page: 2 },
  { title: "3. Проблемы и приоритеты правок", level: 1, page: 3 },
  { title: "4. Рекомендации по развитию визуального стиля", level: 1, page: 4 },
  { title: "5. Чек-лист перед запуском", level: 1, page: 5 },
];

const toc = (entries) => {
  const cached = entries
    .map(({ title: entryTitle, level, page }) => {
      const indent = Math.max(0, level - 1) * 360;
      return `<w:p><w:pPr><w:pStyle w:val="TOC${level}"/>
        <w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs>
        <w:ind w:left="${indent}"/></w:pPr>
        <w:r><w:t>${xmlEscape(entryTitle)}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>${page}</w:t></w:r></w:p>`;
    })
    .join("");
  return ImportedXmlComponent.fromXmlString(`<w:sdt xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:sdtPr><w:alias w:val="Содержание"/></w:sdtPr>
    <w:sdtContent>
      <w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/>
        <w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText>
        <w:fldChar w:fldCharType="separate"/></w:r></w:p>
      ${cached}
      <w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
    </w:sdtContent>
  </w:sdt>`).root[0];
};

const docTitle = T`UX/UI-разбор сайта «Инвестиционно.рф»`;

const children = [
  para(run(docTitle, { bold: true, size: 40, color: palette.dark }), {
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 240 },
  }),
  para(run(T`Визуальный стиль, найденные дефекты и приоритезированный список правок`, { size: 26, color: palette.primary }), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 480 },
  }),
  para(run(T`Дата обзора: 17 ноября 2026 г. Осмотрены: главная страница, лента событий, подвал, страница аналитики «SpaceX. Разбор IPO».`, { size: 22, color: palette.light, italics: true }), {
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({ children: [], pageBreakBefore: true }),

  h1("Содержание"),
  para(run(T`В Word обновите поле содержания (F9) для точных номеров страниц.`, { italics: true, size: 20, color: palette.light })),
  toc(tocEntries),

  h1("1. Резюме"),
  body(T`Концепция визуального стиля сайта сильная и цельная: тёмная «техно-футуристическая» тема с неоново-лаймовым акцентом точно передаёт позиционирование «про будущее» — роботы, ИИ, космос, стартапы. Палитра дисциплинирована, UI-язык современный.`),
  body(T`Однако текущее состояние подачи — сыроватое: страницы выглядят недоделанными (пустые карточки, заглушка вместо текста статьи), а видимые пользователю баги (отладочный текст, нерасшифрованные HTML-сущности, битые иконки) подрывают доверие к изданию сильнее, чем любые шрифтовые решения.`),
  body(T`Главный вывод: стилевой фундамент — оставить и развивать; перед запуском закрыть все дефекты уровня P0 и P1 из раздела 3.`),

  h1("2. Что работает: сильные стороны стиля"),
  bullet(T`Цельная концепция. Почти чёрный фон + лаймовый акцент — узнаваемый образ «медиа о будущем», прямое попадание в тематику.`),
  bullet(T`Дисциплина палитры. Лайм используется точечно: логотип, кнопки, метки «ТРЕНД», заголовки карточек. Визуальный шум отсутствует.`),
  bullet(T`Современный UI-язык. Скруглённые карточки, «пилюли»-кнопки, призрачные кнопки соцсетей, капсовые рубрики — актуальный tech/финтех-вокабуляр.`),
  bullet(T`Типографика и иерархия. Гротеск, понятная последовательность «рубрика → заголовок → лид»; лента событий с бейджами «Новость»/«Аналитика» и датами читается легко.`),
  bullet(T`Сетка и отступы. Ограниченная по ширине контентная колонка, ровные ряды карточек, воздух между блоками.`),
  figure("main-top.jpg", 600, 316, T`Рис. 1. Главная страница: тёмная тема, лаймовый акцент, карточки без обложек`),
  figure("main-feed.jpg", 600, 316, T`Рис. 2. Лента событий — лаконичная типографика; виден баг с HTML-сущностью`),

  h1("3. Проблемы и приоритеты правок"),
  body(T`Приоритеты: P0 — критично, блокирует запуск; P1 — важно, заметно портит впечатление; P2 — желательно, полировка.`),
  issueTable,
  figure("article.jpg", 600, 296, T`Рис. 3. Страница аналитики: контент-заглушка «Текст», продублированный блок «Поделиться», видимая кнопка «Редактировать»`),

  h1("4. Рекомендации по развитию визуального стиля"),
  h2("4.1. Доступность и читаемость"),
  bullet(T`Проверить контраст серых вторичных текстов на чёрном фоне (подводки, даты, метаданные) — по WCAG для основного текста нужно не менее 4.5:1.`),
  bullet(T`Не использовать лаймовый как цвет длинных текстовых фрагментов — только для акцентов и кликабельных элементов.`),
  h2("4.2. Состояния и отказоустойчивость"),
  bullet(T`Ввести аккуратный skeleton-лоадер и error-стейт для обложек карточек, чтобы недогруз изображения не превращался в серые прямоугольники.`),
  bullet(T`Единый набор иконок (сейчас одна битая) — лучше inline-SVG-спрайт в фирменных цветах.`),
  h2("4.3. Системность"),
  bullet(T`Зафиксировать дизайн-токены: палитру, радиусы скруглений, отступы, стили кнопок — чтобы новые страницы не «расползались» (уже виден разнобой в иерархии заголовков ленты).`),
  bullet(T`Исключения из палитры (синий Telegram) либо убрать, либо документировать как осознанное отклонение.`),

  h1("5. Чек-лист перед запуском"),
  numItem(T`Статьи и аналитика отображают полный текст, без заглушек и дублей блоков.`),
  numItem(T`Все карточки имеют обложки или корректный fallback.`),
  numItem(T`Ни на одной странице нет отладочных и тестовых строк.`),
  numItem(T`Заголовки в ленте рендерятся без HTML-сущностей; дедупликация новостей работает.`),
  numItem(T`Все иконки и изображения загружаются (проверить в консоли на предмет 404).`),
  numItem(T`Редакторские контролы скрыты от гостей.`),
  numItem(T`Контраст текста соответствует WCAG AA.`),
  numItem(T`Проверка на мобильных разрешениях: карточки, лента, кнопки шеринга.`),
];

const doc = new Document({
  features: { updateFields: true },
  styles: {
    paragraphStyles: [
      {
        id: "TOC1",
        name: "TOC 1",
        basedOn: "Normal",
        run: { size: 24, font },
        paragraph: { spacing: { after: 120, line: 280 } },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "checklist",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.25) } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      headers: {
        default: new Header({
          children: [para(run(docTitle, { size: 18, color: palette.light }), { alignment: AlignmentType.RIGHT })],
        }),
      },
      footers: {
        default: new Footer({
          children: [para(new TextRun({ children: [PageNumber.CURRENT] }), { alignment: AlignmentType.CENTER })],
        }),
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
