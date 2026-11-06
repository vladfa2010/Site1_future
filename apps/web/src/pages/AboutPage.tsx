import { ABOUT_PAGES } from '../data/about';
import { Breadcrumbs } from '../components/Breadcrumbs';

export default function AboutPage({ slug }: { slug: string }) {
  const page = ABOUT_PAGES.find((p) => p.slug === slug);

  if (!page) return <p className="text-zinc-400">Страница не найдена</p>;

  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumbs items={[{ label: page.title }]} />
      <h1 className="text-3xl font-bold">{page.title}</h1>
      <div className="mt-6 space-y-4 leading-relaxed">
        {page.paragraphs.map((p, i) => (
          <p key={i} className="text-zinc-300">{p}</p>
        ))}
      </div>
    </article>
  );
}
