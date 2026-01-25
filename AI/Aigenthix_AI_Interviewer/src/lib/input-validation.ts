/**
 * Input validation and sanitization utilities
 * Following OWASP best practices for secure input handling
 */

import { z } from 'zod';

// Common validation schemas
export const idSchema = z.coerce.number().int().positive();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const examIdSchema = z.object({
  examId: idSchema.optional(),
});

export const subcategoryIdSchema = z.object({
  subcategoryId: idSchema.optional(),
});

// String sanitization - remove potentially dangerous characters
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Remove null bytes and control characters
  return input
    .replace(/\0/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
}

// URL validation for image optimization
export function validateImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsed = new URL(url, 'https://example.com');
    
    // Only allow https protocol
    if (parsed.protocol !== 'https:') return false;
    
    // Whitelist allowed domains for images
    const allowedDomains = [
      'placehold.co',
      'logo.clearbit.com',
      'localhost',
      '127.0.0.1',
    ];
    
    const hostname = parsed.hostname.toLowerCase();
    const isAllowed = allowedDomains.some(domain => 
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
    
    // Also allow relative URLs (for local images)
    if (url.startsWith('/')) return true;
    
    return isAllowed;
  } catch {
    return false;
  }
}

// SQL injection prevention - validate column names
const ALLOWED_COLUMN_NAMES = new Set([
  // Exam columns
  'name', 'description', 'is_active',
  // Subcategory columns
  'exam_id', 'name', 'description', 'is_active',
  // Question columns
  'exam_id', 'subcategory_id', 'category', 'subcategory', 'subsection', 'question', 'is_active',
  // CAT Question columns
  'category', 'subcategory', 'subsection', 'question', 'is_active',
  // Candidate columns
  'first_name', 'last_name', 'email', 'phone', 'exam_id', 'subcategory_id', 'resume_url', 'resume_file_path', 'resume_analysis_json', 'status', 'is_active',
  // Interview Session columns
  'candidate_id', 'job_role_id', 'resume_id', 'exam_id', 'subcategory_id', 'token', 'status', 'scheduled_time', 'scheduled_end_time', 'link_sent_at', 'started_at', 'completed_at', 'expires_at', 'results_json', 'questions_generated', 'interview_mode', 'is_active',
  // Job Position columns
  'title', 'department', 'description', 'requirements', 'experience_level', 'salary_range_min', 'salary_range_max', 'location', 'employment_type', 'status', 'exam_id', 'subcategory_id', 'is_active',
  // Resume columns
  'candidate_id', 'file_name', 'file_path', 'file_size', 'file_type', 'extracted_text', 'parsed_data', 'is_active',
  // Exam Config columns
  'exam_id', 'subcategory_id', 'num_questions', 'randomize_questions', 'is_active',
]);

export function validateColumnName(columnName: string): boolean {
  return ALLOWED_COLUMN_NAMES.has(columnName.toLowerCase());
}

// Sanitize object keys to prevent SQL injection via column names
export function sanitizeUpdateObject<T extends Record<string, any>>(
  updates: T,
  allowedKeys: Set<string>
): Partial<T> {
  const sanitized: Partial<T> = {};
  
  for (const [key, value] of Object.entries(updates)) {
    const lowerKey = key.toLowerCase();
    if (allowedKeys.has(lowerKey) && validateColumnName(lowerKey)) {
      sanitized[key as keyof T] = value;
    }
  }
  
  return sanitized;
}

// Email validation
export const emailSchema = z.string().email().max(255);

// Phone validation
export const phoneSchema = z.string().regex(/^[\d\s\-\+\(\)]+$/).max(20).optional();

// Question text validation
export const questionTextSchema = z.string()
  .min(10, 'Question must be at least 10 characters')
  .max(5000, 'Question must not exceed 5000 characters')
  .refine(
    (text) => {
      // Check for SQL injection patterns
      const dangerousPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/i,
        /(--|;|\/\*|\*\/|xp_|sp_)/i,
      ];
      return !dangerousPatterns.some(pattern => pattern.test(text));
    },
    { message: 'Question contains potentially dangerous content' }
  );

// Category/Subcategory validation
export const categorySchema = z.string()
  .min(1)
  .max(255)
  .refine(
    (text) => {
      const sanitized = sanitizeString(text);
      return sanitized.length > 0 && sanitized === text;
    },
    { message: 'Invalid category format' }
  );

// API request validation helper
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      };
    }
    return { success: false, error: 'Validation failed' };
  }
}

