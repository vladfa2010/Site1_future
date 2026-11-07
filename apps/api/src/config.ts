import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://localhost:5432/newinvest',
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@local',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin123',
  // Генерация обложек через Moonshot/Kimi Images API.
  // ВАЖНО: имена MOONSHOT_* — НЕ KIMI_*, т.к. рантайм Kimi Work экспортирует
  // свои KIMI_API_KEY/KIMI_BASE_URL (agent-gw) во все дочерние процессы.
  // Без ключа — mock-режим (SVG-заглушка).
  moonshotApiKey: process.env.MOONSHOT_API_KEY ?? '',
  moonshotBaseUrl: process.env.MOONSHOT_BASE_URL ?? 'https://api.moonshot.ai/v1',
  moonshotImageModel: process.env.MOONSHOT_IMAGE_MODEL ?? 'kimi-image-preview',
  // Текстовая генерация (лиды/выжимки) — Chat Completions
  moonshotTextModel: process.env.MOONSHOT_TEXT_MODEL ?? 'kimi-k2-0711-preview',
  // Векторный поиск: модель эмбеддингов (1024-мерная, под article_embeddings).
  // Пусто — поиск работает в FTS-режиме без векторной части.
  moonshotEmbedModel: process.env.MOONSHOT_EMBED_MODEL ?? '',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  // CORS: доверенные origin'ы (через запятую)
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174').split(','),
};
