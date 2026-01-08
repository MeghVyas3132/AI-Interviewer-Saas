// Build-safe file converter that completely avoids canvas dependency issues
export interface ConversionResult {
  success: boolean;
  text?: string;
  error?: string;
  mimeType: string;
}

// Global type declarations for runtime-loaded libraries
declare global {
  interface Window {
    pdfjsLib: any;
    mammoth: any;
  }
}

// Runtime-only library loading - completely build-safe
let librariesLoaded = false;
let pdfjsLib: any = null;
let mammoth: any = null;
let loadingPromise: Promise<{ pdfjsLib: any; mammoth: any }> | null = null;

async function loadLibraries(): Promise<{ pdfjsLib: any; mammoth: any }> {
  if (librariesLoaded && pdfjsLib && mammoth) {
    return { pdfjsLib, mammoth };
  }

  if (typeof window === 'undefined') {
    return { pdfjsLib: null, mammoth: null };
  }

  // If already loading, wait for that promise
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise(async (resolve, reject) => {
    try {
      console.log('Loading PDF processing libraries...');
      
      // Load PDF.js
      if (!pdfjsLib) {
        await loadPDFJS();
      }
      
      // Load mammoth
      if (!mammoth) {
        await loadMammoth();
      }
      
      // Verify libraries are loaded
      if (!pdfjsLib || !mammoth) {
        throw new Error('Failed to load required libraries');
      }
      
      librariesLoaded = true;
      console.log('All libraries loaded successfully');
      resolve({ pdfjsLib, mammoth });
    } catch (error) {
      console.error('Failed to load libraries:', error);
      librariesLoaded = false;
      loadingPromise = null;
      reject(error);
    }
  });

  return loadingPromise;
}

async function loadPDFJS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (pdfjsLib) {
      resolve();
      return;
    }

    // Check if already loaded
    if (window.pdfjsLib) {
      pdfjsLib = window.pdfjsLib;
      if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      }
      resolve();
      return;
    }

        const script = document.createElement('script');
        script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`;
        script.onload = () => {
      try {
          // @ts-ignore - pdfjsLib is loaded globally
          pdfjsLib = window.pdfjsLib;
          if (pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
          console.log('PDF.js loaded successfully');
          resolve();
        } else {
          reject(new Error('PDF.js failed to load properly'));
          }
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js script'));
    document.head.appendChild(script);
  });
}

async function loadMammoth(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mammoth) {
      resolve();
      return;
    }

    // Check if already loaded
    if (window.mammoth) {
      mammoth = window.mammoth;
      resolve();
      return;
    }

        const script = document.createElement('script');
        script.src = `https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js`;
        script.onload = () => {
      try {
          // @ts-ignore - mammoth is loaded globally
          mammoth = window.mammoth;
        if (mammoth) {
          console.log('Mammoth loaded successfully');
          resolve();
        } else {
          reject(new Error('Mammoth failed to load properly'));
        }
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error('Failed to load Mammoth script'));
    document.head.appendChild(script);
  });
}

export async function convertFileToText(file: File): Promise<ConversionResult> {
  try {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'File conversion is only available in the browser',
        mimeType: file.type
      };
    }
    
    const mimeType = file.type;
    
    if (mimeType === 'application/pdf') {
      return await convertPDFToText(file);
    } else if (mimeType === 'application/msword' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return await convertWordToText(file);
    } else {
      return {
        success: false,
        error: `Unsupported file type: ${mimeType}`,
        mimeType
      };
    }
  } catch (error) {
    console.error('File conversion error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during file conversion',
      mimeType: file.type
    };
  }
}

async function convertPDFToText(file: File): Promise<ConversionResult> {
  try {
    console.log('Starting PDF conversion for:', file.name);
    
    // Try to load libraries with retry mechanism
    let { pdfjsLib } = await loadLibrariesWithRetry();
    if (!pdfjsLib) {
      return {
        success: false,
        error: 'PDF processing library not available. Please refresh the page and try again.',
        mimeType: 'application/pdf'
      };
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Check PDF header
    const header = new TextDecoder().decode(uint8Array.slice(0, 4));
    if (!header.startsWith('%PDF')) {
      return {
        success: false,
        error: 'Invalid PDF file: File does not appear to be a valid PDF',
        mimeType: 'application/pdf'
      };
    }

    console.log('PDF header valid, loading document...');
    
    // Try primary PDF parsing method
    try {
      return await parsePDFWithPDFJS(pdfjsLib, uint8Array);
    } catch (primaryError) {
      console.log('Primary PDF parsing failed, trying fallback method...', primaryError);
      
      // Try fallback method
      try {
        return await parsePDFFallback(uint8Array);
      } catch (fallbackError) {
        console.log('Fallback PDF parsing also failed:', fallbackError);
        throw primaryError; // Throw the original error for better debugging
      }
    }
  } catch (error) {
    console.error('PDF conversion failed:', error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('Invalid PDF')) {
        return {
          success: false,
          error: 'The PDF file appears to be corrupted or invalid',
          mimeType: 'application/pdf'
        };
      } else if (error.message.includes('password')) {
        return {
          success: false,
          error: 'The PDF is password protected. Please remove the password and try again',
          mimeType: 'application/pdf'
        };
      } else if (error.message.includes('timeout')) {
        return {
          success: false,
          error: 'PDF processing timed out. The file might be too large or complex',
          mimeType: 'application/pdf'
        };
      }
    }
    
    // Provide more specific error messages and solutions
    let errorMessage = 'Failed to extract text from PDF file';
    let solution = '';
    
    if (error instanceof Error) {
      if (error.message.includes('empty') || error.message.includes('no readable text')) {
        errorMessage = 'PDF contains no readable text';
        solution = 'This may be an image-based PDF or scanned document. Try converting it to a text-based PDF using a PDF editor.';
      } else if (error.message.includes('corrupted')) {
        errorMessage = 'PDF file appears to be corrupted';
        solution = 'Try opening the PDF in a PDF viewer to verify it\'s not corrupted, then re-upload.';
      } else if (error.message.includes('password')) {
        errorMessage = 'PDF is password protected';
        solution = 'Remove the password protection and try again.';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'PDF processing timed out';
        solution = 'The file might be too large or complex. Try reducing the file size or simplifying the content.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      success: false,
      error: solution ? `${errorMessage}. ${solution}` : errorMessage,
      mimeType: 'application/pdf'
    };
  }
}

async function loadLibrariesWithRetry(maxRetries: number = 3): Promise<{ pdfjsLib: any; mammoth: any }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting to load libraries (attempt ${attempt}/${maxRetries})`);
      const result = await loadLibraries();
      
      if (result.pdfjsLib && result.mammoth) {
        console.log('Libraries loaded successfully on attempt', attempt);
        return result;
      }
      
      throw new Error('Libraries not properly loaded');
    } catch (error) {
      console.error(`Library loading attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        console.error('All library loading attempts failed');
        throw new Error('Failed to load PDF processing libraries. This may be due to network issues or browser compatibility. Please refresh the page and try again.');
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Failed to load libraries after all retry attempts');
}

async function parsePDFWithPDFJS(pdfjsLib: any, uint8Array: Uint8Array): Promise<ConversionResult> {
  try {
    // Load PDF document using PDF.js with minimal options for better compatibility
    const loadingTask = pdfjsLib.getDocument({ 
      data: uint8Array,
      verbosity: 0,
      disableFontFace: true,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
      maxImageSize: -1, // Disable image size limit
      cMapUrl: undefined, // Disable CMap loading
      cMapPacked: false
    });
    
    const pdf = await loadingTask.promise;
    console.log('PDF loaded successfully, pages:', pdf.numPages);
    
    let fullText = '';
    let successfulPages = 0;
    
    // Extract text from all pages
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        console.log(`Processing page ${pageNum}/${pdf.numPages}`);
        const page = await pdf.getPage(pageNum);
        
        // Get text content with timeout
        const textContent = await Promise.race([
          page.getTextContent(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Page processing timeout')), 5000)
          )
        ]);
        
        // Combine text items from the page
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .filter((text: string) => text.trim().length > 0)
          .join(' ');
        
        if (pageText.trim().length > 0) {
          fullText += pageText + '\n';
          successfulPages++;
          console.log(`Page ${pageNum} text length:`, pageText.length);
        } else {
          console.log(`Page ${pageNum} has no text content`);
        }
      } catch (pageError) {
        console.error(`Error processing page ${pageNum}:`, pageError);
        // Continue with other pages
        fullText += `[Page ${pageNum} could not be processed]\n`;
      }
    }
    
    const extractedText = fullText.trim();
    console.log('Total extracted text length:', extractedText.length, 'Successful pages:', successfulPages);
    
    if (!extractedText || extractedText.length < 10) {
      throw new Error('PDF appears to be empty or contains no readable text. This may be an image-based PDF or scanned document.');
    }
    
    if (successfulPages === 0) {
      throw new Error('No pages could be processed. The PDF may be corrupted or password-protected.');
    }

    return {
      success: true,
      text: extractedText,
      mimeType: 'application/pdf'
    };
  } catch (error) {
    console.error('PDF.js parsing failed:', error);
    throw error;
  }
}

async function parsePDFFallback(uint8Array: Uint8Array): Promise<ConversionResult> {
  console.log('Using fallback PDF parsing method...');
  
  try {
    // Method 1: Try using browser's built-in PDF capabilities
    try {
      const result = await parsePDFWithBrowserAPI(uint8Array);
      if (result.success) {
        return result;
      }
    } catch (error) {
      console.log('Browser API method failed:', error);
    }
    
    // Method 2: Try PyMuPDF server-side extraction (most reliable)
    try {
      const result = await parsePDFWithPyMuPDF(uint8Array);
      if (result.success) {
        return result;
      }
    } catch (error) {
      console.log('PyMuPDF method failed:', error);
    }
    
    // Method 3: Convert to base64 and try to use iframe (legacy fallback)
    try {
      const result = await parsePDFWithIframe(uint8Array);
      if (result.success) {
        return result;
      }
    } catch (error) {
      console.log('Iframe method failed:', error);
    }
    
    // If all fallback methods fail
    throw new Error('All PDF parsing methods failed');
  } catch (error) {
    throw new Error(`Fallback PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function parsePDFWithBrowserAPI(uint8Array: Uint8Array): Promise<ConversionResult> {
  return new Promise((resolve, reject) => {
    try {
      // Create a blob URL for the PDF
      const blob = new Blob([uint8Array], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      // Create an iframe to load the PDF
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(iframe);
        reject(new Error('Browser PDF parsing timed out'));
      }, 15000); // 15 second timeout
      
      iframe.onload = () => {
        try {
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          document.body.removeChild(iframe);
          
          // Try to extract text from the iframe content
          let extractedText = '';
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
              extractedText = iframeDoc.body?.textContent || '';
            }
          } catch (e) {
            // Cross-origin restrictions might prevent access
            console.log('Could not access iframe content due to CORS');
          }
          
          if (extractedText && extractedText.trim().length > 50) {
            resolve({
              success: true,
              text: extractedText.trim(),
              mimeType: 'application/pdf'
            });
          } else {
            // If we can't extract text, return error instead of placeholder
            resolve({
              success: false,
              error: 'Unable to extract readable text from PDF. The file may be image-based or corrupted.',
              mimeType: 'application/pdf'
            });
          }
        } catch (error) {
          reject(error);
        }
      };
      
      iframe.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        document.body.removeChild(iframe);
        reject(new Error('Browser PDF parsing failed'));
      };
      
      document.body.appendChild(iframe);
    } catch (error) {
      reject(error);
    }
  });
}

async function parsePDFWithPyMuPDF(uint8Array: Uint8Array): Promise<ConversionResult> {
  try {
    console.log('Attempting PyMuPDF server-side extraction...');
    
    // Convert to base64 for API transmission
    const base64 = btoa(String.fromCharCode(...uint8Array));
    
    // Call the PyMuPDF API endpoint
    const response = await fetch('/api/pdf-extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdfData: base64,
        fileName: 'uploaded.pdf'
      })
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.text) {
      console.log('PyMuPDF extraction successful, text length:', result.text.length);
      return {
        success: true,
        text: result.text,
        mimeType: 'application/pdf'
      };
    } else {
      throw new Error(result.error || 'PyMuPDF extraction failed');
    }
    
  } catch (error) {
    console.error('PyMuPDF extraction error:', error);
    throw error;
  }
}

async function parsePDFWithIframe(uint8Array: Uint8Array): Promise<ConversionResult> {
  return new Promise((resolve, reject) => {
    try {
      // Convert to base64 and try to use iframe (this is a legacy fallback method)
    const base64 = btoa(String.fromCharCode(...uint8Array));
    const dataUrl = `data:application/pdf;base64,${base64}`;
    
    // Try to create an iframe to extract text (this is a fallback method)
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = dataUrl;
    
      const timeout = setTimeout(() => {
        reject(new Error('Legacy iframe PDF parsing timed out'));
      }, 10000); // 10 second timeout
      
      iframe.onload = () => {
        try {
          clearTimeout(timeout);
          document.body.removeChild(iframe);
          
          // This fallback method has limitations, so we'll return an error instead of placeholder
          resolve({
            success: false,
            error: 'Legacy fallback method could not extract readable text from PDF.',
            mimeType: 'application/pdf'
          });
        } catch (error) {
          reject(error);
        }
      };
      
      iframe.onerror = () => {
        clearTimeout(timeout);
        document.body.removeChild(iframe);
        reject(new Error('Legacy iframe PDF parsing failed'));
      };
      
      document.body.appendChild(iframe);
  } catch (error) {
      reject(error);
  }
  });
}

async function convertWordToText(file: File): Promise<ConversionResult> {
  try {
    if (file.name.endsWith('.docx')) {
      return await convertDocxToText(file);
    } else if (file.name.endsWith('.doc')) {
      return {
        success: false,
        error: '.doc files are not supported. Please convert to .docx or PDF format.',
        mimeType: 'application/msword'
      };
    } else {
      return {
        success: false,
        error: 'Unsupported Word document format',
        mimeType: file.type
      };
    }
  } catch (error) {
    return {
      success: false,
      error: 'Failed to process Word document',
      mimeType: file.type
    };
  }
}

async function convertDocxToText(file: File): Promise<ConversionResult> {
  try {
    const { mammoth } = await loadLibraries();
    if (!mammoth) {
      return {
        success: false,
        error: 'Word document processing library not available',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Check ZIP header for .docx files
    const zipHeader = uint8Array.slice(0, 4);
    if (zipHeader[0] !== 0x50 || zipHeader[1] !== 0x4B || zipHeader[2] !== 0x03 || zipHeader[3] !== 0x04) {
      return {
        success: false,
        error: 'Invalid .docx file: File does not appear to be a valid Word document',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
    }

    // Extract text using mammoth
    const result = await mammoth.extractRawText({ arrayBuffer });
    const extractedText = result.value.trim();
    
    if (!extractedText || extractedText.length < 50) {
      return {
        success: false,
        error: 'Word document appears to be empty or contains no readable text',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
    }

    return {
      success: true,
      text: extractedText,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  } catch (error) {
    return {
      success: false,
      error: 'Failed to extract text from .docx file',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  }
}

export function createDataURI(file: File, textContent: string): string {
  // Create a data URI with the extracted text content
  const base64Content = btoa(unescape(encodeURIComponent(textContent)));
  return `data:text/plain;base64,${base64Content}`;
}

// Debug function to test PDF parsing
export async function testPDFParsing(file: File): Promise<void> {
  if (typeof window === 'undefined') return;
  
  console.log('=== PDF Parsing Test ===');
  console.log('File name:', file.name);
  console.log('File size:', file.size, 'bytes');
  console.log('File type:', file.type);
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Check first few bytes
    const header = new TextDecoder().decode(uint8Array.slice(0, 20));
    console.log('File header:', header);
    
    // Check if it's a valid PDF
    if (header.startsWith('%PDF')) {
      console.log('Valid PDF header detected');
      
      // Try to get PDF version
      const versionMatch = header.match(/%PDF-(\d+\.\d+)/);
      if (versionMatch) {
        console.log('PDF version:', versionMatch[1]);
      }
    } else {
      console.log('Invalid PDF header');
    }
    
    console.log('=== End Test ===');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Function to check if libraries are loaded
export async function checkLibrariesStatus(): Promise<{ pdfjsLib: boolean; mammoth: boolean }> {
  try {
    const { pdfjsLib: pdfLib, mammoth: mammothLib } = await loadLibraries();
    return {
      pdfjsLib: !!pdfLib,
      mammoth: !!mammothLib
    };
  } catch (error) {
    console.error('Failed to check library status:', error);
    return {
      pdfjsLib: false,
      mammoth: false
    };
  }
} 