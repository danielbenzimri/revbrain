import { useEffect } from 'react';
import { useAuthStore } from './stores/auth-store';
import { QueryProvider } from './app/providers/query';
import { GlobalErrorBoundary } from './app/providers/error';
import { AppRouter } from './app/router';
import { Toaster } from './components/ui/toaster';
import { AppDialogProvider } from './contexts/AppDialogContext';

function App() {
  useEffect(() => {
    // Initialize auth listener
    const cleanup = useAuthStore.getState().initialize();
    return cleanup;
  }, []);

  return (
    <GlobalErrorBoundary>
      <QueryProvider>
        <AppDialogProvider>
          <AppRouter />
          <Toaster />
        </AppDialogProvider>
      </QueryProvider>
    </GlobalErrorBoundary>
  );
}

export default App;
