import { Link } from 'react-router';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { PRIVACY_SECTIONS } from '../data/privacy';

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumbs items={[{ label: 'Политика конфиденциальности' }]} />
      <h1 className="text-3xl font-bold">Политика конфиденциальности</h1>
      <div className="mt-6 space-y-6">
        {PRIVACY_SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-lg font-bold">{s.title}</h2>
            <div className="mt-2 space-y-2">
              {s.paragraphs.map((p, i) => (
                <p key={i} className="leading-relaxed text-zinc-300">{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm text-zinc-500">
        Вопросы по обработке персональных данных: <Link to="/propose">напишите нам</Link>.
      </p>
    </article>
  );
}
