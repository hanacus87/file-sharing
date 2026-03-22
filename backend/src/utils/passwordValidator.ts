export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  // Minimum length
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  // Maximum length (prevent DoS with bcrypt)
  if (password.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }

  // Complexity requirements
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const complexityCount = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;

  if (complexityCount < 3) {
    errors.push('Password must contain at least 3 of the following: uppercase letters, lowercase letters, numbers, special characters');
  }

  // Common patterns to avoid
  const commonPatterns = [
    /^12345678/,
    /^password/i,
    /^qwerty/i,
    /^admin/i,
    /^letmein/i,
    /^welcome/i,
    /^monkey/i,
    /^dragon/i
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      errors.push('Password is too common or follows a predictable pattern');
      break;
    }
  }

  // Check for repeated characters
  if (/(.)\1{3,}/.test(password)) {
    errors.push('Password should not contain more than 3 repeated characters in a row');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function getPasswordStrengthScore(password: string): number {
  let score = 0;

  // Length score
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Complexity score
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;

  // Entropy bonus
  const uniqueChars = new Set(password).size;
  if (uniqueChars > password.length * 0.7) score += 1;

  return Math.min(score, 5); // Max score of 5
}