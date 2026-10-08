import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { PageLoader, UiProvider } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import { DraftProvider } from './lib/draft';
import { BrandingPage } from './pages/BrandingPage';
import { BuilderPage } from './pages/builder/BuilderPage';
import { DevicesPage } from './pages/DevicesPage';
import { LoginPage } from './pages/LoginPage';
import { ResponsesPage } from './pages/ResponsesPage';
import { VersionsPage } from './pages/VersionsPage';

function Authed() {
  const { me, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!me) return <LoginPage />;
  return (
    <DraftProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<BuilderPage />} />
          <Route path="branding" element={<BrandingPage />} />
          <Route path="responses" element={<ResponsesPage />} />
          <Route path="versions" element={<VersionsPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DraftProvider>
  );
}

export function App() {
  return (
    <UiProvider>
      <AuthProvider>
        <Authed />
      </AuthProvider>
    </UiProvider>
  );
}
