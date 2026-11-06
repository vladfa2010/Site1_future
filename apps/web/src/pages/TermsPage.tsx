import { Breadcrumbs } from '../components/Breadcrumbs';
import { TERMS_SECTIONS } from '../data/terms';

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumbs items={[{ label: 'Условия использования' }]} />
      <h1 className="text-3xl font-bold">Условия использования</h1>
      <div className="mt-6 space-y-6">
        {TERMS_SECTIONS.map((s) => (
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
    </article>
  );
}
