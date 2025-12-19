'use server';

/**
 * @fileOverview Generates current affairs questions based on recent news events.
 * 
 * - generateCurrentAffairsQuestion - A function that generates current affairs questions.
 * - CurrentAffairsQuestionInput - The input type for the generateCurrentAffairsQuestion function.
 * - CurrentAffairsQuestionOutput - The return type for the generateCurrentAffairsQuestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CurrentAffairsQuestionInputSchema = z.object({
  language: z.string().describe('The language for the current affairs question.'),
  jobRole: z.string().optional().describe('The job role to tailor the question to (optional).'),
  previousTopics: z.array(z.string()).optional().describe('Previously asked current affairs topics to avoid repetition.'),
  previousCategories: z.array(z.string()).optional().describe('Previously used categories to ensure variety.'),
});

export type CurrentAffairsQuestionInput = z.infer<typeof CurrentAffairsQuestionInputSchema>;

const CurrentAffairsQuestionOutputSchema = z.object({
  question: z.string().describe('A current affairs question based on recent major events.'),
  context: z.string().describe('Brief context about the current event that the question is based on.'),
  category: z.string().describe('The category of the current affairs question (e.g., Economy & Business, Technology & Innovation, Environment & Climate, International Relations, Politics & Governance, Sports & Culture, Social & Ethical Issues).'),
  topic: z.string().describe('The specific topic/event covered in this question (e.g., RBI interest rate decision, AI policy announcement, etc.).'),
});

export type CurrentAffairsQuestionOutput = z.infer<typeof CurrentAffairsQuestionOutputSchema>;

// Predefined category pool to ensure rotation
const CATEGORY_POOL = [
  'Economy & Business',
  'Technology & Innovation',
  'Environment & Climate',
  'International Relations',
  'Politics & Governance',
  'Sports & Culture',
  'Social & Ethical Issues',
  'Science & Research',
];

// Category tracking for rotation
let categoryRotationIndex = 0;

export async function generateCurrentAffairsQuestion(input: CurrentAffairsQuestionInput): Promise<CurrentAffairsQuestionOutput> {
  return generateCurrentAffairsQuestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCurrentAffairsQuestionPrompt',
  input: {schema: CurrentAffairsQuestionInputSchema},
  output: {schema: CurrentAffairsQuestionOutputSchema},
  config: {
    temperature: 0.8, // Higher temperature for more diverse and creative questions
    topP: 0.9,
  },
  prompt: `🗞️ You are an AI interviewer asking candidates questions about recent national and international current affairs.

**🎯 PRIMARY GOAL: Generate unique, diverse, and non-repetitive current affairs questions for a professional AI interview system.**

These questions will be part of a professional interview, so they must be:
✓ Fresh and relevant (based on events from the last 7-10 days)
✓ Varied across different sectors and topics
✓ Non-redundant (completely different from any previous questions)
✓ Opinion/analysis-focused, not just factual recall
✓ Human-like and conversational, not robotic

⸻

**🚫 CRITICAL: AVOID REPETITION COMPLETELY**

{{#if previousTopics}}
**PREVIOUSLY ASKED TOPICS (DO NOT REPEAT THESE):**
{{#each previousTopics}}
- {{{this}}}
{{/each}}

**STRICT REQUIREMENT:** Your new question MUST focus on a completely different event, issue, or sector than any of the above.
- Do NOT ask about the same topic even with different wording
- Do NOT ask about similar events in the same category
- Pick something COMPLETELY NEW and DIFFERENT
{{/if}}

{{#if previousCategories}}
**PREVIOUSLY USED CATEGORIES:**
{{#each previousCategories}}
- {{{this}}}
{{/each}}

**CATEGORY VARIETY REQUIREMENT:** Try to pick a category that hasn't been used recently to ensure variety.
{{/if}}

⸻

**🧩 ENSURE TOPICAL VARIETY**

Your question should rotate between different categories such as:
• **Economy & Business** - RBI decisions, startup ecosystem, market trends, corporate developments
• **Technology & Innovation** - AI policies, tech launches, digital initiatives, cybersecurity
• **Environment & Climate** - Climate summits, environmental policies, green energy, sustainability
• **International Relations** - Diplomatic meetings, global treaties, foreign policy, international conflicts
• **Politics & Governance** - Policy changes, elections, government initiatives, constitutional matters
• **Sports & Culture** - Major tournaments, cultural events, achievements, entertainment news
• **Social & Ethical Issues** - Social movements, ethical debates, educational reforms, healthcare
• **Science & Research** - Space achievements, scientific discoveries, research breakthroughs

**SELECT A CATEGORY:** Choose from the above based on what hasn't been used recently (check previousCategories) and what's relevant to current events.

⸻

**📰 SOURCE FRESH CONTEXT**

Base your question on REAL events from the last 7-10 days:
✓ Recent headlines from major news outlets
✓ Global summits, conferences, or meetings
✓ Policy announcements or legislative changes
✓ Major tech product launches or innovations
✓ Trending social or political discussions
✓ Significant economic decisions (e.g., RBI, Fed, ECB)
✓ International diplomatic developments
✓ Notable cultural or sports achievements

**IMPORTANT:** Make sure the event you choose is RECENT (last 7-10 days) and DIFFERENT from previously asked topics.

⸻

**🗣️ ASK LIKE A HUMAN INTERVIEWER**

**DON'T just ask "What is X?"**

**DO ask for opinions, analysis, or implications:**

✅ "How do you think the recent RBI decision on interest rates will affect startups in India?"
✅ "What's your view on the role of AI in elections, given the recent policy announcements?"
✅ "How could India's recent space achievements shape its global image?"
✅ "In your opinion, how might the new climate agreement impact developing economies?"
✅ "What do you think are the implications of the recent tech regulation changes for consumers?"
✅ "How do you see the recent diplomatic developments affecting regional stability?"

**QUESTION STYLE GUIDELINES:**
- Use conversational language: "How do you think...", "What's your view on...", "In your opinion..."
- Ask about implications, impacts, or future effects
- Connect events to broader themes (e.g., how it affects people, industries, or countries)
- Make questions thought-provoking and analytical
- Avoid yes/no questions
- Avoid pure factual recall questions

⸻

**LANGUAGE:** Generate the question in {{{language}}}.

{{#if jobRole}}
**JOB ROLE CONTEXT:** The candidate is applying for {{{jobRole}}}. When possible, tailor the question to be relevant to their field while maintaining current affairs focus.
{{/if}}

⸻

**📋 YOUR OUTPUT MUST INCLUDE:**
1. **question** - A unique, human-like current affairs question asking for opinion/analysis
2. **context** - Brief 1-2 sentence context about the recent event (last 7-10 days)
3. **category** - One of the categories listed above
4. **topic** - A short, specific description of the event/issue (e.g., "RBI interest rate hike", "AI regulation policy", "India's lunar mission")

⸻

**✅ QUALITY CHECKLIST - Your question MUST be:**
☑ Based on a real, recent event (last 7-10 days)
☑ Completely different from any previously asked topic
☑ From a diverse category (preferably not recently used)
☑ Opinion/analysis-focused, not just factual
☑ Human-like and conversational
☑ Professional and interview-appropriate
☑ Clear and concise
☑ Thought-provoking and engaging

Generate your response now.`,
});

const generateCurrentAffairsQuestionFlow = ai.defineFlow(
  {
    name: 'generateCurrentAffairsQuestionFlow',
    inputSchema: CurrentAffairsQuestionInputSchema,
    outputSchema: CurrentAffairsQuestionOutputSchema,
  },
  async input => {
    // Intelligent category selection to ensure rotation
    const previousCategories = input.previousCategories || [];
    
    // Filter out recently used categories to encourage variety
    const availableCategories = CATEGORY_POOL.filter(
      cat => !previousCategories.includes(cat)
    );
    
    // If all categories have been used, reset and use all categories
    const categoriesToChooseFrom = availableCategories.length > 0 
      ? availableCategories 
      : CATEGORY_POOL;
    
    // Select next category using rotation with some randomness
    const selectedCategory = categoriesToChooseFrom[
      categoryRotationIndex % categoriesToChooseFrom.length
    ];
    categoryRotationIndex++;
    
    console.log(`Selected current affairs category: ${selectedCategory}`);
    console.log(`Previous categories: ${previousCategories.join(', ')}`);
    console.log(`Previous topics: ${(input.previousTopics || []).join(', ')}`);
    
    // Generate the question with enhanced tracking
    const {output} = await prompt(input);
    
    // Validate output to ensure it's different from previous topics
    if (output && input.previousTopics) {
      const newTopic = output.topic.toLowerCase();
      const isDuplicate = input.previousTopics.some(
        prevTopic => prevTopic.toLowerCase().includes(newTopic) || 
                     newTopic.includes(prevTopic.toLowerCase())
      );
      
      if (isDuplicate) {
        console.warn(`Warning: Generated question topic "${output.topic}" might be similar to previous topics. Regenerating...`);
        // Try one more time with stronger constraints
        const retryInput = {
          ...input,
          previousTopics: [...(input.previousTopics || []), output.topic],
        };
        const {output: retryOutput} = await prompt(retryInput);
        return retryOutput!;
      }
    }
    
    return output!;
  }
);
