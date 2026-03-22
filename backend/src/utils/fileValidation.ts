import { UPLOAD_CONFIG } from '../types/models';
import { ErrorCode } from '../types/api';

export interface FileValidationResult {
  isValid: boolean;
  error?: {
    code: ErrorCode;
    message: string;
  };
}

export function validateFileExtension(filename: string): FileValidationResult {
  // Check for multiple extensions (e.g., malicious.pdf.exe)
  const parts = filename.toLowerCase().split('.');

  if (parts.length < 2) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.INVALID_FILE_TYPE,
        message: 'File must have an extension'
      }
    };
  }

  // Check all extensions, not just the last one
  const extensions = parts.slice(1).map(ext => `.${ext}`);

  // Detect double extensions that might be malicious
  if (extensions.length > 1) {
    // Check if any extension is executable or dangerous
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.app', '.php'];
    const hasDangerousExtension = extensions.some(ext => dangerousExtensions.includes(ext));

    if (hasDangerousExtension) {
      return {
        isValid: false,
        error: {
          code: ErrorCode.INVALID_FILE_TYPE,
          message: 'Files with multiple extensions including executable types are not allowed'
        }
      };
    }
  }

  // Validate the final extension
  const finalExtension = extensions[extensions.length - 1];
  if (!UPLOAD_CONFIG.allowedExtensions.includes(finalExtension)) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.INVALID_FILE_TYPE,
        message: `File type ${finalExtension} is not allowed. Allowed types: ${UPLOAD_CONFIG.allowedExtensions.join(', ')}`
      }
    };
  }

  return { isValid: true };
}

export function validateMimeType(mimeType: string, filename: string): FileValidationResult {
  // Validate MIME type format
  if (mimeType && !mimeType.match(/^[a-zA-Z0-9][a-zA-Z0-9\/+.-]*$/)) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.INVALID_FILE_TYPE,
        message: 'Invalid MIME type format'
      }
    };
  }

  // Map of file extensions to expected MIME types
  const extensionToMimeTypes: Record<string, string[]> = {
    '.pdf': ['application/pdf'],
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.png': ['image/png'],
    '.gif': ['image/gif'],
    '.txt': ['text/plain'],
    '.doc': ['application/msword'],
    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '.xls': ['application/vnd.ms-excel'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    '.zip': ['application/zip', 'application/x-zip-compressed'],
    '.mp4': ['video/mp4'],
    '.mp3': ['audio/mpeg', 'audio/mp3']
  };

  // Get file extension
  const extension = filename.toLowerCase().match(/\.[^.]*$/)?.[0];

  if (extension && extensionToMimeTypes[extension]) {
    // If we know the expected MIME types for this extension, validate against them
    const expectedTypes = extensionToMimeTypes[extension];

    if (mimeType && !expectedTypes.includes(mimeType) && mimeType !== 'application/octet-stream') {
      return {
        isValid: false,
        error: {
          code: ErrorCode.INVALID_FILE_TYPE,
          message: `MIME type ${mimeType} does not match expected types for ${extension} files`
        }
      };
    }
  }

  // Allow empty MIME type or application/octet-stream as fallback
  if (!mimeType || mimeType === 'application/octet-stream') {
    return { isValid: true };
  }

  if (!UPLOAD_CONFIG.allowedMimeTypes.includes(mimeType)) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.INVALID_FILE_TYPE,
        message: `MIME type ${mimeType} is not allowed`
      }
    };
  }

  return { isValid: true };
}

export function validateFileSize(size: number): FileValidationResult {
  if (size <= 0) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.FILE_TOO_LARGE,
        message: 'File size must be greater than 0'
      }
    };
  }

  if (size > UPLOAD_CONFIG.maxFileSize) {
    const maxSizeMB = UPLOAD_CONFIG.maxFileSize / (1024 * 1024);
    const actualSizeMB = (size / (1024 * 1024)).toFixed(2);
    return {
      isValid: false,
      error: {
        code: ErrorCode.FILE_TOO_LARGE,
        message: `File size ${actualSizeMB}MB exceeds maximum allowed size of ${maxSizeMB}MB`
      }
    };
  }

  return { isValid: true };
}

export function validateFile(filename: string, mimeType: string, size: number): FileValidationResult {
  // Check for path traversal attempts
  if (filename.includes('../') || filename.includes('..\\') || filename.includes('/') || filename.includes('\\')) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.INVALID_FILE_TYPE,
        message: 'Filename contains path traversal characters'
      }
    };
  }

  // Check for null bytes or other dangerous characters
  if (filename.includes('\0') || filename.includes('\n') || filename.includes('\r') || filename.includes('\t')) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.INVALID_FILE_TYPE,
        message: 'Filename contains invalid control characters'
      }
    };
  }

  // Validate extension
  const extensionResult = validateFileExtension(filename);
  if (!extensionResult.isValid) {
    return extensionResult;
  }

  // Validate MIME type with filename for consistency check
  const mimeResult = validateMimeType(mimeType, filename);
  if (!mimeResult.isValid) {
    return mimeResult;
  }

  // Validate size
  const sizeResult = validateFileSize(size);
  if (!sizeResult.isValid) {
    return sizeResult;
  }

  return { isValid: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}