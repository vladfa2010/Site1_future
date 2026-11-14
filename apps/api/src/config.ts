import 'dotenv/config';

// В production JWT_SECRET обязателен: короткие значения и известные дефолты
// (они публиковались в репо) отклоняем до старта сервера — fail fast вместо
// молчаливой работы с ключом, которым любой может подписать токен.
// Аудит 2026-11-14: guard раньше сравнивался с 'dev-secret-change-me', а дефолты
// в compose/Dockerfile были 'local-dev-secret-change-me' — проверка никогда не срабатывала.
const KNOWN_WEAK_SECRETS = new Set(['dev-secret-change-me', 'local-dev-secret-change-me']);
const envJwtSecret = process.env.JWT_SECRET ?? '';
if (process.env.NODE_ENV === 'production' && (envJwtSecret.length < 32 || KNOWN_WEAK_SECRETS.has(envJwtSecret))) {
  throw new Error('JWT_SECRET не задан, короче 32 символов или совпадает с дефолтом из репо (production). Задайте сильный секрет в env. Остановка.');
}

export const config = {
  port: Number(process.env.PORT ?? 1003), // фиксированный порт API: 1001 сайт / 1002 админка / 1003 API
  jwtSecret: envJwtSecret || 'dev-secret-change-me', // dev-fallback; в production выше — throw
  // DATABASE_URL читает напрямую packages/db (drizzle), здесь не дублируем
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
  moonshotTextModel: process.env.MOONSHOT_TEXT_MODEL ?? 'kimi-k3',
  // Векторный поиск: модель эмбеддингов (1024-мерная, под article_embeddings).
  // Пусто — поиск работает в FTS-режиме без векторной части.
  moonshotEmbedModel: process.env.MOONSHOT_EMBED_MODEL ?? '',
  // DeepSeek (OpenAI-совместимый, https://api.deepseek.com) — второй провайдер текстовой генерации.
  // Ключ также задаётся в админке (хранится в БД); env — fallback.
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  // CORS: доверенные origin'ы (через запятую)
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:1001,http://localhost:1002,http://localhost:5173,http://localhost:5174').split(','),
};
