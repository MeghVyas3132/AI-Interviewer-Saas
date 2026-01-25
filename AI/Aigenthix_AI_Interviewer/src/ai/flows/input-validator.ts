'use server';
/**
 * @fileOverview A flow to validate user input against safety policies.
 *
 * - validateInput - A function that checks if the input is appropriate.
 * - ValidateInputSchema - The input type for the validateInput function.
 * - ValidateOutputSchema - The return type for the validateInput function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ValidateInputSchema = z.object({
  text: z.string().describe('The text to validate.'),
});
export type ValidateInput = z.infer<typeof ValidateInputSchema>;

const ValidateOutputSchema = z.object({
  isValid: z.boolean().describe('Whether the input is valid and appropriate.'),
  reason: z.string().optional().describe("The reason why the input is not valid. Do not repeat the user's input in the reason."),
});
export type ValidateOutput = z.infer<typeof ValidateOutputSchema>;

export async function validateInput(input: ValidateInput): Promise<ValidateOutput> {
  return validateInputFlow(input);
}

const prompt = ai.definePrompt({
    name: 'validateInputPrompt',
    input: {schema: ValidateInputSchema},
    output: {schema: ValidateOutputSchema},
    prompt: `You are a content moderator for a professional career application.
Your task is to determine if the provided text is a plausible 'job role', 'exam aspirant', or 'company name'.
The text must be a realistic job title, exam aspirant role (such as "NEET Aspirant", "JEE Aspirant", "UPSC Aspirant", etc.), or company name. It should not be gibberish, random characters, or nonsensical.
The text must also be professional and not contain any profanity, hate speech, harassment, dangerous, or sexually explicit content.

If the text is a plausible and appropriate job role, exam aspirant role, or company name, set 'isValid' to true.
If the text is not plausible (e.g., "gvsjhvdf", "asdfasdf") or is inappropriate, set 'isValid' to false and provide a brief, user-friendly 'reason'.
- For nonsensical input, a good reason is "Please enter a valid job role/company name."
- For inappropriate input, a good reason is "This input contains inappropriate language."
Do not repeat the user's input in the reason.

Text to validate:
---
{{{text}}}
---
`,
});


const validateInputFlow = ai.defineFlow(
  {
    name: 'validateInputFlow',
    inputSchema: ValidateInputSchema,
    outputSchema: ValidateOutputSchema,
  },
  async (input) => {
    // Basic check for empty or very short strings
    if (!input.text || input.text.trim().length < 2) {
        return { isValid: false, reason: 'Input is too short.' };
    }

    try {
        const {output} = await prompt(input);
        return output!;
    } catch (error) {
      console.error('Input validation error:', error);
      // Treat errors during validation as a failure to validate, for safety.
      return { isValid: false, reason: 'Could not validate input.' };
    }
  }
);
