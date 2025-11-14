// Security Configuration for Production
export const securityConfig = {
  // Content Security Policy
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    imgSrc: ["'self'", "data:", "https:", "blob:"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    connectSrc: ["'self'", "https://api.gemini.com", "https://images.unsplash.com", "https://images.pexels.com"],
    mediaSrc: ["'self'", "blob:"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    upgradeInsecureRequests: true,
  },
  
  // File upload restrictions
  fileUpload: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  },
  
  // API rate limiting
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window
    message: 'Too many requests, please try again later',
  },
  
  // Input validation
  validation: {
    maxTextLength: 10000,
    allowedImageDomains: [
      'images.unsplash.com',
      'images.pexels.com',
      'picsum.photos',
    ],
  },
};

// Sanitize user input
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
    .slice(0, securityConfig.validation.maxTextLength);
}

// Validate image URL
export function isValidImageUrl(url) {
  try {
    const urlObj = new URL(url);
    return securityConfig.validation.allowedImageDomains.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

// Validate file type
export function isValidFileType(file) {
  return securityConfig.fileUpload.allowedTypes.includes(file.type) &&
         file.size <= securityConfig.fileUpload.maxSize;
}