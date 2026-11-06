import { Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth';
import { isAdminRole } from './api';
import { Layout } from './components/Layout';
import LoginPage from './pages/LoginPage';
import ArticlesPage from './pages/ArticlesPage';
import ArticleEditPage from './pages/ArticleEditPage';
import CompaniesPage from './pages/CompaniesPage';
import CompanyEditPage from './pages/CompanyEditPage';
import TrendsPage from './pages/TrendsPage';
import TrendEditPage from './pages/TrendEditPage';
import DictionariesPage from './pages/IndustriesPage';
import TickersPage from './pages/TickersPage';
import StoriesPage from './pages/StoriesPage';
import StoryEditPage from './pages/StoryEditPage';
import MediaPage from './pages/MediaPage';
import RedirectsPage from './pages/RedirectsPage';
import UsersPage from './pages/UsersPage';
import StatsPage from './pages/StatsPage';

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminRole(user.role)) return <p className="p-6 text-red-600">Нужна роль admin или super_admin.</p>;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <RequireAdmin>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/articles" replace />} />
                  <Route path="/articles" element={<ArticlesPage />} />
                  <Route path="/articles/new" element={<ArticleEditPage />} />
                  <Route path="/articles/:type/:slug/edit" element={<ArticleEditPage />} />
                  <Route path="/companies" element={<CompaniesPage />} />
                  <Route path="/companies/:slug/edit" element={<CompanyEditPage />} />
                  <Route path="/trends" element={<TrendsPage />} />
                  <Route path="/trends/:id/edit" element={<TrendEditPage />} />
                  <Route path="/industries" element={<DictionariesPage />} />
                  <Route path="/tickers" element={<TickersPage />} />
                  <Route path="/stories" element={<StoriesPage />} />
                  <Route path="/stories/:id/edit" element={<StoryEditPage />} />
                  <Route path="/media" element={<MediaPage />} />
                  <Route path="/redirects" element={<RedirectsPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/stats" element={<StatsPage />} />
                </Routes>
              </Layout>
            </RequireAdmin>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
