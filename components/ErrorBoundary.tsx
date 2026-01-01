import React, { Component, ReactNode, ErrorInfo } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public declare props: ErrorBoundaryProps;
  state: ErrorBoundaryState = { hasError: false };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    if ((import.meta as any)?.env?.DEV) {
      console.error("Uncaught error:", errorDetails);
    } else {
      // In production, send to error tracking service
      // Example: Sentry.captureException(error, { extra: errorDetails });
      console.error('Application error occurred:', error.message);
    }
  }

  render() {
    if (this.state.hasError) {
      // Check if dark mode is enabled by checking the HTML element
      const isDark = document.documentElement.classList.contains("dark");

      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div
            className={`max-w-md w-full text-center border rounded-xl p-6 ${isDark ? "border-gray-800 bg-black" : "border-gray-300 bg-white"
              }`}
          >
            <h1
              className={`text-xl font-semibold mb-2 ${isDark ? "text-white" : "text-black"
                }`}
            >
              Something went wrong
            </h1>
            <p
              className={`text-sm mb-4 ${isDark ? "text-gray-400" : "text-gray-600"
                }`}
            >
              {this.state.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className={`px-4 py-2 rounded-lg font-medium ${isDark
                ? "bg-white text-black hover:bg-gray-100"
                : "bg-black text-white hover:bg-gray-900"
                }`}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

export default ErrorBoundary;
