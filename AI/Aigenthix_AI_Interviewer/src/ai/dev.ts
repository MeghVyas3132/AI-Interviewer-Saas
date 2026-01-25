import { config } from 'dotenv';
config();

import '@/ai/flows/interview-agent.ts';
import '@/ai/flows/resume-analyzer.ts';
import '@/ai/flows/interview-question-generator.ts';
import '@/ai/flows/ice-breaker-generator.ts';
import '@/ai/flows/input-validator.ts';
