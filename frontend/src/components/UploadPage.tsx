import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { UploadResponse } from '../types/api';
import { getApiUrl } from '../config/api';
import FileUploadArea from './FileUploadArea';
import UploadProgress from './UploadProgress';
import ShareLinkDisplay from './ShareLinkDisplay';
import ErrorMessage from './ErrorMessage';
import { validatePasswordStrength } from '../utils/passwordValidator';
import { useErrorHandler } from '../hooks/useErrorHandler';

const UploadPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak');
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error, handleAxiosError, clearError } = useErrorHandler();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    clearError();
    setUploadResponse(null);
  };

  // Validate password on change
  useEffect(() => {
    if (password) {
      const validation = validatePasswordStrength(password);
      setPasswordErrors(validation.errors);
      setPasswordStrength(validation.strength);
    } else {
      setPasswordErrors([]);
      setPasswordStrength('weak');
    }
  }, [password]);

  // Check password match
  useEffect(() => {
    if (confirmPassword && password !== confirmPassword) {
      setPasswordMismatch(true);
    } else {
      setPasswordMismatch(false);
    }
  }, [password, confirmPassword]);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    clearError();
    setUploadProgress(0);

    try {
      // Step 1: Request presigned URL from server
      // Ensure content type is set, default to application/octet-stream if empty
      const contentType = selectedFile.type || 'application/octet-stream';

      const uploadRequest = {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        contentType: contentType,
        password: password || undefined,
      };

      const response = await axios.post<UploadResponse>(getApiUrl('upload'), uploadRequest, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (
        typeof response.data === 'object' &&
        response.data !== null &&
        response.data.success &&
        response.data.uploadUrl
      ) {
        // Step 2: Upload file directly to S3 using presigned POST (enforces size limit on S3 side)

        try {
          const formData = new FormData();
          // Append presigned POST fields first (must precede the file field)
          Object.entries(response.data.uploadFields || {}).forEach(([key, value]) => {
            formData.append(key, value as string);
          });
          formData.append('file', selectedFile);

          await axios.post(response.data.uploadUrl, formData, {
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percentCompleted = Math.round(
                  (progressEvent.loaded * 100) / progressEvent.total,
                );
                setUploadProgress(percentCompleted);
              }
            },
            // Add timeout for mobile connections
            timeout: 300000, // 5 minutes
          });
        } catch (s3Error: any) {
          // Re-throw with more specific error message
          if (s3Error.response?.status === 403) {
            throw new Error('Access denied. The upload URL may have expired.');
          } else if (s3Error.response?.status === 0 || s3Error.code === 'ERR_NETWORK') {
            throw new Error('Network error. Please check CORS configuration.');
          }
          throw s3Error;
        }

        // Step 3: Show success
        const fullShareUrl = `${window.location.origin}/download/${response.data.shareUrl}`;
        setUploadResponse({
          ...response.data,
          shareUrl: fullShareUrl,
        });
        setSelectedFile(null);
        setPassword('');
        setConfirmPassword('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (err: any) {
      handleAxiosError(err, 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPassword('');
    setConfirmPassword('');
    setUploadResponse(null);
    clearError();
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 transition-colors duration-200">
        <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">Upload File</h2>

        {!uploadResponse ? (
          <>
            <FileUploadArea
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
              disabled={uploading}
              fileInputRef={fileInputRef}
            />

            {selectedFile && (
              <div className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Optional Password Protection
                  </label>
                  <div className="relative mt-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={uploading}
                      className="block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 sm:text-sm disabled:bg-gray-100 dark:disabled:bg-gray-800"
                      placeholder="Enter password (optional)"
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
                  {password && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Strength:
                        </span>
                        <div className="flex gap-1">
                          <div
                            className={`h-1 w-8 rounded ${passwordStrength === 'weak' ? 'bg-red-500' : passwordStrength === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`}
                          />
                          <div
                            className={`h-1 w-8 rounded ${passwordStrength === 'medium' ? 'bg-yellow-500' : passwordStrength === 'strong' ? 'bg-green-500' : 'bg-gray-300'}`}
                          />
                          <div
                            className={`h-1 w-8 rounded ${passwordStrength === 'strong' ? 'bg-green-500' : 'bg-gray-300'}`}
                          />
                        </div>
                        <span
                          className={`text-xs ${passwordStrength === 'weak' ? 'text-red-600' : passwordStrength === 'medium' ? 'text-yellow-600' : 'text-green-600'}`}
                        >
                          {passwordStrength}
                        </span>
                      </div>
                      {passwordErrors.length > 0 && (
                        <ul className="text-xs text-red-600 space-y-0.5">
                          {passwordErrors.map((error, index) => (
                            <li key={index}>• {error}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {password && (
                  <div>
                    <label
                      htmlFor="confirmPassword"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Confirm Password
                    </label>
                    <div className="relative mt-1">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        id="confirmPassword"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={uploading}
                        className={`block w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 sm:text-sm disabled:bg-gray-100 dark:disabled:bg-gray-800 ${
                          passwordMismatch && confirmPassword
                            ? 'border-red-300 dark:border-red-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                        placeholder="Re-enter password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 px-3 flex items-center"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? (
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
                    {passwordMismatch && confirmPassword && (
                      <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                    )}
                  </div>
                )}

                {uploading && <UploadProgress progress={uploadProgress} />}

                {error && (
                  <ErrorMessage message={error.message} code={error.code} config={error.config} />
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={handleUpload}
                    disabled={
                      uploading ||
                      (!!password &&
                        (passwordErrors.length > 0 || passwordMismatch || !confirmPassword))
                    }
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    {uploading ? 'Uploading...' : 'Upload File'}
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={uploading}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <ShareLinkDisplay
            shareUrl={uploadResponse.shareUrl}
            fileName={uploadResponse.fileName}
            expiresAt={uploadResponse.expiresAt}
            onNewUpload={handleReset}
          />
        )}
      </div>
    </div>
  );
};

export default UploadPage;
