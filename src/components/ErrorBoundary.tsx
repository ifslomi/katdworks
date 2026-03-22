import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let parsedError;
      try {
        parsedError = JSON.parse(this.state.errorMessage);
      } catch (e) {
        parsedError = null;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-8 font-body">
          <div className="bg-error-container text-on-error-container p-8 rounded-xl max-w-2xl w-full shadow-xl">
            <h2 className="text-2xl font-headline font-bold mb-4">Something went wrong</h2>
            {parsedError ? (
              <div className="space-y-3 text-sm bg-white/10 p-4 rounded-lg">
                <p><strong>Error:</strong> {parsedError.error}</p>
                <p><strong>Operation:</strong> <span className="uppercase tracking-wider font-bold">{parsedError.operationType}</span></p>
                <p><strong>Path:</strong> {parsedError.path}</p>
                <div className="mt-4 pt-4 border-t border-on-error-container/20 text-xs opacity-90">
                  <p className="font-bold mb-1">Firebase Security Rules Issue:</p>
                  <p>Your current Firestore rules are preventing this operation. Please update your rules in the Firebase Console to allow access.</p>
                </div>
              </div>
            ) : (
              <p className="bg-white/10 p-4 rounded-lg text-sm">{this.state.errorMessage}</p>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-3 bg-error text-on-error rounded-lg font-bold text-sm hover:opacity-90 transition-opacity"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
