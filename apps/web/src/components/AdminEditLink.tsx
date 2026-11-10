import { useAuth } from '../auth';

/**
 * Кнопка «Редактировать» на страницах контента — только для admin/super_admin.
 * Прямой переход в админку на редактирование этой сущности (новая вкладка).
 * URL админки: env VITE_ADMIN_URL (prod-сборке задать на адрес админ-поддомена),
 * локально — http://localhost:1002.
 */
export function AdminEditLink({ to }: { to: string }) {
  const { user } = useAuth();
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return null;
  const adminUrl = (import.meta.env.VITE_ADMIN_URL as string | undefined) ?? 'http://localhost:1002';
  return (
    <a
      href={`${adminUrl}${to}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed right-4 top-16 z-40 rounded-full border border-[#beff00]/40 bg-black/80 px-4 py-1.5 text-sm font-semibold text-[#beff00] backdrop-blur transition-colors hover:bg-[#beff00] hover:text-black"
    >
      ✎ Редактировать
    </a>
  );
}
