export interface FileRecord {
  shareId: string;
  originalFilename: string;
  s3Key: string;
  fileSize: number;
  mimeType: string;
  passwordHash?: string;
  uploadedAt: number; // Unix timestamp
  expiresAt: number; // Unix timestamp (TTL)
  downloadCount: number;
  scanStatus?: 'pending' | 'scanning' | 'clean' | 'infected' | 'error';
  scanDate?: number; // Unix timestamp
  scanResult?: string; // JSON string with malware findings
}

export interface UploadConfig {
  maxFileSize: number; // 100MB
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  expirationHours: number; // 48 hours
}

export const UPLOAD_CONFIG: UploadConfig = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  expirationHours: 48,
  allowedExtensions: [
    '.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp',
    '.mp3', '.wav', '.mp4', '.avi', '.mov',
    '.zip', '.rar', '.7z', '.tar', '.gz'
  ],
  allowedMimeTypes: [
    'text/plain', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/gif', 'image/bmp',
    'audio/mpeg', 'audio/wav', 'video/mp4', 'video/x-msvideo', 'video/quicktime',
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    'application/x-tar', 'application/gzip'
  ]
};