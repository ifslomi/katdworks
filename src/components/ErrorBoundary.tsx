import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
  componentStack: string;
  timestamp: string;
  locationHref: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
    errorStack: '',
    componentStack: '',
    timestamp: '',
    locationHref: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Unknown runtime error.',
      errorStack: error.stack || '',
      componentStack: '',
      timestamp: new Date().toISOString(),
      locationHref: typeof window !== 'undefined' ? window.location.href : ''
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      errorStack: error.stack || this.state.errorStack,
      componentStack: errorInfo.componentStack || ''
    });
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
          <div className="bg-error-container text-on-error-container p-8 rounded-xl max-w-4xl w-full shadow-xl">
            <h2 className="text-2xl font-headline font-bold mb-4">Something went wrong</h2>
            <p className="text-sm opacity-90 mb-4">
              A runtime error interrupted rendering. Review the details below to identify the failing path.
            </p>
            {parsedError ? (
              <div className="space-y-3 text-sm bg-white/10 p-4 rounded-lg">
                <p><strong>Error:</strong> {parsedError.error || this.state.errorMessage}</p>
                <p><strong>Operation:</strong> <span className="uppercase tracking-wider font-bold">{parsedError.operationType || 'unknown'}</span></p>
                <p><strong>Path:</strong> {parsedError.path || 'n/a'}</p>
                <p><strong>User:</strong> {parsedError.authInfo?.email || parsedError.authInfo?.userId || 'anonymous'}</p>
                <p><strong>Timestamp:</strong> {this.state.timestamp}</p>
                <p><strong>Route:</strong> {this.state.locationHref || 'n/a'}</p>
                <div className="mt-4 pt-4 border-t border-on-error-container/20 text-xs opacity-95">
                  <p className="font-bold mb-1">Security/permissions hint:</p>
                  <p>If this is a Firestore permission error, verify Firebase Auth state and Firestore rules for this document path.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-white/10 p-4 rounded-lg text-sm">
                <p><strong>Error:</strong> {this.state.errorMessage}</p>
                <p><strong>Timestamp:</strong> {this.state.timestamp}</p>
                <p><strong>Route:</strong> {this.state.locationHref || 'n/a'}</p>
              </div>
            )}

            {(this.state.errorStack || this.state.componentStack) && (
              <div className="mt-4 grid gap-3">
                {this.state.errorStack && (
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="font-bold text-xs uppercase tracking-wider mb-2">Error Stack</p>
                    <pre className="text-xs whitespace-pre-wrap break-words">{this.state.errorStack}</pre>
                  </div>
                )}
                {this.state.componentStack && (
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="font-bold text-xs uppercase tracking-wider mb-2">Component Stack</p>
                    <pre className="text-xs whitespace-pre-wrap break-words">{this.state.componentStack}</pre>
                  </div>
                )}
              </div>
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
