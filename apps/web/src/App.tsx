import { Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import HomePage from './pages/HomePage';
import ArticlePage from './pages/ArticlePage';
import CompanyPage from './pages/CompanyPage';
import TrendPage from './pages/TrendPage';
import StoryPage from './pages/StoryPage';
import PipelinePage from './pages/PipelinePage';
import TypePage from './pages/TypePage';
import AuthModalOpener from './pages/AuthModalOpener';
import AboutPage from './pages/AboutPage';
import ProposePage from './pages/ProposePage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import CabinetPage from './pages/CabinetPage';
import AuthorPage from './pages/AuthorPage';
import PricingPage from './pages/PricingPage';
import SearchPage from './pages/SearchPage';
import FeedPage from './pages/FeedPage';
import StaticPage from './pages/StaticPage';
import { RedirectHandler } from './components/RedirectHandler';

export default function App() {
  return (
    <RedirectHandler>
      <Layout>
        <Routes>
        <Route path="/" element={<HomePage />} />
        {/* статьи: /novost/slug, /ideya/slug, /analitika/slug, /interesnoe/slug, /sobytie/slug */}
        <Route path="/:type/:slug" element={<ArticlePage />} />
        {/* ТЗ-05: публичная страница автора (статический сегмент ранжируется выше /:type/:slug) */}
        <Route path="/avtor/:id" element={<AuthorPage />} />
        {/* узлы графа */}
        <Route path="/kompaniya/:slug" element={<CompanyPage />} />
        <Route path="/trend/:slug" element={<TrendPage />} />
        <Route path="/syuzhet/:slug" element={<StoryPage />} />
        <Route path="/portfolio" element={<PipelinePage />} />
        <Route path="/login" element={<AuthModalOpener mode="login" />} />
        <Route path="/register" element={<AuthModalOpener mode="register" />} />
        <Route path="/propose" element={<ProposePage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/cabinet" element={<CabinetPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/feed" element={<FeedPage />} />
        {/* служебные страницы донора (мигрированный контент) */}
        <Route path="/kak-tut-vsyo-ustroeno" element={<StaticPage />} />
        <Route path="/portfel-kak-ispolzovat" element={<StaticPage />} />
        <Route path="/paypleyn-kak-ispolzovat" element={<StaticPage />} />
        <Route path="/arhiv-sdelok-kak-ispolzovat-razdel" element={<StaticPage />} />
        <Route path="/trendy-chto-ehto-takoe" element={<StaticPage />} />
        {/* «кто мы и зачем» — как у донора */}
        <Route path="/o-nas" element={<AboutPage slug="o-nas" />} />
        <Route path="/zachem" element={<AboutPage slug="zachem" />} />
        <Route path="/smysl" element={<AboutPage slug="smysl" />} />
        <Route path="/missiya" element={<AboutPage slug="missiya" />} />
        {/* архивы типов: /novost /ideya /analitika /interesnoe /sobytie */}
        <Route path="/:type" element={<TypePage />} />
        <Route path="*" element={<p className="text-zinc-400">Страница не найдена</p>} />
      </Routes>
      </Layout>
    </RedirectHandler>
  );
}
