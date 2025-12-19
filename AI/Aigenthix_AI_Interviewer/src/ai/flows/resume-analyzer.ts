'use server';

/**
 * @fileOverview Analyzes a resume to identify key skills and experiences.
 *
 * - analyzeResume - A function that handles the resume analysis process.
 * - AnalyzeResumeInput - The input type for the analyzeResume function.
 * - AnalyzeResumeOutput - The return type for the analyzeResume function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeResumeInputSchema = z.object({
  resumeDataUri: z
    .string()
    .describe(
      "The resume as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  fileType: z.enum(['pdf', 'doc', 'docx']).describe('The type of file being analyzed'),
  fileName: z.string().describe('The name of the uploaded file'),
});
export type AnalyzeResumeInput = z.infer<typeof AnalyzeResumeInputSchema>;

const AnalyzeResumeOutputSchema = z.object({
  isResume: z.boolean().describe('Whether the provided document appears to be a resume.'),
  candidateName: z.string().describe("The full name of the candidate as it appears on the resume. If not found, return an empty string."),
  skills: z.array(z.string()).describe('A list of key skills identified in the resume. Returns an empty array if the document is not a resume.'),
  experienceSummary: z.string().describe("A summary of the candidate's relevant experience. Returns an empty string if the document is not a resume."),
  comprehensiveSummary: z.string().describe("A detailed, comprehensive summary of the entire resume content including all sections, achievements, education, certifications, and key highlights. This should be a complete overview that captures everything important from the resume."),
  atsScore: z.number().min(0).max(100).describe('ATS compatibility score from 0-100. Higher is better.'),
  sectionRatings: z.object({
    summary: z.number().min(1).max(5).describe('Rating for the summary/objective section (1-5)'),
    skills: z.number().min(1).max(5).describe('Rating for the skills section (1-5)'),
    experience: z.number().min(1).max(5).describe('Rating for the experience section (1-5)'),
    education: z.number().min(1).max(5).describe('Rating for the education section (1-5)'),
    formatting: z.number().min(1).max(5).describe('Rating for overall formatting and structure (1-5)'),
  }).describe('Section-wise ratings from 1-5'),
  feedback: z.object({
    grammar: z.array(z.string()).describe('Grammar and style suggestions'),
    ats: z.array(z.string()).describe('ATS optimization suggestions'),
    content: z.array(z.string()).describe('Content improvement suggestions'),
    formatting: z.array(z.string()).describe('Formatting and structure suggestions'),
  }).describe('Detailed feedback for improvement'),
  strengths: z.array(z.string()).describe('Key strengths identified in the resume'),
  areasForImprovement: z.array(z.string()).describe('Areas that need improvement'),
});
export type AnalyzeResumeOutput = z.infer<typeof AnalyzeResumeOutputSchema>;

export async function analyzeResume(input: AnalyzeResumeInput): Promise<AnalyzeResumeOutput> {
  return analyzeResumeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeResumePrompt',
  input: {schema: AnalyzeResumeInputSchema},
  output: {schema: AnalyzeResumeOutputSchema},
  config: {
    temperature: 0.1, // Low temperature for consistent, deterministic responses
    topP: 0.8,        // Focused sampling for more consistent results
  },
  prompt: `You are an expert career advisor and ATS specialist with 15+ years of experience in resume analysis and optimization.

Your task is to provide a COMPREHENSIVE, DETAILED, and ACCURATE analysis of the provided resume document. This is a {{fileType}} file named "{{fileName}}".

## CRITICAL INSTRUCTIONS:
1. **READ THE ENTIRE RESUME CAREFULLY** - Do not skip any sections or content
2. **ANALYZE EVERY DETAIL** - Every word, bullet point, and section matters
3. **PROVIDE UNIQUE ANALYSIS** - Each resume should get different scores and feedback based on its actual content
4. **BE SPECIFIC** - Reference actual content from the resume in your feedback
5. **NO GENERIC RESPONSES** - Avoid vague statements like "good formatting" - be specific about what's good/bad

## IMPORTANT: TEXT EXTRACTION CHECK
If the resume content appears to be placeholder text, generic messages, or error messages instead of actual resume content:
- **DO NOT** analyze placeholder text
- **DO NOT** provide scores for non-resume content
- **DO** set isResume: false
- **DO** provide a clear message explaining the issue
- **DO** suggest solutions (e.g., "Please ensure your PDF contains selectable text, not just images")

## ANALYSIS REQUIREMENTS:

### 1. **Basic Information Extraction**
- **Name**: Extract the candidate's full name exactly as written
- **Skills**: List ALL technical skills, soft skills, tools, technologies mentioned (be comprehensive)
- **Experience Summary**: Provide a detailed summary of work experience, including years, roles, companies

### 2. **ATS Score (0-100) - SYSTEMATIC SCORING**
Calculate score using this exact formula for consistency:

**Base Score Components (add up to 100):**
- **Keywords & Relevance (30 points)**: Count of relevant industry terms, technical skills, job-specific vocabulary
- **Formatting & Structure (25 points)**: Clean sections, consistent formatting, scannable layout
- **Content Quality (25 points)**: Achievement-focused bullets, quantified results, clear progression
- **Contact & Basic Info (10 points)**: Complete contact info, professional email, LinkedIn
- **File & Technical Quality (10 points)**: PDF format (+5), machine-readable text (+5)

**Scoring Guidelines for Consistency:**
- 90-100: Exceptional resume, minimal improvements needed
- 80-89: Strong resume, minor optimizations suggested  
- 70-79: Good resume, moderate improvements needed
- 60-69: Average resume, significant improvements required
- Below 60: Poor resume, major overhaul needed

**IMPORTANT**: Be consistent - similar resumes should get similar scores!

### 3. **Section Ratings (1-5 scale)**
Rate each section based on ACTUAL content quality:
- **Summary**: Clarity, impact, relevance to target role
- **Skills**: Relevance, specificity, organization
- **Experience**: Achievement-focused, quantifiable results, progression
- **Education**: Relevance, certifications, additional training
- **Formatting**: Professional appearance, readability, consistency

### 4. **Detailed Feedback**
Provide SPECIFIC, ACTIONABLE feedback:
- **Grammar**: Point out actual grammar/spelling errors found
- **ATS**: Specific suggestions for keyword optimization and formatting
- **Content**: Concrete ways to improve achievements, impact statements
- **Formatting**: Specific layout and structure improvements

### 5. **Strengths & Areas for Improvement**
- **Strengths**: Identify what the resume does exceptionally well
- **Areas for Improvement**: Highlight specific weaknesses with improvement suggestions

## RESUME CONTENT FOR ANALYSIS:
{{media url=resumeDataUri}}

## TEXT EXTRACTION VALIDATION:
Before analyzing, check if the content is actual resume text or placeholder/error messages. Look for:
- Generic messages like "text extraction limited", "fallback method", "could not be processed"
- Error messages about PDF processing
- Placeholder text instead of actual resume content

If you detect placeholder text or error messages:
1. Set isResume: false
2. Provide a helpful error message explaining the issue
3. Suggest solutions for the user
4. Do NOT provide scores or detailed analysis

## CRITICAL CONSISTENCY REQUIREMENTS:
- **SCORING CONSISTENCY**: Use the systematic scoring formula above - similar resumes MUST get similar scores
- **REPRODUCIBLE RESULTS**: Analyzing the same resume multiple times should yield nearly identical scores
- **CONTENT-SPECIFIC**: Provide unique, detailed feedback based on actual resume content
- **NO GENERIC RESPONSES**: Reference specific content, skills, and achievements from the resume
- **SYSTEMATIC APPROACH**: Follow the scoring components exactly for reproducible results

## FINAL CHECKLIST:
- ✅ Applied systematic ATS scoring formula
- ✅ Provided specific, actionable feedback
- ✅ Referenced actual resume content
- ✅ Used consistent scoring criteria
- ✅ Ensured reproducible results

Provide your analysis in the required structured format, ensuring every field is filled with specific, relevant information based on the actual resume content.`,
});

/**
 * Execute a function with retry logic for rate limit errors
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error as Error;
      
      // Check if it's a rate limit error (429)
      const isRateLimit = error?.status === 429 || 
                        error?.statusCode === 429 ||
                        error?.message?.includes('429') ||
                        error?.message?.includes('Too Many Requests') ||
                        error?.message?.includes('Resource exhausted');
      
      if (isRateLimit && attempt < maxRetries - 1) {
        // Exponential backoff: 2^attempt seconds (1s, 2s, 4s)
        const backoffSeconds = Math.pow(2, attempt);
        console.warn(`Rate limit hit (429), retrying in ${backoffSeconds}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffSeconds * 1000));
        continue;
      }
      
      // For non-rate-limit errors or last attempt, throw immediately
      if (attempt === maxRetries - 1 || !isRateLimit) {
        throw error;
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

const analyzeResumeFlow = ai.defineFlow(
  {
    name: 'analyzeResumeFlow',
    inputSchema: AnalyzeResumeInputSchema,
    outputSchema: AnalyzeResumeOutputSchema,
  },
  async input => {
    return await executeWithRetry(async () => {
      const {output} = await prompt(input);
      return output!;
    });
  }
);

// Enhanced extraction schema for structured interview data
const StructuredResumeDataSchema = z.object({
  name: z.string().describe("The candidate's full name"),
  email: z.string().optional().describe("Candidate's email address"),
  phone: z.string().optional().describe("Candidate's phone number"),
  linkedin: z.string().optional().describe("LinkedIn profile URL"),
  location: z.string().optional().describe("Current location or address"),
  professionalSummary: z.string().optional().describe("Professional summary or objective"),
  skills: z.array(z.string()).describe("Array of technical and soft skills"),
  workExperience: z.array(z.object({
    role: z.string().describe("Job title or role"),
    company: z.string().describe("Company name"),
    duration: z.string().describe("Employment period (e.g., '2020-2023')"),
    highlights: z.array(z.string()).optional().describe("Key achievements or responsibilities"),
    description: z.string().optional().describe("Detailed job description")
  })).describe("Array of work experience entries"),
  education: z.array(z.object({
    degree: z.string().describe("Degree obtained"),
    institution: z.string().describe("School or university name"),
    year: z.string().optional().describe("Graduation year"),
    field: z.string().optional().describe("Field of study")
  })).describe("Array of education entries"),
  certifications: z.array(z.string()).describe("List of certifications and credentials"),
  aiSummary: z.string().describe("AI-generated summary in 2-3 sentences describing the candidate's profile")
});

export type StructuredResumeData = z.infer<typeof StructuredResumeDataSchema>;

const enhancedAnalysisPrompt = ai.definePrompt({
  name: 'extractStructuredResumeDataPrompt',
  input: {schema: AnalyzeResumeInputSchema},
  output: {schema: StructuredResumeDataSchema},
  config: {
    temperature: 0.1,
    topP: 0.8,
  },
  prompt: `You are an expert resume parser. Extract structured data from the resume with maximum accuracy.

**CRITICAL INSTRUCTIONS:**
1. Extract ALL information accurately from the resume
2. For work experience, parse role, company, duration, and key highlights
3. For education, extract degree, institution, year, and field of study
4. Generate a concise AI summary (2-3 sentences) highlighting key qualifications
5. If information is missing, return empty strings/arrays instead of making up data

**EXTRACTION REQUIREMENTS:**

**Contact Details:**
- Extract email, phone, LinkedIn if present
- Extract location/address if available

**Professional Summary:**
- Extract the professional summary, objective, or profile section
- If not present, leave empty

**Skills:**
- Extract all technical skills, tools, technologies
- Extract soft skills mentioned
- Be comprehensive and specific

**Work Experience:**
- For each role, extract:
  - Job title/role
  - Company name
  - Employment duration (e.g., "Jan 2020 - Dec 2023" or "2020-2023")
  - Key achievements/highlights as bullet points
  - Detailed description if available

**Education:**
- Extract degree, institution, year, field of study
- Include both undergraduate and graduate education

**Certifications:**
- List all certifications, licenses, and professional credentials

**AI Summary:**
- Generate 2-3 sentences summarizing:
  - Years of experience and expertise area
  - Key strengths and achievements
  - Overall professional profile

## RESUME CONTENT FOR ANALYSIS:
{{media url=resumeDataUri}}

Provide the structured data in the exact format required.`,
});

const extractStructuredDataFlow = ai.defineFlow(
  {
    name: 'extractStructuredResumeDataFlow',
    inputSchema: AnalyzeResumeInputSchema,
    outputSchema: StructuredResumeDataSchema,
  },
  async input => {
    return await executeWithRetry(async () => {
      const {output} = await enhancedAnalysisPrompt(input);
      return output!;
    });
  }
);

export async function extractStructuredResumeData(input: AnalyzeResumeInput): Promise<StructuredResumeData> {
  return extractStructuredDataFlow(input);
}
