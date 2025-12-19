import { NextApiRequest, NextApiResponse } from 'next';
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Allow larger PDF files
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pdfData, fileName } = req.body;

    if (!pdfData || !fileName) {
      return res.status(400).json({ error: 'PDF data and filename are required' });
    }

    // Decode base64 PDF data
    const pdfBuffer = Buffer.from(pdfData, 'base64');
    
    // Create temporary file
    const tempFilePath = join(tmpdir(), `temp_${Date.now()}_${fileName}`);
    
    try {
      // Write PDF to temporary file
      await writeFile(tempFilePath, pdfBuffer);
      
      // Extract text using PyMuPDF via Python script
      const extractedText = await extractTextWithPyMuPDF(tempFilePath);
      
      // Clean up temporary file
      await unlink(tempFilePath);
      
      return res.status(200).json({
        success: true,
        text: extractedText,
        fileName: fileName
      });
      
    } catch (error) {
      // Clean up temporary file on error
      try {
        await unlink(tempFilePath);
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
      throw error;
    }
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract text from PDF'
    });
  }
}

async function extractTextWithPyMuPDF(pdfPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Python script that uses PyMuPDF
    const pythonScript = `
import fitz  # PyMuPDF
import sys
import json

def extract_pdf_text(pdf_path):
    try:
        # Open the PDF
        doc = fitz.open(pdf_path)
        
        if not doc:
            return json.dumps({"error": "Could not open PDF file"})
        
        text_content = []
        
        # Extract text from each page
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text = page.get_text()
            if text.strip():
                text_content.append(text.strip())
        
        doc.close()
        
        # Combine all text
        full_text = "\\n\\n".join(text_content)
        
        if not full_text.strip():
            return json.dumps({"error": "No text content found in PDF"})
        
        return json.dumps({"success": True, "text": full_text})
        
    except Exception as e:
        return json.dumps({"error": f"PDF processing error: {str(e)}"})
    finally:
        try:
            doc.close()
        except:
            pass

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "PDF path argument required"}))
        sys.exit(1)
    
    result = extract_pdf_text(sys.argv[1])
    print(result)
`;

    // Create temporary Python script
    const scriptPath = join(tmpdir(), `extract_pdf_${Date.now()}.py`);
    
    writeFile(scriptPath, pythonScript)
      .then(() => {
        // Execute Python script
        const pythonProcess = spawn('python3', [scriptPath, pdfPath]);
        
        let output = '';
        let errorOutput = '';
        
        pythonProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        pythonProcess.on('close', async (code) => {
          try {
            // Clean up Python script
            await unlink(scriptPath);
          } catch (cleanupError) {
            console.error('Failed to cleanup Python script:', cleanupError);
          }
          
          if (code !== 0) {
            reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
            return;
          }
          
          try {
            const result = JSON.parse(output);
            if (result.error) {
              reject(new Error(result.error));
            } else if (result.success && result.text) {
              resolve(result.text);
            } else {
              reject(new Error('No text extracted from PDF'));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse Python output: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`));
          }
        });
        
        pythonProcess.on('error', async (error) => {
          try {
            await unlink(scriptPath);
          } catch (cleanupError) {
            console.error('Failed to cleanup Python script:', cleanupError);
          }
          reject(new Error(`Failed to start Python process: ${error.message}`));
        });
        
        // Set timeout
        setTimeout(async () => {
          pythonProcess.kill();
          try {
            await unlink(scriptPath);
          } catch (cleanupError) {
            console.error('Failed to cleanup Python script:', cleanupError);
          }
          reject(new Error('PDF extraction timed out'));
        }, 30000); // 30 second timeout
        
      })
      .catch(reject);
  });
}
