'use server';

/**
 * @fileOverview Generates interview questions based on a job role, company, and resume.
 *
 * - generateRoleSpecificQuestions - A function that generates interview questions.
 * - GenerateRoleSpecificQuestionsInput - The input type for the generateRoleSpecificQuestions function.
 * - GenerateRoleSpecificQuestionsOutput - The return type for the generateRoleSpecificQuestions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { getAllInterviewQuestions, searchQuestionsByKeywords } from '@/lib/postgres-questions';
import { getCATQuestionInsights, getSampleCATQuestions } from '@/lib/postgres-questions';
import { getExamConfigByExamAndSubcategory } from '@/lib/postgres-data-store';

const GenerateRoleSpecificQuestionsInputSchema = z.object({
  resumeText: z.string().describe("The text content of the user's resume."),
  jobRole: z.string().describe('The job role for which the interview questions are being generated.'),
  company: z.string().describe('The company for which the interview questions are being generated.'),
  college: z.string().optional().describe('The target college for which the interview questions are being generated (for CAT aspirants).'),
  language: z.string().describe('The language for the interview questions.'),
  // Exam and subcategory filtering
  examId: z.number().optional().describe('The exam ID for filtering questions.'),
  subcategoryId: z.number().optional().describe('The subcategory ID for filtering questions.'),
  subcategoryName: z.string().optional().describe('The subcategory name (e.g., "HR", "CAT") for better HR interview detection.'),
});
export type GenerateRoleSpecificQuestionsInput = z.infer<typeof GenerateRoleSpecificQuestionsInputSchema>;

const GenerateRoleSpecificQuestionsOutputSchema = z.object({
  questions: z.array(z.string()).describe('An array of interview questions tailored to the job role, company, and resume.'),
  referenceQuestionIds: z.array(z.number()).optional().describe('IDs of questions from the database used as reference for generating these questions'),
});
export type GenerateRoleSpecificQuestionsOutput = z.infer<typeof GenerateRoleSpecificQuestionsOutputSchema>;

export async function generateRoleSpecificQuestions(input: GenerateRoleSpecificQuestionsInput): Promise<GenerateRoleSpecificQuestionsOutput> {
  return generateRoleSpecificQuestionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateRoleSpecificQuestionsPrompt',
  input: {schema: GenerateRoleSpecificQuestionsInputSchema},
  output: {schema: GenerateRoleSpecificQuestionsOutputSchema},
  prompt: `You are an expert interview question generator.

You will generate a set of interview questions tailored to the job role, company, and resume provided.
The questions should be in the following language: {{{language}}}.

{{#if college}}
IMPORTANT: The candidate is targeting {{{college}}}. Generate questions that are specifically relevant to this college's admission process, interview style, and requirements. Include questions about:
- Why they chose this specific college
- Their knowledge about the college's programs and culture
- How they align with the college's values and expectations
- Specific aspects of the college's admission criteria

CAT Interview Insights:
{{{catInsights}}}

GUIDELINES FOR CAT QUESTIONS:
- Use the insights above to understand typical question patterns for this college
- Generate NEW questions inspired by these patterns, NOT direct copies
- Match the difficulty level and question types typically used
- Focus on the candidate's academic background and experience
- Ensure questions are relevant to the specific college's interview style
{{/if}}

**HR INTERVIEW MODE DETECTION:**
- **CRITICAL:** This is an HR interview if ANY of the following conditions are true:
  - jobRole is 'HR' (case-insensitive), OR
  - jobRole is 'interview' (case-insensitive) AND company is 'HR' (case-insensitive), OR
  - jobRole is 'interview' (case-insensitive) AND subcategoryName is 'HR' (case-insensitive)
- **HR INTERVIEW RESTRICTIONS:** When generating questions for an HR interview, you MUST:
  - **ONLY generate HR-based questions** - no technical, aptitude, or academic questions
  - **DO NOT generate technical questions** - no coding, programming, domain-specific technical knowledge, or subject-matter expertise questions
  - **DO NOT generate aptitude questions** - no mathematical problems, logical puzzles, or analytical reasoning questions
  - **DO NOT generate academic/subject questions** - no questions about specific subjects, courses, or academic knowledge
  - **MANDATORY QUESTION DISTRIBUTION FOR HR INTERVIEWS:**
    * **CRITICAL:** When resume data is available, you MUST generate exactly this distribution (for a 10-question interview):
      - **1 RESUME-BASED HR QUESTION (EXACTLY ONE):** A question about the candidate's work experience, career journey, or background from an HR perspective. Examples:
        * "Tell me about your experience at [Company]"
        * "What did you learn from [Role]?"
        * "Walk me through your career journey"
        * "What achievement are you most proud of?"
        * "How did [Experience] shape you professionally?"
      - **1 TECHNICAL RESUME QUESTION (EXACTLY ONE):** A technical question based on the candidate's resume, asking them to explain technical concepts, approaches, or methods from their projects/experience. Examples:
        * "Explain the technical approach you used in your [Project Name] project"
        * "How did you implement [Technical Skill] in your work at [Company]?"
        * "What technical challenges did you face in [Project] and how did you solve them?"
        * "Can you explain the technical methodology behind [Resume Project/Skill]?"
      - **8 GENERAL HR QUESTIONS (EXACTLY EIGHT):** These are HR questions that apply to all candidates, with a mix of:
        * **Standard general HR questions** (4-5 questions): Standardized questions that apply to ALL candidates regardless of experience level. Examples:
          - "What are your strengths and weaknesses?"
          - "How do you work under pressure?"
          - "Where do you see yourself in 5 years?"
          - "How do you handle conflicts in the workplace?"
          - "What motivates you professionally?"
          - "Describe your ideal work environment."
          - "How do you adapt to change?"
          - "Tell me about a time you had to work with a difficult team member."
          - "What values are most important to you in a workplace?"
          - "How do you prioritize tasks when you have multiple deadlines?"
        * **Experience-tailored general HR questions** (3-4 questions): General HR questions that are tailored to the candidate's experience level (fresher vs experienced) but still apply broadly. Examples:
          - For freshers: "How do you plan to transition from academic life to professional life?", "What do you expect from your first job?"
          - For experienced: "How do you mentor junior team members?", "What leadership lessons have you learned from your experience?"
          - "How has your [experience level/background] shaped your approach to [work situation]?"
    * **WHY THIS DISTRIBUTION IS CRITICAL:** This ensures uniform evaluation across all candidates through standardized general HR questions (80% of questions), while still allowing minimal personalization through 1 resume-based question and 1 technical resume question (20% of questions). This prevents the interview from becoming too variable or technical-focused.
  - **ONLY generate HR-appropriate questions** such as:
    * Behavioral questions: "Tell me about a time when...", "Describe a situation where...", "How do you handle...?"
    * Personality assessment: "What are your strengths and weaknesses?", "How do you work under pressure?", "What motivates you?"
    * Teamwork and collaboration: "Tell me about a time you worked in a team", "How do you handle conflicts?", "Describe your leadership style"
    * Communication skills: "How do you communicate with difficult stakeholders?", "Tell me about a time you had to explain something complex"
    * Problem-solving (from HR perspective): "How do you approach problems?", "Tell me about a challenging situation you faced"
    * Career goals and motivation: "Where do you see yourself in 5 years?", "Why are you interested in this role?", "What are your career aspirations?"
    * Cultural fit: "What kind of work environment do you prefer?", "How do you adapt to change?", "What values are important to you?"
  - **Maintain HR interviewer perspective:** Generate questions the way an HR professional would - focusing on soft skills, cultural fit, behavioral patterns, and interpersonal abilities
  - **Throughout all generated questions:** Every single question must be HR-focused. Do not deviate to technical, academic, or aptitude questions at any point.

Use the following reference questions as examples for style and content, but create new questions that are tailored to the candidate's profile:

Reference Questions:
{{{referenceQuestions}}}

Job Role: {{{jobRole}}}
Company: {{{company}}}
{{#if college}}Target College: {{{college}}}{{/if}}
{{#if hasResumeData}}
Resume:
{{{resumeText}}}
{{else}}
**NO RESUME DATA AVAILABLE:** This interview is being conducted without resume data. Focus exclusively on exam/subcategory-specific questions, subject knowledge, and academic/domain questions. DO NOT generate resume-based questions or questions about work experience.
{{/if}}

**FINAL REMINDER:**
- If this is an HR interview (jobRole is 'HR' OR (jobRole is 'interview' AND (company is 'HR' OR subcategoryName is 'HR'))), ONLY generate HR-based questions. DO NOT generate any technical, aptitude, or academic questions.
- All questions must be appropriate for an HR interviewer to ask, focusing on behavioral patterns, soft skills, cultural fit, and interpersonal abilities.
- **CRITICAL FOR HR INTERVIEWS WITH RESUME DATA:** You MUST generate exactly 1 resume-based HR question, 1 technical resume question, and 8 general HR questions (mix of standard and experience-tailored). This strict distribution ensures uniform evaluation parameters (80% general HR questions) while allowing minimal personalization (20% resume-based questions).
- If resume data is available, generate exactly: 1 resume-based HR question, 1 technical resume question, and 8 general HR questions.
- If resume data is NOT available, generate only general HR questions (standard and experience-tailored based on any available context).

Generate a list of relevant interview questions in {{{language}}}:
`,
});

const generateRoleSpecificQuestionsFlow = ai.defineFlow(
  {
    name: 'generateRoleSpecificQuestionsFlow',
    inputSchema: GenerateRoleSpecificQuestionsInputSchema,
    outputSchema: GenerateRoleSpecificQuestionsOutputSchema,
  },
  async input => {
    // Check if this is a CAT aspirant with college selection
    const isCATAspirant = (input.jobRole.toLowerCase().includes('cat') || input.jobRole.toLowerCase().includes('mba')) && input.college;
    let catInsights = '';
    
    console.log(`Job Role: ${input.jobRole}, College: ${input.college}, Is CAT Aspirant: ${isCATAspirant}`);
    
    if (isCATAspirant) {
      try {
        // Get CAT-specific insights for the college with background detection
        catInsights = await getCATQuestionInsights(input.college!, undefined, input.resumeText);
        console.log(`Generated CAT insights for ${input.college}`);
      } catch (error) {
        console.error('Failed to get CAT insights:', error);
        catInsights = 'CAT interview insights not available.';
      }
    }
    
    // Use exam and subcategory information for filtering questions
    const examId = input.examId;
    const subcategoryId = input.subcategoryId;
    
    console.log(`Question Generator: Using exam configuration - Exam ID: ${examId}, Subcategory ID: ${subcategoryId}`);
    
    // Determine if resume data is available
    const hasResumeData = input.resumeText && input.resumeText.trim().length > 50;
    
    // Get reference questions based on keywords from the job role and resume
    const keywords = [
      input.jobRole,
      input.company,
      ...(hasResumeData ? input.resumeText.split(' ').filter(word => word.length > 4) : [])
    ];
    
    // Get a sample of reference questions
    let referenceQuestions;
    let referenceQuestionIds: number[] = []; // Track question IDs from database
    
    if (isCATAspirant) {
      // For CAT aspirants, try to get CAT-specific sample questions first
      try {
        // Detect background for more targeted questions
        const detectedBackground = input.resumeText ? await (await import('@/ai/cat-question-reference')).detectAcademicBackground(input.resumeText) : undefined;
        const catSampleQuestions = await getSampleCATQuestions(input.college!, detectedBackground, 3);
        if (catSampleQuestions.length > 0) {
          referenceQuestionIds = catSampleQuestions.map(q => q.id); // Capture IDs
          referenceQuestions = catSampleQuestions
            .map(q => `[${q.subsection}] ${q.question}`)
            .join('\n');
          console.log(`Using ${catSampleQuestions.length} focused CAT sample questions (IDs: ${referenceQuestionIds.join(', ')})`);
        } else {
          throw new Error('No CAT questions found');
        }
      } catch (error) {
        console.error('Failed to get CAT sample questions:', error);
        // Fall back to general questions
        const questions = await getAllInterviewQuestions();
        const selectedQuestions = questions.slice(0, 3);
        referenceQuestionIds = selectedQuestions.map(q => q.id); // Capture IDs
        referenceQuestions = selectedQuestions
          .map(q => q.question)
          .join('\n');
      }
    } else {
      // Use existing logic for non-CAT questions
      console.log('Using non-CAT logic, keywords:', keywords);
      if (keywords.length > 0) {
        // Try to get relevant questions based on keywords
        console.log('Attempting keyword search...');
        const relevantQuestions = await searchQuestionsByKeywords(keywords, examId, subcategoryId);
        console.log(`Found ${relevantQuestions.length} relevant questions`);
        if (relevantQuestions.length > 0) {
          // If we found relevant questions, use up to 3 of them
          const selectedQuestions = relevantQuestions.slice(0, 3);
          referenceQuestionIds = selectedQuestions.map(q => q.id); // Capture IDs
          referenceQuestions = selectedQuestions
            .map(q => q.question)
            .join('\n');
        } else {
          // If no relevant questions found, fall back to random sample
          console.log('No relevant questions found, falling back to random sample');
          const allQuestions = await getAllInterviewQuestions();
          // Simple shuffle algorithm
          for (let i = allQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
          }
          const selectedQuestions = allQuestions.slice(0, 3);
          referenceQuestionIds = selectedQuestions.map(q => q.id); // Capture IDs
          referenceQuestions = selectedQuestions
            .map(q => q.question)
            .join('\n');
        }
      } else {
        // If no keywords, use first 3 questions
        console.log('No keywords, using first 3 questions');
        const questions = await getAllInterviewQuestions();
        const selectedQuestions = questions.slice(0, 3);
        referenceQuestionIds = selectedQuestions.map(q => q.id); // Capture IDs
        referenceQuestions = selectedQuestions
          .map(q => q.question)
          .join('\n');
      }
    }
    
    const promptInput = {
      ...input,
      hasResumeData,
      referenceQuestions,
      catInsights,
      subcategoryName: input.subcategoryName || ''
    };
    
    const {output} = await prompt(promptInput);
    
    // Add reference question IDs to output
    if (output && referenceQuestionIds.length > 0) {
      output.referenceQuestionIds = referenceQuestionIds;
      console.log(`Reference question IDs added to output: ${referenceQuestionIds.join(', ')}`);
    }
    
    return output!;
  }
);
