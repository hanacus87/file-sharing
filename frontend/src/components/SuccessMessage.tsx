import React from 'react';

interface SuccessMessageProps {
  title: string;
  message: string;
  children?: React.ReactNode;
}

const SuccessMessage: React.FC<SuccessMessageProps> = ({ title, message, children }) => {
  return (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4">
      <div className="flex items-start">
        <svg
          className="h-5 w-5 text-green-400 dark:text-green-500 mt-0.5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-green-800 dark:text-green-300">{title}</h3>
          <p className="mt-1 text-sm text-green-700 dark:text-green-400">{message}</p>
          {children}
        </div>
      </div>
    </div>
  );
};

export default SuccessMessage;
