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
import DictionariesPage from './pages/DictionariesPage';

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
                  <Route path="/dictionaries" element={<DictionariesPage />} />
                </Routes>
              </Layout>
            </RequireAdmin>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
