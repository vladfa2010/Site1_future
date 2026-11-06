import { Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import HomePage from './pages/HomePage';
import ArticlePage from './pages/ArticlePage';
import CompanyPage from './pages/CompanyPage';
import TrendPage from './pages/TrendPage';
import StoryPage from './pages/StoryPage';
import PipelinePage from './pages/PipelinePage';
import TypePage from './pages/TypePage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* статьи: /novost/slug, /ideya/slug, /analitika/slug, /interesnoe/slug, /sobytie/slug */}
        <Route path="/:type/:slug" element={<ArticlePage />} />
        {/* узлы графа */}
        <Route path="/kompaniya/:slug" element={<CompanyPage />} />
        <Route path="/trend/:slug" element={<TrendPage />} />
        <Route path="/syuzhet/:slug" element={<StoryPage />} />
        <Route path="/portfolio" element={<PipelinePage />} />
        {/* архивы типов: /novost /ideya /analitika /interesnoe /sobytie */}
        <Route path="/:type" element={<TypePage />} />
        <Route path="*" element={<p className="text-zinc-400">Страница не найдена</p>} />
      </Routes>
    </Layout>
  );
}
