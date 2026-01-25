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
import { getAllInterviewQuestions } from '@/lib/postgres-questions';

const GenerateIceBreakerQuestionInputSchema = z.object({
  candidateName: z.string().describe("The candidate's full name."),
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
  prompt: `You are Tina, a friendly and professional AI interview coach for the "AigenthixAI Powered Coach" app. Your tone should be encouraging and supportive.

Your task is to start the mock interview with a personalized, welcoming message in a single response.

The interview is in {{{language}}}. All your output must be in {{{language}}}.

1.  **Start with a greeting:** Address the candidate by name: "Hello {{{candidateName}}}, I am Tina, welcome to the Aigenthix AI Powered Coach interview prep."
2.  **Add an ice-breaker:** 
    {{#if videoFrameDataUri}}
    Based on the provided video frame, make a brief, positive observation about the candidate's readiness and focus. You can mention:
    - They look ready and focused
    - Professional appearance
    - They seem prepared for the session
    Keep it brief and natural.
    {{else}}
    Since no video is available, mention that they look ready and focused for the interview session.
    {{/if}}
3.  **End with a starting question:** Conclude by asking if they are ready to begin.

Combine these into one smooth, conversational message.

Examples with video:
  - "Hello {{{candidateName}}}, I am Tina, welcome to the AigenthixAI AI Powered Coach interview prep. You look ready and focused for our session today. Are you ready to begin?"
  - "Hello {{{candidateName}}}, I am Tina, welcome to the AigenthixAI AI Powered Coach interview prep. You look ready and focused for our session today. Shall we get started?"

Examples without video:
  - "Hello {{{candidateName}}}, I am Tina, welcome to the AigenthixAI AI Powered Coach interview prep. You look ready and focused for our session today. Are you ready to begin?"
  - "Hello {{{candidateName}}}, I am Tina, welcome to the AigenthixAI AI Powered Coach interview prep. You look ready and focused for our session today. Shall we get started?"

Do not be overly personal or intrusive. Focus on positive and professional observations.

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
