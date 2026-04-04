import { useState, useCallback } from 'react';
import { ErrorCode } from '../types/api';
import { getErrorMessage, ErrorMessageConfig } from '../utils/errorMessages';

interface ErrorState {
  message: string;
  code?: string;
  config: ErrorMessageConfig;
}

/**
 * Unified error handling hook
 */
export function useErrorHandler() {
  const [error, setError] = useState<ErrorState | null>(null);

  /**
   * Handle error with unified processing
   */
  const handleError = useCallback((err: any, fallbackMessage?: string) => {
    const errorInfo = getErrorMessage(err, fallbackMessage);

    setError({
      message: errorInfo.message,
      code: errorInfo.code,
      config: errorInfo.config,
    });

    // Log error for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.error('Error handled:', {
        originalError: err,
        processedError: errorInfo,
        stack: err?.stack,
      });
    }
  }, []);

  /**
   * Handle axios error with improved detection
   */
  const handleAxiosError = useCallback(
    (err: any, fallbackMessage?: string) => {
      // Simply pass the error to handleError
      // The getErrorMessage function will handle all error detection logic
      handleError(err, fallbackMessage);
    },
    [handleError],
  );

  /**
   * Clear current error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Check if specific error code is active
   */
  const isError = useCallback(
    (code: ErrorCode | string) => {
      return error?.code === code;
    },
    [error?.code],
  );

  /**
   * Get retry capability
   */
  const canRetry = useCallback(() => {
    return error?.config?.autoRetry || false;
  }, [error?.config?.autoRetry]);

  return {
    error,
    handleError,
    handleAxiosError,
    clearError,
    isError,
    canRetry,
  };
}
