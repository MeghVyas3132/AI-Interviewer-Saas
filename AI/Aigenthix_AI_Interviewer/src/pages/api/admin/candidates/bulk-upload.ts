import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { 
  createCandidate, 
  getCandidateByEmail,
  updateCandidate,
  getCandidateById
} from '@/lib/postgres-data-store';
import { getExams, getSubcategories } from '@/lib/postgres-data-store';
import { getAdminSession } from '@/lib/auth';

// Disable default body parser for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

interface CandidateRow {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  exam?: string;
  subcategory?: string;
  status?: string;
}

interface BulkUploadResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; email: string; error: string }>;
  reactivated: number;
  skipped: number;
}

// Helper function to get value from row object with case-insensitive matching
function getRowValue(row: any, possibleKeys: string[]): string {
  const lowerRow: any = {};
  Object.keys(row || {}).forEach(key => {
    lowerRow[key.toLowerCase().trim()] = row[key];
  });
  
  for (const key of possibleKeys) {
    const value = lowerRow[key.toLowerCase().trim()];
    if (value !== undefined && value !== null && value !== '') {
      return String(value).trim();
    }
  }
  return '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const user = await getAdminSession(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.setHeader('Allow', ['POST']).status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const form = formidable({
      uploadDir: './uploads/temp',
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB limit
    });

    // Ensure uploads directory exists
    if (!fs.existsSync('./uploads/temp')) {
      fs.mkdirSync('./uploads/temp', { recursive: true });
    }

    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({ 
        success: false, 
        error: 'File is required' 
      });
    }

    // Read file content
    const fileContent = fs.readFileSync(file.filepath);
    const fileName = file.originalFilename || '';
    const isExcel = fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls');
    const isCSV = fileName.toLowerCase().endsWith('.csv');

    if (!isExcel && !isCSV) {
      // Clean up temp file
      fs.unlinkSync(file.filepath);
      return res.status(400).json({ 
        success: false, 
        error: 'File must be Excel (.xlsx, .xls) or CSV (.csv)' 
      });
    }

    // Parse file
    let candidates: CandidateRow[] = [];
    
    if (isExcel) {
      const workbook = XLSX.read(fileContent, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      candidates = jsonData.map((row: any) => ({
        first_name: getRowValue(row, ['First Name', 'first_name', 'first name', 'FirstName', 'Firstname']),
        last_name: getRowValue(row, ['Last Name', 'last_name', 'last name', 'LastName', 'Lastname']),
        email: getRowValue(row, ['Email', 'email', 'e-mail', 'E-Mail']),
        phone: getRowValue(row, ['Phone', 'phone', 'Phone Number', 'phone_number', 'mobile', 'Mobile']),
        exam: getRowValue(row, ['Exam', 'exam', 'Exam Name', 'exam_name']),
        subcategory: getRowValue(row, ['Subcategory', 'subcategory', 'Sub Category', 'sub_category']),
        status: getRowValue(row, ['Status', 'status']) || 'active',
      }));
    } else {
      // Parse CSV
      const records = parse(fileContent.toString(), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
      
      candidates = records.map((row: any) => ({
        first_name: getRowValue(row, ['First Name', 'first_name', 'first name', 'FirstName', 'Firstname']),
        last_name: getRowValue(row, ['Last Name', 'last_name', 'last name', 'LastName', 'Lastname']),
        email: getRowValue(row, ['Email', 'email', 'e-mail', 'E-Mail']),
        phone: getRowValue(row, ['Phone', 'phone', 'Phone Number', 'phone_number', 'mobile', 'Mobile']),
        exam: getRowValue(row, ['Exam', 'exam', 'Exam Name', 'exam_name']),
        subcategory: getRowValue(row, ['Subcategory', 'subcategory', 'Sub Category', 'sub_category']),
        status: getRowValue(row, ['Status', 'status']) || 'active',
      }));
    }

    // Clean up temp file
    fs.unlinkSync(file.filepath);

    if (candidates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No candidates found in file. Please ensure the file has the correct format.' 
      });
    }

    // Fetch exams and subcategories for mapping
    const exams = await getExams();
    const subcategories = await getSubcategories();
    
    // Create mapping dictionaries
    const examMap = new Map<string, number>();
    exams.forEach(exam => {
      examMap.set(exam.name.toLowerCase().trim(), exam.id);
    });

    const subcategoryMap = new Map<string, { id: number; exam_id: number }>();
    subcategories.forEach(sub => {
      const key = `${sub.exam_id}_${sub.name.toLowerCase().trim()}`;
      subcategoryMap.set(key, { id: sub.id, exam_id: sub.exam_id });
    });

    // Process candidates
    const result: BulkUploadResult = {
      success: 0,
      failed: 0,
      errors: [],
      reactivated: 0,
      skipped: 0,
    };

    // Process in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (candidate, index) => {
          const rowNumber = i + index + 2; // +2 because Excel rows start at 1 and we have header
          
          try {
            // Validate required fields
            if (!candidate.first_name || !candidate.last_name || !candidate.email) {
              result.failed++;
              result.errors.push({
                row: rowNumber,
                email: candidate.email || 'N/A',
                error: 'Missing required fields: first_name, last_name, or email'
              });
              return;
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(candidate.email)) {
              result.failed++;
              result.errors.push({
                row: rowNumber,
                email: candidate.email,
                error: 'Invalid email format'
              });
              return;
            }

            // Map exam name to ID
            let examId: number | null = null;
            if (candidate.exam) {
              const examIdFromMap = examMap.get(candidate.exam.toLowerCase().trim());
              if (!examIdFromMap) {
                result.failed++;
                result.errors.push({
                  row: rowNumber,
                  email: candidate.email,
                  error: `Exam "${candidate.exam}" not found`
                });
                return;
              }
              examId = examIdFromMap;
            }

            // Map subcategory name to ID
            let subcategoryId: number | null = null;
            if (candidate.subcategory && examId) {
              const key = `${examId}_${candidate.subcategory.toLowerCase().trim()}`;
              const subcategoryData = subcategoryMap.get(key);
              if (!subcategoryData) {
                result.failed++;
                result.errors.push({
                  row: rowNumber,
                  email: candidate.email,
                  error: `Subcategory "${candidate.subcategory}" not found for exam "${candidate.exam}"`
                });
                return;
              }
              subcategoryId = subcategoryData.id;
            }

            // Check if candidate already exists
            const existingCandidate = await getCandidateByEmail(candidate.email);
            
            if (existingCandidate) {
              if (existingCandidate.is_active) {
                // Candidate exists and is active - skip
                result.skipped++;
                return;
              } else {
                // Reactivate and update
                await updateCandidate(existingCandidate.candidate_id, {
                  first_name: candidate.first_name,
                  last_name: candidate.last_name,
                  phone: candidate.phone || null,
                  exam_id: examId || null,
                  subcategory_id: subcategoryId || null,
                  status: candidate.status || 'active',
                  is_active: true
                });
                result.reactivated++;
                result.success++;
                return;
              }
            }

            // Create new candidate
            await createCandidate({
              first_name: candidate.first_name,
              last_name: candidate.last_name,
              email: candidate.email,
              phone: candidate.phone || null,
              exam_id: examId || null,
              subcategory_id: subcategoryId || null,
              resume_url: null,
              status: candidate.status || 'active',
              is_active: true
            });

            result.success++;
          } catch (error) {
            result.failed++;
            result.errors.push({
              row: rowNumber,
              email: candidate.email || 'N/A',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        })
      );
    }

    res.status(200).json({
      success: true,
      data: {
        total: candidates.length,
        ...result
      }
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

