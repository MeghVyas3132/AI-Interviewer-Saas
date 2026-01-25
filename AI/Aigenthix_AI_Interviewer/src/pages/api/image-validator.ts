/**
 * Image URL validation for Next.js image optimization
 * Prevents SSRF and validates image URLs before processing
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { validateImageUrl } from '@/lib/input-validation';

export function validateImageRequest(req: NextApiRequest): { valid: boolean; error?: string } {
  const { url, q } = req.query;
  
  // Next.js image optimization uses 'url' or 'q' parameter
  const imageUrl = (url as string) || (q as string);
  
  if (!imageUrl) {
    return { valid: false, error: 'Image URL is required' };
  }
  
  // Decode URL if encoded
  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(imageUrl);
  } catch {
    return { valid: false, error: 'Invalid URL encoding' };
  }
  
  // Validate the URL
  if (!validateImageUrl(decodedUrl)) {
    return { valid: false, error: 'Invalid or unauthorized image URL' };
  }
  
  return { valid: true };
}

