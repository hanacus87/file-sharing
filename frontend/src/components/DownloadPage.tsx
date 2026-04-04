import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { FileInfoResponse, ErrorCode, ErrorResponse } from '../types/api';
import { formatFileSize } from '../utils/formatters';
import { getApiUrl } from '../config/api';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';
import { useErrorHandler } from '../hooks/useErrorHandler';

const DownloadPage: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [fileInfo, setFileInfo] = useState<FileInfoResponse | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const { error, handleAxiosError, clearError } = useErrorHandler();
  const {
    error: deleteError,
    handleAxiosError: handleDeleteError,
    clearError: clearDeleteError,
  } = useErrorHandler();

  useEffect(() => {
    fetchFileInfo();
  }, [shareId]);

  const fetchFileInfo = async () => {
    if (!shareId) return;

    // Clear previous data and errors
    setFileInfo(null);
    clearError();

    try {
      const response = await axios.get<FileInfoResponse>(getApiUrl(`file/${shareId}`));

      // Check if the response is actually an error (CloudFront may convert 404 to 200)
      // Case 1: Direct error object structure
      if (typeof response.data === 'object' && response.data !== null && 'error' in response.data) {
        const errorData = response.data as any;
        // Create a proper error object for handleAxiosError
        const mockError = {
          response: {
            data: errorData,
            status: errorData.error?.code === 'FILE_NOT_FOUND' ? 404 : 400,
          },
        };
        handleAxiosError(mockError, 'Failed to load file information');
      }
      // Case 2: Error response with success: false
      else if (
        typeof response.data === 'object' &&
        response.data !== null &&
        response.data.success === false
      ) {
        const errorData = response.data as any;
        // Create a proper error object for handleAxiosError
        const mockError = {
          response: {
            data: errorData,
            status: errorData.error?.code === 'FILE_NOT_FOUND' ? 404 : 400,
          },
        };
        handleAxiosError(mockError, 'Failed to load file information');
      }
      // Case 3: HTML response from CloudFront (404 converted to 200)
      else if (
        typeof response.data === 'string' &&
        (response.data as string).trim().startsWith('<!DOCTYPE html>')
      ) {
        const mockError = {
          response: {
            data: {
              success: false,
              error: {
                code: 'FILE_NOT_FOUND',
                message: 'File not found or has expired',
              },
            },
            status: 404,
          },
        };
        handleAxiosError(mockError, 'Failed to load file information');
      }
      // Case 4: Valid file info response
      else if (
        response.data &&
        typeof response.data === 'object' &&
        (response.data.success === true || response.data.fileName)
      ) {
        setFileInfo(response.data);
      }
      // Case 5: Unexpected response format (fallback)
      else {
        const mockError = {
          response: {
            data: {
              success: false,
              error: {
                code: 'FILE_NOT_FOUND',
                message: 'File not found or has expired',
              },
            },
            status: 404,
          },
        };
        handleAxiosError(mockError, 'Failed to load file information');
      }
    } catch (err: any) {
      handleAxiosError(err, 'Failed to load file information');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!shareId) return;

    setDownloading(true);
    clearError();

    try {
      // Step 1: Get download token
      const tokenResponse = await axios.post(
        getApiUrl(`download/${shareId}`),
        fileInfo?.isPasswordProtected ? { password } : {},
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );

      // Check if response indicates an error (even with 2xx status like 202 for SCAN_PENDING)
      if (
        !tokenResponse.data.success ||
        (tokenResponse.status === 202 && tokenResponse.data.error)
      ) {
        const errorResponse = tokenResponse.data as ErrorResponse;
        const code = errorResponse.error?.code;

        // Create a proper error object for handleAxiosError with actual status code
        const mockError = {
          response: {
            data: errorResponse,
            status: tokenResponse.status, // Use actual status code (e.g., 202 for SCAN_PENDING)
          },
        };
        handleAxiosError(mockError, 'Download failed');

        // Handle specific error codes
        if (code === ErrorCode.RATE_LIMITED) {
          setRemainingAttempts(0);
        }
        if (code === ErrorCode.INVALID_PASSWORD) {
          setPassword('');
        }
        // SCAN_PENDING (202 status) is now properly handled by the unified error system
        // The ErrorMessage component will show appropriate message with loading icon

        return; // Exit early for error responses
      }

      if (tokenResponse.data.success && tokenResponse.data.downloadToken) {
        // Step 2: Use token to get actual download URL
        const downloadResponse = await axios.post(
          getApiUrl(`download/${shareId}?token=${tokenResponse.data.downloadToken}`),
          {},
          {
            headers: { 'Content-Type': 'application/json' },
          },
        );

        // Also check download response for errors (including 202 status for SCAN_PENDING)
        if (
          !downloadResponse.data.success ||
          (downloadResponse.status === 202 && downloadResponse.data.error)
        ) {
          const errorResponse = downloadResponse.data as ErrorResponse;

          // Create a proper error object for handleAxiosError with actual status code
          const mockError = {
            response: {
              data: errorResponse,
              status: downloadResponse.status,
            },
          };
          handleAxiosError(mockError, 'Download failed');
          return;
        }

        if (downloadResponse.data.success && downloadResponse.data.downloadUrl) {
          // Create a temporary link and click it to download
          const link = document.createElement('a');
          link.href = downloadResponse.data.downloadUrl;
          link.download = downloadResponse.data.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    } catch (err: any) {
      const errorResponse = err.response?.data as ErrorResponse;
      const code = errorResponse?.error?.code;

      handleAxiosError(err, 'Download failed');

      // Handle specific error codes
      if (
        code === ErrorCode.RATE_LIMITED ||
        err.response?.data?.error?.message?.includes('Too many failed attempts')
      ) {
        setRemainingAttempts(0);
      }

      // Clear password on failed attempt
      if (
        code === ErrorCode.INVALID_PASSWORD ||
        err.response?.status === 401 ||
        err.response?.status === 429
      ) {
        setPassword('');
      }

      // SCAN_PENDING is automatically handled by the unified error system
      // The ErrorMessage component will display the appropriate loading/info message
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteModal(true);
    setDeletePassword('');
    clearDeleteError();
    setDeleteSuccess(false); // Reset success state when opening modal
  };

  const handleDeleteConfirm = async () => {
    if (!shareId) return;

    setDeleting(true);
    clearDeleteError();

    try {
      const deleteRequest = fileInfo?.isPasswordProtected ? { password: deletePassword } : {};

      const response = await axios.delete(getApiUrl(`files/${shareId}`), {
        data: deleteRequest,
        headers: { 'Content-Type': 'application/json' },
      });

      if (typeof response.data === 'object' && response.data !== null && response.data.success) {
        // Hide modal and show success message
        setShowDeleteModal(false);
        setDeleteSuccess(true);
        // Clear any previous errors
        clearError();
        // Disable all interactions after successful deletion
        setFileInfo(null);
      } else {
        const errorData = response.data as ErrorResponse;
        const code = errorData.error?.code;

        // Set modal-specific error state instead of page-level error
        handleDeleteError(errorData, 'Failed to delete file');

        if (code === ErrorCode.RATE_LIMITED) {
          setRemainingAttempts(0);
        }
        if (code === ErrorCode.INVALID_PASSWORD) {
          setDeletePassword('');
        }
      }
    } catch (err: any) {
      const errorCode = err.response?.data?.error?.code;

      // Set modal-specific error state instead of page-level error
      handleDeleteError(err, 'Failed to delete file');

      if (errorCode === ErrorCode.RATE_LIMITED) {
        setRemainingAttempts(0);
      }
      if (errorCode === ErrorCode.INVALID_PASSWORD) {
        setDeletePassword('');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setDeletePassword('');
    clearDeleteError();
    setDeleteSuccess(false); // Reset success state when canceling
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div
          className="bg-white dark:bg-gray-800 shadow rounded-lg p-6"
          role="status"
          aria-label="Loading"
        >
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (deleteSuccess && !fileInfo) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">
            File Deleted
          </h2>
          <SuccessMessage
            title="File deleted successfully"
            message="The file has been permanently deleted and is no longer accessible."
          />
          <div className="mt-6 text-center">
            <a
              href="/"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Upload a new file
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (error && !fileInfo) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            File Not Found
          </h2>
          <ErrorMessage message={error.message} code={error.code} config={error.config} />
          <div className="mt-4">
            <a
              href="/"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
            >
              ← Back to upload
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">
          Download File
        </h2>

        {fileInfo && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                {fileInfo.fileName}
              </h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Size:</dt>
                  <dd className="text-gray-900 dark:text-gray-100">
                    {formatFileSize(fileInfo.fileSize)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Uploaded:</dt>
                  <dd className="text-gray-900 dark:text-gray-100">
                    {formatDate(fileInfo.uploadedAt)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Expires:</dt>
                  <dd className="text-gray-900 dark:text-gray-100">
                    {formatDate(fileInfo.expiresAt)}
                  </dd>
                </div>
              </dl>
            </div>

            {fileInfo.isPasswordProtected && (
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Password Required
                </label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={downloading || remainingAttempts === 0}
                    className="block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 sm:text-sm disabled:bg-gray-100 dark:disabled:bg-gray-800"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg
                        className="h-5 w-5 text-gray-400 dark:text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-5 w-5 text-gray-400 dark:text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {remainingAttempts === 0 && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    Too many failed attempts. Please try again later.
                  </p>
                )}
              </div>
            )}

            {error && (
              <ErrorMessage message={error.message} code={error.code} config={error.config} />
            )}

            <button
              onClick={handleDownload}
              disabled={
                downloading ||
                (fileInfo.isPasswordProtected && !password) ||
                remainingAttempts === 0 ||
                error?.code === ErrorCode.ACCESS_DENIED ||
                error?.code === ErrorCode.SCAN_PENDING
              }
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
            >
              {downloading
                ? 'Preparing Download...'
                : remainingAttempts === 0
                  ? 'Access Blocked'
                  : error?.code === ErrorCode.ACCESS_DENIED
                    ? 'File Unavailable'
                    : error?.code === ErrorCode.SCAN_PENDING
                      ? 'Security Scan in Progress'
                      : 'Download File'}
            </button>

            <button
              onClick={handleDeleteClick}
              disabled={deleting || downloading || remainingAttempts === 0}
              className="w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting...' : 'Delete File'}
            </button>

            <div className="text-center">
              <a
                href="/"
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
              >
                Upload a new file
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Delete File
            </h3>

            <div className="mb-4">
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                Are you sure you want to delete this file?
              </p>
              <div className="bg-gray-50 dark:bg-gray-700 rounded p-3 text-sm">
                <p className="font-medium text-gray-900 dark:text-gray-100">{fileInfo?.fileName}</p>
                <p className="text-gray-600 dark:text-gray-400">
                  {formatFileSize(fileInfo?.fileSize || 0)}
                </p>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                ⚠️ This action cannot be undone.
              </p>
            </div>

            {fileInfo?.isPasswordProtected && (
              <div className="mb-4">
                <label
                  htmlFor="deletePassword"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Enter password to confirm deletion
                </label>
                <div className="relative">
                  <input
                    type={showDeletePassword ? 'text' : 'password'}
                    id="deletePassword"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    disabled={deleting || remainingAttempts === 0}
                    className="block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-gray-100 sm:text-sm disabled:bg-gray-100 dark:disabled:bg-gray-800"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword(!showDeletePassword)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center"
                    tabIndex={-1}
                  >
                    {showDeletePassword ? (
                      <svg
                        className="h-5 w-5 text-gray-400 dark:text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-5 w-5 text-gray-400 dark:text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {deleteError && (
              <div className="mb-4">
                <ErrorMessage
                  message={deleteError.message}
                  code={deleteError.code}
                  config={deleteError.config}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDeleteCancel}
                disabled={deleting}
                className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={
                  deleting ||
                  (fileInfo?.isPasswordProtected && !deletePassword) ||
                  remainingAttempts === 0
                }
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DownloadPage;
