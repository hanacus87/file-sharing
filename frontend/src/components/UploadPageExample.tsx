// Example implementation using the unified error handling system
import React, { useState, useRef } from 'react';
import axios from 'axios';
import { UploadResponse } from '../types/api';
import { getApiUrl } from '../config/api';
import { useErrorHandler } from '../hooks/useErrorHandler';
import ErrorMessage from './ErrorMessage';

const UploadPageExample: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unified error handling
  const { error, handleAxiosError, clearError } = useErrorHandler();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    clearError(); // Clear previous errors
    setUploadResponse(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    clearError(); // Clear previous errors

    try {
      const uploadRequest = {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        contentType: selectedFile.type || 'application/octet-stream',
      };

      const response = await axios.post<UploadResponse>(
        getApiUrl('upload'),
        uploadRequest,
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (typeof response.data === 'object' && response.data !== null && response.data.success && response.data.uploadUrl) {
        // Upload to S3
        try {
          await axios.put(response.data.uploadUrl, selectedFile, {
            headers: { 'Content-Type': uploadRequest.contentType },
            timeout: 300000, // 5 minutes
          });

          setUploadResponse(response.data);
          setSelectedFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (s3Error) {
          // Handle S3 upload errors with enhanced error detection
          handleAxiosError(s3Error, 'S3 upload failed');
        }
      }
    } catch (err) {
      // Handle API errors with unified error handler
      handleAxiosError(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">
          Upload File (Example with Unified Error Handling)
        </h2>

        {!uploadResponse ? (
          <>
            <div className="space-y-4">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  disabled={uploading}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              {selectedFile && (
                <div className="text-sm text-gray-600">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              )}

              {/* Unified error display */}
              {error && (
                <ErrorMessage
                  message={error.message}
                  code={error.code}
                  config={error.config}
                />
              )}

              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Upload File'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <p className="text-green-600 mb-4">Upload successful!</p>
            <p className="text-sm text-gray-600">File: {uploadResponse.fileName}</p>
            <p className="text-sm text-gray-600">Share URL: {uploadResponse.shareUrl}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadPageExample;