'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary (D-004). Catches unhandled JS exceptions in the
 * component tree and shows a recoverable fallback instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-100">
          <div className="surface max-w-md rounded-lg p-8 text-center">
            <h2 className="text-base font-semibold text-zinc-950">页面出错了</h2>
            <p className="mt-2 text-sm text-zinc-600">
              应用遇到了意外错误。请刷新页面重试。
            </p>
            {this.state.error && (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="btn-primary mt-5 rounded-md px-4 py-2 text-xs font-semibold"
            >
              刷新页面
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
