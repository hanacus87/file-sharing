export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  // Check if password is empty
  if (!password) {
    return { isValid: true, errors: [], strength: 'weak' }; // Empty password is optional
  }

  // Minimum length
  if (password.length < 8) {
    errors.push('At least 8 characters required');
  }

  // Maximum length
  if (password.length > 128) {
    errors.push('Maximum 128 characters allowed');
  }

  // Complexity requirements
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const complexityCount = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;

  if (complexityCount < 3) {
    const missing = [];
    if (!hasUpperCase) missing.push('uppercase');
    if (!hasLowerCase) missing.push('lowercase');
    if (!hasNumbers) missing.push('numbers');
    if (!hasSpecialChar) missing.push('special characters');
    errors.push(`Need 3 of 4: ${missing.join(', ')}`);
  }

  // Common patterns
  const commonPatterns = [
    /^12345678/i,
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
      errors.push('Password is too common');
      break;
    }
  }

  // Repeated characters
  if (/(.)\1{3,}/.test(password)) {
    errors.push('Too many repeated characters');
  }

  // Determine strength
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  if (errors.length === 0) {
    if (password.length >= 12 && complexityCount === 4) {
      strength = 'strong';
    } else if (password.length >= 10 || complexityCount >= 3) {
      strength = 'medium';
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    strength
  };
}