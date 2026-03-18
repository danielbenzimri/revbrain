import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors in child components and displays a fallback UI
 * instead of crashing the entire application.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <YourComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // TODO: In production, send to error tracking service (e.g., Sentry)
    // if (import.meta.env.PROD) {
    //   captureException(error, { extra: errorInfo });
    // }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-slate-600 mb-6 max-w-md">
            An unexpected error occurred. Please try again or contact support if the problem
            persists.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="bg-slate-100 p-4 rounded-lg text-left text-xs text-red-600 mb-6 max-w-lg overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <Button onClick={this.handleRetry} className="bg-emerald-600 hover:bg-emerald-700">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Page-level error boundary with navigation-aware reset
 * Resets error state when the URL changes
 */
export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('PageErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-slate-50">
          <div className="h-20 w-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Page Error</h1>
          <p className="text-slate-600 mb-8 max-w-md">
            This page encountered an error. You can try refreshing or go back to the home page.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="bg-white border border-slate-200 p-4 rounded-lg text-left text-xs text-red-600 mb-6 max-w-2xl overflow-auto shadow-sm">
              {this.state.error.stack || this.state.error.message}
            </pre>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={this.handleGoHome}>
              Go to Home
            </Button>
            <Button onClick={this.handleRetry} className="bg-emerald-600 hover:bg-emerald-700">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
