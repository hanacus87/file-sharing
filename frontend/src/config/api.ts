// API configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:xxxx/api';

export const getApiUrl = (path: string) => {
  // Remove leading slash from path if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // In production, use the CloudFront URL from environment variable
  // In development, use the proxy or environment variable
  if (API_BASE_URL.startsWith('http')) {
    // Full URL provided (production or external API)
    return `${API_BASE_URL}/${cleanPath}`;
  } else {
    // Relative URL (development with proxy)
    return `${API_BASE_URL}/${cleanPath}`;
  }
};
