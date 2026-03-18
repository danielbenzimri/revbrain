import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      return (
        this.props.fallback || (
          <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-4">
            <div className="text-center max-w-md bg-white p-8 rounded-xl shadow-lg border border-slate-100">
              <div className="mb-4 flex justify-center">
                <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h1>
              <p className="text-slate-500 mb-6">
                We encountered an unexpected error. Please try reloading the application.
              </p>
              {this.state.error && (
                <div className="mb-6 p-3 bg-red-50 text-red-700 text-xs rounded text-left overflow-auto max-h-32 font-mono">
                  {this.state.error.message}
                </div>
              )}
              <Button
                onClick={() => window.location.reload()}
                className="w-full gap-2 bg-slate-900 hover:bg-slate-800"
              >
                <RotateCw className="h-4 w-4" />
                Reload Application
              </Button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
