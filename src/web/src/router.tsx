import { createRootRouteWithContext, createRoute, createRouter } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { AuthGate } from './auth';
import { AppFrame } from './components/AppFrame';
import { DashboardPage } from './pages/DashboardPage';
import { RequisitionsPage } from './pages/RequisitionsPage';
import { RequisitionDetailPage } from './pages/RequisitionDetailPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { CandidateDetailPage } from './pages/CandidateDetailPage';
import { ApplicationDetailPage } from './pages/ApplicationDetailPage';
import { TasksPage } from './pages/TasksPage';
import { AdminPage } from './pages/AdminPage';
import { NotFoundPage } from './pages/NotFoundPage';

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <AuthGate><AppFrame /></AuthGate>,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: DashboardPage });
const requisitionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/requisitions', component: RequisitionsPage });
const requisitionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/requisitions/$id', component: function RequisitionRoute() { const { id } = requisitionRoute.useParams(); return <RequisitionDetailPage id={id} />; } });
const candidatesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/candidates', component: CandidatesPage });
const candidateRoute = createRoute({ getParentRoute: () => rootRoute, path: '/candidates/$id', component: function CandidateRoute() { const { id } = candidateRoute.useParams(); return <CandidateDetailPage id={id} />; } });
const applicationRoute = createRoute({ getParentRoute: () => rootRoute, path: '/applications/$id', component: function ApplicationRoute() { const { id } = applicationRoute.useParams(); return <ApplicationDetailPage id={id} />; } });
const tasksRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tasks', component: TasksPage });
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin', component: AdminPage });

const routeTree = rootRoute.addChildren([indexRoute, requisitionsRoute, requisitionRoute, candidatesRoute, candidateRoute, applicationRoute, tasksRoute, adminRoute]);

export const router = createRouter({ routeTree, context: { queryClient: undefined! }, defaultPreload: 'intent', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
