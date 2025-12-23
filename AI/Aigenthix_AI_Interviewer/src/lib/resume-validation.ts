/**
 * Utility functions for resume validation
 * - Name matching/comparison
 * - File type validation
 */

/**
 * Normalizes a name for comparison by:
 * - Converting to lowercase
 * - Removing extra whitespace
 * - Removing special characters (keeping only letters, spaces, hyphens)
 * - Sorting name parts for order-independent comparison
 */
function normalizeName(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars except hyphens
    .replace(/\s+/g, ' ') // Normalize whitespace
    .split(' ')
    .filter(part => part.length > 0) // Remove empty parts
    .sort() // Sort for order-independent comparison
    .join(' ');
}

/**
 * Extracts name parts from a full name string
 * Handles formats like:
 * - "John Doe"
 * - "Doe, John"
 * - "John Michael Doe"
 * - "John M. Doe"
 */
function extractNameParts(name: string): { first: string; last: string; middle?: string } {
  if (!name) return { first: '', last: '' };
  
  // Handle "Last, First" format
  if (name.includes(',')) {
    const parts = name.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const last = parts[0];
      const firstMiddle = parts[1].split(/\s+/);
      return {
        first: firstMiddle[0] || '',
        last: last,
        middle: firstMiddle.slice(1).join(' ') || undefined
      };
    }
  }
  
  // Handle "First Middle Last" format
  const parts = name.trim().split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 1) {
    return { first: parts[0], last: '' };
  } else if (parts.length === 2) {
    return { first: parts[0], last: parts[1] };
  } else {
    // Assume first is first, last is last, middle is everything in between
    return {
      first: parts[0],
      last: parts[parts.length - 1],
      middle: parts.slice(1, -1).join(' ')
    };
  }
}

/**
 * Calculates the Levenshtein distance (edit distance) between two strings
 * Returns the minimum number of single-character edits needed to transform one string into another
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Create a matrix
  const matrix: number[][] = [];
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculates similarity ratio between two strings (0 to 1)
 * 1.0 means identical, lower values mean more different
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Checks if two name parts are similar (handles short forms vs full names and typos)
 * Examples: "Satya" vs "Sathyanarayanan", "John" vs "Jonathan", "KAPEKAR" vs "KHAPEKAR"
 */
function areNamePartsSimilar(part1: string, part2: string): boolean {
  if (!part1 || !part2) return false;
  
  // Exact match
  if (part1 === part2) return true;
  
  // Check if one is a prefix of the other (handles "Satya" vs "Sathyanarayanan")
  // Only consider if the shorter part is at least 3 characters to avoid false matches
  const shorter = part1.length < part2.length ? part1 : part2;
  const longer = part1.length >= part2.length ? part1 : part2;
  
  if (shorter.length >= 3 && longer.startsWith(shorter)) {
    return true;
  }
  
  // Check if one contains the other (for cases like "John" in "Johnny")
  if (longer.includes(shorter) && shorter.length >= 3) {
    return true;
  }
  
  // Fuzzy matching for typos and spelling variations (handles "KAPEKAR" vs "KHAPEKAR")
  // Consider similar if similarity is >= 85% and both parts are at least 3 characters
  if (shorter.length >= 3) {
    const similarity = calculateSimilarity(part1, part2);
    // For names 3-5 chars: require 80% similarity (allows 1 char difference)
    // For names 6+ chars: require 85% similarity (allows 1-2 char differences)
    const threshold = shorter.length <= 5 ? 0.80 : 0.85;
    if (similarity >= threshold) {
      return true;
    }
  }
  
  return false;
}

/**
 * Compares two names to determine if they match
 * Returns true if names are considered the same person
 * 
 * Matching strategies:
 * 1. Exact normalized match
 * 2. First and last name match (ignoring middle names/initials)
 * 3. Last name match + first name similarity (handles short forms like "Satya" vs "Sathyanarayanan")
 * 4. Partial match with at least 2 name parts matching
 */
export function compareNames(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  
  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);
  
  // Exact match after normalization
  if (normalized1 === normalized2) {
    return true;
  }
  
  // Extract name parts
  const parts1 = extractNameParts(name1);
  const parts2 = extractNameParts(name2);
  
  // Normalize individual parts
  const first1 = normalizeName(parts1.first);
  const last1 = normalizeName(parts1.last);
  const first2 = normalizeName(parts2.first);
  const last2 = normalizeName(parts2.last);
  
  // Both first and last names must match (case-insensitive)
  if (first1 && last1 && first2 && last2) {
    if (first1 === first2 && last1 === last2) {
      return true;
    }
  }
  
  // Last name match + first name similarity (handles "Satya KS" vs "Sathyanarayanan KS")
  if (first1 && last1 && first2 && last2 && last1 === last2) {
    if (areNamePartsSimilar(first1, first2)) {
      return true;
    }
  }
  
  // First name match + last name similarity (handles "Priyanshu KAPEKAR" vs "Priyanshu KHAPEKAR")
  if (first1 && last1 && first2 && last2 && first1 === first2) {
    if (areNamePartsSimilar(last1, last2)) {
      return true;
    }
  }
  
  // Both first and last names are similar (handles variations in both)
  if (first1 && last1 && first2 && last2) {
    if (areNamePartsSimilar(first1, first2) && areNamePartsSimilar(last1, last2)) {
      return true;
    }
  }
  
  // Check if at least 2 significant name parts match
  // This handles cases like "John Doe" vs "John Michael Doe"
  const allParts1 = [first1, last1, parts1.middle ? normalizeName(parts1.middle) : ''].filter(p => p.length > 1);
  const allParts2 = [first2, last2, parts2.middle ? normalizeName(parts2.middle) : ''].filter(p => p.length > 1);
  
  if (allParts1.length >= 2 && allParts2.length >= 2) {
    const matchingParts = allParts1.filter(part => 
      allParts2.some(part2 => {
        // Exact match
        if (part === part2) return true;
        // Substring match
        if (part2.includes(part) || part.includes(part2)) return true;
        // Similar name match (handles short forms)
        return areNamePartsSimilar(part, part2);
      })
    );
    
    // If at least 2 parts match, consider it a match
    if (matchingParts.length >= 2) {
      return true;
    }
  }
  
  // More lenient: if last name matches (exact or similar) and at least one other part is similar
  if (last1 && last2 && last1.length > 0 && last2.length > 0) {
    const lastNameMatch = last1 === last2 || areNamePartsSimilar(last1, last2);
    
    if (lastNameMatch) {
      // Check if first names are similar
      if (first1 && first2 && areNamePartsSimilar(first1, first2)) {
        return true;
      }
      // Check if any middle name parts are similar
      if (parts1.middle && parts2.middle) {
        const middle1 = normalizeName(parts1.middle);
        const middle2 = normalizeName(parts2.middle);
        if (areNamePartsSimilar(middle1, middle2)) {
          return true;
        }
      }
    }
  }
  
  // More lenient: if first name matches (exact or similar) and last name is similar
  if (first1 && first2 && first1.length > 0 && first2.length > 0) {
    const firstNameMatch = first1 === first2 || areNamePartsSimilar(first1, first2);
    
    if (firstNameMatch && last1 && last2 && areNamePartsSimilar(last1, last2)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validates if a file is a resume based on:
 * - File extension (.pdf, .doc, .docx)
 * - MIME type (if available)
 */
export function isValidResumeFile(filename: string, mimetype?: string): boolean {
  if (!filename) return false;
  
  const validExtensions = ['.pdf', '.doc', '.docx'];
  const lowerFilename = filename.toLowerCase();
  
  // Check file extension
  const hasValidExtension = validExtensions.some(ext => lowerFilename.endsWith(ext));
  
  if (!hasValidExtension) {
    return false;
  }
  
  // If mimetype is provided, validate it
  if (mimetype) {
    const validMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    return validMimeTypes.includes(mimetype);
  }
  
  return true;
}

/**
 * Validates resume name against registered candidate name
 * Returns validation result with details
 */
export interface NameValidationResult {
  isValid: boolean;
  registeredName: string;
  resumeName: string;
  errorMessage?: string;
}

export function validateResumeName(
  registeredName: string,
  resumeName: string
): NameValidationResult {
  if (!registeredName || !registeredName.trim()) {
    return {
      isValid: false,
      registeredName: registeredName || '',
      resumeName: resumeName || '',
      errorMessage: 'Registered candidate name is missing'
    };
  }
  
  if (!resumeName || !resumeName.trim()) {
    return {
      isValid: false,
      registeredName,
      resumeName: resumeName || '',
      errorMessage: 'Could not extract name from resume. Please ensure your resume contains your name.'
    };
  }
  
  const namesMatch = compareNames(registeredName, resumeName);
  
  if (!namesMatch) {
    return {
      isValid: false,
      registeredName,
      resumeName,
      errorMessage: `Name mismatch: The name in the resume ("${resumeName}") does not match the registered name ("${registeredName}"). Please upload a resume with the correct name.`
    };
  }
  
  return {
    isValid: true,
    registeredName,
    resumeName
  };
}


