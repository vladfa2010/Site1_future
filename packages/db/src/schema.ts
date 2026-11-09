/**
 * Схема БД новой платформы инвестиционно.рф
 * Соответствует разделу 5 docs/newinvesticionno.md
 */
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  varchar,
  jsonb,
  uniqueIndex,
  primaryKey,
  index,
  vector,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ---------- Пользователи ----------

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull().default('reader'), // super_admin | admin | author | reader
  avatar: text('avatar'),                                             // эмодзи-иконка из пресета (10 шт)
  tariffId: integer('tariff_id').references(() => tariffPlans.id), // пейволл: тариф юзера
  tariffExpiresAt: timestamp('tariff_expires_at', { withTimezone: true }), // null = бессрочно (выдача админом)
  oldWpId: integer('old_wp_id'),                                    // миграция из Ultimate Member
  bio: text('bio'),                                                 // ТЗ-05: биография автора
  isBlocked: boolean('is_blocked').notNull().default(false),        // порт PULSE: блокировка (логин + requireRole)
  createdAt: createdAt(),
});

// ---------- Медиатека ----------

export const media = pgTable('media', {
  id: serial('id').primaryKey(),
  filePath: text('file_path').notNull(),
  alt: text('alt'),
  sourceUrl: text('source_url'), // откуда скачано (OG-источник)
  createdAt: createdAt(),
});

// ---------- Граф знаний ----------

export const industries = pgTable('industries', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // 'spacetech' → /industriya/spacetech/
  name: text('name').notNull(),
  description: text('description'),
  coverMediaId: integer('cover_media_id').references(() => media.id),
});

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // 'spacex' → /kompaniya/spacex/
  name: text('name').notNull(),
  oneLiner: text('one_liner'), // одна строка для карточки в портфеле
  description: text('description'),
  logoMediaId: integer('logo_media_id').references(() => media.id),
  website: text('website'),
  country: text('country'),
  foundedYear: integer('founded_year'),
  isPublic: boolean('is_public').notNull().default(false),
  coverMediaId: integer('cover_media_id').references(() => media.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const companyIndustries = pgTable(
  'company_industries',
  {
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    industryId: integer('industry_id')
      .notNull()
      .references(() => industries.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.industryId] })],
);

export const tickers = pgTable('tickers', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // 'spcx' → /tiker/spcx/
  symbol: text('symbol').notNull().unique(), // 'SPCX'
  companyId: integer('company_id').references(() => companies.id), // тикер ЗНАЕТ компанию
  exchange: text('exchange'), // MOEX, NASDAQ, NYSE...
  currency: text('currency'),
  instrument: text('instrument'), // stock | bond | crypto | etf
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const trends = pgTable('trends', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // 'kosmos' → /trend/kosmos/
  name: text('name').notNull(),
  description: text('description'), // лонгрид (бывший CPT trends)
  status: text('status').notNull().default('active'), // active | closed
  coverMediaId: integer('cover_media_id').references(() => media.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const trendIndustries = pgTable(
  'trend_industries',
  {
    trendId: integer('trend_id')
      .notNull()
      .references(() => trends.id, { onDelete: 'cascade' }),
    industryId: integer('industry_id')
      .notNull()
      .references(() => industries.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.trendId, t.industryId] })],
);

// Раунды и оценки (питчбук-лайт). Показываются ТОЛЬКО если внесены (раздел 4.3).
// Каждая цифра — с источником: доверие = ссылка.
export const fundingRounds = pgTable('funding_rounds', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  stage: text('stage'), // seed | series-a..e | ipo | grant | mna
  date: date('date'),
  amount: numeric('amount'), // сумма раунда, NUMERIC — деньги точные
  currency: text('currency').default('USD'),
  postMoneyValuation: numeric('post_money_valuation'), // для графика динамики
  investors: text('investors').array(), // MVP: просто список имён
  sourceUrl: text('source_url').notNull(), // обязателен
  status: text('status').default('completed'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const companyTrends = pgTable(
  'company_trends',
  {
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    trendId: integer('trend_id')
      .notNull()
      .references(() => trends.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.trendId] })],
);

export const stories = pgTable('stories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // 'spacex-ipo' → /syuzhet/spacex-ipo/
  name: text('name').notNull(),
  description: text('description'),
  primaryArticleId: integer('primary_article_id'), // FK → articles (ниже), добавляется в миграции
  status: text('status').notNull().default('active'),
  coverMediaId: integer('cover_media_id').references(() => media.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------- Контент ----------

export const ARTICLE_TYPES = ['novost', 'sobytie', 'analitika', 'interesnoe', 'ideya', 'video'] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export const articles = pgTable(
  'articles',
  {
    id: serial('id').primaryKey(),
    type: text('type').notNull(), // novost | sobytie | analitika | interesnoe | ideya
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    contentHtml: text('content_html').notNull(),
    excerpt: text('excerpt'),
    thesis: text('thesis'), // тезис идеи (2–3 предложения «почему это инвестиция»)
    sourceUrl: text('source_url'), // дедупликация (как в wptg)
    videoUrl: text('video_url'), // type=video: ссылка на внешнее видео (YouTube/RuTube/VK → embed)
    readingTime: integer('reading_time'), // минуты чтения, авто-пересчёт при сохранении (TODO 09); NULL = не рассчитано
    // ТЗ-03: счётчики просмотров (база + авто-бамп)
    viewsBaseOffset: integer('views_base_offset').notNull().default(0),
    viewsAutoBumpEnabled: boolean('views_auto_bump_enabled').notNull().default(false),
    viewsAutoBumpEveryHours: integer('views_auto_bump_every_hours'), // обязателен, если enabled (CHECK в миграции 0014)
    viewsAutoBumpMin: integer('views_auto_bump_min').notNull().default(1),
    viewsAutoBumpMax: integer('views_auto_bump_max').notNull().default(3),
    viewsBumpAccumulated: integer('views_bump_accumulated').notNull().default(0),
    viewsBumpLastAt: timestamp('views_bump_last_at', { withTimezone: true }),
    // ТЗ-04: агрегаты лайков/шеров (источник истины — article_likes / article_share_events)
    likesCount: integer('likes_count').notNull().default(0),
    sharesCount: integer('shares_count').notNull().default(0),
    coverMediaId: integer('cover_media_id').references(() => media.id),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }), // удаление аккаунта не трогает контент
    status: text('status').notNull().default('draft'), // draft | pending | published
    accessLevel: text('access_level').notNull().default('public'), // пейволл: public | auth | tariff
    accessTariffId: integer('access_tariff_id').references(() => tariffPlans.id), // для tariff-уровня
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    oldWpId: integer('old_wp_id'), // миграция: сверка и 1:1 URL
    oldWpType: text('old_wp_type'),
    // search_tsv (tsvector, russian) и эмбеддинги живут вне Drizzle-схемы:
    // FTS — сырой SQL в routes/search.ts, векторы — таблица article_embeddings ниже
  },
  (t) => [uniqueIndex('articles_type_slug_idx').on(t.type, t.slug)],
);

// Привязки статьи (many-to-many) — заменяют 9 таксономий WP

export const articleCompanies = pgTable(
  'article_companies',
  {
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.companyId] })],
);

export const articleTickers = pgTable(
  'article_tickers',
  {
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tickerId] })],
);

export const articleIndustries = pgTable(
  'article_industries',
  {
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    industryId: integer('industry_id')
      .notNull()
      .references(() => industries.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.industryId] })],
);

export const articleTrends = pgTable(
  'article_trends',
  {
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    trendId: integer('trend_id')
      .notNull()
      .references(() => trends.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.trendId] })],
);

export const articleStories = pgTable(
  'article_stories',
  {
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    storyId: integer('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false), // главная статья сюжета
    addedVia: text('added_via').notNull().default('manual'), // manual | vector
    sortOrder: integer('sort_order').notNull().default(0), // ТЗ-08: порядок серий в сюжете (индекс массива articleIds)
  },
  (t) => [primaryKey({ columns: [t.articleId, t.storyId] })],
);

export const articleDealPhases = pgTable(
  'article_deal_phases',
  {
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    phaseId: integer('phase_id')
      .notNull()
      .references(() => dealPhases.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.phaseId] })],
);

export const articleDealStages = pgTable(
  'article_deal_stages',
  {
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    stageId: integer('stage_id')
      .notNull()
      .references(() => dealStages.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.stageId] })],
);

// ---------- Словари ----------

export const dealStages = pgTable('deal_stages', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // pre-seed..ipo
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const dealPhases = pgTable('deal_phases', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // pipeline | portfel | arhiv
  name: text('name').notNull(),
});

export const projectStages = pgTable('project_stages', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

export const strategies = pgTable('strategies', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // dividendy | kupony | rost-ceny
  name: text('name').notNull(),
});

export const marketClasses = pgTable('market_classes', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // venchur | dolgovoj | ...
  name: text('name').notNull(),
});

// ---------- Вовлечение ----------

export const bookmarks = pgTable(
  'bookmarks',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.articleId] })],
);

// Избранное (фаза 1 ЛК): универсальная таблица — статьи, компании, тренды, сюжеты
export const FAVORITE_TYPES = ['article', 'company', 'trend', 'story'] as const;

export const favorites = pgTable(
  'favorites',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(), // article | company | trend | story
    entityId: integer('entity_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityType, t.entityId] })],
);

// Настройки уведомлений (email-дайджесты; TG/push — позже)
export const notificationSettings = pgTable('notification_settings', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  emailDaily: boolean('email_daily').notNull().default(true), // дайджест в конце дня
  emailWeekly: boolean('email_weekly').notNull().default(true), // недельный репорт
  lastDailySentAt: timestamp('last_daily_sent_at', { withTimezone: true }),
  lastWeeklySentAt: timestamp('last_weekly_sent_at', { withTimezone: true }),
});

// Привязка Telegram-аккаунта к юзеру (ЛС бота: chat_id)
export const tgBindings = pgTable('tg_bindings', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  chatId: text('chat_id').notNull().unique(),
  tgUsername: text('tg_username'),
  connectedAt: createdAt(),
});

// Одноразовые коды для deep-link привязки (/start <code>)
export const tgLinkCodes = pgTable('tg_link_codes', {
  code: text('code').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

// Тарифные планы (пейволл). Модель как в PULSE PAYMENTS.md §3.1: каталог
// с ценами/фичами; оплата подтянет тарифы отсюда же.
export const tariffPlans = pgTable('tariff_plans', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  priceMonthly: numeric('price_monthly').notNull().default('0'),
  priceYearly: numeric('price_yearly').notNull().default('0'),
  yearlyDiscount: integer('yearly_discount').notNull().default(20),
  features: text('features').notNull().default('{}'), // JSON: {telegram,email,aiSummary,push,earlyAccess,apiAccess,priority}
  isActive: boolean('is_active').notNull().default(true),
  comingSoonLabel: text('coming_soon_label'),
  sortOrder: integer('sort_order').notNull().default(0),
});

// Уровни доступа материалов
export const ACCESS_LEVELS = ['public', 'auth', 'tariff'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

// Планы подписок (админка тарифов, порт subscription_plans PULSE v3).
// Миграция 0016. Подписчики пока маппятся через tariff_plans.slug = subscription_plans.id
// (оплата не подключена — тариф выдаёт админ); с подключением оплаты мигрируем на прямую связь.
// timestamp без timezone — по DDL миграции (DEFAULT NOW()).
export const subscriptionPlans = pgTable('subscription_plans', {
  id: varchar('id', { length: 20 }).primaryKey(), // base | insider | ...
  name: varchar('name', { length: 50 }).notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
  billingFrequency: varchar('billing_frequency', { length: 20 }).notNull().default('monthly'), // weekly|monthly|quarterly|yearly
  yearlyDiscount: integer('yearly_discount').default(0),
  tagLimit: integer('tag_limit').notNull().default(0),
  portfolioLimit: integer('portfolio_limit').notNull().default(0),
  planLevel: integer('plan_level').notNull().default(0),
  features: jsonb('features').notNull().default({}), // {multi_portfolio: true, ...}
  // Доступность плана — СВОЙСТВО плана (не фича): на витрине какого продукта показывать
  // и где действует. 'invest' | 'pulse' (расширяемо). Пустой массив = нигде.
  products: text('products').array().notNull().default([]),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').default(true),
  isPopular: boolean('is_popular').notNull().default(false),
  comingSoonLabel: varchar('coming_soon_label', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

// Реестр фич (порт features_registry PULSE): драйвит чекбоксы в редакторе
// тарифов и подписи в Pricing. integration_status: pending | integrated | deprecated
export const featuresRegistry = pgTable('features_registry', {
  id: text('id').primaryKey(), // a-z0-9_
  label: text('label').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  integrationStatus: text('integration_status').notNull().default('pending'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(), // ticker | company | trend | industry
    entityId: integer('entity_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityType, t.entityId] })],
);

export const articleViews = pgTable(
  'article_views',
  {
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('article_views_article_idx').on(t.articleId, t.viewedAt),
    index('article_views_viewed_at_idx').on(t.viewedAt), // ТЗ-07: тренды «популярное сейчас» по времени
  ],
);

// ТЗ-04: лайки материалов (один юзер — один лайк; PK заменяет отдельный индекс)
export const articleLikes = pgTable(
  'article_likes',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.articleId] })],
);

// ТЗ-04: события шеров (канал: link | telegram | vk | ...; юзер nullable — анонимный шер)
export const articleShareEvents = pgTable(
  'article_share_events',
  {
    id: serial('id').primaryKey(),
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('article_share_events_article_id_idx').on(t.articleId)],
);

// ---------- SEO и переезд ----------

export const redirects = pgTable('redirects', {
  oldPath: text('old_path').primaryKey(),
  newPath: text('new_path').notNull(),
  httpCode: integer('http_code').notNull().default(301),
});

export const metaFields = pgTable(
  'meta_fields',
  {
    ownerType: text('owner_type').notNull(), // article | company | trend ...
    ownerId: integer('owner_id').notNull(),
    key: text('key').notNull(), // meta_description | canonical | ...
    value: text('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerType, t.ownerId, t.key] })],
);

// ---------- Векторный поиск ----------

export const articleEmbeddings = pgTable(
  'article_embeddings',
  {
    articleId: integer('article_id')
      .primaryKey()
      .references(() => articles.id, { onDelete: 'cascade' }),
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    model: text('model').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [index('article_embeddings_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops'))],
);

// ---------- Восстановление пароля (порт PULSE, миграция 0018) ----------
// 6-значный код, TTL 15 минут, одноразовый; старые коды юзера удаляются при новом запросе.
export const passwordResetCodes = pgTable('password_reset_codes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 6 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  used: boolean('used').notNull().default(false),
});
