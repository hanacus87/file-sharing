import React, { ReactNode } from 'react';
import { useCSRF } from '../contexts/CSRFContext';

interface CSRFProtectedViewProps {
  children: ReactNode;
}

const CSRFProtectedView: React.FC<CSRFProtectedViewProps> = ({ children }) => {
  const { isLoading, error } = useCSRF();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center max-w-md w-full">
          <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-600 mx-auto mb-3 sm:mb-4"></div>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 px-2">
            Initializing security...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center p-4 sm:p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg max-w-md w-full mx-2 sm:mx-0">
          <div className="mb-4">
            <svg
              className="h-8 w-8 sm:h-10 sm:w-10 text-red-500 mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <p className="text-sm sm:text-base text-red-600 dark:text-red-400 mb-4 sm:mb-6 break-words leading-relaxed px-2">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 bg-red-600 text-white text-sm sm:text-base rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors duration-200"
            aria-label="Reload page to retry"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default CSRFProtectedView;