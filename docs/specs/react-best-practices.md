Frontend Architectural Specification
Project Geometrix: apps/client
Field Value
Project Geometrix Frontend
Version FINAL (2.0)
Status APPROVED FOR BUILD
Framework React 19 + Vite
State TanStack Query + Zustand
Styling Tailwind CSS (Logical Properties)

1. Executive Summary
   1.1 The Philosophy
   This specification treats the frontend as a distributed system running in the browser. We reject the false dichotomy between "Move Fast" and "Build Right."

We achieve this through 5 Core Pillars:

Pillar Description
Feature-First Architecture Organize by domain, not by file type
State Separation Server State (TanStack Query) vs Client State (Zustand)
Native Performance Lazy loading, code splitting, optimistic updates
Internationalization RTL/LTR support at the core, not as an afterthought
Type-Safe Integration Shared Zod schemas validate forms AND API
1.2 Key Architectural Decisions
Decision Rationale
No Redux Too much boilerplate. TanStack Query handles server state; Zustand handles UI state.
No CSS-in-JS Runtime overhead. Tailwind compiles to static CSS.
No Barrel Exports index.ts re-exports hurt tree-shaking. Import directly.
Feature Isolation Each feature has its own error boundary. A crash in Dashboard doesn't break Auth.
Shared Contracts Zod schemas from packages/contract validate both frontend forms and backend API. 2. Directory Structure
2.1 The Feature-First Layout
Organize by Domain, not by file type. If you delete the auth feature, you delete one folder—not 50 files scattered across the app.

text

apps/client/src/
├── app/ # GLOBAL APPLICATION SETUP
│ ├── providers/ # React Context Providers (Composed)
│ │ ├── index.tsx # Master Provider (composes all)
│ │ ├── query.tsx # TanStack Query Client
│ │ ├── i18n.tsx # Internationalization + RTL
│ │ ├── theme.tsx # Dark/Light Mode
│ │ └── error.tsx # Global Error Boundary
│ ├── router.tsx # Lazy-loaded route definitions
│ └── layout.tsx # Root layout (Shell, Navigation)

├── components/ # SHARED "DUMB" COMPONENTS
│ ├── ui/ # Primitives (Button, Input, Modal)
│ ├── feedback/ # Toast, Spinner, Skeleton
│ └── layout/ # Container, Stack, Grid
│ # Rule: No business logic. No API calls. Pure presentation.

├── features/ # DOMAIN LOGIC (The Core)
│ ├── auth/
│ │ ├── components/ # LoginForm, RegisterForm, ProtectedRoute
│ │ ├── hooks/ # useAuth, useLogin, useLogout
│ │ ├── store/ # Auth Zustand slice (persisted)
│ │ ├── api/ # TanStack Query mutations
│ │ ├── types/ # Feature-specific types
│ │ └── index.tsx # Feature entry (with ErrorBoundary)
│ │
│ ├── dashboard/
│ │ ├── components/
│ │ ├── widgets/ # DashboardCard, StatsWidget
│ │ ├── hooks/
│ │ └── pages/ # DashboardPage (lazy-loaded)
│ │
│ └── projects/
│ ├── components/
│ ├── hooks/ # useProjects, useProject, useCreateProject
│ ├── api/ # Query/Mutation definitions
│ └── pages/

├── hooks/ # GLOBAL UTILITY HOOKS
│ ├── useDebounce.ts
│ ├── useMediaQuery.ts
│ ├── useLocalStorage.ts
│ └── useOnClickOutside.ts

├── lib/ # LIBRARY CONFIGURATIONS
│ ├── api.ts # Hono RPC Client (Type-Safe)
│ ├── i18n.ts # i18next configuration
│ ├── utils.ts # cn(), formatDate(), etc.
│ └── constants.ts # App-wide constants

├── stores/ # GLOBAL CLIENT STATE (Zustand)
│ ├── index.ts # Combined store
│ └── slices/
│ ├── ui.slice.ts # Sidebar, modals, theme
│ └── preferences.slice.ts # User preferences

├── types/ # GLOBAL TYPES
│ ├── env.d.ts # Vite environment types
│ └── global.d.ts # Global augmentations

├── styles/ # GLOBAL STYLES
│ └── globals.css # Tailwind imports, CSS variables

└── main.tsx # Application entry point
2.2 Feature Module Structure
Every feature follows the same internal structure:

text

features/{feature-name}/
├── components/ # UI components specific to this feature
├── hooks/ # Custom hooks (often wrapping TanStack Query)
├── api/ # Query/Mutation definitions
├── store/ # Zustand slice (if feature needs local state)
├── pages/ # Route-level components (lazy-loaded)
├── utils/ # Feature-specific utilities
├── types/ # Feature-specific types
└── index.tsx # Public API + Error Boundary wrapper 3. State Management Strategy
3.1 The Golden Rule
Server State and Client State are fundamentally different. Never mix them.

Type Tool Examples
Server State TanStack Query Users, Projects, API data
Client State Zustand Sidebar open, theme, filters
Form State React Hook Form Input values, validation errors
URL State React Router Current page, search params
3.2 Server State: TanStack Query
3.2.1 Query Hook Pattern
TypeScript

// features/projects/hooks/useProjects.ts
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { client } from '@/lib/api';
import { projectKeys } from '../api/keys';

// Standard Query (shows loading state)
export const useProjects = () => {
return useQuery({
queryKey: projectKeys.all,
queryFn: async () => {
const res = await client.v1.projects.$get();
if (!res.ok) throw new Error('Failed to fetch projects');
return res.json();
},
staleTime: 5 _ 60 _ 1000, // 5 minutes
});
};

// Suspense Query (for Suspense boundaries)
export const useProjectsSuspense = () => {
return useSuspenseQuery({
queryKey: projectKeys.all,
queryFn: async () => {
const res = await client.v1.projects.$get();
return res.json();
},
});
};

// Single Project Query
export const useProject = (id: string) => {
return useQuery({
queryKey: projectKeys.detail(id),
queryFn: async () => {
const res = await client.v1.projects[':id'].$get({ param: { id } });
return res.json();
},
enabled: !!id, // Only fetch if ID exists
});
};
3.2.2 Query Key Factory Pattern
TypeScript

// features/projects/api/keys.ts
export const projectKeys = {
all: ['projects'] as const,
lists: () => [...projectKeys.all, 'list'] as const,
list: (filters: ProjectFilters) => [...projectKeys.lists(), filters] as const,
details: () => [...projectKeys.all, 'detail'] as const,
detail: (id: string) => [...projectKeys.details(), id] as const,
};
3.2.3 Mutation with Optimistic Updates
TypeScript

// features/projects/hooks/useCreateProject.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '@/lib/api';
import { projectKeys } from '../api/keys';
import type { Project, CreateProjectInput } from '@geometrix/contract';

export const useCreateProject = () => {
const queryClient = useQueryClient();

return useMutation({
mutationFn: async (input: CreateProjectInput) => {
const res = await client.v1.projects.$post({ json: input });
if (!res.ok) throw new Error('Failed to create project');
return res.json();
},

    // Optimistic Update
    onMutate: async (newProject) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: projectKeys.all });

      // Snapshot previous value
      const previous = queryClient.getQueryData<Project[]>(projectKeys.all);

      // Optimistically update
      queryClient.setQueryData<Project[]>(projectKeys.all, (old = []) => [
        ...old,
        { ...newProject, id: 'temp-' + Date.now(), createdAt: new Date() },
      ]);

      return { previous };
    },

    // Rollback on error
    onError: (err, _, context) => {
      if (context?.previous) {
        queryClient.setQueryData(projectKeys.all, context.previous);
      }
    },

    // Refetch after success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },

});
};
3.3 Client State: Zustand
3.3.1 The Slice Pattern
TypeScript

// stores/slices/ui.slice.ts
import { StateCreator } from 'zustand';

export interface UISlice {
isSidebarOpen: boolean;
isMobileMenuOpen: boolean;
activeModal: string | null;
toggleSidebar: () => void;
openModal: (id: string) => void;
closeModal: () => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
isSidebarOpen: true,
isMobileMenuOpen: false,
activeModal: null,
toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
openModal: (id) => set({ activeModal: id }),
closeModal: () => set({ activeModal: null }),
});
3.3.2 Auth Slice with Persistence
TypeScript

// features/auth/store/auth.slice.ts
import { StateCreator } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@geometrix/contract';

export interface AuthSlice {
user: User | null;
token: string | null;
isAuthenticated: boolean;
setAuth: (user: User, token: string) => void;
logout: () => void;
}

export const createAuthSlice: StateCreator<
AuthSlice,
[],
[['zustand/persist', unknown]]

> = persist(
> (set) => ({

    user: null,
    token: null,
    isAuthenticated: false,
    setAuth: (user, token) => set({ user, token, isAuthenticated: true }),
    logout: () => set({ user: null, token: null, isAuthenticated: false }),

}),
{
name: 'geometrix-auth',
partialize: (state) => ({ token: state.token }), // Only persist token
}
);
3.3.3 Combined Store
TypeScript

// stores/index.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createUISlice, UISlice } from './slices/ui.slice';
import { createAuthSlice, AuthSlice } from '@/features/auth/store/auth.slice';

type StoreState = UISlice & AuthSlice;

export const useStore = create<StoreState>()(
devtools(
(...a) => ({
...createUISlice(...a),
...createAuthSlice(...a),
}),
{ name: 'GeometrixStore' }
)
);

// Selector hooks (prevent unnecessary re-renders)
export const useSidebar = () => useStore((s) => s.isSidebarOpen);
export const useAuth = () => useStore((s) => ({ user: s.user, isAuthenticated: s.isAuthenticated })); 4. API Integration
4.1 Type-Safe RPC Client
TypeScript

// lib/api.ts
import { hc } from 'hono/client';
import type { AppType } from '@geometrix/server';
import { useStore } from '@/stores';

const getAuthHeader = () => {
const token = useStore.getState().token;
return token ? { Authorization: `Bearer ${token}` } : {};
};

export const client = hc<AppType>(import.meta.env.VITE_API_URL, {
headers: getAuthHeader,
});

// For non-authenticated requests
export const publicClient = hc<AppType>(import.meta.env.VITE_API_URL);
4.2 Query Client Configuration
TypeScript

// app/providers/query.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
defaultOptions: {
queries: {
staleTime: 60 _ 1000, // 1 minute
gcTime: 5 _ 60 \* 1000, // 5 minutes (formerly cacheTime)
retry: (failureCount, error) => {
// Don't retry on 4xx errors
if (error instanceof Error && error.message.includes('4')) return false;
return failureCount < 3;
},
refetchOnWindowFocus: import.meta.env.PROD, // Only in production
},
mutations: {
onError: (error) => {
// Global error handling for mutations
console.error('Mutation failed:', error);
},
},
},
});

export const QueryProvider = ({ children }: { children: React.ReactNode }) => (
<QueryClientProvider client={queryClient}>
{children}
{import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
</QueryClientProvider>
); 5. Error Handling Strategy
5.1 Error Boundary Hierarchy
text

App Level (catches catastrophic failures)
└── Feature Level (isolates feature crashes)
└── Component Level (optional, for risky components)
5.2 Global Error Boundary
TypeScript

// app/providers/error.tsx
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
children: ReactNode;
fallback?: ReactNode;
}

interface State {
hasError: boolean;
error?: Error;
}

export class GlobalErrorBoundary extends Component<Props, State> {
state: State = { hasError: false };

static getDerivedStateFromError(error: Error): State {
return { hasError: true, error };
}

componentDidCatch(error: Error, info: ErrorInfo) {
// Log to error tracking service (Sentry, etc.)
console.error('Global Error:', error, info.componentStack);
}

render() {
if (this.state.hasError) {
return this.props.fallback || (

<div className="flex h-screen items-center justify-center">
<div className="text-center">
<h1 className="text-2xl font-bold">Something went wrong</h1>
<button
onClick={() => window.location.reload()}
className="mt-4 rounded bg-blue-500 px-4 py-2 text-white" >
Reload Application
</button>
</div>
</div>
);
}

    return this.props.children;

}
}
5.3 Feature Error Boundary (Using react-error-boundary)
TypeScript

// features/dashboard/index.tsx
import { ErrorBoundary } from 'react-error-boundary';
import { DashboardPage } from './pages/DashboardPage';
import { DashboardError } from './components/DashboardError';

export const DashboardFeature = () => (
<ErrorBoundary
FallbackComponent={DashboardError}
onError={(error) => {
// Log feature-specific errors
console.error('[Dashboard]', error);
}}
onReset={() => {
// Clear feature-specific state if needed
}}

>

    <DashboardPage />

  </ErrorBoundary>
);
5.4 Feature Error Fallback
TypeScript

// features/dashboard/components/DashboardError.tsx
import { FallbackProps } from 'react-error-boundary';

export const DashboardError = ({ error, resetErrorBoundary }: FallbackProps) => (

  <div className="rounded-lg border border-red-200 bg-red-50 p-6">
    <h2 className="text-lg font-semibold text-red-800">
      Dashboard failed to load
    </h2>
    <p className="mt-2 text-sm text-red-600">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="mt-4 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
    >
      Try Again
    </button>
  </div>
);
6. Performance Optimization
6.1 Route-Based Code Splitting
TypeScript

// app/router.tsx
import { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './layout';
import { PageSkeleton } from '@/components/feedback/PageSkeleton';

// Lazy load all route-level components
const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const ProjectsPage = lazy(() => import('@/features/projects/pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('@/features/projects/pages/ProjectDetailPage'));
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage'));
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));

// Wrapper for lazy components
const LazyPage = ({ component: Component }: { component: React.LazyExoticComponent<any> }) => (
<Suspense fallback={<PageSkeleton />}>
<Component />
</Suspense>
);

const router = createBrowserRouter([
{
path: '/',
element: <AppLayout />,
children: [
{ path: 'dashboard', element: <LazyPage component={DashboardPage} /> },
{ path: 'projects', element: <LazyPage component={ProjectsPage} /> },
{ path: 'projects/:id', element: <LazyPage component={ProjectDetailPage} /> },
{ path: 'settings', element: <LazyPage component={SettingsPage} /> },
],
},
{ path: '/login', element: <LazyPage component={LoginPage} /> },
]);

export const AppRouter = () => <RouterProvider router={router} />;
6.2 Component-on-Interaction Loading
TypeScript

// features/projects/components/ProjectEditor.tsx
import { Suspense, lazy, useState } from 'react';
import { Skeleton } from '@/components/feedback/Skeleton';

// Don't load the heavy editor until user clicks "Edit"
const RichTextEditor = lazy(() => import('@/components/ui/RichTextEditor'));
const MapWidget = lazy(() => import('@/components/ui/MapWidget'));

export const ProjectEditor = () => {
const [showEditor, setShowEditor] = useState(false);
const [showMap, setShowMap] = useState(false);

return (

<div>
{!showEditor ? (
<button onClick={() => setShowEditor(true)}>
Enable Rich Text Editing
</button>
) : (
<Suspense fallback={<Skeleton className="h-64" />}>
<RichTextEditor />
</Suspense>
)}

      {!showMap ? (
        <button onClick={() => setShowMap(true)}>
          Show Location Map
        </button>
      ) : (
        <Suspense fallback={<Skeleton className="h-96" />}>
          <MapWidget />
        </Suspense>
      )}
    </div>

);
};
6.3 Image Optimization
TypeScript

// components/ui/OptimizedImage.tsx
import { useState } from 'react';

interface Props {
src: string;
alt: string;
className?: string;
priority?: boolean; // Load immediately (above the fold)
}

export const OptimizedImage = ({ src, alt, className, priority = false }: Props) => {
const [loaded, setLoaded] = useState(false);

return (

<div className={`relative overflow-hidden ${className}`}>
{!loaded && <div className="absolute inset-0 animate-pulse bg-gray-200" />}
<img
src={src}
alt={alt}
loading={priority ? 'eager' : 'lazy'}
decoding="async"
onLoad={() => setLoaded(true)}
className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
/>
</div>
);
};
6.4 List Virtualization (Large Lists)
TypeScript

// features/projects/components/ProjectList.tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { useProjects } from '../hooks/useProjects';

export const ProjectList = () => {
const { data: projects = [] } = useProjects();
const parentRef = useRef<HTMLDivElement>(null);

const virtualizer = useVirtualizer({
count: projects.length,
getScrollElement: () => parentRef.current,
estimateSize: () => 72, // Estimated row height
overscan: 5, // Render 5 extra items above/below viewport
});

return (

<div ref={parentRef} className="h-[600px] overflow-auto">
<div
style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }} >
{virtualizer.getVirtualItems().map((virtualItem) => (
<div
key={virtualItem.key}
style={{
position: 'absolute',
top: 0,
transform: `translateY(${virtualItem.start}px)`,
