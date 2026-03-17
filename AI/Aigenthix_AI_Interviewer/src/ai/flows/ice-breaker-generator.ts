'use server';
/**
 * @fileOverview Generates an ice-breaker question for an interview based on a video frame.
 *
 * - generateIceBreakerQuestion - A function that generates an ice-breaker question.
 * - GenerateIceBreakerQuestionInput - The input type for the generateIceBreakerQuestion function.
 * - GenerateIceBreakerQuestionOutput - The return type for the generateIceBreakerQuestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateIceBreakerQuestionInputSchema = z.object({
  candidateName: z.string().describe("The candidate's full name."),
  company: z.string().optional().describe("The company name for the interview."),
  jobRole: z.string().optional().describe("The job role the candidate is interviewing for."),
  videoFrameDataUri: z.string().optional().describe(
    "A single video frame captured at the start of the interview, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'. If not provided, no video analysis will be performed."
  ),
  language: z.string().describe('The language for the question.'),
});
export type GenerateIceBreakerQuestionInput = z.infer<typeof GenerateIceBreakerQuestionInputSchema>;

const GenerateIceBreakerQuestionOutputSchema = z.object({
  question: z.string().describe('A single, friendly, and formal ice-breaker question.'),
});
export type GenerateIceBreakerQuestionOutput = z.infer<typeof GenerateIceBreakerQuestionOutputSchema>;

export async function generateIceBreakerQuestion(input: GenerateIceBreakerQuestionInput): Promise<GenerateIceBreakerQuestionOutput> {
  return generateIceBreakerQuestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateIceBreakerQuestionPrompt',
  input: {schema: GenerateIceBreakerQuestionInputSchema},
  output: {schema: GenerateIceBreakerQuestionOutputSchema},
  prompt: `You are a professional AI interviewer. Your tone should be concise, warm, and on-point.

Your task is to start the interview with a single, polished greeting followed by one clear question.

The interview is in {{{language}}}. All your output must be in {{{language}}}.

Requirements:
1. **Greeting**: Address the candidate by name and include the company and role if provided:
   "Hello {{{candidateName}}}, welcome to your interview at {{{company}}} for the {{{jobRole}}} position."
2. **Question**: End with a single question that invites them to introduce themselves and their relevant experience.
3. **No filler**: Do NOT add compliments, observations, or mention the app or your name. Keep it professional and focused.
4. **Single message**: Output one message that combines the greeting and the question.

Example:
"Hello {{{candidateName}}}, welcome to your interview at {{{company}}} for the {{{jobRole}}} position. Let's begin with knowing you first — could you tell me about yourself and your experience relevant to this role?"

{{#if videoFrameDataUri}}
Candidate's video frame:
{{media url=videoFrameDataUri}}
{{/if}}
`,
});

const generateIceBreakerQuestionFlow = ai.defineFlow(
  {
    name: 'generateIceBreakerQuestionFlow',
    inputSchema: GenerateIceBreakerQuestionInputSchema,
    outputSchema: GenerateIceBreakerQuestionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
