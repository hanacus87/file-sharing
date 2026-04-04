import { ErrorCode } from '../types/api';

export interface ErrorMessageConfig {
  title: string;
  message: string;
  actionHint?: string;
  severity: 'error' | 'warning' | 'info';
  icon: 'error' | 'warning' | 'info' | 'loading';
  autoRetry?: boolean;
}

/**
 * Unified error message definitions by error code
 */
export const ERROR_MESSAGES: Record<ErrorCode | string, ErrorMessageConfig> = {
  [ErrorCode.FILE_TOO_LARGE]: {
    title: 'File Too Large',
    message: 'Maximum file size is 100MB.',
    actionHint: 'Please select a smaller file.',
    severity: 'error',
    icon: 'error',
  },
  [ErrorCode.INVALID_FILE_TYPE]: {
    title: 'Invalid File Type',
    message: 'This file type is not allowed.',
    actionHint: 'Please check supported file formats.',
    severity: 'error',
    icon: 'error',
  },
  [ErrorCode.FILE_NOT_FOUND]: {
    title: 'File Not Found',
    message: 'File does not exist or has expired.',
    actionHint: 'Please verify the share link is correct.',
    severity: 'error',
    icon: 'error',
  },
  [ErrorCode.INVALID_PASSWORD]: {
    title: 'Invalid Password',
    message: 'The password you entered is incorrect.',
    actionHint: 'Please enter the correct password.',
    severity: 'error',
    icon: 'error',
  },
  [ErrorCode.RATE_LIMITED]: {
    title: 'Too Many Attempts',
    message: 'You have exceeded the maximum number of attempts.',
    actionHint: 'Please wait before trying again.',
    severity: 'warning',
    icon: 'warning',
  },
  [ErrorCode.UPLOAD_FAILED]: {
    title: 'Upload Failed',
    message: 'An error occurred during file upload.',
    actionHint: 'Please try uploading again.',
    severity: 'error',
    icon: 'error',
    autoRetry: true,
  },
  [ErrorCode.STORAGE_ERROR]: {
    title: 'Storage Error',
    message: 'A storage error occurred on the server.',
    actionHint: 'Please try again later.',
    severity: 'error',
    icon: 'error',
    autoRetry: true,
  },
  [ErrorCode.VALIDATION_ERROR]: {
    title: 'Validation Error',
    message: 'Request parameters are invalid.',
    actionHint: 'Please check your input.',
    severity: 'error',
    icon: 'error',
  },
  [ErrorCode.ACCESS_DENIED]: {
    title: 'Access Denied',
    message: 'This file has been removed for security reasons.',
    actionHint: 'The file may have been deleted due to security concerns.',
    severity: 'error',
    icon: 'error',
  },
  [ErrorCode.SCAN_PENDING]: {
    title: 'Security Scan in Progress',
    message: 'File security check is being performed.',
    actionHint: 'Please refresh this page in a few moments to try again.',
    severity: 'info',
    icon: 'loading',
    autoRetry: true,
  },

  // General HTTP errors
  NETWORK_ERROR: {
    title: 'Network Error',
    message: 'No internet connection. Please check your connection and try again.',
    actionHint: 'Check your connection and retry.',
    severity: 'error',
    icon: 'error',
    autoRetry: true,
  },
  TIMEOUT_ERROR: {
    title: 'Request Timeout',
    message: 'The request timed out. Please check your connection and try again.',
    actionHint: 'Check your connection and retry.',
    severity: 'warning',
    icon: 'warning',
    autoRetry: true,
  },
  SERVER_ERROR: {
    title: 'Server Error',
    message: 'Server error. Please try again later.',
    actionHint: 'Please try again later.',
    severity: 'error',
    icon: 'error',
    autoRetry: true,
  },
  UNKNOWN_ERROR: {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred.',
    actionHint: 'Please try again. Contact support if the problem persists.',
    severity: 'error',
    icon: 'error',
  },
};

/**
 * Extract error information and get message configuration
 * Priority: 1. Detailed API message 2. Error code mapped message 3. Fallback message
 */
export function getErrorMessage(
  error: any,
  fallbackMessage?: string,
): {
  config: ErrorMessageConfig;
  message: string;
  code?: string;
} {
  let code: string | undefined;
  let apiMessage: string | undefined;

  // Extract from API error response (HIGHEST PRIORITY)
  if (
    typeof error?.response?.data === 'object' &&
    error?.response?.data !== null &&
    error?.response?.data?.error
  ) {
    code = error.response.data.error.code;
    apiMessage = error.response.data.error.message;
  }

  // If no API error code, then check for network/system errors
  if (!code) {
    if (error?.code === 'ECONNABORTED') {
      code = 'TIMEOUT_ERROR';
    } else if (!navigator.onLine) {
      code = 'NETWORK_ERROR';
    } else if (error?.response?.status >= 500) {
      code = 'SERVER_ERROR';
    }
  }

  // Extract from error object if no API message
  if (!apiMessage && error?.message) {
    apiMessage = error.message;
  }

  // Final fallback
  if (!code && !apiMessage) {
    code = 'UNKNOWN_ERROR';
  }

  // Get error configuration
  const config = (code && ERROR_MESSAGES[code]) || ERROR_MESSAGES['UNKNOWN_ERROR'];

  // Determine message priority
  let finalMessage: string;
  if (apiMessage && isDetailedMessage(apiMessage)) {
    // Prioritize detailed API message
    finalMessage = apiMessage;
  } else if (fallbackMessage) {
    // Use fallback message if available
    finalMessage = fallbackMessage;
  } else {
    // Use default message mapped to error code
    finalMessage = config.message;
  }

  return {
    config,
    message: finalMessage,
    code,
  };
}

/**
 * Determine if API message is sufficiently detailed
 */
function isDetailedMessage(message: string): boolean {
  // Generic messages are not considered detailed
  const genericMessages = [
    'Failed',
    'Error',
    'Internal Server Error',
    'Bad Request',
    'Forbidden',
    'Not Found',
  ];

  return (
    !genericMessages.some((generic) => message.toLowerCase().includes(generic.toLowerCase())) &&
    message.length > 10
  );
}
