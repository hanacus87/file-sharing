import React, { useCallback } from 'react';
import { UPLOAD_CONFIG } from '../utils/constants';
import { formatFileSize } from '../utils/formatters';

interface FileUploadAreaProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  disabled: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  onFileSelect,
  selectedFile,
  disabled,
  fileInputRef,
}) => {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [disabled, onFileSelect],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 ${
          disabled
            ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          disabled={disabled}
          className="hidden"
          id="file-upload"
          accept={UPLOAD_CONFIG.allowedExtensions.join(',')}
        />

        <label
          htmlFor="file-upload"
          className={`cursor-pointer ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {selectedFile ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {selectedFile.name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Max size: {formatFileSize(UPLOAD_CONFIG.maxFileSize)}
              </p>
            </>
          )}
        </label>
      </div>

      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Allowed file types: {UPLOAD_CONFIG.allowedExtensions.join(', ')}
      </div>
    </div>
  );
};

export default FileUploadArea;
