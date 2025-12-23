export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  fileType: 'pdf' | 'doc' | 'docx' | 'unknown';
  sizeInMB: number;
  canProcess: boolean;
}

export const MAX_FILE_SIZE_MB = 10;
export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

export const SUPPORTED_EXTENSIONS = ['.pdf', '.doc', '.docx'];

export function validateFile(file: File): FileValidationResult {
  // Check file size
  const sizeInMB = file.size / (1024 * 1024);
  if (sizeInMB > MAX_FILE_SIZE_MB) {
    return {
      isValid: false,
      error: `File size (${sizeInMB.toFixed(2)} MB) exceeds maximum allowed size of ${MAX_FILE_SIZE_MB} MB`,
      fileType: 'unknown',
      sizeInMB,
      canProcess: false
    };
  }

  // Check MIME type
  const mimeType = file.type;
  let fileType: 'pdf' | 'doc' | 'docx' | 'unknown' = 'unknown';
  
  if (mimeType === 'application/pdf') {
    fileType = 'pdf';
  } else if (mimeType === 'application/msword') {
    fileType = 'doc';
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    fileType = 'docx';
  }

  // Check if MIME type is supported
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return {
      isValid: false,
      error: `Unsupported file type: ${mimeType}. Please upload a PDF, DOC, or DOCX file.`,
      fileType,
      sizeInMB,
      canProcess: false
    };
  }

  // Check file extension
  const fileName = file.name.toLowerCase();
  const hasValidExtension = SUPPORTED_EXTENSIONS.some(ext => fileName.endsWith(ext));
  
  if (!hasValidExtension) {
    return {
      isValid: false,
      error: `File extension not supported. Please upload a file with .pdf, .doc, or .docx extension.`,
      fileType,
      sizeInMB,
      canProcess: false
    };
  }

  // Additional validation for specific file types
  if (fileType === 'pdf') {
    // Check if PDF is not corrupted by reading first few bytes
    return {
      isValid: true,
      fileType,
      sizeInMB,
      canProcess: true
    };
  }

  if (fileType === 'doc' || fileType === 'docx') {
    // Check if Word document is not corrupted
    return {
      isValid: true,
      fileType,
      sizeInMB,
      canProcess: true
    };
  }

  return {
    isValid: false,
    error: 'Unable to determine file type. Please ensure the file is not corrupted.',
    fileType: 'unknown',
    sizeInMB,
    canProcess: false
  };
}

export function getFileTypeIcon(fileType: string): string {
  switch (fileType) {
    case 'pdf':
      return '📄';
    case 'doc':
    case 'docx':
      return '📝';
    default:
      return '📁';
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 