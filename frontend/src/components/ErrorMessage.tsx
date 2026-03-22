import React from 'react';
import { ErrorCode } from '../types/api';
import { ERROR_MESSAGES, ErrorMessageConfig } from '../utils/errorMessages';

interface ErrorMessageProps {
  message: string;
  code?: ErrorCode | string | null;
  config?: ErrorMessageConfig;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, code, config }) => {
  // Get configuration from code or use provided config
  const errorConfig = config || (code && ERROR_MESSAGES[code]) || ERROR_MESSAGES['UNKNOWN_ERROR'];

  // Determine styling based on severity
  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'warning':
        return {
          container: 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800',
          icon: 'text-yellow-400 dark:text-yellow-500',
          title: 'text-yellow-800 dark:text-yellow-300',
          message: 'text-yellow-700 dark:text-yellow-400',
          hint: 'text-yellow-600 dark:text-yellow-500'
        };
      case 'info':
        return {
          container: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800',
          icon: 'text-blue-400 dark:text-blue-500',
          title: 'text-blue-800 dark:text-blue-300',
          message: 'text-blue-700 dark:text-blue-400',
          hint: 'text-blue-600 dark:text-blue-500'
        };
      default: // error
        return {
          container: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
          icon: 'text-red-400 dark:text-red-500',
          title: 'text-red-800 dark:text-red-300',
          message: 'text-red-700 dark:text-red-400',
          hint: 'text-red-600 dark:text-red-500'
        };
    }
  };

  const styles = getSeverityStyles(errorConfig.severity);

  const renderIcon = () => {
    const baseClasses = `h-5 w-5 ${styles.icon}`;

    switch (errorConfig.icon) {
      case 'warning':
        return (
          <svg className={baseClasses} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        );
      case 'info':
        return (
          <svg className={baseClasses} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
      case 'loading':
        return (
          <svg className={`${baseClasses} animate-spin`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      default: // error
        return (
          <svg className={baseClasses} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  // Enhanced layout for title + message + hint
  if (errorConfig.title) {
    return (
      <div className={`rounded-md p-4 ${styles.container}`}>
        <div className="flex">
          <div className="flex-shrink-0">
            {renderIcon()}
          </div>
          <div className="ml-3">
            <h3 className={`text-sm font-medium ${styles.title}`}>
              {errorConfig.title}
            </h3>
            <div className={`mt-1 text-sm ${styles.message}`}>
              <p>{message}</p>
              {errorConfig.actionHint && (
                <p className={`mt-1 text-xs ${styles.hint}`}>
                  {errorConfig.actionHint}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Simple layout for message only (backwards compatibility)
  return (
    <div className={`rounded-md p-4 ${styles.container}`}>
      <div className="flex">
        {renderIcon()}
        <p className={`ml-3 text-sm ${styles.message}`}>{message}</p>
      </div>
    </div>
  );
};

export default ErrorMessage;