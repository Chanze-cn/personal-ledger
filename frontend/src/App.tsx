import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import Docs from './pages/Docs';
import Login from './pages/Login';

const AppShell = lazy(() => import('./components/AppShell').then((mod) => ({ default: mod.AppShell })));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Bookkeep = lazy(() => import('./pages/Bookkeep'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Reports = lazy(() => import('./pages/Reports'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Categories = lazy(() => import('./pages/Categories'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Settings = lazy(() => import('./pages/Settings'));
const Recurring = lazy(() => import('./pages/Recurring'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <span className="h-8 w-8 animate-pulse rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500" />
        <span className="text-[12px] text-slate-400">正在加载…</span>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <span className="h-9 w-9 animate-pulse rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500" />
          <span className="text-[12px] text-slate-400">正在加载…</span>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <Page>
              <AppShell />
            </Page>
          </RequireAuth>
        }
      >
        <Route index element={<Page><Dashboard /></Page>} />
        <Route path="bookkeep" element={<Page><Bookkeep /></Page>} />
        <Route path="transactions" element={<Page><Transactions /></Page>} />
        <Route path="reports" element={<Page><Reports /></Page>} />
        <Route path="budgets" element={<Page><Budgets /></Page>} />
        <Route path="categories" element={<Page><Categories /></Page>} />
        <Route path="jobs" element={<Page><Jobs /></Page>} />
        <Route path="settings" element={<Page><Settings /></Page>} />
        <Route path="recurring" element={<Page><Recurring /></Page>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
