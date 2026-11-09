// ⚠️ ЗАГЛУШКА: оригинальный файл не попал в git (.gitignore игнорировал любой data/).
// Замените на реальные служебные страницы (контент миграции).

export interface StaticPageData {
  slug: string;
  title: string;
  paragraphs: string[];
}

export const STATIC_PAGES: StaticPageData[] = [
  {
    slug: 'contacts',
    title: 'Контакты',
    paragraphs: [
      'По вопросам сотрудничества и редакции: используйте форму «Напишите нам».',
    ],
  },
  {
    slug: 'advertising',
    title: 'Реклама',
    paragraphs: [
      'Информация о рекламных размещениях появится в ближайшее время.',
    ],
  },
];
