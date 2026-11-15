import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router';
import { isApiError } from './api/errors';
import { AuthProvider } from './auth/AuthProvider';
import { PublicOnly, RequireAuth } from './auth/RouteGuards';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProjectPage } from './pages/ProjectPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { RegisterPage } from './pages/RegisterPage';

export const routes = [
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: '/projects', element: <ProjectsPage /> },
          { path: '/projects/:projectId', element: <ProjectPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Erros 4xx são definitivos; só repete falhas de rede/5xx.
        retry: (count, error) =>
          count < 2 && !(isApiError(error) && error.status >= 400 && error.status < 500),
      },
    },
  });
}

/** Providers compartilhados entre a aplicação e os testes. */
export function AppProviders({
  client,
  children,
}: {
  client: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

export function App() {
  const [client] = useState(createQueryClient);
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <AppProviders client={client}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

export { createMemoryRouter };
